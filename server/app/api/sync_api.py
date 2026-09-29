"""Trigger Feishu synchronisation and read task progress."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID
from zoneinfo import ZoneInfo

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import attendance_group as attendance_group_crud
from app.database.crud.member_crud import member as member_crud
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.sync_crud import (
    SyncRunCreate,
    sync_run as sync_run_crud,
)
from app.database.database import get_db
from app.helpers.feishu_jobs import feishu_jobs
from app.helpers.semester_calendar import shift_hhmm, week_date, week_period
from app.helpers.semester_stats import (
    attendance_group_name,
    running_semester,
    semester_data_names,
    seminar_weekday,
)
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

sync_router = APIRouter()

SHANGHAI = ZoneInfo("Asia/Shanghai")

SUPPORTED_TASKS = (
    "members",
    "seminars",
    "weekly_reports",
    "attendance_group",
    "daily_attendance",
    "seminar_attendance",
    "seminar_leaves",
    "schedule",
)

# Tasks that need a week number from the request.
WEEK_TASKS = ("weekly_reports", "daily_attendance", "seminar_attendance", "seminar_leaves")

# Grace margin on each side of the seminar when collecting clock-in flows.
# The seminar window is the one the semester advertises (`19:00-20:30`), and
# people drift in before it starts and linger after it ends; clamping the
# query to those exact minutes drops them from the roster. The margin only
# widens what counts as showing up -- it is never displayed, and it leaves the
# announced time untouched.
SEMINAR_FLOW_GRACE_MINUTES = 30


class SyncRequest(BaseModel):
    task: str
    semester_id: Optional[str] = None
    week: Optional[int] = None


def _resolve_semester(db: Session, semester_id: Optional[str]):
    if not semester_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择学期"
        )
    try:
        parsed_id = UUID(semester_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")

    db_semester = semester_crud.get(db, id=parsed_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


def _require_tokens(semester, app_token: Optional[str], table_id: Optional[str], label: str) -> None:
    if not (app_token and table_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"请先在设置里填写{label}的 app_token 与 table_id",
        )


def _group_users(db: Session) -> List[Tuple[str, str]]:
    """The attendance group's members, with the ``need_attendance`` fallback."""
    rows = attendance_group_crud.list_members(
        db, group_name=attendance_group_name()
    )
    if rows:
        return [
            (str(row.feishu_user_id), str(row.name or ""))
            for row in rows
            if row.feishu_user_id
        ]
    fallback = member_crud.list_filtered(db, need_attendance=True, is_active=True)
    return [
        (str(member.feishu_user_id), str(member.name or ""))
        for member in fallback
        if member.feishu_user_id
    ]


def _semester_users(db: Session, semester) -> List[Tuple[str, str]]:
    """The members the finished semester's own rows prove were around.

    Resolved against the master data so each name carries its ``feishu_user_id``;
    a name without one cannot be queried at all and is left out.
    """
    names = semester_data_names(db, semester)
    if not names:
        return []
    user_ids = {
        str(member.name): str(member.feishu_user_id)
        for member in member_crud.list_filtered(db)
        if member.name and member.feishu_user_id
    }
    return sorted(
        ((user_ids[name], name) for name in names if name in user_ids),
        key=lambda pair: pair[1],
    )


def _attendance_users(db: Session, semester) -> List[Tuple[str, str]]:
    """(feishu_user_id, name) pairs that attendance syncs should cover.

    The attendance group says who is due *today*, so it is the roster for the
    term in progress. A finished term must be read from its own rows instead:
    the group has moved on since, and asking Feishu about today's members only
    leaves everyone who left the group showing up as "no record" for a term
    they actually attended.
    """
    if running_semester(db, semester):
        return _group_users(db)
    return _semester_users(db, semester)


def _timestamp_seconds(day, hhmm: str) -> int:
    hour, minute = int(hhmm[:2]), int(hhmm[2:])
    moment = datetime(day.year, day.month, day.day, hour, minute, tzinfo=SHANGHAI)
    return int(moment.timestamp())


@sync_router.post("")
def start_sync(
    payload: SyncRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if payload.task not in SUPPORTED_TASKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的任务类型 {payload.task}",
        )

    if payload.task == "attendance_group":
        db_semester = (
            _resolve_semester(db, payload.semester_id) if payload.semester_id else None
        )
    else:
        db_semester = _resolve_semester(db, payload.semester_id)

    if payload.task in WEEK_TASKS and not payload.week:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该同步任务需要指定周次"
        )

    if payload.task in ("members", "seminars") and db_semester:
        _require_tokens(
            db_semester,
            db_semester.seminar_app_token,
            db_semester.seminar_table_id,
            "组会多维表格",
        )
    if payload.task == "weekly_reports" and db_semester:
        _require_tokens(
            db_semester,
            db_semester.weekly_report_app_token,
            db_semester.weekly_report_table_id,
            "周报多维表格",
        )
    if payload.task == "seminar_leaves" and db_semester:
        _require_tokens(
            db_semester,
            db_semester.seminar_leave_app_token,
            db_semester.seminar_leave_table_id,
            "请假多维表格",
        )
    if payload.task == "schedule" and db_semester:
        _require_tokens(
            db_semester,
            db_semester.schedule_app_token,
            db_semester.schedule_table_id,
            "课表多维表格",
        )

    attendance_users: List[Tuple[str, str]] = []
    if payload.task in ("daily_attendance", "seminar_attendance"):
        if not db_semester:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择学期"
            )
        attendance_users = _attendance_users(db, db_semester)
        if not attendance_users:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "还没有应到人员，请先同步考勤组或在人员管理里勾选需要考勤"
                    if running_semester(db, db_semester)
                    else "该学期没有任何数据可以确定应到名单，请先同步周报或组会记录"
                ),
            )

    run = sync_run_crud.create(
        db,
        obj_in=SyncRunCreate(
            task_name=payload.task,
            semester_id=db_semester.id if db_semester else None,
            week=payload.week,
            payload={
                "semester_name": db_semester.name if db_semester else None,
                "week": payload.week,
            },
        ),
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="创建同步记录失败"
        )

    if payload.task == "members":
        job_id = feishu_jobs.sync_members(
            run_id=run.id,
            seminar_app_token=db_semester.seminar_app_token,
            seminar_table_id=db_semester.seminar_table_id,
        )
    elif payload.task == "seminars":
        job_id = feishu_jobs.sync_seminar(
            run_id=run.id,
            seminar_app_token=db_semester.seminar_app_token,
            seminar_table_id=db_semester.seminar_table_id,
            semester_start=db_semester.start_date.isoformat(),
            default_weekday=db_semester.default_seminar_weekday,
        )
    elif payload.task == "weekly_reports":
        job_id = feishu_jobs.sync_weekly_reports(
            run_id=run.id,
            weekly_report_app_token=db_semester.weekly_report_app_token,
            weekly_report_table_id=db_semester.weekly_report_table_id,
            week=payload.week,
        )
    elif payload.task == "attendance_group":
        job_id = feishu_jobs.sync_attendance_group(run_id=run.id)
    elif payload.task == "daily_attendance":
        monday, friday = week_period(db_semester.start_date, payload.week)
        job_id = feishu_jobs.sync_daily_attendance(
            run_id=run.id,
            week=payload.week,
            week_monday=monday.isoformat(),
            week_friday=friday.isoformat(),
            user_ids=[user_id for user_id, _ in attendance_users],
        )
    elif payload.task == "seminar_attendance":
        weekday = seminar_weekday(db, db_semester, payload.week)
        seminar_date = week_date(db_semester.start_date, payload.week, weekday)
        window_from = shift_hhmm(
            db_semester.default_seminar_start_time, -SEMINAR_FLOW_GRACE_MINUTES
        )
        window_to = shift_hhmm(
            db_semester.default_seminar_end_time, SEMINAR_FLOW_GRACE_MINUTES
        )
        check_from = _timestamp_seconds(seminar_date, window_from)
        check_to = _timestamp_seconds(seminar_date, window_to)
        job_id = feishu_jobs.sync_seminar_attendance(
            run_id=run.id,
            week=payload.week,
            seminar_date=seminar_date.isoformat(),
            check_time_from=check_from,
            check_time_to=check_to,
            user_ids=[user_id for user_id, _ in attendance_users],
            user_id_to_name={
                user_id: name for user_id, name in attendance_users if name
            },
        )
    elif payload.task == "seminar_leaves":
        job_id = feishu_jobs.sync_seminar_leaves(
            run_id=run.id,
            app_token=db_semester.seminar_leave_app_token,
            table_id=db_semester.seminar_leave_table_id,
            week=payload.week,
        )
    else:  # schedule
        job_id = feishu_jobs.sync_schedule(
            run_id=run.id,
            app_token=db_semester.schedule_app_token,
            table_id=db_semester.schedule_table_id,
        )

    sync_run_crud.mark_running(db, run=run, job_id=job_id)
    return {"run_id": str(run.id), "job_id": job_id, "status": "running"}


@sync_router.get("/runs")
def list_sync_runs(
    limit: int = 20,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = sync_run_crud.list_recent(db, limit=min(limit, 100))
    return {"runs": [row.to_dict() for row in rows]}


@sync_router.get("/runs/{run_id}")
def get_sync_run(
    run_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务 ID 不合法")

    run = sync_run_crud.get(db, id=parsed_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该同步任务")
    return {"run": run.to_dict()}
