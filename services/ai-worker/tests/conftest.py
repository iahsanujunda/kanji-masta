from __future__ import annotations

import os
import pathlib
from unittest.mock import MagicMock

import psycopg2
import pytest
from fastapi.testclient import TestClient

# Point to local Supabase by default
DEFAULT_TEST_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


@pytest.fixture(scope="session")
def db_url():
    return os.environ.get("DATABASE_TEST_URL", DEFAULT_TEST_URL)


@pytest.fixture(scope="session")
def db_conn(db_url):
    """Session-scoped raw psycopg2 connection for seeding test data."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True

    # Verify schema exists
    with conn.cursor() as cur:
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'kanji_master')")
        exists = cur.fetchone()[0]
        if not exists:
            # Apply migration
            migration_dir = pathlib.Path(__file__).resolve().parents[2] / ".." / ".." / "supabase" / "migrations"
            for sql_file in sorted(migration_dir.glob("*.sql")):
                cur.execute(sql_file.read_text())

    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _clean_test_data(db_conn):
    """Clean user-scoped data before each test. Keep kanji_master seed."""
    yield
    with db_conn.cursor() as cur:
        cur.execute("""
            DELETE FROM quiz_serve;
            DELETE FROM quiz_distractor;
            DELETE FROM quiz_bank;
            DELETE FROM quiz_generation_job;
            DELETE FROM quiz_slot;
            DELETE FROM user_words;
            DELETE FROM user_kanji;
            DELETE FROM photo_session;
            DELETE FROM word_master;
            DELETE FROM user_settings;
        """)


@pytest.fixture(scope="session")
def seed_kanji(db_conn):
    """Seed a few kanji_master rows for testing."""
    with db_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM kanji_master WHERE character = '日'")
        if cur.fetchone()[0] == 0:
            cur.execute("""
                INSERT INTO kanji_master (character, onyomi, kunyomi, meanings, frequency, jlpt) VALUES
                ('日', ARRAY['ニチ','ジツ'], ARRAY['ひ','か'], ARRAY['day','sun'], 1, 5),
                ('月', ARRAY['ゲツ','ガツ'], ARRAY['つき'], ARRAY['month','moon'], 2, 5),
                ('電', ARRAY['デン'], ARRAY[]::text[], ARRAY['electricity'], 50, 4)
            """)
    return True


@pytest.fixture
def mock_gemini(monkeypatch):
    """Mock the Gemini client to avoid real API calls."""
    mock_client = MagicMock()

    # Default: return valid kanji extraction response
    mock_response = MagicMock()
    mock_response.text = '[{"character": "日", "recommended": true, "whyUseful": "test", "exampleWords": []}]'
    mock_response.usage_metadata = MagicMock()
    mock_response.usage_metadata.prompt_token_count = 100
    mock_response.usage_metadata.candidates_token_count = 50
    mock_client.models.generate_content.return_value = mock_response

    monkeypatch.setattr("app.gemini.genai.Client", lambda api_key: mock_client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    return mock_client


@pytest.fixture
def client(db_url, seed_kanji, monkeypatch):
    """FastAPI TestClient with real DB."""
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    # Re-init pool with test URL
    from app import db as db_module
    db_module._pool = None
    db_module.init_pool()

    from app.main import app
    with TestClient(app) as c:
        yield c

    db_module._pool = None
