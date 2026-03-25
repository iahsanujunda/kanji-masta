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
    _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, dsn=dsn)


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


# ---------------------------------------------------------------------------
# analyze_photo queries
# ---------------------------------------------------------------------------

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


def update_photo_session(session_id: str, raw_response: str, cost_microdollars: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE photo_session SET raw_ai_response = %s, cost_microdollars = %s WHERE id = %s",
                (raw_response, cost_microdollars, session_id),
            )


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
                    wm.meanings AS word_meanings
                FROM quiz_generation_job qgj
                JOIN kanji_master km ON qgj.kanji_id = km.id
                LEFT JOIN word_master wm ON qgj.word_master_id = wm.id
                WHERE qgj.status = 'PENDING'
                ORDER BY qgj.created_at ASC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            return [_map_job_row(row) for row in rows]


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


def update_job_status(job_id: str, status: str, cost: int = 0, increment_attempts: bool = False):
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
