"""Weekly report rows for one week.

Port of ``SMCLabWeeklyReportParser``: the bitable is filtered to a week and the
submitted names are matched against the attendance group.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

FIELD_REPORTER = "汇报人"
FIELD_ATTACHMENT = "附件"
FIELD_LINK = "文档链接"

# The bitable marks a row valid for the week through these two columns; the
# search filter already applies them, but rows are re-checked so a caller can
# pass an unfiltered page.
FIELD_WEEK = "_Week"
FIELD_WEEKDAY_VALID = "WeekdayValid"


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


def _first_link(value: Any) -> str:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("link"):
                return str(item["link"]).strip()
        return ""
    if isinstance(value, dict):
        return str(value.get("link") or "").strip()
    return str(value or "").strip()


def _attachments(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if isinstance(item, dict):
            result.append(
                {
                    "file_token": str(item.get("file_token") or ""),
                    "name": str(item.get("name") or ""),
                }
            )
    return result


def _is_valid_for_week(fields: Dict[str, Any], week: int) -> bool:
    raw_week = fields.get(FIELD_WEEK)
    if raw_week is not None:
        try:
            if int(str(raw_week).strip()) != week:
                return False
        except ValueError:
            return False
    valid = fields.get(FIELD_WEEKDAY_VALID)
    if valid is not None and str(valid).strip().lower() not in ("true", "1"):
        return False
    return True


def weekly_report_rows(
    records: List[Dict[str, Any]], *, week: int
) -> List[Dict[str, Any]]:
    """Submitted rows for one week, one per reporter."""
    rows: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for record in records:
        fields = record.get("fields") or {}
        if not _is_valid_for_week(fields, week):
            continue

        name = _person_name(fields.get(FIELD_REPORTER))
        if not name or name in seen:
            continue
        seen.add(name)

        rows.append(
            {
                "member_name": name,
                "doc_link": _first_link(fields.get(FIELD_LINK)),
                "attachments": _attachments(fields.get(FIELD_ATTACHMENT)),
                "record_id": str(record.get("record_id") or ""),
            }
        )

    logger.info("Week %d has %d weekly report submissions", week, len(rows))
    return rows


def split_submitted_and_missing(
    submitted_names: List[str], expected_names: List[str]
) -> tuple[List[str], List[str]]:
    """Submitted names plus the extra ones, and who is still missing.

    A name submitted by someone outside the attendance group is still listed,
    which is how the original ``额外提交者`` line worked.
    """
    expected = set(expected_names)
    submitted_set = set(submitted_names)

    ordered_submitted = [name for name in expected_names if name in submitted_set]
    ordered_submitted += sorted(submitted_set - expected)
    missing = [name for name in expected_names if name not in submitted_set]
    return ordered_submitted, missing
