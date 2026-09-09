"""Logging setup for the Celery workers and the status API.

Mirrored from server/app/logging_config.py; the two services deploy
independently and so cannot share a module.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

TEXT_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
DEFAULT_SERVICE = "jobs"

_RESERVED_RECORD_FIELDS = frozenset(
    {
        "args",
        "asctime",
        "color_message",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)

_FRAMEWORK_LOGGERS = (
    "uvicorn",
    "uvicorn.access",
    "uvicorn.error",
    "celery",
    "celery.worker",
    "celery.beat",
)
_ACCESS_LOGGERS = ("uvicorn.access",)
_HEALTH_PATHS = frozenset({"/health"})


class HealthCheckFilter(logging.Filter):
    """Drop access-log records for health probes."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3:
            return str(args[2]).split("?", 1)[0] not in _HEALTH_PATHS
        return True


class JsonFormatter(logging.Formatter):
    """Render a record as one JSON line, traceback included."""

    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname,
            "service": self.service,
            "logger": record.name,
            "process": record.processName,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        extra = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED_RECORD_FIELDS
        }
        if extra:
            payload["extra"] = extra
        return json.dumps(payload, default=str)


def build_formatter() -> logging.Formatter:
    if os.getenv("DEBUG", "False").lower() in ("true", "1", "t"):
        return logging.Formatter(TEXT_FORMAT, DATE_FORMAT)
    return JsonFormatter(os.getenv("SERVICE_NAME", DEFAULT_SERVICE))


def configure_logging(level: int | str | None = None) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(build_formatter())
    logging.basicConfig(
        level=level or os.getenv("LOG_LEVEL", "INFO"),
        handlers=[handler],
        force=True,
    )
    for name in _FRAMEWORK_LOGGERS:
        framework_logger = logging.getLogger(name)
        framework_logger.handlers.clear()
        framework_logger.propagate = True

    for name in _ACCESS_LOGGERS:
        access_logger = logging.getLogger(name)
        access_logger.filters.clear()
        access_logger.addFilter(HealthCheckFilter())
