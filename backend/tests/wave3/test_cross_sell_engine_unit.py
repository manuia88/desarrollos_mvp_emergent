"""Wave 3 · Tests cross_sell_engine.py · 12 tests unidad sin DB.

Cubre helpers puros (no Mongo · sólo predict_propensity_cold_start es async pero no toca DB):
- _iso (timestamp ISO UTC)
- _new_id (prefijo + entropía + unicidad)
- _hash_id (sha256 → 24 chars hex)
- verify_webhook_hmac (HMAC-SHA256 + compare_digest)
- predict_propensity_cold_start (heurísticas por partner_type · NO ML · NO DB)
- PARTNER_TYPES / OFFER_STATUSES / FUNNEL_STAGES (constants integrity)

NO testea funciones async DB (ensure_indexes / seed_initial_partners / seed_demo_offers /
match_offers / track_offer_event / send_lead_to_partner / send_buyer_confirmation_email /
record_revenue_event / compute_funnel_analytics) → require AsyncIOMotor + httpx + Resend.
"""
import re
from datetime import datetime

import pytest

from cross_sell_engine import (
    FUNNEL_STAGES,
    OFFER_STATUSES,
    PARTNER_TYPES,
    _hash_id,
    _iso,
    _new_id,
    predict_propensity_cold_start,
    verify_webhook_hmac,
)

pytestmark = pytest.mark.unit


# ─── _iso / _new_id / _hash_id ──────────────────────────────────────────────

def test_iso_returns_utc_iso_string():
    """_iso() devuelve string ISO 8601 con marcador UTC."""
    out = _iso()
    assert isinstance(out, str)
    assert out.endswith("+00:00")
    parsed = datetime.fromisoformat(out)
    assert parsed.utcoffset().total_seconds() == 0


def test_new_id_default_prefix_p():
    """_new_id() usa 'p_' por default (override per call e.g. 'prt', 'off', 'rev')."""
    nid = _new_id()
    assert nid.startswith("p_")
    suffix = nid[len("p_"):]
    assert len(suffix) >= 8
    assert re.match(r"^[A-Za-z0-9_\-]+$", suffix)


def test_new_id_custom_prefixes():
    """_new_id(prefix) respeta prefijos canónicos del engine."""
    assert _new_id("prt").startswith("prt_")
    assert _new_id("off").startswith("off_")
    assert _new_id("rev").startswith("rev_")


def test_new_id_unique_per_call():
    """_new_id() devuelve valores únicos en 200 llamadas."""
    ids = {_new_id() for _ in range(200)}
    assert len(ids) == 200


def test_hash_id_24_chars_hex():
    """_hash_id() devuelve string hex de 24 chars."""
    h = _hash_id("buyer_001")
    assert isinstance(h, str)
    assert len(h) == 24
    assert re.match(r"^[0-9a-f]+$", h)


def test_hash_id_deterministic():
    """_hash_id() es determinista para mismo input."""
    assert _hash_id("buyer_001") == _hash_id("buyer_001")
    assert _hash_id("aaa") != _hash_id("bbb")


# ─── verify_webhook_hmac ────────────────────────────────────────────────────

def test_verify_webhook_hmac_valid_signature():
    """verify_webhook_hmac() acepta firma HMAC-SHA256 válida."""
    import hashlib
    import hmac
    secret = "test_secret"
    body = b'{"event":"closed"}'
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_webhook_hmac(secret, body, sig) is True


def test_verify_webhook_hmac_rejects_invalid():
    """verify_webhook_hmac() rechaza firma inválida."""
    body = b'{"event":"closed"}'
    assert verify_webhook_hmac("test_secret", body, "deadbeef" * 8) is False


def test_verify_webhook_hmac_rejects_empty_sig():
    """verify_webhook_hmac() rechaza signature vacío."""
    body = b'{"event":"closed"}'
    assert verify_webhook_hmac("test_secret", body, "") is False


def test_verify_webhook_hmac_rejects_wrong_secret():
    """verify_webhook_hmac() rechaza si secret distinto del que firmó."""
    import hashlib
    import hmac
    body = b'{"event":"x"}'
    sig = hmac.new(b"secret_a", body, hashlib.sha256).hexdigest()
    assert verify_webhook_hmac("secret_b", body, sig) is False


# ─── predict_propensity_cold_start ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_propensity_mortgage_high_when_budget_below_price():
    """mortgage_broker → 0.70 si budget>0 y price>0 y budget<price."""
    pytest.importorskip("pytest_asyncio")
    score = await predict_propensity_cold_start(
        None,
        {"budget": 3_000_000},
        "mortgage_broker",
        {"price": 5_000_000},
    )
    assert score == pytest.approx(0.70)


@pytest.mark.asyncio
async def test_propensity_mortgage_low_when_budget_zero():
    """mortgage_broker → 0.45 si falta budget o price."""
    pytest.importorskip("pytest_asyncio")
    score = await predict_propensity_cold_start(
        None, {}, "mortgage_broker", {"price": 5_000_000},
    )
    assert score == pytest.approx(0.45)


@pytest.mark.asyncio
async def test_propensity_insurance_constant():
    """insurance_broker → 0.40 constante (heurística cold-start)."""
    pytest.importorskip("pytest_asyncio")
    score = await predict_propensity_cold_start(None, {}, "insurance_broker", {})
    assert score == pytest.approx(0.40)


@pytest.mark.asyncio
async def test_propensity_notaria_high_at_offer_stage():
    """notaria → 0.60 si stage in (offer_made, in_escrow, closing)."""
    pytest.importorskip("pytest_asyncio")
    for stage in ("offer_made", "in_escrow", "closing"):
        score = await predict_propensity_cold_start(
            None, {"stage": stage}, "notaria", {},
        )
        assert score == pytest.approx(0.60), f"stage={stage}"


@pytest.mark.asyncio
async def test_propensity_notaria_low_when_searching():
    """notaria → 0.35 si stage 'searching' (default)."""
    pytest.importorskip("pytest_asyncio")
    score = await predict_propensity_cold_start(None, {}, "notaria", {})
    assert score == pytest.approx(0.35)


@pytest.mark.asyncio
async def test_propensity_unknown_partner_type_default():
    """partner_type desconocido → fallback 0.20."""
    pytest.importorskip("pytest_asyncio")
    score = await predict_propensity_cold_start(None, {}, "unknown_xyz", {})
    assert score == pytest.approx(0.20)


# ─── Constants integrity ────────────────────────────────────────────────────

def test_partner_types_six_canonical():
    """PARTNER_TYPES expone exactamente 6 tipos canónicos."""
    expected = {"mortgage_broker", "insurance_broker", "notaria",
                "avaluo", "moving", "construction"}
    assert PARTNER_TYPES == expected


def test_offer_statuses_lifecycle_complete():
    """OFFER_STATUSES cubre el lifecycle completo de un offer."""
    expected = {"presented", "clicked", "lead_captured", "sent_to_partner",
                "partner_contacted_buyer", "in_process", "approved", "closed",
                "rejected", "expired"}
    assert OFFER_STATUSES == expected


def test_funnel_stages_ordered_subset():
    """FUNNEL_STAGES ordena 6 etapas analíticas (subset OFFER_STATUSES)."""
    assert FUNNEL_STAGES == [
        "presented", "clicked", "lead_captured", "sent_to_partner",
        "partner_contacted_buyer", "closed",
    ]
    # Cada stage debe ser un offer_status válido
    for stage in FUNNEL_STAGES:
        assert stage in OFFER_STATUSES
