from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.alert_rule import AlertRule
    from app.models.api_key import APIKey
    from app.models.check_record import CheckRecord
    from app.models.error_log import ErrorLog


class APIEndpoint(Base):
    __tablename__ = "api_endpoints"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    headers_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    request_body_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_status_code: Mapped[int] = mapped_column(nullable=False, default=200)
    expected_response_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    monitor_interval_seconds: Mapped[int] = mapped_column(nullable=False, default=300)
    api_key_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True
    )
    current_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown"
    )
    last_check_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.now, onupdate=datetime.now, nullable=False
    )

    # Relationships
    api_key: Mapped[Optional["APIKey"]] = relationship(
        "APIKey", back_populates="endpoints"
    )
    check_records: Mapped[List["CheckRecord"]] = relationship(
        "CheckRecord", back_populates="endpoint", cascade="all, delete-orphan"
    )
    alert_rules: Mapped[List["AlertRule"]] = relationship(
        "AlertRule", back_populates="endpoint", cascade="all, delete-orphan"
    )
    alerts: Mapped[List["Alert"]] = relationship(
        "Alert",
        back_populates="endpoint",
        cascade="all, delete-orphan",
        foreign_keys="Alert.endpoint_id",
    )
    error_logs: Mapped[List["ErrorLog"]] = relationship(
        "ErrorLog", back_populates="endpoint", cascade="all, delete-orphan"
    )
