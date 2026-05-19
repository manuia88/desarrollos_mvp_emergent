"""W5.22 Z.2 — Studio feature registry append marker.

Agrega 3 features Z.2 al FEATURE_CATALOG del motor canonico via
append-only (idempotente · no duplica · safe re-import).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.studio_feature_registry_z2")

Z2_FEATURES: List[Dict[str, Any]] = [
    {
        "key": "studio_buyer_copy",
        "name": "Studio Buyer-angle Copy",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 99,
        "requires_features": [],
    },
    {
        "key": "studio_carrusel_auto",
        "name": "Studio Carrusel Auto",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 149,
        "requires_features": [],
    },
    {
        "key": "studio_auto_content",
        "name": "Studio Auto-Content",
        "category": "marketing",
        "default_plan_tier": "enterprise",
        "monthly_price_mxn": 299,
        "requires_features": [],
    },
]


def register_z2_features() -> Dict[str, Any]:
    """Append-only: agrega Z.2 features al catalog. Idempotente."""
    try:
        import feature_flags_engine as ff
        existing_keys = {f["key"] for f in ff.FEATURE_CATALOG}
        added: List[str] = []
        for feat in Z2_FEATURES:
            if feat["key"] in existing_keys:
                continue
            ff.FEATURE_CATALOG.append(dict(feat))
            ff._BY_KEY[feat["key"]] = ff.FEATURE_CATALOG[-1]
            added.append(feat["key"])
        return {"ok": True, "added": added, "total_catalog": len(ff.FEATURE_CATALOG)}
    except Exception as exc:
        log.warning(f"[z2_registry] register failed (soft): {exc}")
        return {"ok": False, "error": str(exc)}
