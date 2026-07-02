"""Wave 4 · Tests banxico_engine.py · 10 tests unidad sin DB.

Cubre constantes y funciones puras BANXICO SIE engine:
- BANXICO_BASE_URL canonical
- DAILY_SERIES / MONTHLY_SERIES / ALL_SERIES catalog integrity
- TTL_DAYS = 7
- _now() timezone-aware UTC
- BanxicoEngine.__init__ (token resolution BANXICO_TOKEN > IE_BANXICO_TOKEN > "")

Funciones async (fetch_from_source · persist_to_cache · lookup · stats ·
run_banxico_daily_cron) → diferidas a integration tests (necesitan httpx mocks +
mongomock).

NO modifica código existente · solo lectura.
"""
from datetime import datetime

import pytest

from data_sources.banxico_engine import (
    ALL_SERIES,
    BANXICO_BASE_URL,
    DAILY_SERIES,
    MONTHLY_SERIES,
    TTL_DAYS,
    BanxicoEngine,
    _now,
)

pytestmark = pytest.mark.unit


# ─── 1. URL canonical ────────────────────────────────────────────────────────


def test_banxico_base_url_canonical():
    """SIE API endpoint oficial."""
    assert BANXICO_BASE_URL == (
        "https://www.banxico.org.mx/SieAPIRest/service/v1/series"
    )


# ─── 2. Daily series catalog ─────────────────────────────────────────────────


def test_daily_series_catalog():
    """USD/MXN · UDI · TIIE28d (3 series diarias)."""
    assert DAILY_SERIES == ["SF43718", "SP68257", "SF43783"]
    assert len(DAILY_SERIES) == 3


# ─── 3. Monthly series catalog ───────────────────────────────────────────────


def test_monthly_series_catalog():
    """Hipotecaria CF303 · INPC SP1 (2 series mensuales)."""
    assert MONTHLY_SERIES == ["CF303", "SP1"]
    assert len(MONTHLY_SERIES) == 2


# ─── 4. ALL_SERIES union ─────────────────────────────────────────────────────


def test_all_series_is_union_daily_monthly():
    """ALL_SERIES = DAILY + MONTHLY · 5 total · sin duplicados."""
    assert ALL_SERIES == DAILY_SERIES + MONTHLY_SERIES
    assert len(ALL_SERIES) == 5
    assert len(set(ALL_SERIES)) == 5  # no duplicates


# ─── 5. Series IDs son strings válidos ───────────────────────────────────────


def test_series_ids_format():
    """Series IDs BANXICO siguen patrón alfanumérico mayúsculas."""
    for sid in ALL_SERIES:
        assert isinstance(sid, str)
        assert sid.isupper() or any(c.isdigit() for c in sid)
        assert len(sid) >= 3


# ─── 6. TTL constant ─────────────────────────────────────────────────────────


def test_ttl_days_is_seven():
    """Cache TTL 7d per W4.18 spec."""
    assert TTL_DAYS == 7
    assert isinstance(TTL_DAYS, int)


# ─── 7. _now() returns timezone-aware UTC ────────────────────────────────────


def test_now_returns_utc_aware():
    """_now() ALWAYS retorna UTC tz-aware (Mongo compatible)."""
    t = _now()
    assert isinstance(t, datetime)
    assert t.tzinfo is not None
    assert t.utcoffset().total_seconds() == 0


# ─── 8. Engine init prefiere BANXICO_TOKEN ──────────────────────────────────


def test_engine_init_prefers_banxico_token(monkeypatch):
    """W4.18 spec: BANXICO_TOKEN > IE_BANXICO_TOKEN fallback."""
    monkeypatch.setenv("BANXICO_TOKEN", "primary_tok")
    monkeypatch.setenv("IE_BANXICO_TOKEN", "fallback_tok")
    eng = BanxicoEngine(db=None)
    assert eng.token == "primary_tok"


# ─── 9. Engine init usa fallback IE_BANXICO_TOKEN ───────────────────────────


def test_engine_init_fallback_ie_token(monkeypatch):
    """Si BANXICO_TOKEN no existe · usa IE_BANXICO_TOKEN."""
    monkeypatch.delenv("BANXICO_TOKEN", raising=False)
    monkeypatch.setenv("IE_BANXICO_TOKEN", "legacy_tok")
    eng = BanxicoEngine(db=None)
    assert eng.token == "legacy_tok"


# ─── 10. Engine init sin tokens → empty string ──────────────────────────────


def test_engine_init_no_tokens(monkeypatch):
    """Sin ambos tokens · token = '' (engine retorna [] graceful)."""
    monkeypatch.delenv("BANXICO_TOKEN", raising=False)
    monkeypatch.delenv("IE_BANXICO_TOKEN", raising=False)
    eng = BanxicoEngine(db=None)
    assert eng.token == ""
