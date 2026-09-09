"""Semester CRUD plus the current-week lookup used by the UI."""

from datetime import date
from typing import List, Optional

from app.database.crud.base_crud import CRUDBase
from app.database.models import Semester
from app.helpers.semester_calendar import semester_week
from pydantic import BaseModel
from sqlalchemy.orm import Session


class SemesterCreate(BaseModel):
    name: str
    start_date: date
    default_seminar_weekday: int = 4
    default_seminar_start_time: str = "1900"
    default_seminar_end_time: str = "2030"
    default_seminar_tencent_id: Optional[str] = None
    default_seminar_tencent_link: Optional[str] = None
    is_active: bool = True
    weekly_report_app_token: Optional[str] = None
    weekly_report_table_id: Optional[str] = None
    weekly_report_url: Optional[str] = None
    schedule_app_token: Optional[str] = None
    schedule_table_id: Optional[str] = None
    schedule_url: Optional[str] = None
    seminar_app_token: Optional[str] = None
    seminar_table_id: Optional[str] = None
    seminar_url: Optional[str] = None
    seminar_leave_app_token: Optional[str] = None
    seminar_leave_table_id: Optional[str] = None
    seminar_leave_url: Optional[str] = None


class SemesterUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    default_seminar_weekday: Optional[int] = None
    default_seminar_start_time: Optional[str] = None
    default_seminar_end_time: Optional[str] = None
    default_seminar_tencent_id: Optional[str] = None
    default_seminar_tencent_link: Optional[str] = None
    is_active: Optional[bool] = None
    weekly_report_app_token: Optional[str] = None
    weekly_report_table_id: Optional[str] = None
    weekly_report_url: Optional[str] = None
    schedule_app_token: Optional[str] = None
    schedule_table_id: Optional[str] = None
    schedule_url: Optional[str] = None
    seminar_app_token: Optional[str] = None
    seminar_table_id: Optional[str] = None
    seminar_url: Optional[str] = None
    seminar_leave_app_token: Optional[str] = None
    seminar_leave_table_id: Optional[str] = None
    seminar_leave_url: Optional[str] = None


class CRUDSemester(CRUDBase[Semester, SemesterCreate, SemesterUpdate]):
    def list_ordered(self, db: Session) -> List[Semester]:
        return db.query(Semester).order_by(Semester.start_date.desc()).all()

    def get_current(self, db: Session, on: date | None = None) -> Optional[Semester]:
        """The semester whose start date is the latest one not after ``on``."""
        on = on or date.today()
        return (
            db.query(Semester)
            .filter(Semester.start_date <= on)
            .order_by(Semester.start_date.desc())
            .first()
        )

    def current_week(self, db: Session, on: date | None = None) -> Optional[int]:
        semester = self.get_current(db, on)
        if not semester:
            return None
        return semester_week(semester.start_date, on)


semester = CRUDSemester(Semester)
