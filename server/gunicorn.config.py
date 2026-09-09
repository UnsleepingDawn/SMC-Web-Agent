import multiprocessing
import os

from app.logging_config import build_formatter

port = os.getenv("PORT", "8000")
bind = f"0.0.0.0:{port}"

# Recommended: (2 * number of CPU cores) + 1
workers = (multiprocessing.cpu_count() * 2) + 1

worker_class = "uvicorn.workers.UvicornWorker"

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# Workers pick up the shared format when they import the app, but the arbiter
# never does — and the arbiter is what reports worker timeouts and SIGKILLs.
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"smc": {"()": build_formatter}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "smc",
            "stream": "ext://sys.stderr",
        }
    },
    "root": {"level": loglevel.upper(), "handlers": ["console"]},
    "loggers": {
        "gunicorn.error": {
            "level": loglevel.upper(),
            "handlers": ["console"],
            "propagate": False,
        },
        "gunicorn.access": {
            "level": "INFO",
            "handlers": ["console"],
            "propagate": False,
        },
    },
}

timeout = 300
keepalive = 30
worker_connections = 1000
threads = 1

forwarded_allow_ips = "*"
proxy_headers = True
