"""Weekly report statistics, reminders and the weekly summary push."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.api.attendance_api import build_daily_summary, build_seminar_summary
from app.auth.dependencies import get_required_user
from app.database.crud.notification_crud import (
    NotificationCreate,
    notification as notification_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.weekly_report_crud import (
    weekly_report as weekly_report_crud,
)
from app.database.database import get_db
from app.feishu.renderer import render_weekly_summary
from app.helpers.feishu_jobs import feishu_jobs
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

weekly_report_router = APIRouter()


def _attendance_kwargs(db: Session, semester, week: int) -> dict:
    """Attendance sections for the summary, or None when nothing was synced."""
    daily = build_daily_summary(db, semester, week)
    seminar = build_seminar_summary(db, semester, week)
    has_daily = bool(daily["dates"])
    has_seminar = bool(seminar["expected"])
    return {
        "absent_names": daily["absent_names"] if has_daily else None,
        "late_names": daily["late_names"] if has_daily else None,
        "attended_names": seminar["attended"] if has_seminar else None,
        "not_attended_names": seminar["absent"] if has_seminar else None,
        "leave_names": (
            [row["member_name"] for row in seminar["leave"]] if has_seminar else None
        ),
    }


class PushRequest(BaseModel):
    receive_id: str
    receive_id_type: str = "open_id"


def _resolve_semester(db: Session, semester_id: Optional[str]):
    if semester_id:
        try:
            parsed_id = UUID(semester_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法"
            )
        db_semester = semester_crud.get(db, id=parsed_id)
    else:
        db_semester = semester_crud.get_current(db)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


@weekly_report_router.get("")
def weekly_report_stats(
    week: int,
    semester_id: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = _resolve_semester(db, semester_id)
    submitted, missing = weekly_report_crud.submitted_and_missing(
        db, semester_id=db_semester.id, week=week
    )
    return {
        "semester": db_semester.to_dict(),
        "week": week,
        "submitted": [row.to_dict() for row in submitted],
        "missing": [row.to_dict() for row in missing],
        "submitted_count": len(submitted),
        "missing_count": len(missing),
    }


@weekly_report_router.get("/summary")
def weekly_summary_preview(
    week: int,
    semester_id: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = _resolve_semester(db, semester_id)
    submitted, missing = weekly_report_crud.submitted_and_missing(
        db, semester_id=db_semester.id, week=week
    )
    payload = render_weekly_summary(
        semester=db_semester,
        week=week,
        submitted_names=[row.member_name for row in submitted],
        missing_names=[row.name for row in missing],
        **_attendance_kwargs(db, db_semester, week),
    )
    return {"payload": payload}


@weekly_report_router.post("/remind")
def remind_missing(
    week: int,
    semester_id: Optional[str] = None,
    message: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Send a direct message to everyone who has not submitted this week."""
    db_semester = _resolve_semester(db, semester_id)
    _, missing = weekly_report_crud.submitted_and_missing(
        db, semester_id=db_semester.id, week=week
    )
    if not missing:
        return {"sent": 0, "message": "本周所有人都已提交周报"}

    text = message or f"【周报提醒】{db_semester.name} 第{week}周周报还没有提交，请尽快填写。"
    submitted_tasks = []
    for row in missing:
        open_id = row.feishu_account
        if not open_id:
            logger.warning("Member %s has no Feishu account; skipping reminder", row.name)
            continue

        record = notification_crud.create(
            db,
            obj_in=NotificationCreate(
                template_key="weekly_reminder",
                target=open_id,
                payload={"week": week, "member_name": row.name, "text": text},
            ),
        )
        if not record:
            continue

        task_id = feishu_jobs.send_message(
            notification_id=record.id,
            receive_id=open_id,
            msg_type="text",
            title=None,
            content=text,
        )
        submitted_tasks.append({"member": row.name, "task_id": task_id})

    return {"sent": len(submitted_tasks), "tasks": submitted_tasks}


@weekly_report_router.post("/push")
def push_weekly_summary(
    week: int,
    payload: PushRequest,
    semester_id: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = _resolve_semester(db, semester_id)
    submitted, missing = weekly_report_crud.submitted_and_missing(
        db, semester_id=db_semester.id, week=week
    )
    message = render_weekly_summary(
        semester=db_semester,
        week=week,
        submitted_names=[row.member_name for row in submitted],
        missing_names=[row.name for row in missing],
        **_attendance_kwargs(db, db_semester, week),
    )

    record = notification_crud.create(
        db,
        obj_in=NotificationCreate(
            template_key="weekly_summary",
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
