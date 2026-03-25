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
    db.update_photo_session(session_id, '{"test": true}', 12345)

    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT raw_ai_response, cost_microdollars FROM photo_session WHERE id = %s", (session_id,))
        row = cur.fetchone()
    assert row["raw_ai_response"] == '{"test": true}'
    assert row["cost_microdollars"] == 12345


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
