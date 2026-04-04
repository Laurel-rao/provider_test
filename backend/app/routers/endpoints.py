"""API routes for endpoint management (CRUD)."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.api_endpoint import APIEndpoint
from app.models.user import User
from app.schemas.endpoint import EndpointCreate, EndpointResponse, EndpointUpdate
from app.services.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[EndpointResponse])
async def list_endpoints(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all monitored API endpoints."""
    result = await db.execute(select(APIEndpoint).order_by(APIEndpoint.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=EndpointResponse, status_code=status.HTTP_201_CREATED)
async def create_endpoint(
    body: EndpointCreate,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new monitored API endpoint."""
    endpoint = APIEndpoint(
        name=body.name,
        url=body.url,
        method=body.method,
        headers_json=body.headers_json,
        request_body_json=body.request_body_json,
        expected_status_code=body.expected_status_code,
        expected_response_text=body.expected_response_text,
        description=body.description,
        monitor_interval_seconds=body.monitor_interval_seconds,
        api_key_id=body.api_key_id,
    )
    db.add(endpoint)
    await db.flush()
    await db.refresh(endpoint)

    # Register with scheduler (may not exist yet)
    try:
        from app.services.monitor_scheduler import scheduler
        scheduler.add_endpoint(endpoint.id, endpoint.monitor_interval_seconds)
    except (ImportError, Exception):
        pass

    return endpoint


@router.get("/{endpoint_id}", response_model=EndpointResponse)
async def get_endpoint(
    endpoint_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single API endpoint by ID."""
    result = await db.execute(select(APIEndpoint).where(APIEndpoint.id == endpoint_id))
    endpoint = result.scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )
    return endpoint


@router.put("/{endpoint_id}", response_model=EndpointResponse)
async def update_endpoint(
    endpoint_id: int,
    body: EndpointUpdate,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing API endpoint."""
    result = await db.execute(select(APIEndpoint).where(APIEndpoint.id == endpoint_id))
    endpoint = result.scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    interval_changed = (
        "monitor_interval_seconds" in update_data
        and update_data["monitor_interval_seconds"] != endpoint.monitor_interval_seconds
    )

    for field, value in update_data.items():
        setattr(endpoint, field, value)

    await db.flush()
    await db.refresh(endpoint)

    # Update scheduler if interval changed
    if interval_changed:
        try:
            from app.services.monitor_scheduler import scheduler
            scheduler.update_interval(endpoint.id, endpoint.monitor_interval_seconds)
        except (ImportError, Exception):
            pass

    return endpoint


@router.delete("/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_endpoint(
    endpoint_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an API endpoint and remove its scheduler job."""
    result = await db.execute(select(APIEndpoint).where(APIEndpoint.id == endpoint_id))
    endpoint = result.scalar_one_or_none()
    if endpoint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )

    # Remove from scheduler before deleting
    try:
        from app.services.monitor_scheduler import scheduler
        scheduler.remove_endpoint(endpoint.id)
    except (ImportError, Exception):
        pass

    await db.delete(endpoint)
    await db.flush()
