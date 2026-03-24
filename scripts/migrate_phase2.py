"""
Phase 2.1 Migration: UserWords → WordMaster + Shared QuizBank

Migrates existing data from the Phase 1 schema to Phase 2:
1. Creates WordMaster rows from existing UserWords (word, reading, meaning)
2. Updates UserWords to reference WordMaster (sets wordMasterId)
3. Updates QuizBank to reference WordMaster and set userId=null for system quizzes
4. Updates QuizDistractor to set userId=null for system distractor sets

Usage:
    python migrate_phase2.py              # local emulator
    python migrate_phase2.py --prod       # production
    python migrate_phase2.py --dry-run    # preview only
"""

import argparse
import json
import os

import requests
from dotenv import load_dotenv


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
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {credentials.token}"}
    else:
        emulator_host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST", "127.0.0.1:9399")
        url = f"http://{emulator_host}/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
        headers = {"Content-Type": "application/json"}

    return url, headers


def _execute(url, headers, query):
    resp = requests.post(url, json={"query": query}, headers=headers)
    return resp.json()


def _escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def main():
    parser = argparse.ArgumentParser(description="Phase 2.1 data migration")
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    url, headers = _build_endpoint(args.prod)
    env = "production" if args.prod else "local emulator"
    print(f"Phase 2.1 Migration — {env}")
    if args.dry_run:
        print("DRY RUN — no changes will be made\n")

    # Step 1: Find all unique words in old UserWords (those with inline word data)
    print("Step 1: Checking for old-format UserWords with inline word data...")
    result = _execute(url, headers, """
        query { userWordss(limit: 1000) { id userId word reading meaning kanjiIds wordMasterId } }
    """)
    all_words = result.get("data", {}).get("userWordss", [])

    # Filter to words that have inline data but no wordMasterId yet
    old_words = [w for w in all_words if w.get("word") and not w.get("wordMasterId")]
    print(f"  Found {len(old_words)} old-format UserWords rows")

    if not old_words:
        print("  No migration needed for UserWords.")

    # Step 2: Create WordMaster for each unique word
    word_to_wm_id = {}
    for w in old_words:
        word_text = w["word"]
        if word_text in word_to_wm_id:
            continue

        # Check if WordMaster already exists
        check = _execute(url, headers, f"""
            query {{ wordMasters(where: {{ word: {{ eq: "{_escape(word_text)}" }} }}, limit: 1) {{ id }} }}
        """)
        existing = check.get("data", {}).get("wordMasters", [])
        if existing:
            word_to_wm_id[word_text] = existing[0]["id"]
            continue

        if args.dry_run:
            print(f"  Would create WordMaster: {word_text}")
            word_to_wm_id[word_text] = "dry-run-id"
            continue

        meanings = json.dumps([w.get("meaning", "")], ensure_ascii=False)
        kanji_ids = json.dumps(w.get("kanjiIds", []))
        result = _execute(url, headers, f"""
            mutation {{
                wordMaster_insert(data: {{
                    word: "{_escape(word_text)}",
                    reading: "{_escape(w.get('reading', ''))}",
                    meanings: {meanings},
                    kanjiIds: {kanji_ids}
                }})
            }}
        """)
        wm_id = result.get("data", {}).get("wordMaster_insert", {}).get("id")
        if wm_id:
            word_to_wm_id[word_text] = wm_id
        else:
            print(f"  ERROR creating WordMaster for '{word_text}': {result.get('errors', [])}")

    print(f"  WordMaster entries: {len(word_to_wm_id)}")

    # Step 3: Update old QuizBank rows (userId="system" → userId=null)
    print("\nStep 3: Migrating system QuizBank rows to global (userId=null)...")
    result = _execute(url, headers, """
        query { quizBanks(where: { userId: { eq: "system" } }, limit: 1000) { id } }
    """)
    system_quizzes = result.get("data", {}).get("quizBanks", [])
    print(f"  Found {len(system_quizzes)} system quiz rows to migrate")

    if not args.dry_run:
        for sq in system_quizzes:
            _execute(url, headers, f"""
                mutation {{ quizBank_update(id: "{sq['id']}", data: {{ userId: null }}) }}
            """)

    # Step 4: Update old QuizDistractor rows (userId="system" → userId=null)
    print("Step 4: Migrating system QuizDistractor rows to global...")
    result = _execute(url, headers, """
        query { quizDistractors(where: { userId: { eq: "system" } }, limit: 1000) { id } }
    """)
    system_distractors = result.get("data", {}).get("quizDistractors", [])
    print(f"  Found {len(system_distractors)} system distractor rows to migrate")

    if not args.dry_run:
        for sd in system_distractors:
            _execute(url, headers, f"""
                mutation {{ quizDistractor_update(id: "{sd['id']}", data: {{ userId: null }}) }}
            """)

    print("\nMigration complete.")


if __name__ == "__main__":
    main()
