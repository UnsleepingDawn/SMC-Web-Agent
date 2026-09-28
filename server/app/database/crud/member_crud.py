"""Member master data queries."""

import os
from typing import List, Optional, Union
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Member
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

# Enrollment status that counts as "currently enrolled"; used to scope the
# weekly-report teacher push to active students.
ENROLLED_STATUS = "在读"

# The lab's teachers all sit in this address-book department, so the weekly
# report reaches them without any manual roster. ``Member.department`` is filled
# by the member sync from the address-book department tree.
DEFAULT_TEACHER_DEPARTMENT = "Tenure"


def teacher_department_name() -> str:
    return (
        os.getenv("FEISHU_TEACHER_DEPARTMENT_NAME", "").strip()
        or DEFAULT_TEACHER_DEPARTMENT
    )


def _as_value_list(value: Optional[Union[str, List[str]]]) -> Optional[List[str]]:
    """Normalize a filter value to a list; ``None`` means "no filter".

    A bare string must become a one-element list rather than be iterated
    character by character, or callers passing ``enrollment_status="在读"``
    would silently match nothing once the query uses ``IN``.
    """
    if value is None:
        return None
    if isinstance(value, str):
        return [value]
    return list(value)


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
        advisor: Optional[Union[str, List[str]]] = None,
        grade: Optional[Union[str, List[str]]] = None,
        cultivation_type: Optional[Union[str, List[str]]] = None,
        enrollment_status: Optional[Union[str, List[str]]] = None,
        need_attendance: Optional[bool] = None,
        is_active: Optional[bool] = None,
    ) -> List[Member]:
        """Filter the roster; the four text filters accept a scalar or a list.

        The API passes lists (a repeated query parameter) so several values of
        one field match as OR, while different fields still AND together.
        Internal callers keep passing plain strings, so scalars are accepted too.
        """
        advisor_values = _as_value_list(advisor)
        grade_values = _as_value_list(grade)
        cultivation_values = _as_value_list(cultivation_type)
        status_values = _as_value_list(enrollment_status)

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
        if advisor_values:
            query = query.filter(Member.advisor.in_(advisor_values))
        if grade_values:
            query = query.filter(Member.grade.in_(grade_values))
        if cultivation_values:
            query = query.filter(Member.cultivation_type.in_(cultivation_values))
        if status_values:
            query = query.filter(Member.enrollment_status.in_(status_values))
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
            "cultivation_type": Member.cultivation_type,
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

    def list_enrolled(self, db: Session) -> List[Member]:
        """Students currently enrolled, grouped by advisor downstream."""
        return (
            db.query(Member)
            .filter(Member.enrollment_status == ENROLLED_STATUS)
            .order_by(Member.name)
            .all()
        )

    def list_by_department(self, db: Session, *, department: str) -> List[Member]:
        """Active members of one address-book department, by name."""
        return (
            db.query(Member)
            .filter(Member.department == department, Member.is_active.is_(True))
            .order_by(Member.name)
            .all()
        )

    def list_teachers(self, db: Session) -> List[Member]:
        """The lab's teachers: active members of the teacher department.

        The roster follows the address book instead of a hand-maintained list,
        so a personnel change needs no configuration edit.
        """
        return self.list_by_department(db, department=teacher_department_name())


member = CRUDMember(Member)
