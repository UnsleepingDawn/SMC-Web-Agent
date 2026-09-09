"""initial schema

Revision ID: 2026_09_09_0000
Revises:
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2026_09_09_0000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("avatar_url", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_sessions_token", "sessions", ["token"])

    op.create_table(
        "runtime_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index("ix_runtime_configs_key", "runtime_configs", ["key"])

    op.create_table(
        "semesters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("default_seminar_weekday", sa.Integer(), nullable=False),
        sa.Column("default_seminar_start_time", sa.String(), nullable=False),
        sa.Column("default_seminar_end_time", sa.String(), nullable=False),
        sa.Column("default_seminar_tencent_id", sa.String(), nullable=True),
        sa.Column("default_seminar_tencent_link", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("weekly_report_app_token", sa.String(), nullable=True),
        sa.Column("weekly_report_table_id", sa.String(), nullable=True),
        sa.Column("weekly_report_url", sa.String(), nullable=True),
        sa.Column("schedule_app_token", sa.String(), nullable=True),
        sa.Column("schedule_table_id", sa.String(), nullable=True),
        sa.Column("schedule_url", sa.String(), nullable=True),
        sa.Column("seminar_app_token", sa.String(), nullable=True),
        sa.Column("seminar_table_id", sa.String(), nullable=True),
        sa.Column("seminar_url", sa.String(), nullable=True),
        sa.Column("seminar_leave_app_token", sa.String(), nullable=True),
        sa.Column("seminar_leave_table_id", sa.String(), nullable=True),
        sa.Column("seminar_leave_url", sa.String(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_semesters_name", "semesters", ["name"])

    op.create_table(
        "members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("grade", sa.String(), nullable=True),
        sa.Column("advisor", sa.String(), nullable=True),
        sa.Column("advisor_user_id", sa.String(), nullable=True),
        sa.Column("cultivation_type", sa.String(), nullable=True),
        sa.Column("enrollment_status", sa.String(), nullable=True),
        sa.Column("feishu_account", sa.String(), nullable=True),
        sa.Column("student_id", sa.String(), nullable=True),
        sa.Column("union_id", sa.String(), nullable=True),
        sa.Column("feishu_user_id", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("mobile", sa.String(), nullable=True),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("need_attendance", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("feishu_account"),
    )
    op.create_index("ix_members_name", "members", ["name"])
    op.create_index("ix_members_student_id", "members", ["student_id"])
    op.create_index("ix_members_feishu_user_id", "members", ["feishu_user_id"])
    op.create_index("ix_members_feishu_account", "members", ["feishu_account"])

    op.create_table(
        "attendance_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("feishu_group_id", sa.String(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "attendance_group_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attendance_group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("feishu_user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["attendance_group_id"], ["attendance_groups.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attendance_group_id", "feishu_user_id", name="uq_group_member"
        ),
    )

    op.create_table(
        "seminars",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("happened", sa.Boolean(), nullable=False),
        sa.Column("room", sa.String(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id", "week", "weekday", "happened", name="uq_seminar_slot"
        ),
    )
    op.create_index("ix_seminars_week", "seminars", ["week"])

    op.create_table(
        "seminar_presentations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seminar_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("track", sa.Integer(), nullable=False),
        sa.Column("presenter_name", sa.String(), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("abstract", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["seminar_id"], ["seminars.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("seminar_id", "track", name="uq_presentation_track"),
    )

    op.create_table(
        "seminar_leaves",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("member_name", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id", "week", "member_name", name="uq_seminar_leave"
        ),
    )
    op.create_index("ix_seminar_leaves_week", "seminar_leaves", ["week"])

    op.create_table(
        "weekly_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("member_name", sa.String(), nullable=False),
        sa.Column("doc_link", sa.String(), nullable=True),
        sa.Column(
            "attachments",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("record_id", sa.String(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id", "week", "member_name", name="uq_weekly_report"
        ),
    )
    op.create_index("ix_weekly_reports_week", "weekly_reports", ["week"])
    op.create_index("ix_weekly_reports_record_id", "weekly_reports", ["record_id"])

    op.create_table(
        "schedule_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("period", sa.String(), nullable=False),
        sa.Column("section", sa.String(), nullable=False),
        sa.Column("member_name", sa.String(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id",
            "weekday",
            "period",
            "section",
            "member_name",
            name="uq_schedule_entry",
        ),
    )
    op.create_index("ix_schedule_entries_weekday", "schedule_entries", ["weekday"])

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("template_key", sa.String(), nullable=False),
        sa.Column("target", sa.String(), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_template_key", "notifications", ["template_key"])
    op.create_index("ix_notifications_status", "notifications", ["status"])

    op.create_table(
        "sync_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("task_name", sa.String(), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("week", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_runs_job_id", "sync_runs", ["job_id"])
    op.create_index("ix_sync_runs_task_name", "sync_runs", ["task_name"])
    op.create_index("ix_sync_runs_status", "sync_runs", ["status"])
    op.create_index("ix_sync_runs_task_status", "sync_runs", ["task_name", "status"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("sync_runs")
    op.drop_table("notifications")
    op.drop_table("schedule_entries")
    op.drop_table("weekly_reports")
    op.drop_table("seminar_leaves")
    op.drop_table("seminar_presentations")
    op.drop_table("seminars")
    op.drop_table("attendance_group_members")
    op.drop_table("attendance_groups")
    op.drop_table("members")
    op.drop_table("semesters")
    op.drop_table("runtime_configs")
    op.drop_table("sessions")
    op.drop_table("users")
