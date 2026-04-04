from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class AlertRuleCreate(BaseModel):
    endpoint_id: int
    rule_type: str
    threshold_value: int
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    rule_type: Optional[str] = None
    threshold_value: Optional[int] = None
    is_active: Optional[bool] = None


class AlertRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    endpoint_id: int
    rule_type: str
    threshold_value: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    alert_rule_id: int
    endpoint_id: int
    trigger_condition: str
    status: str
    triggered_at: datetime
    resolved_at: Optional[datetime] = None


class AlertStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = ["open", "acknowledged", "resolved"]
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v
