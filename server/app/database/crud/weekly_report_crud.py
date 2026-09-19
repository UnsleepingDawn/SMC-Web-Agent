"""Weekly report CRUD and the submitted/missing split."""

from typing import Any, Dict, List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Member, WeeklyPushDraft, WeeklyReport
from app.schemas.user import CurrentUser
from pydantic import BaseModel
from sqlalchemy.orm import Session


class WeeklyReportCreate(BaseModel):
    semester_id: UUID
    week: int
    member_name: str
    doc_link: Optional[str] = None
    attachments: List[Dict[str, Any]] = []
    record_id: Optional[str] = None


class WeeklyReportUpdate(BaseModel):
    doc_link: Optional[str] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    member_name: Optional[str] = None


class CRUDWeeklyReport(CRUDBase[WeeklyReport, WeeklyReportCreate, WeeklyReportUpdate]):
    def list_by_week(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> List[WeeklyReport]:
        return (
            db.query(WeeklyReport)
            .filter(WeeklyReport.semester_id == semester_id, WeeklyReport.week == week)
            .order_by(WeeklyReport.member_name)
            .all()
        )

    def expected_members(self, db: Session) -> List[Member]:
        """Who is expected to submit: active members flagged for attendance."""
        return (
            db.query(Member)
            .filter(Member.need_attendance.is_(True), Member.is_active.is_(True))
            .order_by(Member.name)
            .all()
        )

    def weeks_by_member(
        self, db: Session, *, semester_id: UUID
    ) -> Dict[str, set]:
        """The weeks each member has a report for, keyed by name."""
        weeks: Dict[str, set] = {}
        rows = (
            db.query(WeeklyReport.member_name, WeeklyReport.week)
            .filter(WeeklyReport.semester_id == semester_id)
            .all()
        )
        for member_name, week in rows:
            weeks.setdefault(member_name, set()).add(week)
        return weeks

    def submitted_and_missing(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> tuple[List[WeeklyReport], List[Member]]:
        """Submitted rows plus the expected-but-missing members for the week."""
        submitted = self.list_by_week(db, semester_id=semester_id, week=week)
        submitted_names = {row.member_name for row in submitted}
        expected = self.expected_members(db)
        missing = [m for m in expected if m.name not in submitted_names]
        return submitted, missing


weekly_report = CRUDWeeklyReport(WeeklyReport)


class WeeklyPushDraftCreate(BaseModel):
    semester_id: UUID
    user_id: Optional[UUID] = None
    teacher_names: List[str] = []
    expanded_teachers: List[str] = []


class CRUDWeeklyPushDraft(
    CRUDBase[WeeklyPushDraft, WeeklyPushDraftCreate, BaseModel]
):
    def upsert(
        self,
        db: Session,
        *,
        user: CurrentUser,
        semester_id: UUID,
        teacher_names: List[str],
        expanded_teachers: List[str],
    ) -> Optional[WeeklyPushDraft]:
        """Replace the user's saved selection for the semester, creating it once."""
        draft = self.get_by(db, user=user, semester_id=semester_id)
        if not draft:
            return self.create(
                db,
                user=user,
                obj_in=WeeklyPushDraftCreate(
                    semester_id=semester_id,
                    teacher_names=teacher_names,
                    expanded_teachers=expanded_teachers,
                ),
            )

        draft.teacher_names = teacher_names
        draft.expanded_teachers = expanded_teachers
        db.add(draft)
        db.commit()
        db.refresh(draft)
        return draft


weekly_push_draft = CRUDWeeklyPushDraft(WeeklyPushDraft)
