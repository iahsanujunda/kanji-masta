from __future__ import annotations

import json
import os

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class AIResult:
    """Provider-neutral result from an AI operation."""

    data: list[Any]
    cost_microdollars: int
    model: str


class AIClientError(RuntimeError):
    """Raised when an AI provider returns an unusable response."""


class AIClient(Protocol):
    """The AI capabilities used by the worker's application layer."""

    provider_name: str

    def analyze_image(
        self,
        prompt: str,
        image_bytes: bytes,
        content_type: str,
    ) -> AIResult: ...

    def generate_quizzes(self, prompt: str) -> AIResult: ...

    def discover_words(self, prompt: str) -> AIResult: ...


def parse_json_array(text: str) -> list[Any]:
    """Parse the array-shaped JSON contract shared by all worker prompts."""
    parsed = json.loads(text)
    if not isinstance(parsed, list):
        raise AIClientError("AI response must be a JSON array")
    return parsed


def get_ai_client() -> AIClient:
    """Build the configured provider adapter.

    Gemini remains the default for backward compatibility. Set
    AI_PROVIDER=openrouter to route calls through OpenRouter.
    """
    provider = os.environ.get("AI_PROVIDER", "gemini").strip().lower()

    if provider == "gemini":
        from .gemini import GeminiAIClient

        return GeminiAIClient.from_env()
    if provider == "openrouter":
        from .openrouter import OpenRouterAIClient

        return OpenRouterAIClient.from_env()

    raise RuntimeError(
        f"Unsupported AI_PROVIDER={provider!r}; expected 'gemini' or 'openrouter'"
    )
