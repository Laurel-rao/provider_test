from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class EndpointCreate(BaseModel):
    name: str
    url: str
    method: str = "GET"
    headers_json: Optional[str] = None
    request_body_json: Optional[str] = None
    expected_status_code: int = 200
    expected_response_text: Optional[str] = None
    description: Optional[str] = None
    monitor_interval_seconds: int = 300
    api_key_id: Optional[int] = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    method: Optional[str] = None
    headers_json: Optional[str] = None
    request_body_json: Optional[str] = None
    expected_status_code: Optional[int] = None
    expected_response_text: Optional[str] = None
    description: Optional[str] = None
    monitor_interval_seconds: Optional[int] = None
    api_key_id: Optional[int] = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class EndpointResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str
    method: str
    headers_json: Optional[str] = None
    request_body_json: Optional[str] = None
    expected_status_code: int
    expected_response_text: Optional[str] = None
    description: Optional[str] = None
    monitor_interval_seconds: int
    api_key_id: Optional[int] = None
    current_status: str
    last_check_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
