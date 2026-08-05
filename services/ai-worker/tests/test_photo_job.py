from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from app.photo_job import run_photo_job


def test_photo_job_loads_session_and_processes_it():
    session = {
        "id": "session-1",
        "userId": "user-1",
        "imageUrl": "https://storage.example/photo.jpg",
    }

    with (
        patch("app.photo_job.db.init_pool"),
        patch("app.photo_job.db.claim_photo_session_for_analysis", return_value=session) as claim,
        patch("app.photo_job.db.get_active_model_config", return_value=None),
        patch("app.photo_job.process_photo", new_callable=AsyncMock, return_value=(True, None)) as process,
        patch.dict(
            "os.environ",
            {
                "BACKEND_CALLBACK_URL": "https://backend.example/api/internal/photo-result",
                "INTERNAL_API_KEY": "internal-key",
            },
            clear=False,
        ),
    ):
        assert asyncio.run(run_photo_job("session-1")) is True

    claim.assert_called_once_with("session-1", 0)
    request = process.await_args.args[0]
    assert request.sessionId == "session-1"
    assert request.userId == "user-1"
    assert request.imageUrl == "https://storage.example/photo.jpg"
    assert request.callbackUrl == "https://backend.example/api/internal/photo-result"
    assert request.callbackKey == "internal-key"


def test_photo_job_skips_session_not_claimed_by_this_execution():
    with (
        patch("app.photo_job.db.init_pool"),
        patch("app.photo_job.db.claim_photo_session_for_analysis", return_value=None) as claim,
        patch("app.photo_job.db.get_active_model_config", return_value=None),
        patch("app.photo_job.process_photo", new_callable=AsyncMock) as process,
        patch.dict("os.environ", {"CLOUD_RUN_TASK_ATTEMPT": "1"}, clear=False),
    ):
        assert asyncio.run(run_photo_job("session-1")) is True

    claim.assert_called_once_with("session-1", 1)
    process.assert_not_awaited()


def test_photo_job_fails_when_callback_is_not_configured():
    session = {
        "id": "session-1",
        "userId": "user-1",
        "imageUrl": "https://storage.example/photo.jpg",
    }

    with (
        patch("app.photo_job.db.init_pool"),
        patch("app.photo_job.db.claim_photo_session_for_analysis", return_value=session),
        patch("app.photo_job.db.get_active_model_config", return_value=None),
        patch("app.photo_job.process_photo", new_callable=AsyncMock) as process,
        patch.dict("os.environ", {}, clear=True),
    ):
        assert asyncio.run(run_photo_job("session-1")) is False

    process.assert_not_awaited()
