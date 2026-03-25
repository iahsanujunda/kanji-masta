"""
Parse kanjidic2.xml and seed kanji into Supabase PostgreSQL.

Usage:
    python seed.py                                # expects kanjidic2.xml in current dir
    python seed.py --file /path/to/kanjidic2.xml
    python seed.py --freq-limit 1500              # filter to top N by frequency
    python seed.py --output kanji.csv             # save to CSV
    python seed.py --persist                      # seed into local Supabase
    python seed.py --persist --prod               # seed into production Supabase
    python seed.py --clear-and-persist            # clear + seed

Download kanjidic2.xml.gz from:
    https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
    Then: gunzip kanjidic2.xml.gz
"""

import argparse
import gzip
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv


def parse_kanjidic2(filepath: str, freq_limit: int | None = None) -> pd.DataFrame:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    open_fn = gzip.open if path.suffix == ".gz" else open

    print(f"Parsing {path.name} ...")
    rows = []

    with open_fn(path, "rb") as f:
        context = ET.iterparse(f, events=("end",))
        for _, elem in context:
            if elem.tag != "character":
                continue

            literal = elem.findtext("literal")
            if not literal:
                elem.clear()
                continue

            freq_el = elem.find("misc/freq")
            frequency = int(freq_el.text) if freq_el is not None else None

            jlpt_el = elem.find("misc/jlpt")
            OLD_TO_NEW_JLPT = {4: 5, 3: 4, 2: 3, 1: 2}
            jlpt = OLD_TO_NEW_JLPT.get(int(jlpt_el.text)) if jlpt_el is not None else None

            onyomi = [r.text for r in elem.findall("reading_meaning/rmgroup/reading[@r_type='ja_on']") if r.text]
            kunyomi = [r.text for r in elem.findall("reading_meaning/rmgroup/reading[@r_type='ja_kun']") if r.text]
            meanings = [m.text for m in elem.findall("reading_meaning/rmgroup/meaning") if m.text and m.get("m_lang") is None]

            rows.append({
                "character": literal,
                "frequency": frequency,
                "jlpt": jlpt,
                "onyomi": onyomi,
                "kunyomi": kunyomi,
                "meanings": meanings,
            })
            elem.clear()

    df = pd.DataFrame(rows)
    df["frequency"] = pd.to_numeric(df["frequency"], errors="coerce")
    df = df.sort_values("frequency", na_position="last").reset_index(drop=True)

    if freq_limit is not None:
        before = len(df)
        df = df[df["frequency"] <= freq_limit].reset_index(drop=True)
        print(f"Filtered to freq <= {freq_limit}: {before} → {len(df)} kanji")

    print(f"Total kanji: {len(df)}")
    return df


def get_connection(prod: bool):
    load_dotenv()
    if prod:
        url = os.environ.get("PROD_SUPABASE_DB_URI", "")
        url = url.removeprefix("jdbc:")
    else:
        url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    if not url:
        print("Error: DATABASE_URL or PROD_SUPABASE_DB_URI not set.")
        sys.exit(1)
    return psycopg2.connect(url)


def persist_to_db(df: pd.DataFrame, prod: bool = False, clear: bool = False, batch_size: int = 100):
    conn = get_connection(prod)
    env_label = "production (Supabase)" if prod else "local Supabase"

    if clear:
        print(f"\nClearing kanji_master on {env_label} ...")
        with conn.cursor() as cur:
            cur.execute("DELETE FROM kanji_master")
            print(f"  Deleted {cur.rowcount} rows.")
        conn.commit()

    print(f"\nSeeding {len(df)} kanji to {env_label} in batches of {batch_size} ...")

    records = [
        (
            row["character"],
            row["onyomi"],
            row["kunyomi"],
            row["meanings"],
            int(row["frequency"]) if pd.notna(row["frequency"]) else None,
            int(row["jlpt"]) if pd.notna(row["jlpt"]) else None,
        )
        for _, row in df.iterrows()
    ]

    inserted = 0
    errors = 0
    with conn.cursor() as cur:
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            try:
                for rec in batch:
                    cur.execute(
                        """
                        INSERT INTO kanji_master (character, onyomi, kunyomi, meanings, frequency, jlpt)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (character) DO UPDATE SET
                            onyomi = EXCLUDED.onyomi,
                            kunyomi = EXCLUDED.kunyomi,
                            meanings = EXCLUDED.meanings,
                            frequency = EXCLUDED.frequency,
                            jlpt = EXCLUDED.jlpt
                        """,
                        rec,
                    )
                conn.commit()
                inserted += len(batch)
                print(f"  Batch {i // batch_size + 1}: {len(batch)} rows")
            except psycopg2.Error as e:
                conn.rollback()
                errors += len(batch)
                print(f"  Batch {i // batch_size + 1} error: {e.pgerror or e}")

    conn.close()
    print(f"Done. {inserted} inserted, {errors} errors.")


def main():
    parser = argparse.ArgumentParser(description="Parse kanjidic2.xml and seed into Supabase")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--freq-limit", type=int, default=None)
    parser.add_argument("--output", default=None, help="Save to CSV")
    parser.add_argument("--show", type=int, default=20)
    parser.add_argument("--persist", action="store_true", help="Seed into Supabase")
    parser.add_argument("--clear-and-persist", action="store_true")
    parser.add_argument("--prod", action="store_true", help="Target production Supabase")
    args = parser.parse_args()

    df = parse_kanjidic2(args.file, freq_limit=args.freq_limit)

    print(f"\n--- Preview (top {args.show} by frequency) ---")
    preview = df.head(args.show).copy()
    preview["onyomi"] = preview["onyomi"].apply(lambda x: "、".join(x))
    preview["kunyomi"] = preview["kunyomi"].apply(lambda x: "、".join(x))
    preview["meanings"] = preview["meanings"].apply(lambda x: ", ".join(x[:3]))
    print(preview[["character", "frequency", "onyomi", "kunyomi", "meanings"]].to_string(index=False))

    if args.output:
        out = df.copy()
        out["onyomi"] = out["onyomi"].apply(lambda x: "|".join(x))
        out["kunyomi"] = out["kunyomi"].apply(lambda x: "|".join(x))
        out["meanings"] = out["meanings"].apply(lambda x: "|".join(x))
        out.to_csv(args.output, index=False, encoding="utf-8")
        print(f"\nSaved to {args.output}")

    if args.clear_and_persist:
        persist_to_db(df, prod=args.prod, clear=True)
    elif args.persist:
        persist_to_db(df, prod=args.prod)

    return df


if __name__ == "__main__":
    df = main()
