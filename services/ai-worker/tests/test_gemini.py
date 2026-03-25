"""Unit tests for Gemini response parsing and cost calculation."""
from unittest.mock import MagicMock

from app.gemini import calculate_cost_microdollars


def test_cost_calculation_basic():
    usage = MagicMock()
    usage.prompt_token_count = 1_000_000  # 1M input tokens
    usage.candidates_token_count = 100_000  # 100K output tokens

    cost = calculate_cost_microdollars(usage)
    # Input: 1M * $2.50/1M = $2.50 = 2,500,000 microdollars
    # Output: 100K * $15.00/1M = $1.50 = 1,500,000 microdollars
    # Total: $4.00 = 4,000,000 microdollars
    assert cost == 4_000_000


def test_cost_calculation_zero():
    usage = MagicMock()
    usage.prompt_token_count = 0
    usage.candidates_token_count = 0
    assert calculate_cost_microdollars(usage) == 0


def test_cost_calculation_none():
    assert calculate_cost_microdollars(None) == 0


def test_cost_calculation_small():
    usage = MagicMock()
    usage.prompt_token_count = 1000  # 1K tokens
    usage.candidates_token_count = 500

    cost = calculate_cost_microdollars(usage)
    # Input: 1000 * $2.50/1M = $0.0025 = 2500 microdollars
    # Output: 500 * $15.00/1M = $0.0075 = 7500 microdollars
    # Total: $0.01 = 10000 microdollars
    assert cost == 10_000
