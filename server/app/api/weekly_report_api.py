"""Weekly report statistics, the weekly summary push, and the teacher push."""

from __future__ import annotations

import logging
from typing import List, Optional
from uuid import UUID

from app.api.attendance_api import build_daily_summary, build_seminar_summary
from app.auth.dependencies import get_required_user
from app.database.crud.member_crud import (
    member as member_crud,
    teacher_department_name,
)
from app.database.crud.notification_crud import (
    NotificationCreate,
    notification as notification_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.weekly_report_crud import (
    weekly_report as weekly_report_crud,
)
from app.database.database import get_db
from app.feishu.renderer import render_teacher_weekly_reports, render_weekly_summary
from app.helpers.feishu_jobs import feishu_jobs
from app.helpers.runtime_config import get_weekly_push_admin_open_id
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


class TeacherPushRequest(BaseModel):
    teacher_names: List[str]
    # "teachers" sends to each teacher; "admin" sends the same bodies to the
    # admin first, as a dry run.
    audience: str = "teachers"


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


def _teacher_push_plan(db: Session, semester, week: int) -> dict:
    """Group enrolled students by advisor and attach this week's report link.

    Teachers are read from the address book's Tenure department, so the roster
    needs no manual upkeep. A teacher without a Feishu account or without
    enrolled students still appears, so the UI can disable them explicitly.
    """
    teachers_rows = member_crud.list_teachers(db)
    enrolled = member_crud.list_enrolled(db)
    reports = weekly_report_crud.list_by_week(
        db, semester_id=semester.id, week=week
    )
    links = {}
    for row in reports:
        # First record wins, matching the submitted/missing split.
        links.setdefault(row.member_name, row.doc_link)

    students_by_advisor: dict = {}
    for student in enrolled:
        students_by_advisor.setdefault(student.advisor or "", []).append(student)

    teachers = []
    for teacher in teachers_rows:
        students = []
        for student in students_by_advisor.get(teacher.name, []):
            submitted = student.name in links
            students.append(
                {
                    "name": student.name,
                    "doc_link": links.get(student.name) if submitted else None,
                    "submitted": submitted,
                }
            )
        teachers.append(
            {
                "name": teacher.name,
                "open_id": teacher.feishu_account or "",
                "student_count": len(students),
                "submitted_count": sum(1 for s in students if s["submitted"]),
                "students": students,
            }
        )

    return {
        "week": week,
        "report_url": semester.weekly_report_url,
        "teacher_department": teacher_department_name(),
        "admin_configured": bool(get_weekly_push_admin_open_id(db)),
        "teachers": teachers,
    }


@weekly_report_router.get("/teacher-push")
def teacher_push_plan(
    week: int,
    semester_id: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = _resolve_semester(db, semester_id)
    return _teacher_push_plan(db, db_semester, week)


@weekly_report_router.post("/teacher-push")
def push_to_teachers(
    week: int,
    payload: TeacherPushRequest,
    semester_id: Optional[str] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Send each selected teacher their group's weekly-report links.

    ``audience="admin"`` is the dry run: identical bodies, but addressed to the
    admin so a mistake never reaches a teacher first.
    """
    if payload.audience not in ("teachers", "admin"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="推送对象不合法"
        )
    if not payload.teacher_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="请至少选择一位老师"
        )

    admin_open_id = get_weekly_push_admin_open_id(db)
    if payload.audience == "admin" and not admin_open_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="还没有配置管理员飞书 ID"
        )

    db_semester = _resolve_semester(db, semester_id)
    plan = _teacher_push_plan(db, db_semester, week)
    selected = set(payload.teacher_names)

    sent: List[str] = []
    skipped: List[str] = []
    for teacher in plan["teachers"]:
        if teacher["name"] not in selected:
            continue
        if teacher["student_count"] == 0:
            skipped.append(teacher["name"])
            continue
        if not teacher["open_id"]:
            skipped.append(teacher["name"])
            continue

        for_admin = payload.audience == "admin"
        message = render_teacher_weekly_reports(
            semester=db_semester,
            week=week,
            teacher_name=teacher["name"],
            students=teacher["students"],
            for_admin=for_admin,
        )
        receive_id = admin_open_id if for_admin else teacher["open_id"]
        template_key = (
            "weekly_teacher_reports_preview"
            if for_admin
            else "weekly_teacher_reports"
        )

        record = notification_crud.create(
            db,
            obj_in=NotificationCreate(
                template_key=template_key,
                target=receive_id,
                payload={**message, "teacher": teacher["name"]},
            ),
        )
        if not record:
            logger.warning("Failed to create notification for %s", teacher["name"])
            continue

        feishu_jobs.send_message(
            notification_id=record.id,
            receive_id=receive_id,
            msg_type="post",
            title=message["zh_cn"]["title"],
            content=message["zh_cn"]["content"],
        )
        sent.append(teacher["name"])

    return {
        "sent": len(sent),
        "audience": payload.audience,
        "teachers": sent,
        "skipped": skipped,
    }


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
