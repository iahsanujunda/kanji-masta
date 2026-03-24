"""
Generate word-centric quizzes for JLPT kanji using Gemini 3.1 Pro.

For each kanji, Gemini returns 3 compound words with 5 quizzes each.
Creates system UserWords + QuizBank + QuizDistractor rows.

Usage:
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --dry-run
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 4 --persist          # N5 + N4
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --prod
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --clear-and-persist
    python seed_quizzes.py --file data/kanjidic2.xml --jlpt 5 --persist --resume
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

# Global quizzes use userId=null (not "system" anymore)
CHECKPOINT_FILE = "scripts/.quiz_seed_checkpoint.json"

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


# --- Data Connect helpers ---

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


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


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

            kanji_list.append({
                "character": literal,
                "frequency": frequency,
            })
            elem.clear()

    kanji_list.sort(key=lambda k: k.get("frequency") or 99999)

    label = f"JLPT N{jlpt_level}+"
    if freq_limit:
        label += f", freq <= {freq_limit}"
    print(f"Found {len(kanji_list)} kanji ({label})")
    return kanji_list


# --- Gemini ---

def generate_words_and_quizzes(client: genai.Client, kanji: dict) -> tuple[list[dict], int]:
    """Call Gemini to get 3 words + 5 quizzes each for a kanji. Returns (word_quiz_list, cost_microdollars)."""
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


# --- Data Connect persistence ---

def _lookup_kanji_master_id(url: str, headers: dict, character: str) -> str | None:
    query = f"""
        query {{
            kanjiMasters(where: {{ character: {{ eq: "{_escape(character)}" }} }}) {{ id }}
        }}
    """
    result = _execute_graphql(url, headers, query)
    rows = result.get("data", {}).get("kanjiMasters", [])
    return rows[0]["id"] if rows else None


def _find_word_master(url: str, headers: dict, word: str) -> str | None:
    """Check if a WordMaster row already exists for this word."""
    query = f"""
        query {{
            wordMasters(where: {{ word: {{ eq: "{_escape(word)}" }} }}, limit: 1) {{ id }}
        }}
    """
    result = _execute_graphql(url, headers, query)
    rows = result.get("data", {}).get("wordMasters", [])
    return rows[0]["id"] if rows else None


def _insert_word_master(url: str, headers: dict, word: dict, kanji_master_id: str) -> str | None:
    """Insert a WordMaster row. Returns the ID."""
    meanings_json = json.dumps([word["meaning"]], ensure_ascii=False)
    kanji_ids_json = json.dumps([kanji_master_id])
    query = f"""
        mutation {{
            wordMaster_insert(data: {{
                word: "{_escape(word['word'])}",
                reading: "{_escape(word['reading'])}",
                meanings: {meanings_json},
                kanjiIds: {kanji_ids_json}
            }})
        }}
    """
    result = _execute_graphql(url, headers, query)
    if result.get("errors"):
        print(f"    WordMaster insert error: {result['errors'][0].get('message', '')[:100]}")
        return None
    return result.get("data", {}).get("wordMaster_insert", {}).get("id")


def _insert_quiz(url: str, headers: dict, kanji_master_id: str, word_master_id: str, quiz: dict) -> str | None:
    """Insert a global quiz (userId=null)."""
    qt = QUIZ_TYPE_MAP.get(quiz.get("quiz_type", ""), quiz.get("quiz_type", ""))
    furigana = quiz.get("furigana")
    explanation = quiz.get("explanation", "")
    furigana_field = f'furigana: "{_escape(furigana)}",' if furigana else ""
    explanation_field = f'explanation: "{_escape(explanation)}",' if explanation else ""

    query = f"""
        mutation {{
            quizBank_insert(data: {{
                kanjiId: "{kanji_master_id}",
                wordId: "{word_master_id}",
                quizType: {qt},
                prompt: "{_escape(quiz.get('prompt', ''))}",
                target: "{_escape(quiz.get('target', ''))}",
                answer: "{_escape(quiz.get('answer', ''))}",
                {furigana_field}
                {explanation_field}
            }})
        }}
    """
    result = _execute_graphql(url, headers, query)
    if result.get("errors"):
        print(f"    Quiz insert error: {result['errors'][0].get('message', '')[:100]}")
        return None
    return result.get("data", {}).get("quizBank_insert", {}).get("id")


def _insert_distractor(url: str, headers: dict, quiz_id: str, distractors: list[str]):
    """Insert a global distractor set (userId=null)."""
    dist_json = json.dumps(distractors, ensure_ascii=False)
    query = f"""
        mutation {{
            quizDistractor_insert(data: {{
                quizId: "{quiz_id}",
                distractors: {dist_json},
                generation: 1,
                trigger: INITIAL,
                familiarityAtGeneration: 0
            }})
        }}
    """
    result = _execute_graphql(url, headers, query)
    if result.get("errors"):
        print(f"    Distractor insert error: {result['errors'][0].get('message', '')[:100]}")


def _get_existing_quiz_characters(url: str, headers: dict) -> set[str]:
    query = """
        query {
            quizBanks(where: { userId: { isNull: true } }, limit: 10000) {
                kanji { character }
            }
        }
    """
    result = _execute_graphql(url, headers, query)
    rows = result.get("data", {}).get("quizBanks", [])
    return {r["kanji"]["character"] for r in rows}


def clear_system_quizzes(url: str, headers: dict):
    """Delete global quizzes + word masters: distractors → quiz bank → word masters."""
    print("\nClearing global quizzes + word masters ...")

    for table, label, where in [
        ("quizDistractors", "distractor", '{ userId: { isNull: true } }'),
        ("quizBanks", "quiz bank", '{ userId: { isNull: true } }'),
        ("wordMasters", "word master", '{}'),
    ]:
        total = 0
        while True:
            query = f'query {{ {table}(where: {where}, limit: 1000) {{ id }} }}'
            result = _execute_graphql(url, headers, query)
            rows = result.get("data", {}).get(table, [])
            if not rows:
                break
            ids = [r["id"] for r in rows]
            singular = table.rstrip("s")
            for i in range(0, len(ids), 100):
                batch = ids[i:i + 100]
                id_list = ", ".join(f'"{uid}"' for uid in batch)
                _execute_graphql(url, headers, f'mutation {{ {singular}_deleteMany(where: {{ id: {{ in: [{id_list}] }} }}) }}')
            total += len(ids)
        print(f"  Deleted {total} {label} rows.")


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
    parser = argparse.ArgumentParser(description="Generate word-centric quizzes for JLPT kanji via Gemini")
    parser.add_argument("--file", default="kanjidic2.xml", help="Path to kanjidic2.xml or .xml.gz")
    parser.add_argument("--jlpt", type=int, required=True, choices=[1, 2, 3, 4, 5])
    parser.add_argument("--limit", type=int, default=None, help="Only include kanji with frequency rank <= this value")
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
    url, headers = None, None
    if should_persist or args.resume:
        url, headers = _build_endpoint(args.prod)

    if args.clear_and_persist:
        clear_system_quizzes(url, headers)

    completed = load_checkpoint() if args.resume else set()
    if args.resume and url:
        db_existing = _get_existing_quiz_characters(url, headers)
        completed |= db_existing
        print(f"Resuming: {len(completed)} kanji done, {len(kanji_list) - len(completed)} remaining.")

    total_cost = 0
    total_words = 0
    total_quizzes = 0
    errors = 0
    env_label = "production" if args.prod else "local emulator"

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

        km_id = _lookup_kanji_master_id(url, headers, char)
        if not km_id:
            print(f"  Kanji '{char}' not in KanjiMaster, skipping.")
            errors += 1
            continue

        word_errors = 0
        for w in words:
            # Deduplicate: check if this word already exists in WordMaster
            word_id = _find_word_master(url, headers, w["word"])
            if not word_id:
                word_id = _insert_word_master(url, headers, w, km_id)
            if not word_id:
                word_errors += 1
                continue
            total_words += 1

            for q in w.get("quizzes", []):
                quiz_id = _insert_quiz(url, headers, km_id, word_id, q)
                if quiz_id:
                    _insert_distractor(url, headers, quiz_id, q.get("distractors", []))
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

    print(f"\n{'=' * 50}")
    print(f"Done. {len(completed)} kanji processed, {errors} errors.")
    print(f"Total: {total_words} words, {total_quizzes} quizzes")
    print(f"Total Gemini cost: ${total_cost / 1_000_000:.4f}")
    print(f"Checkpoint: {CHECKPOINT_FILE}")


if __name__ == "__main__":
    main()
