from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models.api_endpoint import APIEndpoint
from app.models.user import User
from app.services.auth import get_current_user, get_password_hash


def _make_mock_user() -> MagicMock:
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "admin"
    user.password_hash = get_password_hash("secret123")
    user.created_at = datetime(2024, 1, 1)
    user.updated_at = datetime(2024, 1, 1)
    return user


def _make_mock_provider(provider_id: int = 1, endpoint_id: int = 10, name: str = "Provider") -> MagicMock:
    endpoint = MagicMock(spec=APIEndpoint)
    endpoint.id = endpoint_id
    endpoint.monitor_interval_seconds = 600
    endpoint.current_status = "normal"
    endpoint.last_check_at = datetime(2024, 6, 1, 12, 0)

    provider = MagicMock()
    provider.id = provider_id
    provider.name = name
    provider.provider_type = "openai"
    provider.base_url = "https://api.example.com/v1"
    provider.masked_key = "sk-****"
    provider.model = "gpt-5.4"
    provider.description = "desc"
    provider.endpoint_id = endpoint_id
    provider.endpoint = endpoint
    provider.created_at = datetime(2024, 6, 1, 10, 0)
    provider.updated_at = datetime(2024, 6, 1, 10, 0)
    return provider


MOCK_USER = _make_mock_user()


def _override_current_user():
    async def _fake():
        return MOCK_USER
    return _fake


@pytest.fixture(autouse=True)
def _reset_overrides():
    yield
    app.dependency_overrides.clear()


class TestAIProviderRoutes:
    def test_create_provider_accepts_monitor_interval(self):
        created = _make_mock_provider(provider_id=2, endpoint_id=20, name="Created Provider")

        async def _fake_db():
            session = AsyncMock()
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        with patch("app.routers.ai_providers.AIProviderService.create_provider", new=AsyncMock(return_value=created)) as mock_create:
            resp = client.post(
                "/api/ai-providers/",
                json={
                    "name": "Created Provider",
                    "provider_type": "openai",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "secret",
                    "model": "gpt-5.4",
                    "monitor_interval_seconds": 600,
                },
            )

        assert resp.status_code == 201
        assert resp.json()["monitor_interval_seconds"] == 600
        payload = mock_create.await_args.args[0]
        assert payload.monitor_interval_seconds == 600

    def test_copy_provider_returns_new_provider(self):
        copied = _make_mock_provider(provider_id=3, endpoint_id=30, name="Copied Provider")

        async def _fake_db():
            session = AsyncMock()
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        with patch("app.routers.ai_providers.AIProviderService.copy_provider", new=AsyncMock(return_value=copied)):
            resp = client.post("/api/ai-providers/1/copy")

        assert resp.status_code == 201
        body = resp.json()
        assert body["id"] == 3
        assert body["name"] == "Copied Provider"
        assert body["monitor_interval_seconds"] == 600

    def test_test_provider_returns_probe_result(self):
        async def _fake_db():
            session = AsyncMock()
            yield session

        app.dependency_overrides[get_current_user] = _override_current_user()
        app.dependency_overrides[get_db] = _fake_db
        client = TestClient(app)

        with patch(
            "app.routers.ai_providers.AIProviderService.test_provider",
            new=AsyncMock(
                return_value={
                    "provider_id": 4,
                    "endpoint_id": 40,
                    "is_success": True,
                    "status_code": 200,
                    "response_time_ms": 123.45,
                    "error_message": None,
                    "checked_at": datetime(2024, 6, 1, 12, 0),
                    "current_status": "normal",
                }
            ),
        ):
            resp = client.post("/api/ai-providers/4/test")

        assert resp.status_code == 200
        body = resp.json()
        assert body["provider_id"] == 4
        assert body["is_success"] is True
        assert body["status_code"] == 200
