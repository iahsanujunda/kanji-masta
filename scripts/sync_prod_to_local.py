#!/usr/bin/env python3
"""
sync_prod_to_local.py
Copies all business data from PROD Supabase to local Supabase.
Run this right after `supabase db reset` (or anytime — it truncates first).

Usage: python scripts/sync_prod_to_local.py [--dry-run]

Requires: pip install supabase psycopg2-binary python-dotenv
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client
import psycopg2
import psycopg2.extras

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
PROD_URL = os.getenv("PROD_SUPABASE_URL")
PROD_KEY = os.getenv("PROD_SUPABASE_KEY")
LOCAL_DB_URL = os.getenv("LOCAL_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

# Tables ordered to respect FK constraints (parents before children).
# kanji_master is seeded locally, but we sync it anyway for consistency.
TABLES = [
    "kanji_master",
    "word_master",
    "user_invite",
    "user_settings",
    "user_kanji",
    "user_words",
    "photo_session",
    "quiz_bank",
    "quiz_distractor",
    "quiz_slot",
    "quiz_serve",
    "quiz_generation_job",
    "user_cost",
    "challenge_session",
]

# Columns that are Postgres arrays — keep as Python lists (don't wrap with Json)
PG_ARRAY_COLUMNS = {
    "kanji_master": {"onyomi", "kunyomi", "meanings"},
    "word_master": {"meanings", "kanji_ids"},
    "quiz_distractor": {"distractors"},
    "user_words": {"kanji_ids"},
}

# Columns that need an explicit cast (e.g. uuid[] vs text[] mismatch)
PG_COLUMN_CASTS = {
    "word_master": {"kanji_ids": "uuid[]"},
    "user_words": {"kanji_ids": "uuid[]"},
}

PAGE_SIZE = 1000


def fetch_all_rows(supabase, table: str) -> list[dict]:
    """Fetch all rows from a PROD table, paginating through results."""
    rows = []
    offset = 0
    while True:
        resp = (
            supabase.table(table)
            .select("*")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def adapt_row(row: dict, table: str) -> dict:
    """Prepare row for insertion — keep arrays as lists, wrap dicts as Json."""
    array_cols = PG_ARRAY_COLUMNS.get(table, set())
    out = {}
    for k, v in row.items():
        if isinstance(v, (dict, list)):
            out[k] = v if k in array_cols else psycopg2.extras.Json(v)
        else:
            out[k] = v
    return out


def insert_rows(cur, table: str, rows: list[dict]):
    """Bulk insert rows into local DB using execute_values."""
    if not rows:
        return
    adapted = [adapt_row(r, table) for r in rows]
    columns = list(rows[0].keys())
    col_list = ", ".join(f'"{c}"' for c in columns)
    casts = PG_COLUMN_CASTS.get(table, {})
    template = "(" + ", ".join(
        f"%({c})s::{casts[c]}" if c in casts else f"%({c})s"
        for c in columns
    ) + ")"
    query = f'INSERT INTO public."{table}" ({col_list}) VALUES %s ON CONFLICT DO NOTHING'
    psycopg2.extras.execute_values(
        cur, query, adapted, template=template, page_size=500
    )


def main():
    dry_run = "--dry-run" in sys.argv

    if not PROD_URL or not PROD_KEY:
        print("ERROR: PROD_SUPABASE_URL and PROD_SUPABASE_KEY must be set in .env")
        sys.exit(1)

    print()
    print("╔══════════════════════════════════════════════════╗")
    print("║        PROD  →  LOCAL  data sync                ║")
    print("╚══════════════════════════════════════════════════╝")
    print()
    print(f"  PROD:  {PROD_URL}")
    print(f"  LOCAL: {LOCAL_DB_URL}")
    print(f"  Tables: {len(TABLES)}")
    if dry_run:
        print("  [DRY RUN] Will only read from PROD, nothing written locally.")
    print()

    # Connect to PROD via supabase-py
    supabase = create_client(PROD_URL, PROD_KEY)

    # Fetch all data from PROD
    table_data: dict[str, list[dict]] = {}
    for table in TABLES:
        rows = fetch_all_rows(supabase, table)
        table_data[table] = rows
        print(f"  ↓ {table}: {len(rows)} rows")

    print()

    if dry_run:
        print("  [DRY RUN] Done. No data written.")
        return

    # Write to local DB
    print("▶ Writing to local DB...")
    conn = psycopg2.connect(LOCAL_DB_URL)
    try:
        cur = conn.cursor()
        # Bypass triggers and RLS during sync
        cur.execute("SET session_replication_role = 'replica';")

        # Truncate all tables (reverse order for FK safety)
        table_list = ", ".join(f'public."{t}"' for t in reversed(TABLES))
        cur.execute(f"TRUNCATE {table_list} CASCADE;")
        print("  ✓ Truncated all target tables")

        for table in TABLES:
            rows = table_data[table]
            if rows:
                insert_rows(cur, table, rows)
            print(f"  ↑ {table}: {len(rows)} rows inserted")

        cur.execute("SET session_replication_role = 'origin';")
        conn.commit()
        cur.close()
    finally:
        conn.close()

    # Verify
    print()
    print("▶ Verifying row counts...")
    print()
    print(f"  {'table':<25} {'prod':>8} {'local':>8}")
    print(f"  {'─' * 25} {'─' * 8} {'─' * 8}")

    conn = psycopg2.connect(LOCAL_DB_URL)
    try:
        cur = conn.cursor()
        all_match = True
        for table in TABLES:
            prod_count = len(table_data[table])
            cur.execute(f'SELECT COUNT(*) FROM public."{table}";')
            local_count = cur.fetchone()[0]
            status = "✓" if prod_count == local_count else "✗ MISMATCH"
            if prod_count != local_count:
                all_match = False
            print(f"  {table:<25} {prod_count:>8} {local_count:>8}  {status}")
        cur.close()
    finally:
        conn.close()

    print()
    if all_match:
        print("▶ Done. All counts match.")
    else:
        print("▶ Done. Some mismatches detected (ON CONFLICT DO NOTHING may skip existing rows).")
    print()


if __name__ == "__main__":
    main()
