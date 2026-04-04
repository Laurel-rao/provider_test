"""Data cleaner service – removes records and logs older than the retention period."""

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.check_record import CheckRecord
from app.models.error_log import ErrorLog

logger = logging.getLogger(__name__)


class DataCleaner:
    """Cleans up old check records and error logs beyond the retention window."""

    async def clean_old_records(self, retention_days: int = 90) -> int:
        """Delete check records older than *retention_days*. Returns count deleted."""
        cutoff = datetime.now() - timedelta(days=retention_days)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                delete(CheckRecord).where(CheckRecord.checked_at < cutoff)
            )
            await db.commit()
            count = result.rowcount
            logger.info("Cleaned %d check records older than %s", count, cutoff)
            return count

    async def clean_old_logs(self, retention_days: int = 90) -> int:
        """Delete error logs older than *retention_days*. Returns count deleted."""
        cutoff = datetime.now() - timedelta(days=retention_days)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                delete(ErrorLog).where(ErrorLog.created_at < cutoff)
            )
            await db.commit()
            count = result.rowcount
            logger.info("Cleaned %d error logs older than %s", count, cutoff)
            return count


data_cleaner = DataCleaner()
