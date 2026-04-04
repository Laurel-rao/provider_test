import json
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ai_provider_service import AIProviderService


def _make_provider() -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        name="OpenAI",
        provider_type="openai",
        endpoint_id=10,
        endpoint=SimpleNamespace(
            id=10,
            monitor_interval_seconds=300,
            current_status="unknown",
            last_check_at=None,
        ),
        encrypted_api_key="encrypted",
        masked_key="sk-****",
        base_url="https://api.example.com/v1",
        model="gpt-5.4",
        description="desc",
    )


def test_build_hour_bucket_expr_matches_dialect():
    sqlite_expr = AIProviderService._build_hour_bucket_expr("sqlite")
    mysql_expr = AIProviderService._build_hour_bucket_expr("mysql")

    assert sqlite_expr is not None
    assert "strftime" in str(sqlite_expr).lower()
    assert mysql_expr is not None
    assert "date_format" in str(mysql_expr).lower()
    assert AIProviderService._build_hour_bucket_expr("postgresql") is None


def test_build_health_config_for_openai_chat_check():
    config = AIProviderService.build_health_config(
        "openai",
        "https://api.openai.com/",
        "gpt-4o-mini",
    )

    assert config["url"] == "https://api.openai.com/v1/chat/completions"
    assert config["method"] == "POST"
    assert config["expected_response_text"] == "OK"
    assert json.loads(config["request_body_json"]) == {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "Reply with OK only. Do not add any extra words."}],
        "max_tokens": 8,
        "temperature": 0,
        "stream": True,
    }


def test_build_health_config_for_openai_base_url_with_v1():
    config = AIProviderService.build_health_config(
        "openai",
        "https://api.xcode.best/v1",
        "codex",
    )

    assert config["url"] == "https://api.xcode.best/v1/chat/completions"


def test_build_health_config_for_claude_chat_check():
    config = AIProviderService.build_health_config(
        "claude_code",
        "https://api.anthropic.com",
        "claude-3-7-sonnet-latest",
    )

    assert config["url"] == "https://api.anthropic.com/v1/messages"
    assert config["method"] == "POST"
    assert config["expected_response_text"] == "OK"
    assert json.loads(config["request_body_json"]) == {
        "model": "claude-3-7-sonnet-latest",
        "messages": [{"role": "user", "content": "Reply with OK only. Do not add any extra words."}],
        "max_tokens": 8,
    }

@pytest.mark.asyncio
async def test_get_response_trend_falls_back_to_python_aggregation():
    db = MagicMock()
    db.execute = AsyncMock()
    dialect = MagicMock()
    dialect.name = "postgresql"
    db.get_bind.return_value = MagicMock(dialect=dialect)

    raw_result = MagicMock()
    raw_result.all.return_value = [
        (datetime(2024, 1, 1, 10, 5), 100.0),
        (datetime(2024, 1, 1, 10, 45), 200.0),
        (datetime(2024, 1, 1, 11, 0), 300.0),
    ]
    db.execute.return_value = raw_result

    svc = AIProviderService(db)
    svc.list_providers = AsyncMock(return_value=[_make_provider()])

    trends = await svc.get_response_trend()

    assert trends == [
        {
            "provider_id": 1,
            "provider_name": "OpenAI",
            "provider_type": "openai",
            "data_points": [
                {"timestamp": "2024-01-01T10:00:00", "response_time_ms": 150.0},
                {"timestamp": "2024-01-01T11:00:00", "response_time_ms": 300.0},
            ],
        }
    ]


@pytest.mark.asyncio
async def test_copy_provider_reuses_interval_and_provider_config():
    db = MagicMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    svc = AIProviderService(db)
    original = _make_provider()
    svc.get_provider = AsyncMock(return_value=original)

    refreshed = []

    async def _refresh(obj):
        refreshed.append(obj)
        if isinstance(obj, MagicMock):
            return
        if getattr(obj, "name", "").startswith("[AI]"):
            obj.id = 22
        else:
            obj.id = 33

    db.refresh.side_effect = _refresh

    mock_scheduler = MagicMock()

    with patch("app.services.ai_provider_service.key_encryptor.decrypt", return_value="plain"), \
         patch.dict(sys.modules, {"app.services.monitor_scheduler": SimpleNamespace(scheduler=mock_scheduler)}):
        copied = await svc.copy_provider(1)

    assert copied.name == "OpenAI 副本"
    assert copied.endpoint_id == 22
    assert copied.endpoint.monitor_interval_seconds == 300
    mock_scheduler.add_endpoint.assert_called_once_with(22, 300)


@pytest.mark.asyncio
async def test_test_provider_runs_health_check_and_returns_summary():
    db = MagicMock()
    db.flush = AsyncMock()
    svc = AIProviderService(db)
    provider = _make_provider()
    provider.endpoint.current_status = "normal"
    svc.get_provider = AsyncMock(return_value=provider)

    record = SimpleNamespace(
        is_success=True,
        status_code=200,
        response_time_ms=456.789,
        error_message=None,
        checked_at=datetime(2024, 1, 1, 12, 0),
    )

    with patch("app.services.health_checker.health_checker") as mock_checker:
        mock_checker.check = AsyncMock(return_value=record)
        result = await svc.test_provider(1)

    assert result == {
        "provider_id": 1,
        "endpoint_id": 10,
        "is_success": True,
        "status_code": 200,
        "response_time_ms": 456.79,
        "error_message": None,
        "checked_at": datetime(2024, 1, 1, 12, 0),
        "current_status": "normal",
    }
