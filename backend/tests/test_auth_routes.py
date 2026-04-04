"""Unit tests for the auth API routes (/api/auth)."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.user import User
from app.services.auth import get_password_hash


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_user(username: str = "admin", password: str = "secret123") -> MagicMock:
    """Create a mock User ORM object with a real bcrypt hash."""
    user = MagicMock(spec=User)
    user.id = 1
    user.username = username
    user.password_hash = get_password_hash(password)
    user.created_at = datetime(2024, 1, 1)
    user.updated_at = datetime(2024, 1, 1)
    return user


def _create_token(sub: str, expired: bool = False) -> str:
    """Create a JWT token, optionally already expired."""
    data = {"sub": sub}
    if expired:
        data["exp"] = datetime.utcnow() - timedelta(hours=1)
    else:
        data["exp"] = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode(data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOCK_USER = _make_mock_user()


def _override_get_db(user_to_return):
    """Return an async generator that yields a mock AsyncSession."""
    async def _fake_get_db():
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user_to_return

        session = AsyncMock()
        session.execute.return_value = mock_result
        yield session

    return _fake_get_db


@pytest.fixture(autouse=True)
def _reset_overrides():
    """Ensure dependency overrides are cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests – POST /api/auth/login
# ---------------------------------------------------------------------------

class TestLogin:
    """Tests for POST /api/auth/login."""

    def test_valid_credentials_returns_jwt(self):
        """Validates: Requirements 1.2 – valid credentials return a JWT."""
        app.dependency_overrides[get_db] = _override_get_db(MOCK_USER)
        client = TestClient(app)

        resp = client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})

        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        # Verify the token is a valid JWT containing the correct subject
        payload = jwt.decode(body["access_token"], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert payload["sub"] == "admin"

    def test_invalid_password_returns_401(self):
        """Validates: Requirements 1.3 – wrong password returns 401."""
        app.dependency_overrides[get_db] = _override_get_db(MOCK_USER)
        client = TestClient(app)

        resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})

        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]

    def test_nonexistent_username_returns_401(self):
        """Validates: Requirements 1.3 – nonexistent user returns 401."""
        app.dependency_overrides[get_db] = _override_get_db(None)  # user not found
        client = TestClient(app)

        resp = client.post("/api/auth/login", json={"username": "nobody", "password": "whatever"})

        assert resp.status_code == 401
        assert "Invalid" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Tests – GET /api/auth/me
# ---------------------------------------------------------------------------

class TestGetMe:
    """Tests for GET /api/auth/me."""

    def test_valid_token_returns_user_info(self):
        """Validates: Requirements 1.2 – authenticated user can fetch their info."""
        app.dependency_overrides[get_db] = _override_get_db(MOCK_USER)
        client = TestClient(app)

        token = _create_token("admin")
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["username"] == "admin"
        assert body["id"] == 1

    def test_no_token_returns_401(self):
        """Validates: Requirements 1.6 – missing token returns 401."""
        client = TestClient(app)

        resp = client.get("/api/auth/me")

        assert resp.status_code == 401

    def test_expired_token_returns_401(self):
        """Validates: Requirements 1.6 – expired JWT returns 401."""
        app.dependency_overrides[get_db] = _override_get_db(MOCK_USER)
        client = TestClient(app)

        token = _create_token("admin", expired=True)
        resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 401
