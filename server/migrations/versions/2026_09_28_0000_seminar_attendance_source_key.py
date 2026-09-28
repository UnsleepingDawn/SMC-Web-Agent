"""seminar attendance unique key includes source

Revision ID: 2026_09_28_0000
Revises: 2026_09_19_0000
Create Date: 2026-09-28 00:00:00.000000

Flow rows and override rows must coexist for the same member and week: a
manual override keeps the synced clock-in list around so the UI can switch
between the two views. Widening the unique key with `source` allows that.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2026_09_28_0000"
down_revision: Union[str, None] = "2026_09_19_0000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "seminar_attendance_records"
_CONSTRAINT = "uq_seminar_attendance"


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="unique")
    op.create_unique_constraint(
        _CONSTRAINT, _TABLE, ["semester_id", "week", "member_name", "source"]
    )


def downgrade() -> None:
    """Downgrade schema.

    The narrowed key cannot hold both a flow row and an override row, so the
    override rows are dropped first to keep the downgrade from failing.
    """
    op.execute(
        sa.text(f"DELETE FROM {_TABLE} WHERE source <> 'flow'")
    )
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="unique")
    op.create_unique_constraint(
        _CONSTRAINT, _TABLE, ["semester_id", "week", "member_name"]
    )
