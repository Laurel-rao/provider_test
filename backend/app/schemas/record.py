from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CheckRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    endpoint_id: int
    endpoint_name: Optional[str] = None
    endpoint_url: Optional[str] = None
    endpoint_method: Optional[str] = None
    status_code: Optional[int] = None
    response_time_ms: Optional[float] = None
    is_success: bool
    error_message: Optional[str] = None
    response_body: Optional[str] = None
    checked_at: datetime
