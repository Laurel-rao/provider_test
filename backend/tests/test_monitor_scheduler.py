"""Unit tests for the MonitorScheduler service."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.monitor_scheduler import MonitorScheduler, _job_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_endpoint(**overrides):
    defaults = dict(
        id=1,
        name="Test API",
        url="https://example.com/health",
        method="GET",
        headers_json=None,
        expected_status_code=200,
        monitor_interval_seconds=300,
        api_key_id=None,
        api_key=None,
        current_status="unknown",
        last_check_at=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# _job_id
# ---------------------------------------------------------------------------

class TestJobId:
    def test_format(self):
        assert _job_id(42) == "check_endpoint_42"


# ---------------------------------------------------------------------------
# MonitorScheduler – add / remove / update
# ---------------------------------------------------------------------------

class TestSchedulerJobManagement:
    @pytest.fixture
    def sched(self):
        ms = MonitorScheduler()
        ms._scheduler = MagicMock()
        ms._scheduler.get_job = MagicMock(return_value=None)
        return ms

    def test_add_endpoint_creates_job(self, sched):
        sched.add_endpoint(1, 60)
        sched._scheduler.add_job.assert_called_once()
        call_kwargs = sched._scheduler.add_job.call_args
        assert call_kwargs.kwargs["id"] == "check_endpoint_1"

    def test_add_endpoint_noop_when_scheduler_none(self):
        ms = MonitorScheduler()
        # Should not raise
        ms.add_endpoint(1, 60)

    def test_remove_endpoint_removes_existing_job(self, sched):
        sched._scheduler.get_job.return_value = MagicMock()  # job exists
        sched.remove_endpoint(5)
        sched._scheduler.remove_job.assert_called_once_with("check_endpoint_5")

    def test_remove_endpoint_noop_when_no_job(self, sched):
        sched._scheduler.get_job.return_value = None
        sched.remove_endpoint(5)
        sched._scheduler.remove_job.assert_not_called()

    def test_remove_endpoint_noop_when_scheduler_none(self):
        ms = MonitorScheduler()
        ms.remove_endpoint(1)  # should not raise

    def test_update_interval_removes_and_readds(self, sched):
        # First call to get_job (in remove_endpoint) returns existing job,
        # second call (in add_endpoint's duplicate check) returns None after removal.
        sched._scheduler.get_job.side_effect = [MagicMock(), None]
        sched.update_interval(3, 120)
        sched._scheduler.remove_job.assert_called_once_with("check_endpoint_3")
        sched._scheduler.add_job.assert_called_once()


# ---------------------------------------------------------------------------
# MonitorScheduler.start / stop
# ---------------------------------------------------------------------------

class TestSchedulerStartStop:
    @pytest.mark.asyncio
    async def test_start_loads_endpoints(self):
        ep = _make_endpoint(id=10, monitor_interval_seconds=60)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [ep]

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with patch("app.services.monitor_scheduler.AsyncSessionLocal", return_value=mock_session):
            ms = MonitorScheduler()
            await ms.start()

        assert ms._scheduler is not None
        # Verify the scheduler is running
        assert ms._scheduler.running is True
        # Clean up
        await ms.stop()

    @pytest.mark.asyncio
    async def test_stop_shuts_down_scheduler(self):
        ms = MonitorScheduler()
        mock_sched = MagicMock()
        ms._scheduler = mock_sched

        await ms.stop()

        mock_sched.shutdown.assert_called_once_with(wait=False)
        assert ms._scheduler is None

    @pytest.mark.asyncio
    async def test_stop_noop_when_not_started(self):
        ms = MonitorScheduler()
        await ms.stop()  # should not raise


# ---------------------------------------------------------------------------
# MonitorScheduler._run_check
# ---------------------------------------------------------------------------

class TestRunCheck:
    @pytest.mark.asyncio
    async def test_run_check_without_api_key(self):
        ep = _make_endpoint(id=1, api_key=None)
        mock_record = MagicMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = ep

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_checker = AsyncMock()
        mock_checker.check = AsyncMock(return_value=mock_record)

        ms = MonitorScheduler()
        ms._scheduler = MagicMock()

        with patch("app.services.monitor_scheduler.AsyncSessionLocal", return_value=mock_session), \
             patch("app.services.health_checker.health_checker", mock_checker):
            await ms._run_check(1)

        mock_checker.check.assert_awaited_once_with(ep, mock_session)
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_run_check_with_api_key(self):
        api_key_obj = SimpleNamespace(encrypted_value="encrypted_val")
        ep = _make_endpoint(id=2, api_key=api_key_obj)
        mock_record = MagicMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = ep

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_checker = AsyncMock()
        mock_checker.check_with_key = AsyncMock(return_value=mock_record)

        mock_encryptor = MagicMock()
        mock_encryptor.decrypt.return_value = "plain_key"

        ms = MonitorScheduler()
        ms._scheduler = MagicMock()

        with patch("app.services.monitor_scheduler.AsyncSessionLocal", return_value=mock_session), \
             patch("app.services.health_checker.health_checker", mock_checker), \
             patch("app.services.key_encryptor.key_encryptor", mock_encryptor):
            await ms._run_check(2)

        mock_encryptor.decrypt.assert_called_once_with("encrypted_val")
        mock_checker.check_with_key.assert_awaited_once_with(ep, "plain_key", mock_session)

    @pytest.mark.asyncio
    async def test_run_check_removes_job_when_endpoint_missing(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        ms = MonitorScheduler()
        ms._scheduler = MagicMock()
        ms._scheduler.get_job.return_value = MagicMock()

        with patch("app.services.monitor_scheduler.AsyncSessionLocal", return_value=mock_session):
            await ms._run_check(99)

        ms._scheduler.remove_job.assert_called_once_with("check_endpoint_99")

    @pytest.mark.asyncio
    async def test_run_check_rolls_back_on_error(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.side_effect = RuntimeError("db boom")

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        ms = MonitorScheduler()
        ms._scheduler = MagicMock()

        with patch("app.services.monitor_scheduler.AsyncSessionLocal", return_value=mock_session):
            await ms._run_check(1)

        mock_session.rollback.assert_awaited_once()
