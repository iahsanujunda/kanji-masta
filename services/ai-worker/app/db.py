from __future__ import annotations

import json
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool

# Register UUID adapter
psycopg2.extras.register_uuid()

_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def init_pool():
    global _pool
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL not set")
    _pool = psycopg2.pool.ThreadedConnectionPool(1, 5, dsn=dsn)


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    if _pool is None:
        init_pool()
    return _pool


@contextmanager
def get_conn():
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def get_active_model_config() -> dict | None:
    """Return the only active safe model configuration, if one exists."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT version, photo_analysis_model, quiz_generation_model,
                       word_discovery_model
                FROM ai_model_config
                WHERE status = 'active' AND validation_status = 'passed'
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "version": row["version"],
                "photoAnalysisModel": row["photo_analysis_model"],
                "quizGenerationModel": row["quiz_generation_model"],
                "wordDiscoveryModel": row["word_discovery_model"],
            }


# ---------------------------------------------------------------------------
# analyze_photo queries
# ---------------------------------------------------------------------------

def claim_photo_session_for_analysis(session_id: str, task_attempt: int) -> dict | None:
    """Atomically claim one Cloud Run task attempt and return its durable input."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, user_id, image_url, status, attempts
                FROM photo_session
                WHERE id = %s
                FOR UPDATE
                """,
                (session_id,),
            )
            row = cur.fetchone()
            if not row or row["status"] in ("DONE", "INGESTED", "FAILED", "ERROR"):
                return None

            cur.execute(
                """
                SELECT id, attempt_number, status, model_config_version, model_id
                FROM job_attempt
                WHERE job_type = 'photo_analysis' AND job_id = %s
                ORDER BY attempt_number DESC
                LIMIT 1
                FOR UPDATE
                """,
                (session_id,),
            )
            attempt = cur.fetchone()
            if attempt and attempt["status"] == "processing":
                if task_attempt == 0:
                    return None
                cur.execute(
                    """
                    UPDATE job_attempt
                    SET status = 'failed', failure_code = 'provider_failed', finished_at = now()
                    WHERE id = %s AND status = 'processing'
                    """,
                    (attempt["id"],),
                )
                next_number = attempt["attempt_number"] + 1
                cur.execute(
                    """
                    INSERT INTO job_attempt (
                        job_type, job_id, attempt_number, status, trigger,
                        model_config_version, model_id, created_by
                    ) VALUES ('photo_analysis', %s, %s, 'pending', 'platform_retry', %s, %s, 'system')
                    RETURNING id, attempt_number, status, model_config_version, model_id
                    """,
                    (session_id, next_number, attempt["model_config_version"], attempt["model_id"]),
                )
                attempt = cur.fetchone()
            elif attempt and attempt["status"] != "pending":
                return None
            elif not attempt:
                cur.execute(
                    """
                    SELECT version, photo_analysis_model
                    FROM ai_model_config
                    WHERE status = 'active' AND validation_status = 'passed'
                    LIMIT 1
                    """
                )
                config = cur.fetchone()
                next_number = max(row["attempts"] or 0, 0) + 1
                cur.execute(
                    """
                    INSERT INTO job_attempt (
                        job_type, job_id, attempt_number, status, trigger,
                        model_config_version, model_id, created_by
                    ) VALUES ('photo_analysis', %s, %s, 'pending', 'initial', %s, %s, 'system')
                    RETURNING id, attempt_number, status, model_config_version, model_id
                    """,
                    (
                        session_id,
                        next_number,
                        config["version"] if config else None,
                        config["photo_analysis_model"] if config else None,
                    ),
                )
                attempt = cur.fetchone()

            cur.execute(
                """
                UPDATE job_attempt
                SET status = 'processing', started_at = COALESCE(started_at, now())
                WHERE id = %s AND status = 'pending'
                """,
                (attempt["id"],),
            )
            if cur.rowcount != 1:
                return None
            cur.execute(
                """
                UPDATE photo_session
                SET attempts = %s, status = 'PROCESSING', failure_code = NULL
                WHERE id = %s
                """,
                (attempt["attempt_number"], session_id),
            )
            result = {
                "id": str(row["id"]),
                "userId": row["user_id"],
                "imageUrl": row["image_url"],
            }
            if attempt["model_id"]:
                result["modelId"] = attempt["model_id"]
                result["modelConfigVersion"] = attempt["model_config_version"]
            return result

def get_user_known_kanji(user_id: str) -> list[str]:
    """Fetch all kanji characters the user already knows."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT km.character
                FROM user_kanji uk
                JOIN kanji_master km ON uk.kanji_id = km.id
                WHERE uk.user_id = %s
                """,
                (user_id,),
            )
            return [row[0] for row in cur.fetchall()]


def lookup_kanji(characters: list[str]) -> dict[str, dict]:
    """Look up kanji in kanji_master, return dict keyed by character."""
    if not characters:
        return {}
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, character, onyomi, kunyomi, meanings, frequency FROM kanji_master WHERE character = ANY(%s)",
                (characters,),
            )
            rows = cur.fetchall()
            return {row["character"]: {**row, "id": str(row["id"])} for row in rows}


def record_user_cost(cur, user_id: str, operation_type: str, operation_id: str, cost_microdollars: int):
    """Insert a cost record into user_cost table. Must be called within a transaction."""
    if cost_microdollars <= 0 or not user_id:
        return
    cur.execute(
        "INSERT INTO user_cost (user_id, operation_type, operation_id, cost_microdollars) VALUES (%s, %s, %s, %s)",
        (user_id, operation_type, operation_id, cost_microdollars),
    )


def update_photo_session(
    session_id: str,
    raw_response: str,
    cost_microdollars: int,
    user_id: str = "",
    failure_code: str | None = None,
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            status = "DONE" if raw_response and raw_response != "[]" else "FAILED"
            cur.execute(
                """
                UPDATE photo_session
                SET raw_ai_response = %s, status = %s, cost_microdollars = %s, failure_code = %s
                WHERE id = %s
                """,
                (raw_response, status, cost_microdollars, failure_code, session_id),
            )
            cur.execute(
                """
                UPDATE job_attempt
                SET status = %s, failure_code = %s, finished_at = now()
                WHERE id = (
                    SELECT id FROM job_attempt
                    WHERE job_type = 'photo_analysis' AND job_id = %s
                      AND status IN ('pending', 'processing')
                    ORDER BY attempt_number DESC LIMIT 1
                )
                """,
                ("done" if status == "DONE" else "failed", failure_code, session_id),
            )
            record_user_cost(cur, user_id, "PHOTO_ANALYSIS", session_id, cost_microdollars)


# ---------------------------------------------------------------------------
# generate_quizzes queries
# ---------------------------------------------------------------------------

def get_pending_jobs(limit: int = 10) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    qgj.id, qgj.user_id, qgj.kanji_id, qgj.word_master_id,
                    qgj.job_type, qgj.trigger, qgj.quiz_id, qgj.attempts,
                    km.character AS kanji_character,
                    km.onyomi AS kanji_onyomi,
                    km.kunyomi AS kanji_kunyomi,
                    km.meanings AS kanji_meanings,
                    wm.word AS word_text,
                    wm.reading AS word_reading,
                    wm.meanings AS word_meanings,
                    ja.id AS attempt_id,
                    ja.attempt_number,
                    ja.status AS attempt_status,
                    ja.model_config_version,
                    ja.model_id
                FROM quiz_generation_job qgj
                JOIN kanji_master km ON qgj.kanji_id = km.id
                LEFT JOIN word_master wm ON qgj.word_master_id = wm.id
                LEFT JOIN LATERAL (
                    SELECT id, attempt_number, status, model_config_version, model_id
                    FROM job_attempt
                    WHERE job_type = 'quiz_generation' AND job_id = qgj.id
                    ORDER BY attempt_number DESC
                    LIMIT 1
                ) ja ON true
                WHERE qgj.status = 'PENDING'
                ORDER BY qgj.created_at ASC
                LIMIT %s
                FOR UPDATE OF qgj SKIP LOCKED
                """,
                (limit,),
            )
            rows = cur.fetchall()
            claimed = []
            for row in rows:
                attempt_id = row.get("attempt_id")
                if not attempt_id or row.get("attempt_status") not in ("pending", "processing"):
                    cur.execute(
                        """
                        SELECT version, quiz_generation_model
                        FROM ai_model_config
                        WHERE status = 'active' AND validation_status = 'passed'
                        LIMIT 1
                        """
                    )
                    config = cur.fetchone()
                    next_number = max(row.get("attempt_number") or 0, row.get("attempts") or 0) + 1
                    cur.execute(
                        """
                        INSERT INTO job_attempt (
                            job_type, job_id, attempt_number, status, trigger,
                            model_config_version, model_id, created_by
                        ) VALUES ('quiz_generation', %s, %s, 'pending', 'initial', %s, %s, 'system')
                        RETURNING id, attempt_number, model_config_version, model_id
                        """,
                        (
                            row["id"],
                            next_number,
                            config["version"] if config else None,
                            config["quiz_generation_model"] if config else None,
                        ),
                    )
                    created = cur.fetchone()
                    attempt_id = created["id"]
                    row["attempt_number"] = created["attempt_number"]
                    row["model_config_version"] = created["model_config_version"]
                    row["model_id"] = created["model_id"]
                elif row.get("attempt_status") == "processing":
                    continue

                cur.execute(
                    """
                    UPDATE job_attempt
                    SET status = 'processing', started_at = COALESCE(started_at, now())
                    WHERE id = %s AND status = 'pending'
                    """,
                    (attempt_id,),
                )
                if cur.rowcount != 1:
                    continue
                cur.execute(
                    """
                    UPDATE quiz_generation_job
                    SET status = 'PROCESSING', attempts = %s
                    WHERE id = %s AND status = 'PENDING'
                    """,
                    (row["attempt_number"], row["id"]),
                )
                if cur.rowcount == 1:
                    claimed.append(_map_job_row(row))
            return claimed


def _map_job_row(row: dict) -> dict:
    """Map flat DB row to nested dict matching the old GraphQL shape."""
    return {
        "id": str(row["id"]),
        "userId": row["user_id"],
        "kanjiId": str(row["kanji_id"]),
        "wordMasterId": str(row["word_master_id"]) if row["word_master_id"] else None,
        "jobType": row["job_type"],
        "trigger": row["trigger"],
        "quizId": str(row["quiz_id"]) if row.get("quiz_id") else None,
        "attempts": row.get("attempts", 0),
        "attemptNumber": row.get("attempt_number"),
        "modelConfigVersion": row.get("model_config_version"),
        "modelId": row.get("model_id"),
        "kanji": {
            "character": row["kanji_character"],
            "onyomi": row["kanji_onyomi"] or [],
            "kunyomi": row["kanji_kunyomi"] or [],
            "meanings": row["kanji_meanings"] or [],
        },
        "wordMaster": {
            "word": row["word_text"],
            "reading": row["word_reading"],
            "meanings": row["word_meanings"] or [],
        } if row.get("word_text") else None,
    }


def update_job_status(job_id: str, status: str, cost: int = 0, increment_attempts: bool = False, user_id: str = "", operation_type: str = "QUIZ_GENERATION"):
    with get_conn() as conn:
        with conn.cursor() as cur:
            if increment_attempts:
                cur.execute(
                    """
                    UPDATE quiz_generation_job
                    SET status = %s::job_status, cost_microdollars = COALESCE(%s, cost_microdollars),
                        attempts = attempts + 1
                    WHERE id = %s
                    """,
                    (status, cost if cost > 0 else None, job_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE quiz_generation_job
                    SET status = %s::job_status, cost_microdollars = COALESCE(%s, cost_microdollars)
                    WHERE id = %s
                    """,
                    (status, cost if cost > 0 else None, job_id),
                )
            record_user_cost(cur, user_id, operation_type, job_id, cost)
            if status in ("DONE", "FAILED"):
                cur.execute(
                    """
                    UPDATE job_attempt
                    SET status = %s, failure_code = %s, finished_at = now()
                    WHERE id = (
                        SELECT id FROM job_attempt
                        WHERE job_type = 'quiz_generation' AND job_id = %s
                          AND status IN ('pending', 'processing')
                        ORDER BY attempt_number DESC LIMIT 1
                    )
                    """,
                    (status.lower(), "provider_failed" if status == "FAILED" else None, job_id),
                )


def insert_quiz_and_distractor(kanji_id: str, word_master_id: str, quiz: dict) -> bool:
    """Insert a global quiz (user_id=NULL) and its distractor set. Returns True on success."""
    from .prompts import QUIZ_TYPE_MAP

    qt = QUIZ_TYPE_MAP.get(quiz.get("quiz_type", ""), quiz.get("quiz_type", ""))
    furigana = quiz.get("furigana")
    explanation = quiz.get("explanation")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO quiz_bank (kanji_id, word_id, quiz_type, prompt, target, answer, furigana, explanation)
                VALUES (%s, %s, %s::quiz_type, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    kanji_id,
                    word_master_id,
                    qt,
                    quiz.get("prompt", ""),
                    quiz.get("target", ""),
                    quiz.get("answer", ""),
                    furigana,
                    explanation,
                ),
            )
            row = cur.fetchone()
            if not row:
                return False
            quiz_id = str(row[0])

            distractors = quiz.get("distractors", [])
            if distractors:
                cur.execute(
                    """
                    INSERT INTO quiz_distractor (quiz_id, distractors, generation, trigger, familiarity_at_generation)
                    VALUES (%s, %s, 1, 'INITIAL'::distractor_trigger, 0)
                    """,
                    (quiz_id, distractors),
                )

    return True


# ---------------------------------------------------------------------------
# regen queries
# ---------------------------------------------------------------------------

def get_quiz_for_regen(quiz_id: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, quiz_type, prompt, answer, user_id, kanji_id FROM quiz_bank WHERE id = %s",
                (quiz_id,),
            )
            quiz = cur.fetchone()
            if not quiz:
                return None

            cur.execute(
                """
                SELECT distractors, generation
                FROM quiz_distractor
                WHERE quiz_id = %s
                ORDER BY generation DESC
                """,
                (quiz_id,),
            )
            dist_sets = cur.fetchall()

            result = {**quiz, "id": str(quiz["id"]), "kanji_id": str(quiz["kanji_id"])}
            result["quizDistractors"] = [
                {"distractors": d["distractors"], "generation": d["generation"]}
                for d in dist_sets
            ]
            return result


def get_user_familiarity(user_id: str, kanji_id: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT familiarity FROM user_kanji WHERE user_id = %s AND kanji_id = %s",
                (user_id, kanji_id),
            )
            row = cur.fetchone()
            return row[0] if row else 0


def insert_regen_distractor(
    quiz_id: str, user_id: str, distractors: list[str],
    generation: int, trigger: str, familiarity: int,
):
    trigger_enum = "MILESTONE" if trigger == "milestone" else "SERVE_COUNT"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO quiz_distractor (quiz_id, user_id, distractors, generation, trigger, familiarity_at_generation)
                VALUES (%s, %s, %s, %s, %s::distractor_trigger, %s)
                """,
                (quiz_id, user_id, distractors, generation, trigger_enum, familiarity),
            )


# ---------------------------------------------------------------------------
# check_regen_triggers queries
# ---------------------------------------------------------------------------

def get_quizzes_for_regen_check() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT qb.id, qb.user_id, qb.kanji_id, qb.served_count, qb.quiz_type,
                       (SELECT served_at FROM quiz_distractor qd
                        WHERE qd.quiz_id = qb.id ORDER BY generation DESC LIMIT 1) AS latest_dist_served_at
                FROM quiz_bank qb
                WHERE qb.served_count > 0
                LIMIT 1000
                """
            )
            return [
                {**row, "id": str(row["id"]), "kanji_id": str(row["kanji_id"])}
                for row in cur.fetchall()
            ]


def insert_regen_job(user_id: str, kanji_id: str, quiz_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO quiz_generation_job (user_id, kanji_id, quiz_id, job_type, trigger)
                VALUES (%s, %s, %s, 'REGEN'::job_type, 'serve_count')
                """,
                (user_id, kanji_id, quiz_id),
            )


# ---------------------------------------------------------------------------
# discover_words queries
# ---------------------------------------------------------------------------

def find_word_master_by_word(word: str) -> str | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM word_master WHERE word = %s", (word,))
            row = cur.fetchone()
            return str(row[0]) if row else None


def insert_word_master(word: str, reading: str, meaning: str, kanji_id: str) -> str | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO word_master (word, reading, meanings, kanji_ids)
                VALUES (%s, %s, %s, %s::uuid[])
                RETURNING id
                """,
                (word, reading, [meaning], [kanji_id]),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None


def find_user_word(user_id: str, word_master_id: str) -> str | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM user_words WHERE user_id = %s AND word_master_id = %s",
                (user_id, word_master_id),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None


def insert_user_word(user_id: str, word_master_id: str, kanji_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_words (user_id, word_master_id, kanji_ids, source, discovered_via_kanji_id, unlocked)
                VALUES (%s, %s, %s::uuid[], 'DISCOVERY'::word_source, %s, true)
                """,
                (user_id, word_master_id, [kanji_id], kanji_id),
            )


def has_global_quizzes(word_master_id: str) -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM quiz_bank WHERE word_id = %s AND user_id IS NULL LIMIT 1",
                (word_master_id,),
            )
            return cur.fetchone() is not None


def insert_quiz_generation_job(user_id: str, kanji_id: str, word_master_id: str | None = None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO quiz_generation_job (user_id, kanji_id, word_master_id)
                VALUES (%s, %s, %s)
                """,
                (user_id, kanji_id, word_master_id),
            )
