"""
Generate quizzes for JLPT N5/N4 kanji using Gemini 3.1 Pro and seed into Data Connect.

Usage:
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --dry-run
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 4 --persist          # N5 + N4
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --prod
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --clear-and-persist
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --resume  # skip already seeded
"""

import argparse
import gzip
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types

SYSTEM_USER_ID = "system"
CHECKPOINT_FILE = "scripts/.quiz_seed_checkpoint.json"

# kanjidic2 uses old JLPT levels: 4=N5, 3=N4, 2=N3, 1=N2/N1
JLPT_MAP = {5: 4, 4: 3, 3: 2, 2: 1, 1: 1}

QUIZ_PROMPT = """You are building quizzes for a Japanese learner living in Japan.
They speak conversational Japanese but are learning to read kanji from real encounters.
Target kanji: {character} — meanings: {meanings}, onyomi: {onyomi}, kunyomi: {kunyomi}

Generate exactly 5 quizzes, one of each type below.
Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {{
    "quiz_type": "meaning_recall",
    "prompt": "電",
    "target": "電",
    "furigana": null,
    "answer": "electricity",
    "distractors": ["iron", "east", "express"],
    "explanation": "電 is the root of 電車 (train), 電話 (phone), 電気 (electricity)"
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

Rules:
- Sentences must be casual, natural spoken Japanese — the kind said between friends,
  overheard on the street, or seen on informal signs. Not textbook Japanese.
- Draw from real daily contexts: convenience stores, trains, restaurants, weather,
  shopping, work small talk, phone messages, social media captions
- Good sentence patterns: 〜じゃん、〜よね、〜だけど、〜てる、〜っけ、short casual commands
- Avoid: keigo (polite forms), formal written style, news language, 〜ます／〜です endings
- bold_word_meaning and fill_in_the_blank must use completely different sentences —
  never the same sentence with the target word swapped for ＿＿
- Distractors must be plausible — never obviously wrong
- Explanations brief and memorable, not academic
- furigana is null for word-level types; always a string for sentence-level
- for a jlpt N5 kanji, if prompt require showing kanji that is not N5, please write it in hiragana.
"""

QUIZ_TYPE_MAP = {
    "meaning_recall": "MEANING_RECALL",
    "reading_recognition": "READING_RECOGNITION",
    "reverse_reading": "REVERSE_READING",
    "bold_word_meaning": "BOLD_WORD_MEANING",
    "fill_in_the_blank": "FILL_IN_THE_BLANK",
}


# --- Data Connect helpers (same pattern as seed.py) ---

def _build_endpoint(prod: bool) -> tuple[str, dict]:
    load_dotenv()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "kanji-masta")

    if prod:
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
        emulator_host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST", "127.0.0.1:9399")
        url = (
            f"http://{emulator_host}"
            f"/v1alpha/projects/{project_id}"
            f"/locations/asia-east1/services/kanji-masta:executeGraphql"
        )
        headers = {"Content-Type": "application/json"}

    return url, headers


def _execute_graphql(url: str, headers: dict, query: str) -> dict:
    resp = requests.post(url, json={"query": query}, headers=headers)
    return resp.json()


# --- XML parsing ---

def parse_jlpt_kanji(filepath: str, jlpt_level: int, freq_limit: int | None = None) -> list[dict]:
    """Parse kanjidic2.xml and return kanji at or below the given JLPT level."""
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filepath}")

    # kanjidic2 uses old levels: 4=N5, 3=N4, etc.
    # --jlpt 5 means N5 only (old level 4)
    # --jlpt 4 means N5+N4 (old levels 4 and 3)
    max_old_level = JLPT_MAP[jlpt_level]
    valid_old_levels = {lv for lv in range(max_old_level, 5)}  # e.g. {3, 4} for --jlpt 4

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

            onyomi = [r.text for r in elem.findall("reading_meaning/rmgroup/reading[@r_type='ja_on']") if r.text]
            kunyomi = [r.text for r in elem.findall("reading_meaning/rmgroup/reading[@r_type='ja_kun']") if r.text]
            meanings = [m.text for m in elem.findall("reading_meaning/rmgroup/meaning") if m.text and m.get("m_lang") is None]

            kanji_list.append({
                "character": literal,
                "frequency": frequency,
                "onyomi": onyomi,
                "kunyomi": kunyomi,
                "meanings": meanings,
            })
            elem.clear()

    # Sort by frequency (most common first)
    kanji_list.sort(key=lambda k: k.get("frequency") or 99999)

    label = f"JLPT N{jlpt_level}+"
    if freq_limit:
        label += f", freq <= {freq_limit}"
    print(f"Found {len(kanji_list)} kanji ({label})")
    return kanji_list


# --- Gemini ---

def generate_quizzes_for_kanji(client: genai.Client, kanji: dict) -> tuple[list[dict], int]:
    """Call Gemini to generate 5 quizzes for a single kanji. Returns (quizzes, cost_microdollars)."""
    prompt = QUIZ_PROMPT.format(
        character=kanji["character"],
        meanings=", ".join(kanji["meanings"]),
        onyomi=", ".join(kanji["onyomi"]),
        kunyomi=", ".join(kanji["kunyomi"]),
    )

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

    quizzes = json.loads(response.text)
    return quizzes, cost


# --- Data Connect persistence ---

def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _lookup_kanji_master_id(url: str, headers: dict, character: str) -> str | None:
    """Find KanjiMaster ID by character."""
    query = f"""
        query {{
            kanjiMasters(where: {{ character: {{ eq: "{_escape(character)}" }} }}) {{
                id
            }}
        }}
    """
    result = _execute_graphql(url, headers, query)
    rows = result.get("data", {}).get("kanjiMasters", [])
    return rows[0]["id"] if rows else None


def _get_existing_quiz_characters(url: str, headers: dict) -> set[str]:
    """Get characters that already have system quizzes."""
    query = """
        query {
            quizBanks(where: { userId: { eq: "system" } }, limit: 10000) {
                kanji { character }
            }
        }
    """
    result = _execute_graphql(url, headers, query)
    rows = result.get("data", {}).get("quizBanks", [])
    return {r["kanji"]["character"] for r in rows}


def insert_quiz(url: str, headers: dict, kanji_master_id: str, quiz: dict) -> str | None:
    """Insert a single QuizBank row, return its ID."""
    qt = QUIZ_TYPE_MAP.get(quiz["quiz_type"], quiz["quiz_type"])
    furigana_field = f'furigana: "{_escape(quiz["furigana"])}",' if quiz.get("furigana") else ""
    explanation_field = f'explanation: "{_escape(quiz.get("explanation", ""))}",' if quiz.get("explanation") else ""

    query = f"""
        mutation {{
            quizBank_insert(data: {{
                userId: "{SYSTEM_USER_ID}",
                kanjiId: "{kanji_master_id}",
                quizType: {qt},
                prompt: "{_escape(quiz["prompt"])}",
                target: "{_escape(quiz["target"])}",
                answer: "{_escape(quiz["answer"])}",
                {furigana_field}
                {explanation_field}
            }})
        }}
    """
    result = _execute_graphql(url, headers, query)
    if result.get("errors"):
        print(f"    QuizBank insert error: {result['errors'][0].get('message', '')[:100]}")
        return None
    return result.get("data", {}).get("quizBank_insert", {}).get("id")


def insert_distractor(url: str, headers: dict, quiz_id: str, distractors: list[str]):
    """Insert a QuizDistractor row for a quiz."""
    dist_json = json.dumps(distractors, ensure_ascii=False)
    query = f"""
        mutation {{
            quizDistractor_insert(data: {{
                quizId: "{quiz_id}",
                userId: "{SYSTEM_USER_ID}",
                distractors: {dist_json},
                generation: 1,
                trigger: INITIAL,
                familiarityAtGeneration: 0
            }})
        }}
    """
    result = _execute_graphql(url, headers, query)
    if result.get("errors"):
        print(f"    QuizDistractor insert error: {result['errors'][0].get('message', '')[:100]}")


def clear_system_quizzes(url: str, headers: dict):
    """Delete all system user quizzes (distractors first, then quiz bank)."""
    print("\nClearing system quizzes ...")

    # Delete distractors first (FK constraint)
    total = 0
    while True:
        query = """
            query {
                quizDistractors(where: { userId: { eq: "system" } }, limit: 1000) { id }
            }
        """
        result = _execute_graphql(url, headers, query)
        rows = result.get("data", {}).get("quizDistractors", [])
        if not rows:
            break
        ids = [r["id"] for r in rows]
        for i in range(0, len(ids), 100):
            batch = ids[i:i + 100]
            id_list = ", ".join(f'"{uid}"' for uid in batch)
            _execute_graphql(url, headers, f'mutation {{ quizDistractor_deleteMany(where: {{ id: {{ in: [{id_list}] }} }}) }}')
        total += len(ids)
    print(f"  Deleted {total} distractor rows.")

    # Delete quiz bank
    total = 0
    while True:
        query = """
            query {
                quizBanks(where: { userId: { eq: "system" } }, limit: 1000) { id }
            }
        """
        result = _execute_graphql(url, headers, query)
        rows = result.get("data", {}).get("quizBanks", [])
        if not rows:
            break
        ids = [r["id"] for r in rows]
        for i in range(0, len(ids), 100):
            batch = ids[i:i + 100]
            id_list = ", ".join(f'"{uid}"' for uid in batch)
            _execute_graphql(url, headers, f'mutation {{ quizBank_deleteMany(where: {{ id: {{ in: [{id_list}] }} }}) }}')
        total += len(ids)
    print(f"  Deleted {total} quiz bank rows.")


# --- Checkpoint ---

def load_checkpoint() -> set[str]:
    if Path(CHECKPOINT_FILE).exists():
        with open(CHECKPOINT_FILE) as f:
            return set(json.load(f))
    return set()


def save_checkpoint(completed: set[str]):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(sorted(completed), f, ensure_ascii=False)


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Generate quizzes for JLPT kanji via Gemini")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--jlpt", type=int, required=True, choices=[1, 2, 3, 4, 5], help="JLPT level (5=N5 only, 4=N5+N4, etc.)")
    parser.add_argument("--limit", type=int, default=None, help="Only include kanji with frequency rank <= this value")
    parser.add_argument("--persist", action="store_true", help="Write quizzes to Data Connect")
    parser.add_argument("--clear-and-persist", action="store_true", help="Clear existing system quizzes then write")
    parser.add_argument("--prod", action="store_true", help="Target production")
    parser.add_argument("--dry-run", action="store_true", help="Call Gemini but don't write to DB")
    parser.add_argument("--resume", action="store_true", help="Skip kanji already in checkpoint or DB")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds between Gemini calls (default: 1.0)")
    args = parser.parse_args()

    kanji_list = parse_jlpt_kanji(args.file, args.jlpt, freq_limit=args.limit)
    if not kanji_list:
        print("No kanji found. Check file path and JLPT level.")
        return

    # Setup Gemini client
    load_dotenv()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set. Add it to .env or environment.")
        sys.exit(1)
    gemini_client = genai.Client(api_key=api_key)

    # Setup Data Connect
    should_persist = args.persist or args.clear_and_persist
    url, headers = None, None
    if should_persist or args.resume:
        url, headers = _build_endpoint(args.prod)

    if args.clear_and_persist:
        clear_system_quizzes(url, headers)

    # Determine which kanji to skip
    completed = load_checkpoint() if args.resume else set()
    if args.resume and url:
        db_existing = _get_existing_quiz_characters(url, headers)
        completed |= db_existing
        print(f"Resuming: {len(completed)} kanji already done, {len(kanji_list) - len(completed)} remaining.")

    # Generate and persist
    total_cost = 0
    errors = 0
    env_label = "production" if args.prod else "local emulator"

    print(f"\nGenerating quizzes for {len(kanji_list)} kanji ...")
    if should_persist:
        print(f"Persisting to {env_label}")
    if args.dry_run:
        print("DRY RUN — will not write to DB")

    for i, kanji in enumerate(kanji_list):
        char = kanji["character"]
        if char in completed:
            continue

        print(f"\n[{i + 1}/{len(kanji_list)}] {char} ({', '.join(kanji['meanings'][:3])})")

        try:
            quizzes, cost = generate_quizzes_for_kanji(gemini_client, kanji)
            total_cost += cost
            print(f"  Generated {len(quizzes)} quizzes (cost: ${cost / 1_000_000:.4f})")
        except Exception as e:
            print(f"  Gemini error: {e}")
            errors += 1
            continue

        if args.dry_run:
            for q in quizzes:
                print(f"    {q['quiz_type']}: {q['prompt'][:40]}... → {q['answer']}")
            completed.add(char)
            save_checkpoint(completed)
            time.sleep(args.delay)
            continue

        if not should_persist:
            completed.add(char)
            continue

        # Look up KanjiMaster ID
        km_id = _lookup_kanji_master_id(url, headers, char)
        if not km_id:
            print(f"  Kanji '{char}' not found in KanjiMaster, skipping.")
            errors += 1
            continue

        # Insert quizzes + distractors
        quiz_errors = 0
        for q in quizzes:
            quiz_id = insert_quiz(url, headers, km_id, q)
            if not quiz_id:
                quiz_errors += 1
                continue
            insert_distractor(url, headers, quiz_id, q.get("distractors", []))

        if quiz_errors == 0:
            print(f"  Persisted 5 quizzes + 5 distractors")
            completed.add(char)
            save_checkpoint(completed)
        else:
            print(f"  {quiz_errors} quiz insert errors for {char}")
            errors += 1

        time.sleep(args.delay)

    print(f"\n{'=' * 50}")
    print(f"Done. {len(completed)} kanji processed, {errors} errors.")
    print(f"Total Gemini cost: ${total_cost / 1_000_000:.4f}")
    print(f"Checkpoint saved to {CHECKPOINT_FILE}")


if __name__ == "__main__":
    main()
