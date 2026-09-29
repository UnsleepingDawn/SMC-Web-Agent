"""Shared semester-wide statistics conventions.

The attendance page, the weekly-report page and the semester summary all have
to agree on three things: who counts as due (the attendance roster), which
seminar week an occurrence falls in, and which weeks a member is exempt from
the seminar. Keeping that logic here means the pages cannot drift apart.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, Iterable, List, Set, Tuple

from app.database.crud.attendance_crud import (
    attendance_group as attendance_group_crud,
    schedule_entry as schedule_entry_crud,
    seminar_attendance as seminar_attendance_crud,
    seminar_leave as seminar_leave_crud,
)
from app.database.crud.member_crud import member as member_crud
from app.database.crud.seminar_crud import seminar as seminar_crud
from app.database.models import Semester
from app.helpers.meeting_slots import safe_day_period
from app.helpers.semester_calendar import semester_week
from sqlalchemy.orm import Session

DEFAULT_ATTENDANCE_GROUP_NAME = "SMC考勤"

# Daily clock-in results, exactly as the Feishu statistics endpoint reports them.
STATUS_NORMAL = "正常"
STATUS_MAKEUP = "正常(补卡通过)"
STATUS_LATE = "迟到"
STATUS_ABSENT = "缺卡"
STATUS_NO_NEED = "无需打卡"
STATUS_NO_NEED_LEAVE = "无需打卡(请假)"
STATUS_PENDING = "尚未打卡"
# Not a Feishu result: the label the statistics show when a course explains the day.
STATUS_COURSE = "上课"

# Results that mean "the member did clock in", including an approved makeup card.
PRESENT_STATUSES = (STATUS_NORMAL, STATUS_MAKEUP)
# Results that excuse the day before the timetable is even considered.
EXCUSED_STATUSES = (STATUS_NO_NEED, STATUS_NO_NEED_LEAVE)
# Results with no final verdict yet, e.g. the day is still running.
PENDING_STATUSES = (STATUS_PENDING,)

# Statistics buckets for one clock-in day.
DAILY_PRESENT = "present"
DAILY_LATE = "late"
DAILY_ABSENT = "absent"
DAILY_COURSE = "course"
DAILY_EXCUSED = "excused"
DAILY_PENDING = "pending"

# A late arrival counts as half an absence in the attendance rate.
LATE_PENALTY = 0.5


def attendance_group_name() -> str:
    return os.getenv("FEISHU_ATTENDANCE_GROUP_NAME", DEFAULT_ATTENDANCE_GROUP_NAME)


def expected_names(db: Session) -> List[str]:
    """Who is expected at the seminar / in the weekly statistics.

    The attendance group is the base; without one the ``need_attendance``
    flags are used so the statistics always have a roster.
    """
    members = attendance_group_crud.list_members(
        db, group_name=attendance_group_name()
    )
    names = [str(row.name) for row in members if row.name]
    if names:
        return sorted(set(names))
    rows = member_crud.list_filtered(db, need_attendance=True, is_active=True)
    return sorted({str(row.name) for row in rows if row.name})


def seminar_weekday(db: Session, semester: Semester, week: int) -> int:
    """The weekday of one week's seminar occurrence.

    A slot that has not happened yet wins, so the upcoming occurrence is the
    one the statistics describe; without slots the semester default applies.
    """
    slots = seminar_crud.get_multi_by(db, semester_id=semester.id, week=week, limit=10)
    upcoming = [slot for slot in slots if not slot.happened]
    if upcoming:
        return int(upcoming[0].weekday)
    if slots:
        return int(slots[0].weekday)
    return int(semester.default_seminar_weekday)


def default_end_week(semester: Semester, on: date | None = None) -> int:
    """The last week the summary should cover.

    A finished semester stops at its end date; an ongoing one stops at the
    current week, so future weeks are never counted as missed.
    """
    today = on or date.today()
    if semester.end_date and semester.end_date < today:
        return semester_week(semester.start_date, semester.end_date)
    return semester_week(semester.start_date, today)


def morning_course_pairs(db: Session, semester_id) -> Set[Tuple[int, str]]:
    """``(weekday, name)`` pairs holding a morning course.

    A morning course excuses a non-normal clock-in result for that day, so the
    same pairs drive both the weekly table and the term summary.
    """
    rows = schedule_entry_crud.list_by_semester(db, semester_id=semester_id)
    return {
        (int(entry.weekday), str(entry.member_name))
        for entry in rows
        if entry.period == "上午"
    }


def daily_status(
    status: str, weekday: int, name: str, morning_courses: Set[Tuple[int, str]]
) -> str:
    """The result to show in the weekly table, for one clock-in day.

    A real problem on a day with a morning course is a course conflict rather
    than an absence, so it is shown as 上课. Days the member was not required to
    clock in, and days without a verdict yet, keep their own label: rewriting
    them to 上课 would claim a course exemption that does not apply.
    """
    if daily_bucket(status, weekday, name, morning_courses) == DAILY_COURSE:
        return STATUS_COURSE
    return str(status).strip()


def daily_bucket(
    status: str, weekday: int, name: str, morning_courses: Set[Tuple[int, str]]
) -> str:
    """Fold one clock-in result into its statistics bucket.

    Only ``present`` / ``late`` / ``absent`` make up the attendance rate, so
    ``excused`` (no obligation, approved leave) and ``pending`` (no verdict yet,
    typically the current day) are reported without penalising anyone. An
    unrecognised result is treated as pending rather than as an absence, so a
    new Feishu status cannot silently drag someone's rate down.
    """
    text = str(status).strip()
    if text in PRESENT_STATUSES:
        return DAILY_PRESENT
    if text in EXCUSED_STATUSES:
        return DAILY_EXCUSED
    if text in PENDING_STATUSES:
        return DAILY_PENDING
    if (weekday, name) in morning_courses:
        return DAILY_COURSE
    if text == STATUS_LATE:
        return DAILY_LATE
    if text == STATUS_ABSENT:
        return DAILY_ABSENT
    return DAILY_PENDING


@dataclass
class SeminarEligibility:
    """Per-member seminar weeks, keyed by name.

    ``eligible`` is the weeks a member was due to show up; ``exempt`` and
    ``leave`` are the subsets that were skipped because of a course or an
    approved leave. ``observed`` holds the weeks the member actually attended,
    read from the effective roster (manual override wins over the clock-in
    flow).
    """

    eligible: Dict[str, List[int]] = field(default_factory=dict)
    exempt: Dict[str, List[int]] = field(default_factory=dict)
    leave: Dict[str, List[int]] = field(default_factory=dict)
    observed: Dict[str, Set[int]] = field(default_factory=dict)


def build_seminar_eligibility(
    db: Session, semester: Semester, end_week: int, names: Iterable[str] | None = None
) -> SeminarEligibility:
    """Classify weeks 1..``end_week`` for every member due at the seminar.

    Weeks where the member was on leave or had a course at the seminar period
    are left out of ``eligible`` entirely: they neither count as attendance
    nor as an absence. ``names`` overrides the roster when the caller has
    already widened it.
    """
    period = safe_day_period(semester.default_seminar_start_time) or "晚上"

    # Course exemption depends on the weekday of each occurrence, so the
    # semester timetable is bucketed by weekday once and reused per week.
    exempt_by_weekday: Dict[int, Set[str]] = {}
    for entry in schedule_entry_crud.list_by_semester(db, semester_id=semester.id):
        if entry.period == period and entry.member_name:
            exempt_by_weekday.setdefault(int(entry.weekday), set()).add(
                str(entry.member_name)
            )

    leaves = seminar_leave_crud.weeks_by_member(db, semester_id=semester.id)
    observed = seminar_attendance_crud.weeks_by_member(db, semester_id=semester.id)
    # The seminar weekday is per week, not per member, so resolve it once.
    weekdays = {
        week: seminar_weekday(db, semester, week)
        for week in range(1, end_week + 1)
    }

    result = SeminarEligibility()
    for name in names if names is not None else expected_names(db):
        leave_weeks = leaves.get(name, set())
        eligible: List[int] = []
        exempt: List[int] = []
        on_leave: List[int] = []
        for week in range(1, end_week + 1):
            if week in leave_weeks:
                on_leave.append(week)
                continue
            if name in exempt_by_weekday.get(weekdays[week], set()):
                exempt.append(week)
                continue
            eligible.append(week)
        result.eligible[name] = eligible
        result.exempt[name] = exempt
        result.leave[name] = on_leave
        result.observed[name] = observed.get(name, set())
    return result


def attendance_rate(
    present: int, late: int, absent: int
) -> float | None:
    """Share of expected days the member showed up, counting a late as half.

    ``None`` means there was nothing to attend, so the metric carries no
    information and should be left out of a weighted score.
    """
    expected = present + late + absent
    if expected <= 0:
        return None
    earned = expected - absent - LATE_PENALTY * late
    return min(1.0, max(0.0, earned / expected))


def ratio_rate(hit: int, expected: int) -> float | None:
    """A plain ``hit / expected`` rate, or ``None`` when there is no frame."""
    if expected <= 0:
        return None
    return min(1.0, max(0.0, hit / expected))


def distinct_weeks(values: Set[int] | List[int], end_week: int) -> Set[int]:
    """Weeks inside 1..``end_week``, so a stray week never skews a rate."""
    return {int(week) for week in values if 1 <= int(week) <= end_week}
