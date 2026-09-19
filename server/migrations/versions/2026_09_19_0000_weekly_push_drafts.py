"""weekly push teacher drafts

Revision ID: 2026_09_19_0000
Revises: 2026_09_15_0100
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2026_09_19_0000"
down_revision: Union[str, None] = "2026_09_15_0100"
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
        "weekly_push_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("semester_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "teacher_names",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "expanded_teachers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["semester_id"], ["semesters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "semester_id", name="uq_weekly_push_draft"),
    )
    op.create_index(
        "ix_weekly_push_drafts_user_id", "weekly_push_drafts", ["user_id"]
    )
    op.create_index(
        "ix_weekly_push_drafts_semester_id", "weekly_push_drafts", ["semester_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("weekly_push_drafts")
