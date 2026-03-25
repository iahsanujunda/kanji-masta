#!/usr/bin/env python3
"""Import kanji_master, word_master, quiz_bank, quiz_distractor from a Data Connect dump.

Usage:
  python scripts/import_from_dump.py docs/backup_data-connect-dump.sql

Connects to DATABASE_URL (defaults to local Supabase).
Only imports tables that won't conflict with user-scoped data.
"""

import os
import sys

import psycopg2

DUMP_FILE = sys.argv[1] if len(sys.argv) > 1 else "docs/backup_data-connect-dump.sql"
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

TABLES_TO_IMPORT = {"kanji_master", "word_master", "quiz_bank", "quiz_distractor"}


def extract_copy_blocks(dump_path: str) -> dict[str, tuple[str, list[str]]]:
    """Extract COPY blocks for target tables. Returns {table: (header, rows)}."""
    blocks = {}
    current_table = None
    current_header = None
    current_rows = []

    with open(dump_path, "r") as f:
        for line in f:
            if line.startswith("COPY public."):
                table = line.split("(")[0].replace("COPY public.", "").strip()
                if table in TABLES_TO_IMPORT:
                    current_table = table
                    current_header = line.strip()
                    current_rows = []
                continue

            if line.strip() == "\\.":
                if current_table:
                    blocks[current_table] = (current_header, current_rows)
                    current_table = None
                continue

            if current_table:
                current_rows.append(line)

    return blocks


def import_table(conn, table: str, header: str, rows: list[str]):
    """Import rows into a table using COPY."""
    with conn.cursor() as cur:
        # Clear existing data
        cur.execute(f"DELETE FROM {table}")

        # Use COPY with StringIO
        import io
        data = io.StringIO("".join(rows))

        # Extract column list from header: "COPY public.table (col1, col2) FROM stdin;"
        cols = header.split("(", 1)[1].rsplit(")", 1)[0]
        cur.copy_expert(f"COPY {table} ({cols}) FROM STDIN", data)

    conn.commit()


def main():
    print(f"Reading dump: {DUMP_FILE}")
    blocks = extract_copy_blocks(DUMP_FILE)

    for table in TABLES_TO_IMPORT:
        if table not in blocks:
            print(f"  {table}: not found in dump, skipping")

    print(f"Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")
    conn = psycopg2.connect(DATABASE_URL)

    # Clear dependent tables first (FK constraints)
    with conn.cursor() as cur:
        print("  Clearing dependent tables ... ", end="", flush=True)
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
            DELETE FROM kanji_master;
        """)
        conn.commit()
        print("done")

    # Import order matters (FKs): kanji_master → word_master → quiz_bank → quiz_distractor
    import_order = ["kanji_master", "word_master", "quiz_bank", "quiz_distractor"]

    for table in import_order:
        if table not in blocks:
            continue
        header, rows = blocks[table]
        print(f"  {table}: {len(rows)} rows ... ", end="", flush=True)
        import_table(conn, table, header, rows)
        print("done")

    conn.close()
    print("Import complete.")


if __name__ == "__main__":
    main()
