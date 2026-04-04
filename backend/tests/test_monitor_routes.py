"""Unit tests for the monitor API routes (/api/monitor)."""

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
    current_status: str = "unknown",
    last_check_at: datetime | None = None,
) -> MagicMock:
    ep = MagicMock(spec=APIEndpoint)
    ep.id = endpoint_id
    ep.name = name
    ep.url = url
    ep.current_status = current_status
    ep.last_check_at = last_check_at
    return ep


MOCK_USER = _make_mock_user()


def _override_current_user():
    async def _fake():
        return MOCK_USER
    return _fake


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests – GET /api/monitor/status
# ---------------------------------------------------------------------------

class TestGetAllStatus:
    """Tests for GET /api/monitor/status."""

    def test_returns_all_endpoint_statuses(self):
        """Validates: Requirements 5.1 – display all endpoint statuses."""
        mock_eps = [
            _make_mock_endpoint(1, "API A", "https://a.example.com", "normal", datetime(2024, 6, 1, 12, 0)),
            _make_mock_endpoint(2, "API B", "https://b.example.com", "abnormal", datetime(2024, 6, 1, 12, 1)),
            _make_mock_endpoint(3, "API C", "https://c.example.com", "unknown"),
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

        resp = client.get("/api/monitor/status")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 3
        assert body[0]["name"] == "API A"
        assert body[0]["current_status"] == "normal"
        assert body[1]["current_status"] == "abnormal"
        assert body[2]["current_status"] == "unknown"
        assert body[2]["last_check_at"] is None

    def test_requires_auth(self):
        """Validates: Requirements 5.1 – status endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/monitor/status")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – GET /api/monitor/status/{endpoint_id}
# ---------------------------------------------------------------------------

class TestGetEndpointStatus:
    """Tests for GET /api/monitor/status/{endpoint_id}."""

    def test_returns_single_endpoint_status(self):
        """Validates: Requirements 5.1 – retrieve single endpoint status."""
        mock_ep = _make_mock_endpoint(5, "Single EP", "https://single.example.com", "normal", datetime(2024, 6, 1))

        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = mock_ep
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/monitor/status/5")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 5
        assert body["name"] == "Single EP"
        assert body["current_status"] == "normal"

    def test_nonexistent_endpoint_returns_404(self):
        """Validates: Requirements 5.1 – nonexistent endpoint returns 404."""
        async def _fake_db():
            session = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = None
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/monitor/status/999")
        assert resp.status_code == 404

    def test_requires_auth(self):
        """Validates: Requirements 5.1 – status endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/monitor/status/1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests – GET /api/monitor/health-rate
# ---------------------------------------------------------------------------

class TestGetHealthRate:
    """Tests for GET /api/monitor/health-rate."""

    def test_calculates_health_rate(self):
        """Validates: Requirements 5.4 – health rate = healthy / total."""
        mock_eps = [
            _make_mock_endpoint(1, "A", "https://a.com", "normal"),
            _make_mock_endpoint(2, "B", "https://b.com", "normal"),
            _make_mock_endpoint(3, "C", "https://c.com", "abnormal"),
            _make_mock_endpoint(4, "D", "https://d.com", "unknown"),
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

        resp = client.get("/api/monitor/health-rate")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 4
        assert body["healthy"] == 2
        assert body["unhealthy"] == 1
        assert body["unknown"] == 1
        assert body["health_rate"] == 0.5

    def test_health_rate_zero_when_no_endpoints(self):
        """Validates: Requirements 5.4 – health rate is 0 when no endpoints exist."""
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars

        async def _fake_db():
            session = AsyncMock()
            session.execute.return_value = mock_result
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        resp = client.get("/api/monitor/health-rate")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["healthy"] == 0
        assert body["unhealthy"] == 0
        assert body["unknown"] == 0
        assert body["health_rate"] == 0.0

    def test_requires_auth(self):
        """Validates: Requirements 5.4 – health-rate endpoint requires authentication."""
        client = TestClient(app)
        resp = client.get("/api/monitor/health-rate")
        assert resp.status_code == 401
