"""Receive task results from the jobs worker.

The server owns the database schema, so the worker never writes rows directly:
it POSTs the parsed records here, and this module upserts them inside an
advisory lock keyed on the sync run so a retried webhook cannot double-apply.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from uuid import UUID

from app.database.crud.member_crud import MemberCreate, member as member_crud
from app.database.crud.notification_crud import notification as notification_crud
from app.database.crud.seminar_crud import (
    PresentationInput,
    SeminarCreate,
    seminar as seminar_crud,
)
from app.database.crud.sync_crud import TERMINAL_STATUSES, sync_run as sync_run_crud
from app.database.crud.weekly_report_crud import (
    WeeklyReportCreate,
    weekly_report as weekly_report_crud,
)
from app.database.database import get_db
from app.database.database import engine as db_engine
from app.helpers.advisory_locks import AdvisoryLockNamespace, advisory_lock
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

webhook_router = APIRouter()


class SyncResultRequest(BaseModel):
    status: str
    kind: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class NotificationResultRequest(BaseModel):
    status: str
    error: Optional[str] = None
    response: Optional[Dict[str, Any]] = None


def _apply_members(db: Session, members: list[Dict[str, Any]]) -> int:
    applied = 0
    for row in members:
        account = row.get("feishu_account")
        if not account:
            continue
        existing = member_crud.get_by_feishu_account(db, feishu_account=account)
        if existing:
            member_crud.update(db, db_obj=existing, obj_in=row)
        else:
            member_crud.create(db, obj_in=MemberCreate(**row))
        applied += 1
    return applied


def _apply_seminars(db: Session, semester_id: UUID, seminars: list[Dict[str, Any]]) -> int:
    applied = 0
    for item in seminars:
        existing = seminar_crud.get_slot(
            db,
            semester_id=semester_id,
            week=item["week"],
            weekday=item["weekday"],
            happened=item["happened"],
        )
        if existing:
            seminar_crud.update(
                db, db_obj=existing, obj_in={"room": item.get("room") or None}
            )
            target = existing
        else:
            target = seminar_crud.create(
                db,
                obj_in=SeminarCreate(
                    semester_id=semester_id,
                    week=item["week"],
                    weekday=item["weekday"],
                    happened=item["happened"],
                    room=item.get("room") or None,
                ),
            )
        if not target:
            continue
        presentations = [
            PresentationInput(**presentation) for presentation in item["presentations"]
        ]
        seminar_crud.replace_presentations(
            db, seminar=target, presentations=presentations
        )
        applied += 1
    return applied


def _apply_weekly_reports(
    db: Session, semester_id: UUID, week: int, reports: list[Dict[str, Any]]
) -> int:
    applied = 0
    for item in reports:
        existing = weekly_report_crud.get_by(
            db, semester_id=semester_id, week=week, member_name=item["member_name"]
        )
        payload = WeeklyReportCreate(
            semester_id=semester_id,
            week=week,
            member_name=item["member_name"],
            doc_link=item.get("doc_link"),
            attachments=item.get("attachments") or [],
            record_id=item.get("record_id"),
        )
        if existing:
            weekly_report_crud.update(db, db_obj=existing, obj_in=payload)
        else:
            weekly_report_crud.create(db, obj_in=payload)
        applied += 1
    return applied


@webhook_router.post("/jobs/{run_id}")
def receive_sync_result(
    run_id: str,
    payload: SyncResultRequest,
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务 ID 不合法")

    run = sync_run_crud.get(db, id=parsed_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该同步任务")

    with advisory_lock(
        db_engine, namespace=AdvisoryLockNamespace.FEISHU_SYNC_WEBHOOK, key=run_id
    ) as locked:
        if not locked:
            return {"message": "该同步任务正在处理中"}

        # Re-read inside the lock: a retried webhook may have been applied by the
        # first delivery while this one waited.
        run = sync_run_crud.get(db, id=parsed_id)
        if run and run.status in TERMINAL_STATUSES:
            return {"message": "该同步任务已处理"}

        if payload.status != "completed":
            if run:
                sync_run_crud.mark_failed(
                    db, run=run, error=payload.error or "同步失败"
                )
            return {"message": "已记录失败"}

        data = payload.data or {}
        applied = 0
        if payload.kind == "members":
            applied = _apply_members(db, data.get("members") or [])
        elif payload.kind == "seminars":
            if not run or not run.semester_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="同步任务缺少学期"
                )
            applied = _apply_seminars(db, run.semester_id, data.get("seminars") or [])
        elif payload.kind == "weekly_reports":
            if not run or not run.semester_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="同步任务缺少学期"
                )
            week = int(data.get("week") or run.week or 0)
            applied = _apply_weekly_reports(
                db, run.semester_id, week, data.get("reports") or []
            )

        if run:
            sync_run_crud.mark_completed(
                db, run=run, payload={"applied": applied, "kind": payload.kind}
            )
        return {"message": "同步完成", "applied": applied}


@webhook_router.post("/notifications/{notification_id}")
def receive_notification_result(
    notification_id: str,
    payload: NotificationResultRequest,
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(notification_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="推送记录 ID 不合法"
        )

    record = notification_crud.get(db, id=parsed_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该推送记录")

    if payload.status == "sent":
        notification_crud.mark_sent(db, notification=record)
    else:
        notification_crud.mark_failed(
            db, notification=record, error=payload.error or "发送失败"
        )
    return {"message": "已记录推送结果"}


@webhook_router.post("/scheduled/{job}")
def run_scheduled_job(job: str):
    """Entry point for Celery Beat; the server renders and submits the message."""
    from app.helpers.scheduled_jobs import dispatch_scheduled_job

    result = dispatch_scheduled_job(job)
    return result
