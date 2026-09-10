"""Notification history for Feishu messages we rendered and sent."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.database.crud.base_crud import CRUDBase
from app.database.models import Notification
from pydantic import BaseModel
from sqlalchemy.orm import Session


class NotificationCreate(BaseModel):
    channel: str = "feishu"
    template_key: str
    target: str
    payload: Dict[str, Any] = {}
    status: str = "pending"


class NotificationUpdate(BaseModel):
    status: Optional[str] = None
    error: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class CRUDNotification(CRUDBase[Notification, NotificationCreate, NotificationUpdate]):
    def list_recent(self, db: Session, *, limit: int = 50) -> List[Notification]:
        return (
            db.query(Notification).order_by(Notification.created_at.desc()).limit(limit).all()
        )

    def list_recent_targets(self, db: Session, *, limit: int = 3) -> List[str]:
        """The most recent distinct push targets, newest first."""
        rows = (
            db.query(Notification.target)
            .order_by(Notification.created_at.desc())
            .limit(200)
            .all()
        )
        targets: List[str] = []
        for (target,) in rows:
            if target and target not in targets:
                targets.append(target)
            if len(targets) >= limit:
                break
        return targets

    def mark_sent(self, db: Session, *, notification: Notification) -> Notification:
        notification.status = "sent"
        notification.sent_at = datetime.now(timezone.utc)
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification

    def mark_failed(
        self, db: Session, *, notification: Notification, error: str
    ) -> Notification:
        notification.status = "failed"
        notification.error = error
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification


notification = CRUDNotification(Notification)
