"""Pydantic schemas for AI Provider module."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class AIProviderCreate(BaseModel):
    name: str
    provider_type: str
    base_url: str
    api_key: str
    model: str
    description: Optional[str] = None
    stream: bool = True
    monitor_interval_seconds: int = 300

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class AIProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    stream: Optional[bool] = None
    monitor_interval_seconds: Optional[int] = None

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class AIProviderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    provider_type: str
    base_url: str
    masked_key: str
    model: str
    description: Optional[str] = None
    stream: bool
    endpoint_id: Optional[int] = None
    monitor_interval_seconds: Optional[int] = None
    current_status: Optional[str] = None
    last_check_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ProviderTestResponse(BaseModel):
    provider_id: int
    endpoint_id: Optional[int] = None
    is_success: bool
    status_code: Optional[int] = None
    response_time_ms: Optional[float] = None
    error_message: Optional[str] = None
    checked_at: datetime
    current_status: Optional[str] = None


# --- Dashboard Schemas ---

class DashboardSummary(BaseModel):
    total: int
    healthy: int
    unhealthy: int
    unknown: int
    health_rate: float


class TrendPoint(BaseModel):
    timestamp: str
    response_time_ms: Optional[float] = None


class ProviderTrend(BaseModel):
    provider_id: int
    provider_name: str
    provider_type: str
    data_points: List[TrendPoint]


class AvailabilitySlot(BaseModel):
    timestamp: str
    status: str  # normal | abnormal | no_data


class ProviderAvailability(BaseModel):
    provider_id: int
    provider_name: str
    provider_type: str
    slots: List[AvailabilitySlot]


# --- 60-point probe card schemas ---

class ProbePoint(BaseModel):
    """Single probe point: 1 = success, 0 = failure, None = no data."""
    value: Optional[int] = None  # 1 | 0 | None
    avg_response_time_ms: Optional[float] = None
    timestamp: str


class ProviderProbeCard(BaseModel):
    provider_id: int
    provider_name: str
    provider_type: str
    model: str
    current_status: Optional[str] = None
    availability_rate: Optional[float] = None
    avg_response_time_ms: Optional[float] = None
    probes: List[ProbePoint]  # exactly 60 points
