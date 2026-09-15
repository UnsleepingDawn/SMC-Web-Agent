"""Build seminar occurrences from the seminar bitable.

Port of ``SMCLabSeminarManager``: the table has one row per person, with the
date they last presented and the date they are expected next. Rows sharing a
date form one occurrence, whose talks keep the ``顺序`` value they carry in the
table.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from src.seminar_calendar import week_and_weekday

# Feishu date fields carry the day's midnight in Beijing time (UTC+8).
SHANGHAI = ZoneInfo("Asia/Shanghai")

logger = logging.getLogger(__name__)

FIELD_NAME = "姓名"
FIELD_LAST_DATE = "上次讲组会时间"
FIELD_NEXT_DATE = "近期预期"
FIELD_CONFIRMED = "是否确认"
FIELD_ROOM = "_会议室"
FIELD_TRACK = "顺序"
FIELD_TITLE = "分享主题"
FIELD_ABSTRACT = "摘要"
FIELD_OFFLINE_ADVISOR = "线下指导老师"


def _as_text(value: Any) -> str:
    """Flatten a Feishu cell to plain text.

    Text fields come back as strings, rich-text fields as a list of ``{"text"}``
    segments, and reference fields as ``{"text"}``/``{"name"}`` objects.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return " ".join(part for part in (_as_text(item) for item in value) if part)
    if isinstance(value, dict):
        for key in ("text", "name", "value"):
            if key in value:
                return _as_text(value[key])
        return ""
    return str(value).strip()


def _text(fields: Dict[str, Any], name: str) -> str:
    return _as_text(fields.get(name))


def _to_date(value: Any) -> Optional[date]:
    """Feishu date fields come back as epoch milliseconds."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return datetime.fromtimestamp(value / 1000, tz=SHANGHAI).date()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        return None
    return None


def _to_track(value: Any) -> Optional[int]:
    """Read ``顺序`` as a positive integer, or ``None`` when it is unusable.

    The column may be a number or a rich-text cell, so pull the first digits out
    of its flattened text instead of casting the raw value.
    """
    match = re.search(r"\d+", _as_text(value))
    if not match:
        return None
    track = int(match.group())
    return track if track > 0 else None


def build_seminars(
    records: List[Dict[str, Any]],
    *,
    semester_start: date,
    default_weekday: int,
) -> List[Dict[str, Any]]:
    """Group seminar rows into occurrences.

    A row's "last presented" date yields a ``happened=True`` occurrence and its
    "expected next" date a ``happened=False`` one; both must fall inside the
    semester. Rows are merged on ``(week, weekday, happened)`` with the incoming
    row winning, matching the original merge semantics.

    Talks keep the ``顺序`` value the table carries, so a lone presenter with
    ``顺序 = 3`` is still Track 3. Only a missing or duplicated value is
    renumbered, into the first free positive integer.
    """
    grouped: Dict[tuple[int, int, bool], Dict[str, Any]] = {}

    for record in records:
        fields = record.get("fields") or {}
        presenter = _text(fields, FIELD_NAME)
        if not presenter:
            continue

        for field_name, happened in (
            (FIELD_LAST_DATE, True),
            (FIELD_NEXT_DATE, False),
        ):
            date_obj = _to_date(fields.get(field_name))
            if not date_obj or date_obj < semester_start:
                continue

            week, weekday = week_and_weekday(semester_start, date_obj)
            key = (week, weekday, happened)
            occurrence = grouped.setdefault(
                key,
                {
                    "week": week,
                    "weekday": weekday,
                    "happened": happened,
                    "room": "",
                    "offline_advisor": "",
                    "presentations": [],
                },
            )

            # Occurrence-level fields take the first non-empty value seen, the
            # same rule the original merge used for the meeting room.
            for field_name, key in (
                (FIELD_ROOM, "room"),
                (FIELD_OFFLINE_ADVISOR, "offline_advisor"),
            ):
                value = _text(fields, field_name)
                if value and not occurrence[key]:
                    occurrence[key] = value

            occurrence["presentations"].append(
                {
                    "track": _to_track(fields.get(FIELD_TRACK)),
                    "presenter_name": presenter,
                    "title": _text(fields, FIELD_TITLE),
                    "abstract": _text(fields, FIELD_ABSTRACT),
                }
            )

    seminars: List[Dict[str, Any]] = []
    for occurrence in grouped.values():
        # Rows for one occurrence arrive in table order, which is not track
        # order, so sort first and only then fill the gaps. A duplicate has to
        # move: ``seminar_presentations`` is unique on ``(seminar_id, track)``
        # and would otherwise reject the whole sync.
        presentations = sorted(
            occurrence["presentations"],
            key=lambda item: (item["track"] is None, item["track"] or 0),
        )
        used: set[int] = set()
        for presentation in presentations:
            track = presentation["track"]
            if track is None or track in used:
                replacement = 1
                while replacement in used:
                    replacement += 1
                logger.warning(
                    "Week %s has a %s 顺序; using Track %s instead",
                    occurrence["week"],
                    "missing" if track is None else f"duplicate {track}",
                    replacement,
                )
                presentation["track"] = replacement
            used.add(presentation["track"])
        presentations.sort(key=lambda item: item["track"])
        occurrence["presentations"] = presentations
        seminars.append(occurrence)

    seminars.sort(key=lambda item: (item["week"], item["weekday"], item["happened"]))
    logger.info("Built %d seminar occurrences", len(seminars))
    return seminars
