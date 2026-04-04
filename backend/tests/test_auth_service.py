"""Unit tests for the JWT authentication service."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.config import settings
from app.services.auth import (
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)


# --- Password hashing tests ---


def test_get_password_hash_returns_bcrypt_hash():
    hashed = get_password_hash("mysecret")
    assert hashed.startswith("$2b$")


def test_verify_password_correct():
    hashed = get_password_hash("mysecret")
    assert verify_password("mysecret", hashed) is True


def test_verify_password_incorrect():
    hashed = get_password_hash("mysecret")
    assert verify_password("wrongpassword", hashed) is False


# --- JWT token tests ---


def test_create_access_token_contains_sub_claim():
    token = create_access_token({"sub": "admin"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert payload["sub"] == "admin"


def test_create_access_token_contains_exp_claim():
    token = create_access_token({"sub": "admin"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert "exp" in payload


def test_create_access_token_exp_is_in_future():
    token = create_access_token({"sub": "admin"})
    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    exp = datetime.utcfromtimestamp(payload["exp"])
    assert exp > datetime.utcnow()


# --- get_current_user tests ---


@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    token = create_access_token({"sub": "admin"})

    mock_user = MagicMock()
    mock_user.username = "admin"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_user

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    user = await get_current_user(token=token, db=mock_db)
    assert user.username == "admin"


@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    mock_db = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token="invalid.token.here", db=mock_db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_expired_token():
    expired_data = {"sub": "admin", "exp": datetime.utcnow() - timedelta(hours=1)}
    token = jwt.encode(expired_data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    mock_db = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=mock_db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_missing_sub_claim():
    token = create_access_token({})  # no "sub" key

    mock_db = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=mock_db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_user_not_found():
    token = create_access_token({"sub": "nonexistent"})

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=mock_db)
    assert exc_info.value.status_code == 401
