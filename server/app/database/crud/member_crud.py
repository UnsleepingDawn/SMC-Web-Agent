"""Member master data queries."""

from typing import List, Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Member
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session


class MemberCreate(BaseModel):
    name: str
    grade: Optional[str] = None
    advisor: Optional[str] = None
    advisor_user_id: Optional[str] = None
    cultivation_type: Optional[str] = None
    enrollment_status: Optional[str] = None
    feishu_account: Optional[str] = None
    student_id: Optional[str] = None
    union_id: Optional[str] = None
    feishu_user_id: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    need_attendance: bool = False
    is_active: bool = True


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    grade: Optional[str] = None
    advisor: Optional[str] = None
    advisor_user_id: Optional[str] = None
    cultivation_type: Optional[str] = None
    enrollment_status: Optional[str] = None
    feishu_account: Optional[str] = None
    student_id: Optional[str] = None
    union_id: Optional[str] = None
    feishu_user_id: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    need_attendance: Optional[bool] = None
    is_active: Optional[bool] = None


class CRUDMember(CRUDBase[Member, MemberCreate, MemberUpdate]):
    def list_filtered(
        self,
        db: Session,
        *,
        search: Optional[str] = None,
        advisor: Optional[str] = None,
        grade: Optional[str] = None,
        enrollment_status: Optional[str] = None,
        need_attendance: Optional[bool] = None,
        is_active: Optional[bool] = None,
    ) -> List[Member]:
        query = db.query(Member)
        if search:
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Member.name.ilike(pattern),
                    Member.student_id.ilike(pattern),
                    Member.advisor.ilike(pattern),
                )
            )
        if advisor:
            query = query.filter(Member.advisor == advisor)
        if grade:
            query = query.filter(Member.grade == grade)
        if enrollment_status:
            query = query.filter(Member.enrollment_status == enrollment_status)
        if need_attendance is not None:
            query = query.filter(Member.need_attendance.is_(need_attendance))
        if is_active is not None:
            query = query.filter(Member.is_active.is_(is_active))
        return query.order_by(Member.name).all()

    def get_by_feishu_account(
        self, db: Session, *, feishu_account: str
    ) -> Optional[Member]:
        return (
            db.query(Member).filter(Member.feishu_account == feishu_account).first()
        )

    def get_by_name(self, db: Session, *, name: str) -> Optional[Member]:
        return db.query(Member).filter(Member.name == name).first()

    def list_recipients(
        self, db: Session, *, search: str, limit: int = 20
    ) -> List[Member]:
        """Active members whose name matches and who carry a Feishu open_id."""
        pattern = f"%{search.strip()}%"
        return (
            db.query(Member)
            .filter(
                Member.name.ilike(pattern),
                Member.feishu_account.isnot(None),
                Member.feishu_account != "",
            )
            .order_by(Member.name)
            .limit(limit)
            .all()
        )

    def get_by_feishu_user_id(
        self, db: Session, *, feishu_user_id: str
    ) -> Optional[Member]:
        return (
            db.query(Member).filter(Member.feishu_user_id == feishu_user_id).first()
        )

    def mark_need_attendance(self, db: Session, *, member_ids: List[UUID]) -> int:
        """Flag the given members as expected to attendance, in one transaction."""
        if not member_ids:
            return 0
        updated = (
            db.query(Member)
            .filter(Member.id.in_(member_ids))
            .update({Member.need_attendance: True}, synchronize_session=False)
        )
        db.commit()
        return int(updated)
    
    def distinct_values(self, db: Session, column: str) -> List[str]:
        columns = {
            "advisor": Member.advisor,
            "grade": Member.grade,
            "enrollment_status": Member.enrollment_status,
        }
        if column not in columns:
            raise ValueError(f"Cannot list distinct values for {column}")
        field = columns[column]
        rows = (
            db.query(field)
            .filter(field.isnot(None), field != "")
            .distinct()
            .order_by(field)
            .all()
        )
        return [row[0] for row in rows]

    def list_need_attendance(self, db: Session) -> List[Member]:
        return (
            db.query(Member)
            .filter(Member.need_attendance.is_(True), Member.is_active.is_(True))
            .order_by(Member.name)
            .all()
        )


member = CRUDMember(Member)
