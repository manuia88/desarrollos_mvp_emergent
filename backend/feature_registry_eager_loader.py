"""W5.22 Z.1.1 SUB-FIX-1 · Eager loader for feature_registry.

Problem: feature_registry is populated via module-level `register_feature(...)`
calls. If a module is only imported lazily (FastAPI router lazy-load, on-demand
admin endpoint), its features stay invisible to /api/superadmin/features/catalog
until that module is hit. Result: catalog showed ~13 features instead of ~42+.

Solution: at app startup explicitly `import` every module known to register a
feature. Each import triggers `register_feature(...)` at module-load time
(idempotent thanks to W5.FF4 marker pattern).

This module is FAIL-OPEN: each import is try/except so one broken module never
breaks startup. Modules that fail to import are logged at WARNING level only.

Usage (from server.py startup hook):
    from feature_registry_eager_loader import eager_load_all_registered_features
    eager_load_all_registered_features()

NOTE: This file MUST NOT modify feature_registry.py itself · it only consumes
the public `register_feature` API which the imported modules call.
"""
from __future__ import annotations

import importlib
import logging
from typing import List, Tuple

log = logging.getLogger("dmx.feature_registry_eager_loader")

# Modules that call register_feature(...) at import-time.
# Keep this list in sync with `grep -l "register_feature" backend/`.
# Adding a new feature? Add the module here so it appears in the public catalog.
_ENGINE_MODULES: List[str] = [
    # Core engines
    "asistente_engine",
    "external_insights_engine",
    "notifications_engine",
    "probability_engine",
    "social_cards_engine",
    "widget_embed_analytics",
    "zone_score_engine",
]

_ROUTE_MODULES: List[str] = [
    # FastAPI route modules · already wired in server.py but imported here too
    # so register_feature calls fire even before the first HTTP request.
    "routes.accuracy",
    "routes.avm_public",
    "routes.battle_card",
    "routes.brochure",
    "routes.bulk_ingest",
    "routes.bulletins",
    "routes.buyer_score",
    "routes.cross_sell",
    "routes.data_licensing",
    "routes.drpi",
    "routes.entity_resolution",
    "routes.forecast_public",
    "routes.knowledge_graph",
    "routes.lead_journey",
    "routes.live_pulse",
    "routes.maps",
    "routes.marketplace_search",
    "routes.newsletter",
    "routes.partners",
    "routes.private_beta",
    "routes.studio",
    "routes.superadmin_ai_cost",
    "routes.superadmin_data_lake",
    "routes.superadmin_intelligence_hub",
    "routes.superadmin_metrics_cube",
    "routes.tour_3dgs",
    "routes.transaction_network",
    "routes.vertical_products",
    "routes.whatsapp",
]


def eager_load_all_registered_features() -> Tuple[int, int, int]:
    """Import every module that calls register_feature. FAIL-OPEN per module.

    Returns: (loaded_ok, failed, total_features_after_load)
    """
    loaded_ok = 0
    failed = 0
    failed_modules: List[str] = []

    for mod_name in _ENGINE_MODULES + _ROUTE_MODULES:
        try:
            importlib.import_module(mod_name)
            loaded_ok += 1
        except Exception as exc:
            failed += 1
            failed_modules.append(f"{mod_name}: {type(exc).__name__}")
            log.warning(
                f"[feature_registry_eager_loader] import failed {mod_name}: "
                f"{type(exc).__name__}: {str(exc)[:160]}"
            )

    total_features = 0
    try:
        import feature_registry as fr
        if hasattr(fr, "get_all_features"):
            feats = fr.get_all_features()
            total_features = len(feats) if feats else 0
        elif hasattr(fr, "FEATURE_REGISTRY"):
            total_features = len(fr.FEATURE_REGISTRY)
    except Exception as exc:
        log.warning(f"[feature_registry_eager_loader] count features failed: {exc}")

    log.info(
        f"[feature_registry_eager_loader] loaded={loaded_ok} failed={failed} "
        f"total_features={total_features}"
    )
    if failed_modules:
        log.info(
            f"[feature_registry_eager_loader] failed modules (non-fatal): "
            f"{'; '.join(failed_modules[:6])}"
            + (f" +{len(failed_modules) - 6} more" if len(failed_modules) > 6 else "")
        )

    return loaded_ok, failed, total_features
