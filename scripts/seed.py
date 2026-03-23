"""
Parse kanjidic2.xml and seed kanji into Firebase Data Connect.

Usage:
    python seed.py                                # expects kanjidic2.xml in current dir
    python seed.py --file /path/to/kanjidic2.xml
    python seed.py --freq-limit 1500              # filter to top N by frequency
    python seed.py --output kanji.csv             # save to CSV
    python seed.py --persist                      # seed into Data Connect (local emulator)
    python seed.py --persist --prod               # seed into Data Connect (production)

Download kanjidic2.xml.gz from:
    https://www.edrdg.org/kanjidic/kanjidic2.xml.gz
    Then: gunzip kanjidic2.xml.gz
"""

import argparse
import gzip
import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
import requests
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

            # --- JLPT level (old system: 4=N5, 3=N4, 2=N3, 1=N2/N1) ---
            jlpt_el = elem.find("misc/jlpt")
            OLD_TO_NEW_JLPT = {4: 5, 3: 4, 2: 3, 1: 2}
            jlpt = OLD_TO_NEW_JLPT.get(int(jlpt_el.text)) if jlpt_el is not None else None

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
                "jlpt": jlpt,
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


def _build_endpoint(prod: bool) -> tuple[str, dict]:
    """Return (url, headers) for the Data Connect executeGraphql endpoint."""
    load_dotenv()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "kanji-masta")

    if prod:
        # Production — requires gcloud auth application-default credentials
        import google.auth
        import google.auth.transport.requests

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/firebase.dataconnect"]
        )
        credentials.refresh(google.auth.transport.requests.Request())

        url = (
            f"https://firebasedataconnect.googleapis.com"
            f"/v1alpha/projects/{project_id}"
            f"/locations/asia-east1/services/kanji-masta:executeGraphql"
        )
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {credentials.token}",
        }
    else:
        # Local emulator
        emulator_host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST", "127.0.0.1:9399")
        url = (
            f"http://{emulator_host}"
            f"/v1alpha/projects/{project_id}"
            f"/locations/asia-east1/services/kanji-masta:executeGraphql"
        )
        headers = {"Content-Type": "application/json"}

    return url, headers


def _clear_kanji_master(prod: bool = False) -> None:
    """Delete all rows from kanji_master by fetching and deleting in pages."""
    url, headers = _build_endpoint(prod)
    env_label = "production" if prod else "local emulator"
    print(f"\nClearing kanji_master on {env_label} ...")

    total_deleted = 0
    while True:
        # Fetch a page of IDs
        query = """
            query ListKanjiBatch {
                kanjiMasters(limit: 1000) { id }
            }
        """
        resp = requests.post(url, headers=headers, json={"query": query})
        rows = resp.json().get("data", {}).get("kanjiMasters", [])

        if not rows:
            break

        # Delete this page
        ids = [row["id"] for row in rows]
        for i in range(0, len(ids), 100):
            batch = ids[i : i + 100]
            batch_literal = ", ".join(f'"{uid}"' for uid in batch)
            delete_query = f"""
                mutation DeleteBatch {{
                    kanjiMaster_deleteMany(where: {{ id: {{ in: [{batch_literal}] }} }})
                }}
            """
            resp = requests.post(url, headers=headers, json={"query": delete_query})
            if resp.status_code != 200 or resp.json().get("errors"):
                print(f"  Delete error: {resp.text[:200]}")

        total_deleted += len(ids)
        print(f"  Deleted {total_deleted} rows so far...")

    print(f"  Cleared {total_deleted} total rows.")


def persist_to_dataconnect(df: pd.DataFrame, prod: bool = False, clear: bool = False, batch_size: int = 100) -> None:
    """Seed kanji data into Firebase Data Connect using insertMany."""
    if clear:
        _clear_kanji_master(prod)

    url, headers = _build_endpoint(prod)
    env_label = "production" if prod else "local emulator"

    print(f"\nSeeding {len(df)} kanji to Data Connect ({env_label}) in batches of {batch_size} ...")

    records = [
        {
            "character": row["character"],
            "onyomi": row["onyomi"],
            "kunyomi": row["kunyomi"],
            "meanings": row["meanings"],
            "frequency": int(row["frequency"]) if pd.notna(row["frequency"]) else None,
            "jlpt": int(row["jlpt"]) if pd.notna(row["jlpt"]) else None,
        }
        for _, row in df.iterrows()
    ]

    errors = 0
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]

        # Data Connect doesn't support complex type variables for insertMany,
        # so we inline the data array directly in the mutation string.
        data_entries = []
        for rec in batch:
            freq = rec["frequency"] if rec["frequency"] is not None else "null"
            jlpt = rec["jlpt"] if rec["jlpt"] is not None else "null"
            onyomi = json.dumps(rec["onyomi"], ensure_ascii=False)
            kunyomi = json.dumps(rec["kunyomi"], ensure_ascii=False)
            meanings = json.dumps(rec["meanings"], ensure_ascii=False)
            char = rec["character"].replace("\\", "\\\\").replace('"', '\\"')
            data_entries.append(
                f'{{ character: "{char}", onyomi: {onyomi}, kunyomi: {kunyomi}, '
                f'meanings: {meanings}, frequency: {freq}, jlpt: {jlpt} }}'
            )

        data_literal = ",\n            ".join(data_entries)
        query = f"""
            mutation InsertKanjiMasterBatch {{
                kanjiMaster_insertMany(data: [
            {data_literal}
                ])
            }}
        """
        resp = requests.post(url, headers=headers, json={"query": query})
        resp_json = resp.json()

        if resp.status_code != 200 or resp_json.get("errors"):
            errors += len(batch)
            print(f"  Batch {i // batch_size + 1} error: {resp.text[:200]}")
        else:
            print(f"  Batch {i // batch_size + 1}: {len(batch)} rows inserted")

    total_batches = (len(records) + batch_size - 1) // batch_size
    print(f"Done. {total_batches} batches, {len(records) - errors} succeeded, {errors} errors.")


def main():
    parser = argparse.ArgumentParser(description="Parse kanjidic2.xml into a pandas DataFrame")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--freq-limit", type=int, default=None, help="Keep only kanji with freq <= this value")
    parser.add_argument("--output", default=None, help="Save DataFrame to this CSV path")
    parser.add_argument("--show", type=int, default=20, help="Number of rows to preview (default 20)")
    parser.add_argument("--persist", action="store_true", help="Seed parsed kanji into Data Connect")
    parser.add_argument("--clear-and-persist", action="store_true", help="Clear kanji_master then seed")
    parser.add_argument("--prod", action="store_true", help="Target production instead of local emulator")
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

    if args.clear_and_persist:
        persist_to_dataconnect(df, prod=args.prod, clear=True)
    elif args.persist:
        persist_to_dataconnect(df, prod=args.prod)

    return df


if __name__ == "__main__":
    df = main()
