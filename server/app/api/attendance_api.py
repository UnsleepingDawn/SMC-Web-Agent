"""Attendance statistics: attendance group, daily and seminar attendance.

The server reads stored rows and applies the exemption rules; the Feishu calls
and the parsing happen in the jobs worker, reachable through ``/api/sync``.
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import (
    attendance_group as attendance_group_crud,
    daily_attendance as daily_attendance_crud,
    schedule_entry as schedule_entry_crud,
    seminar_attendance as seminar_attendance_crud,
    seminar_leave as seminar_leave_crud,
)
from app.database.crud.semester_crud import semester as semester_crud
from app.database.database import get_db
from app.helpers.meeting_slots import safe_day_period
from app.helpers.s3 import s3_service
from app.helpers.semester_calendar import week_date
from app.helpers.semester_stats import (
    STATUS_ABSENT,
    STATUS_LATE,
    attendance_group_name,
    build_seminar_eligibility,
    daily_status,
    expected_names,
    morning_course_pairs,
    seminar_weekday,
)
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

attendance_router = APIRouter()


def _resolve_semester(db: Session, semester_id: str):
    try:
        parsed_id = UUID(semester_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")
    db_semester = semester_crud.get(db, id=parsed_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


def _clean_names(names: Optional[List[str]]) -> List[str]:
    """Trim blank entries from a pasted roster, keeping the order."""
    if not names:
        return []
    return [name.strip() for name in names if name and name.strip()]


class ManualRequest(BaseModel):
    semester_id: str
    week: int
    # `None` means "leave this roster alone"; the attendance and leave lists
    # are overwritten independently.
    observed_names: Optional[List[str]] = None
    leave_names: Optional[List[str]] = None


@attendance_router.get("/group")
def get_attendance_group(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    group_name = attendance_group_name()
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
    morning_courses = morning_course_pairs(db, semester.id)

    by_member: Dict[str, Dict[str, str]] = {}
    for record in records:
        status_text = daily_status(
            str(record.status),
            record.attendance_date.isoweekday(),
            str(record.member_name),
            morning_courses,
        )
        by_member.setdefault(record.member_name, {})[
            record.attendance_date.isoformat()
        ] = status_text

    dates = sorted({record.attendance_date.isoformat() for record in records})
    rows: List[Dict[str, Any]] = []
    for name in sorted(by_member):
        days = by_member[name]
        absent_count = sum(1 for value in days.values() if value == STATUS_ABSENT)
        late_count = sum(1 for value in days.values() if value == STATUS_LATE)
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
    weekday = seminar_weekday(db, semester, week)
    seminar_date = week_date(semester.start_date, week, weekday)
    expected = expected_names(db)

    records = seminar_attendance_crud.list_by_week(
        db, semester_id=semester.id, week=week
    )

    # The effective leave list prefers a manual overwrite over the synced rows.
    leaves = seminar_leave_crud.list_by_week(db, semester_id=semester.id, week=week)
    leave_names = {str(row.member_name) for row in leaves}
    has_leave_override = any(row.source != "flow" for row in leaves)

    period = safe_day_period(semester.default_seminar_start_time) or "晚上"
    schedule = schedule_entry_crud.list_by_weekday(
        db, semester_id=semester.id, weekday=weekday
    )
    course_exempt = sorted(
        {str(entry.member_name) for entry in schedule if entry.period == period}
    )

    course_set = set(course_exempt)

    def absent_from(observed_names: set) -> List[str]:
        return [
            name
            for name in expected
            if name not in observed_names
            and name not in leave_names
            and name not in course_set
        ]

    # The synced clock-in rows and the manual override rows are kept side by
    # side. The effective roster prefers the override; without one it is
    # simply the clock-in list. The page can display either.
    flow_attended = sorted(
        {
            record.member_name
            for record in records
            if record.observed and record.source == "flow"
        }
    )
    override_attended = sorted(
        {
            record.member_name
            for record in records
            if record.observed and record.source != "flow"
        }
    )
    has_override = bool(override_attended)
    attended = override_attended if has_override else flow_attended

    return {
        "week": week,
        "weekday": weekday,
        "seminar_date": seminar_date.isoformat(),
        "period": period,
        "expected": expected,
        "attended": attended,
        "absent": absent_from(set(attended)),
        "flow_attended": flow_attended,
        "flow_absent": absent_from(set(flow_attended)),
        "has_override": has_override,
        "has_leave_override": has_leave_override,
        "leave": [
            {"member_name": row.member_name, "reason": row.reason} for row in leaves
        ],
        "course_exempt": course_exempt,
        "source": "manual" if has_override else "flow",
    }


@attendance_router.get("/seminar/missed")
def get_seminar_missed(
    semester_id: str,
    week: int,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Weeks each member owes since their last seminar attendance.

    Weeks where the member was on leave or had a course at the seminar period
    are skipped entirely: they neither count as attendance nor as an absence.
    """
    semester = _resolve_semester(db, semester_id)
    return build_seminar_missed(db, semester, week)


def build_seminar_missed(db: Session, semester, week: int) -> Dict[str, Any]:
    """Weeks each member owes since their last seminar attendance."""
    eligibility = build_seminar_eligibility(db, semester, week)

    chart: List[Dict[str, Any]] = []
    for name, eligible in eligibility.eligible.items():
        attended = eligibility.observed.get(name, set())
        hit = [candidate for candidate in eligible if candidate in attended]
        if not hit:
            missed = len(eligible)
            never_attended = True
        else:
            last = max(hit)
            missed = sum(1 for candidate in eligible if candidate > last)
            never_attended = False
        if missed <= 0:
            continue
        chart.append(
            {"name": name, "missed": missed, "never_attended": never_attended}
        )

    chart.sort(key=lambda row: (-row["missed"], row["name"]))
    return {"week": week, "chart": chart}


@attendance_router.put("/seminar/manual")
def set_seminar_manual(
    payload: ManualRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Overwrite the week's attendance and/or leave list with explicit names.

    Each roster is overwritten only when its list is present in the payload, so
    the page can update the attendance and leave lists independently.
    """
    semester = _resolve_semester(db, payload.semester_id)
    names = _clean_names(payload.observed_names)
    leave_names = _clean_names(payload.leave_names)

    count = len(names)
    if payload.observed_names is not None:
        weekday = seminar_weekday(db, semester, payload.week)
        seminar_date = week_date(semester.start_date, payload.week, weekday)
        count = seminar_attendance_crud.replace_override_rows(
            db,
            semester_id=semester.id,
            week=payload.week,
            observed_names=names,
            source="manual",
            seminar_date=seminar_date,
        )

    leave_count = len(leave_names)
    if payload.leave_names is not None:
        leave_count = seminar_leave_crud.replace_override_rows(
            db,
            semester_id=semester.id,
            week=payload.week,
            member_names=leave_names,
            source="manual",
        )

    return {
        "count": count,
        "names": names,
        "leave_count": leave_count,
        "leave_names": leave_names,
    }


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
