"""Seminar management, preview rendering and push."""

from __future__ import annotations

import logging
from typing import List
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.notification_crud import (
    NotificationCreate,
    notification as notification_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.seminar_crud import (
    PresentationInput,
    SeminarUpdate,
    seminar as seminar_crud,
)
from app.database.database import get_db
from app.feishu.renderer import TemplateError, render_seminar_preview
from app.helpers.feishu_jobs import feishu_jobs
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

seminar_router = APIRouter()


class PresentationUpdateRequest(BaseModel):
    presentations: List[PresentationInput]


class PushPreviewRequest(BaseModel):
    receive_id: str
    receive_id_type: str = "open_id"


def _validated_time(value: Optional[str], label: str) -> Optional[str]:
    """Normalize a slot time to "HHMM"; None clears the override."""
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    if len(text) != 4 or not text.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{label}格式不正确，请填写四位 HHMM",
        )
    hours, minutes = int(text[:2]), int(text[2:])
    if hours > 23 or minutes > 59:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label}不是有效时间"
        )
    return text


def _load_seminar(db: Session, semester_id: str, week: int, happened: bool):
    try:
        parsed_id = UUID(semester_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")

    slots = seminar_crud.get_multi_by(
        db, semester_id=parsed_id, week=week, happened=happened, limit=10
    )
    if not slots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="未找到该周的组会安排"
        )
    return slots[0]


@seminar_router.get("")
def list_seminars(
    semester_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(semester_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")
    rows = seminar_crud.list_by_semester(db, semester_id=parsed_id)
    return {"seminars": [row.to_dict() | {"presentations": [p.to_dict() for p in row.presentations]} for row in rows]}


@seminar_router.patch("/{seminar_id}")
def update_seminar(
    seminar_id: str,
    payload: SeminarUpdate,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_seminar = seminar_crud.get(db, id=seminar_id)
    if not db_seminar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该组会")

    # An omitted time keeps the stored one, so a partial PATCH can still be
    # checked against the effective pair rather than against half of it.
    start = (
        _validated_time(payload.start_time, "开始时间")
        if "start_time" in payload.model_fields_set
        else db_seminar.start_time
    )
    end = (
        _validated_time(payload.end_time, "结束时间")
        if "end_time" in payload.model_fields_set
        else db_seminar.end_time
    )
    if start and end and start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="结束时间必须晚于开始时间"
        )

    changes = payload.model_dump(exclude_unset=True)
    changes["start_time"] = start
    changes["end_time"] = end
    updated = seminar_crud.update(db=db, db_obj=db_seminar, obj_in=changes)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="更新组会失败")
    return {"seminar": updated.to_dict()}


@seminar_router.put("/{seminar_id}/presentations")
def update_presentations(
    seminar_id: str,
    payload: PresentationUpdateRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_seminar = seminar_crud.get(db, id=seminar_id)
    if not db_seminar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该组会")

    tracks = [item.track for item in payload.presentations]
    if len(tracks) != len(set(tracks)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Track 序号不能重复"
        )
    for item in payload.presentations:
        if not item.presenter_name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="报告人姓名不能为空"
            )

    updated = seminar_crud.replace_presentations(
        db, seminar=db_seminar, presentations=payload.presentations
    )
    return {
        "seminar": updated.to_dict()
        | {"presentations": [p.to_dict() for p in updated.presentations]}
    }


@seminar_router.get("/{semester_id}/preview")
def preview_seminar(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_seminar = _load_seminar(db, semester_id, week, happened=False)
    db_semester = semester_crud.get(db, id=db_seminar.semester_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到所属学期")
    try:
        payload = render_seminar_preview(db_seminar, db_semester)
    except TemplateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return {"payload": payload}


@seminar_router.post("/{semester_id}/push")
def push_seminar_preview(
    semester_id: str,
    week: int,
    payload: PushPreviewRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_seminar = _load_seminar(db, semester_id, week, happened=False)
    db_semester = semester_crud.get(db, id=db_seminar.semester_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到所属学期")

    try:
        message = render_seminar_preview(db_seminar, db_semester)
    except TemplateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    record = notification_crud.create(
        db,
        obj_in=NotificationCreate(
            template_key="seminar_preview",
            target=payload.receive_id,
            payload=message,
        ),
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="创建推送记录失败"
        )

    task_id = feishu_jobs.send_message(
        notification_id=record.id,
        receive_id=payload.receive_id,
        msg_type="post",
        title=message["zh_cn"]["title"],
        content=message["zh_cn"]["content"],
        receive_id_type=payload.receive_id_type,
    )
    return {"notification_id": str(record.id), "task_id": task_id}
