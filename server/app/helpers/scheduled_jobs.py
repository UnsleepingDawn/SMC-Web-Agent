"""Render and submit the messages Celery Beat fires on a schedule.

Beat owns the clock only: it POSTs here, and the server decides who to message
and what to say, so the scheduling logic stays testable without a worker.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.api.attendance_api import build_daily_summary, build_seminar_summary
from app.database.crud.member_crud import member as member_crud
from app.database.crud.notification_crud import (
    NotificationCreate,
    notification as notification_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.seminar_crud import seminar as seminar_crud
from app.database.crud.weekly_report_crud import weekly_report as weekly_report_crud
from app.database.database import SessionLocal
from app.feishu.renderer import TemplateError, render_seminar_preview, render_weekly_summary
from app.helpers.feishu_jobs import feishu_jobs
from app.helpers.semester_calendar import previous_week

logger = logging.getLogger(__name__)


def _default_recipients(db, semester) -> List[str]:
    """Members flagged for attendance, used as the default push audience."""
    rows = member_crud.list_need_attendance(db)
    return [row.feishu_account for row in rows if row.feishu_account]


def _dispatch_post(
    db, *, template_key: str, recipients: List[str], message: Dict[str, Any]
) -> int:
    sent = 0
    for receive_id in recipients:
        record = notification_crud.create(
            db,
            obj_in=NotificationCreate(
                template_key=template_key,
                target=receive_id,
                payload=message,
            ),
        )
        if not record:
            continue
        feishu_jobs.send_message(
            notification_id=record.id,
            receive_id=receive_id,
            msg_type="post",
            title=message["zh_cn"]["title"],
            content=message["zh_cn"]["content"],
        )
        sent += 1
    return sent


def _seminar_preview() -> Dict[str, Any]:
    with SessionLocal() as db:
        semester = semester_crud.get_current(db)
        if not semester:
            return {"sent": 0, "message": "还没有配置学期"}
        week = semester_crud.current_week(db)
        if not week:
            return {"sent": 0, "message": "无法确定当前周次"}

        slots = seminar_crud.get_multi_by(
            db, semester_id=semester.id, week=week, happened=False, limit=1
        )
        if not slots:
            return {"sent": 0, "message": f"第{week}周没有待进行的组会安排"}

        try:
            message = render_seminar_preview(slots[0], semester)
        except TemplateError as exc:
            return {"sent": 0, "message": str(exc)}

        recipients = _default_recipients(db, semester)
        sent = _dispatch_post(
            db,
            template_key="seminar_preview",
            recipients=recipients,
            message=message,
        )
        return {"sent": sent, "week": week}


def _weekly_summary() -> Dict[str, Any]:
    with SessionLocal() as db:
        semester = semester_crud.get_current(db)
        if not semester:
            return {"sent": 0, "message": "还没有配置学期"}
        week = semester_crud.current_week(db)
        if not week:
            return {"sent": 0, "message": "无法确定当前周次"}
        week = previous_week(week)

        submitted, missing = weekly_report_crud.submitted_and_missing(
            db, semester_id=semester.id, week=week
        )

        # Attendance is best-effort: a semester that has never synced simply
        # reports "no records" in the summary rather than blocking the message.
        daily = build_daily_summary(db, semester, week)
        seminar = build_seminar_summary(db, semester, week)
        has_daily = bool(daily["dates"])
        has_seminar = bool(seminar["expected"])

        message = render_weekly_summary(
            semester=semester,
            week=week,
            submitted_names=[row.member_name for row in submitted],
            missing_names=[row.name for row in missing],
            absent_names=daily["absent_names"] if has_daily else None,
            late_names=daily["late_names"] if has_daily else None,
            attended_names=seminar["attended"] if has_seminar else None,
            not_attended_names=seminar["absent"] if has_seminar else None,
            leave_names=(
                [row["member_name"] for row in seminar["leave"]]
                if has_seminar
                else None
            ),
        )
        recipients = _default_recipients(db, semester)
        sent = _dispatch_post(
            db,
            template_key="weekly_summary",
            recipients=recipients,
            message=message,
        )
        return {"sent": sent, "week": week}


def dispatch_scheduled_job(job: str) -> Dict[str, Any]:
    if job == "seminar_preview":
        return _seminar_preview()
    if job == "weekly_summary":
        return _weekly_summary()
    return {"sent": 0, "message": f"未知的定时任务 {job}"}
