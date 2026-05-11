"""Wave 4 · Tests mcp_distribution_engine.py · 9 tests unidad sin DB.

Cubre funciones PURAS:
- hash_ip (LFPDPPP)
- detect_client_from_ua (5 clientes AI)
- VALID_CLIENT_TYPES / VALID_SOURCES integridad

NO testea async DB (track_mcp_adoption, stats) → require Mongo.
"""
import pytest

from mcp_distribution_engine import (
    VALID_CLIENT_TYPES,
    VALID_SOURCES,
    detect_client_from_ua,
    hash_ip,
)

pytestmark = pytest.mark.unit


# ─── detect_client_from_ua ──────────────────────────────────────────────────

def test_detect_client_claude():
    """UA con 'Claude' → claude_desktop."""
    assert detect_client_from_ua("Mozilla/5.0 Claude/1.0") == "claude_desktop"


def test_detect_client_chatgpt():
    """UA con 'chatgpt'/'openai' → chatgpt."""
    assert detect_client_from_ua("OpenAI-GPT/4") == "chatgpt"
    assert detect_client_from_ua("chatgpt-mac") == "chatgpt"


def test_detect_client_perplexity():
    """UA con 'perplexity' → perplexity."""
    assert detect_client_from_ua("Perplexity-Pro/2") == "perplexity"


def test_detect_client_cursor():
    """UA con 'cursor' → cursor."""
    assert detect_client_from_ua("Cursor-Editor/0.34") == "cursor"


def test_detect_client_windsurf():
    """UA con 'windsurf' → windsurf."""
    assert detect_client_from_ua("Windsurf/1.0") == "windsurf"


def test_detect_client_unknown_fallback():
    """UA random / vacío → unknown."""
    assert detect_client_from_ua("Mozilla/5.0 Chrome") == "unknown"
    assert detect_client_from_ua("") == "unknown"
    assert detect_client_from_ua(None) == "unknown"


# ─── hash_ip ─────────────────────────────────────────────────────────────────

def test_hash_ip_returns_32_hex():
    """hash_ip → 32 chars hex."""
    h = hash_ip("1.2.3.4")
    assert len(h) == 32
    assert all(c in "0123456789abcdef" for c in h)


def test_hash_ip_deterministic():
    """Mismo IP → mismo hash."""
    assert hash_ip("8.8.8.8") == hash_ip("8.8.8.8")


# ─── Constants integrity ─────────────────────────────────────────────────────

def test_valid_client_types_covers_5_plus_unknown():
    """VALID_CLIENT_TYPES: 5 AI clients + unknown fallback."""
    assert VALID_CLIENT_TYPES == {
        "claude_desktop", "chatgpt", "perplexity", "cursor", "windsurf", "unknown",
    }


def test_valid_sources_covers_distribution_channels():
    """VALID_SOURCES incluye canales de distribución MCP."""
    assert "anthropic_registry" in VALID_SOURCES
    assert "mcp_so" in VALID_SOURCES
    assert "organic" in VALID_SOURCES
    assert "awesome_mcp" in VALID_SOURCES
