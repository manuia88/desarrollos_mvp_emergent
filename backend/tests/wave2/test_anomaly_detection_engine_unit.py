"""Wave 2 · Tests anomaly_detection_engine.py · 12 tests unidad sin DB.

Cubre helpers puros (no async · no Mongo):
- _iso (timestamp ISO UTC formato/zona)
- _new_id (prefijo + entropía + unicidad)
- ANOMALY_SOURCES (tuple integrity)
- FOUNDER_ALERT_EMAIL (default fallback)

NO testea funciones async DB (detect_ai_cost_anomalies / detect_tenant_inactivity /
detect_ingestion_failures / detect_conversion_drops / detect_feature_flag_thrash /
_claude_haiku_reasoning / _maybe_email_founder / run_anomaly_detection /
schedule_anomaly_detection_cron / ensure_indexes) → require AsyncIOMotor o LlmChat.
"""
import re
from datetime import datetime, timezone

import pytest

from anomaly_detection_engine import (
    ANOMALY_SOURCES,
    FOUNDER_ALERT_EMAIL,
    _iso,
    _new_id,
)

pytestmark = pytest.mark.unit


# ─── _iso ────────────────────────────────────────────────────────────────────

def test_iso_returns_string():
    """_iso() devuelve un string ISO 8601."""
    out = _iso()
    assert isinstance(out, str)
    assert len(out) > 0


def test_iso_is_utc_timezone():
    """_iso() incluye marcador UTC (+00:00)."""
    out = _iso()
    assert out.endswith("+00:00")


def test_iso_is_parseable():
    """_iso() devuelve un string parseable por datetime.fromisoformat."""
    out = _iso()
    parsed = datetime.fromisoformat(out)
    assert parsed.tzinfo is not None
    # Debe ser UTC
    assert parsed.utcoffset().total_seconds() == 0


def test_iso_close_to_now():
    """_iso() devuelve un timestamp dentro de los últimos 5s."""
    before = datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(_iso())
    after = datetime.now(timezone.utc)
    assert before <= parsed <= after


# ─── _new_id ─────────────────────────────────────────────────────────────────

def test_new_id_has_anom_prefix():
    """_new_id() siempre empieza con 'anom_'."""
    nid = _new_id()
    assert nid.startswith("anom_")


def test_new_id_has_token_suffix():
    """_new_id() incluye token urlsafe (~13-14 chars) tras el prefijo."""
    nid = _new_id()
    suffix = nid[len("anom_"):]
    # token_urlsafe(10) genera ~14 chars base64url
    assert len(suffix) >= 10
    # Solo chars urlsafe: alfanuméricos + - + _
    assert re.match(r"^[A-Za-z0-9_\-]+$", suffix)


def test_new_id_is_unique_per_call():
    """_new_id() devuelve valores únicos en llamadas sucesivas."""
    ids = {_new_id() for _ in range(200)}
    # 200 IDs únicos garantizan colision-free para secrets.token_urlsafe(10)
    assert len(ids) == 200


def test_new_id_is_string():
    """_new_id() siempre devuelve string."""
    assert isinstance(_new_id(), str)


# ─── ANOMALY_SOURCES integrity ───────────────────────────────────────────────

def test_anomaly_sources_is_tuple():
    """ANOMALY_SOURCES es tuple (immutable)."""
    assert isinstance(ANOMALY_SOURCES, tuple)


def test_anomaly_sources_expected_values():
    """ANOMALY_SOURCES contiene exactamente las 5 fuentes esperadas."""
    expected = {"ai_cost", "tenant_activity", "metrics_cube", "ingestion", "conversion"}
    assert set(ANOMALY_SOURCES) == expected


def test_anomaly_sources_has_no_duplicates():
    """ANOMALY_SOURCES no tiene duplicados."""
    assert len(ANOMALY_SOURCES) == len(set(ANOMALY_SOURCES))


# ─── FOUNDER_ALERT_EMAIL default ─────────────────────────────────────────────

def test_founder_alert_email_is_non_empty_string():
    """FOUNDER_ALERT_EMAIL es string no vacío con formato email."""
    assert isinstance(FOUNDER_ALERT_EMAIL, str)
    assert "@" in FOUNDER_ALERT_EMAIL
    assert len(FOUNDER_ALERT_EMAIL) > 0
