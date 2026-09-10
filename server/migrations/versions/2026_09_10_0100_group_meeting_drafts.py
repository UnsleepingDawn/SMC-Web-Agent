"""group meeting planner drafts

Revision ID: 2026_09_10_0100
Revises: 2026_09_10_0000
Create Date: 2026-09-10 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2026_09_10_0100"
down_revision: Union[str, None] = "2026_09_10_0000"
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
        "group_meeting_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "name_list",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "already_grouped",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "meeting_periods",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "semester_id", name="uq_group_meeting_draft"),
    )
    op.create_index(
        "ix_group_meeting_drafts_user_id", "group_meeting_drafts", ["user_id"]
    )
    op.create_index(
        "ix_group_meeting_drafts_semester_id", "group_meeting_drafts", ["semester_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("group_meeting_drafts")
