"""Feishu attendance group endpoints."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List, Optional

from src.feishu.client import FeishuClient, FeishuAPIError

logger = logging.getLogger(__name__)


def find_group(client: FeishuClient, group_name: str) -> Dict[str, Any]:
    """Return the first attendance group matching the configured name."""
    data = client.request(
        "POST",
        "attendance/v1/groups/search",
        json_body={"group_name": group_name},
    )
    groups = data.get("group_list") or []
    if not groups:
        raise FeishuAPIError(-1, f"未查询到考勤组 {group_name}", "attendance/v1/groups/search")
    return groups[0]


def list_group_users(client: FeishuClient, group_id: str) -> List[Dict[str, Any]]:
    """Every member of the attendance group."""
    users: List[Dict[str, Any]] = []
    for page in client.paginate(
        "GET",
        f"attendance/v1/groups/{group_id}/list_user",
        params={
            "employee_type": "employee_id",
            "dept_type": "open_id",
            "member_clock_type": 1,
        },
        page_size=50,
        items_key="users",
    ):
        users.extend(page)
    logger.info("Attendance group %s has %d members", group_id, len(users))
    return users


def group_user_ids(client: FeishuClient, group_name: str) -> tuple[str, List[str]]:
    """Group id plus its members' ``user_id`` values, which is what we match on."""
    group = find_group(client, group_name)
    group_id = str(group.get("group_id") or "")
    users = list_group_users(client, group_id)
    return group_id, [str(user.get("user_id") or "") for user in users if user.get("user_id")]


def _yyyymmdd(value: date) -> int:
    return int(value.strftime("%Y%m%d"))


def stats_field_codes(
    client: FeishuClient, *, start_date: date, end_date: date
) -> Dict[str, str]:
    """Map the date/result column titles to their numeric field codes.

    Returns ``{"date": code, "result": code}``; missing entries mean the caller
    should fall back to the constants.
    """
    data = client.request(
        "POST",
        "attendance/v1/user_stats_fields/query",
        params={"employee_type": "employee_id"},
        json_body={
            "locale": "zh",
            "stats_type": "daily",
            "start_date": _yyyymmdd(start_date),
            "end_date": _yyyymmdd(end_date),
        },
    )
    codes: Dict[str, str] = {}
    for field in data.get("user_stats_field_datas") or data.get("field_list") or []:
        title = str(field.get("title") or field.get("field_name") or "").strip()
        code = str(field.get("field_code") or field.get("code") or "").strip()
        if not code:
            continue
        if title in ("日期", "考勤日期") and "date" not in codes:
            codes["date"] = code
        if title in ("打卡结果", "上班打卡结果") and "result" not in codes:
            codes["result"] = code
    return codes


def query_daily_stats(
    client: FeishuClient,
    *,
    start_date: date,
    end_date: date,
    user_ids: List[str],
    operator_user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Daily clock-in statistics for the given users over one week."""
    body: Dict[str, Any] = {
        "locale": "zh",
        "stats_type": "daily",
        "start_date": _yyyymmdd(start_date),
        "end_date": _yyyymmdd(end_date),
        "user_ids": user_ids,
        "need_history": False,
        "current_group_only": True,
    }
    if operator_user_id:
        body["user_id"] = operator_user_id
    data = client.request(
        "POST",
        "attendance/v1/user_stats_data/query",
        params={"employee_type": "employee_id"},
        json_body=body,
    )
    return data.get("user_datas") or []


def query_user_flows(
    client: FeishuClient,
    *,
    user_ids: List[str],
    check_time_from: int,
    check_time_to: int,
) -> List[Dict[str, Any]]:
    """Clock-in flow records for the users inside the time window (unix seconds)."""
    flows: List[Dict[str, Any]] = []
    for start in range(0, len(user_ids), 50):
        chunk = user_ids[start : start + 50]
        if not chunk:
            continue
        data = client.request(
            "POST",
            "attendance/v1/user_flows/query",
            params={"employee_type": "employee_id", "include_terminated_user": "true"},
            json_body={
                "user_ids": chunk,
                "check_time_from": str(check_time_from),
                "check_time_to": str(check_time_to),
            },
        )
        flows.extend(data.get("user_flow_results") or [])
    return flows

