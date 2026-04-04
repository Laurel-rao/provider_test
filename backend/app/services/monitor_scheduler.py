"""Monitor scheduler service – manages periodic health-check jobs via APScheduler."""

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.api_endpoint import APIEndpoint

logger = logging.getLogger(__name__)

_JOB_PREFIX = "check_endpoint_"


def _job_id(endpoint_id: int) -> str:
    return f"{_JOB_PREFIX}{endpoint_id}"


class MonitorScheduler:
    """Manages APScheduler jobs that periodically run health checks for API endpoints."""

    def __init__(self) -> None:
        self._scheduler: Optional[AsyncIOScheduler] = None

    async def start(self) -> None:
        """Start the scheduler and create jobs for all active endpoints."""
        self._scheduler = AsyncIOScheduler()
        self._scheduler.start()

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(APIEndpoint))
            endpoints = result.scalars().all()
            for ep in endpoints:
                self.add_endpoint(ep.id, ep.monitor_interval_seconds)

        logger.info(
            "MonitorScheduler started – %d endpoint(s) scheduled",
            len(endpoints) if endpoints else 0,
        )

    async def stop(self) -> None:
        """Shut down the scheduler gracefully."""
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None
            logger.info("MonitorScheduler stopped")

    def add_endpoint(self, endpoint_id: int, interval_seconds: int) -> None:
        """Add a periodic health-check job for *endpoint_id*."""
        if self._scheduler is None:
            return
        job_id = _job_id(endpoint_id)
        # Avoid duplicates
        if self._scheduler.get_job(job_id) is not None:
            self.remove_endpoint(endpoint_id)
        self._scheduler.add_job(
            self._run_check,
            trigger=IntervalTrigger(seconds=interval_seconds),
            id=job_id,
            args=[endpoint_id],
            replace_existing=True,
        )
        logger.debug("Scheduled job %s every %ds", job_id, interval_seconds)

    def remove_endpoint(self, endpoint_id: int) -> None:
        """Remove the health-check job for *endpoint_id*."""
        if self._scheduler is None:
            return
        job_id = _job_id(endpoint_id)
        if self._scheduler.get_job(job_id) is not None:
            self._scheduler.remove_job(job_id)
            logger.debug("Removed job %s", job_id)

    def update_interval(self, endpoint_id: int, interval_seconds: int) -> None:
        """Update the check interval for *endpoint_id* by re-adding the job."""
        self.remove_endpoint(endpoint_id)
        self.add_endpoint(endpoint_id, interval_seconds)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _run_check(self, endpoint_id: int) -> None:
        """Execute a single health check for the given endpoint."""
        from app.services.health_checker import health_checker
        from app.services.key_encryptor import key_encryptor

        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(APIEndpoint)
                    .options(selectinload(APIEndpoint.api_key))
                    .where(APIEndpoint.id == endpoint_id)
                )
                endpoint = result.scalar_one_or_none()
                if endpoint is None:
                    logger.warning("Endpoint %d not found – removing job", endpoint_id)
                    self.remove_endpoint(endpoint_id)
                    return

                # Run health check
                if endpoint.api_key is not None:
                    decrypted = key_encryptor.decrypt(endpoint.api_key.encrypted_value)
                    record = await health_checker.check_with_key(endpoint, decrypted, db)
                else:
                    record = await health_checker.check(endpoint, db)

                # Try alert evaluation (module may not exist yet)
                try:
                    from app.services.alert_evaluator import alert_evaluator
                    await alert_evaluator.evaluate(endpoint.id, record, db)
                except (ImportError, Exception) as exc:
                    logger.debug("Alert evaluation skipped: %s", exc)

                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("Error running check for endpoint %d", endpoint_id)


# Module-level singleton
scheduler = MonitorScheduler()
