from __future__ import annotations

import asyncio
import os

from . import db
from .main import process_photo
from .models import AnalyzePhotoRequest
from .trace import TraceContext


async def run_photo_job(session_id: str) -> bool:
    db.init_pool()
    task_attempt = int(os.environ.get("CLOUD_RUN_TASK_ATTEMPT", "0"))
    session = db.claim_photo_session_for_analysis(session_id, task_attempt)
    if session is None:
        print(f"[photo-job-{session_id[:8]}] [anon] INFO photo session already claimed, completed, or missing")
        return True

    callback_url = os.environ.get("BACKEND_CALLBACK_URL", "")
    if not callback_url:
        print(f"[photo-job-{session_id[:8]}] [{session['userId']}] ERROR BACKEND_CALLBACK_URL not set")
        return False

    ctx = TraceContext()
    ctx.call_id = f"photo-job-{session_id[:8]}"
    ctx.user_id = session["userId"]
    request = AnalyzePhotoRequest(
        imageUrl=session["imageUrl"],
        userId=session["userId"],
        sessionId=session_id,
        callbackUrl=callback_url,
        callbackKey=os.environ.get("INTERNAL_API_KEY", ""),
    )
    ok, _ = await process_photo(request, ctx)
    return ok


def main() -> None:
    session_id = os.environ.get("PHOTO_SESSION_ID", "")
    if not session_id:
        raise SystemExit("PHOTO_SESSION_ID not set")
    if not asyncio.run(run_photo_job(session_id)):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
