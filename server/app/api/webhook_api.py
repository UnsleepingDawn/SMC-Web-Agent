"""Receive task results from the jobs worker.

The server owns the database schema, so the worker never writes rows directly:
it POSTs the parsed records here, and this module upserts them inside an
advisory lock keyed on the sync run so a retried webhook cannot double-apply.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from uuid import UUID

from app.database.crud.attendance_crud import (
    AttendanceGroupCreate,
    AttendanceGroupMemberInput,
    DailyAttendanceCreate,
    ScheduleEntryCreate,
    SeminarLeaveCreate,
    attendance_group as attendance_group_crud,
    daily_attendance as daily_attendance_crud,
    schedule_entry as schedule_entry_crud,
    seminar_attendance as seminar_attendance_crud,
    seminar_leave as seminar_leave_crud,
)
from app.database.crud.group_meeting_crud import (
    TERMINAL_STATUSES as PLAN_TERMINAL_STATUSES,
    group_meeting_plan as group_meeting_plan_crud,
)
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
from datetime import date, datetime

logger = logging.getLogger(__name__)

webhook_router = APIRouter()


def _parse_iso_date(value: Any) -> Optional[date]:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


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
        slot_fields = {
            "room": item.get("room") or None,
            "offline_advisor": item.get("offline_advisor") or None,
        }
        if existing:
            seminar_crud.update(db, db_obj=existing, obj_in=slot_fields)
            target = existing
        else:
            target = seminar_crud.create(
                db,
                obj_in=SeminarCreate(
                    semester_id=semester_id,
                    week=item["week"],
                    weekday=item["weekday"],
                    happened=item["happened"],
                    **slot_fields,
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


def _apply_attendance_group(db: Session, data: Dict[str, Any]) -> int:
    """Store the attendance group and flag its members as needing attendance."""
    name = str(data.get("group_name") or "").strip() or "SMC考勤"
    group = attendance_group_crud.get_by_name(db, name=name)
    if not group:
        group = attendance_group_crud.create(
            db, obj_in=AttendanceGroupCreate(name=name)
        )
    if not group:
        return 0

    member_inputs = []
    member_ids = []
    for item in data.get("members") or []:
        user_id = str(item.get("feishu_user_id") or "").strip()
        if not user_id:
            continue
        member = member_crud.get_by_feishu_user_id(db, feishu_user_id=user_id)
        member_inputs.append(
            AttendanceGroupMemberInput(
                feishu_user_id=user_id,
                name=(member.name if member else None) or item.get("name") or None,
                member_id=member.id if member else None,
            )
        )
        if member:
            member_ids.append(member.id)

    count = attendance_group_crud.replace_members(
        db,
        group=group,
        feishu_group_id=data.get("feishu_group_id"),
        members=member_inputs,
    )
    member_crud.mark_need_attendance(db, member_ids=member_ids)
    return count


def _apply_daily_attendance(
    db: Session, semester_id: UUID, week: int, rows: list[Dict[str, Any]]
) -> int:
    records = []
    for row in rows:
        attendance_date = _parse_iso_date(row.get("attendance_date"))
        member_name = str(row.get("member_name") or "").strip()
        status_text = str(row.get("status") or "").strip()
        if not attendance_date or not member_name or not status_text:
            continue
        records.append(
            DailyAttendanceCreate(
                semester_id=semester_id,
                week=week,
                attendance_date=attendance_date,
                member_name=member_name,
                feishu_user_id=row.get("feishu_user_id") or None,
                status=status_text,
            )
        )
    return daily_attendance_crud.replace_week(
        db, semester_id=semester_id, week=week, rows=records
    )


def _apply_seminar_attendance(
    db: Session, semester_id: UUID, week: int, data: Dict[str, Any]
) -> int:
    names = [str(name) for name in (data.get("observed_names") or []) if name]
    seminar_date = _parse_iso_date(data.get("seminar_date"))
    return seminar_attendance_crud.replace_flow_rows(
        db,
        semester_id=semester_id,
        week=week,
        observed_names=names,
        seminar_date=seminar_date,
    )


def _apply_seminar_leaves(
    db: Session, semester_id: UUID, week: int, leaves: list[Dict[str, Any]]
) -> int:
    rows = []
    for item in leaves:
        member_name = str(item.get("member_name") or "").strip()
        if not member_name:
            continue
        rows.append(
            SeminarLeaveCreate(
                semester_id=semester_id,
                week=week,
                member_name=member_name,
                reason=item.get("reason") or None,
            )
        )
    return seminar_leave_crud.replace_week(
        db, semester_id=semester_id, week=week, rows=rows
    )


def _apply_schedule(
    db: Session, semester_id: UUID, entries: list[Dict[str, Any]]
) -> int:
    rows = []
    for item in entries:
        member_name = str(item.get("member_name") or "").strip()
        period = str(item.get("period") or "").strip()
        section = str(item.get("section") or "").strip()
        if not member_name or not period or not section:
            continue
        rows.append(
            ScheduleEntryCreate(
                semester_id=semester_id,
                weekday=int(item.get("weekday") or 0),
                period=period,
                section=section,
                member_name=member_name,
            )
        )
    return schedule_entry_crud.replace_all(db, semester_id=semester_id, rows=rows)


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
        elif payload.kind == "attendance_group":
            applied = _apply_attendance_group(db, data)
        else:
            if not run or not run.semester_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="同步任务缺少学期"
                )
            semester_id = run.semester_id
            if payload.kind == "seminars":
                applied = _apply_seminars(
                    db, semester_id, data.get("seminars") or []
                )
            elif payload.kind == "weekly_reports":
                week = int(data.get("week") or run.week or 0)
                applied = _apply_weekly_reports(
                    db, semester_id, week, data.get("reports") or []
                )
            elif payload.kind == "daily_attendance":
                week = int(data.get("week") or run.week or 0)
                applied = _apply_daily_attendance(
                    db, semester_id, week, data.get("rows") or []
                )
            elif payload.kind == "seminar_attendance":
                week = int(data.get("week") or run.week or 0)
                applied = _apply_seminar_attendance(db, semester_id, week, data)
            elif payload.kind == "seminar_leaves":
                week = int(data.get("week") or run.week or 0)
                applied = _apply_seminar_leaves(
                    db, semester_id, week, data.get("leaves") or []
                )
            elif payload.kind == "schedule":
                applied = _apply_schedule(db, semester_id, data.get("entries") or [])

        if run:
            sync_run_crud.mark_completed(
                db, run=run, payload={"applied": applied, "kind": payload.kind}
            )
        return {"message": "同步完成", "applied": applied}


class GroupMeetingResultRequest(BaseModel):
    status: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@webhook_router.post("/group-meeting/{plan_id}")
def receive_group_meeting_result(
    plan_id: str,
    payload: GroupMeetingResultRequest,
    db: Session = Depends(get_db),
):
    """Receive the BILP solver result for one group-meeting plan."""
    try:
        parsed_id = UUID(plan_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="排班任务 ID 不合法")

    plan = group_meeting_plan_crud.get(db, id=parsed_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该排班任务")

    with advisory_lock(
        db_engine, namespace=AdvisoryLockNamespace.FEISHU_SYNC_WEBHOOK, key=plan_id
    ) as locked:
        if not locked:
            return {"message": "该排班任务正在处理中"}

        plan = group_meeting_plan_crud.get(db, id=parsed_id)
        if plan and plan.status in PLAN_TERMINAL_STATUSES:
            return {"message": "该排班任务已处理"}

        if payload.status != "completed":
            if plan:
                group_meeting_plan_crud.mark_failed(
                    db, plan=plan, error=payload.error or "排班求解失败"
                )
            return {"message": "已记录失败"}

        data = payload.data or {}
        if plan:
            group_meeting_plan_crud.mark_completed(
                db,
                plan=plan,
                result=data.get("result") or {},
                validation=data.get("validation") or {},
                solver_status=data.get("solver_status"),
            )
        return {"message": "排班完成"}


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
