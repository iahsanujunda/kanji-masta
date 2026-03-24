import json
import logging
import os
import time

import requests
from firebase_admin import initialize_app
from firebase_functions import https_fn, scheduler_fn
from google import genai
from google.genai import types

initialize_app()

log = logging.getLogger("functions")
log.setLevel(logging.INFO)


class TraceContext:
    """Trace context extracted from request headers."""
    call_id: str = "no-call"
    user_id: str = "anon"

    @classmethod
    def from_request(cls, req) -> "TraceContext":
        ctx = cls()
        if req:
            ctx.call_id = req.headers.get("X-Call-Id", "no-call")
            ctx.user_id = req.headers.get("X-User-Id", "anon")
            body = req.get_json(silent=True) or {}
            if ctx.user_id == "anon" and body.get("userId"):
                ctx.user_id = body["userId"]
        return ctx

    @property
    def _prefix(self) -> str:
        return f"[{self.call_id}] [{self.user_id}]"

    def log_info(self, msg, *args):
        print(f"{self._prefix} INFO {msg % args}" if args else f"{self._prefix} INFO {msg}")

    def log_error(self, msg, *args):
        print(f"{self._prefix} ERROR {msg % args}" if args else f"{self._prefix} ERROR {msg}")

    def log_warn(self, msg, *args):
        print(f"{self._prefix} WARN {msg % args}" if args else f"{self._prefix} WARN {msg}")


_default_ctx = TraceContext()

KANJI_PROMPT = """You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji visible.

{known_kanji_section}

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Mark up to 3 kanji as recommended:true — choose the ones most worth learning
first based on how frequently they appear in everyday Japanese life.
Prefer recommending kanji the learner does NOT already know.
Only recommend known kanji if there are fewer than 3 unknown kanji in the image worth learning.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {{
    "character": "電",
    "recommended": true,
    "whyUseful": "Core kanji for anything electric — trains, phones, appliances",
    "exampleWords": [
      {{ "word": "電車", "reading": "でんしゃ", "meaning": "train" }},
      {{ "word": "電話", "reading": "でんわ", "meaning": "telephone" }},
      {{ "word": "電気", "reading": "でんき", "meaning": "electricity / lights" }},
      {{ "word": "電池", "reading": "でんち", "meaning": "battery" }},
      {{ "word": "充電", "reading": "じゅうでん", "meaning": "charging (a device)" }}
    ]
  }}
]"""


def _get_data_connect_url():
    project_id = os.environ.get("GCLOUD_PROJECT", "kanji-masta")
    dc_host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST")

    # Auto-detect: if running in emulator, default to local Data Connect
    if not dc_host and os.environ.get("FUNCTIONS_EMULATOR"):
        dc_host = "127.0.0.1:9399"

    if dc_host:
        return f"http://{dc_host}/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
    return (
        f"https://firebasedataconnect.googleapis.com"
        f"/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
    )


def _execute_graphql(query: str, variables: dict | None = None) -> dict | None:
    url = _get_data_connect_url()
    body = {"query": query}
    if variables:
        body["variables"] = variables
    try:
        resp = requests.post(url, json=body, headers={"Content-Type": "application/json"}, timeout=10)
        return resp.json()
    except Exception as e:
        print(f"Data Connect query failed: {e} (url: {url})")
        return None


def _get_user_known_kanji(user_id: str) -> list[str]:
    """Fetch all kanji characters the user already knows."""
    escaped = user_id.replace('"', '\\"')
    query = f"""
        query {{
            userKanjis(where: {{ userId: {{ eq: "{escaped}" }} }}) {{
                kanji {{ character }}
            }}
        }}
    """
    result = _execute_graphql(query)
    rows = result.get("data", {}).get("userKanjis", [])
    return [row["kanji"]["character"] for row in rows]


def _lookup_kanji(characters: list[str]) -> dict[str, dict]:
    """Look up kanji in KanjiMaster, return dict keyed by character."""
    if not characters:
        return {}

    chars_literal = ", ".join(f'"{c}"' for c in characters)
    query = f"""
        query {{
            kanjiMasters(where: {{ character: {{ in: [{chars_literal}] }} }}) {{
                id character onyomi kunyomi meanings frequency
            }}
        }}
    """
    result = _execute_graphql(query)
    rows = result.get("data", {}).get("kanjiMasters", [])
    return {row["character"]: row for row in rows}


def _update_photo_session(session_id: str, raw_response: str, cost_microdollars: int):
    query = f"""
        mutation {{
            photoSession_update(id: "{session_id}", data: {{
                rawAiResponse: {json.dumps(raw_response)},
                costMicrodollars: {cost_microdollars}
            }})
        }}
    """
    _execute_graphql(query)


def _calculate_cost_microdollars(usage) -> int:
    """Estimate cost in microdollars from Gemini usage metadata."""
    if not usage:
        return 0
    # Gemini 3.1 Pro pricing (per 1M tokens): input $2.50, output $15.00
    input_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    input_cost = input_tokens * 2.50 / 1_000_000
    output_cost = output_tokens * 15.00 / 1_000_000
    return int((input_cost + output_cost) * 1_000_000)


@https_fn.on_request(timeout_sec=300, region="asia-east1")
def analyze_photo(req: https_fn.Request) -> https_fn.Response:
    ctx = TraceContext.from_request(req)
    start = time.time()

    body = req.get_json(silent=True)
    if not body:
        return https_fn.Response("Missing JSON body", status=400)

    image_url = body.get("imageUrl")
    user_id = body.get("userId")
    session_id = body.get("sessionId")
    if not image_url or not session_id:
        return https_fn.Response("Missing imageUrl or sessionId", status=400)

    ctx.log_info("analyze_photo: session=%s downloading image", session_id)

    # Download image
    img_resp = requests.get(image_url)
    if img_resp.status_code != 200:
        ctx.log_error("analyze_photo: failed to download image, status=%d", img_resp.status_code)
        return https_fn.Response(f"Failed to download image: {img_resp.status_code}", status=500)

    image_bytes = img_resp.content
    content_type = img_resp.headers.get("Content-Type", "image/jpeg")

    # Fetch user's known kanji for context
    known_kanji = _get_user_known_kanji(user_id) if user_id else []
    if known_kanji:
        known_kanji_section = f"The learner already knows these kanji: {', '.join(known_kanji)}\nDo NOT recommend kanji they already know."
    else:
        known_kanji_section = "The learner is a beginner with no kanji knowledge yet."

    prompt = KANJI_PROMPT.format(known_kanji_section=known_kanji_section)

    ctx.log_info("analyze_photo: session=%s calling Gemini (known kanji: %d)", session_id, len(known_kanji))

    # Call Gemini 3.1 Pro
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return https_fn.Response("GEMINI_API_KEY not configured", status=500)

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[
            types.Part(text=prompt),
            types.Part(inline_data=types.Blob(
                mime_type=content_type,
                data=image_bytes,
            )),
        ],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )

    raw_text = response.text
    cost = _calculate_cost_microdollars(response.usage_metadata)
    ctx.log_info("analyze_photo: session=%s Gemini done, cost=$%.4f", session_id, cost / 1_000_000)

    # Parse Gemini response
    try:
        kanji_list = json.loads(raw_text)
    except json.JSONDecodeError:
        ctx.log_error("analyze_photo: session=%s failed to parse JSON response", session_id)
        _update_photo_session(session_id, raw_text, cost)
        return https_fn.Response(json.dumps({"error": "Failed to parse AI response"}), status=500,
                                 content_type="application/json")

    # Enrich with KanjiMaster data
    characters = [k["character"] for k in kanji_list if "character" in k]
    master_lookup = _lookup_kanji(characters)

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

    # Store enriched result + cost in PhotoSession
    enriched_json = json.dumps(enriched, ensure_ascii=False)
    _update_photo_session(session_id, enriched_json, cost)

    elapsed = time.time() - start
    ctx.log_info("analyze_photo: session=%s done, %d kanji enriched in %.1fs", session_id, len(enriched), elapsed)
    return https_fn.Response(json.dumps({"status": "ok"}), content_type="application/json")


# --- Quiz Generation (Scheduled) ---

QUIZ_PROMPT = """You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target word: {word} ({reading}) — meaning: {meaning}

Generate exactly 5 quizzes, one of each type below.
Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {{
    "quiz_type": "meaning_recall",
    "prompt": "電",
    "target": "電",
    "furigana": null,
    "answer": "electricity",
    "distractors": ["iron", "east", "express"],
    "explanation": "電 is the root of 電車 (train), 電話 (phone), 電気 (electricity)"
  }},
  {{
    "quiz_type": "reading_recognition",
    "prompt": "電車",
    "target": "電車",
    "furigana": null,
    "answer": "でんしゃ",
    "distractors": ["てっどう", "きゅうこう", "ちかてつ"],
    "explanation": "でん (on-yomi of 電) + しゃ (on-yomi of 車)"
  }},
  {{
    "quiz_type": "reverse_reading",
    "prompt": "でんしゃ",
    "target": "でんしゃ",
    "furigana": null,
    "answer": "電車",
    "distractors": ["電話", "電気", "電池"],
    "explanation": "電車 — the kanji for electricity + vehicle"
  }},
  {{
    "quiz_type": "bold_word_meaning",
    "prompt": "電車、遅れてるじゃん。",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "train",
    "distractors": ["bus", "taxi", "subway"],
    "explanation": "電車 literally means electric vehicle — the standard word for train"
  }},
  {{
    "quiz_type": "fill_in_the_blank",
    "prompt": "＿＿乗り換えどこだっけ？",
    "target": "電車",
    "furigana": "でんしゃ",
    "answer": "電車",
    "distractors": ["急行", "地下鉄", "バス停"],
    "explanation": "電車 fits here — asking where to transfer trains"
  }}
]

Rules:
- Sentences must be casual, natural spoken Japanese — the kind said between friends,
  overheard on the street, or seen on informal signs. Not textbook Japanese.
- Draw from real daily contexts: convenience stores, trains, restaurants, weather,
  shopping, work small talk, phone messages, social media captions
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ、short casual commands
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level"""

QUIZ_TYPE_MAP = {
    "meaning_recall": "MEANING_RECALL",
    "reading_recognition": "READING_RECOGNITION",
    "reverse_reading": "REVERSE_READING",
    "bold_word_meaning": "BOLD_WORD_MEANING",
    "fill_in_the_blank": "FILL_IN_THE_BLANK",
}


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _get_pending_jobs(limit: int = 10) -> list[dict]:
    query = f"""
        query {{
            quizGenerationJobs(
                where: {{ status: {{ eq: PENDING }} }},
                limit: {limit}
            ) {{
                id userId kanjiId wordMasterId jobType trigger quizId
                kanji {{ character onyomi kunyomi meanings }}
                wordMaster {{ word reading meanings }}
            }}
        }}
    """
    result = _execute_graphql(query)
    if not result:
        print("_get_pending_jobs: no result from Data Connect")
        return []
    data = result.get("data")
    if not data:
        print(f"_get_pending_jobs: query error: {result.get('errors', [])}")
        return []
    return data.get("quizGenerationJobs", [])


def _update_job_status(job_id: str, status: str, cost: int = 0, increment_attempts: bool = False):
    attempts_field = ""
    if increment_attempts:
        # Read current attempts first
        read = _execute_graphql(f'query {{ quizGenerationJob(id: "{job_id}") {{ attempts }} }}')
        current = (read or {}).get("data", {})
        current = (current or {}).get("quizGenerationJob", {})
        current = (current or {}).get("attempts", 0)
        attempts_field = f"attempts: {current + 1},"

    cost_field = f"costMicrodollars: {cost}," if cost > 0 else ""
    query = f"""
        mutation {{
            quizGenerationJob_update(id: "{job_id}", data: {{
                status: {status},
                {cost_field}
                {attempts_field}
            }})
        }}
    """
    _execute_graphql(query)


def _insert_quiz_and_distractor(kanji_id: str, word_master_id: str, quiz: dict) -> bool:
    """Insert a global quiz (userId=null) and its distractor set."""
    qt = QUIZ_TYPE_MAP.get(quiz.get("quiz_type", ""), quiz.get("quiz_type", ""))
    furigana = quiz.get("furigana")
    explanation = quiz.get("explanation", "")
    furigana_field = f'furigana: "{_escape(furigana)}",' if furigana else ""
    explanation_field = f'explanation: "{_escape(explanation)}",' if explanation else ""

    insert_query = f"""
        mutation {{
            quizBank_insert(data: {{
                kanjiId: "{kanji_id}",
                wordId: "{word_master_id}",
                quizType: {qt},
                prompt: "{_escape(quiz.get('prompt', ''))}",
                target: "{_escape(quiz.get('target', ''))}",
                answer: "{_escape(quiz.get('answer', ''))}",
                {furigana_field}
                {explanation_field}
            }})
        }}
    """
    result = _execute_graphql(insert_query)
    quiz_id = (result or {}).get("data", {}).get("quizBank_insert", {}).get("id")
    if not quiz_id:
        return False

    distractors = quiz.get("distractors", [])
    if distractors:
        dist_json = json.dumps(distractors, ensure_ascii=False)
        dist_query = f"""
            mutation {{
                quizDistractor_insert(data: {{
                    quizId: "{quiz_id}",
                    distractors: {dist_json},
                    generation: 1,
                    trigger: INITIAL,
                    familiarityAtGeneration: 0
                }})
            }}
        """
        _execute_graphql(dist_query)

    return True


REGEN_PROMPT = """Regenerate distractors for this quiz. The learner is now at familiarity {familiarity}/5.
Make distractors more challenging than earlier sets — choose options that are
more plausible or confusable at this level.

Quiz type: {quiz_type}
Prompt: {prompt}
Answer: {answer}
Previous distractor sets: {previous_distractors}

Return ONLY a JSON array of exactly 3 distractors — no markdown, no preamble:
["option1", "option2", "option3"]"""


def _get_quiz_for_regen(quiz_id: str) -> dict | None:
    """Fetch quiz details + previous distractor sets for regen."""
    query = f"""
        query {{
            quizBank(id: "{quiz_id}") {{
                id quizType prompt answer userId kanjiId
                quizDistractors_on_quiz(orderBy: {{ generation: DESC }}) {{
                    distractors generation
                }}
            }}
        }}
    """
    result = _execute_graphql(query)
    return result.get("data", {}).get("quizBank")


def _get_user_familiarity(user_id: str, kanji_id: str) -> int:
    escaped = user_id.replace('"', '\\"')
    query = f"""
        query {{
            userKanjis(where: {{ userId: {{ eq: "{escaped}" }}, kanjiId: {{ eq: "{kanji_id}" }} }}) {{
                familiarity
            }}
        }}
    """
    result = _execute_graphql(query)
    rows = result.get("data", {}).get("userKanjis", [])
    return rows[0]["familiarity"] if rows else 0


def _process_initial_job(client: genai.Client, job: dict) -> tuple[int, int]:
    """Process an INITIAL job — generates global quizzes (userId=null)."""
    kanji_id = job["kanjiId"]
    word_master_id = job.get("wordMasterId", "")
    word_data = job.get("wordMaster") or {}

    prompt = QUIZ_PROMPT.format(
        word=word_data.get("word", "?"),
        reading=word_data.get("reading", "?"),
        meaning=(word_data.get("meanings") or ["?"])[0] if isinstance(word_data.get("meanings"), list) else word_data.get("meaning", "?"),
    )

    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )

    cost = _calculate_cost_microdollars(response.usage_metadata)
    quizzes = json.loads(response.text)

    errors = 0
    for q in quizzes:
        if not _insert_quiz_and_distractor(kanji_id, word_master_id, q):
            errors += 1

    return cost, errors


def _process_regen_job(client: genai.Client, job: dict) -> tuple[int, int]:
    """Process a REGEN job. Returns (cost, error_count)."""
    quiz_id = job.get("quizId")
    if not quiz_id:
        print(f"  REGEN job missing quizId")
        return 0, 1

    quiz = _get_quiz_for_regen(quiz_id)
    if not quiz:
        print(f"  Quiz {quiz_id} not found for regen")
        return 0, 1

    user_id = quiz["userId"]
    kanji_id = quiz["kanjiId"]
    familiarity = _get_user_familiarity(user_id, kanji_id)

    prev_sets = quiz.get("quizDistractors_on_quiz", [])
    prev_distractors = [s["distractors"] for s in prev_sets]
    current_generation = max((s["generation"] for s in prev_sets), default=0)

    prompt = REGEN_PROMPT.format(
        familiarity=familiarity,
        quiz_type=quiz["quizType"],
        prompt=quiz["prompt"],
        answer=quiz["answer"],
        previous_distractors=json.dumps(prev_distractors, ensure_ascii=False),
    )

    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )

    cost = _calculate_cost_microdollars(response.usage_metadata)
    distractors = json.loads(response.text)

    trigger = job.get("trigger", "milestone")
    trigger_enum = "MILESTONE" if trigger == "milestone" else "SERVE_COUNT"
    dist_json = json.dumps(distractors, ensure_ascii=False)

    query = f"""
        mutation {{
            quizDistractor_insert(data: {{
                quizId: "{quiz_id}",
                userId: "{_escape(user_id)}",
                distractors: {dist_json},
                generation: {current_generation + 1},
                trigger: {trigger_enum},
                familiarityAtGeneration: {familiarity}
            }})
        }}
    """
    result = _execute_graphql(query)
    errors = 1 if result.get("errors") else 0
    return cost, errors


def _run_quiz_generation(ctx: TraceContext | None = None):
    """Shared logic for processing pending quiz generation jobs."""
    ctx = ctx or _default_ctx
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        ctx.log_warn("generate_quizzes: GEMINI_API_KEY not configured")
        return

    jobs = _get_pending_jobs(limit=10)
    if not jobs:
        ctx.log_info("generate_quizzes: no pending jobs")
        return

    ctx.log_info("generate_quizzes: processing %d jobs", len(jobs))
    client = genai.Client(api_key=api_key)

    for job in jobs:
        job_id = job["id"]
        job_type = job.get("jobType", "INITIAL")
        character = job.get("kanji", {}).get("character", "?")
        word_text = (job.get("word") or {}).get("word", "(no word)")

        ctx.log_info("generate_quizzes: job=%s type=%s kanji=%s word=%s", job_id[:8], job_type, character, word_text)
        _update_job_status(job_id, "PROCESSING")

        try:
            if job_type == "REGEN":
                cost, errors = _process_regen_job(client, job)
            else:
                cost, errors = _process_initial_job(client, job)

            if errors == 0:
                _update_job_status(job_id, "DONE", cost=cost)
                ctx.log_info("generate_quizzes: job=%s done, cost=$%.4f", job_id[:8], cost / 1_000_000)
            else:
                _update_job_status(job_id, "FAILED", cost=cost, increment_attempts=True)
                ctx.log_error("generate_quizzes: job=%s had %d insert errors", job_id[:8], errors)

        except Exception as e:
            ctx.log_error("generate_quizzes: job=%s failed — %s", job_id[:8], e)
            _update_job_status(job_id, "FAILED", increment_attempts=True)


@https_fn.on_request(timeout_sec=540, region="asia-east1")
def generate_quizzes_http(req: https_fn.Request) -> https_fn.Response:
    """HTTP trigger for immediate quiz generation (called by Ktor after kanji selection)."""
    ctx = TraceContext.from_request(req)
    start = time.time()
    _run_quiz_generation(ctx)
    elapsed = time.time() - start
    ctx.log_info("generate_quizzes_http: completed in %.1fs", elapsed)
    return https_fn.Response(json.dumps({"status": "ok"}), content_type="application/json")


@scheduler_fn.on_schedule(schedule="every 2 minutes", region="asia-east1")
def generate_quizzes(event: scheduler_fn.ScheduledEvent) -> None:
    """Scheduled fallback for retrying failed jobs and processing any stragglers."""
    _run_quiz_generation()


# --- Daily Regen Cron ---

@scheduler_fn.on_schedule(schedule="every 24 hours", region="asia-east1")
def check_regen_triggers(event: scheduler_fn.ScheduledEvent) -> None:
    """Check for quizzes that need distractor regeneration."""
    # Find all quizzes with servedCount > 0 that have no unserved distractor set
    query = """
        query {
            quizBanks(where: { servedCount: { gt: 0 } }, limit: 1000) {
                id userId kanjiId servedCount quizType
                quizDistractors_on_quiz(orderBy: { generation: DESC }, limit: 1) {
                    servedAt generation
                }
            }
        }
    """
    result = _execute_graphql(query)
    quizzes = result.get("data", {}).get("quizBanks", [])

    if not quizzes:
        return

    enqueued = 0
    for quiz in quizzes:
        # Skip global quizzes (userId is null)
        if not quiz.get("userId"):
            continue

        # Skip if latest distractor set is unserved (still fresh)
        dist_sets = quiz.get("quizDistractors_on_quiz", [])
        if dist_sets and dist_sets[0].get("servedAt") is None:
            continue

        # Trigger: serve count >= 10
        if quiz["servedCount"] >= 10:
            query = f"""
                mutation {{
                    quizGenerationJob_insert(data: {{
                        userId: "{_escape(quiz['userId'])}",
                        kanjiId: "{quiz['kanjiId']}",
                        quizId: "{quiz['id']}",
                        jobType: REGEN,
                        trigger: "serve_count"
                    }})
                }}
            """
            _execute_graphql(query)
            enqueued += 1

    print(f"Regen cron: enqueued {enqueued} regen jobs from {len(quizzes)} eligible quizzes")


# --- Word Discovery ---

DISCOVERY_PROMPT = """The learner is studying the kanji: {character}
They already know these words well: {known_words}

Suggest 5 more common daily-life words containing {character} that are
NOT in the known list. Words the learner is likely to encounter in Japan
(shops, stations, restaurants, signage, packaging).

Return ONLY a valid JSON array — no markdown, no preamble:
[
  {{ "word": "会話", "reading": "かいわ", "meaning": "conversation" }}
]"""


@https_fn.on_request(region="asia-east1")
def discover_words(req: https_fn.Request) -> https_fn.Response:
    """Discover fresh words for a kanji when most example words are already familiar."""
    body = req.get_json(silent=True)
    if not body:
        return https_fn.Response("Missing JSON body", status=400)

    user_id = body.get("userId")
    kanji_id = body.get("kanjiId")
    character = body.get("character")
    known_words = body.get("knownWords", [])

    if not user_id or not kanji_id or not character:
        return https_fn.Response("Missing required fields", status=400)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return https_fn.Response("GEMINI_API_KEY not configured", status=500)

    prompt = DISCOVERY_PROMPT.format(
        character=character,
        known_words="、".join(known_words) if known_words else "(none)",
    )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    try:
        new_words = json.loads(response.text)
    except json.JSONDecodeError:
        return https_fn.Response(json.dumps({"error": "Failed to parse response"}), status=500,
                                 content_type="application/json")

    inserted = 0
    for w in new_words:
        word_text = w.get("word", "")
        reading = w.get("reading", "")
        meaning = w.get("meaning", "")
        if not word_text:
            continue

        # Find or create WordMaster
        wm_check = _execute_graphql(f"""
            query {{ wordMasters(where: {{ word: {{ eq: "{_escape(word_text)}" }} }}, limit: 1) {{ id }} }}
        """)
        wm_rows = (wm_check or {}).get("data", {}).get("wordMasters", [])
        if wm_rows:
            wm_id = wm_rows[0]["id"]
        else:
            meanings_json = json.dumps([meaning], ensure_ascii=False)
            wm_result = _execute_graphql(f"""
                mutation {{
                    wordMaster_insert(data: {{
                        word: "{_escape(word_text)}",
                        reading: "{_escape(reading)}",
                        meanings: {meanings_json},
                        kanjiIds: ["{kanji_id}"]
                    }})
                }}
            """)
            wm_id = (wm_result or {}).get("data", {}).get("wordMaster_insert", {}).get("id")
            if not wm_id:
                continue

        # Check if UserWord already exists for this user + WordMaster
        uw_check = _execute_graphql(f"""
            query {{
                userWordss(where: {{ userId: {{ eq: "{_escape(user_id)}" }}, wordMasterId: {{ eq: "{wm_id}" }} }}, limit: 1) {{ id }}
            }}
        """)
        if (uw_check or {}).get("data", {}).get("userWordss", []):
            continue

        # Insert UserWord referencing WordMaster
        _execute_graphql(f"""
            mutation {{
                userWords_insert(data: {{
                    userId: "{_escape(user_id)}",
                    wordMasterId: "{wm_id}",
                    kanjiIds: ["{kanji_id}"],
                    source: DISCOVERY,
                    discoveredViaKanjiId: "{kanji_id}",
                    unlocked: true
                }})
            }}
        """)

        # Enqueue quiz generation if no global quizzes exist
        quiz_check = _execute_graphql(f"""
            query {{ quizBanks(where: {{ wordId: {{ eq: "{wm_id}" }}, userId: {{ isNull: true }} }}, limit: 1) {{ id }} }}
        """)
        if not (quiz_check or {}).get("data", {}).get("quizBanks", []):
            _execute_graphql(f"""
                mutation {{
                    quizGenerationJob_insert(data: {{
                        userId: "{_escape(user_id)}",
                        kanjiId: "{kanji_id}",
                        wordMasterId: "{wm_id}"
                    }})
                }}
            """)
        inserted += 1

    print(f"Word discovery for {character}: inserted {inserted} new words for user {user_id}")
    return https_fn.Response(json.dumps({"inserted": inserted}), content_type="application/json")