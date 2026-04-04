"""Unit tests for the HealthChecker service."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio

from app.models.api_endpoint import APIEndpoint
from app.models.check_record import CheckRecord
from app.models.error_log import ErrorLog
from app.services.health_checker import (
    HealthChecker,
    _classify_error,
    _extract_response_text,
    _parse_headers,
    _parse_json_body,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_endpoint(**overrides):
    """Create a minimal APIEndpoint-like object for testing."""
    defaults = dict(
        id=1,
        name="Test API",
        url="https://example.com/health",
        method="GET",
        headers_json=None,
        request_body_json=None,
        expected_status_code=200,
        expected_response_text=None,
        current_status="unknown",
        last_check_at=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_db() -> AsyncMock:
    """Return a mock AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


def _make_response(status_code: int = 200, elapsed_seconds: float = 0.123):
    """Build a fake httpx.Response-like object."""
    from datetime import timedelta
    resp = MagicMock()
    resp.status_code = status_code
    resp.elapsed = timedelta(seconds=elapsed_seconds)
    return resp


# ---------------------------------------------------------------------------
# _parse_headers tests
# ---------------------------------------------------------------------------

class TestParseHeaders:
    def test_none_returns_empty(self):
        assert _parse_headers(None) == {}

    def test_empty_string_returns_empty(self):
        assert _parse_headers("") == {}

    def test_valid_json_dict(self):
        h = json.dumps({"X-Custom": "value"})
        assert _parse_headers(h) == {"X-Custom": "value"}

    def test_invalid_json_returns_empty(self):
        assert _parse_headers("not-json") == {}

    def test_json_array_returns_empty(self):
        assert _parse_headers("[1,2,3]") == {}


class TestParseJsonBody:
    def test_none_returns_none(self):
        assert _parse_json_body(None) is None

    def test_invalid_json_returns_none(self):
        assert _parse_json_body("not-json") is None

    def test_valid_json_returns_object(self):
        assert _parse_json_body('{"hello":"world"}') == {"hello": "world"}


# ---------------------------------------------------------------------------
# _classify_error tests
# ---------------------------------------------------------------------------

class TestClassifyError:
    def test_none(self):
        assert _classify_error(None) == "unknown_error"

    def test_timeout(self):
        assert _classify_error("Request timed out") == "timeout"

    def test_connection(self):
        assert _classify_error("Connection error") == "connection_error"

    def test_status_mismatch(self):
        assert _classify_error("Expected status 200, got 500") == "status_mismatch"

    def test_generic(self):
        assert _classify_error("something else") == "http_error"


# ---------------------------------------------------------------------------
# HealthChecker.check tests
# ---------------------------------------------------------------------------

class TestHealthCheckerCheck:
    @pytest.fixture
    def checker(self):
        return HealthChecker()

    @pytest.mark.asyncio
    async def test_successful_check(self, checker):
        endpoint = _make_endpoint()
        db = _make_db()
        fake_resp = _make_response(status_code=200, elapsed_seconds=0.05)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            record = await checker.check(endpoint, db)

        assert record.is_success is True
        assert record.status_code == 200
        assert record.response_time_ms == pytest.approx(50.0)
        assert record.error_message is None
        assert endpoint.current_status == "normal"
        assert endpoint.last_check_at is not None
        # Only one object added (CheckRecord, no ErrorLog)
        assert db.add.call_count == 1

    @pytest.mark.asyncio
    async def test_status_mismatch(self, checker):
        endpoint = _make_endpoint(expected_status_code=200)
        db = _make_db()
        fake_resp = _make_response(status_code=500, elapsed_seconds=0.2)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            record = await checker.check(endpoint, db)

        assert record.is_success is False
        assert record.status_code == 500
        assert "Expected status 200" in record.error_message
        assert endpoint.current_status == "abnormal"
        # CheckRecord + ErrorLog
        assert db.add.call_count == 2

    @pytest.mark.asyncio
    async def test_timeout_error(self, checker):
        endpoint = _make_endpoint()
        db = _make_db()

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            record = await checker.check(endpoint, db)

        assert record.is_success is False
        assert record.status_code is None
        assert record.response_time_ms is None
        assert "timed out" in record.error_message.lower()
        assert endpoint.current_status == "abnormal"
        assert db.add.call_count == 2

    @pytest.mark.asyncio
    async def test_connection_error(self, checker):
        endpoint = _make_endpoint()
        db = _make_db()

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(side_effect=httpx.ConnectError("refused"))
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            record = await checker.check(endpoint, db)

        assert record.is_success is False
        assert "onnection error" in record.error_message
        assert endpoint.current_status == "abnormal"

    @pytest.mark.asyncio
    async def test_custom_headers_parsed(self, checker):
        headers_json = json.dumps({"X-Custom": "test-value"})
        endpoint = _make_endpoint(headers_json=headers_json)
        db = _make_db()
        fake_resp = _make_response(status_code=200)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await checker.check(endpoint, db)

            # Verify headers were passed
            call_kwargs = instance.request.call_args
            assert call_kwargs.kwargs["headers"]["X-Custom"] == "test-value"

    @pytest.mark.asyncio
    async def test_json_request_body_is_sent(self, checker):
        endpoint = _make_endpoint(
            method="POST",
            request_body_json='{"messages":[{"role":"user","content":"Reply with OK only."}]}',
        )
        db = _make_db()
        fake_resp = _make_response(status_code=200)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await checker.check(endpoint, db)

            call_kwargs = instance.request.call_args
            assert call_kwargs.kwargs["json"] == {
                "messages": [{"role": "user", "content": "Reply with OK only."}]
            }

    @pytest.mark.asyncio
    async def test_expected_response_text_must_match(self, checker):
        endpoint = _make_endpoint(
            method="POST",
            expected_response_text="OK",
        )
        db = _make_db()
        fake_resp = _make_response(status_code=200)
        fake_resp.json.return_value = {
            "choices": [{"message": {"content": "NOT_OK"}}]
        }
        fake_resp.text = json.dumps(fake_resp.json.return_value)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            record = await checker.check(endpoint, db)

        assert record.is_success is False
        assert "Expected response text" in record.error_message


# ---------------------------------------------------------------------------
# HealthChecker.check_with_key tests
# ---------------------------------------------------------------------------

class TestHealthCheckerCheckWithKey:
    @pytest.fixture
    def checker(self):
        return HealthChecker()

    @pytest.mark.asyncio
    async def test_bearer_header_injected(self, checker):
        endpoint = _make_endpoint()
        db = _make_db()
        fake_resp = _make_response(status_code=200)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await checker.check_with_key(endpoint, "my-secret-key", db)

            call_kwargs = instance.request.call_args
            assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer my-secret-key"

    @pytest.mark.asyncio
    async def test_bearer_header_merged_with_existing(self, checker):
        headers_json = json.dumps({"Accept": "application/json"})
        endpoint = _make_endpoint(headers_json=headers_json)
        db = _make_db()
        fake_resp = _make_response(status_code=200)

        with patch("app.services.health_checker.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=fake_resp)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = instance

            await checker.check_with_key(endpoint, "key123", db)

            call_kwargs = instance.request.call_args
            sent_headers = call_kwargs.kwargs["headers"]
            assert sent_headers["Accept"] == "application/json"
            assert sent_headers["Authorization"] == "Bearer key123"


class TestExtractResponseText:
    def test_extracts_openai_chat_content(self):
        response = MagicMock()
        response.json.return_value = {
            "choices": [{"message": {"content": "OK"}}]
        }
        assert _extract_response_text(response) == "OK"

    def test_extracts_anthropic_content(self):
        response = MagicMock()
        response.json.return_value = {
            "content": [{"type": "text", "text": "OK"}]
        }
        assert _extract_response_text(response) == "OK"
