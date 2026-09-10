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
from src.feishu.attendance import (
    find_group,
    group_user_ids,
    list_group_users,
    query_daily_stats,
    query_user_flows,
    stats_field_codes,
)
from src.feishu.bitable import search_records
from src.feishu.client import FeishuClient
from src.feishu.contact import collect_primary_members
from src.feishu.message import send_post, send_text
from src.parsers.attendance_parser import (
    daily_attendance_rows,
    observed_seminar_names,
)
from src.parsers.leave_parser import leave_rows
from src.parsers.member_parser import merge_members, seminar_member_rows
from src.parsers.schedule_parser import schedule_rows
from src.parsers.seminar_parser import build_seminars
from src.parsers.weekly_report_parser import weekly_report_rows
from src.runtime_config import get_feishu_credentials
from src.seminar_calendar import date_from_iso
from src.solvers.group_meeting_solver import solve_group_meeting
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


@shared_task(name="sync_attendance_group", bind=True)
def sync_attendance_group(self, *, webhook_url: str) -> Dict[str, Any]:
    """Attendance group definition -> the set of members who must report."""
    try:
        client = _client()
        group_name = _attendance_group_name()
        group = find_group(client, group_name)
        group_id = str(group.get("group_id") or "")
        users = list_group_users(client, group_id)
        members = [
            {
                "feishu_user_id": str(user.get("user_id") or ""),
                "name": str(user.get("name") or ""),
            }
            for user in users
            if user.get("user_id")
        ]
        report_sync_result(
            webhook_url,
            status="completed",
            kind="attendance_group",
            data={
                "group_name": group_name,
                "feishu_group_id": group_id,
                "members": members,
            },
        )
        return {"count": len(members)}
    except Exception as exc:  # noqa: BLE001 - must report, not crash the worker
        logger.error("sync_attendance_group failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="attendance_group", error=str(exc)
        )
        return {"error": str(exc)}


@shared_task(name="sync_daily_attendance", bind=True)
def sync_daily_attendance(
    self,
    *,
    webhook_url: str,
    week: int,
    week_monday: str,
    week_friday: str,
    user_ids: list[str],
    operator_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Daily clock-in statistics for one week -> one row per member per day."""
    try:
        client = _client()
        start_date = date_from_iso(week_monday)
        end_date = date_from_iso(week_friday)
        field_codes = stats_field_codes(client, start_date=start_date, end_date=end_date)
        user_datas = query_daily_stats(
            client,
            start_date=start_date,
            end_date=end_date,
            user_ids=user_ids,
            operator_user_id=operator_user_id,
        )
        rows = daily_attendance_rows(user_datas, field_codes=field_codes)
        report_sync_result(
            webhook_url,
            status="completed",
            kind="daily_attendance",
            data={"week": week, "rows": rows},
        )
        return {"count": len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_daily_attendance failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="daily_attendance", error=str(exc)
        )
        return {"error": str(exc)}


@shared_task(name="sync_seminar_attendance", bind=True)
def sync_seminar_attendance(
    self,
    *,
    webhook_url: str,
    week: int,
    seminar_date: str,
    check_time_from: int,
    check_time_to: int,
    user_ids: list[str],
    user_id_to_name: Dict[str, str],
) -> Dict[str, Any]:
    """Clock-in flows around one seminar -> the names that showed up."""
    try:
        client = _client()
        flows = query_user_flows(
            client,
            user_ids=user_ids,
            check_time_from=check_time_from,
            check_time_to=check_time_to,
        )
        observed = observed_seminar_names(flows, id_to_name=user_id_to_name)
        report_sync_result(
            webhook_url,
            status="completed",
            kind="seminar_attendance",
            data={
                "week": week,
                "seminar_date": seminar_date,
                "observed_names": observed,
            },
        )
        return {"count": len(observed)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_seminar_attendance failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="seminar_attendance", error=str(exc)
        )
        return {"error": str(exc)}


@shared_task(name="sync_seminar_leaves", bind=True)
def sync_seminar_leaves(
    self,
    *,
    webhook_url: str,
    app_token: str,
    table_id: str,
    week: int,
) -> Dict[str, Any]:
    """Seminar leave requests for one week."""
    try:
        client = _client()
        records = search_records(
            client,
            app_token=app_token,
            table_id=table_id,
            field_names=["请假人", "请假原因"],
            filter_conditions=[
                {"field_name": "_Week", "operator": "is", "value": [str(week)]},
            ],
        )
        rows = leave_rows(records, week=week)
        report_sync_result(
            webhook_url,
            status="completed",
            kind="seminar_leaves",
            data={"week": week, "leaves": rows},
        )
        return {"count": len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_seminar_leaves failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="seminar_leaves", error=str(exc)
        )
        return {"error": str(exc)}


@shared_task(name="sync_schedule", bind=True)
def sync_schedule(
    self,
    *,
    webhook_url: str,
    app_token: str,
    table_id: str,
) -> Dict[str, Any]:
    """The course-schedule table -> one row per member per course slot."""
    try:
        client = _client()
        records = search_records(client, app_token=app_token, table_id=table_id)
        rows = schedule_rows(records)
        report_sync_result(
            webhook_url,
            status="completed",
            kind="schedule",
            data={"entries": rows},
        )
        return {"count": len(rows)}
    except Exception as exc:  # noqa: BLE001
        logger.error("sync_schedule failed: %s", exc, exc_info=True)
        report_sync_result(webhook_url, status="failed", kind="schedule", error=str(exc))
        return {"error": str(exc)}


@shared_task(name="solve_group_meeting", bind=True)
def solve_group_meeting_task(
    self,
    *,
    webhook_url: str,
    name_list: list[str],
    slots: list[Dict[str, Any]],
    busy_pairs: list[list[int]],
    already_grouped: list[list[str]],
    weights: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """Run the BILP solver and report the plan back to the server."""
    try:
        solution = solve_group_meeting(
            name_list=name_list,
            slots=slots,
            busy_pairs=busy_pairs,
            already_grouped=already_grouped,
            weights=weights,
        )
        report_sync_result(
            webhook_url,
            status="completed",
            kind="group_meeting_plan",
            data=solution,
        )
        return {
            "solver_status": solution["solver_status"],
            "groups": sum(len(groups) for groups in solution["result"].values()),
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("solve_group_meeting failed: %s", exc, exc_info=True)
        report_sync_result(
            webhook_url, status="failed", kind="group_meeting_plan", error=str(exc)
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
