"""Read the encrypted Feishu credentials the server stores.

Mirrored from server/app/helpers/runtime_config.py; the two services deploy
independently and so cannot share a module.
"""

from __future__ import annotations

import base64
import hashlib
import os

import psycopg2
from cryptography.fernet import Fernet

SUPPORTED_KEYS = ("feishu_app_id", "feishu_app_secret")


def _fernet() -> Fernet:
    secret = os.getenv("SMC_ENCRYPTION_KEY", "").strip()
    if not secret:
        raise RuntimeError("SMC_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(secret.encode())
    except Exception:
        digest = hashlib.sha256(secret.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def get_feishu_credentials() -> tuple[str, str]:
    """Stored values first, then environment variables."""
    values: dict[str, str] = {}
    with psycopg2.connect(os.environ["DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT key, encrypted_value FROM runtime_configs")
            for key, encrypted_value in cursor.fetchall():
                if key in SUPPORTED_KEYS:
                    values[key] = _fernet().decrypt(encrypted_value.encode()).decode()

    app_id = values.get("feishu_app_id") or os.getenv("FEISHU_APP_ID", "")
    app_secret = values.get("feishu_app_secret") or os.getenv("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        raise RuntimeError(
            "Feishu credentials are not configured; set them in 设置 or in .env"
        )
    return app_id, app_secret
