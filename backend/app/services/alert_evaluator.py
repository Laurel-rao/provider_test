"""Alert evaluator service – checks alert rules after each health check."""

import logging
import traceback
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_rule import AlertRule
from app.models.check_record import CheckRecord
from app.models.error_log import ErrorLog

logger = logging.getLogger(__name__)


class AlertEvaluator:
    """Evaluates alert rules against health-check results."""

    async def evaluate(
        self,
        endpoint_id: int,
        check_record: CheckRecord,
        db: AsyncSession,
    ) -> Optional[Alert]:
        """Evaluate all active rules for *endpoint_id* and create an alert if triggered."""
        try:
            result = await db.execute(
                select(AlertRule).where(
                    AlertRule.endpoint_id == endpoint_id,
                    AlertRule.is_active == True,  # noqa: E712
                )
            )
            rules = result.scalars().all()

            for rule in rules:
                alert = await self._check_rule(rule, endpoint_id, check_record, db)
                if alert is not None:
                    return alert

            return None
        except Exception as exc:
            logger.exception("Alert evaluation failed for endpoint %d", endpoint_id)
            error_log = ErrorLog(
                endpoint_id=endpoint_id,
                module_name="alert_evaluator",
                error_type="evaluation_error",
                error_message=str(exc),
                stack_trace=traceback.format_exc(),
            )
            db.add(error_log)
            await db.flush()
            return None

    async def _check_rule(
        self,
        rule: AlertRule,
        endpoint_id: int,
        check_record: CheckRecord,
        db: AsyncSession,
    ) -> Optional[Alert]:
        """Check a single rule and return an Alert if triggered, else None."""
        if rule.rule_type == "consecutive_failures":
            return await self._check_consecutive_failures(rule, endpoint_id, db)
        elif rule.rule_type == "response_time":
            return self._check_response_time(rule, endpoint_id, check_record, db)
        return None

    async def _check_consecutive_failures(
        self,
        rule: AlertRule,
        endpoint_id: int,
        db: AsyncSession,
    ) -> Optional[Alert]:
        """Trigger alert if the last N checks all failed."""
        n = rule.threshold_value
        result = await db.execute(
            select(CheckRecord)
            .where(CheckRecord.endpoint_id == endpoint_id)
            .order_by(CheckRecord.checked_at.desc())
            .limit(n)
        )
        records = result.scalars().all()

        if len(records) < n:
            return None

        if all(not r.is_success for r in records):
            alert = Alert(
                alert_rule_id=rule.id,
                endpoint_id=endpoint_id,
                trigger_condition=f"Consecutive {n} failures detected",
                status="open",
                triggered_at=datetime.now(),
            )
            db.add(alert)
            await db.flush()
            return alert

        return None

    def _check_response_time(
        self,
        rule: AlertRule,
        endpoint_id: int,
        check_record: CheckRecord,
        db: AsyncSession,
    ) -> Optional[Alert]:
        """Trigger alert if response time exceeds threshold."""
        if (
            check_record.response_time_ms is not None
            and check_record.response_time_ms > rule.threshold_value
        ):
            alert = Alert(
                alert_rule_id=rule.id,
                endpoint_id=endpoint_id,
                trigger_condition=(
                    f"Response time {check_record.response_time_ms:.0f}ms "
                    f"exceeds threshold {rule.threshold_value}ms"
                ),
                status="open",
                triggered_at=datetime.now(),
            )
            db.add(alert)
            return alert
        return None


# Module-level singleton
alert_evaluator = AlertEvaluator()
