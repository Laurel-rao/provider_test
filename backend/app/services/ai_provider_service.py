"""AI Provider service – CRUD, auto-endpoint management, and dashboard aggregation."""

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import List, Optional
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ai_provider import AIProvider
from app.models.api_endpoint import APIEndpoint
from app.models.check_record import CheckRecord
from app.schemas.ai_provider import AIProviderCreate, AIProviderUpdate
from app.services.key_encryptor import key_encryptor

logger = logging.getLogger(__name__)

_HEALTH_CHECK_PROMPT = "Reply with OK only. Do not add any extra words."


class AIProviderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _build_hour_bucket_expr(dialect_name: str):
        if dialect_name == "sqlite":
            return func.strftime("%Y-%m-%dT%H:00:00", CheckRecord.checked_at)
        if dialect_name in {"mysql", "mariadb"}:
            return func.date_format(CheckRecord.checked_at, "%Y-%m-%dT%H:00:00")
        return None

    @staticmethod
    def _hour_bucket_key(checked_at: datetime) -> str:
        return checked_at.strftime("%Y-%m-%dT%H:00:00")

    @classmethod
    def _aggregate_response_points(cls, raw_rows) -> list:
        hourly: dict[str, list[float]] = defaultdict(list)
        for checked_at, response_time_ms in raw_rows:
            hourly[cls._hour_bucket_key(checked_at)].append(response_time_ms)

        return [
            {
                "timestamp": hour,
                "response_time_ms": round(sum(values) / len(values), 2),
            }
            for hour, values in sorted(hourly.items())
        ]

    def _dialect_name(self) -> str:
        bind = self.db.get_bind()
        dialect = getattr(bind, "dialect", None)
        return getattr(dialect, "name", "")

    # ------------------------------------------------------------------
    # URL / Header helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _join_endpoint(base_url: str, full_suffix: str, short_suffix: str) -> str:
        base = base_url.rstrip("/")
        if base.endswith(short_suffix) or base.endswith(full_suffix):
            return base
        if base.endswith("/v1"):
            return f"{base}{short_suffix}"
        return f"{base}{full_suffix}"

    @staticmethod
    def build_health_config(provider_type: str, base_url: str, model: str, stream: bool = True) -> dict:
        if provider_type == "openai":
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": _HEALTH_CHECK_PROMPT}],
                "max_tokens": 8,
                "temperature": 0,
            }
            if stream:
                payload["stream"] = True
                
            return {
                "url": AIProviderService._join_endpoint(
                    base_url,
                    "/v1/chat/completions",
                    "/chat/completions",
                ),
                "method": "POST",
                "request_body_json": json.dumps(payload),
                "expected_response_text": "OK",
            }
        if provider_type == "claude_code":
            return {
                "url": AIProviderService._join_endpoint(
                    base_url,
                    "/v1/messages",
                    "/messages",
                ),
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

    @staticmethod
    def build_headers(provider_type: str, decrypted_key: str) -> str:
        if provider_type == "claude_code":
            headers = {
                "x-api-key": decrypted_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
        else:
            headers = {
                "Authorization": f"Bearer {decrypted_key}",
                "content-type": "application/json",
            }
        return json.dumps(headers)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    @staticmethod
    def _copy_name(name: str) -> str:
        return f"{name} 副本"

    async def _get_endpoint(self, endpoint_id: int | None) -> APIEndpoint:
        if endpoint_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider endpoint not found")

        result = await self.db.execute(select(APIEndpoint).where(APIEndpoint.id == endpoint_id))
        endpoint = result.scalar_one_or_none()
        if endpoint is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider endpoint not found")
        return endpoint

    async def list_providers(self) -> List[AIProvider]:
        result = await self.db.execute(
            select(AIProvider)
            .options(selectinload(AIProvider.endpoint))
            .order_by(AIProvider.created_at.desc())
        )
        return result.scalars().all()

    async def get_provider(self, provider_id: int) -> AIProvider:
        result = await self.db.execute(
            select(AIProvider)
            .options(selectinload(AIProvider.endpoint))
            .where(AIProvider.id == provider_id)
        )
        provider = result.scalar_one_or_none()
        if provider is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Provider not found")
        return provider

    async def create_provider(self, data: AIProviderCreate) -> AIProvider:
        encrypted = key_encryptor.encrypt(data.api_key)
        masked = key_encryptor.mask(data.api_key)
        health_config = self.build_health_config(data.provider_type, data.base_url, data.model, data.stream)
        headers_json = self.build_headers(data.provider_type, data.api_key)

        # Create associated API endpoint
        endpoint = APIEndpoint(
            name=f"[AI] {data.name}",
            url=health_config["url"],
            method=health_config["method"],
            headers_json=headers_json,
            request_body_json=health_config["request_body_json"],
            expected_status_code=200,
            expected_response_text=health_config["expected_response_text"],
            description=f"Auto-created for AI provider: {data.name}",
            monitor_interval_seconds=data.monitor_interval_seconds,
        )
        self.db.add(endpoint)
        await self.db.flush()
        await self.db.refresh(endpoint)

        # Register with scheduler
        try:
            from app.services.monitor_scheduler import scheduler
            scheduler.add_endpoint(endpoint.id, data.monitor_interval_seconds)
        except Exception:
            pass

        provider = AIProvider(
            name=data.name,
            provider_type=data.provider_type,
            base_url=data.base_url,
            encrypted_api_key=encrypted,
            masked_key=masked,
            model=data.model,
            description=data.description,
            stream=data.stream,
            endpoint_id=endpoint.id,
        )
        self.db.add(provider)
        await self.db.flush()
        await self.db.refresh(provider)
        # Attach endpoint for response serialization
        provider.endpoint = endpoint
        return provider

    async def update_provider(self, provider_id: int, data: AIProviderUpdate) -> AIProvider:
        provider = await self.get_provider(provider_id)
        update_data = data.model_dump(exclude_unset=True)
        interval_seconds = update_data.pop("monitor_interval_seconds", None)

        # Handle api_key update
        new_key = update_data.pop("api_key", None)
        if new_key:
            provider.encrypted_api_key = key_encryptor.encrypt(new_key)
            provider.masked_key = key_encryptor.mask(new_key)

        for field, value in update_data.items():
            setattr(provider, field, value)

        # Sync associated endpoint if base_url or api_key changed
        if provider.endpoint_id and (
            new_key
            or "base_url" in update_data
            or "provider_type" in update_data
            or "model" in update_data
            or "stream" in update_data
            or interval_seconds is not None
        ):
            ep = await self._get_endpoint(provider.endpoint_id)
            if ep:
                decrypted = key_encryptor.decrypt(provider.encrypted_api_key)
                health_config = self.build_health_config(provider.provider_type, provider.base_url, provider.model, provider.stream)
                ep.url = health_config["url"]
                ep.method = health_config["method"]
                ep.headers_json = self.build_headers(provider.provider_type, decrypted)
                ep.request_body_json = health_config["request_body_json"]
                ep.expected_response_text = health_config["expected_response_text"]
                ep.name = f"[AI] {provider.name}"
                interval_changed = interval_seconds is not None and interval_seconds != ep.monitor_interval_seconds
                if interval_seconds is not None:
                    ep.monitor_interval_seconds = interval_seconds

        await self.db.flush()
        await self.db.refresh(provider)

        if provider.endpoint_id and interval_seconds is not None and interval_changed:
            try:
                from app.services.monitor_scheduler import scheduler
                scheduler.update_interval(provider.endpoint_id, interval_seconds)
            except Exception:
                pass
        return provider

    async def delete_provider(self, provider_id: int) -> None:
        provider = await self.get_provider(provider_id)

        # Remove scheduler job and delete associated endpoint
        if provider.endpoint_id:
            try:
                from app.services.monitor_scheduler import scheduler
                scheduler.remove_endpoint(provider.endpoint_id)
            except Exception:
                pass
            result = await self.db.execute(
                select(APIEndpoint).where(APIEndpoint.id == provider.endpoint_id)
            )
            ep = result.scalar_one_or_none()
            if ep:
                provider.endpoint_id = None
                await self.db.flush()
                await self.db.delete(ep)

        await self.db.delete(provider)
        await self.db.flush()

    async def copy_provider(self, provider_id: int) -> AIProvider:
        provider = await self.get_provider(provider_id)
        interval_seconds = provider.endpoint.monitor_interval_seconds if provider.endpoint else 300
        decrypted = key_encryptor.decrypt(provider.encrypted_api_key)
        health_config = self.build_health_config(provider.provider_type, provider.base_url, provider.model, provider.stream)
        headers_json = self.build_headers(provider.provider_type, decrypted)

        endpoint = APIEndpoint(
            name=f"[AI] {self._copy_name(provider.name)}",
            url=health_config["url"],
            method=health_config["method"],
            headers_json=headers_json,
            request_body_json=health_config["request_body_json"],
            expected_status_code=200,
            expected_response_text=health_config["expected_response_text"],
            description=provider.description,
            monitor_interval_seconds=interval_seconds,
        )
        self.db.add(endpoint)
        await self.db.flush()
        await self.db.refresh(endpoint)

        try:
            from app.services.monitor_scheduler import scheduler
            scheduler.add_endpoint(endpoint.id, interval_seconds)
        except Exception:
            pass

        copied = AIProvider(
            name=self._copy_name(provider.name),
            provider_type=provider.provider_type,
            base_url=provider.base_url,
            encrypted_api_key=provider.encrypted_api_key,
            masked_key=provider.masked_key,
            model=provider.model,
            description=provider.description,
            stream=provider.stream,
            endpoint_id=endpoint.id,
        )
        self.db.add(copied)
        await self.db.flush()
        await self.db.refresh(copied)
        copied.endpoint = endpoint
        return copied

    async def test_provider(self, provider_id: int) -> dict:
        from app.services.health_checker import health_checker

        provider = await self.get_provider(provider_id)
        endpoint = provider.endpoint or await self._get_endpoint(provider.endpoint_id)
        record = await health_checker.check(endpoint, self.db)
        await self.db.flush()

        return {
            "provider_id": provider.id,
            "endpoint_id": endpoint.id,
            "is_success": record.is_success,
            "status_code": record.status_code,
            "response_time_ms": round(record.response_time_ms, 2) if record.response_time_ms is not None else None,
            "error_message": record.error_message,
            "checked_at": record.checked_at,
            "current_status": endpoint.current_status,
        }

    # ------------------------------------------------------------------
    # Dashboard aggregation
    # ------------------------------------------------------------------

    async def get_dashboard_summary(self) -> dict:
        providers = await self.list_providers()
        total = len(providers)
        healthy = sum(1 for p in providers if p.endpoint and p.endpoint.current_status == "normal")
        unhealthy = sum(1 for p in providers if p.endpoint and p.endpoint.current_status == "abnormal")
        unknown = total - healthy - unhealthy
        return {
            "total": total,
            "healthy": healthy,
            "unhealthy": unhealthy,
            "unknown": unknown,
            "health_rate": healthy / total if total > 0 else 0.0,
        }

    async def get_response_trend(self, provider_type: Optional[str] = None) -> list:
        since = datetime.now() - timedelta(hours=24)
        providers = await self.list_providers()
        if provider_type:
            providers = [p for p in providers if p.provider_type == provider_type]

        trends = []
        hour_bucket_expr = self._build_hour_bucket_expr(self._dialect_name())
        for p in providers:
            if not p.endpoint_id:
                continue

            if hour_bucket_expr is not None:
                bucket = hour_bucket_expr.label("hour")
                result = await self.db.execute(
                    select(
                        bucket,
                        func.avg(CheckRecord.response_time_ms).label("avg_rt"),
                    )
                    .where(
                        CheckRecord.endpoint_id == p.endpoint_id,
                        CheckRecord.checked_at >= since,
                        CheckRecord.response_time_ms.isnot(None),
                    )
                    .group_by(bucket)
                    .order_by(bucket)
                )
                data_points = [
                    {"timestamp": row[0], "response_time_ms": round(row[1], 2) if row[1] is not None else None}
                    for row in result.all()
                ]
            else:
                result = await self.db.execute(
                    select(CheckRecord.checked_at, CheckRecord.response_time_ms)
                    .where(
                        CheckRecord.endpoint_id == p.endpoint_id,
                        CheckRecord.checked_at >= since,
                        CheckRecord.response_time_ms.isnot(None),
                    )
                    .order_by(CheckRecord.checked_at)
                )
                data_points = self._aggregate_response_points(result.all())

            trends.append({
                "provider_id": p.id,
                "provider_name": p.name,
                "provider_type": p.provider_type,
                "data_points": data_points,
            })
        return trends

    async def get_probe_cards(
        self, provider_type: Optional[str] = None, hours: int = 24
    ) -> list:
        """Build 60-point probe cards for each provider over the given time range.

        The time range is always divided into 60 equal buckets.  For each
        bucket the check records are aggregated: value=1 if all checks
        succeeded, value=0 if any failed, None if no data.
        """
        now = datetime.now()
        since = now - timedelta(hours=hours)
        num_buckets = 60
        bucket_seconds = (hours * 3600) / num_buckets

        providers = await self.list_providers()
        if provider_type:
            providers = [p for p in providers if p.provider_type == provider_type]

        cards = []
        for p in providers:
            if not p.endpoint_id:
                continue

            result = await self.db.execute(
                select(
                    CheckRecord.checked_at,
                    CheckRecord.is_success,
                    CheckRecord.response_time_ms,
                )
                .where(
                    CheckRecord.endpoint_id == p.endpoint_id,
                    CheckRecord.checked_at >= since,
                )
                .order_by(CheckRecord.checked_at)
            )
            raw = result.all()

            # Distribute records into 60 buckets
            buckets: list[list[tuple]] = [[] for _ in range(num_buckets)]
            for checked_at, is_success, rt in raw:
                idx = int((checked_at - since).total_seconds() / bucket_seconds)
                idx = max(0, min(num_buckets - 1, idx))
                buckets[idx].append((is_success, rt))

            probes = []
            total_success = 0
            total_checks = 0
            rt_values = []
            for i in range(num_buckets):
                bucket_time = since + timedelta(seconds=bucket_seconds * i)
                ts = bucket_time.strftime("%Y-%m-%dT%H:%M:%S")
                items = buckets[i]
                if not items:
                    probes.append({"value": None, "avg_response_time_ms": None, "timestamp": ts})
                else:
                    all_ok = all(s for s, _ in items)
                    rts = [r for _, r in items if r is not None]
                    avg_rt = round(sum(rts) / len(rts), 2) if rts else None
                    probes.append({
                        "value": 1 if all_ok else 0,
                        "avg_response_time_ms": avg_rt,
                        "timestamp": ts,
                    })
                    total_checks += len(items)
                    total_success += sum(1 for s, _ in items if s)
                    rt_values.extend(rts)

            avail_rate = round(total_success / total_checks, 4) if total_checks else None
            avg_rt = round(sum(rt_values) / len(rt_values), 2) if rt_values else None

            cards.append({
                "provider_id": p.id,
                "endpoint_id": p.endpoint_id,
                "provider_name": p.name,
                "provider_type": p.provider_type,
                "model": p.model,
                "current_status": p.endpoint.current_status if p.endpoint else None,
                "availability_rate": avail_rate,
                "avg_response_time_ms": avg_rt,
                "probes": probes,
            })
        return cards

    async def get_availability_timeline(self, provider_type: Optional[str] = None) -> list:
        since = datetime.now() - timedelta(hours=24)
        providers = await self.list_providers()
        if provider_type:
            providers = [p for p in providers if p.provider_type == provider_type]

        timelines = []
        for p in providers:
            if not p.endpoint_id:
                continue
            result = await self.db.execute(
                select(CheckRecord.checked_at, CheckRecord.is_success)
                .where(
                    CheckRecord.endpoint_id == p.endpoint_id,
                    CheckRecord.checked_at >= since,
                )
                .order_by(CheckRecord.checked_at)
            )
            raw = result.all()
            hourly = {}
            for checked_at, is_success in raw:
                h = checked_at.strftime("%Y-%m-%dT%H:00:00")
                hourly.setdefault(h, []).append(is_success)

            slots = []
            for h in sorted(hourly.keys()):
                checks = hourly[h]
                if all(checks):
                    s = "normal"
                elif any(not c for c in checks):
                    s = "abnormal"
                else:
                    s = "no_data"
                slots.append({"timestamp": h, "status": s})

            timelines.append({
                "provider_id": p.id,
                "provider_name": p.name,
                "provider_type": p.provider_type,
                "slots": slots,
            })
        return timelines
