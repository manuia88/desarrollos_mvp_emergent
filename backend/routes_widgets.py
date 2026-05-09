"""W4.2.5 — Embeddable widgets endpoints.

CORS habilitado para que cualquier blog/journal pueda hacer fetch desde su origen.
Cada embed = backlink a desarrollosmx.io = compounding domain authority.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from data_seed import COLONIAS_BY_ID

log = logging.getLogger("dmx.routes_widgets")

router = APIRouter(prefix="/api/widgets", tags=["public-widgets"])

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",  # 5 min CDN cache
}


def _slug_to_zone_id(slug: str) -> str:
    return slug.replace("-", "_")


@router.options("/score/{slug}")
@router.options("/risk/{slug}")
async def widget_preflight(slug: str) -> Response:
    return Response(status_code=204, headers=CORS_HEADERS)


@router.get("/score/{slug}")
async def widget_score(slug: str, request: Request) -> JSONResponse:
    """Compact score widget data: IE avg, DRPI, Risk tier."""
    colonia = COLONIAS_BY_ID.get(slug)
    if not colonia:
        raise HTTPException(404, f"Colonia '{slug}' no encontrada")

    db = request.app.state.db
    zone_id_alt = _slug_to_zone_id(slug)
    ie_q = {
        "$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}],
        "is_stub": False,
        "value": {"$ne": None},
    }
    ie_docs = await db.ie_scores.find(ie_q, {"_id": 0, "value": 1}).to_list(length=200)
    ie_values = [d.get("value") for d in ie_docs if d.get("value") is not None]
    ie_avg = round(sum(ie_values) / len(ie_values), 1) if ie_values else None

    drpi_snap = await db.drpi_snapshots.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}], "tier": "colonia",
         "available": {"$ne": False}},
        {"_id": 0, "index_value": 1, "delta_pct": 1},
        sort=[("computed_at_dt", -1)],
    )
    drpi_value = None
    drpi_delta = None
    if drpi_snap and drpi_snap.get("index_value") is not None:
        seed_pm2 = colonia.get("price_m2_num") or 0
        idx = drpi_snap["index_value"]
        if idx > 1000:
            drpi_value = round(idx)
        elif seed_pm2:
            drpi_value = round(seed_pm2 * (idx / 100.0))
        drpi_delta = drpi_snap.get("delta_pct")

    risk_doc = await db.risk_scores_zone.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}]},
        {"_id": 0, "score_letter": 1, "tier": 1, "score_numeric": 1},
        sort=[("computed_at", -1)],
    )
    risk_letter = (risk_doc or {}).get("score_letter")
    risk_tier = (risk_doc or {}).get("tier")
    # Derive tier from letter when stored doc has no tier (mirrors risk endpoint).
    if not risk_tier and risk_letter:
        risk_tier = {
            "A": "green", "B": "green",
            "C": "yellow", "D": "yellow",
            "E": "red",
        }.get(risk_letter[0].upper(), "neutral")
    risk_tier = risk_tier or "unknown"

    payload: Dict[str, Any] = {
        "slug": slug,
        "zone_name": colonia["name"],
        "alcaldia": colonia.get("alcaldia"),
        "ie_score_avg": ie_avg,
        "ie_sample_size": len(ie_values),
        "drpi_value": drpi_value,
        "drpi_delta_30d_pct": drpi_delta,
        "risk_tier": risk_tier,
        "risk_letter": risk_letter,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "deep_link": f"https://desarrollosmx.io/zona/{slug}",
        "powered_by": "DesarrollosMX",
    }
    return JSONResponse(payload, headers=CORS_HEADERS)


@router.get("/risk/{slug}")
async def widget_risk(slug: str, request: Request) -> JSONResponse:
    """Compact risk widget data: tier, letter, sources count."""
    colonia = COLONIAS_BY_ID.get(slug)
    if not colonia:
        raise HTTPException(404, f"Colonia '{slug}' no encontrada")

    db = request.app.state.db
    zone_id_alt = _slug_to_zone_id(slug)

    risk_doc = await db.risk_scores_zone.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}]},
        {"_id": 0, "score_letter": 1, "score_numeric": 1, "tier": 1,
         "computed_at": 1, "sources": 1},
        sort=[("computed_at", -1)],
    )

    if risk_doc and risk_doc.get("score_numeric") is not None:
        risk_value = risk_doc.get("score_numeric")
        risk_letter = risk_doc.get("score_letter")
        risk_tier = risk_doc.get("tier") or "neutral"
        sources_count = len(risk_doc.get("sources") or []) or 4  # SESNSP+CENAPRED+ENVIPE+title
        available = True
        last_updated = risk_doc.get("computed_at") or datetime.now(timezone.utc).isoformat()
    else:
        seg = (colonia.get("scores") or {}).get("seguridad")
        if seg is not None:
            risk_value = seg
            risk_tier = "green" if seg >= 80 else ("yellow" if seg >= 65 else "red")
            risk_letter = "A" if seg >= 90 else ("B" if seg >= 80 else ("C" if seg >= 70 else ("D" if seg >= 60 else "E")))
            sources_count = 3
            available = False
            last_updated = datetime.now(timezone.utc).isoformat()
        else:
            risk_value = None
            risk_tier = "unknown"
            risk_letter = None
            sources_count = 0
            available = False
            last_updated = datetime.now(timezone.utc).isoformat()

    payload: Dict[str, Any] = {
        "slug": slug,
        "zone_name": colonia["name"],
        "alcaldia": colonia.get("alcaldia"),
        "risk_tier": risk_tier,
        "risk_letter": risk_letter,
        "risk_score": risk_value,
        "sources_count": sources_count,
        "available": available,
        "last_updated": last_updated,
        "deep_link": f"https://desarrollosmx.io/zona/{slug}",
        "powered_by": "DesarrollosMX",
    }
    return JSONResponse(payload, headers=CORS_HEADERS)
