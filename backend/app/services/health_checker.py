"""Health checker service – executes HTTP health checks against API endpoints."""

import json
import traceback
from collections.abc import Mapping
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_endpoint import APIEndpoint
from app.models.check_record import CheckRecord
from app.models.error_log import ErrorLog

_DEFAULT_TIMEOUT = 10.0  # seconds


class HealthChecker:
    """Performs a single health check against an API endpoint and persists the result."""

    async def check(
        self, endpoint: APIEndpoint, db: AsyncSession
    ) -> CheckRecord:
        """Execute a health check for *endpoint* and save the result to the database.

        Returns the created :class:`CheckRecord`.
        """
        headers = _parse_headers(endpoint.headers_json)
        return await self._execute(endpoint, headers, db)

    async def check_with_key(
        self, endpoint: APIEndpoint, api_key: str, db: AsyncSession
    ) -> CheckRecord:
        """Same as :meth:`check` but injects an ``Authorization: Bearer`` header."""
        headers = _parse_headers(endpoint.headers_json)
        headers["Authorization"] = f"Bearer {api_key}"
        return await self._execute(endpoint, headers, db)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _execute(
        self,
        endpoint: APIEndpoint,
        headers: dict,
        db: AsyncSession,
    ) -> CheckRecord:
        status_code: int | None = None
        response_time_ms: float | None = None
        is_success = False
        error_message: str | None = None
        response_body: str | None = None
        now = datetime.now()
        request_body = _parse_json_body(getattr(endpoint, "request_body_json", None))

        try:
            # Note: For stream responses, response.elapsed is not available until the stream is consumed.
            # We will calculate response_time_ms manually using time.time()
            import time
            start_time = time.time()
            
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                request_kwargs = dict(
                    method=endpoint.method,
                    url=endpoint.url,
                    headers=headers,
                )
                if request_body is not None:
                    request_kwargs["json"] = request_body
                    
                # Use stream() if request_body has stream=True
                is_stream = request_body and request_body.get("stream")
                
                if is_stream:
                    req = client.build_request(**request_kwargs)
                    response = await client.send(req, stream=True)
                else:
                    response = await client.request(**request_kwargs)
                    
                status_code = response.status_code
                
                # Handle Server-Sent Events (SSE) stream if expected_response_text is provided and stream is true
                if getattr(endpoint, "expected_response_text", None) and is_stream:
                    actual_text = ""
                    try:
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data = line[6:].strip()
                                if data == "[DONE]":
                                    break
                                try:
                                    parsed = json.loads(data)
                                    choices = parsed.get("choices", [])
                                    if choices:
                                        delta = choices[0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content:
                                            actual_text += content
                                except json.JSONDecodeError:
                                    pass
                            elif line.startswith("error: "):
                                # try to capture stream errors if provided
                                actual_text += line
                    except Exception as e:
                        error_message = f"Error reading stream: {e}"
                    
                    response_body = actual_text
                else:
                    # Capture response body (truncate to 4KB to avoid bloating DB)
                    try:
                        raw_text = response.text if not is_stream else (await response.aread()).decode("utf-8", errors="ignore")
                        response_body = raw_text[:4096] if raw_text else None
                    except Exception:
                        response_body = None
                        
                # Ensure stream is closed before checking elapsed time or moving on
                if hasattr(response, "is_stream_consumed") and not response.is_stream_consumed:
                    await response.aclose()
                    
                response_time_ms = (time.time() - start_time) * 1000
                
            is_success = status_code == endpoint.expected_status_code
            if not is_success:
                error_message = (
                    f"Expected status {endpoint.expected_status_code}, "
                    f"got {status_code}"
                )
            else:
                expected_text = getattr(endpoint, "expected_response_text", None)
                if expected_text:
                    if is_stream:
                        # actual_text already accumulated from stream
                        pass
                    else:
                        actual_text = _extract_response_text(response)
                        
                    if _normalize_text(actual_text) != _normalize_text(expected_text):
                        is_success = False
                        error_message = (
                            f"Expected response text {expected_text!r}, "
                            f"got {actual_text!r}"
                        )
        except httpx.TimeoutException:
            elapsed = (time.time() - start_time) * 1000
            error_message = f"Request timed out after {elapsed:.0f}ms (configured timeout is {_DEFAULT_TIMEOUT}s)"
        except httpx.ConnectError:
            error_message = "Connection error"
        except httpx.HTTPError as exc:
            error_message = f"HTTP error: {exc}"
        except Exception as exc:  # pragma: no cover – safety net
            error_message = f"Unexpected error: {exc}"

        # Build check record
        record = CheckRecord(
            endpoint_id=endpoint.id,
            status_code=status_code,
            response_time_ms=response_time_ms,
            is_success=is_success,
            error_message=error_message,
            response_body=response_body,
            checked_at=now,
        )
        db.add(record)

        # Update endpoint status
        endpoint.current_status = "normal" if is_success else "abnormal"
        endpoint.last_check_at = now

        # If the check failed, also create an error log entry
        if not is_success:
            error_log = ErrorLog(
                endpoint_id=endpoint.id,
                module_name="health_checker",
                error_type=_classify_error(error_message),
                error_message=error_message or "Unknown error",
                stack_trace=traceback.format_exc() if error_message and "error" in error_message.lower() else None,
                http_status_code=status_code,
            )
            db.add(error_log)

        await db.flush()
        return record


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------


def _parse_headers(headers_json: str | None) -> dict:
    """Parse a JSON string into a headers dict, returning an empty dict on failure."""
    if not headers_json:
        return {}
    try:
        parsed = json.loads(headers_json)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return {}


def _parse_json_body(body_json: str | None):
    """Parse a JSON request body, returning None on empty or invalid input."""
    if not body_json:
        return None
    try:
        return json.loads(body_json)
    except (json.JSONDecodeError, TypeError):
        return None


def _extract_response_text(response) -> str:
    """Extract the primary text payload from common AI provider response formats."""
    try:
        payload = response.json()
    except Exception:
        payload = None

    extracted = _extract_text_from_payload(payload)
    if extracted is not None:
        return extracted

    return str(getattr(response, "text", "")).strip()


def _extract_text_from_payload(payload) -> str | None:
    if isinstance(payload, Mapping):
        output_text = payload.get("output_text")
        if isinstance(output_text, str):
            return output_text.strip()

        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") if isinstance(choices[0], Mapping) else None
            text = _extract_text_from_content(message.get("content") if isinstance(message, Mapping) else None)
            if text:
                return text

        text = _extract_text_from_content(payload.get("content"))
        if text:
            return text
    return None


def _extract_text_from_content(content) -> str | None:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, Mapping):
        text = content.get("text")
        if isinstance(text, str):
            return text.strip()
        return None
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item.strip())
            elif isinstance(item, Mapping):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text.strip())
        joined = " ".join(part for part in parts if part).strip()
        return joined or None
    return None


def _normalize_text(value: str) -> str:
    return value.strip().strip("\"'")


def _classify_error(error_message: str | None) -> str:
    """Return a short error type label based on the message content."""
    if not error_message:
        return "unknown_error"
    msg = error_message.lower()
    if "timed out" in msg:
        return "timeout"
    if "connection" in msg:
        return "connection_error"
    if "expected status" in msg:
        return "status_mismatch"
    return "http_error"


# Module-level singleton
health_checker = HealthChecker()
