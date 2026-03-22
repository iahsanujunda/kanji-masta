import base64
import json
import os

import requests
from firebase_admin import initialize_app
from firebase_functions import https_fn
from google import genai
from google.genai import types

initialize_app()

KANJI_PROMPT = """You are a Japanese kanji tutor for a conversational English speaker living in Japan.
Analyze this image and extract all kanji visible.

For each kanji return 5 example words commonly encountered in daily life in Japan
(shops, stations, restaurants, signage, packaging). Prioritize words the user
is likely to hear spoken AND see written — not textbook vocabulary.

Mark up to 3 kanji as recommended:true — choose the ones most worth learning
first based on how frequently they appear in everyday Japanese life.

Return ONLY a valid JSON array — no markdown, no preamble, no trailing commas:
[
  {
    "character": "電",
    "recommended": true,
    "whyUseful": "Core kanji for anything electric — trains, phones, appliances",
    "exampleWords": [
      { "word": "電車", "reading": "でんしゃ", "meaning": "train" },
      { "word": "電話", "reading": "でんわ", "meaning": "telephone" },
      { "word": "電気", "reading": "でんき", "meaning": "electricity / lights" },
      { "word": "電池", "reading": "でんち", "meaning": "battery" },
      { "word": "充電", "reading": "じゅうでん", "meaning": "charging (a device)" }
    ]
  }
]"""


def _get_data_connect_url():
    project_id = os.environ.get("GCLOUD_PROJECT", "kanji-masta")
    dc_host = os.environ.get("FIREBASE_DATACONNECT_EMULATOR_HOST")
    if dc_host:
        return f"http://{dc_host}/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
    return (
        f"https://firebasedataconnect.googleapis.com"
        f"/v1alpha/projects/{project_id}/locations/asia-east1/services/kanji-masta:executeGraphql"
    )


def _execute_graphql(query: str, variables: dict | None = None) -> dict:
    url = _get_data_connect_url()
    body = {"query": query}
    if variables:
        body["variables"] = variables
    resp = requests.post(url, json=body, headers={"Content-Type": "application/json"})
    return resp.json()


def _lookup_kanji(characters: list[str]) -> dict[str, dict]:
    """Look up kanji in KanjiMaster, return dict keyed by character."""
    if not characters:
        return {}

    chars_literal = ", ".join(f'"{c}"' for c in characters)
    query = f"""
        query {{
            kanjiMasters(where: {{ character: {{ in: [{chars_literal}] }} }}) {{
                id character onyomi kunyomi meanings frequency
            }}
        }}
    """
    result = _execute_graphql(query)
    rows = result.get("data", {}).get("kanjiMasters", [])
    return {row["character"]: row for row in rows}


def _update_photo_session(session_id: str, raw_response: str, cost_microdollars: int):
    query = f"""
        mutation {{
            photoSession_update(id: "{session_id}", data: {{
                rawAiResponse: {json.dumps(raw_response)},
                costMicrodollars: {cost_microdollars}
            }})
        }}
    """
    _execute_graphql(query)


def _calculate_cost_microdollars(usage) -> int:
    """Estimate cost in microdollars from Gemini usage metadata."""
    if not usage:
        return 0
    # Gemini 3.1 Pro pricing (per 1M tokens): input $2.50, output $15.00
    input_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    input_cost = input_tokens * 2.50 / 1_000_000
    output_cost = output_tokens * 15.00 / 1_000_000
    return int((input_cost + output_cost) * 1_000_000)


@https_fn.on_request()
def analyze_photo(req: https_fn.Request) -> https_fn.Response:
    body = req.get_json(silent=True)
    if not body:
        return https_fn.Response("Missing JSON body", status=400)

    image_url = body.get("imageUrl")
    session_id = body.get("sessionId")
    if not image_url or not session_id:
        return https_fn.Response("Missing imageUrl or sessionId", status=400)

    # Download image
    img_resp = requests.get(image_url)
    if img_resp.status_code != 200:
        return https_fn.Response(f"Failed to download image: {img_resp.status_code}", status=500)

    image_bytes = img_resp.content
    content_type = img_resp.headers.get("Content-Type", "image/jpeg")

    # Call Gemini 3.1 Pro
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return https_fn.Response("GEMINI_API_KEY not configured", status=500)

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[
            types.Part(text=KANJI_PROMPT),
            types.Part(inline_data=types.Blob(
                mime_type=content_type,
                data=image_bytes,
            )),
        ],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )

    raw_text = response.text
    cost = _calculate_cost_microdollars(response.usage_metadata)

    # Parse Gemini response
    try:
        kanji_list = json.loads(raw_text)
    except json.JSONDecodeError:
        _update_photo_session(session_id, raw_text, cost)
        return https_fn.Response(json.dumps({"error": "Failed to parse AI response"}), status=500,
                                 content_type="application/json")

    # Enrich with KanjiMaster data
    characters = [k["character"] for k in kanji_list if "character" in k]
    master_lookup = _lookup_kanji(characters)

    enriched = []
    for k in kanji_list:
        char = k.get("character", "")
        master = master_lookup.get(char)
        enriched.append({
            "kanjiMasterId": master["id"] if master else None,
            "character": char,
            "recommended": k.get("recommended", False),
            "whyUseful": k.get("whyUseful", ""),
            "onyomi": master["onyomi"] if master else [],
            "kunyomi": master["kunyomi"] if master else [],
            "meanings": master["meanings"] if master else [],
            "frequency": master["frequency"] if master else None,
            "exampleWords": k.get("exampleWords", []),
        })

    # Store enriched result + cost in PhotoSession
    enriched_json = json.dumps(enriched, ensure_ascii=False)
    _update_photo_session(session_id, enriched_json, cost)

    return https_fn.Response(json.dumps({"status": "ok"}), content_type="application/json")
