"""Feishu contact (address book) endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from src.feishu.client import FeishuClient

logger = logging.getLogger(__name__)

# Custom fields on the lab's Feishu users. The indices are stable for this
# tenant; changing them requires updating the app's user field configuration.
CULTIVATION_ATTR_INDEX = 0
MENTOR_ATTR_INDEX = 1


def list_departments(client: FeishuClient, root_department_id: str = "0") -> List[Dict[str, Any]]:
    """Every department under the root, flattened."""
    departments: List[Dict[str, Any]] = []
    for page in client.paginate(
        "GET",
        f"contact/v3/departments/{root_department_id}/children",
        params={
            "department_id_type": "open_department_id",
            "user_id_type": "open_id",
            "fetch_child": "true",
        },
        page_size=50,
        items_key="items",
    ):
        departments.extend(page)
    return departments


def list_department_users(
    client: FeishuClient, department_id: str
) -> List[Dict[str, Any]]:
    """Every user in one department, including sub-departments."""
    users: List[Dict[str, Any]] = []
    for page in client.paginate(
        "GET",
        "contact/v3/users/find_by_department",
        params={
            "department_id": department_id,
            "department_id_type": "open_department_id",
            "user_id_type": "open_id",
        },
        page_size=50,
        items_key="items",
    ):
        users.extend(page)
    return users


def _custom_attr(user: Dict[str, Any], index: int, value_key: str) -> str:
    attrs = user.get("custom_attrs") or []
    if len(attrs) <= index:
        return ""
    value = (attrs[index] or {}).get("value") or {}
    raw = value.get(value_key)
    if isinstance(raw, dict):
        return str(raw.get("id") or raw.get("option_value") or "")
    if raw:
        return str(raw)
    return ""


def collect_primary_members(
    client: FeishuClient, root_department_id: str = "0"
) -> List[Dict[str, Any]]:
    """Flatten the address book, keeping only users whose primary department matches.

    The original script walked every department and kept users whose ``orders``
    marked that department as primary, which is the same set as one pass over
    each department's own users.
    """
    members: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for department in list_departments(client, root_department_id):
        department_id = str(department.get("open_department_id") or "")
        department_name = str(department.get("name") or "")
        if not department_id:
            continue

        for user in list_department_users(client, department_id):
            open_id = str(user.get("open_id") or "")
            if not open_id or open_id in seen:
                continue
            seen.add(open_id)

            members.append(
                {
                    "name": str(user.get("name") or ""),
                    "union_id": str(user.get("union_id") or ""),
                    "feishu_account": open_id,
                    "feishu_user_id": str(user.get("user_id") or ""),
                    "email": str(user.get("email") or ""),
                    "mobile": str(user.get("mobile") or ""),
                    "cultivation_type": _custom_attr(
                        user, CULTIVATION_ATTR_INDEX, "option_value"
                    ),
                    "advisor_user_id": _custom_attr(
                        user, MENTOR_ATTR_INDEX, "generic_user"
                    ),
                    "department": department_name,
                }
            )

    logger.info("Collected %d primary members from the address book", len(members))
    return members
