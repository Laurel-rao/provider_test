from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.api_endpoint import APIEndpoint


class CheckRecord(Base):
    __tablename__ = "check_records"
    __table_args__ = (
        Index("idx_endpoint_checked", "endpoint_id", "checked_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[int] = mapped_column(
        ForeignKey("api_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    status_code: Mapped[Optional[int]] = mapped_column(nullable=True)
    response_time_ms: Mapped[Optional[float]] = mapped_column(nullable=True)
    is_success: Mapped[bool] = mapped_column(nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(nullable=False)

    # Relationships
    endpoint: Mapped["APIEndpoint"] = relationship(
        "APIEndpoint", back_populates="check_records"
    )
