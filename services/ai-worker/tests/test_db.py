"""Unit tests for the database query layer."""
import uuid

import psycopg2.extras

from app import db


def test_get_user_known_kanji_empty(client, db_conn):
    result = db.get_user_known_kanji("nonexistent-user")
    assert result == []


def test_get_user_known_kanji_returns_characters(client, db_conn, seed_kanji):
    # Insert a user_kanji row
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '日'")
        kanji_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_kanji (user_id, kanji_id, status) VALUES (%s, %s, 'LEARNING')",
            ("test-user", kanji_id),
        )
    result = db.get_user_known_kanji("test-user")
    assert "日" in result


def test_lookup_kanji(client, seed_kanji):
    result = db.lookup_kanji(["日", "月", "nonexistent"])
    assert "日" in result
    assert "月" in result
    assert "nonexistent" not in result
    assert result["日"]["onyomi"] == ["ニチ", "ジツ"]


def test_lookup_kanji_empty(client):
    result = db.lookup_kanji([])
    assert result == {}


def test_update_photo_session(client, db_conn):
    # Create a photo session
    session_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO photo_session (id, user_id, image_url) VALUES (%s, 'test-user', 'https://example.com/img.jpg')",
            (session_id,),
        )
    db.update_photo_session(session_id, '{"test": true}', 12345, user_id="test-user")

    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT raw_ai_response, cost_microdollars FROM photo_session WHERE id = %s", (session_id,))
        row = cur.fetchone()
    assert row["raw_ai_response"] == '{"test": true}'
    assert row["cost_microdollars"] == 12345

    # Verify user_cost record was also created
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (session_id,))
        cost_row = cur.fetchone()
    assert cost_row is not None
    assert cost_row["user_id"] == "test-user"
    assert cost_row["operation_type"] == "PHOTO_ANALYSIS"
    assert cost_row["cost_microdollars"] == 12345


def test_get_pending_jobs_empty(client):
    jobs = db.get_pending_jobs()
    assert jobs == []


def test_get_pending_jobs_returns_jobs(client, db_conn, seed_kanji):
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '電'")
        kanji_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO quiz_generation_job (user_id, kanji_id, status) VALUES ('test-user', %s, 'PENDING')",
            (kanji_id,),
        )
    jobs = db.get_pending_jobs()
    assert len(jobs) == 1
    assert jobs[0]["kanji"]["character"] == "電"


def test_insert_quiz_and_distractor(client, db_conn, seed_kanji):
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '日'")
        kanji_id = str(cur.fetchone()[0])
        # Create a word_master
        wm_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO word_master (id, word, reading, meanings, kanji_ids) VALUES (%s, '日曜日', 'にちようび', %s, %s::uuid[])",
            (wm_id, ["Sunday"], [kanji_id]),
        )

    quiz = {
        "quiz_type": "meaning_recall",
        "prompt": "日",
        "target": "日",
        "answer": "day",
        "distractors": ["month", "year", "week"],
        "furigana": None,
        "explanation": "日 means day or sun",
    }
    result = db.insert_quiz_and_distractor(kanji_id, wm_id, quiz)
    assert result is True

    # Verify quiz was inserted
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM quiz_bank WHERE kanji_id = %s", (kanji_id,))
        assert cur.fetchone()[0] == 1
        cur.execute("SELECT COUNT(*) FROM quiz_distractor")
        assert cur.fetchone()[0] == 1


def test_find_or_create_word_master(client, db_conn, seed_kanji):
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '日'")
        kanji_id = str(cur.fetchone()[0])

    # First call creates
    wm_id = db.find_word_master_by_word("新語")
    assert wm_id is None

    created_id = db.insert_word_master("新語", "しんご", "new word", kanji_id)
    assert created_id is not None

    # Second call finds existing
    found_id = db.find_word_master_by_word("新語")
    assert found_id == created_id


def test_has_global_quizzes_false(client):
    assert db.has_global_quizzes(str(uuid.uuid4())) is False


# --- user_cost tests ---


def test_record_user_cost_inserts_row(client, db_conn):
    op_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        db.record_user_cost(cur, "cost-test-user", "PHOTO_ANALYSIS", op_id, 5000)
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (op_id,))
        row = cur.fetchone()
    assert row is not None
    assert row["user_id"] == "cost-test-user"
    assert row["operation_type"] == "PHOTO_ANALYSIS"
    assert row["cost_microdollars"] == 5000


def test_record_user_cost_skips_zero_cost(client, db_conn):
    op_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        db.record_user_cost(cur, "cost-test-user", "PHOTO_ANALYSIS", op_id, 0)
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (op_id,))
        row = cur.fetchone()
    assert row is None


def test_record_user_cost_skips_empty_user(client, db_conn):
    op_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        db.record_user_cost(cur, "", "PHOTO_ANALYSIS", op_id, 5000)
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (op_id,))
        row = cur.fetchone()
    assert row is None


def test_update_job_status_records_cost(client, db_conn, seed_kanji):
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '電'")
        kanji_id = cur.fetchone()[0]
        job_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO quiz_generation_job (id, user_id, kanji_id, status) VALUES (%s, 'cost-test-user', %s, 'PENDING')",
            (job_id, kanji_id),
        )
    db.update_job_status(job_id, "DONE", cost=8000, user_id="cost-test-user", operation_type="QUIZ_GENERATION")

    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (job_id,))
        cost_row = cur.fetchone()
    assert cost_row is not None
    assert cost_row["user_id"] == "cost-test-user"
    assert cost_row["operation_type"] == "QUIZ_GENERATION"
    assert cost_row["cost_microdollars"] == 8000

    # Also verify the job itself was updated
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT status, cost_microdollars FROM quiz_generation_job WHERE id = %s", (job_id,))
        job_row = cur.fetchone()
    assert job_row["status"] == "DONE"
    assert job_row["cost_microdollars"] == 8000


def test_update_job_status_no_cost_no_user_cost_row(client, db_conn, seed_kanji):
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '電'")
        kanji_id = cur.fetchone()[0]
        job_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO quiz_generation_job (id, user_id, kanji_id, status) VALUES (%s, 'cost-test-user', %s, 'PENDING')",
            (job_id, kanji_id),
        )
    # No cost, no user_id → should not create user_cost row
    db.update_job_status(job_id, "FAILED", increment_attempts=True)

    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM user_cost WHERE operation_id = %s", (job_id,))
        cost_row = cur.fetchone()
    assert cost_row is None
