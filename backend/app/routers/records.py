"""API routes for check records (history) and CSV export."""

import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.check_record import CheckRecord
from app.models.user import User
from app.schemas.log import PaginatedResponse
from app.schemas.record import CheckRecordResponse
from app.services.auth import get_current_user

router = APIRouter()


def _to_response(r) -> dict:
    ep = r.endpoint if r.endpoint else None
    return {
        "id": r.id,
        "endpoint_id": r.endpoint_id,
        "endpoint_name": ep.name if ep else None,
        "endpoint_url": ep.url if ep else None,
        "endpoint_method": ep.method if ep else None,
        "status_code": r.status_code,
        "response_time_ms": r.response_time_ms,
        "is_success": r.is_success,
        "error_message": r.error_message,
        "response_body": getattr(r, "response_body", None),
        "checked_at": r.checked_at,
    }


def _build_query(endpoint_id, start_time, end_time, status_filter):
    stmt = (
        select(CheckRecord)
        .options(selectinload(CheckRecord.endpoint))
        .order_by(CheckRecord.checked_at.desc())
    )
    if endpoint_id is not None:
        stmt = stmt.where(CheckRecord.endpoint_id == endpoint_id)
    if start_time is not None:
        stmt = stmt.where(CheckRecord.checked_at >= start_time)
    if end_time is not None:
        stmt = stmt.where(CheckRecord.checked_at <= end_time)
    if status_filter == "200":
        stmt = stmt.where(CheckRecord.status_code == 200)
    elif status_filter == "non200":
        stmt = stmt.where(or_(CheckRecord.status_code.is_(None), CheckRecord.status_code != 200))
    return stmt


@router.get("/", response_model=PaginatedResponse[CheckRecordResponse])
async def list_records(
    endpoint_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, pattern="^(200|non200)$"),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base_stmt = _build_query(endpoint_id, start_time, end_time, status)
    count_stmt = select(func.count()).select_from(base_stmt.order_by(None).subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar() or 0

    stmt = base_stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    items = [_to_response(r) for r in result.scalars().all()]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/export", response_class=StreamingResponse)
async def export_records(
    endpoint_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, pattern="^(200|non200)$"),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(_build_query(endpoint_id, start_time, end_time, status))
    records = result.scalars().all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "endpoint_name", "url", "method", "status_code",
                      "response_time_ms", "is_success", "error_message", "checked_at"])
    for r in records:
        ep = r.endpoint
        writer.writerow([
            r.id, ep.name if ep else "", ep.url if ep else "", ep.method if ep else "",
            r.status_code, r.response_time_ms, r.is_success, r.error_message, r.checked_at,
        ])
    output.seek(0)
    return StreamingResponse(
        output, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=check_records.csv"},
    )


@router.get("/{record_id}", response_model=CheckRecordResponse)
async def get_record(
    record_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CheckRecord)
        .options(selectinload(CheckRecord.endpoint))
        .where(CheckRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return _to_response(record)
