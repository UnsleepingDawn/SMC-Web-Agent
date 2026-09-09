"""Notification history and Feishu credential status."""

from __future__ import annotations

import logging

from app.auth.dependencies import get_required_user
from app.database.crud.notification_crud import notification as notification_crud
from app.database.database import get_db
from app.helpers.runtime_config import (
    get_feishu_config,
    public_feishu_config,
    set_feishu_config,
)
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

notification_router = APIRouter()
settings_router = APIRouter()


class FeishuConfigRequest(BaseModel):
    app_id: str
    app_secret: str = ""


@notification_router.get("")
def list_notifications(
    limit: int = 50,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = notification_crud.list_recent(db, limit=min(limit, 200))
    return {"notifications": [row.to_dict() for row in rows]}


@settings_router.get("/feishu")
def read_feishu_config(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    return public_feishu_config(get_feishu_config(db))


@settings_router.put("/feishu")
def write_feishu_config(
    payload: FeishuConfigRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    set_feishu_config(
        db,
        {"feishu_app_id": payload.app_id, "feishu_app_secret": payload.app_secret},
    )
    return public_feishu_config(get_feishu_config(db))
