from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.api_endpoint import APIEndpoint


class ErrorLog(Base):
    __tablename__ = "error_logs"
    __table_args__ = (
        Index("idx_logs_filter", "created_at", "error_type", "endpoint_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    endpoint_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("api_endpoints.id", ondelete="CASCADE"), nullable=True
    )
    module_name: Mapped[str] = mapped_column(String(50), nullable=False)
    error_type: Mapped[str] = mapped_column(String(100), nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    stack_trace: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    http_status_code: Mapped[Optional[int]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.now, nullable=False)

    # Relationships
    endpoint: Mapped[Optional["APIEndpoint"]] = relationship(
        "APIEndpoint", back_populates="error_logs"
    )
