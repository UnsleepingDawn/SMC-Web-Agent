"""CRUD for attendance groups, daily/seminar attendance, leaves and schedule."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Iterable, List, Optional
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

    def set_observed(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        member_name: str,
        observed: bool,
        source: str,
        seminar_date: Optional[date] = None,
    ) -> Optional[SeminarAttendanceRecord]:
        record = (
            db.query(SeminarAttendanceRecord)
            .filter(
                SeminarAttendanceRecord.semester_id == semester_id,
                SeminarAttendanceRecord.week == week,
                SeminarAttendanceRecord.member_name == member_name,
            )
            .first()
        )
        if record:
            record.observed = observed
            record.source = source
            if seminar_date:
                record.seminar_date = seminar_date
        else:
            record = SeminarAttendanceRecord(
                semester_id=semester_id,
                week=week,
                member_name=member_name,
                observed=observed,
                source=source,
                seminar_date=seminar_date,
            )
            db.add(record)
        return record

    def replace_flow_rows(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        observed_names: Iterable[str],
        seminar_date: Optional[date] = None,
    ) -> int:
        """Replace flow-sourced rows but leave relay/manual edits untouched."""
        db.query(SeminarAttendanceRecord).filter(
            SeminarAttendanceRecord.semester_id == semester_id,
            SeminarAttendanceRecord.week == week,
            SeminarAttendanceRecord.source == "flow",
        ).delete(synchronize_session=False)
        count = 0
        for name in observed_names:
            db.add(
                SeminarAttendanceRecord(
                    semester_id=semester_id,
                    week=week,
                    member_name=name,
                    observed=True,
                    source="flow",
                    seminar_date=seminar_date,
                )
            )
            count += 1
        db.commit()
        return count

    def replace_week(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        observed_names: Iterable[str],
        source: str,
        seminar_date: Optional[date] = None,
    ) -> int:
        """Replace every row for the week, used by relay and manual overrides."""
        db.query(SeminarAttendanceRecord).filter(
            SeminarAttendanceRecord.semester_id == semester_id,
            SeminarAttendanceRecord.week == week,
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


class CRUDSeminarLeave(CRUDBase[SeminarLeave, SeminarLeaveCreate, BaseModel]):
    def list_by_week(
        self, db: Session, *, semester_id: UUID, week: int
    ) -> List[SeminarLeave]:
        return (
            db.query(SeminarLeave)
            .filter(SeminarLeave.semester_id == semester_id, SeminarLeave.week == week)
            .order_by(SeminarLeave.member_name)
            .all()
        )

    def replace_week(
        self,
        db: Session,
        *,
        semester_id: UUID,
        week: int,
        rows: Iterable[SeminarLeaveCreate],
    ) -> int:
        db.query(SeminarLeave).filter(
            SeminarLeave.semester_id == semester_id, SeminarLeave.week == week
        ).delete(synchronize_session=False)
        count = 0
        for row in rows:
            db.add(SeminarLeave(**row.model_dump()))
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
