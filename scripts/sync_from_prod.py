"""
Sync shared data (WordMaster, QuizBank, QuizDistractor) from production to local emulator.
KanjiMaster is seeded separately via seed.py.

Usage:
    python sync_from_prod.py
"""

import json
import os

import requests
from dotenv import load_dotenv


def _get_url(prod: bool):
    load_dotenv()
    project_id = os.environ.get("FIREBASE_PROJECT_ID", "kanji-masta")
    if prod:
        import google.auth, google.auth.transport.requests
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/firebase.dataconnect"])
        creds.refresh(google.auth.transport.requests.Request())
        url = f"https://firebasedataconnect.googleapis.com/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {creds.token}"}
    else:
        host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST", "127.0.0.1:9399")
        url = f"http://{host}/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
        headers = {"Content-Type": "application/json"}
    return url, headers


def _gql(url, headers, query):
    r = requests.post(url, json={"query": query}, headers=headers)
    return r.json()


def _escape(s):
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def main():
    print("Syncing production data to local emulator...\n")

    prod_url, prod_headers = _get_url(prod=True)
    local_url, local_headers = _get_url(prod=False)

    # --- Sync WordMaster ---
    print("Fetching WordMaster from production...")
    result = _gql(prod_url, prod_headers, "query { wordMasters(limit: 5000) { id word reading meanings kanjiIds frequency } }")
    words = result.get("data", {}).get("wordMasters", [])
    print(f"  Found {len(words)} words")

    if words:
        # Clear local
        while True:
            r = _gql(local_url, local_headers, 'query { wordMasters(limit: 500) { id } }')
            rows = r.get("data", {}).get("wordMasters", [])
            if not rows:
                break
            ids = ", ".join(f'"{row["id"]}"' for row in rows)
            _gql(local_url, local_headers, f'mutation {{ wordMaster_deleteMany(where: {{ id: {{ in: [{ids}] }} }}) }}')

        # Insert
        errors = 0
        for i, w in enumerate(words):
            meanings = json.dumps(w.get("meanings", []), ensure_ascii=False)
            kanji_ids = json.dumps(w.get("kanjiIds", []))
            freq = w.get("frequency") or "null"
            query = f"""
                mutation {{
                    wordMaster_insert(data: {{
                        word: "{_escape(w['word'])}",
                        reading: "{_escape(w['reading'])}",
                        meanings: {meanings},
                        kanjiIds: {kanji_ids},
                        frequency: {freq}
                    }})
                }}
            """
            r = _gql(local_url, local_headers, query)
            if r.get("errors"):
                errors += 1
            if (i + 1) % 50 == 0:
                print(f"  Progress: {i + 1}/{len(words)}")
        print(f"  Inserted {len(words) - errors} WordMaster rows ({errors} errors)")

    # --- Sync QuizBank (global only, userId IS NULL) ---
    print("\nFetching global QuizBank from production...")
    result = _gql(prod_url, prod_headers, """
        query { quizBanks(where: { userId: { isNull: true } }, limit: 5000) {
            id kanjiId wordId quizType prompt furigana target answer explanation
        } }
    """)
    quizzes = result.get("data", {}).get("quizBanks", [])
    print(f"  Found {len(quizzes)} global quizzes")

    if quizzes:
        # Clear local global quizzes
        while True:
            r = _gql(local_url, local_headers, 'query { quizBanks(where: { userId: { isNull: true } }, limit: 500) { id } }')
            rows = r.get("data", {}).get("quizBanks", [])
            if not rows:
                break
            ids = ", ".join(f'"{row["id"]}"' for row in rows)
            _gql(local_url, local_headers, f'mutation {{ quizBank_deleteMany(where: {{ id: {{ in: [{ids}] }} }}) }}')

        errors = 0
        for i, q in enumerate(quizzes):
            furigana = f'furigana: "{_escape(q["furigana"])}",' if q.get("furigana") else ""
            explanation = f'explanation: "{_escape(q["explanation"])}",' if q.get("explanation") else ""
            query = f"""
                mutation {{
                    quizBank_insert(data: {{
                        kanjiId: "{q['kanjiId']}",
                        wordId: "{q['wordId']}",
                        quizType: {q['quizType']},
                        prompt: "{_escape(q['prompt'])}",
                        target: "{_escape(q['target'])}",
                        answer: "{_escape(q['answer'])}",
                        {furigana}
                        {explanation}
                    }})
                }}
            """
            r = _gql(local_url, local_headers, query)
            if r.get("errors"):
                errors += 1
            if (i + 1) % 100 == 0:
                print(f"  Progress: {i + 1}/{len(quizzes)}")
        print(f"  Inserted {len(quizzes) - errors} QuizBank rows ({errors} errors)")

    # --- Sync QuizDistractor (global only) ---
    print("\nFetching global QuizDistractor from production...")
    result = _gql(prod_url, prod_headers, """
        query { quizDistractors(where: { userId: { isNull: true } }, limit: 5000) {
            id quizId distractors generation trigger familiarityAtGeneration
        } }
    """)
    distractors = result.get("data", {}).get("quizDistractors", [])
    print(f"  Found {len(distractors)} global distractors")

    if distractors:
        while True:
            r = _gql(local_url, local_headers, 'query { quizDistractors(where: { userId: { isNull: true } }, limit: 500) { id } }')
            rows = r.get("data", {}).get("quizDistractors", [])
            if not rows:
                break
            ids = ", ".join(f'"{row["id"]}"' for row in rows)
            _gql(local_url, local_headers, f'mutation {{ quizDistractor_deleteMany(where: {{ id: {{ in: [{ids}] }} }}) }}')

        errors = 0
        for i, d in enumerate(distractors):
            dist_json = json.dumps(d["distractors"], ensure_ascii=False)
            query = f"""
                mutation {{
                    quizDistractor_insert(data: {{
                        quizId: "{d['quizId']}",
                        distractors: {dist_json},
                        generation: {d['generation']},
                        trigger: {d['trigger']},
                        familiarityAtGeneration: {d['familiarityAtGeneration']}
                    }})
                }}
            """
            r = _gql(local_url, local_headers, query)
            if r.get("errors"):
                errors += 1
            if (i + 1) % 100 == 0:
                print(f"  Progress: {i + 1}/{len(distractors)}")
        print(f"  Inserted {len(distractors) - errors} QuizDistractor rows ({errors} errors)")

    print("\nSync complete.")


if __name__ == "__main__":
    main()
