"""seminar offline advisor

Revision ID: 2026_09_15_0000
Revises: 2026_09_10_0100
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2026_09_15_0000"
down_revision: Union[str, None] = "2026_09_10_0100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("seminars", sa.Column("offline_advisor", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("seminars", "offline_advisor")
