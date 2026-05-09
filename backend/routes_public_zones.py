"""W4.2D2 — Programmatic SEO · Zone landing public endpoint.

GET /api/public/zones/{slug} → datos agregados de una colonia para landing
page programmatic SEO. Retorna IE scores summary, DRPI, Risk Score,
demographics, # desarrollos activos y comparable_zones.

Sin auth (público / SEO).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

from data_seed import COLONIAS_BY_ID

log = logging.getLogger("dmx.routes_public_zones")

router = APIRouter(prefix="/api/public/zones", tags=["public-zones"])

# Hard-coded comparable zones map (top 3 most similar by tier/alcaldía).
COMPARABLE_ZONES: Dict[str, List[str]] = {
    "polanco": ["lomas-chapultepec", "anzures", "condesa"],
    "lomas-chapultepec": ["polanco", "pedregal", "anzures"],
    "roma-norte": ["condesa", "juarez", "roma-sur"],
    "roma-sur": ["roma-norte", "condesa", "narvarte"],
    "condesa": ["roma-norte", "escandon", "juarez"],
    "juarez": ["roma-norte", "cuauhtemoc", "anzures"],
    "cuauhtemoc": ["juarez", "doctores", "roma-norte"],
    "del-valle-centro": ["napoles", "narvarte", "anzures"],
    "narvarte": ["del-valle-centro", "napoles", "doctores"],
    "napoles": ["del-valle-centro", "narvarte", "escandon"],
    "escandon": ["condesa", "anzures", "napoles"],
    "anzures": ["polanco", "juarez", "escandon"],
    "doctores": ["cuauhtemoc", "narvarte", "juarez"],
    "coyoacan-centro": ["pedregal", "del-valle-centro", "narvarte"],
    "pedregal": ["lomas-chapultepec", "coyoacan-centro", "santa-fe"],
    "santa-fe": ["pedregal", "polanco", "lomas-chapultepec"],
}


def _slug_to_zone_id(slug: str) -> str:
    """db.ie_scores uses underscores in zone_id (e.g. polanco_centro)."""
    return slug.replace("-", "_")


@router.get("/{slug}")
async def get_zone_public(slug: str, request: Request) -> Dict[str, Any]:
    """Public aggregate endpoint for /zona/{slug} programmatic SEO landing."""
    colonia = COLONIAS_BY_ID.get(slug)
    if not colonia:
        raise HTTPException(404, f"Colonia '{slug}' no encontrada")

    db = request.app.state.db

    # ── IE scores summary (real, non-stub, top 3 by value) ─────────────────────
    zone_id_alt = _slug_to_zone_id(slug)
    ie_query = {
        "$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}],
        "is_stub": False,
        "value": {"$ne": None},
    }
    real_docs = await db.ie_scores.find(
        ie_query, {"_id": 0, "code": 1, "value": 1, "tier": 1, "description": 1}
    ).to_list(length=200)
    real_count = len(real_docs)

    # Total recipes count (best-effort): avoid heavy import overhead when empty.
    try:
        from score_engine import all_recipes
        total_recipes = sum(
            1 for r in all_recipes().values() if getattr(r, "scope", "colonia") == "colonia"
        )
    except Exception:
        total_recipes = 0

    sorted_real = sorted(real_docs, key=lambda d: d.get("value") or 0, reverse=True)
    top_3 = [
        {
            "code": d.get("code"),
            "value": d.get("value"),
            "tier": d.get("tier") or "neutral",
            "description": d.get("description") or "",
        }
        for d in sorted_real[:3]
    ]

    ie_scores_summary = {
        "real_count": real_count,
        "total_recipes": total_recipes,
        "ui_mode": "real" if real_count >= 3 else "preparing",
        "top_3": top_3,
    }

    # ── DRPI snapshot (último valor disponible) ───────────────────────────────
    drpi_snap = await db.drpi_snapshots.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}], "tier": "colonia",
         "available": {"$ne": False}},
        {"_id": 0, "index_value": 1, "delta_pct": 1, "period": 1, "sample_size": 1},
        sort=[("computed_at_dt", -1)],
    )
    if drpi_snap and drpi_snap.get("index_value") is not None:
        # Convert hedonic price/m² level to MXN/m² fallback (use price_m2_num seed × index/100)
        seed_pm2 = colonia.get("price_m2_num") or 0
        idx = drpi_snap.get("index_value")
        # If index_value is in MXN (>1000), use directly; if it's an indexed number ~100,
        # apply ratio against seed.
        if idx and idx > 1000:
            current_value = round(idx)
        elif idx and seed_pm2:
            current_value = round(seed_pm2 * (idx / 100.0))
        else:
            current_value = seed_pm2
        drpi = {
            "current_value": current_value,
            "delta_30d_pct": drpi_snap.get("delta_pct"),
            "period": drpi_snap.get("period"),
            "sample_size": drpi_snap.get("sample_size"),
            "available": True,
        }
    else:
        drpi = {
            "current_value": colonia.get("price_m2_num"),
            "delta_30d_pct": None,
            "period": None,
            "sample_size": None,
            "available": False,
        }

    # ── Risk Score (último composite) ─────────────────────────────────────────
    risk_doc = await db.risk_scores_zone.find_one(
        {"$or": [{"zone_id": slug}, {"zone_id": zone_id_alt}]},
        {"_id": 0, "score_letter": 1, "score_numeric": 1, "tier": 1, "computed_at": 1},
        sort=[("computed_at", -1)],
    )
    if risk_doc and risk_doc.get("score_numeric") is not None:
        risk_score = {
            "value": risk_doc.get("score_numeric"),
            "letter": risk_doc.get("score_letter"),
            "tier": risk_doc.get("tier") or "neutral",
            "available": True,
        }
    else:
        # Fallback to seed scores.seguridad
        seg = (colonia.get("scores") or {}).get("seguridad")
        if seg is not None:
            tier = "green" if seg >= 80 else ("yellow" if seg >= 65 else "red")
            letter = "A" if seg >= 90 else ("B" if seg >= 80 else ("C" if seg >= 70 else ("D" if seg >= 60 else "E")))
            risk_score = {"value": seg, "letter": letter, "tier": tier, "available": False}
        else:
            risk_score = {"value": None, "letter": None, "tier": "unknown", "available": False}

    # ── Demographics (placeholder; real INEGI cuts arrive in Phase 7.2) ───────
    demographics = {
        "population": None,
        "households_avg_income_mxn": None,
        "available": False,
    }

    # ── Active developments count (data_developments) ─────────────────────────
    try:
        from data_developments import DEVELOPMENTS
        active_developments = sum(
            1 for d in DEVELOPMENTS if d.get("colonia_id") == slug
        )
    except Exception:
        active_developments = 0

    # ── Comparable zones ─────────────────────────────────────────────────────
    comp_slugs = COMPARABLE_ZONES.get(slug, [])
    comparable_zones = []
    for cs in comp_slugs:
        cc = COLONIAS_BY_ID.get(cs)
        if cc:
            comparable_zones.append({"slug": cs, "name": cc["name"], "alcaldia": cc.get("alcaldia")})

    return {
        "slug": slug,
        "name": colonia["name"],
        "alcaldia": colonia.get("alcaldia"),
        "tier": colonia.get("tier"),
        "ie_scores_summary": ie_scores_summary,
        "drpi": drpi,
        "risk_score": risk_score,
        "demographics": demographics,
        "active_developments": active_developments,
        "comparable_zones": comparable_zones,
    }
