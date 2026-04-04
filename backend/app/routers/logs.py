"""API routes for error log queries with filtering and pagination."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.error_log import ErrorLog
from app.models.user import User
from app.schemas.log import ErrorLogResponse, PaginatedResponse
from app.services.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[ErrorLogResponse])
async def list_logs(
    endpoint_id: Optional[int] = Query(None),
    error_type: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query error logs with optional filters and pagination."""
    base = select(ErrorLog)
    if endpoint_id is not None:
        base = base.where(ErrorLog.endpoint_id == endpoint_id)
    if error_type is not None:
        base = base.where(ErrorLog.error_type == error_type)
    if start_time is not None:
        base = base.where(ErrorLog.created_at >= start_time)
    if end_time is not None:
        base = base.where(ErrorLog.created_at <= end_time)

    # Count total
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    # Paginate
    stmt = base.order_by(ErrorLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = result.scalars().all()

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)
