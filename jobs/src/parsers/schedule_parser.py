"""Parse the course-schedule bitable into per-member course slots.

Port of ``SMCLabScheduleParser._collect_schedule``: each record is one member,
each weekday column holds entries like ``上午-第1节``, and the sentinel
``(当天无课程)`` means the member has no class that day.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

FIELD_NAME = "姓名"
WEEKDAYS = ["周一", "周二", "周三", "周四", "周五"]
NO_CLASS_MARKERS = ("（当天无课程", "(当天无课程")
SLOT_SEPARATOR = re.compile(r"[-－—–]")


def _member_name(value: Any) -> str:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("text"):
                return str(item["text"]).strip()
            if item:
                return str(item).strip()
        return ""
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or "").strip()
    return str(value or "").strip()


def _slot_texts(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    texts: List[str] = []
    for item in value:
        if isinstance(item, dict):
            text = str(item.get("text") or "").strip()
        else:
            text = str(item).strip()
        if text:
            texts.append(text)
    return texts


def schedule_rows(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Flatten each member's week into ``weekday/period/section`` rows."""
    rows: List[Dict[str, Any]] = []
    for record in records:
        fields = record.get("fields") or {}
        name = _member_name(fields.get(FIELD_NAME))
        if not name:
            continue
        for weekday, day in enumerate(WEEKDAYS, start=1):
            for slot in _slot_texts(fields.get(day)):
                if any(marker in slot for marker in NO_CLASS_MARKERS):
                    continue
                parts = SLOT_SEPARATOR.split(slot, maxsplit=1)
                if len(parts) != 2:
                    continue
                period, section = parts
                rows.append(
                    {
                        "weekday": weekday,
                        "period": period.strip(),
                        "section": section.strip(),
                        "member_name": name,
                    }
                )
    logger.info("Parsed %d schedule entries", len(rows))
    return rows
