"""
Parse kanjidic2.xml and output kanji + frequency as a pandas DataFrame.

Usage:
    python parse_kanjidic2.py                        # expects kanjidic2.xml in current dir
    python parse_kanjidic2.py --file /path/to/kanjidic2.xml
    python parse_kanjidic2.py --freq-limit 1500      # filter to top N by frequency
    python parse_kanjidic2.py --output kanji.csv     # save to CSV

Download kanjidic2.xml.gz from:
    https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
    Then: gunzip kanjidic2.xml.gz
"""

import argparse
import gzip
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv


def parse_kanjidic2(filepath: str, freq_limit: int | None = None) -> pd.DataFrame:
    """
    Parse kanjidic2.xml (or .xml.gz) and return a DataFrame with columns:
        character   - the kanji character
        frequency   - kanjidic2 freq rank (lower = more common), NaN if absent
        onyomi      - list of on readings
        kunyomi     - list of kun readings
        meanings    - list of English meanings
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    # Support both raw XML and gzipped XML
    open_fn = gzip.open if path.suffix == ".gz" else open
    mode = "rb" if path.suffix == ".gz" else "rb"

    print(f"Parsing {path.name} ...")
    rows = []

    with open_fn(path, mode) as f:
        # Iterparse — avoids loading the full ~60MB file into memory
        context = ET.iterparse(f, events=("end",))
        for event, elem in context:
            if elem.tag != "character":
                continue

            # --- Character literal ---
            literal = elem.findtext("literal")
            if not literal:
                elem.clear()
                continue

            # --- Frequency rank ---
            freq_el = elem.find("misc/freq")
            frequency = int(freq_el.text) if freq_el is not None else None

            # --- Readings ---
            onyomi = [
                r.text for r in elem.findall(
                    "reading_meaning/rmgroup/reading[@r_type='ja_on']"
                )
                if r.text
            ]
            kunyomi = [
                r.text for r in elem.findall(
                    "reading_meaning/rmgroup/reading[@r_type='ja_kun']"
                )
                if r.text
            ]

            # --- English meanings ---
            meanings = [
                m.text for m in elem.findall(
                    "reading_meaning/rmgroup/meaning"
                )
                # meaning elements without m_lang attribute are English
                if m.text and m.get("m_lang") is None
            ]

            rows.append({
                "character": literal,
                "frequency": frequency,
                "onyomi": onyomi,
                "kunyomi": kunyomi,
                "meanings": meanings,
            })

            # Free memory — critical for large XML files
            elem.clear()

    df = pd.DataFrame(rows)
    df["frequency"] = pd.to_numeric(df["frequency"], errors="coerce")

    # Sort: kanji with frequency rank first (ascending), then unranked
    df = df.sort_values("frequency", na_position="last").reset_index(drop=True)

    if freq_limit is not None:
        before = len(df)
        df = df[df["frequency"] <= freq_limit].reset_index(drop=True)
        print(f"Filtered to freq <= {freq_limit}: {before} → {len(df)} kanji")

    print(f"Total kanji: {len(df)}")
    print(f"  With frequency rank : {df['frequency'].notna().sum()}")
    print(f"  Without frequency   : {df['frequency'].isna().sum()}")

    return df


def persist_to_supabase(df: pd.DataFrame, batch_size: int = 500) -> None:
    """Upsert kanji data into the Supabase kanji_master table."""
    from supabase import create_client

    load_dotenv()
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]
    client = create_client(url, key)

    records = [
        {
            "character": row["character"],
            "readings": {"onyomi": row["onyomi"], "kunyomi": row["kunyomi"]},
            "meanings": row["meanings"],
            "frequency": int(row["frequency"]) if pd.notna(row["frequency"]) else None,
        }
        for _, row in df.iterrows()
    ]

    print(f"\nUpserting {len(records)} kanji to Supabase ...")
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        client.table("kanji_master").upsert(batch, on_conflict="character").execute()
        print(f"  Batch {i // batch_size + 1}: {len(batch)} rows")

    print("Done.")


def main():
    parser = argparse.ArgumentParser(description="Parse kanjidic2.xml into a pandas DataFrame")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--freq-limit", type=int, default=None, help="Keep only kanji with freq <= this value")
    parser.add_argument("--output", default=None, help="Save DataFrame to this CSV path")
    parser.add_argument("--show", type=int, default=20, help="Number of rows to preview (default 20)")
    parser.add_argument("--persist", action="store_true", help="Upsert parsed kanji into Supabase kanji_master table")
    args = parser.parse_args()

    df = parse_kanjidic2(args.file, freq_limit=args.freq_limit)

    print(f"\n--- Preview (top {args.show} by frequency) ---")
    preview = df.head(args.show).copy()
    # Flatten lists for readable preview
    preview["onyomi"] = preview["onyomi"].apply(lambda x: "、".join(x))
    preview["kunyomi"] = preview["kunyomi"].apply(lambda x: "、".join(x))
    preview["meanings"] = preview["meanings"].apply(lambda x: ", ".join(x[:3]))
    print(preview[["character", "frequency", "onyomi", "kunyomi", "meanings"]].to_string(index=False))

    if args.output:
        # Serialize lists as pipe-separated strings for CSV compatibility
        out = df.copy()
        out["onyomi"] = out["onyomi"].apply(lambda x: "|".join(x))
        out["kunyomi"] = out["kunyomi"].apply(lambda x: "|".join(x))
        out["meanings"] = out["meanings"].apply(lambda x: "|".join(x))
        out.to_csv(args.output, index=False, encoding="utf-8")
        print(f"\nSaved to {args.output}")

    if args.persist:
        persist_to_supabase(df)

    return df


if __name__ == "__main__":
    df = main()