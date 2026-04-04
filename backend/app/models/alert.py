from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.alert_rule import AlertRule
    from app.models.api_endpoint import APIEndpoint


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_rule_id: Mapped[int] = mapped_column(
        ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False
    )
    endpoint_id: Mapped[int] = mapped_column(
        ForeignKey("api_endpoints.id", ondelete="CASCADE"), nullable=False
    )
    trigger_condition: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    triggered_at: Mapped[datetime] = mapped_column(nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    # Relationships
    alert_rule: Mapped["AlertRule"] = relationship(
        "AlertRule", back_populates="alerts"
    )
    endpoint: Mapped["APIEndpoint"] = relationship(
        "APIEndpoint", back_populates="alerts"
    )
