from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.api_endpoint import APIEndpoint
from app.models.api_key import APIKey
from app.models.user import User
from app.schemas.key import KeyCreate, KeyResponse
from app.services.auth import get_current_user
from app.services.key_encryptor import key_encryptor

router = APIRouter()


@router.get("/", response_model=List[KeyResponse])
async def list_keys(
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all API keys with masked values."""
    result = await db.execute(select(APIKey).order_by(APIKey.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=KeyResponse, status_code=status.HTTP_201_CREATED)
async def create_key(
    body: KeyCreate,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key (encrypted storage, masked display)."""
    encrypted_value = key_encryptor.encrypt(body.value)
    masked_value = key_encryptor.mask(body.value)

    api_key = APIKey(
        name=body.name,
        encrypted_value=encrypted_value,
        masked_value=masked_value,
    )
    db.add(api_key)
    await db.flush()
    await db.refresh(api_key)
    return api_key


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an API key and unbind all associated endpoints."""
    result = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    # Unbind all endpoints that reference this key
    ep_result = await db.execute(
        select(APIEndpoint).where(APIEndpoint.api_key_id == key_id)
    )
    for endpoint in ep_result.scalars().all():
        endpoint.api_key_id = None

    await db.delete(api_key)
    await db.flush()
