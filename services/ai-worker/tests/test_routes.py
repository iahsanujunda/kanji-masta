"""Integration tests for FastAPI routes (real DB, mocked Gemini)."""
import json
import uuid
from unittest.mock import MagicMock, patch

import psycopg2.extras


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_analyze_photo(client, db_conn, mock_gemini):
    # Create a photo session
    session_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO photo_session (id, user_id, image_url) VALUES (%s, 'test-user', 'https://example.com/img.jpg')",
            (session_id,),
        )

    # Mock image download using AsyncMock for async context manager
    import asyncio
    from unittest.mock import AsyncMock

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"fake-image-bytes"
    mock_resp.headers = {"content-type": "image/jpeg"}

    mock_http = AsyncMock()
    mock_http.get = AsyncMock(return_value=mock_resp)

    with patch("app.main.httpx.AsyncClient") as mock_http_cls:
        mock_http_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http_cls.return_value.__aexit__ = AsyncMock(return_value=None)

        resp = client.post("/analyze-photo", json={
            "imageUrl": "https://example.com/img.jpg",
            "userId": "test-user",
            "sessionId": session_id,
        })

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # Verify photo session was updated
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT raw_ai_response, cost_microdollars FROM photo_session WHERE id = %s", (session_id,))
        row = cur.fetchone()
    assert row["raw_ai_response"] is not None
    assert row["cost_microdollars"] > 0


def test_generate_quizzes_no_jobs(client, mock_gemini):
    resp = client.post("/generate-quizzes", json={})
    assert resp.status_code == 200


def test_generate_quizzes_processes_job(client, db_conn, seed_kanji, mock_gemini):
    # Set up mock to return quiz JSON
    quiz_response = json.dumps([
        {"quiz_type": "meaning_recall", "prompt": "電", "target": "電", "answer": "electricity",
         "distractors": ["water", "fire", "wind"], "furigana": None, "explanation": "test"},
        {"quiz_type": "reading_recognition", "prompt": "電車", "target": "電車", "answer": "でんしゃ",
         "distractors": ["でんわ", "でんき", "でんち"], "furigana": None, "explanation": "test"},
        {"quiz_type": "reverse_reading", "prompt": "でんしゃ", "target": "でんしゃ", "answer": "電車",
         "distractors": ["電話", "電気", "電池"], "furigana": None, "explanation": "test"},
        {"quiz_type": "bold_word_meaning", "prompt": "電車遅れてるじゃん", "target": "電車", "answer": "train",
         "distractors": ["bus", "taxi", "subway"], "furigana": "でんしゃ", "explanation": "test"},
        {"quiz_type": "fill_in_the_blank", "prompt": "＿＿乗り換えどこ？", "target": "電車", "answer": "電車",
         "distractors": ["急行", "地下鉄", "バス停"], "furigana": "でんしゃ", "explanation": "test"},
    ])
    mock_gemini.models.generate_content.return_value.text = quiz_response

    # Seed a pending job
    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '電'")
        kanji_id = cur.fetchone()[0]
        wm_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO word_master (id, word, reading, meanings, kanji_ids) VALUES (%s, '電車', 'でんしゃ', %s, %s::uuid[])",
            (wm_id, ["train"], [str(kanji_id)]),
        )
        cur.execute(
            "INSERT INTO quiz_generation_job (user_id, kanji_id, word_master_id, status) VALUES ('test-user', %s, %s, 'PENDING')",
            (kanji_id, wm_id),
        )

    resp = client.post("/generate-quizzes", json={})
    assert resp.status_code == 200

    # Verify quizzes were created
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM quiz_bank WHERE kanji_id = %s", (kanji_id,))
        assert cur.fetchone()[0] == 5
        cur.execute("SELECT COUNT(*) FROM quiz_distractor")
        assert cur.fetchone()[0] == 5


def test_cron_generate_quizzes(client, mock_gemini):
    resp = client.post("/cron/generate-quizzes")
    assert resp.status_code == 200


def test_cron_check_regen_empty(client):
    resp = client.post("/cron/check-regen")
    assert resp.status_code == 200


def test_discover_words(client, db_conn, seed_kanji, mock_gemini):
    # Mock Gemini to return word discovery results
    mock_gemini.models.generate_content.return_value.text = json.dumps([
        {"word": "日記", "reading": "にっき", "meaning": "diary"},
        {"word": "日本", "reading": "にほん", "meaning": "Japan"},
    ])

    with db_conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = '日'")
        kanji_id = str(cur.fetchone()[0])

    resp = client.post("/discover-words", json={
        "userId": "test-user",
        "kanjiId": kanji_id,
        "character": "日",
        "knownWords": [],
    })
    assert resp.status_code == 200
    assert resp.json()["inserted"] == 2

    # Verify word_master and user_words were created
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM word_master WHERE word IN ('日記', '日本')")
        assert cur.fetchone()[0] == 2
        cur.execute("SELECT COUNT(*) FROM user_words WHERE user_id = 'test-user'")
        assert cur.fetchone()[0] == 2
