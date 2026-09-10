"""Group-meeting scheduling (BILP): validate a request, solve it in the worker."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import schedule_entry as schedule_entry_crud
from app.database.crud.group_meeting_crud import (
    GroupMeetingPlanCreate,
    group_meeting_plan as group_meeting_plan_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.database import get_db
from app.helpers.feishu_jobs import feishu_jobs
from app.helpers.meeting_slots import (
    SlotError,
    expand_slots,
    build_busy_pairs,
    slot_definitions,
)
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

group_meeting_router = APIRouter()

DEFAULT_WEIGHTS = {"w2": 1, "w4": 5, "alpha": 2}


class PlanRequest(BaseModel):
    semester_id: str
    name_list: List[str]
    already_grouped: List[List[str]] = Field(default_factory=list)
    meeting_periods: List[str]
    weights: Optional[Dict[str, int]] = None


def _resolve_semester(db: Session, semester_id: str):
    try:
        parsed_id = UUID(semester_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")
    db_semester = semester_crud.get(db, id=parsed_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


def _validate_names(name_list: List[str]) -> List[str]:
    cleaned = [str(name).strip() for name in name_list if str(name).strip()]
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="参会名单不能为空"
        )
    if len(set(cleaned)) != len(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="参会名单中存在重复姓名"
        )
    return cleaned


def _validate_grouped(
    already_grouped: List[List[str]], name_list: List[str]
) -> List[List[str]]:
    known = set(name_list)
    seen: set[str] = set()
    cleaned: List[List[str]] = []
    for group in already_grouped:
        members = [str(name).strip() for name in group if str(name).strip()]
        if not members:
            continue
        if len(members) < 2 or len(members) > 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="预设分组的每组人数只能是 2 到 4 人",
            )
        for name in members:
            if name not in known:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"预设分组里的 {name} 不在参会名单中",
                )
            if name in seen:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{name} 出现在多个预设分组中",
                )
            seen.add(name)
        cleaned.append(members)
    return cleaned


def _serialize_plan(plan) -> Dict[str, Any]:
    return {
        "id": str(plan.id),
        "status": plan.status,
        "job_id": plan.job_id,
        "params": plan.params,
        "result": plan.result,
        "validation": plan.validation,
        "solver_status": plan.solver_status,
        "error": plan.error,
        "created_at": str(plan.created_at) if plan.created_at else None,
        "updated_at": str(plan.updated_at) if plan.updated_at else None,
    }


@group_meeting_router.get("/config")
def get_group_meeting_config(
    current_user: CurrentUser = Depends(get_required_user),
):
    return {
        "periods": slot_definitions(),
        "weights": DEFAULT_WEIGHTS,
    }


@group_meeting_router.post("/plans")
def create_group_meeting_plan(
    payload: PlanRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    semester = _resolve_semester(db, payload.semester_id)
    name_list = _validate_names(payload.name_list)
    already_grouped = _validate_grouped(payload.already_grouped, name_list)

    if not payload.meeting_periods:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="请至少选择一个会议时段"
        )
    try:
        slots = expand_slots(payload.meeting_periods)
    except SlotError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        )

    schedule = schedule_entry_crud.list_by_semester(db, semester_id=semester.id)
    busy_pairs = build_busy_pairs(name_list, slots, schedule)

    params = {
        "name_list": name_list,
        "already_grouped": already_grouped,
        "meeting_periods": [str(period) for period in payload.meeting_periods],
        "weights": payload.weights or DEFAULT_WEIGHTS,
        "slots": slots,
        "busy_count": len(busy_pairs),
    }

    plan = group_meeting_plan_crud.create(
        db,
        obj_in=GroupMeetingPlanCreate(
            semester_id=semester.id,
            params=params,
        ),
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="创建排班任务失败"
        )

    job_id = feishu_jobs.solve_group_meeting(
        plan_id=plan.id,
        name_list=name_list,
        slots=slots,
        busy_pairs=[list(pair) for pair in busy_pairs],
        already_grouped=already_grouped,
        weights=payload.weights or DEFAULT_WEIGHTS,
    )
    group_meeting_plan_crud.mark_solving(db, plan=plan, job_id=job_id)
    return {"plan_id": str(plan.id), "job_id": job_id, "status": "solving"}


@group_meeting_router.get("/plans")
def list_group_meeting_plans(
    limit: int = 20,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = group_meeting_plan_crud.list_recent(db, limit=min(limit, 100))
    return {"plans": [_serialize_plan(row) for row in rows]}


@group_meeting_router.get("/plans/{plan_id}")
def get_group_meeting_plan(
    plan_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="排班任务 ID 不合法")
    plan = group_meeting_plan_crud.get(db, id=parsed_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该排班任务")
    return {"plan": _serialize_plan(plan)}
