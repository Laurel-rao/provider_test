from datetime import datetime

from pydantic import BaseModel, ConfigDict


class KeyCreate(BaseModel):
    name: str
    value: str


class KeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    masked_value: str
    created_at: datetime
