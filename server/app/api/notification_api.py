"""Notification history and Feishu credential status."""

from __future__ import annotations

import logging
from typing import Any, Dict

from app.auth.dependencies import get_required_user
from app.database.crud.attendance_crud import attendance_group as attendance_group_crud
from app.database.crud.member_crud import member as member_crud
from app.database.crud.notification_crud import notification as notification_crud
from app.database.database import get_db
from app.database.models import Member
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

RECENT_RECIPIENT_LIMIT = 3


class FeishuConfigRequest(BaseModel):
    app_id: str
    app_secret: str = ""


def _member_recipient(member: Member) -> Dict[str, Any]:
    return {
        "receive_id": member.feishu_account,
        "receive_id_type": "open_id",
        "name": member.name,
        "kind": "user",
        "subtitle": " · ".join(
            part for part in (member.grade, member.advisor) if part
        ),
    }


def _recent_recipient(db: Session, target: str) -> Dict[str, Any]:
    """Give a stored push target a display name, falling back to the raw ID."""
    member = member_crud.get_by_feishu_account(db, feishu_account=target)
    if member:
        return _member_recipient(member)

    group = attendance_group_crud.get_by_feishu_group_id(db, feishu_group_id=target)
    if group:
        return {
            "receive_id": target,
            "receive_id_type": "chat_id",
            "name": group.name,
            "kind": "chat",
            "subtitle": "群聊",
        }

    is_chat = target.startswith("oc_")
    return {
        "receive_id": target,
        "receive_id_type": "chat_id" if is_chat else "open_id",
        "name": target,
        "kind": "chat" if is_chat else "user",
        "subtitle": "群聊" if is_chat else "",
    }


@notification_router.get("")
def list_notifications(
    limit: int = 50,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = notification_crud.list_recent(db, limit=min(limit, 200))
    return {"notifications": [row.to_dict() for row in rows]}


@notification_router.get("/recipients")
def search_recipients(
    search: str = "",
    limit: int = 20,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Empty ``search`` returns the last few targets; otherwise name matches."""
    text = search.strip()
    if not text:
        targets = notification_crud.list_recent_targets(
            db, limit=RECENT_RECIPIENT_LIMIT
        )
        return {"recipients": [_recent_recipient(db, target) for target in targets]}

    members = member_crud.list_recipients(db, search=text, limit=min(limit, 50))
    return {"recipients": [_member_recipient(member) for member in members]}


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
