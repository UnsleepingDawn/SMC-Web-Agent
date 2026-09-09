"""Encrypted Feishu credentials that the operator can change without redeploying."""

from __future__ import annotations

import base64
import hashlib
import os
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.database.models import RuntimeConfig

SUPPORTED_KEYS = ("feishu_app_id", "feishu_app_secret")
SECRET_KEYS = {"feishu_app_secret"}


def _fernet() -> Fernet:
    secret = os.getenv("SMC_ENCRYPTION_KEY", "").strip()
    if not secret:
        raise RuntimeError("SMC_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(secret.encode())
    except Exception:
        # Accept a strong arbitrary bootstrap secret while keeping the stored key
        # format compatible with Fernet.
        digest = hashlib.sha256(secret.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def _env_key(key: str) -> str:
    return {
        "feishu_app_id": "FEISHU_APP_ID",
        "feishu_app_secret": "FEISHU_APP_SECRET",
    }[key]


def get_feishu_config(db: Session) -> dict[str, str]:
    """Stored values first, then environment variables."""
    rows = db.query(RuntimeConfig).all()
    values = {
        row.key: _fernet().decrypt(row.encrypted_value.encode()).decode()
        for row in rows
        if row.key in SUPPORTED_KEYS
    }
    for key in SUPPORTED_KEYS:
        values.setdefault(key, os.getenv(_env_key(key), ""))
    return values


def set_feishu_config(db: Session, values: dict[str, Any]) -> None:
    cipher = _fernet()
    for key, value in values.items():
        if key not in SUPPORTED_KEYS or value is None:
            continue
        text = str(value).strip()
        if key in SECRET_KEYS and not text:
            continue
        row = db.query(RuntimeConfig).filter(RuntimeConfig.key == key).one_or_none()
        encrypted = cipher.encrypt(text.encode()).decode()
        if row:
            row.encrypted_value = encrypted
        else:
            db.add(RuntimeConfig(key=key, encrypted_value=encrypted))
    db.commit()


def public_feishu_config(values: dict[str, str]) -> dict[str, Any]:
    """Never returns the secret itself, only whether one is configured."""
    return {
        "app_id": values.get("feishu_app_id", ""),
        "app_secret_configured": bool(values.get("feishu_app_secret", "").strip()),
        "configured": bool(
            values.get("feishu_app_id", "").strip()
            and values.get("feishu_app_secret", "").strip()
        ),
    }
