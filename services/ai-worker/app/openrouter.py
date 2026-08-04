from __future__ import annotations

import base64
import os

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable

import httpx

from .ai_client import AIClientError, AIResult, parse_json_array


_REASONING_EFFORTS = {
    "max",
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
}


class OpenRouterAIClient:
    provider_name = "openrouter"

    def __init__(
        self,
        api_key: str,
        analyze_model: str,
        quiz_model: str,
        discovery_model: str,
        *,
        base_url: str = "https://openrouter.ai/api/v1",
        site_url: str = "",
        app_name: str = "Kanji Masta",
        reasoning_effort: str = "medium",
        timeout_seconds: float = 120.0,
        requester: Callable[..., httpx.Response] | None = None,
    ):
        if reasoning_effort not in _REASONING_EFFORTS:
            allowed = ", ".join(sorted(_REASONING_EFFORTS))
            raise ValueError(
                f"Unsupported OpenRouter reasoning effort {reasoning_effort!r}; "
                f"expected one of: {allowed}"
            )
        self._api_key = api_key
        self._analyze_model = analyze_model
        self._quiz_model = quiz_model
        self._discovery_model = discovery_model
        self._base_url = base_url.rstrip("/")
        self._site_url = site_url
        self._app_name = app_name
        self._reasoning_effort = reasoning_effort
        self._timeout_seconds = timeout_seconds
        self._requester = requester or httpx.post

    @classmethod
    def from_env(cls) -> "OpenRouterAIClient":
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY not configured")

        default_model = os.environ.get("OPENROUTER_MODEL", "").strip()
        analyze_model = (
            os.environ.get("OPENROUTER_ANALYZE_MODEL", "").strip()
            or default_model
        )
        quiz_model = (
            os.environ.get("OPENROUTER_QUIZ_MODEL", "").strip()
            or default_model
        )
        discovery_model = (
            os.environ.get("OPENROUTER_DISCOVERY_MODEL", "").strip()
            or default_model
        )
        if not all((analyze_model, quiz_model, discovery_model)):
            raise RuntimeError(
                "Configure OPENROUTER_MODEL or all of OPENROUTER_ANALYZE_MODEL, "
                "OPENROUTER_QUIZ_MODEL, and OPENROUTER_DISCOVERY_MODEL"
            )

        return cls(
            api_key=api_key,
            analyze_model=analyze_model,
            quiz_model=quiz_model,
            discovery_model=discovery_model,
            base_url=os.environ.get(
                "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
            ),
            site_url=os.environ.get("OPENROUTER_SITE_URL", ""),
            app_name=os.environ.get("OPENROUTER_APP_NAME", "Kanji Masta"),
            reasoning_effort=(
                os.environ.get("OPENROUTER_REASONING_EFFORT", "medium")
                .strip()
                .lower()
                or "medium"
            ),
            timeout_seconds=float(
                os.environ.get("OPENROUTER_TIMEOUT_SECONDS", "120")
            ),
        )

    def analyze_image(
        self,
        prompt: str,
        image_bytes: bytes,
        content_type: str,
    ) -> AIResult:
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        content: str | list[dict[str, Any]] = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{content_type};base64,{encoded_image}"
                },
            },
        ]
        return self._complete_json(content, self._analyze_model)

    def generate_quizzes(self, prompt: str) -> AIResult:
        return self._complete_json(prompt, self._quiz_model)

    def discover_words(self, prompt: str) -> AIResult:
        return self._complete_json(prompt, self._discovery_model)

    def _complete_json(
        self,
        content: str | list[dict[str, Any]],
        model: str,
    ) -> AIResult:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        if self._site_url:
            headers["HTTP-Referer"] = self._site_url
        if self._app_name:
            headers["X-OpenRouter-Title"] = self._app_name

        response = self._requester(
            f"{self._base_url}/chat/completions",
            headers=headers,
            json={
                "model": model,
                "messages": [{"role": "user", "content": content}],
                "reasoning": {"effort": self._reasoning_effort},
            },
            timeout=self._timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()

        try:
            message_content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIClientError("OpenRouter response did not contain message content") from exc

        text = _extract_text(message_content)
        return AIResult(
            data=parse_json_array(text),
            cost_microdollars=_cost_microdollars(payload.get("usage")),
            model=payload.get("model") or model,
        )


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        ]
        if text_parts:
            return "".join(text_parts)
    raise AIClientError("OpenRouter message content was not text")


def _cost_microdollars(usage: Any) -> int:
    if not isinstance(usage, dict) or usage.get("cost") is None:
        return 0
    try:
        cost = Decimal(str(usage["cost"]))
    except (ArithmeticError, ValueError) as exc:
        raise AIClientError("OpenRouter returned an invalid usage cost") from exc
    return int(
        (cost * Decimal("1000000")).to_integral_value(rounding=ROUND_HALF_UP)
    )
