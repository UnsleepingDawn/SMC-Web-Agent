"""Parse the seminar-leave bitable into rows the server can store."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

FIELD_LEAVER = "请假人"
FIELD_REASON = "请假原因"
FIELD_WEEK = "_Week"


def _person_name(value: Any) -> str:
    if isinstance(value, list):
        names = []
        for item in value:
            if isinstance(item, dict) and item.get("name"):
                names.append(str(item["name"]).strip())
            elif item:
                names.append(str(item).strip())
        return ", ".join(name for name in names if name)
    if isinstance(value, dict):
        return str(value.get("name") or "").strip()
    return str(value or "").strip()


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]).strip())
            elif item:
                parts.append(str(item).strip())
        return " ".join(part for part in parts if part)
    return str(value).strip()


def leave_rows(records: List[Dict[str, Any]], *, week: int) -> List[Dict[str, Any]]:
    """One row per leave request in the given week."""
    rows: List[Dict[str, Any]] = []
    for record in records:
        fields = record.get("fields") or {}
        raw_week = fields.get(FIELD_WEEK)
        if raw_week is not None:
            try:
                if int(str(raw_week).strip()) != week:
                    continue
            except ValueError:
                continue
        name = _person_name(fields.get(FIELD_LEAVER))
        if not name:
            continue
        rows.append(
            {
                "member_name": name,
                "reason": _text(fields.get(FIELD_REASON)) or None,
            }
        )
    logger.info("Week %d has %d seminar leaves", week, len(rows))
    return rows
