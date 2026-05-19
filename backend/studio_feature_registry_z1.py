"""W5.22 Z.1 — Studio feature registry append marker.

NO modifica feature_registry.py (no existe) ni feature_flags_engine.py.
Solo agrega 3 features Z.1 al FEATURE_CATALOG del motor canonico via
append-only (idempotente · no duplica · safe re-import).

Llamado una sola vez en server.py startup.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.studio_feature_registry_z1")

Z1_FEATURES: List[Dict[str, Any]] = [
    {
        "key": "studio_brand_kit",
        "name": "Studio Brand Kit",
        "category": "marketing",
        "default_plan_tier": "free",
        "monthly_price_mxn": 0,
        "requires_features": [],
    },
    {
        "key": "studio_listing_importer",
        "name": "Studio Listing Importer",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 149,
        "requires_features": [],
    },
    {
        "key": "studio_asset_library",
        "name": "Studio Asset Library",
        "category": "marketing",
        "default_plan_tier": "pro",
        "monthly_price_mxn": 99,
        "requires_features": [],
    },
]


def register_z1_features() -> Dict[str, Any]:
    """Append-only: agrega Z.1 features al catalog. Idempotente."""
    try:
        import feature_flags_engine as ff
        existing_keys = {f["key"] for f in ff.FEATURE_CATALOG}
        added: List[str] = []
        for feat in Z1_FEATURES:
            if feat["key"] in existing_keys:
                continue
            ff.FEATURE_CATALOG.append(dict(feat))
            ff._BY_KEY[feat["key"]] = ff.FEATURE_CATALOG[-1]
            added.append(feat["key"])
        return {"ok": True, "added": added, "total_catalog": len(ff.FEATURE_CATALOG)}
    except Exception as exc:
        log.warning(f"[z1_registry] register failed (soft): {exc}")
        return {"ok": False, "error": str(exc)}
