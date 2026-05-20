"""W5.22 Z.8 — Studio feature registry append marker (Landing Pages).

Agrega 3 features Z.8 al FEATURE_CATALOG via append-only (idempotente).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.studio_feature_registry_z8")

Z8_FEATURES: List[Dict[str, Any]] = [
    {
        "key": "studio_landings",
        "name": "Studio Landings Pro",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 199,
        "requires_features": [],
    },
    {
        "key": "studio_landings_ab",
        "name": "Studio Landings A/B",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 0,
        "requires_features": ["studio_landings"],
    },
    {
        "key": "studio_landings_pdf",
        "name": "Studio Landings PDF Brochure",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 0,
        "requires_features": ["studio_landings"],
    },
]


def register_z8_features() -> Dict[str, Any]:
    """Append-only: agrega Z.8 features al catalog. Idempotente."""
    try:
        import feature_flags_engine as ff
        existing_keys = {f["key"] for f in ff.FEATURE_CATALOG}
        added: List[str] = []
        for feat in Z8_FEATURES:
            if feat["key"] in existing_keys:
                continue
            ff.FEATURE_CATALOG.append(dict(feat))
            ff._BY_KEY[feat["key"]] = ff.FEATURE_CATALOG[-1]
            added.append(feat["key"])
        return {"ok": True, "added": added, "total_catalog": len(ff.FEATURE_CATALOG)}
    except Exception as exc:
        log.warning(f"[z8_registry] register failed (soft): {exc}")
        return {"ok": False, "error": str(exc)}
