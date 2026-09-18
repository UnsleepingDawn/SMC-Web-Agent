"""Attendance statistics: attendance group, daily and seminar attendance.

The server reads stored rows and applies the exemption rules; the Feishu calls
and the parsing happen in the jobs worker, reachable through ``/api/sync``.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Any, Dict, List
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import (
    attendance_group as attendance_group_crud,
    daily_attendance as daily_attendance_crud,
    schedule_entry as schedule_entry_crud,
    seminar_attendance as seminar_attendance_crud,
    seminar_leave as seminar_leave_crud,
)
from app.database.crud.member_crud import member as member_crud
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.seminar_crud import seminar as seminar_crud
from app.database.database import get_db
from app.helpers.meeting_slots import safe_day_period
from app.helpers.s3 import s3_service
from app.helpers.semester_calendar import week_date
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

attendance_router = APIRouter()


def _attendance_group_name() -> str:
    return os.getenv("FEISHU_ATTENDANCE_GROUP_NAME", "SMC考勤")


def _resolve_semester(db: Session, semester_id: str):
    try:
        parsed_id = UUID(semester_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")
    db_semester = semester_crud.get(db, id=parsed_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


def _seminar_weekday(db: Session, semester, week: int) -> int:
    slots = seminar_crud.get_multi_by(db, semester_id=semester.id, week=week, limit=10)
    upcoming = [slot for slot in slots if not slot.happened]
    if upcoming:
        return int(upcoming[0].weekday)
    if slots:
        return int(slots[0].weekday)
    return int(semester.default_seminar_weekday)


def _expected_names(db: Session, semester_id: UUID) -> List[str]:
    """Who is expected at the seminar / in the weekly statistics."""
    members = attendance_group_crud.list_members(
        db, group_name=_attendance_group_name()
    )
    names = [str(row.name) for row in members if row.name]
    if names:
        return sorted(set(names))
    rows = member_crud.list_filtered(db, need_attendance=True, is_active=True)
    return sorted({str(row.name) for row in rows if row.name})


def _parse_relay(text: str) -> List[str]:
    names: List[str] = []
    seen: set[str] = set()
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        marker = "." if "." in line else ("．" if "．" in line else None)
        if marker is None:
            continue
        after = line.split(marker, 1)[1].strip()
        if not after:
            continue
        name = after.split()[0].strip()
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


class RelayRequest(BaseModel):
    semester_id: str
    week: int
    text: str


class ManualRequest(BaseModel):
    semester_id: str
    week: int
    observed_names: List[str]


@attendance_router.get("/group")
def get_attendance_group(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    group_name = _attendance_group_name()
    group = attendance_group_crud.get_by_name(db, name=group_name)
    members = attendance_group_crud.list_members(db, group_name=group_name)
    return {
        "group_name": group_name,
        "feishu_group_id": group.feishu_group_id if group else None,
        "members": [row.to_dict() for row in members],
    }


@attendance_router.get("/daily")
def get_daily_attendance(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Weekly clock-in table plus chart data, with course exemption applied."""
    semester = _resolve_semester(db, semester_id)
    return build_daily_summary(db, semester, week)


def build_daily_summary(db: Session, semester, week: int) -> Dict[str, Any]:
    """Weekly clock-in table plus chart data, with course exemption applied."""
    records = daily_attendance_crud.list_by_week(db, semester_id=semester.id, week=week)
    schedule = schedule_entry_crud.list_by_semester(db, semester_id=semester.id)
    morning_courses = {
        (int(entry.weekday), str(entry.member_name))
        for entry in schedule
        if entry.period == "上午"
    }

    by_member: Dict[str, Dict[str, str]] = {}
    for record in records:
        status_text = str(record.status)
        if status_text != "正常" and (
            record.attendance_date.isoweekday(),
            record.member_name,
        ) in morning_courses:
            status_text = "上课"
        by_member.setdefault(record.member_name, {})[
            record.attendance_date.isoformat()
        ] = status_text

    dates = sorted({record.attendance_date.isoformat() for record in records})
    rows: List[Dict[str, Any]] = []
    for name in sorted(by_member):
        days = by_member[name]
        absent_count = sum(1 for value in days.values() if value == "缺卡")
        late_count = sum(1 for value in days.values() if value == "迟到")
        rows.append(
            {
                "member_name": name,
                "days": {day: days.get(day, "") for day in dates},
                "absent_count": absent_count,
                "late_count": late_count,
            }
        )
    rows.sort(
        key=lambda row: (
            -row["absent_count"],
            -row["late_count"],
            row["member_name"],
        )
    )

    chart = [
        {
            "name": row["member_name"],
            "absent": row["absent_count"],
            "late": row["late_count"],
        }
        for row in rows
    ]

    return {
        "week": week,
        "dates": dates,
        "rows": rows,
        "chart": chart,
        "absent_names": [row["member_name"] for row in rows if row["absent_count"] > 0],
        "late_names": [row["member_name"] for row in rows if row["late_count"] > 0],
    }


@attendance_router.post("/daily/export")
def export_daily_attendance(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Export the weekly attendance table as an Excel file."""
    payload = get_daily_attendance(
        semester_id=semester_id,
        week=week,
        current_user=current_user,
        db=db,
    )
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = f"第{week}周考勤"
    headers = ["姓名"] + list(payload["dates"]) + ["缺卡次数", "迟到次数"]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")
    for row in payload["rows"]:
        sheet.append(
            [row["member_name"]]
            + [row["days"].get(day, "") for day in payload["dates"]]
            + [row["absent_count"], row["late_count"]]
        )
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    object_key = f"exports/attendance-week-{week}.xlsx"
    _, file_url = s3_service.upload_bytes(
        buffer,
        object_key,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    return {"file_url": file_url, "week": week}


@attendance_router.get("/seminar")
def get_seminar_attendance(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Expected/attended/absent lists with course and leave exemption applied."""
    semester = _resolve_semester(db, semester_id)
    return build_seminar_summary(db, semester, week)


def build_seminar_summary(db: Session, semester, week: int) -> Dict[str, Any]:
    """Expected/attended/absent lists with course and leave exemption applied."""
    weekday = _seminar_weekday(db, semester, week)
    seminar_date = week_date(semester.start_date, week, weekday)
    expected = _expected_names(db, semester.id)

    records = seminar_attendance_crud.list_by_week(
        db, semester_id=semester.id, week=week
    )
    observed = sorted({record.member_name for record in records if record.observed})
    sources = {record.member_name: record.source for record in records}

    leaves = seminar_leave_crud.list_by_week(db, semester_id=semester.id, week=week)
    leave_names = {str(row.member_name) for row in leaves}

    period = safe_day_period(semester.default_seminar_start_time) or "晚上"
    schedule = schedule_entry_crud.list_by_weekday(
        db, semester_id=semester.id, weekday=weekday
    )
    course_exempt = sorted(
        {str(entry.member_name) for entry in schedule if entry.period == period}
    )

    observed_set = set(observed)
    course_set = set(course_exempt)
    absent = [
        name
        for name in expected
        if name not in observed_set
        and name not in leave_names
        and name not in course_set
    ]

    return {
        "week": week,
        "weekday": weekday,
        "seminar_date": seminar_date.isoformat(),
        "period": period,
        "expected": expected,
        "attended": observed,
        "absent": absent,
        "leave": [
            {"member_name": row.member_name, "reason": row.reason} for row in leaves
        ],
        "course_exempt": course_exempt,
        "source": "manual"
        if any(value == "manual" for value in sources.values())
        else ("relay" if any(value == "relay" for value in sources.values()) else "flow"),
    }


@attendance_router.post("/seminar/relay")
def submit_seminar_relay(
    payload: RelayRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Replace the week's attendance with names parsed from a group relay."""
    semester = _resolve_semester(db, payload.semester_id)
    names = _parse_relay(payload.text)
    if not names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="没有解析到任何姓名"
        )
    weekday = _seminar_weekday(db, semester, payload.week)
    seminar_date = week_date(semester.start_date, payload.week, weekday)
    count = seminar_attendance_crud.replace_week(
        db,
        semester_id=semester.id,
        week=payload.week,
        observed_names=names,
        source="relay",
        seminar_date=seminar_date,
    )
    return {"count": count, "names": names}


@attendance_router.put("/seminar/manual")
def set_seminar_manual(
    payload: ManualRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Overwrite the week's attendance with an explicit list of names."""
    semester = _resolve_semester(db, payload.semester_id)
    names = [name.strip() for name in payload.observed_names if name.strip()]
    weekday = _seminar_weekday(db, semester, payload.week)
    seminar_date = week_date(semester.start_date, payload.week, weekday)
    count = seminar_attendance_crud.replace_week(
        db,
        semester_id=semester.id,
        week=payload.week,
        observed_names=names,
        source="manual",
        seminar_date=seminar_date,
    )
    return {"count": count, "names": names}


@attendance_router.get("/leaves")
def list_seminar_leaves(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    semester = _resolve_semester(db, semester_id)
    rows = seminar_leave_crud.list_by_week(db, semester_id=semester.id, week=week)
    return {"leaves": [row.to_dict() for row in rows]}


@attendance_router.get("/schedule")
def list_schedule(
    semester_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    semester = _resolve_semester(db, semester_id)
    rows = schedule_entry_crud.list_by_semester(db, semester_id=semester.id)
    return {"entries": [row.to_dict() for row in rows]}
