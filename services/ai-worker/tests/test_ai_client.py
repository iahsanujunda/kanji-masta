import pytest

from app.ai_client import AIClientError, get_ai_client, parse_json_array
from app.openrouter import OpenRouterAIClient


def test_parse_json_array_rejects_object():
    with pytest.raises(AIClientError, match="JSON array"):
        parse_json_array('{"value": 1}')


def test_factory_selects_openrouter(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "provider/model")
    # Docker Compose passes unset optional overrides through as empty strings.
    monkeypatch.setenv("OPENROUTER_ANALYZE_MODEL", "")
    monkeypatch.setenv("OPENROUTER_QUIZ_MODEL", "")
    monkeypatch.setenv("OPENROUTER_DISCOVERY_MODEL", "")

    client = get_ai_client()

    assert isinstance(client, OpenRouterAIClient)
    assert client.provider_name == "openrouter"
    assert client._analyze_model == "provider/model"
    assert client._quiz_model == "provider/model"
    assert client._discovery_model == "provider/model"


def test_active_configuration_overrides_bootstrap_models(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "bootstrap/model")

    client = get_ai_client({
        "photoAnalysisModel": "active/photo",
        "quizGenerationModel": "active/quiz",
        "wordDiscoveryModel": "active/discovery",
    })

    assert client._analyze_model == "active/photo"
    assert client._quiz_model == "active/quiz"
    assert client._discovery_model == "active/discovery"


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "unknown")

    with pytest.raises(RuntimeError, match="Unsupported AI_PROVIDER"):
        get_ai_client()
