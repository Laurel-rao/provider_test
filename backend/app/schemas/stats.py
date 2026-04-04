from typing import List

from pydantic import BaseModel


class StatsResponse(BaseModel):
    avg_response_time: float
    max_response_time: float
    min_response_time: float
    p95_response_time: float


class HistogramBucket(BaseModel):
    range_start: float
    range_end: float
    count: int


class HistogramResponse(BaseModel):
    buckets: List[HistogramBucket]
