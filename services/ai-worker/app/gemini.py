from __future__ import annotations

import os

from google import genai
from google.genai import types

from .ai_client import AIResult, parse_json_array


class GeminiAIClient:
    provider_name = "gemini"

    def __init__(
        self,
        client: genai.Client,
        analyze_model: str = "gemini-3.1-pro-preview",
        quiz_model: str = "gemini-3.1-pro-preview",
        discovery_model: str = "gemini-2.0-flash",
    ):
        self._client = client
        self._analyze_model = analyze_model
        self._quiz_model = quiz_model
        self._discovery_model = discovery_model

    @classmethod
    def from_env(cls) -> "GeminiAIClient":
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")
        return cls(
            client=genai.Client(api_key=api_key),
            analyze_model=os.environ.get(
                "GEMINI_ANALYZE_MODEL", "gemini-3.1-pro-preview"
            ),
            quiz_model=os.environ.get(
                "GEMINI_QUIZ_MODEL", "gemini-3.1-pro-preview"
            ),
            discovery_model=os.environ.get(
                "GEMINI_DISCOVERY_MODEL", "gemini-2.0-flash"
            ),
        )

    def analyze_image(
        self,
        prompt: str,
        image_bytes: bytes,
        content_type: str,
    ) -> AIResult:
        response = self._client.models.generate_content(
            model=self._analyze_model,
            contents=[
                types.Part(text=prompt),
                types.Part(
                    inline_data=types.Blob(
                        mime_type=content_type,
                        data=image_bytes,
                    )
                ),
            ],
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
                response_mime_type="application/json",
            ),
        )
        return AIResult(
            data=parse_json_array(response.text),
            cost_microdollars=calculate_cost_microdollars(response.usage_metadata),
            model=self._analyze_model,
        )

    def generate_quizzes(self, prompt: str) -> AIResult:
        response = self._client.models.generate_content(
            model=self._quiz_model,
            contents=[types.Part(text=prompt)],
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"),
                response_mime_type="application/json",
            ),
        )
        return AIResult(
            data=parse_json_array(response.text),
            cost_microdollars=calculate_cost_microdollars(response.usage_metadata),
            model=self._quiz_model,
        )

    def discover_words(self, prompt: str) -> AIResult:
        response = self._client.models.generate_content(
            model=self._discovery_model,
            contents=[types.Part(text=prompt)],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        return AIResult(
            data=parse_json_array(response.text),
            # Preserve the existing behavior: discovery cost is not recorded.
            cost_microdollars=0,
            model=self._discovery_model,
        )


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
