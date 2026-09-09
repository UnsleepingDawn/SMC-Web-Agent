"""Weekly report CRUD and the submitted/missing split."""

from typing import Any, Dict, List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Member, WeeklyReport
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

    def submitted_and_missing(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> tuple[List[WeeklyReport], List[Member]]:
        """Submitted rows plus the expected-but-missing members for the week."""
        submitted = self.list_by_week(db, semester_id=semester_id, week=week)
        submitted_names = {row.member_name for row in submitted}
        expected = (
            db.query(Member)
            .filter(Member.need_attendance.is_(True), Member.is_active.is_(True))
            .order_by(Member.name)
            .all()
        )
        missing = [m for m in expected if m.name not in submitted_names]
        return submitted, missing


weekly_report = CRUDWeeklyReport(WeeklyReport)
