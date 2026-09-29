"""Semester summary: one row per member with their term-wide metrics.

The endpoint aggregates the three sources the weekly pages already read --
daily clock-ins, seminar attendance and weekly reports -- into one row per
member over weeks 1..``end_week``. It deliberately stops there: weighting,
ranking and the bottom-20% cut happen on the client, so dragging the weight
sliders never hits the network.

The roster is the attendance group, matching the attendance page and the
weekly-report statistics. Members whose details are missing from the master
data still appear, just without a grade/advisor to filter on.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import (
    daily_attendance as daily_attendance_crud,
    seminar_attendance as seminar_attendance_crud,
)
from app.database.crud.member_crud import member as member_crud
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.weekly_report_crud import weekly_report as weekly_report_crud
from app.database.database import get_db
from app.helpers.semester_stats import (
    DAILY_ABSENT,
    DAILY_COURSE,
    DAILY_EXCUSED,
    DAILY_LATE,
    DAILY_PENDING,
    DAILY_PRESENT,
    attendance_rate,
    build_seminar_eligibility,
    daily_bucket,
    default_end_week,
    distinct_weeks,
    expected_names,
    morning_course_pairs,
    ratio_rate,
)
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

semester_summary_router = APIRouter()

# Fields of the member master data the page can filter on.
MEMBER_FIELDS = (
    "grade",
    "advisor",
    "cultivation_type",
    "enrollment_status",
    "student_id",
    "need_attendance",
    "is_active",
)


def _resolve_semester(db: Session, semester_id: Optional[str]):
    if semester_id:
        try:
            parsed_id = UUID(semester_id)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法"
            )
        db_semester = semester_crud.get(db, id=parsed_id)
    else:
        db_semester = semester_crud.get_current(db)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


def _daily_metrics(
    db: Session, semester, end_week: int
) -> tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """Per-member clock-in tallies plus the weeks that actually have rows."""
    records = daily_attendance_crud.list_up_to_week(
        db, semester_id=semester.id, end_week=end_week
    )
    morning_courses = morning_course_pairs(db, semester.id)

    empty = {
        DAILY_PRESENT: 0,
        DAILY_LATE: 0,
        DAILY_ABSENT: 0,
        DAILY_COURSE: 0,
        DAILY_EXCUSED: 0,
        DAILY_PENDING: 0,
    }
    buckets: Dict[str, Dict[str, Any]] = {}
    synced_weeks: set = set()
    for record in records:
        name = str(record.member_name)
        synced_weeks.add(int(record.week))
        bucket = daily_bucket(
            str(record.status),
            record.attendance_date.isoweekday(),
            name,
            morning_courses,
        )
        buckets.setdefault(name, dict(empty))[bucket] += 1

    for tally in buckets.values():
        tally["expected"] = tally[DAILY_PRESENT] + tally[DAILY_LATE] + tally[DAILY_ABSENT]
        tally["rate"] = attendance_rate(
            tally[DAILY_PRESENT], tally[DAILY_LATE], tally[DAILY_ABSENT]
        )
    return buckets, {"daily": sorted(synced_weeks)}


def _empty_daily_tally() -> Dict[str, Any]:
    return {
        DAILY_PRESENT: 0,
        DAILY_LATE: 0,
        DAILY_ABSENT: 0,
        DAILY_COURSE: 0,
        DAILY_EXCUSED: 0,
        DAILY_PENDING: 0,
        "expected": 0,
        "rate": None,
    }


@semester_summary_router.get("")
def semester_summary(
    semester_id: Optional[str] = Query(None),
    end_week: Optional[int] = Query(None, ge=1, le=40),
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Term-wide metrics for every member the semester has data for."""
    db_semester = _resolve_semester(db, semester_id)
    resolved_end_week = end_week or default_end_week(db_semester)

    daily_by_name, coverage = _daily_metrics(db, db_semester, resolved_end_week)
    reports = weekly_report_crud.weeks_by_member(db, semester_id=db_semester.id)

    # The attendance group is the baseline roster, but its sync can lag: members
    # who clocked in or submitted a report before joining the group would
    # otherwise be dropped from the term statistics entirely. Anyone with a
    # stored row for the semester is therefore summarised too.
    names = set(expected_names(db))
    names |= set(daily_by_name)
    names |= set(reports)
    names |= set(
        seminar_attendance_crud.names_by_semester(db, semester_id=db_semester.id)
    )

    eligibility = build_seminar_eligibility(
        db, db_semester, resolved_end_week, names=sorted(names)
    )

    members = {member.name: member for member in member_crud.list_filtered(db)}

    rows: List[Dict[str, Any]] = []
    for name in sorted(names):
        tally = daily_by_name.get(name)
        daily = dict(tally) if tally else _empty_daily_tally()

        eligible = eligibility.eligible.get(name, [])
        observed = eligibility.observed.get(name, set())
        attended = sum(1 for week in eligible if week in observed)
        seminar = {
            "attended": attended,
            "eligible": len(eligible),
            "leave": len(eligibility.leave.get(name, [])),
            "course": len(eligibility.exempt.get(name, [])),
            "rate": ratio_rate(attended, len(eligible)),
        }

        submitted_weeks = distinct_weeks(
            reports.get(name, set()), resolved_end_week
        )
        weekly_report = {
            "submitted": len(submitted_weeks),
            "expected": resolved_end_week,
            "rate": ratio_rate(len(submitted_weeks), resolved_end_week),
        }

        member = members.get(name)
        rows.append(
            {
                "name": name,
                "member": (
                    {field: getattr(member, field) for field in MEMBER_FIELDS}
                    if member
                    else None
                ),
                "daily": daily,
                "seminar": seminar,
                "weekly_report": weekly_report,
            }
        )

    rows.sort(key=lambda row: row["name"])
    # Coverage describes the weeks the summary actually covers, so weeks beyond
    # the chosen end week are not advertised as part of the statistics.
    coverage["seminar"] = sorted(
        {
            week
            for weeks in eligibility.observed.values()
            for week in weeks
            if 1 <= week <= resolved_end_week
        }
    )
    coverage["weekly_report"] = sorted(
        {
            week
            for weeks in reports.values()
            for week in weeks
            if 1 <= week <= resolved_end_week
        }
    )

    return {
        "semester": db_semester.to_dict(),
        "end_week": resolved_end_week,
        "coverage": coverage,
        "rows": rows,
    }
