"""Group meeting (BILP) plan requests and their solver results."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import GroupMeetingPlan
from pydantic import BaseModel
from sqlalchemy.orm import Session

STATUS_PENDING = "pending"
STATUS_SOLVING = "solving"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
TERMINAL_STATUSES = (STATUS_COMPLETED, STATUS_FAILED)


class GroupMeetingPlanCreate(BaseModel):
    semester_id: Optional[UUID] = None
    status: str = STATUS_PENDING
    job_id: Optional[str] = None
    params: Dict[str, Any] = {}


class GroupMeetingPlanUpdate(BaseModel):
    status: Optional[str] = None
    job_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    validation: Optional[Dict[str, Any]] = None
    solver_status: Optional[str] = None
    error: Optional[str] = None


class CRUDGroupMeetingPlan(
    CRUDBase[GroupMeetingPlan, GroupMeetingPlanCreate, GroupMeetingPlanUpdate]
):
    def list_recent(self, db: Session, *, limit: int = 20) -> List[GroupMeetingPlan]:
        return (
            db.query(GroupMeetingPlan)
            .order_by(GroupMeetingPlan.created_at.desc())
            .limit(limit)
            .all()
        )

    def mark_solving(
        self, db: Session, *, plan: GroupMeetingPlan, job_id: str
    ) -> GroupMeetingPlan:
        plan.status = STATUS_SOLVING
        plan.job_id = job_id
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan

    def mark_completed(
        self,
        db: Session,
        *,
        plan: GroupMeetingPlan,
        result: Dict[str, Any],
        validation: Dict[str, Any],
        solver_status: Optional[str],
    ) -> GroupMeetingPlan:
        plan.status = STATUS_COMPLETED
        plan.result = result
        plan.validation = validation
        plan.solver_status = solver_status
        plan.error = None
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan

    def mark_failed(
        self,
        db: Session,
        *,
        plan: GroupMeetingPlan,
        error: str,
        solver_status: Optional[str] = None,
    ) -> GroupMeetingPlan:
        plan.status = STATUS_FAILED
        plan.error = error
        plan.solver_status = solver_status
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan


group_meeting_plan = CRUDGroupMeetingPlan(GroupMeetingPlan)
