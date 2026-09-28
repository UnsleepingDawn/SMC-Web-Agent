"""seminar leave unique key includes source

Revision ID: 2026_09_28_0100
Revises: 2026_09_28_0000
Create Date: 2026-09-28 01:00:00.000000

Synced leave rows and manual override rows must coexist for the same member
and week: overwriting the week's leave list keeps the synced rows around so
the overwrite survives another sync. Widening the unique key with `source`
allows that.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2026_09_28_0100"
down_revision: Union[str, None] = "2026_09_28_0000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "seminar_leaves"
_CONSTRAINT = "uq_seminar_leave"


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        _TABLE,
        sa.Column(
            "source",
            sa.String(),
            nullable=False,
            server_default="flow",
        ),
    )
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="unique")
    op.create_unique_constraint(
        _CONSTRAINT, _TABLE, ["semester_id", "week", "member_name", "source"]
    )


def downgrade() -> None:
    """Downgrade schema.

    The narrowed key cannot hold both a flow row and an override row, so the
    override rows are dropped first to keep the downgrade from failing.
    """
    op.execute(sa.text(f"DELETE FROM {_TABLE} WHERE source <> 'flow'"))
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="unique")
    op.create_unique_constraint(
        _CONSTRAINT, _TABLE, ["semester_id", "week", "member_name"]
    )
    op.drop_column(_TABLE, "source")
