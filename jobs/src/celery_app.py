"""Celery application configuration and periodic schedules."""

import logging
import os

from celery import Celery  # type: ignore
from celery.signals import setup_logging  # type: ignore
from celery.schedules import crontab  # type: ignore
from dotenv import load_dotenv

from src.logging_config import configure_logging

load_dotenv()

logger = logging.getLogger(__name__)


@setup_logging.connect
def configure_celery_logging(**_kwargs):
    """Skip Celery's own log config so worker, beat and tasks share one format."""
    configure_logging()


BROKER_URL = os.getenv("CELERY_BROKER_URL", "pyamqp://guest@localhost:5672//")
BACKEND_URL = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

celery_app = Celery(
    "smc_tasks",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["src.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Schedules are written in Beijing time, which is how the lab reads them.
    timezone="Asia/Shanghai",
    enable_utc=False,
    result_expires=3600,
    task_routes={
        "sync_members": {"queue": "feishu_sync"},
        "sync_seminar": {"queue": "feishu_sync"},
        "sync_weekly_reports": {"queue": "feishu_sync"},
        "sync_attendance_group": {"queue": "feishu_sync"},
        "sync_daily_attendance": {"queue": "feishu_sync"},
        "sync_seminar_attendance": {"queue": "feishu_sync"},
        "sync_seminar_leaves": {"queue": "feishu_sync"},
        "sync_schedule": {"queue": "feishu_sync"},
        "solve_group_meeting": {"queue": "feishu_sync"},
        "send_feishu_message": {"queue": "message_send"},
    },
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    reject_on_worker_lost=True,
    task_acks_on_failure_or_timeout=True,
    worker_max_tasks_per_child=1000,
    worker_send_task_events=True,
    task_send_sent_event=True,
    broker_heartbeat=30,
    broker_heartbeat_checkrate=2.0,
    worker_disable_rate_limits=True,
    worker_max_memory_per_child=500000,
)


def _parse_schedule(expression: str, fallback: str) -> crontab:
    """Parse "<weekday|day|monthly> HH:MM" into a Celery crontab.

    ``weekday`` is one of mon/tue/wed/thu/fri/sat/sun; ``day`` means every day;
    ``monthly`` means the 1st of every month.
    """
    text = (expression or fallback).strip().lower()
    parts = text.split()
    if len(parts) != 2 or ":" not in parts[1]:
        raise ValueError(f"Invalid schedule {expression!r}; expected '<weekday|day|monthly> HH:MM'")

    day, clock = parts
    hour_text, minute_text = clock.split(":", 1)
    hour, minute = int(hour_text), int(minute_text)

    if day == "day":
        return crontab(minute=minute, hour=hour)
    if day == "monthly":
        return crontab(minute=minute, hour=hour, day_of_month=1)
    if day not in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
        raise ValueError(f"Invalid weekday {day!r} in schedule {expression!r}")
    return crontab(minute=minute, hour=hour, day_of_week=day)


celery_app.conf.beat_schedule = {
    "seminar-preview": {
        "task": "send_scheduled_seminar_preview",
        "schedule": _parse_schedule(
            os.getenv("SEMINAR_PREVIEW_SCHEDULE", "mon 01:26"), "mon 01:26"
        ),
    },
    "weekly-summary": {
        "task": "send_scheduled_weekly_summary",
        "schedule": _parse_schedule(
            os.getenv("WEEKLY_SUMMARY_SCHEDULE", "mon 01:40"), "mon 01:40"
        ),
    },
    "monthly-placeholder": {
        "task": "monthly_placeholder",
        "schedule": _parse_schedule(
            os.getenv("MONTHLY_TASK_SCHEDULE", "day 12:00"), "day 12:00"
        ),
    },
}

celery_app.autodiscover_tasks()

if __name__ == "__main__":
    celery_app.start()
