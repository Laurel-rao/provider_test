"""API routes for monitoring status and health rate."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.api_endpoint import APIEndpoint
from app.models.user import User
from app.schemas.monitor import EndpointStatusResponse, HealthRateResponse
from app.services.auth import get_current_user

router = APIRouter()


@router.get("/status", response_model=List[EndpointStatusResponse])
async def get_all_status(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current status of all monitored endpoints."""
    result = await db.execute(select(APIEndpoint).order_by(APIEndpoint.id))
    return result.scalars().all()


@router.get("/status/{endpoint_id}", response_model=EndpointStatusResponse)
async def get_endpoint_status(
    endpoint_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current status of a single endpoint."""
    result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.id == endpoint_id)
    )
    endpoint = result.scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )
    return endpoint


@router.get("/health-rate", response_model=HealthRateResponse)
async def get_health_rate(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculate and return the overall health rate across all endpoints."""
    result = await db.execute(select(APIEndpoint))
    endpoints = result.scalars().all()

    total = len(endpoints)
    healthy = sum(1 for ep in endpoints if ep.current_status == "normal")
    unhealthy = sum(1 for ep in endpoints if ep.current_status == "abnormal")
    unknown = sum(1 for ep in endpoints if ep.current_status == "unknown")
    health_rate = healthy / total if total > 0 else 0.0

    return HealthRateResponse(
        total=total,
        healthy=healthy,
        unhealthy=unhealthy,
        unknown=unknown,
        health_rate=health_rate,
    )
