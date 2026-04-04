"""Unit tests for the keys API routes (/api/keys)."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.api_endpoint import APIEndpoint
from app.models.api_key import APIKey
from app.models.user import User
from app.services.auth import get_current_user, get_password_hash


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_user() -> MagicMock:
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "admin"
    user.password_hash = get_password_hash("secret123")
    user.created_at = datetime(2024, 1, 1)
    user.updated_at = datetime(2024, 1, 1)
    return user


def _make_mock_key(key_id: int = 1, name: str = "Test Key", masked: str = "sk-t****t123") -> MagicMock:
    key = MagicMock(spec=APIKey)
    key.id = key_id
    key.name = name
    key.encrypted_value = "encrypted_data"
    key.masked_value = masked
    key.created_at = datetime(2024, 6, 1)
    return key


MOCK_USER = _make_mock_user()


def _override_current_user():
    """Override get_current_user to return a mock user without JWT validation."""
    async def _fake():
        return MOCK_USER
    return _fake


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests – GET /api/keys
# ---------------------------------------------------------------------------

class TestListKeys:
    """Tests for GET /api/keys."""

    def test_list_keys_returns_masked_values(self):
        """Validates: Requirements 3.1, 3.3 – list keys with masked display."""
        mock_keys = [
            _make_mock_key(1, "Key A", "sk-t****t123"),
            _make_mock_key(2, "Key B", "ab****yz"),
        ]

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_keys
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars

        async def _fake_db():
            session = AsyncMock()
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/keys/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        assert body[0]["masked_value"] == "sk-t****t123"
        assert body[1]["masked_value"] == "ab****yz"
        # Ensure no raw encrypted value is exposed
        assert "encrypted_value" not in body[0]

    def test_list_keys_requires_auth(self):
        """Validates: Requirements 3.1 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/keys/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – POST /api/keys
# ---------------------------------------------------------------------------

class TestCreateKey:
    """Tests for POST /api/keys."""

    def test_create_key_encrypts_and_masks(self):
        """Validates: Requirements 3.2, 3.3 – key is encrypted and masked on creation."""
        created_key = MagicMock(spec=APIKey)
        created_key.id = 10
        created_key.name = "My API Key"
        created_key.encrypted_value = "fernet_encrypted"
        created_key.masked_value = "sk-l****key1"
        created_key.created_at = datetime(2024, 6, 15)

        async def _fake_db():
            session = AsyncMock()
            session.add = MagicMock()

            async def _flush():
                pass

            async def _refresh(obj):
                obj.id = created_key.id
                obj.name = created_key.name
                obj.encrypted_value = created_key.encrypted_value
                obj.masked_value = created_key.masked_value
                obj.created_at = created_key.created_at

            session.flush = _flush
            session.refresh = _refresh
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.post("/api/keys/", json={"name": "My API Key", "value": "sk-live-test-key1"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "My API Key"
        assert body["id"] == 10
        # Response should contain masked_value, not the raw value
        assert "masked_value" in body
        assert "value" not in body

    def test_create_key_requires_auth(self):
        """Validates: Requirements 3.2 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.post("/api/keys/", json={"name": "Key", "value": "secret"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – DELETE /api/keys/{id}
# ---------------------------------------------------------------------------

class TestDeleteKey:
    """Tests for DELETE /api/keys/{id}."""

    def test_delete_key_unbinds_endpoints(self):
        """Validates: Requirements 3.5 – deleting a key unbinds associated endpoints."""
        mock_key = _make_mock_key(5)

        # Simulate two endpoints bound to this key
        ep1 = MagicMock(spec=APIEndpoint)
        ep1.api_key_id = 5
        ep2 = MagicMock(spec=APIEndpoint)
        ep2.api_key_id = 5

        call_count = 0

        async def _fake_db():
            nonlocal call_count
            session = AsyncMock()

            def _execute_side_effect(stmt):
                nonlocal call_count
                call_count += 1
                result = MagicMock()
                if call_count == 1:
                    # First call: select APIKey
                    result.scalar_one_or_none.return_value = mock_key
                else:
                    # Second call: select associated endpoints
                    scalars_mock = MagicMock()
                    scalars_mock.all.return_value = [ep1, ep2]
                    result.scalars.return_value = scalars_mock
                return result

            session.execute = AsyncMock(side_effect=_execute_side_effect)
            session.delete = AsyncMock()

            async def _flush():
                pass

            session.flush = _flush
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.delete("/api/keys/5")
        assert resp.status_code == 204

        # Verify endpoints were unbound
        assert ep1.api_key_id is None
        assert ep2.api_key_id is None

    def test_delete_nonexistent_key_returns_404(self):
        """Validates: Requirements 3.5 – deleting a non-existent key returns 404."""
        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.delete("/api/keys/999")
        assert resp.status_code == 404

    def test_delete_key_requires_auth(self):
        """Validates: Requirements 3.5 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.delete("/api/keys/1")
        assert resp.status_code == 401
