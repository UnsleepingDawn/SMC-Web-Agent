"""attendance records and group meeting plans

Revision ID: 2026_09_10_0000
Revises: 2026_09_09_0000
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2026_09_10_0000"
down_revision: Union[str, None] = "2026_09_09_0000"
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
        "daily_attendance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("attendance_date", sa.Date(), nullable=False),
        sa.Column("member_name", sa.String(), nullable=False),
        sa.Column("feishu_user_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id",
            "week",
            "attendance_date",
            "member_name",
            name="uq_daily_attendance",
        ),
    )
    op.create_index(
        "ix_daily_attendance_records_week", "daily_attendance_records", ["week"]
    )
    op.create_index(
        "ix_daily_attendance_records_member_name",
        "daily_attendance_records",
        ["member_name"],
    )

    op.create_table(
        "seminar_attendance_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("week", sa.Integer(), nullable=False),
        sa.Column("member_name", sa.String(), nullable=False),
        sa.Column("observed", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("seminar_date", sa.Date(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "semester_id", "week", "member_name", name="uq_seminar_attendance"
        ),
    )
    op.create_index(
        "ix_seminar_attendance_records_week", "seminar_attendance_records", ["week"]
    )
    op.create_index(
        "ix_seminar_attendance_records_member_name",
        "seminar_attendance_records",
        ["member_name"],
    )

    op.create_table(
        "group_meeting_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "validation",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("solver_status", sa.String(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_group_meeting_plans_status", "group_meeting_plans", ["status"])
    op.create_index("ix_group_meeting_plans_job_id", "group_meeting_plans", ["job_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("group_meeting_plans")
    op.drop_table("seminar_attendance_records")
    op.drop_table("daily_attendance_records")
