import uuid
from types import NoneType

from sqlalchemy import (  # type: ignore
    UUID,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self):
        return f"<{self.__class__.__name__} id={self.id}>"

    def to_dict(self):
        """Convert the model instance to a JSON-friendly dictionary."""

        def _to_json_friendly(value):
            if isinstance(value, list):
                return [_to_json_friendly(item) for item in value]
            elif isinstance(value, dict):
                return {key: _to_json_friendly(val) for key, val in value.items()}
            elif isinstance(value, (int, float, bool)):
                return value
            elif isinstance(value, NoneType):
                return None
            return str(value)

        return {
            column.name: _to_json_friendly(getattr(self, column.name))
            for column in self.__table__.columns
        }


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)

    sessions = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token = Column(String, unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

    user = relationship("User", back_populates="sessions")


class RuntimeConfig(Base):
    """Encrypted key/value settings the operator can edit after deployment."""

    __tablename__ = "runtime_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String, unique=True, nullable=False, index=True)
    encrypted_value = Column(Text, nullable=False)


class Semester(Base):
    """One academic term and the Feishu bitables that belong to it."""

    __tablename__ = "semesters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    # ISO weekday of the default seminar slot: 1=Monday ... 7=Sunday.
    default_seminar_weekday = Column(Integer, nullable=False, default=4)
    default_seminar_start_time = Column(String, nullable=False, default="1900")
    default_seminar_end_time = Column(String, nullable=False, default="2030")
    default_seminar_tencent_id = Column(String, nullable=True)
    default_seminar_tencent_link = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    weekly_report_app_token = Column(String, nullable=True)
    weekly_report_table_id = Column(String, nullable=True)
    weekly_report_url = Column(String, nullable=True)

    schedule_app_token = Column(String, nullable=True)
    schedule_table_id = Column(String, nullable=True)
    schedule_url = Column(String, nullable=True)

    seminar_app_token = Column(String, nullable=True)
    seminar_table_id = Column(String, nullable=True)
    seminar_url = Column(String, nullable=True)

    seminar_leave_app_token = Column(String, nullable=True)
    seminar_leave_table_id = Column(String, nullable=True)
    seminar_leave_url = Column(String, nullable=True)

    seminars = relationship(
        "Seminar", back_populates="semester", cascade="all, delete-orphan"
    )
    weekly_reports = relationship(
        "WeeklyReport", back_populates="semester", cascade="all, delete-orphan"
    )


class Member(Base):
    """Merged master data: address book joined with the seminar bitable."""

    __tablename__ = "members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, index=True)
    grade = Column(String, nullable=True)
    advisor = Column(String, nullable=True)
    advisor_user_id = Column(String, nullable=True)
    cultivation_type = Column(String, nullable=True)
    enrollment_status = Column(String, nullable=True)
    feishu_account = Column(String, unique=True, nullable=True, index=True)
    student_id = Column(String, nullable=True, index=True)
    union_id = Column(String, nullable=True)
    feishu_user_id = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True)
    mobile = Column(String, nullable=True)
    department = Column(String, nullable=True)
    need_attendance = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)


class AttendanceGroup(Base):
    """Feishu attendance group that defines who is expected to report."""

    __tablename__ = "attendance_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, unique=True, nullable=False)
    feishu_group_id = Column(String, nullable=True)

    members = relationship(
        "AttendanceGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class AttendanceGroupMember(Base):
    __tablename__ = "attendance_group_members"
    __table_args__ = (
        UniqueConstraint("attendance_group_id", "feishu_user_id", name="uq_group_member"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_group_id = Column(
        UUID(as_uuid=True),
        ForeignKey("attendance_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_id = Column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    feishu_user_id = Column(String, nullable=False)
    name = Column(String, nullable=True)

    group = relationship("AttendanceGroup", back_populates="members")


class Seminar(Base):
    """One seminar occurrence, keyed by week and weekday."""

    __tablename__ = "seminars"
    __table_args__ = (
        UniqueConstraint(
            "semester_id", "week", "weekday", "happened", name="uq_seminar_slot"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    week = Column(Integer, nullable=False, index=True)
    weekday = Column(Integer, nullable=False)
    happened = Column(Boolean, nullable=False, default=False)
    room = Column(String, nullable=True)
    # Teacher on site for the offline session, as recorded in the seminar table.
    offline_advisor = Column(String, nullable=True)

    semester = relationship("Semester", back_populates="seminars")
    presentations = relationship(
        "SeminarPresentation",
        back_populates="seminar",
        cascade="all, delete-orphan",
        order_by="SeminarPresentation.track",
    )


class SeminarPresentation(Base):
    """A talk inside one seminar, ordered by track."""

    __tablename__ = "seminar_presentations"
    __table_args__ = (
        UniqueConstraint("seminar_id", "track", name="uq_presentation_track"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seminar_id = Column(
        UUID(as_uuid=True), ForeignKey("seminars.id", ondelete="CASCADE"), nullable=False
    )
    track = Column(Integer, nullable=False)
    presenter_name = Column(String, nullable=False)
    member_id = Column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    title = Column(String, nullable=False)
    abstract = Column(Text, nullable=True)

    seminar = relationship("Seminar", back_populates="presentations")


class SeminarLeave(Base):
    __tablename__ = "seminar_leaves"
    __table_args__ = (
        UniqueConstraint("semester_id", "week", "member_name", name="uq_seminar_leave"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    week = Column(Integer, nullable=False, index=True)
    member_name = Column(String, nullable=False)
    reason = Column(Text, nullable=True)


class WeeklyReport(Base):
    """One weekly-report submission pulled from the bitable."""

    __tablename__ = "weekly_reports"
    __table_args__ = (
        UniqueConstraint("semester_id", "week", "member_name", name="uq_weekly_report"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    week = Column(Integer, nullable=False, index=True)
    member_id = Column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    member_name = Column(String, nullable=False)
    doc_link = Column(String, nullable=True)
    attachments = Column(JSONB, nullable=False, default=list)
    record_id = Column(String, nullable=True, index=True)

    semester = relationship("Semester", back_populates="weekly_reports")


class DailyAttendanceRecord(Base):
    """One member's clock-in result on one day of a week."""

    __tablename__ = "daily_attendance_records"
    __table_args__ = (
        UniqueConstraint(
            "semester_id",
            "week",
            "attendance_date",
            "member_name",
            name="uq_daily_attendance",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    week = Column(Integer, nullable=False, index=True)
    attendance_date = Column(Date, nullable=False)
    member_name = Column(String, nullable=False, index=True)
    feishu_user_id = Column(String, nullable=True)
    status = Column(String, nullable=False)


class SeminarAttendanceRecord(Base):
    """Whether one member showed up to the seminar of a given week."""

    __tablename__ = "seminar_attendance_records"
    __table_args__ = (
        UniqueConstraint(
            "semester_id", "week", "member_name", name="uq_seminar_attendance"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    week = Column(Integer, nullable=False, index=True)
    member_name = Column(String, nullable=False, index=True)
    observed = Column(Boolean, nullable=False, default=False)
    # How the row was produced: the clock-in flow, a group relay, or a manual edit.
    source = Column(String, nullable=False, default="flow")
    seminar_date = Column(Date, nullable=True)


class GroupMeetingPlan(Base):
    """One BILP group-meeting scheduling request and its solution."""

    __tablename__ = "group_meeting_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(String, nullable=False, default="pending", index=True)
    job_id = Column(String, nullable=True, index=True)
    params = Column(JSONB, nullable=False, default=dict)
    result = Column(JSONB, nullable=False, default=dict)
    validation = Column(JSONB, nullable=False, default=dict)
    solver_status = Column(String, nullable=True)
    error = Column(Text, nullable=True)


class GroupMeetingDraft(Base):
    """The planner form state one user last submitted for one semester."""

    __tablename__ = "group_meeting_drafts"
    __table_args__ = (
        UniqueConstraint("user_id", "semester_id", name="uq_group_meeting_draft"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    semester_id = Column(
        UUID(as_uuid=True),
        ForeignKey("semesters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name_list = Column(JSONB, nullable=False, default=list)
    already_grouped = Column(JSONB, nullable=False, default=list)
    meeting_periods = Column(JSONB, nullable=False, default=list)


class ScheduleEntry(Base):
    """A course slot that exempts a member from attendance requirements."""

    __tablename__ = "schedule_entries"
    __table_args__ = (
        UniqueConstraint(
            "semester_id",
            "weekday",
            "period",
            "section",
            "member_name",
            name="uq_schedule_entry",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False
    )
    weekday = Column(Integer, nullable=False, index=True)
    period = Column(String, nullable=False)
    section = Column(String, nullable=False)
    member_name = Column(String, nullable=False)


class Notification(Base):
    """One Feishu message we rendered and sent."""

    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel = Column(String, nullable=False, default="feishu")
    template_key = Column(String, nullable=False, index=True)
    target = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False, default=dict)
    status = Column(String, nullable=False, default="pending", index=True)
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)


class SyncRun(Base):
    """Tracks one Feishu synchronisation task so the UI can poll it."""

    __tablename__ = "sync_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(String, nullable=True, index=True)
    task_name = Column(String, nullable=False, index=True)
    semester_id = Column(
        UUID(as_uuid=True), ForeignKey("semesters.id", ondelete="SET NULL"), nullable=True
    )
    week = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    error = Column(Text, nullable=True)
    payload = Column(JSONB, nullable=False, default=dict)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_sync_runs_task_status", "task_name", "status"),)
