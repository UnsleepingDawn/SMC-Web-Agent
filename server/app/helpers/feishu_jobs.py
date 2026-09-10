"""Submit Celery tasks to the jobs worker."""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from uuid import UUID

from app.helpers.celery_config import (
    get_celery_api_url,
    get_celery_broker_url,
    get_webhook_base_url,
)
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class FeishuJobsClient:
    """Thin wrapper over ``send_task`` plus the worker's status API."""

    def __init__(
        self,
        webhook_base_url: Optional[str] = None,
        celery_broker_url: Optional[str] = None,
        celery_api_url: Optional[str] = None,
    ) -> None:
        self.webhook_base_url = get_webhook_base_url(webhook_base_url)
        self.celery_broker_url = get_celery_broker_url(celery_broker_url)
        self.celery_api_url = get_celery_api_url(celery_api_url)

    def _app(self) -> Celery:
        app = Celery("smc_tasks", broker=self.celery_broker_url)
        app.conf.update(
            broker_connection_retry_on_startup=True,
            broker_connection_retry=True,
            broker_connection_max_retries=3,
            task_serializer="json",
            accept_content=["json"],
            result_serializer="json",
            task_always_eager=False,
        )
        return app

    def _submit(self, name: str, kwargs: Dict[str, Any], queue: str) -> str:
        task = self._app().send_task(name, kwargs=kwargs, queue=queue)
        logger.info("Submitted %s as task %s", name, task.id)
        return str(task.id)

    def sync_members(
        self, *, run_id: UUID, seminar_app_token: str, seminar_table_id: str
    ) -> str:
        return self._submit(
            "sync_members",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "seminar_app_token": seminar_app_token,
                "seminar_table_id": seminar_table_id,
            },
            queue="feishu_sync",
        )

    def sync_seminar(
        self,
        *,
        run_id: UUID,
        seminar_app_token: str,
        seminar_table_id: str,
        semester_start: str,
        default_weekday: int,
    ) -> str:
        return self._submit(
            "sync_seminar",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "seminar_app_token": seminar_app_token,
                "seminar_table_id": seminar_table_id,
                "semester_start": semester_start,
                "default_weekday": default_weekday,
            },
            queue="feishu_sync",
        )

    def sync_weekly_reports(
        self,
        *,
        run_id: UUID,
        weekly_report_app_token: str,
        weekly_report_table_id: str,
        week: int,
    ) -> str:
        return self._submit(
            "sync_weekly_reports",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "weekly_report_app_token": weekly_report_app_token,
                "weekly_report_table_id": weekly_report_table_id,
                "week": week,
            },
            queue="feishu_sync",
        )

    def sync_attendance_group(self, *, run_id: UUID) -> str:
        return self._submit(
            "sync_attendance_group",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
            },
            queue="feishu_sync",
        )

    def sync_daily_attendance(
        self,
        *,
        run_id: UUID,
        week: int,
        week_monday: str,
        week_friday: str,
        user_ids: list[str],
        operator_user_id: Optional[str] = None,
    ) -> str:
        return self._submit(
            "sync_daily_attendance",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "week": week,
                "week_monday": week_monday,
                "week_friday": week_friday,
                "user_ids": user_ids,
                "operator_user_id": operator_user_id,
            },
            queue="feishu_sync",
        )

    def sync_seminar_attendance(
        self,
        *,
        run_id: UUID,
        week: int,
        seminar_date: str,
        check_time_from: int,
        check_time_to: int,
        user_ids: list[str],
        user_id_to_name: Dict[str, str],
    ) -> str:
        return self._submit(
            "sync_seminar_attendance",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "week": week,
                "seminar_date": seminar_date,
                "check_time_from": check_time_from,
                "check_time_to": check_time_to,
                "user_ids": user_ids,
                "user_id_to_name": user_id_to_name,
            },
            queue="feishu_sync",
        )

    def sync_seminar_leaves(
        self,
        *,
        run_id: UUID,
        app_token: str,
        table_id: str,
        week: int,
    ) -> str:
        return self._submit(
            "sync_seminar_leaves",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "app_token": app_token,
                "table_id": table_id,
                "week": week,
            },
            queue="feishu_sync",
        )

    def sync_schedule(
        self,
        *,
        run_id: UUID,
        app_token: str,
        table_id: str,
    ) -> str:
        return self._submit(
            "sync_schedule",
            {
                "webhook_url": f"{self.webhook_base_url}/api/webhooks/jobs/{run_id}",
                "app_token": app_token,
                "table_id": table_id,
            },
            queue="feishu_sync",
        )

    def solve_group_meeting(
        self,
        *,
        plan_id: UUID,
        name_list: list[str],
        slots: list[Dict[str, Any]],
        busy_pairs: list[list[int]],
        already_grouped: list[list[str]],
        weights: Optional[Dict[str, int]] = None,
    ) -> str:
        return self._submit(
            "solve_group_meeting",
            {
                "webhook_url": (
                    f"{self.webhook_base_url}/api/webhooks/group-meeting/{plan_id}"
                ),
                "name_list": name_list,
                "slots": slots,
                "busy_pairs": busy_pairs,
                "already_grouped": already_grouped,
                "weights": weights,
            },
            queue="feishu_sync",
        )

    def send_message(
        self,
        *,
        notification_id: UUID,
        receive_id: str,
        msg_type: str,
        title: Optional[str],
        content: Any,
        receive_id_type: str = "open_id",
    ) -> str:
        return self._submit(
            "send_feishu_message",
            {
                "webhook_url": (
                    f"{self.webhook_base_url}/api/webhooks/notifications/{notification_id}"
                ),
                "receive_id": receive_id,
                "msg_type": msg_type,
                "title": title,
                "content": content,
                "receive_id_type": receive_id_type,
            },
            queue="message_send",
        )


feishu_jobs = FeishuJobsClient()
