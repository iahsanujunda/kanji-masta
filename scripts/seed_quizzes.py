"""
Generate word-centric quizzes for JLPT kanji using Gemini 3.1 Pro.

For each kanji, Gemini returns 3 compound words with 5 quizzes each.
Creates WordMaster + QuizBank + QuizDistractor rows (global, user_id=NULL).

Usage:
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --dry-run
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --resume
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --prod
"""

import argparse
import gzip
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from google import genai
from google.genai import types

CHECKPOINT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".quiz_seed_checkpoint.json")

JLPT_MAP = {5: 4, 4: 3, 3: 2, 2: 1, 1: 1}

WORD_QUIZ_PROMPT = """You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.

Target kanji: {character}

First, choose 3 common daily-life compound words containing this kanji.
Then for each word, generate exactly 5 quizzes (one per type).

Return ONLY valid JSON — no markdown, no preamble:
[
  {{
    "word": "電車",
    "reading": "でんしゃ",
    "meaning": "train",
    "quizzes": [
      {{
        "quiz_type": "meaning_recall",
        "prompt": "電車",
        "target": "電車",
        "furigana": null,
        "answer": "train",
        "distractors": ["phone call", "electricity", "battery"],
        "explanation": "電車 — 電 (electric) + 車 (vehicle) = train"
      }},
      {{
        "quiz_type": "reading_recognition",
        "prompt": "電車",
        "target": "電車",
        "furigana": null,
        "answer": "でんしゃ",
        "distractors": ["てっどう", "きゅうこう", "ちかてつ"],
        "explanation": "でん (on-yomi of 電) + しゃ (on-yomi of 車)"
      }},
      {{
        "quiz_type": "reverse_reading",
        "prompt": "でんしゃ",
        "target": "でんしゃ",
        "furigana": null,
        "answer": "電車",
        "distractors": ["電話", "電気", "電池"],
        "explanation": "電車 — the kanji for electricity + vehicle"
      }},
      {{
        "quiz_type": "bold_word_meaning",
        "prompt": "電車、遅れてるじゃん。",
        "target": "電車",
        "furigana": "でんしゃ",
        "answer": "train",
        "distractors": ["bus", "taxi", "subway"],
        "explanation": "電車 literally means electric vehicle — the standard word for train"
      }},
      {{
        "quiz_type": "fill_in_the_blank",
        "prompt": "＿＿乗り換えどこだっけ？",
        "target": "電車",
        "furigana": "でんしゃ",
        "answer": "電車",
        "distractors": ["急行", "地下鉄", "バス停"],
        "explanation": "電車 fits here — asking where to transfer trains"
      }}
    ]
  }}
]

Rules:
- Pick words commonly encountered in daily life in Japan (shops, stations, restaurants, signage)
- Sentences must be casual, natural spoken Japanese — not textbook style
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ
- bold_word_meaning and fill_in_the_blank must use completely different sentences
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level"""

QUIZ_TYPE_MAP = {
    "meaning_recall": "MEANING_RECALL",
    "reading_recognition": "READING_RECOGNITION",
    "reverse_reading": "REVERSE_READING",
    "bold_word_meaning": "BOLD_WORD_MEANING",
    "fill_in_the_blank": "FILL_IN_THE_BLANK",
}


# --- Database helpers ---

def get_connection(prod: bool) -> psycopg2.extensions.connection:
    load_dotenv()
    if prod:
        url = os.environ.get("PROD_SUPABASE_DB_URI", "")
        # Strip jdbc: prefix if present
        url = url.removeprefix("jdbc:")
    else:
        url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    if not url:
        print("Error: DATABASE_URL or PROD_SUPABASE_DB_URI not set.")
        sys.exit(1)
    return psycopg2.connect(url)


def lookup_kanji_master_id(conn, character: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM kanji_master WHERE character = %s", (character,))
        row = cur.fetchone()
        return str(row[0]) if row else None


def find_word_master(conn, word: str) -> str | None:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM word_master WHERE word = %s", (word,))
        row = cur.fetchone()
        return str(row[0]) if row else None


def insert_word_master(conn, word: dict, kanji_master_id: str) -> str | None:
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO word_master (word, reading, meanings, kanji_ids)
                VALUES (%s, %s, %s, %s::uuid[])
                RETURNING id
                """,
                (word["word"], word["reading"], [word["meaning"]], [kanji_master_id]),
            )
            conn.commit()
            row = cur.fetchone()
            return str(row[0]) if row else None
        except psycopg2.Error as e:
            conn.rollback()
            print(f"    WordMaster insert error: {e.pgerror or e}")
            return None


def insert_quiz(conn, kanji_master_id: str, word_master_id: str, quiz: dict) -> str | None:
    qt = QUIZ_TYPE_MAP.get(quiz.get("quiz_type", ""), quiz.get("quiz_type", ""))
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO quiz_bank (kanji_id, word_id, quiz_type, prompt, target, answer, furigana, explanation)
                VALUES (%s, %s, %s::quiz_type, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    kanji_master_id, word_master_id, qt,
                    quiz.get("prompt", ""), quiz.get("target", ""),
                    quiz.get("answer", ""), quiz.get("furigana"),
                    quiz.get("explanation"),
                ),
            )
            conn.commit()
            row = cur.fetchone()
            return str(row[0]) if row else None
        except psycopg2.Error as e:
            conn.rollback()
            print(f"    Quiz insert error: {e.pgerror or e}")
            return None


def insert_distractor(conn, quiz_id: str, distractors: list[str]):
    with conn.cursor() as cur:
        try:
            cur.execute(
                """
                INSERT INTO quiz_distractor (quiz_id, distractors, generation, trigger, familiarity_at_generation)
                VALUES (%s, %s, 1, 'INITIAL'::distractor_trigger, 0)
                """,
                (quiz_id, distractors),
            )
            conn.commit()
        except psycopg2.Error as e:
            conn.rollback()
            print(f"    Distractor insert error: {e.pgerror or e}")


def get_existing_quiz_characters(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT km.character
            FROM quiz_bank qb
            JOIN kanji_master km ON qb.kanji_id = km.id
            WHERE qb.user_id IS NULL
        """)
        return {row[0] for row in cur.fetchall()}


def clear_global_quizzes(conn):
    print("\nClearing global quizzes + word masters ...")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM quiz_distractor WHERE user_id IS NULL")
        print(f"  Deleted {cur.rowcount} distractor rows.")
        cur.execute("DELETE FROM quiz_bank WHERE user_id IS NULL")
        print(f"  Deleted {cur.rowcount} quiz bank rows.")
        cur.execute("DELETE FROM word_master")
        print(f"  Deleted {cur.rowcount} word master rows.")
    conn.commit()


# --- XML parsing ---

def parse_jlpt_kanji(filepath: str, jlpt_level: int, freq_limit: int | None = None) -> list[dict]:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    max_old_level = JLPT_MAP[jlpt_level]
    valid_old_levels = {lv for lv in range(max_old_level, 5)}

    open_fn = gzip.open if path.suffix == ".gz" else open
    print(f"Parsing {path.name} for JLPT N{jlpt_level} and above ...")
    kanji_list = []

    with open_fn(path, "rb") as f:
        context = ET.iterparse(f, events=("end",))
        for _, elem in context:
            if elem.tag != "character":
                continue
            literal = elem.findtext("literal")
            if not literal:
                elem.clear()
                continue
            jlpt_el = elem.find("misc/jlpt")
            if jlpt_el is None or int(jlpt_el.text) not in valid_old_levels:
                elem.clear()
                continue
            freq_el = elem.find("misc/freq")
            frequency = int(freq_el.text) if freq_el is not None else None
            if freq_limit is not None and (frequency is None or frequency > freq_limit):
                elem.clear()
                continue
            kanji_list.append({"character": literal, "frequency": frequency})
            elem.clear()

    kanji_list.sort(key=lambda k: k.get("frequency") or 99999)
    print(f"Found {len(kanji_list)} kanji (JLPT N{jlpt_level}+{f', freq <= {freq_limit}' if freq_limit else ''})")
    return kanji_list


# --- Gemini ---

def generate_words_and_quizzes(client: genai.Client, kanji: dict) -> tuple[list[dict], int]:
    prompt = WORD_QUIZ_PROMPT.format(character=kanji["character"])
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )
    usage = response.usage_metadata
    input_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    cost = int((input_tokens * 2.50 / 1_000_000 + output_tokens * 15.00 / 1_000_000) * 1_000_000)
    words = json.loads(response.text)
    return words, cost


# --- Checkpoint ---

def load_checkpoint() -> set[str]:
    if Path(CHECKPOINT_FILE).exists():
        try:
            with open(CHECKPOINT_FILE) as f:
                return set(json.load(f))
        except (json.JSONDecodeError, ValueError):
            return set()
    return set()


def save_checkpoint(completed: set[str]):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(sorted(completed), f, ensure_ascii=False)


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Generate word-centric quizzes for JLPT kanji via Gemini")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--jlpt", type=int, required=True, choices=[1, 2, 3, 4, 5])
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--persist", action="store_true")
    parser.add_argument("--clear-and-persist", action="store_true")
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    kanji_list = parse_jlpt_kanji(args.file, args.jlpt, freq_limit=args.limit)
    if not kanji_list:
        print("No kanji found.")
        return

    load_dotenv()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set.")
        sys.exit(1)
    gemini_client = genai.Client(api_key=api_key)

    should_persist = args.persist or args.clear_and_persist
    conn = None
    if should_persist or args.resume:
        conn = get_connection(args.prod)

    if args.clear_and_persist:
        clear_global_quizzes(conn)

    completed = load_checkpoint() if args.resume else set()
    if args.resume and conn:
        db_existing = get_existing_quiz_characters(conn)
        completed |= db_existing
        print(f"Resuming: {len(completed)} kanji done, {len(kanji_list) - len(completed)} remaining.")

    total_cost = 0
    total_words = 0
    total_quizzes = 0
    errors = 0
    env_label = "production (Supabase)" if args.prod else "local Supabase"

    print(f"\nGenerating word-centric quizzes for {len(kanji_list)} kanji ...")
    if should_persist:
        print(f"Persisting to {env_label}")

    for i, kanji in enumerate(kanji_list):
        char = kanji["character"]
        if char in completed:
            continue

        print(f"\n[{i + 1}/{len(kanji_list)}] {char}")

        try:
            words, cost = generate_words_and_quizzes(gemini_client, kanji)
            total_cost += cost
            print(f"  Got {len(words)} words (cost: ${cost / 1_000_000:.4f})")
        except Exception as e:
            print(f"  Gemini error: {e}")
            errors += 1
            continue

        if args.dry_run:
            for w in words:
                quizzes = w.get("quizzes", [])
                print(f"    {w['word']} ({w['reading']}) — {w['meaning']} → {len(quizzes)} quizzes")
            completed.add(char)
            save_checkpoint(completed)
            time.sleep(args.delay)
            continue

        if not should_persist:
            completed.add(char)
            continue

        km_id = lookup_kanji_master_id(conn, char)
        if not km_id:
            print(f"  Kanji '{char}' not in kanji_master, skipping.")
            errors += 1
            continue

        word_errors = 0
        for w in words:
            word_id = find_word_master(conn, w["word"])
            if not word_id:
                word_id = insert_word_master(conn, w, km_id)
            if not word_id:
                word_errors += 1
                continue
            total_words += 1

            for q in w.get("quizzes", []):
                quiz_id = insert_quiz(conn, km_id, word_id, q)
                if quiz_id:
                    insert_distractor(conn, quiz_id, q.get("distractors", []))
                    total_quizzes += 1
                else:
                    word_errors += 1

        if word_errors == 0:
            print(f"  Persisted {len(words)} words + quizzes")
            completed.add(char)
            save_checkpoint(completed)
        else:
            print(f"  {word_errors} errors for {char}")
            errors += 1

        time.sleep(args.delay)

    if conn:
        conn.close()

    print(f"\n{'=' * 50}")
    print(f"Done. {len(completed)} kanji processed, {errors} errors.")
    print(f"Total: {total_words} words, {total_quizzes} quizzes")
    print(f"Total Gemini cost: ${total_cost / 1_000_000:.4f}")
    print(f"Checkpoint: {CHECKPOINT_FILE}")


if __name__ == "__main__":
    main()