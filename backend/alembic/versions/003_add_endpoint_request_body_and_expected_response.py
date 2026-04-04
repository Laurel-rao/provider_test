"""add endpoint request body and expected response text

Revision ID: 003
Revises: 002
Create Date: 2026-04-04 00:00:00.000000
"""
import json
from typing import Sequence, Union
from urllib.parse import quote

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_HEALTH_CHECK_PROMPT = "Reply with OK only. Do not add any extra words."


def _join_endpoint(base_url: str, full_suffix: str, short_suffix: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith(short_suffix) or base.endswith(full_suffix):
        return base
    if base.endswith("/v1"):
        return f"{base}{short_suffix}"
    return f"{base}{full_suffix}"


def _build_health_check_config(provider_type: str, base_url: str, model: str) -> dict:
    if provider_type == "openai":
        return {
            "url": _join_endpoint(base_url, "/v1/chat/completions", "/chat/completions"),
            "method": "POST",
            "request_body_json": json.dumps(
                {
                    "model": model,
                    "messages": [{"role": "user", "content": _HEALTH_CHECK_PROMPT}],
                    "max_tokens": 8,
                    "temperature": 0,
                }
            ),
            "expected_response_text": "OK",
        }
    if provider_type == "claude_code":
        return {
            "url": _join_endpoint(base_url, "/v1/messages", "/messages"),
            "method": "POST",
            "request_body_json": json.dumps(
                {
                    "model": model,
                    "messages": [{"role": "user", "content": _HEALTH_CHECK_PROMPT}],
                    "max_tokens": 8,
                }
            ),
            "expected_response_text": "OK",
        }
    if provider_type == "azure_openai":
        base = base_url.rstrip("/")
        deployment = quote(model, safe="")
        if base.endswith("/openai"):
            azure_base = base
        else:
            azure_base = f"{base}/openai"
        return {
            "url": f"{azure_base}/deployments/{deployment}/chat/completions?api-version=2024-02-01",
            "method": "POST",
            "request_body_json": json.dumps(
                {
                    "messages": [{"role": "user", "content": _HEALTH_CHECK_PROMPT}],
                    "max_tokens": 8,
                    "temperature": 0,
                }
            ),
            "expected_response_text": "OK",
        }
    return {
        "url": base_url,
        "method": "GET",
        "request_body_json": None,
        "expected_response_text": None,
    }


def upgrade() -> None:
    op.add_column("api_endpoints", sa.Column("request_body_json", sa.Text(), nullable=True))
    op.add_column("api_endpoints", sa.Column("expected_response_text", sa.String(length=200), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT aip.endpoint_id, aip.provider_type, aip.base_url, aip.model
            FROM ai_providers AS aip
            WHERE aip.endpoint_id IS NOT NULL
            """
        )
    ).mappings()

    for row in rows:
        cfg = _build_health_check_config(row["provider_type"], row["base_url"], row["model"])
        conn.execute(
            sa.text(
                """
                UPDATE api_endpoints
                SET url = :url,
                    method = :method,
                    request_body_json = :request_body_json,
                    expected_response_text = :expected_response_text
                WHERE id = :endpoint_id
                """
            ),
            {
                "endpoint_id": row["endpoint_id"],
                "url": cfg["url"],
                "method": cfg["method"],
                "request_body_json": cfg["request_body_json"],
                "expected_response_text": cfg["expected_response_text"],
            },
        )


def downgrade() -> None:
    op.drop_column("api_endpoints", "expected_response_text")
    op.drop_column("api_endpoints", "request_body_json")
