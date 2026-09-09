"""Shared connection defaults for the Celery jobs service."""

import os

DEFAULT_CELERY_BROKER_URL = "pyamqp://guest@localhost:5672//"
DEFAULT_WEBHOOK_BASE_URL = "http://localhost:8000"
DEFAULT_CELERY_API_URL = "http://localhost:8001"


def get_celery_broker_url(override: str | None = None) -> str:
    return override or os.getenv("CELERY_BROKER_URL", DEFAULT_CELERY_BROKER_URL)


def get_webhook_base_url(override: str | None = None) -> str:
    return override or os.getenv("WEBHOOK_BASE_URL", DEFAULT_WEBHOOK_BASE_URL)


def get_celery_api_url(override: str | None = None) -> str:
    return override or os.getenv("CELERY_API_URL", DEFAULT_CELERY_API_URL)
