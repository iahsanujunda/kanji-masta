import base64
import json
from unittest.mock import MagicMock

import pytest

from app.ai_client import AIClientError
from app.openrouter import OpenRouterAIClient


def _response(content, *, cost=0.012345, model="actual/model"):
    response = MagicMock()
    response.json.return_value = {
        "model": model,
        "choices": [{"message": {"content": content}}],
        "usage": {"cost": cost},
    }
    return response


def _client(requester):
    return OpenRouterAIClient(
        api_key="test-key",
        analyze_model="vision/model",
        quiz_model="quiz/model",
        discovery_model="discovery/model",
        site_url="https://shuukanhq.com",
        requester=requester,
    )


def test_analyze_image_sends_base64_multimodal_request():
    requester = MagicMock(return_value=_response('[{"character":"日"}]'))
    client = _client(requester)

    result = client.analyze_image("find kanji", b"image-bytes", "image/jpeg")

    assert result.data == [{"character": "日"}]
    assert result.cost_microdollars == 12_345
    assert result.model == "actual/model"

    _, kwargs = requester.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer test-key"
    assert kwargs["headers"]["HTTP-Referer"] == "https://shuukanhq.com"
    assert kwargs["json"]["model"] == "vision/model"
    assert kwargs["json"]["reasoning"] == {"effort": "medium"}
    content = kwargs["json"]["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "find kanji"}
    assert content[1]["image_url"]["url"] == (
        "data:image/jpeg;base64," + base64.b64encode(b"image-bytes").decode("ascii")
    )


@pytest.mark.parametrize(
    ("method", "expected_model"),
    [
        ("generate_quizzes", "quiz/model"),
        ("discover_words", "discovery/model"),
    ],
)
def test_text_operations_use_task_specific_models(method, expected_model):
    requester = MagicMock(return_value=_response(json.dumps(["value"]), cost="0.1"))
    client = _client(requester)

    result = getattr(client, method)("prompt")

    assert result.data == ["value"]
    assert result.cost_microdollars == 100_000
    assert requester.call_args.kwargs["json"]["model"] == expected_model
    assert requester.call_args.kwargs["json"]["messages"][0]["content"] == "prompt"


def test_missing_message_content_is_reported():
    response = MagicMock()
    response.json.return_value = {"choices": []}
    client = _client(MagicMock(return_value=response))

    with pytest.raises(AIClientError, match="message content"):
        client.generate_quizzes("prompt")


def test_non_array_json_is_rejected():
    client = _client(MagicMock(return_value=_response('{"value": 1}')))

    with pytest.raises(AIClientError, match="JSON array"):
        client.discover_words("prompt")


def test_rejects_unknown_reasoning_effort():
    with pytest.raises(ValueError, match="reasoning effort"):
        OpenRouterAIClient(
            api_key="test-key",
            analyze_model="model",
            quiz_model="model",
            discovery_model="model",
            reasoning_effort="extreme",
        )
