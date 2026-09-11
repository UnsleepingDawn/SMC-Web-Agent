"""Static timetable data and slot math for group meetings and attendance.

Ported from the original ``configs/sysu_schedule.json`` and
``configs/xu_meeting_schedule.json``. Course periods come from the university
timetable; group-meeting slots are the 30-minute blocks the lab books.

The two static tables are checked in rather than configured per semester
because they only change when the university changes its bell schedule.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Sequence, Tuple

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"]

# period -> section -> (start, end), as "HH:MM".
SYSU_SCHEDULE: Dict[str, Dict[str, Tuple[str, str]]] = {
    "上午": {
        "第1节": ("08:00", "08:45"),
        "第2节": ("08:55", "09:40"),
        "第3节": ("10:10", "10:55"),
        "第4节": ("11:05", "11:50"),
    },
    "下午": {
        "第1节": ("14:20", "15:05"),
        "第2节": ("15:15", "16:00"),
        "第3节": ("16:30", "17:15"),
        "第4节": ("17:25", "18:10"),
    },
    "晚上": {
        "第1节": ("19:00", "19:45"),
        "第2节": ("19:55", "20:40"),
        "第3节": ("20:50", "21:35"),
    },
}

# period -> ordered list of (label, start, end) 30-minute meeting slots.
MEETING_SLOTS: Dict[str, List[Tuple[str, str, str]]] = {
    "上午": [
        ("第1组", "10:00", "10:30"),
        ("第2组", "10:30", "11:00"),
        ("第3组", "11:00", "11:30"),
        ("第4组", "11:30", "12:00"),
    ],
    "下午": [
        ("第1组", "14:30", "15:00"),
        ("第2组", "15:00", "15:30"),
        ("第3组", "15:30", "16:00"),
        ("第4组", "16:00", "16:30"),
        ("第5组", "16:30", "17:00"),
        ("第6组", "17:00", "17:30"),
    ],
}

SUPPORTED_MEETING_PERIODS = tuple(MEETING_SLOTS.keys())


class SlotError(ValueError):
    """A requested meeting period or slot is not part of the static table."""


def _to_minutes(value: str) -> int:
    hour_text, minute_text = value.split(":", 1)
    return int(hour_text) * 60 + int(minute_text)


def times_overlap(
    start_a: str, end_a: str, start_b: str, end_b: str
) -> bool:
    """Half-open interval overlap: touching boundaries do not count."""
    return _to_minutes(start_a) < _to_minutes(end_b) and _to_minutes(
        start_b
    ) < _to_minutes(end_a)


def safe_day_period(hhmm: int | str) -> str | None:
    """Map an HHMM value to a period, or None if it does not fall in a period."""
    try:
        value = int(hhmm)
    except (TypeError, ValueError):
        return None
    if 600 < value < 1200:
        return "上午"
    if 1200 < value < 1800:
        return "下午"
    if 1800 < value < 2400:
        return "晚上"
    return None


def day_period(hhmm: int | str) -> str:
    """Map an HHMM value to 上午/下午/晚上, matching the original helper."""
    period = safe_day_period(hhmm)
    if period is None:
        raise SlotError(f"无法根据 {hhmm} 判断时段")
    return period


def expand_slots(meeting_periods: Sequence[str]) -> List[Dict[str, str]]:
    """Expand ``["周三下午"]`` into one dict per 30-minute slot.

    Raises ``SlotError`` for a malformed period or one whose timetable is not
    defined (only 上午/下午 are known).
    """
    slots: List[Dict[str, str]] = []
    for meeting_period in meeting_periods:
        text = str(meeting_period).strip()
        if len(text) < 3:
            raise SlotError(f"时段格式不正确: {meeting_period!r}")
        day, period = text[:2], text[2:]
        if day not in WEEKDAY_NAMES:
            raise SlotError(f"星期不正确: {day!r}")
        if period not in MEETING_SLOTS:
            supported = "、".join(SUPPORTED_MEETING_PERIODS)
            raise SlotError(f"时段 {period!r} 没有可用会议时间，仅支持 {supported}")
        for label, start, end in MEETING_SLOTS[period]:
            slots.append(
                {
                    "name": f"{day}{period}{label}",
                    "day": day,
                    "period": period,
                    "start": start,
                    "end": end,
                }
            )
    return slots


def slot_definitions() -> List[Dict[str, Any]]:
    """The selectable meeting periods and their slots, for the client."""
    return [
        {
            "period": period,
            "slots": [
                {"label": label, "start": start, "end": end}
                for label, start, end in rows
            ],
        }
        for period, rows in MEETING_SLOTS.items()
    ]


def build_busy_pairs(
    name_list: Sequence[str],
    slots: Sequence[Dict[str, str]],
    schedule_entries: Iterable[Any],
) -> List[Tuple[int, int]]:
    """Return ``(member_index, slot_index)`` pairs where the member has class.

    ``schedule_entries`` items expose ``weekday`` (ISO int), ``period``,
    ``section`` and ``member_name``.
    """
    # index[(weekday_number, period, section)] -> set of names
    by_slot: Dict[Tuple[int, str, str], set[str]] = {}
    for entry in schedule_entries:
        key = (int(entry.weekday), str(entry.period), str(entry.section))
        by_slot.setdefault(key, set()).add(str(entry.member_name))

    busy: List[Tuple[int, int]] = []
    for index, name in enumerate(name_list):
        for slot_index, slot in enumerate(slots):
            day_number = WEEKDAY_NAMES.index(slot["day"])
            for section, (start, end) in SYSU_SCHEDULE.get(slot["period"], {}).items():
                names = by_slot.get((day_number, slot["period"], section))
                if not names or name not in names:
                    continue
                if times_overlap(slot["start"], slot["end"], start, end):
                    busy.append((index, slot_index))
                    break
    return busy


def build_meeting_slots(meeting_periods: Sequence[str]) -> List[Dict[str, str]]:
    """Backwards-compatible alias used by the original naming."""
    return expand_slots(meeting_periods)
