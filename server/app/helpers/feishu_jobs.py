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
