"""Build seminar occurrences from the seminar bitable.

Port of ``SMCLabSeminarManager``: the table has one row per person, with the
date they last presented and the date they are expected next. Rows sharing a
date form one occurrence, ordered by the ``顺序`` track column.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from src.seminar_calendar import week_and_weekday

logger = logging.getLogger(__name__)

FIELD_NAME = "姓名"
FIELD_LAST_DATE = "上次讲组会时间"
FIELD_NEXT_DATE = "近期预期"
FIELD_CONFIRMED = "是否确认"
FIELD_ROOM = "_会议室"
FIELD_TRACK = "顺序"
FIELD_TITLE = "分享主题"
FIELD_ABSTRACT = "摘要"


def _text(fields: Dict[str, Any], name: str) -> str:
    value = fields.get(name)
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for chunk in value:
            if isinstance(chunk, dict) and chunk.get("text"):
                parts.append(str(chunk["text"]).strip())
            elif chunk:
                parts.append(str(chunk).strip())
        return " ".join(parts)
    return str(value).strip()


def _to_date(value: Any) -> Optional[date]:
    """Feishu date fields come back as epoch milliseconds."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if value <= 0:
            return None
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date()
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


def _to_track(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


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
                    "presentations": [],
                },
            )

            room = _text(fields, FIELD_ROOM)
            if room and not occurrence["room"]:
                occurrence["room"] = room

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
        # order; renumber densely so the preview always prints Track 1..N.
        presentations = sorted(
            occurrence["presentations"], key=lambda item: item["track"]
        )
        for index, presentation in enumerate(presentations, start=1):
            presentation["track"] = index
        occurrence["presentations"] = presentations
        seminars.append(occurrence)

    seminars.sort(key=lambda item: (item["week"], item["weekday"], item["happened"]))
    logger.info("Built %d seminar occurrences", len(seminars))
    return seminars
