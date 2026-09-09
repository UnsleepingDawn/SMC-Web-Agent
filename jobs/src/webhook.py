"""Post task results back to the server, which owns the database schema."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 30


def _post(url: str, body: Dict[str, Any]) -> None:
    response = requests.post(url, json=body, timeout=_TIMEOUT_SECONDS)
    if not response.ok:
        raise RuntimeError(
            f"Webhook {url} failed ({response.status_code}): {response.text[:500]}"
        )


def report_sync_result(
    webhook_url: str,
    *,
    status: str,
    kind: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    """Tell the server a sync task finished (or failed)."""
    body: Dict[str, Any] = {"status": status}
    if kind:
        body["kind"] = kind
    if data is not None:
        body["data"] = data
    if error:
        body["error"] = error
    logger.info("Reporting sync result status=%s kind=%s", status, kind)
    _post(webhook_url, body)


def report_notification_result(
    webhook_url: str,
    *,
    status: str,
    error: Optional[str] = None,
    response: Optional[Dict[str, Any]] = None,
) -> None:
    """Tell the server whether a Feishu message went out."""
    body: Dict[str, Any] = {"status": status}
    if error:
        body["error"] = error
    if response is not None:
        body["response"] = response
    _post(webhook_url, body)
