"""HTTP callback client for sending results to the backend."""
from __future__ import annotations

import httpx
import logging

logger = logging.getLogger(__name__)


async def send_photo_result(
    callback_url: str,
    callback_key: str,
    session_id: str,
    user_id: str,
    enriched_json: str,
    cost: int,
) -> bool:
    """Send photo analysis result to backend via callback. Returns True on success."""
    headers = {"X-Internal-Key": callback_key} if callback_key else {}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(callback_url, json={
            "sessionId": session_id,
            "userId": user_id,
            "enrichedKanji": enriched_json,
            "costMicrodollars": cost,
        }, headers=headers)
    if resp.status_code != 200:
        logger.error("Photo result callback failed: status=%d body=%s", resp.status_code, resp.text)
        return False
    return True


def send_quiz_result(
    callback_url: str,
    callback_key: str,
    job_id: str,
    user_id: str,
    status: str,
    cost: int,
    operation_type: str,
    quizzes: list[dict] | None = None,
) -> bool:
    """Send quiz generation result to backend via callback (sync). Returns True on success."""
    headers = {"X-Internal-Key": callback_key} if callback_key else {}
    with httpx.Client(timeout=30) as client:
        resp = client.post(callback_url, json={
            "jobId": job_id,
            "userId": user_id,
            "status": status,
            "costMicrodollars": cost,
            "operationType": operation_type,
            "quizzes": quizzes or [],
        }, headers=headers)
    if resp.status_code != 200:
        logger.error("Quiz result callback failed: status=%d body=%s", resp.status_code, resp.text)
        return False
    return True


def send_job_status(
    callback_url: str,
    callback_key: str,
    job_id: str,
    status: str,
    increment_attempts: bool = False,
) -> bool:
    """Send lightweight job status update to backend (sync). Returns True on success."""
    headers = {"X-Internal-Key": callback_key} if callback_key else {}
    with httpx.Client(timeout=10) as client:
        resp = client.post(callback_url, json={
            "jobId": job_id,
            "status": status,
            "incrementAttempts": increment_attempts,
        }, headers=headers)
    if resp.status_code != 200:
        logger.error("Job status callback failed: status=%d body=%s", resp.status_code, resp.text)
        return False
    return True
