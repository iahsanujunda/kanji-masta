"""Integration tests for FastAPI routes (real DB, mocked Gemini)."""
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import psycopg2.extras
from app.ai_client import AIClientError, AIResult


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_analyze_photo(client, db_conn, mock_ai_client):
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


def test_analyze_photo_provider_failure_marks_session_failed(client, db_conn, mock_ai_client):
    session_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO photo_session (id, user_id, image_url) VALUES (%s, 'test-user', 'https://example.com/img.jpg')",
            (session_id,),
        )
    mock_ai_client.analyze_image.side_effect = AIClientError("provider failed")
    image_response = MagicMock(status_code=200, content=b"fake-image", headers={"content-type": "image/jpeg"})
    image_http = AsyncMock()
    image_http.get = AsyncMock(return_value=image_response)

    with patch("app.main.httpx.AsyncClient") as http_client:
        http_client.return_value.__aenter__ = AsyncMock(return_value=image_http)
        http_client.return_value.__aexit__ = AsyncMock(return_value=None)
        response = client.post("/analyze-photo", json={
            "imageUrl": "https://example.com/img.jpg",
            "userId": "test-user",
            "sessionId": session_id,
        })

    assert response.status_code == 500
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT status, failure_code FROM photo_session WHERE id = %s", (session_id,))
        row = cur.fetchone()
    assert row["status"] == "FAILED"
    assert row["failure_code"] == "invalid_response"


def test_analyze_photo_configuration_failure_is_terminal(client, db_conn):
    session_id = str(uuid.uuid4())
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO photo_session (id, user_id, image_url) VALUES (%s, 'test-user', 'https://example.com/img.jpg')",
            (session_id,),
        )

    with patch("app.main.get_ai_client", side_effect=RuntimeError("incomplete config")):
        response = client.post("/analyze-photo", json={
            "imageUrl": "https://example.com/img.jpg",
            "userId": "test-user",
            "sessionId": session_id,
        })

    assert response.status_code == 500
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT status, failure_code FROM photo_session WHERE id = %s", (session_id,))
        row = cur.fetchone()
    assert row["status"] == "FAILED"
    assert row["failure_code"] == "provider_failed"


def test_analyze_photo_failure_callback_carries_failed_status(client, mock_ai_client):
    mock_ai_client.analyze_image.side_effect = AIClientError("provider failed")
    image_response = MagicMock(status_code=200, content=b"fake-image", headers={"content-type": "image/jpeg"})
    image_http = AsyncMock()
    image_http.get = AsyncMock(return_value=image_response)

    with (
        patch("app.main.httpx.AsyncClient") as http_client,
        patch("app.callback.send_photo_result", new_callable=AsyncMock, return_value=True) as callback,
    ):
        http_client.return_value.__aenter__ = AsyncMock(return_value=image_http)
        http_client.return_value.__aexit__ = AsyncMock(return_value=None)
        response = client.post("/analyze-photo", json={
            "imageUrl": "https://example.com/img.jpg",
            "userId": "test-user",
            "sessionId": "failure-session",
            "callbackUrl": "https://backend.example/api/internal/photo-result",
            "callbackKey": "internal-key",
        })

    assert response.status_code == 500
    callback.assert_awaited_once_with(
        "https://backend.example/api/internal/photo-result",
        "internal-key",
        "failure-session",
        "test-user",
        "",
        0,
        failure_code="invalid_response",
    )


def test_generate_quizzes_no_jobs(client, mock_ai_client):
    resp = client.post("/generate-quizzes", json={})
    assert resp.status_code == 200


def test_generate_quizzes_processes_job(client, db_conn, seed_kanji, mock_ai_client):
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
    mock_ai_client.generate_quizzes.return_value = AIResult(
        data=json.loads(quiz_response),
        cost_microdollars=100,
        model="test-model",
    )

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


def test_cron_generate_quizzes(client, mock_ai_client):
    resp = client.post("/cron/generate-quizzes")
    assert resp.status_code == 200


def test_cron_check_regen_empty(client):
    resp = client.post("/cron/check-regen")
    assert resp.status_code == 200


def test_discover_words(client, db_conn, seed_kanji, mock_ai_client):
    mock_ai_client.discover_words.return_value = AIResult(
        data=[
            {"word": "日記", "reading": "にっき", "meaning": "diary"},
            {"word": "日本", "reading": "にほん", "meaning": "Japan"},
        ],
        cost_microdollars=100,
        model="test-model",
    )

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
