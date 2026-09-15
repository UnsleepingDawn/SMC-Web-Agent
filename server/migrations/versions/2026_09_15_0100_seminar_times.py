"""seminar per-slot times

Revision ID: 2026_09_15_0100
Revises: 2026_09_15_0000
Create Date: 2026-09-15 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2026_09_15_0100"
down_revision: Union[str, None] = "2026_09_15_0000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("seminars", sa.Column("start_time", sa.String(), nullable=True))
    op.add_column("seminars", sa.Column("end_time", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("seminars", "end_time")
    op.drop_column("seminars", "start_time")
