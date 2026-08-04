from __future__ import annotations

import pathlib
from unittest.mock import MagicMock

import psycopg2
import pytest
from fastapi.testclient import TestClient
from psycopg2 import sql
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres_container():
    """Session-scoped PostgreSQL container — shared across all tests."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(scope="session")
def db_url(postgres_container):
    # testcontainers returns "postgresql+psycopg2://..." — strip the driver suffix
    url = postgres_container.get_connection_url()
    return url.replace("postgresql+psycopg2://", "postgresql://")


@pytest.fixture(scope="session")
def db_conn(db_url):
    """Session-scoped raw psycopg2 connection for seeding test data."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True

    # Supply the few Supabase-owned objects referenced by our migrations, then
    # apply every production migration. Never skip an entire migration because
    # it happens to contain an RLS policy: schema changes may live beside it.
    migration_dir = pathlib.Path(__file__).resolve().parents[3] / "supabase" / "migrations"
    with conn.cursor() as cur:
        cur.execute("""
            DO $$ BEGIN
                CREATE ROLE authenticated NOLOGIN;
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;

            CREATE SCHEMA IF NOT EXISTS auth;
            CREATE SCHEMA IF NOT EXISTS storage;

            CREATE OR REPLACE FUNCTION auth.uid()
            RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

            CREATE OR REPLACE FUNCTION auth.email()
            RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

            CREATE OR REPLACE FUNCTION storage.foldername(path text)
            RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
                SELECT regexp_split_to_array(path, '/');
            $$;

            CREATE TABLE IF NOT EXISTS storage.buckets (
                id text PRIMARY KEY,
                name text NOT NULL,
                public boolean NOT NULL DEFAULT false
            );

            CREATE TABLE IF NOT EXISTS storage.objects (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                bucket_id text NOT NULL,
                name text NOT NULL
            );
        """)
        for sql_file in sorted(migration_dir.glob("*.sql")):
            try:
                cur.execute(sql_file.read_text())
            except Exception as error:
                raise RuntimeError(
                    f"Failed to apply production migration {sql_file.name}"
                ) from error

    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def _clean_test_data(request):
    """Clean DB state around integration tests without starting Docker for unit tests."""
    if "db_conn" not in request.fixturenames:
        yield
        return

    db_conn = request.getfixturevalue("db_conn")
    yield
    with db_conn.cursor() as cur:
        cur.execute("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """)
        table_names = [row[0] for row in cur.fetchall()]
        if table_names:
            cur.execute(
                sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(
                    sql.SQL(", ").join(sql.Identifier(name) for name in table_names)
                )
            )


@pytest.fixture
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
def mock_ai_client(monkeypatch):
    """Mock the provider-neutral application boundary; tests must never call a paid model."""
    from app.ai_client import AIResult

    mock_client = MagicMock()
    mock_client.provider_name = "test-provider"
    mock_client.analyze_image.return_value = AIResult(
        data=[{
            "character": "日",
            "recommended": True,
            "whyUseful": "test",
            "exampleWords": [],
        }],
        cost_microdollars=150,
        model="test-model",
    )
    mock_client.generate_quizzes.return_value = AIResult(
        data=[],
        cost_microdollars=0,
        model="test-model",
    )
    mock_client.discover_words.return_value = AIResult(
        data=[],
        cost_microdollars=0,
        model="test-model",
    )

    monkeypatch.setattr("app.main.get_ai_client", lambda: mock_client)
    return mock_client


@pytest.fixture
def client(db_url, seed_kanji, monkeypatch):
    """FastAPI TestClient with real DB via Testcontainers."""
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
