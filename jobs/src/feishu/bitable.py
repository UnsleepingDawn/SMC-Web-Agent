"""Feishu bitable record search."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.feishu.client import FeishuClient

logger = logging.getLogger(__name__)


def search_records(
    client: FeishuClient,
    *,
    app_token: str,
    table_id: str,
    field_names: Optional[List[str]] = None,
    filter_conditions: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Fetch every matching record from one bitable view.

    ``filter_conditions`` mirrors Feishu's ``FilterInfo.conditions`` shape, for
    example ``[{"field_name": "_Week", "operator": "is", "value": ["3"]}]``.
    """
    body: Dict[str, Any] = {"automatic_fields": False}
    if field_names:
        body["field_names"] = field_names
    if filter_conditions:
        body["filter"] = {"conjunction": "and", "conditions": filter_conditions}

    records: List[Dict[str, Any]] = []
    for page in client.paginate(
        "POST",
        f"bitable/v1/apps/{app_token}/tables/{table_id}/records/search",
        json_body=body,
        page_size=100,
        items_key="items",
    ):
        records.extend(page)

    logger.info(
        "Fetched %d records from bitable table %s", len(records), table_id
    )
    return records


def extract_field_text(fields: Dict[str, Any], name: str) -> str:
    """Read a text-ish field that Feishu returns as a list of segments."""
    value = fields.get(name)
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for chunk in value:
            if isinstance(chunk, dict):
                text = str(chunk.get("text") or "").strip()
                if text:
                    parts.append(text)
            elif chunk:
                parts.append(str(chunk).strip())
        return " ".join(parts)
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or "").strip()
    return str(value).strip()


def extract_person_name(fields: Dict[str, Any], name: str) -> str:
    """Read a person field, which Feishu returns as a list of user objects."""
    value = fields.get(name)
    if not value:
        return ""
    if isinstance(value, list):
        names = []
        for item in value:
            if isinstance(item, dict):
                text = str(item.get("name") or item.get("text") or "").strip()
                if text:
                    names.append(text)
            elif item:
                names.append(str(item).strip())
        return ", ".join(names)
    if isinstance(value, dict):
        return str(value.get("name") or "").strip()
    return str(value).strip()


def extract_link(fields: Dict[str, Any], name: str) -> str:
    """Read a link field, taking the first href."""
    value = fields.get(name)
    if not value:
        return ""
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("link"):
                return str(item["link"]).strip()
        return ""
    if isinstance(value, dict):
        return str(value.get("link") or "").strip()
    return str(value).strip()


def extract_attachments(fields: Dict[str, Any], name: str) -> List[Dict[str, str]]:
    """Read a file field into ``{"file_token", "name"}`` entries."""
    value = fields.get(name)
    if not value or not isinstance(value, list):
        return []
    attachments: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        attachments.append(
            {
                "file_token": str(item.get("file_token") or ""),
                "name": str(item.get("name") or ""),
            }
        )
    return attachments
