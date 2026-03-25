from __future__ import annotations

import json
import os

from google import genai
from google.genai import types


def get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def analyze_image(client: genai.Client, prompt: str, image_bytes: bytes, content_type: str) -> tuple[list, int]:
    """Call Gemini 3.1 Pro with vision. Returns (parsed_json, cost_microdollars)."""
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[
            types.Part(text=prompt),
            types.Part(inline_data=types.Blob(mime_type=content_type, data=image_bytes)),
        ],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )
    cost = calculate_cost_microdollars(response.usage_metadata)
    parsed = json.loads(response.text)
    return parsed, cost


def generate_quizzes_text(client: genai.Client, prompt: str) -> tuple[list, int]:
    """Call Gemini 3.1 Pro for quiz generation. Returns (parsed_json, cost_microdollars)."""
    response = client.models.generate_content(
        model="gemini-3.1-pro-preview",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
            response_mime_type="application/json",
        ),
    )
    cost = calculate_cost_microdollars(response.usage_metadata)
    parsed = json.loads(response.text)
    return parsed, cost


def discover_words_text(client: genai.Client, prompt: str) -> list:
    """Call Gemini 2.0 Flash for word discovery. Returns parsed JSON."""
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=[types.Part(text=prompt)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )
    return json.loads(response.text)


def calculate_cost_microdollars(usage) -> int:
    """Estimate cost in microdollars from Gemini usage metadata."""
    if not usage:
        return 0
    input_tokens = getattr(usage, "prompt_token_count", 0) or 0
    output_tokens = getattr(usage, "candidates_token_count", 0) or 0
    # Gemini 3.1 Pro pricing (per 1M tokens): input $2.50, output $15.00
    input_cost = input_tokens * 2.50 / 1_000_000
    output_cost = output_tokens * 15.00 / 1_000_000
    return int((input_cost + output_cost) * 1_000_000)
