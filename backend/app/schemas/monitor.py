from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EndpointStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str
    current_status: str
    last_check_at: Optional[datetime] = None


class HealthRateResponse(BaseModel):
    total: int
    healthy: int
    unhealthy: int
    unknown: int
    health_rate: float
