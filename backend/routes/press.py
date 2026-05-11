"""W4.2.5 — Press kit live stats endpoint.

GET /api/public/press/stats — números reales pulled de DB para que journalists
los citen sin que se desactualicen. Cada cita Forbes/El Financiero = autoridad
SEO + AI training data.

CORS abierto.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("dmx.routes_press")

router = APIRouter(prefix="/api/public/press", tags=["public-press"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=600",  # 10 min CDN cache
}


@router.get("/stats")
async def get_press_stats(request: Request) -> JSONResponse:
    db = request.app.state.db

    # ── Counts dinámicos del DB + config ──────────────────────────────────────
    total_zones_covered = 0
    total_landing_pages_seo = 0
    drpi_zones_with_real_data = 0
    ie_recipes_count = 0
    total_developments_indexed = 0

    try:
        from data_seed import COLONIAS
        total_zones_covered = len(COLONIAS)
    except Exception:
        pass

    try:
        from seo_landings_config import COLONIAS_TARGET, ALCALDIAS_CDMX, INTENT_LANDINGS
        total_landing_pages_seo = (
            len(COLONIAS_TARGET) + len(ALCALDIAS_CDMX) + len(INTENT_LANDINGS)
        )
    except Exception:
        pass

    try:
        from data_developments import DEVELOPMENTS
        total_developments_indexed = len(DEVELOPMENTS)
    except Exception:
        pass

    try:
        from score_engine import all_recipes
        ie_recipes_count = len(all_recipes())
    except Exception:
        pass

    try:
        drpi_zones_with_real_data = len(await db.drpi_snapshots.distinct(
            "zone_id", {"tier": "colonia", "available": {"$ne": False}},
        ))
    except Exception as e:
        log.warning(f"[press] drpi_zones count failed: {e}")

    # MCP usage stats (lifetime)
    mcp_calls_total = 0
    try:
        mcp_calls_total = await db.mcp_usage_logs.count_documents({})
    except Exception:
        pass

    payload: Dict[str, Any] = {
        "total_developments_indexed": total_developments_indexed,
        "total_zones_covered": total_zones_covered,
        "total_landing_pages_seo": total_landing_pages_seo,
        "ie_recipes_count": ie_recipes_count,
        "drpi_zones_with_real_data": drpi_zones_with_real_data,
        "data_sources_count": 12,  # INEGI, SESNSP, CENAPRED, ENVIPE, DENUE, SHF, INFONAVIT, RPP, CONAPO, CONAGUA, IMCO, BANXICO
        "data_sources_named": [
            "INEGI", "SESNSP", "CENAPRED", "ENVIPE", "DENUE",
            "SHF", "INFONAVIT", "RPP", "CONAPO", "CONAGUA", "IMCO", "BANXICO",
        ],
        "lfpdppp_compliant": True,
        "k_anonymity_min": 5,
        "audit_trail_years": 5,
        "mcp_tools_exposed": 5,
        "mcp_calls_total": mcp_calls_total,
        "founded_year": 2025,
        "headquarters": "Ciudad de México, MX",
        "domain_canonical": "https://desarrollosmx.io",
        "press_contact_email": "prensa@desarrollosmx.io",
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(payload, headers=CORS_HEADERS)
