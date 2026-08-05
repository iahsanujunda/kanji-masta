import pytest

from app.ai_client import AIClientError, get_ai_client, parse_json_array
from app.openrouter import OpenRouterAIClient


def test_parse_json_array_rejects_object():
    with pytest.raises(AIClientError, match="JSON array"):
        parse_json_array('{"value": 1}')


def test_factory_selects_openrouter(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    client = get_ai_client({
        "photoAnalysisModel": "provider/photo",
        "quizGenerationModel": "provider/quiz",
        "wordDiscoveryModel": "provider/discovery",
    })

    assert isinstance(client, OpenRouterAIClient)
    assert client.provider_name == "openrouter"
    assert client._analyze_model == "provider/photo"
    assert client._quiz_model == "provider/quiz"
    assert client._discovery_model == "provider/discovery"


def test_legacy_model_environment_variables_are_not_a_fallback(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "legacy/default")
    monkeypatch.setenv("OPENROUTER_ANALYZE_MODEL", "legacy/photo")
    monkeypatch.setenv("OPENROUTER_QUIZ_MODEL", "legacy/quiz")
    monkeypatch.setenv("OPENROUTER_DISCOVERY_MODEL", "legacy/discovery")

    with pytest.raises(RuntimeError, match="active database model configuration"):
        get_ai_client()


def test_gemini_uses_database_models_and_ignores_model_environment(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_ANALYZE_MODEL", "legacy/photo")
    monkeypatch.setenv("GEMINI_QUIZ_MODEL", "legacy/quiz")
    monkeypatch.setenv("GEMINI_DISCOVERY_MODEL", "legacy/discovery")

    client = get_ai_client({
        "photoAnalysisModel": "database/photo",
        "quizGenerationModel": "database/quiz",
        "wordDiscoveryModel": "database/discovery",
    })

    assert client._analyze_model == "database/photo"
    assert client._quiz_model == "database/quiz"
    assert client._discovery_model == "database/discovery"


def test_gemini_requires_active_database_configuration(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_ANALYZE_MODEL", "legacy/photo")
    monkeypatch.setenv("GEMINI_QUIZ_MODEL", "legacy/quiz")
    monkeypatch.setenv("GEMINI_DISCOVERY_MODEL", "legacy/discovery")

    with pytest.raises(RuntimeError, match="active database model configuration"):
        get_ai_client()


def test_factory_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "unknown")

    with pytest.raises(RuntimeError, match="Unsupported AI_PROVIDER"):
        get_ai_client()
