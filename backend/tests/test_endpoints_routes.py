"""Unit tests for the endpoints API routes (/api/endpoints)."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.api_endpoint import APIEndpoint
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


def _make_mock_endpoint(
    endpoint_id: int = 1,
    name: str = "Test API",
    url: str = "https://api.example.com/health",
    method: str = "GET",
) -> MagicMock:
    ep = MagicMock(spec=APIEndpoint)
    ep.id = endpoint_id
    ep.name = name
    ep.url = url
    ep.method = method
    ep.headers_json = None
    ep.request_body_json = None
    ep.expected_status_code = 200
    ep.expected_response_text = None
    ep.description = "A test endpoint"
    ep.monitor_interval_seconds = 300
    ep.api_key_id = None
    ep.current_status = "unknown"
    ep.last_check_at = None
    ep.created_at = datetime(2024, 6, 1)
    ep.updated_at = datetime(2024, 6, 1)
    return ep


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
# Tests – POST /api/endpoints/ (create)
# ---------------------------------------------------------------------------

class TestCreateEndpoint:
    """Tests for POST /api/endpoints/."""

    def test_create_endpoint_returns_201(self):
        """Validates: Requirements 2.3 – valid endpoint is persisted and returned."""
        created = _make_mock_endpoint(endpoint_id=10)

        async def _fake_db():
            session = AsyncMock()
            session.add = MagicMock()

            async def _flush():
                pass

            async def _refresh(obj):
                obj.id = created.id
                obj.name = created.name
                obj.url = created.url
                obj.method = created.method
                obj.headers_json = created.headers_json
                obj.expected_status_code = created.expected_status_code
                obj.description = created.description
                obj.monitor_interval_seconds = created.monitor_interval_seconds
                obj.api_key_id = created.api_key_id
                obj.current_status = created.current_status
                obj.last_check_at = created.last_check_at
                obj.created_at = created.created_at
                obj.updated_at = created.updated_at

            session.flush = _flush
            session.refresh = _refresh
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.post("/api/endpoints/", json={
            "name": "Test API",
            "url": "https://api.example.com/health",
            "method": "GET",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert body["id"] == 10
        assert body["name"] == "Test API"
        assert body["url"] == "https://api.example.com/health"
        assert body["method"] == "GET"
        assert body["current_status"] == "unknown"

    def test_create_endpoint_invalid_url_returns_422(self):
        """Validates: Requirements 2.4 – URL without http/https prefix is rejected."""
        app.dependency_overrides[get_current_user] = _override_current_user()

        async def _fake_db():
            session = AsyncMock()
            yield session

        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.post("/api/endpoints/", json={
            "name": "Bad URL",
            "url": "ftp://not-valid.com",
        })
        assert resp.status_code == 422

    def test_create_endpoint_requires_auth(self):
        """Validates: Requirements 2.3 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.post("/api/endpoints/", json={
            "name": "Test",
            "url": "https://example.com",
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – GET /api/endpoints/ (list)
# ---------------------------------------------------------------------------

class TestListEndpoints:
    """Tests for GET /api/endpoints/."""

    def test_list_endpoints_returns_list(self):
        """Validates: Requirements 2.3 – list all configured endpoints."""
        mock_eps = [
            _make_mock_endpoint(1, "API A", "https://a.example.com"),
            _make_mock_endpoint(2, "API B", "https://b.example.com"),
        ]

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = mock_eps
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars

        async def _fake_db():
            session = AsyncMock()
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/endpoints/")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        assert body[0]["name"] == "API A"
        assert body[1]["name"] == "API B"

    def test_list_endpoints_requires_auth(self):
        """Validates: Requirements 2.3 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/endpoints/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – GET /api/endpoints/{id} (detail)
# ---------------------------------------------------------------------------

class TestGetEndpoint:
    """Tests for GET /api/endpoints/{id}."""

    def test_get_endpoint_returns_single(self):
        """Validates: Requirements 2.3 – retrieve a single endpoint by ID."""
        mock_ep = _make_mock_endpoint(5, "Single EP", "https://single.example.com")

        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_ep
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/endpoints/5")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 5
        assert body["name"] == "Single EP"

    def test_get_nonexistent_endpoint_returns_404(self):
        """Validates: Requirements 2.3 – nonexistent endpoint returns 404."""
        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/endpoints/999")
        assert resp.status_code == 404

    def test_get_endpoint_requires_auth(self):
        """Validates: Requirements 2.3 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/endpoints/1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – PUT /api/endpoints/{id} (update)
# ---------------------------------------------------------------------------

class TestUpdateEndpoint:
    """Tests for PUT /api/endpoints/{id}."""

    def test_update_endpoint_fields(self):
        """Validates: Requirements 2.3 – update endpoint fields."""
        mock_ep = _make_mock_endpoint(3, "Old Name", "https://old.example.com")

        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_ep
            session.execute.return_value = mock_result

            async def _flush():
                pass

            async def _refresh(obj):
                # After setattr in the route, the mock fields are updated
                pass

            session.flush = _flush
            session.refresh = _refresh
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.put("/api/endpoints/3", json={
            "name": "New Name",
            "url": "https://new.example.com",
        })
        assert resp.status_code == 200
        # Verify setattr was applied on the mock
        assert mock_ep.name == "New Name"
        assert mock_ep.url == "https://new.example.com"

    def test_update_endpoint_requires_auth(self):
        """Validates: Requirements 2.3 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.put("/api/endpoints/1", json={"name": "X"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – DELETE /api/endpoints/{id}
# ---------------------------------------------------------------------------

class TestDeleteEndpoint:
    """Tests for DELETE /api/endpoints/{id}."""

    def test_delete_endpoint_returns_204(self):
        """Validates: Requirements 2.6 – deleting an endpoint removes it."""
        mock_ep = _make_mock_endpoint(7)

        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_ep
            session.execute.return_value = mock_result
            session.delete = AsyncMock()

            async def _flush():
                pass

            session.flush = _flush
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.delete("/api/endpoints/7")
        assert resp.status_code == 204

    def test_delete_nonexistent_endpoint_returns_404(self):
        """Validates: Requirements 2.6 – deleting a nonexistent endpoint returns 404."""
        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.delete("/api/endpoints/999")
        assert resp.status_code == 404

    def test_delete_endpoint_requires_auth(self):
        """Validates: Requirements 2.6 – endpoint requires authentication."""
        client = TestClient(app)
        resp = client.delete("/api/endpoints/1")
        assert resp.status_code == 401
