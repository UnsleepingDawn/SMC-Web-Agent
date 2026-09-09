"""Merge the Feishu address book with the seminar bitable into member rows.

Port of ``SMCLabAddressBookParser`` and ``SMCLabInfoParser``: the seminar table
carries the lab's own labels (grade, advisor, cultivation type), the address
book carries the Feishu identities, and the two are joined on the Feishu
account (``open_id``). Where both sides carry the same field we keep the address
book value and report a conflict instead of silently picking one.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Seminar-table field names, as configured in the lab's bitable.
FIELD_NAME = "姓名"
FIELD_GRADE = "年级"
FIELD_ADVISOR = "导师"
FIELD_CULTIVATION = "培养类型"
FIELD_STATUS = "_在读情况"
FIELD_ACCOUNT = "_飞书账号"
FIELD_STUDENT_ID = "_学号"

# Member fields that exist on both sides and can therefore disagree.
CONFLICT_FIELDS = ("name", "cultivation_type")


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


def _open_id(fields: Dict[str, Any], name: str) -> str:
    value = fields.get(name)
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("id"):
                return str(item["id"]).strip()
    if isinstance(value, dict) and value.get("id"):
        return str(value["id"]).strip()
    return str(value or "").strip()


def seminar_member_rows(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Turn raw seminar-table records into one row per member."""
    rows: List[Dict[str, Any]] = []
    for record in records:
        fields = record.get("fields") or {}
        account = _open_id(fields, FIELD_ACCOUNT)
        if not account:
            continue
        rows.append(
            {
                "name": _text(fields, FIELD_NAME),
                "grade": _text(fields, FIELD_GRADE),
                "advisor": _text(fields, FIELD_ADVISOR),
                "cultivation_type": _text(fields, FIELD_CULTIVATION),
                "enrollment_status": _text(fields, FIELD_STATUS),
                "feishu_account": account,
                "student_id": _text(fields, FIELD_STUDENT_ID),
            }
        )
    logger.info("Seminar table contributed %d member rows", len(rows))
    return rows


def merge_members(
    seminar_rows: List[Dict[str, Any]],
    address_book_rows: List[Dict[str, Any]],
    *,
    attendance_user_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Outer-join both sources on the Feishu account and flag conflicts.

    Returns dicts ready to upsert into the ``members`` table, plus a
    ``conflicts`` list describing every field the two sources disagree on.
    """
    attendance = set(attendance_user_ids or [])

    seminar_by_account = {
        row["feishu_account"]: row for row in seminar_rows if row.get("feishu_account")
    }
    address_by_account = {
        row["feishu_account"]: row
        for row in address_book_rows
        if row.get("feishu_account")
    }

    merged: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, str]] = []

    for account in set(seminar_by_account) | set(address_by_account):
        seminar = seminar_by_account.get(account, {})
        address = address_by_account.get(account, {})

        row: Dict[str, Any] = {
            "feishu_account": account,
            "name": "",
            "grade": "",
            "advisor": "",
            "advisor_user_id": "",
            "cultivation_type": "",
            "enrollment_status": "",
            "student_id": "",
            "union_id": "",
            "feishu_user_id": "",
            "email": "",
            "mobile": "",
            "department": "",
        }

        # Address book wins where both sides have a value; the seminar table
        # fills the fields the address book does not carry at all.
        row["name"] = address.get("name") or seminar.get("name") or ""
        row["cultivation_type"] = (
            address.get("cultivation_type") or seminar.get("cultivation_type") or ""
        )
        row["grade"] = seminar.get("grade") or ""
        row["advisor"] = seminar.get("advisor") or ""
        row["enrollment_status"] = seminar.get("enrollment_status") or ""
        row["student_id"] = seminar.get("student_id") or ""
        row["advisor_user_id"] = address.get("advisor_user_id") or ""
        row["union_id"] = address.get("union_id") or ""
        row["feishu_user_id"] = address.get("feishu_user_id") or ""
        row["email"] = address.get("email") or ""
        row["mobile"] = address.get("mobile") or ""
        row["department"] = address.get("department") or ""

        for field in CONFLICT_FIELDS:
            left = str(address.get(field) or "").strip()
            right = str(seminar.get(field) or "").strip()
            if left and right and left != right:
                conflicts.append(
                    {
                        "feishu_account": account,
                        "name": row["name"],
                        "field": field,
                        "address_book": left,
                        "seminar": right,
                    }
                )

        row["need_attendance"] = bool(
            row["feishu_user_id"] and row["feishu_user_id"] in attendance
        )
        row["is_active"] = True
        merged.append(row)

    logger.info(
        "Merged %d members (%d conflicts)",
        len(merged),
        len(conflicts),
    )
    return merged
