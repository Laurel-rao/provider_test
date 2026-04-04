"""API routes for response-time statistics and histograms."""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.check_record import CheckRecord
from app.models.user import User
from app.schemas.stats import HistogramBucket, HistogramResponse, StatsResponse
from app.services.auth import get_current_user

router = APIRouter()

_RANGE_MAP = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def _time_filter(time_range: Optional[str]) -> Optional[datetime]:
    delta = _RANGE_MAP.get(time_range or "24h", timedelta(hours=24))
    return datetime.now() - delta


@router.get("/{endpoint_id}", response_model=StatsResponse)
async def get_stats(
    endpoint_id: int,
    time_range: Optional[str] = Query("24h"),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return avg, max, min, P95 response times for an endpoint."""
    since = _time_filter(time_range)
    stmt = (
        select(CheckRecord.response_time_ms)
        .where(
            CheckRecord.endpoint_id == endpoint_id,
            CheckRecord.response_time_ms.isnot(None),
            CheckRecord.checked_at >= since,
        )
        .order_by(CheckRecord.response_time_ms)
    )
    result = await db.execute(stmt)
    times = [row[0] for row in result.all()]

    if not times:
        return StatsResponse(avg_response_time=0, max_response_time=0, min_response_time=0, p95_response_time=0)

    avg_rt = sum(times) / len(times)
    max_rt = max(times)
    min_rt = min(times)
    p95_idx = int(len(times) * 0.95)
    p95_rt = times[min(p95_idx, len(times) - 1)]

    return StatsResponse(
        avg_response_time=round(avg_rt, 2),
        max_response_time=round(max_rt, 2),
        min_response_time=round(min_rt, 2),
        p95_response_time=round(p95_rt, 2),
    )


@router.get("/{endpoint_id}/histogram", response_model=HistogramResponse)
async def get_histogram(
    endpoint_id: int,
    time_range: Optional[str] = Query("24h"),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return response-time distribution histogram buckets."""
    since = _time_filter(time_range)
    stmt = (
        select(CheckRecord.response_time_ms)
        .where(
            CheckRecord.endpoint_id == endpoint_id,
            CheckRecord.response_time_ms.isnot(None),
            CheckRecord.checked_at >= since,
        )
    )
    result = await db.execute(stmt)
    times = [row[0] for row in result.all()]

    if not times:
        return HistogramResponse(buckets=[])

    # Build 10 equal-width buckets
    min_t = min(times)
    max_t = max(times)
    bucket_width = max((max_t - min_t) / 10, 1)
    buckets = []
    for i in range(10):
        start = min_t + i * bucket_width
        end = start + bucket_width
        count = sum(1 for t in times if start <= t < end) if i < 9 else sum(1 for t in times if t >= start)
        buckets.append(HistogramBucket(range_start=round(start, 2), range_end=round(end, 2), count=count))

    return HistogramResponse(buckets=buckets)
