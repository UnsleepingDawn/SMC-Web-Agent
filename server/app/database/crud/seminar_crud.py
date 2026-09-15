"""Seminar CRUD: one row per occurrence, talks stored as child rows."""

from typing import List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Seminar, SeminarPresentation
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload


class PresentationInput(BaseModel):
    track: int
    presenter_name: str
    title: str
    abstract: Optional[str] = None


class SeminarCreate(BaseModel):
    semester_id: UUID
    week: int
    weekday: int
    happened: bool = False
    room: Optional[str] = None
    offline_advisor: Optional[str] = None


class SeminarUpdate(BaseModel):
    week: Optional[int] = None
    weekday: Optional[int] = None
    happened: Optional[bool] = None
    room: Optional[str] = None
    offline_advisor: Optional[str] = None


class CRUDSeminar(CRUDBase[Seminar, SeminarCreate, SeminarUpdate]):
    def list_by_semester(self, db: Session, *, semester_id: UUID) -> List[Seminar]:
        return (
            db.query(Seminar)
            .options(joinedload(Seminar.presentations))
            .filter(Seminar.semester_id == semester_id)
            .order_by(Seminar.week, Seminar.weekday, Seminar.happened)
            .all()
        )

    def get_slot(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        weekday: int,
        happened: bool,
    ) -> Optional[Seminar]:
        return (
            db.query(Seminar)
            .filter(
                Seminar.semester_id == semester_id,
                Seminar.week == week,
                Seminar.weekday == weekday,
                Seminar.happened.is_(happened),
            )
            .first()
        )

    def replace_presentations(
        self, db: Session, *, seminar: Seminar, presentations: List[PresentationInput]
    ) -> Seminar:
        """Rewrite a seminar's talks in one transaction, ordered by their track."""
        db.query(SeminarPresentation).filter(
            SeminarPresentation.seminar_id == seminar.id
        ).delete(synchronize_session=False)
        for item in sorted(presentations, key=lambda p: p.track):
            db.add(
                SeminarPresentation(
                    seminar_id=seminar.id,
                    track=item.track,
                    presenter_name=item.presenter_name,
                    title=item.title,
                    abstract=item.abstract,
                )
            )
        db.commit()
        db.refresh(seminar)
        return seminar


seminar = CRUDSeminar(Seminar)
