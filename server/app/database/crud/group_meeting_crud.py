"""Group meeting (BILP) plan requests and their solver results."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import GroupMeetingDraft, GroupMeetingPlan
from app.schemas.user import CurrentUser
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


class GroupMeetingDraftCreate(BaseModel):
    semester_id: UUID
    user_id: Optional[UUID] = None
    name_list: List[str] = []
    already_grouped: List[List[str]] = []
    meeting_periods: List[str] = []


class CRUDGroupMeetingDraft(
    CRUDBase[GroupMeetingDraft, GroupMeetingDraftCreate, BaseModel]
):
    def upsert(
        self,
        db: Session,
        *,
        user: CurrentUser,
        semester_id: UUID,
        name_list: List[str],
        already_grouped: List[List[str]],
        meeting_periods: List[str],
    ) -> Optional[GroupMeetingDraft]:
        """Replace the user's saved selection for the semester, creating it once."""
        draft = self.get_by(db, user=user, semester_id=semester_id)
        if not draft:
            return self.create(
                db,
                user=user,
                obj_in=GroupMeetingDraftCreate(
                    semester_id=semester_id,
                    name_list=name_list,
                    already_grouped=already_grouped,
                    meeting_periods=meeting_periods,
                ),
            )
        draft.name_list = name_list
        draft.already_grouped = already_grouped
        draft.meeting_periods = meeting_periods
        db.add(draft)
        db.commit()
        db.refresh(draft)
        return draft


group_meeting_draft = CRUDGroupMeetingDraft(GroupMeetingDraft)
