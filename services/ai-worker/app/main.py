from __future__ import annotations

import json
import time

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import db
from .gemini import get_client, analyze_image, generate_quizzes_text, discover_words_text, calculate_cost_microdollars
from .models import AnalyzePhotoRequest, GenerateQuizzesRequest, DiscoverWordsRequest, StatusResponse, DiscoverWordsResponse
from .prompts import KANJI_PROMPT, QUIZ_PROMPT, REGEN_PROMPT, DISCOVERY_PROMPT, QUIZ_TYPE_MAP
from .trace import TraceContext, default_ctx


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_pool()
    yield


app = FastAPI(title="Kanji Masta AI Worker", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# analyze-photo
# ---------------------------------------------------------------------------

@app.post("/analyze-photo")
async def analyze_photo(body: AnalyzePhotoRequest, request: Request):
    ctx = TraceContext.from_request(request)
    if body.userId:
        ctx.user_id = body.userId
    start = time.time()

    ctx.log_info("analyze_photo: session=%s downloading image", body.sessionId)

    # Download image — rewrite localhost URLs for Docker networking
    image_url = body.imageUrl
    for host in ("127.0.0.1", "localhost"):
        image_url = image_url.replace(f"http://{host}:", "http://host.docker.internal:")
    async with httpx.AsyncClient() as http:
        img_resp = await http.get(image_url)
    if img_resp.status_code != 200:
        ctx.log_error("analyze_photo: failed to download image, status=%d", img_resp.status_code)
        return JSONResponse({"error": f"Failed to download image: {img_resp.status_code}"}, status_code=500)

    image_bytes = img_resp.content
    content_type = img_resp.headers.get("content-type", "image/jpeg")

    # Fetch user's known kanji for context
    known_kanji = db.get_user_known_kanji(body.userId) if body.userId else []
    if known_kanji:
        known_kanji_section = f"The learner already knows these kanji: {', '.join(known_kanji)}\nDo NOT recommend kanji they already know."
    else:
        known_kanji_section = "The learner is a beginner with no kanji knowledge yet."

    prompt = KANJI_PROMPT.format(known_kanji_section=known_kanji_section)
    ctx.log_info("analyze_photo: session=%s calling Gemini (known kanji: %d)", body.sessionId, len(known_kanji))

    client = get_client()
    try:
        kanji_list, cost = analyze_image(client, prompt, image_bytes, content_type)
    except json.JSONDecodeError:
        ctx.log_error("analyze_photo: session=%s failed to parse JSON response", body.sessionId)
        db.update_photo_session(body.sessionId, "", 0)
        return JSONResponse({"error": "Failed to parse AI response"}, status_code=500)

    ctx.log_info("analyze_photo: session=%s Gemini done, cost=$%.4f", body.sessionId, cost / 1_000_000)

    # Enrich with KanjiMaster data
    characters = [k["character"] for k in kanji_list if "character" in k]
    master_lookup = db.lookup_kanji(characters)

    enriched = []
    for k in kanji_list:
        char = k.get("character", "")
        master = master_lookup.get(char)
        enriched.append({
            "kanjiMasterId": master["id"] if master else None,
            "character": char,
            "recommended": k.get("recommended", False),
            "whyUseful": k.get("whyUseful", ""),
            "onyomi": master["onyomi"] if master else [],
            "kunyomi": master["kunyomi"] if master else [],
            "meanings": master["meanings"] if master else [],
            "frequency": master["frequency"] if master else None,
            "exampleWords": k.get("exampleWords", []),
        })

    enriched_json = json.dumps(enriched, ensure_ascii=False)

    if body.callbackUrl:
        from .callback import send_photo_result
        ok = await send_photo_result(body.callbackUrl, body.callbackKey or "", body.sessionId, body.userId or "", enriched_json, cost)
        if not ok:
            ctx.log_error("analyze_photo: callback failed for session=%s", body.sessionId)
            return JSONResponse({"error": "Callback failed"}, status_code=500)
    else:
        db.update_photo_session(body.sessionId, enriched_json, cost, user_id=body.userId or "")

    elapsed = time.time() - start
    ctx.log_info("analyze_photo: session=%s done, %d kanji enriched in %.1fs", body.sessionId, len(enriched), elapsed)
    return StatusResponse()


# ---------------------------------------------------------------------------
# generate-quizzes (HTTP trigger + cron)
# ---------------------------------------------------------------------------

def _run_quiz_generation(ctx: TraceContext, callback_url: str = "", callback_status_url: str = "", callback_key: str = ""):
    from .callback import send_quiz_result, send_job_status as send_job_status_callback

    client = get_client()
    jobs = db.get_pending_jobs(limit=10)
    if not jobs:
        ctx.log_info("generate_quizzes: no pending jobs")
        return

    ctx.log_info("generate_quizzes: processing %d jobs", len(jobs))

    for job in jobs:
        job_id = job["id"]
        job_type = job.get("jobType", "INITIAL")
        character = job.get("kanji", {}).get("character", "?")
        word_data = job.get("wordMaster") or {}
        word_text = word_data.get("word", "(no word)")

        user_id = job.get("userId", "")
        op_type = "QUIZ_REGEN" if job_type == "REGEN" else "QUIZ_GENERATION"

        ctx.log_info("generate_quizzes: job=%s type=%s kanji=%s word=%s", job_id[:8], job_type, character, word_text)

        # Mark PROCESSING
        if callback_status_url:
            send_job_status_callback(callback_status_url, callback_key, job_id, "PROCESSING")
        else:
            db.update_job_status(job_id, "PROCESSING")

        try:
            if job_type == "REGEN":
                cost, errors, quizzes = _process_regen_job(client, job, ctx)
            else:
                cost, errors, quizzes = _process_initial_job(client, job, ctx)

            if errors == 0:
                status = "DONE"
            else:
                status = "FAILED"
                ctx.log_error("generate_quizzes: job=%s had %d errors", job_id[:8], errors)

            if callback_url:
                ok = send_quiz_result(callback_url, callback_key, job_id, user_id, status, cost, op_type, quizzes)
                if not ok:
                    ctx.log_error("generate_quizzes: callback failed for job=%s", job_id[:8])
                    continue
            else:
                # Legacy direct DB path
                for q in quizzes:
                    db.insert_quiz_and_distractor(q["kanjiId"], q["wordMasterId"], q)
                db.update_job_status(job_id, status, cost=cost, user_id=user_id, operation_type=op_type,
                                     increment_attempts=(status == "FAILED"))

            if status == "DONE":
                ctx.log_info("generate_quizzes: job=%s done, cost=$%.4f", job_id[:8], cost / 1_000_000)

        except Exception as e:
            ctx.log_error("generate_quizzes: job=%s failed — %s", job_id[:8], e)
            if callback_status_url:
                send_job_status_callback(callback_status_url, callback_key, job_id, "FAILED", increment_attempts=True)
            else:
                db.update_job_status(job_id, "FAILED", increment_attempts=True)


def _process_initial_job(client, job: dict, ctx: TraceContext) -> tuple[int, int, list[dict]]:
    kanji_id = job["kanjiId"]
    word_master_id = job.get("wordMasterId", "")
    word_data = job.get("wordMaster") or {}

    meanings = word_data.get("meanings", [])
    meaning = meanings[0] if isinstance(meanings, list) and meanings else "?"

    prompt = QUIZ_PROMPT.format(
        word=word_data.get("word", "?"),
        reading=word_data.get("reading", "?"),
        meaning=meaning,
    )

    quizzes, cost = generate_quizzes_text(client, prompt)

    # Attach IDs so the callback receiver knows where to insert
    for q in quizzes:
        q["kanjiId"] = kanji_id
        q["wordMasterId"] = word_master_id

    return cost, 0, quizzes


def _process_regen_job(client, job: dict, ctx: TraceContext) -> tuple[int, int, list[dict]]:
    quiz_id = job.get("quizId")
    if not quiz_id:
        ctx.log_error("REGEN job missing quizId")
        return 0, 1, []

    quiz = db.get_quiz_for_regen(quiz_id)
    if not quiz:
        ctx.log_error("Quiz %s not found for regen", quiz_id)
        return 0, 1, []

    user_id = quiz["user_id"]
    kanji_id = quiz["kanji_id"]
    familiarity = db.get_user_familiarity(user_id, kanji_id)

    prev_sets = quiz.get("quizDistractors", [])
    prev_distractors = [s["distractors"] for s in prev_sets]
    current_generation = max((s["generation"] for s in prev_sets), default=0)

    prompt = REGEN_PROMPT.format(
        familiarity=familiarity,
        quiz_type=quiz["quiz_type"],
        prompt=quiz["prompt"],
        answer=quiz["answer"],
        previous_distractors=json.dumps(prev_distractors, ensure_ascii=False),
    )

    distractors, cost = generate_quizzes_text(client, prompt)

    # Regen still writes directly — it's a distractor update, not a new quiz
    trigger = job.get("trigger", "milestone")
    db.insert_regen_distractor(
        quiz_id=quiz_id,
        user_id=user_id,
        distractors=distractors,
        generation=current_generation + 1,
        trigger=trigger,
        familiarity=familiarity,
    )

    return cost, 0, []


@app.post("/generate-quizzes")
def generate_quizzes_http(request: Request, body: GenerateQuizzesRequest = GenerateQuizzesRequest()):
    ctx = TraceContext.from_request(request)
    start = time.time()
    _run_quiz_generation(ctx, callback_url=body.callbackUrl or "", callback_status_url=body.callbackStatusUrl or "", callback_key=body.callbackKey or "")
    elapsed = time.time() - start
    ctx.log_info("generate_quizzes_http: completed in %.1fs", elapsed)
    return StatusResponse()


@app.post("/cron/generate-quizzes")
def cron_generate_quizzes():
    _run_quiz_generation(default_ctx)
    return StatusResponse()


# ---------------------------------------------------------------------------
# cron: check-regen
# ---------------------------------------------------------------------------

@app.post("/cron/check-regen")
def cron_check_regen():
    quizzes = db.get_quizzes_for_regen_check()
    if not quizzes:
        return StatusResponse()

    enqueued = 0
    for quiz in quizzes:
        # Skip global quizzes (user_id is null)
        if not quiz.get("user_id"):
            continue

        # Skip if latest distractor set is unserved (still fresh)
        if quiz.get("latest_dist_served_at") is None:
            continue

        # Trigger: serve count >= 10
        if quiz["served_count"] >= 10:
            db.insert_regen_job(quiz["user_id"], quiz["kanji_id"], quiz["id"])
            enqueued += 1

    print(f"Regen cron: enqueued {enqueued} regen jobs from {len(quizzes)} eligible quizzes")
    return StatusResponse()


# ---------------------------------------------------------------------------
# discover-words
# ---------------------------------------------------------------------------

@app.post("/discover-words")
def discover_words(body: DiscoverWordsRequest):
    prompt = DISCOVERY_PROMPT.format(
        character=body.character,
        known_words="、".join(body.knownWords) if body.knownWords else "(none)",
    )

    client = get_client()
    try:
        new_words = discover_words_text(client, prompt)
    except json.JSONDecodeError:
        return JSONResponse({"error": "Failed to parse response"}, status_code=500)

    inserted = 0
    for w in new_words:
        word_text = w.get("word", "")
        reading = w.get("reading", "")
        meaning = w.get("meaning", "")
        if not word_text:
            continue

        # Find or create WordMaster
        wm_id = db.find_word_master_by_word(word_text)
        if not wm_id:
            wm_id = db.insert_word_master(word_text, reading, meaning, body.kanjiId)
            if not wm_id:
                continue

        # Skip if UserWord already exists
        if db.find_user_word(body.userId, wm_id):
            continue

        # Insert UserWord
        db.insert_user_word(body.userId, wm_id, body.kanjiId)

        # Enqueue quiz generation if no global quizzes exist
        if not db.has_global_quizzes(wm_id):
            db.insert_quiz_generation_job(body.userId, body.kanjiId, wm_id)

        inserted += 1

    print(f"Word discovery for {body.character}: inserted {inserted} new words for user {body.userId}")
    return DiscoverWordsResponse(inserted=inserted)
