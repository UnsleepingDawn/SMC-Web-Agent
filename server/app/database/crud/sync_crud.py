"""Sync run tracking so the UI can poll long-running Feishu pulls."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import SyncRun
from pydantic import BaseModel
from sqlalchemy.orm import Session

STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
TERMINAL_STATUSES = (STATUS_COMPLETED, STATUS_FAILED)


class SyncRunCreate(BaseModel):
    task_name: str
    semester_id: Optional[UUID] = None
    week: Optional[int] = None
    status: str = STATUS_PENDING
    job_id: Optional[str] = None
    payload: Dict[str, Any] = {}


class SyncRunUpdate(BaseModel):
    status: Optional[str] = None
    error: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    job_id: Optional[str] = None


class CRUDSyncRun(CRUDBase[SyncRun, SyncRunCreate, SyncRunUpdate]):
    def list_recent(self, db: Session, *, limit: int = 20) -> List[SyncRun]:
        return db.query(SyncRun).order_by(SyncRun.created_at.desc()).limit(limit).all()

    def mark_running(self, db: Session, *, run: SyncRun, job_id: str) -> SyncRun:
        run.status = STATUS_RUNNING
        run.job_id = job_id
        run.started_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    def mark_completed(
        self, db: Session, *, run: SyncRun, payload: Optional[Dict[str, Any]] = None
    ) -> SyncRun:
        run.status = STATUS_COMPLETED
        run.completed_at = datetime.now(timezone.utc)
        if payload is not None:
            run.payload = payload
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    def mark_failed(self, db: Session, *, run: SyncRun, error: str) -> SyncRun:
        run.status = STATUS_FAILED
        run.error = error
        run.completed_at = datetime.now(timezone.utc)
        db.add(run)
        db.commit()
        db.refresh(run)
        return run


sync_run = CRUDSyncRun(SyncRun)
