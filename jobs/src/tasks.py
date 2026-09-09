"""Celery tasks: pull data from Feishu, then report back to the server.

Every task follows the same shape: build a client from the stored credentials,
call the Feishu endpoints, hand the raw records to a parser, POST the parsed
result to the server's webhook, and report failure instead of raising into the
void — the server marks the ``sync_runs`` row accordingly.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import requests
from celery import shared_task  # type: ignore
from src.feishu.attendance import group_user_ids
from src.feishu.bitable import search_records
from src.feishu.client import FeishuClient
from src.feishu.contact import collect_primary_members
from src.feishu.message import send_post, send_text
from src.parsers.member_parser import merge_members, seminar_member_rows
from src.parsers.seminar_parser import build_seminars
from src.parsers.weekly_report_parser import weekly_report_rows
from src.runtime_config import get_feishu_credentials
from src.seminar_calendar import date_from_iso
from src.webhook import report_notification_result, report_sync_result

logger = logging.getLogger(__name__)


def _client() -> FeishuClient:
    app_id, app_secret = get_feishu_credentials()
    return FeishuClient(app_id, app_secret)


def _attendance_group_name() -> str:
    return os.getenv("FEISHU_ATTENDANCE_GROUP_NAME", "SMC考勤")


@shared_task(name="sync_members", bind=True)
def sync_members(self, *, webhook_url: str, seminar_app_token: str, seminar_table_id: str) -> Dict[str, Any]:
    """Address book + seminar table -> member master data."""
    try:
        client = _client()

        attendance_ids: list[str] = []
        try:
            _, attendance_ids = group_user_ids(client, _attendance_group_name())
        except Exception as exc:  # noqa: BLE001 - attendance is optional here
            logger.warning("Skipping attendance group lookup: %s", exc)

        seminar_records = search_records(
            client, app_token=seminar_app_token, table_id=seminar_table_id
        )
        seminar_rows = seminar_member_rows(seminar_records)
        address_rows = collect_primary_members(client)

        members = merge_members(
            seminar_rows, address_rows, attendance_user_ids=attendance_ids
        )
        data = {"members": members}
        report_sync_result(webhook_url, status="completed", kind="members", data=data)
        return {"count": len(members)}
    except Exception as exc:  # noqa: BLE001 - must report, not crash the worker
        logger.error("sync_members failed: %s", exc, exc_info=True)
        report_sync_result(webhook_url, status="failed", kind="members", error=str(exc))
        return {"error": str(exc)}


@shared_task(name="sync_seminar", bind=True)
def sync_seminar(
    self,
    *,
    webhook_url: str,
    seminar_app_token: str,
    seminar_table_id: str,
    semester_start: str,
    default_weekday: int,
) -> Dict[str, Any]:
    """Seminar table -> seminar occurrences with their talks."""
    try:
        client = _client()
        records = search_records(
            client, app_token=seminar_app_token, table_id=seminar_table_id
        )
        seminars = build_seminars(
            records,
            semester_start=date_from_iso(semester_start),
            default_weekday=default_weekday,
        )
        report_sync_result(
            webhook_url, status="completed", kind="seminars", data={"seminars": seminars}
        )
        return {"count": len(seminars)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_seminar failed: %s", exc, exc_info=True)
        report_sync_result(webhook_url, status="failed", kind="seminars", error=str(exc))
        return {"error": str(exc)}


@shared_task(name="sync_weekly_reports", bind=True)
def sync_weekly_reports(
    self,
    *,
    webhook_url: str,
    weekly_report_app_token: str,
    weekly_report_table_id: str,
    week: int,
) -> Dict[str, Any]:
    """Weekly report table -> one week's submissions."""
    try:
        client = _client()
        records = search_records(
            client,
            app_token=weekly_report_app_token,
            table_id=weekly_report_table_id,
            field_names=["汇报人", "附件", "文档链接"],
            filter_conditions=[
                {"field_name": "_Week", "operator": "is", "value": [str(week)]},
                {"field_name": "WeekdayValid", "operator": "is", "value": ["true"]},
            ],
        )
        rows = weekly_report_rows(records, week=week)
        report_sync_result(
            webhook_url,
            status="completed",
            kind="weekly_reports",
            data={"week": week, "reports": rows},
        )
        return {"count": len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_weekly_reports failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="weekly_reports", error=str(exc)
        )
        return {"error": str(exc)}


@shared_task(name="send_feishu_message", bind=True)
def send_feishu_message(
    self,
    *,
    webhook_url: str,
    receive_id: str,
    msg_type: str,
    title: Optional[str] = None,
    content: Any = None,
    receive_id_type: str = "open_id",
) -> Dict[str, Any]:
    """Send one rendered message and report whether it went out."""
    try:
        client = _client()
        if msg_type == "text":
            response = send_text(
                client,
                receive_id=receive_id,
                text=str(content or ""),
                receive_id_type=receive_id_type,
            )
        elif msg_type == "post":
            response = send_post(
                client,
                receive_id=receive_id,
                title=str(title or ""),
                content=content or [],
                receive_id_type=receive_id_type,
            )
        else:
            raise ValueError(f"Unsupported message type {msg_type}")

        report_notification_result(webhook_url, status="sent", response=response)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        logger.error("send_feishu_message failed: %s", exc, exc_info=True)
        report_notification_result(webhook_url, status="failed", error=str(exc))
        return {"error": str(exc)}


@shared_task(name="send_scheduled_seminar_preview")
def send_scheduled_seminar_preview() -> Dict[str, Any]:
    """Ask the server to render and send this week's seminar preview."""
    return _trigger_scheduled("seminar_preview")


@shared_task(name="send_scheduled_weekly_summary")
def send_scheduled_weekly_summary() -> Dict[str, Any]:
    """Ask the server to render and send last week's summary."""
    return _trigger_scheduled("weekly_summary")


@shared_task(name="monthly_placeholder")
def monthly_placeholder() -> Dict[str, Any]:
    """Reserved slot, matching the original ``check_monthly_task`` stub."""
    logger.info("Monthly task ran; nothing to do yet")
    return {"ok": True}


def _trigger_scheduled(job: str) -> Dict[str, Any]:
    base = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000").rstrip("/")
    url = f"{base}/api/webhooks/scheduled/{job}"
    try:
        response = requests.post(url, timeout=60)
        if not response.ok:
            raise RuntimeError(f"Server answered {response.status_code}: {response.text[:200]}")
        return {"ok": True, "result": response.json()}
    except Exception as exc:  # noqa: BLE001
        logger.error("Scheduled %s failed: %s", job, exc, exc_info=True)
        return {"error": str(exc)}


@shared_task(name="health_check")
def health_check() -> Dict[str, Any]:
    """Cheap worker liveness probe."""
    return {"ok": True}
