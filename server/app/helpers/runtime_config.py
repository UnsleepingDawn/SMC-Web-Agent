"""Encrypted Feishu credentials that the operator can change without redeploying."""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Any, Dict

from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

from app.database.models import RuntimeConfig

logger = logging.getLogger(__name__)

SUPPORTED_KEYS = ("feishu_app_id", "feishu_app_secret")
SECRET_KEYS = {"feishu_app_secret"}

# Admin who receives a dry run before the weekly-report push reaches teachers.
# The teachers themselves are not configured here: they come from the address
# book's Tenure department (see ``member_crud.teacher_department_name``).
WEEKLY_PUSH_ADMIN_KEY = "weekly_push_admin_open_id"
WEEKLY_PUSH_KEYS = (WEEKLY_PUSH_ADMIN_KEY,)

# The lab member who reviews the teacher push before it goes out. Used when
# neither the settings page nor ``SMC_ADMIN_OPEN_ID`` provides a target.
DEFAULT_WEEKLY_PUSH_ADMIN_OPEN_ID = "ou_1df99022ddb02b52947cd7a76f42df3b"


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


def _read_values(db: Session, keys: tuple[str, ...]) -> Dict[str, str]:
    """Decrypt the stored values for ``keys``; missing keys are absent."""
    rows = (
        db.query(RuntimeConfig).filter(RuntimeConfig.key.in_(keys)).all()
    )
    values: Dict[str, str] = {}
    for row in rows:
        try:
            values[row.key] = _fernet().decrypt(row.encrypted_value.encode()).decode()
        except Exception:  # pragma: no cover - corrupted row should not 500
            logger.warning("Failed to decrypt runtime config %s", row.key)
    return values


def _write_values(db: Session, values: Dict[str, Any]) -> None:
    """Encrypt and upsert ``values``; empty values remove the stored row."""
    cipher = _fernet()
    for key, value in values.items():
        row = db.query(RuntimeConfig).filter(RuntimeConfig.key == key).one_or_none()
        text = "" if value is None else str(value).strip()
        if not text:
            if row:
                db.delete(row)
            continue
        encrypted = cipher.encrypt(text.encode()).decode()
        if row:
            row.encrypted_value = encrypted
        else:
            db.add(RuntimeConfig(key=key, encrypted_value=encrypted))
    db.commit()


def get_weekly_push_admin_open_id(db: Session) -> str:
    """The admin target for the teacher-push dry run.

    Precedence: the settings page, then ``SMC_ADMIN_OPEN_ID``, then the built-in
    default, so the review step works out of the box.
    """
    values = _read_values(db, WEEKLY_PUSH_KEYS)
    return (
        values.get(WEEKLY_PUSH_ADMIN_KEY, "").strip()
        or os.getenv("SMC_ADMIN_OPEN_ID", "").strip()
        or DEFAULT_WEEKLY_PUSH_ADMIN_OPEN_ID
    )


def set_weekly_push_admin_open_id(db: Session, admin_open_id: str) -> None:
    _write_values(db, {WEEKLY_PUSH_ADMIN_KEY: admin_open_id.strip()})
