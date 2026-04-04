"""API routes for AI Provider management and dashboard."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.ai_provider import (
    AIProviderCreate,
    AIProviderResponse,
    AIProviderUpdate,
    AvailabilitySlot,
    DashboardSummary,
    ProviderAvailability,
    ProviderProbeCard,
    ProviderTestResponse,
    ProviderTrend,
)
from app.services.ai_provider_service import AIProviderService
from app.services.auth import get_current_user

router = APIRouter()


def _svc(db: AsyncSession) -> AIProviderService:
    return AIProviderService(db)


def _to_response(p) -> dict:
    """Convert AIProvider ORM to response dict with endpoint status."""
    d = {
        "id": p.id, "name": p.name, "provider_type": p.provider_type,
        "base_url": p.base_url, "masked_key": p.masked_key, "model": p.model,
        "description": p.description, "stream": p.stream, "endpoint_id": p.endpoint_id,
        "monitor_interval_seconds": p.endpoint.monitor_interval_seconds if p.endpoint else None,
        "current_status": p.endpoint.current_status if p.endpoint else None,
        "last_check_at": p.endpoint.last_check_at if p.endpoint else None,
        "created_at": p.created_at, "updated_at": p.updated_at,
    }
    return d


@router.get("/", response_model=List[AIProviderResponse])
async def list_providers(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    providers = await _svc(db).list_providers()
    return [_to_response(p) for p in providers]


@router.post("/", response_model=AIProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: AIProviderCreate,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await _svc(db).create_provider(body)
    return _to_response(p)


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db).get_dashboard_summary()


@router.get("/dashboard/response-trend", response_model=List[ProviderTrend])
async def dashboard_response_trend(
    provider_type: Optional[str] = Query(None),
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db).get_response_trend(provider_type)


@router.get("/dashboard/availability", response_model=List[ProviderAvailability])
async def dashboard_availability(
    provider_type: Optional[str] = Query(None),
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db).get_availability_timeline(provider_type)


@router.get("/dashboard/probe-cards", response_model=List[ProviderProbeCard])
async def dashboard_probe_cards(
    provider_type: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=720),
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return 60-point probe cards for each AI provider within the given time range."""
    return await _svc(db).get_probe_cards(provider_type, hours)


@router.get("/{provider_id}", response_model=AIProviderResponse)
async def get_provider(
    provider_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await _svc(db).get_provider(provider_id)
    return _to_response(p)


@router.put("/{provider_id}", response_model=AIProviderResponse)
async def update_provider(
    provider_id: int,
    body: AIProviderUpdate,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await _svc(db).update_provider(provider_id, body)
    return _to_response(p)


@router.post("/{provider_id}/copy", response_model=AIProviderResponse, status_code=status.HTTP_201_CREATED)
async def copy_provider(
    provider_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await _svc(db).copy_provider(provider_id)
    return _to_response(p)


@router.post("/{provider_id}/test", response_model=ProviderTestResponse)
async def test_provider(
    provider_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db).test_provider(provider_id)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: int,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _svc(db).delete_provider(provider_id)
