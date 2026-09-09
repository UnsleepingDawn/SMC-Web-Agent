"""Feishu attendance group endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

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
        "attendance/v1/groups/list_user",
        params={
            "group_id": group_id,
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
