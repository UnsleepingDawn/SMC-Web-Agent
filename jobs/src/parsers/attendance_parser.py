"""Parse Feishu attendance stats and clock-in flows into flat rows.

Port of ``SMCLabDailyAttendanceParser._simplify_raw_data`` and the flow half of
``SMCLabSeminarAttendanceParser``. The server owns the database, so this module
only turns raw Feishu payloads into JSON-friendly dicts.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Fallback field codes; callers should resolve them from the fields endpoint.
FIELD_CODE_DATE = "51201"
FIELD_CODE_RESULT = "51503-1-1"

# Record types that mean "the member clocked in themselves".
ATTENDED_FLOW_TYPES = (0, 6)


def _parse_date(value: Any) -> Optional[date]:
    text = str(value or "").strip()
    if not text:
        return None
    for pattern in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    return None


def daily_attendance_rows(
    user_datas: List[Dict[str, Any]],
    *,
    field_codes: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """One row per member per day, ready for the server to store.

    Feishu answers with one ``user_datas`` entry per member per day in the usual
    case, but it may also pack several days into one entry. Both shapes are
    handled: values for the date and result codes are paired in order, and a
    single value on either side keeps the original "last value wins" behaviour.
    """
    date_code = (field_codes or {}).get("date") or FIELD_CODE_DATE
    result_code = (field_codes or {}).get("result") or FIELD_CODE_RESULT

    rows: List[Dict[str, Any]] = []
    for record in user_datas:
        name = str(record.get("name") or "").strip()
        user_id = str(record.get("user_id") or "").strip()

        dates: List[Optional[date]] = []
        statuses: List[str] = []
        for item in record.get("datas") or []:
            code = str(item.get("code") or "")
            if code == date_code:
                dates.append(_parse_date(item.get("value")))
            elif code == result_code:
                statuses.append(str(item.get("value") or "").strip())

        if not dates or not statuses:
            continue
        if len(dates) == 1 or len(statuses) == 1:
            pairs = [(dates[-1], statuses[-1])]
        else:
            pairs = list(zip(dates, statuses))

        for parsed_date, status in pairs:
            if not name or not parsed_date or not status:
                continue
            rows.append(
                {
                    "member_name": name,
                    "feishu_user_id": user_id or None,
                    "attendance_date": parsed_date.isoformat(),
                    "status": status,
                }
            )

    logger.info("Parsed %d daily attendance rows", len(rows))
    return rows


def observed_seminar_names(
    flows: List[Dict[str, Any]],
    *,
    id_to_name: Optional[Dict[str, str]] = None,
) -> List[str]:
    """Names that clocked in at the seminar, keeping only self clock-ins."""
    mapping = id_to_name or {}
    names: List[str] = []
    seen: set[str] = set()
    for flow in flows:
        flow_type = flow.get("type")
        if flow_type is None or int(flow_type) not in ATTENDED_FLOW_TYPES:
            continue
        user_id = str(flow.get("user_id") or "")
        name = mapping.get(user_id) or str(flow.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        names.append(name)
    logger.info("Parsed %d seminar clock-ins", len(names))
    return names
