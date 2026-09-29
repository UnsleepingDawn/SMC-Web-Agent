"""CRUD for attendance groups, daily/seminar attendance, leaves and schedule."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Set
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import (
    AttendanceGroup,
    AttendanceGroupMember,
    DailyAttendanceRecord,
    ScheduleEntry,
    SeminarAttendanceRecord,
    SeminarLeave,
)
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Rows produced by the Feishu clock-in sync. Every other source is an override
# written from the attendance page, and an override hides the flow rows for the
# same week wherever the effective roster is computed.
FLOW_SOURCE = "flow"


class DailyAttendanceCreate(BaseModel):
    semester_id: UUID
    week: int
    attendance_date: date
    member_name: str
    feishu_user_id: Optional[str] = None
    status: str


class DailyAttendanceUpdate(BaseModel):
    feishu_user_id: Optional[str] = None
    status: Optional[str] = None


class CRUDDailyAttendance(
    CRUDBase[DailyAttendanceRecord, DailyAttendanceCreate, DailyAttendanceUpdate]
):
    def list_by_week(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> List[DailyAttendanceRecord]:
        return (
            db.query(DailyAttendanceRecord)
            .filter(
                DailyAttendanceRecord.semester_id == semester_id,
                DailyAttendanceRecord.week == week,
            )
            .order_by(DailyAttendanceRecord.member_name, DailyAttendanceRecord.attendance_date)
            .all()
        )

    def list_up_to_week(
        self, db: Session, *, semester_id: UUID, end_week: int
    ) -> List[DailyAttendanceRecord]:
        """Every stored row from week 1 through ``end_week``, for term summaries.

        Weeks that were never synced simply have no rows, so callers must not
        read the row count as "days attended".
        """
        return (
            db.query(DailyAttendanceRecord)
            .filter(
                DailyAttendanceRecord.semester_id == semester_id,
                DailyAttendanceRecord.week >= 1,
                DailyAttendanceRecord.week <= end_week,
            )
            .order_by(
                DailyAttendanceRecord.member_name,
                DailyAttendanceRecord.week,
                DailyAttendanceRecord.attendance_date,
            )
            .all()
        )

    def names_by_semester(self, db: Session, *, semester_id: UUID) -> List[str]:
        """Every member name with a clock-in row for the semester.

        The sync writes rows for the whole roster, so a member with no row at
        all was not on the roster that term; this feeds the term roster.
        """
        rows = (
            db.query(DailyAttendanceRecord.member_name)
            .filter(DailyAttendanceRecord.semester_id == semester_id)
            .distinct()
            .all()
        )
        return sorted({str(name) for (name,) in rows if name})

    def replace_week(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        rows: Iterable[DailyAttendanceCreate],
    ) -> int:
        """Rewrite one week's rows in a single transaction."""
        db.query(DailyAttendanceRecord).filter(
            DailyAttendanceRecord.semester_id == semester_id,
            DailyAttendanceRecord.week == week,
        ).delete(synchronize_session=False)
        count = 0
        for row in rows:
            db.add(DailyAttendanceRecord(**row.model_dump()))
            count += 1
        db.commit()
        return count


class SeminarAttendanceCreate(BaseModel):
    semester_id: UUID
    week: int
    member_name: str
    observed: bool = False
    source: str = "flow"
    seminar_date: Optional[date] = None


class SeminarAttendanceUpdate(BaseModel):
    observed: Optional[bool] = None
    source: Optional[str] = None
    seminar_date: Optional[date] = None


class CRUDSeminarAttendance(
    CRUDBase[SeminarAttendanceRecord, SeminarAttendanceCreate, SeminarAttendanceUpdate]
):
    def list_by_week(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> List[SeminarAttendanceRecord]:
        return (
            db.query(SeminarAttendanceRecord)
            .filter(
                SeminarAttendanceRecord.semester_id == semester_id,
                SeminarAttendanceRecord.week == week,
            )
            .order_by(SeminarAttendanceRecord.member_name)
            .all()
        )

    def names_by_semester(self, db: Session, *, semester_id: UUID) -> List[str]:
        """Every member name with a row for the semester, attended or not."""
        rows = (
            db.query(SeminarAttendanceRecord.member_name)
            .filter(SeminarAttendanceRecord.semester_id == semester_id)
            .distinct()
            .all()
        )
        return sorted({str(name) for (name,) in rows if name})

    def weeks_covered(self, db: Session, *, semester_id: UUID) -> Set[int]:
        """Every week the semester holds a seminar row for.

        The sync writes a row only where it recorded someone, so a week with no
        row at all is a week the seminar never ran.
        """
        rows = (
            db.query(SeminarAttendanceRecord.week)
            .filter(SeminarAttendanceRecord.semester_id == semester_id)
            .distinct()
            .all()
        )
        return {int(week) for (week,) in rows}

    def weeks_by_member(self, db: Session, *, semester_id: UUID) -> Dict[str, set]:
        """The weeks each member was observed, keyed by name.

        A week holding any override row is read from the override rows alone,
        so the synced clock-in list only applies to weeks without an override.
        """
        rows = (
            db.query(
                SeminarAttendanceRecord.member_name,
                SeminarAttendanceRecord.week,
                SeminarAttendanceRecord.observed,
                SeminarAttendanceRecord.source,
            )
            .filter(SeminarAttendanceRecord.semester_id == semester_id)
            .all()
        )
        override_weeks = {int(week) for _, week, _, source in rows if source != FLOW_SOURCE}
        weeks: Dict[str, set] = {}
        for name, week, observed, source in rows:
            if not observed:
                continue
            if source == FLOW_SOURCE and int(week) in override_weeks:
                continue
            weeks.setdefault(str(name), set()).add(int(week))
        return weeks

    def replace_flow_rows(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        observed_names: Iterable[str],
        seminar_date: Optional[date] = None,
    ) -> int:
        """Replace the synced rows only, leaving override rows untouched."""
        db.query(SeminarAttendanceRecord).filter(
            SeminarAttendanceRecord.semester_id == semester_id,
            SeminarAttendanceRecord.week == week,
            SeminarAttendanceRecord.source == FLOW_SOURCE,
        ).delete(synchronize_session=False)
        count = 0
        for name in observed_names:
            db.add(
                SeminarAttendanceRecord(
                    semester_id=semester_id,
                    week=week,
                    member_name=name,
                    observed=True,
                    source=FLOW_SOURCE,
                    seminar_date=seminar_date,
                )
            )
            count += 1
        db.commit()
        return count

    def replace_override_rows(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        observed_names: Iterable[str],
        source: str = "manual",
        seminar_date: Optional[date] = None,
    ) -> int:
        """Replace the week's override rows, keeping the synced rows intact.

        The synced rows stay around so the page can switch back to the
        clock-in roster; they are only shadowed while an override exists.
        """
        db.query(SeminarAttendanceRecord).filter(
            SeminarAttendanceRecord.semester_id == semester_id,
            SeminarAttendanceRecord.week == week,
            SeminarAttendanceRecord.source != FLOW_SOURCE,
        ).delete(synchronize_session=False)
        count = 0
        for name in observed_names:
            db.add(
                SeminarAttendanceRecord(
                    semester_id=semester_id,
                    week=week,
                    member_name=name,
                    observed=True,
                    source=source,
                    seminar_date=seminar_date,
                )
            )
            count += 1
        db.commit()
        return count


class AttendanceGroupMemberInput(BaseModel):
    feishu_user_id: str
    name: Optional[str] = None
    member_id: Optional[UUID] = None


class AttendanceGroupCreate(BaseModel):
    name: str
    feishu_group_id: Optional[str] = None


class CRUDAttendanceGroup(CRUDBase[AttendanceGroup, AttendanceGroupCreate, BaseModel]):
    def get_by_name(self, db: Session, *, name: str) -> Optional[AttendanceGroup]:
        return db.query(AttendanceGroup).filter(AttendanceGroup.name == name).first()

    def get_by_feishu_group_id(
        self, db: Session, *, feishu_group_id: str
    ) -> Optional[AttendanceGroup]:
        return (
            db.query(AttendanceGroup)
            .filter(AttendanceGroup.feishu_group_id == feishu_group_id)
            .first()
        )

    def replace_members(
        self,
        db: Session,
        *,
        group: AttendanceGroup,
        feishu_group_id: Optional[str],
        members: List[AttendanceGroupMemberInput],
    ) -> int:
        """Rewrite the group's member list and mark them as needing attendance."""
        if feishu_group_id:
            group.feishu_group_id = feishu_group_id
        db.add(group)
        db.query(AttendanceGroupMember).filter(
            AttendanceGroupMember.attendance_group_id == group.id
        ).delete(synchronize_session=False)
        count = 0
        for member in members:
            db.add(
                AttendanceGroupMember(
                    attendance_group_id=group.id,
                    member_id=member.member_id,
                    feishu_user_id=member.feishu_user_id,
                    name=member.name,
                )
            )
            count += 1
        db.commit()
        return count

    def list_members(
        self, db: Session, *, group_name: str
    ) -> List[AttendanceGroupMember]:
        group = self.get_by_name(db, name=group_name)
        if not group:
            return []
        return (
            db.query(AttendanceGroupMember)
            .filter(AttendanceGroupMember.attendance_group_id == group.id)
            .order_by(AttendanceGroupMember.name)
            .all()
        )


class SeminarLeaveCreate(BaseModel):
    semester_id: UUID
    week: int
    member_name: str
    reason: Optional[str] = None
    source: str = FLOW_SOURCE


class CRUDSeminarLeave(CRUDBase[SeminarLeave, SeminarLeaveCreate, BaseModel]):
    def names_by_semester(self, db: Session, *, semester_id: UUID) -> List[str]:
        """Every member name with a leave row for the semester.

        Someone who asked for leave was plainly part of the semester even
        without any attendance or report row, so this feeds the roster.
        """
        rows = (
            db.query(SeminarLeave.member_name)
            .filter(SeminarLeave.semester_id == semester_id)
            .distinct()
            .all()
        )
        return sorted({str(name) for (name,) in rows if name})

    def list_by_week(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> List[SeminarLeave]:
        """The effective leave list for one week.

        A week holding any override row is read from the override rows alone,
        so the synced list only applies to weeks without an overwrite.
        """
        rows = (
            db.query(SeminarLeave)
            .filter(SeminarLeave.semester_id == semester_id, SeminarLeave.week == week)
            .order_by(SeminarLeave.member_name)
            .all()
        )
        override = [row for row in rows if row.source != FLOW_SOURCE]
        return override or rows

    def weeks_by_member(self, db: Session, *, semester_id: UUID) -> Dict[str, set]:
        """The weeks each member was on leave, keyed by name.

        A week holding any override row is read from the override rows alone,
        so the synced list only applies to weeks without an overwrite.
        """
        rows = (
            db.query(SeminarLeave.member_name, SeminarLeave.week, SeminarLeave.source)
            .filter(SeminarLeave.semester_id == semester_id)
            .all()
        )
        override_weeks = {int(week) for _, week, source in rows if source != FLOW_SOURCE}
        weeks: Dict[str, set] = {}
        for name, week, source in rows:
            if source == FLOW_SOURCE and int(week) in override_weeks:
                continue
            weeks.setdefault(str(name), set()).add(int(week))
        return weeks

    def replace_flow_rows(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        rows: Iterable[SeminarLeaveCreate],
    ) -> int:
        """Replace the synced rows only, leaving override rows untouched."""
        db.query(SeminarLeave).filter(
            SeminarLeave.semester_id == semester_id,
            SeminarLeave.week == week,
            SeminarLeave.source == FLOW_SOURCE,
        ).delete(synchronize_session=False)
        count = 0
        for row in rows:
            db.add(SeminarLeave(**row.model_dump()))
            count += 1
        db.commit()
        return count

    def replace_override_rows(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        member_names: Iterable[str],
        source: str = "manual",
    ) -> int:
        """Replace the week's override rows, keeping the synced rows intact.

        The synced rows stay around so a later sync does not resurrect the old
        leave list over an explicit manual overwrite.
        """
        db.query(SeminarLeave).filter(
            SeminarLeave.semester_id == semester_id,
            SeminarLeave.week == week,
            SeminarLeave.source != FLOW_SOURCE,
        ).delete(synchronize_session=False)
        count = 0
        for name in member_names:
            db.add(
                SeminarLeave(
                    semester_id=semester_id,
                    week=week,
                    member_name=name,
                    reason=None,
                    source=source,
                )
            )
            count += 1
        db.commit()
        return count


class ScheduleEntryCreate(BaseModel):
    semester_id: UUID
    weekday: int
    period: str
    section: str
    member_name: str


class CRUDScheduleEntry(CRUDBase[ScheduleEntry, ScheduleEntryCreate, BaseModel]):
    def list_by_semester(
        self, db: Session, *, semester_id: UUID
    ) -> List[ScheduleEntry]:
        return (
            db.query(ScheduleEntry)
            .filter(ScheduleEntry.semester_id == semester_id)
            .order_by(ScheduleEntry.weekday, ScheduleEntry.period, ScheduleEntry.section)
            .all()
        )

    def list_by_weekday(
        self, db: Session, *, semester_id: UUID, weekday: int
    ) -> List[ScheduleEntry]:
        return (
            db.query(ScheduleEntry)
            .filter(
                ScheduleEntry.semester_id == semester_id,
                ScheduleEntry.weekday == weekday,
            )
            .all()
        )

    def replace_all(
        self,
        db: Session,
        *,
        semester_id: UUID,
        rows: Iterable[ScheduleEntryCreate],
    ) -> int:
        db.query(ScheduleEntry).filter(
            ScheduleEntry.semester_id == semester_id
        ).delete(synchronize_session=False)
        count = 0
        for row in rows:
            db.add(ScheduleEntry(**row.model_dump()))
            count += 1
        db.commit()
        return count


daily_attendance = CRUDDailyAttendance(DailyAttendanceRecord)
seminar_attendance = CRUDSeminarAttendance(SeminarAttendanceRecord)
attendance_group = CRUDAttendanceGroup(AttendanceGroup)
seminar_leave = CRUDSeminarLeave(SeminarLeave)
schedule_entry = CRUDScheduleEntry(ScheduleEntry)
