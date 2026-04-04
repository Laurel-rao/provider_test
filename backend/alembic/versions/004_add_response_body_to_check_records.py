"""add response_body to check_records

Revision ID: 004
Revises: 003
Create Date: 2026-04-04 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("check_records", sa.Column("response_body", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("check_records", "response_body")
