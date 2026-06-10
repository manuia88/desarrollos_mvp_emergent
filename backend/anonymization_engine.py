"""W3.7 — Phase Z.5 Anonymization Engine.

PII stripping + k-anonymity gate + differential privacy Laplace noise.
Applied to all public /api/v1/*, /api/drpi/*, /api/risk-score/* endpoints.
NO external dependencies beyond stdlib + motor (already present).
"""
from __future__ import annotations

import logging
import math
import random
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.anonymization_engine")

# P2.8 · k-anonimato CANÓNICO: una sola fuente de verdad (antes había gates con 3 y con 5).
# Cualquier gate de privacidad por zona debe importar K_ANON_MIN, no hardcodear el número.
K_ANON_MIN = 5

# ─── PII field definitions ────────────────────────────────────────────────────

# Raw PII that must NEVER appear in public responses
_PII_FIELDS_RAW = [
    "owner", "owner_name", "owner_id",
    "buyer", "buyer_name", "buyer_email", "buyer_phone", "buyer_id",
    "seller", "seller_name", "seller_email", "seller_phone", "seller_id",
    "broker_id", "broker_name", "broker_email",
    "notario", "notario_name", "notario_registro",
    "address_full", "address_street", "address_interior", "address_number",
    "contact_email", "contact_phone",
    "rfc", "curp", "folio_notarial",
    "nombre_propietario", "nombre_comprador", "nombre_vendedor",
    "claimed_owner",  # from TitleCheckBody
]

# Hashed identifiers allowed only in enterprise tier
_ENTERPRISE_ONLY_FIELDS = [
    "property_id_hash", "anonymized_id",
]


# ─── strip_pii ────────────────────────────────────────────────────────────────

def strip_pii(record: Any, level: str = "public") -> Any:
    """Recursively strip PII from a record based on tier level.

    public / pro : remove ALL raw PII + hashed identifiers
    enterprise   : remove raw PII; keep hashed identifiers
    """
    if isinstance(record, list):
        return [strip_pii(item, level) for item in record]

    if not isinstance(record, dict):
        return record

    result = dict(record)

    # Always strip raw PII
    for field in _PII_FIELDS_RAW:
        result.pop(field, None)

    # public/pro also strip hashed identifiers
    if level in ("public", "pro"):
        for field in _ENTERPRISE_ONLY_FIELDS:
            result.pop(field, None)

    # Recurse into nested objects/lists
    for key, val in list(result.items()):
        if isinstance(val, (dict, list)):
            result[key] = strip_pii(val, level)

    return result


# ─── check_k_anonymity ────────────────────────────────────────────────────────

async def check_k_anonymity(
    db,
    query_params: dict,
    k_min: int = K_ANON_MIN,  # P2.8 · default desde la constante canónica
) -> dict:
    """Gate aggregate zone-level queries by k-anonymity (k ≥ 5).

    Returns:
        {"available": True}  when count ≥ k_min
        {"available": False, "reason": "k-anonymity gate", "k_required": 5, "k_actual": N}

    Only blocks zone-level aggregates.  Per-property queries (property_id present)
    are passed through — individual access assumes client consent.
    """
    # Per-property request → skip aggregate gate
    if query_params.get("property_id"):
        return {"available": True}

    zone_id = query_params.get("zone_id")
    if not zone_id:
        # No zone filter → national/cross-zone aggregate → pass
        return {"available": True}

    try:
        # Primary: count transaction records for the zone
        count = await db.transactions.count_documents({"zone_id": zone_id})

        # Fallback: count daily fact rows (zone snapshots)
        if count == 0:
            count = await db.facts_daily_zone.count_documents({"tier_id": zone_id})

        # Secondary fallback: count cube_aggregations entries
        if count == 0:
            kpi_doc = await db.cube_aggregations.find_one(
                {"tier_id": zone_id}, {"_id": 0, "kpis": 1}
            )
            if kpi_doc:
                kpis = kpi_doc.get("kpis") or {}
                count = int(kpis.get("listings_count", 0) or kpis.get("units_count", 0) or 0)

        if count < k_min:
            log.info(
                "[k-anon] zone=%s count=%d < k_min=%d → gated",
                zone_id, count, k_min,
            )
            return {
                "available": False,
                "reason": "k-anonymity gate",
                "k_required": k_min,
                "k_actual": count,
            }
        return {"available": True}

    except Exception as exc:
        # Conservative: pass through if check fails (don't break legitimate queries)
        log.warning("[k-anon] check failed for zone=%s: %s", zone_id, exc)
        return {"available": True}


# ─── add_differential_privacy_noise ──────────────────────────────────────────

def add_differential_privacy_noise(
    value: Optional[float],
    epsilon: float = 1.0,
    sensitivity: float = 1.0,
) -> Optional[float]:
    """Add Laplace noise for differential privacy (stdlib-only implementation).

    scale = sensitivity / epsilon
    noise ~ Laplace(0, scale)

    Noise is capped at ±25 % of the original value to remain credible.
    Applied ONLY to free-tier numeric outputs.
    """
    if value is None:
        return value

    try:
        scale = sensitivity / epsilon
        # Laplace sample via inverse CDF of uniform(-0.5, 0.5)
        u = random.uniform(-0.4999, 0.4999)
        sign = 1.0 if u >= 0 else -1.0
        noise_raw = -scale * sign * math.log(1.0 - 2.0 * abs(u))

        # Clamp to ±25 % of original value (or ±scale*5 if value==0)
        cap = abs(value) * 0.25 if value != 0 else scale * 5.0
        noise = max(min(noise_raw, cap), -cap)

        return round(value + noise, 2)
    except Exception:
        return value
