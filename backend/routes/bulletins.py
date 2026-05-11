"""W3.3 ZZ.3 — Bulletins Routes (public + superadmin).

Public:
  GET  /api/bulletins/{slug}/{period}        — HTML page payload
  GET  /api/bulletins/{slug}/{period}/pdf    — stream PDF download
  GET  /api/public/methodology               — methodology snapshot

Superadmin:
  GET  /api/superadmin/bulletins/list
  POST /api/superadmin/bulletins/generate    — manual trigger
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

import bulletins_engine as bulletins
import drpi_engine as drpi

log = logging.getLogger("dmx.routes_bulletins")

router = APIRouter(tags=["bulletins"])

PDF_DIR = bulletins.PDF_DIR


def _db(request: Request):
    return request.app.state.db


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


# ══════════════════════════════════════════════════════════════════════════════
# 1. PUBLIC — bulletin HTML page
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/bulletins/{slug}/{period}")
async def public_bulletin(slug: str, period: str, request: Request):
    db = _db(request)
    if slug == "general":
        q = {"type": "general", "period": period}
    else:
        q = {"type": "zone", "slug": slug, "period": period}
    bul = await db.dmx_bulletins.find_one(q, {"_id": 0})
    if not bul:
        raise HTTPException(404, "Boletín no disponible")
    return bul


# ══════════════════════════════════════════════════════════════════════════════
# 2. PUBLIC — PDF download
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/bulletins/{slug}/{period}/pdf")
async def public_bulletin_pdf(slug: str, period: str, request: Request):
    filename = f"{slug}_{period}.pdf"
    path = os.path.join(PDF_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(404, "PDF no disponible")
    return FileResponse(
        path, media_type="application/pdf",
        filename=f"DMX_Boletin_{slug}_{period}.pdf",
    )


# ══════════════════════════════════════════════════════════════════════════════
# 3. PUBLIC — methodology snapshot
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/public/methodology")
async def public_methodology(request: Request):
    db = _db(request)

    # DRPI methodology summary
    drpi_meta = {
        "name": "DRPI · DMX Residential Price Index",
        "method": "Hedonic regression OLS (statsmodels)",
        "variables": [
            "m2", "recamaras", "baños", "year_built", "floor",
            "proximity_metro_m", "denue_density", "construction_cost_index",
        ],
        "categorical": ["view", "orientation"],
        "min_sample_size": 30,
        "training_window_days": 180,
        "frequency": "mensual (cron 1ro mes 06:00 MX)",
        "base_index": 100.0,
        "version": drpi.FORMULA_VERSION,
    }

    # Most recent national + sample stats
    period = drpi._period_now()
    nat = await drpi.compute_drpi_national(db, period)

    # Range of R² across recent zones
    cursor = db.drpi_snapshots.find(
        {"available": True, "r_squared": {"$ne": None}},
        {"_id": 0, "r_squared": 1, "sample_size": 1},
    ).limit(500)
    recent = [s async for s in cursor]
    r_sq_values = [s["r_squared"] for s in recent if isinstance(s.get("r_squared"), (int, float))]
    r_sq_summary = {}
    if r_sq_values:
        r_sq_summary = {
            "min": round(min(r_sq_values), 3),
            "max": round(max(r_sq_values), 3),
            "median": round(sorted(r_sq_values)[len(r_sq_values) // 2], 3),
            "n_zones": len(r_sq_values),
        }

    # Zone Score W3.1A
    try:
        from zone_score_engine import WEIGHTS as ZS_WEIGHTS, FORMULA_VERSION as ZS_VERSION
    except Exception:
        ZS_WEIGHTS = {}; ZS_VERSION = "1.0.0"

    zone_score_meta = {
        "name": "Zone Score A-F",
        "components": list(ZS_WEIGHTS.keys()),
        "weights": {k: round(v, 2) for k, v in ZS_WEIGHTS.items()},
        "letters": {"A": "≥80", "B": "65-79", "C": "50-64",
                    "D": "35-49", "E": "20-34", "F": "<20"},
        "version": ZS_VERSION,
    }

    risk_score_meta = {
        "name": "Risk Score V2 (W3.4B)",
        "status": "active_v2_multisource",
        "method": "Composite weighted: crime 40% · natural 25% · title 15% · perception 20%",
        "sources_active": ["sesnsp", "atlas_cdmx", "envipe_inegi", "transaction_network"],
        "sources_pending_v3": ["rpp_partnership_y2"],
        "dimensions": {
            "crime": {
                "source": "SESNSP CSV mensual",
                "categories": ["robo_casa_habitacion", "robo_a_transeunte", "homicidio_doloso",
                               "secuestro", "extorsion", "violencia_familiar"],
                "normalization": "incidentes per 100k hab · 6 meses",
            },
            "natural": {
                "source": "Atlas CDMX + CENAPRED",
                "components": ["sismic_zone (A-D, peso 40%)",
                               "flood_pct (peso 35%)",
                               "subsidence_mm_year (peso 25%)"],
                "frequency": "trimestral",
            },
            "title": {
                "source": "Transaction Network W3.2 (heurística mejorada V2.1)",
                "method": "flips ≥3 en 24m + tasa de flips → score inverso",
                "v3_pending": "RPP partnership Y2",
            },
            "perception": {
                "source": "ENVIPE INEGI anual",
                "indicator": "Indicador 6207067968 (% percepción inseguridad municipal)",
                "frequency": "anual · absorbed en SESNSP cron mensual",
            },
        },
        "frequency": "ingesta crime mensual · natural trimestral · perception anual · refresh diario 05:00 MX",
        "alert_engine": "letter change daily detection + Resend email on critical drops",
        "version": "2.0.0",
    }

    construction_meta = {
        "name": "Construction Cost Index",
        "sources": ["BANXICO INPP", "INEGI Costos de Construcción"],
        "frequency": "mensual",
        "method": "Promedio ponderado por componente (acero, concreto, MO, costo terreno)",
    }

    return {
        "drpi": drpi_meta,
        "drpi_current_national": nat,
        "drpi_r_squared_summary": r_sq_summary,
        "zone_score": zone_score_meta,
        "risk_score": risk_score_meta,
        "construction_cost": construction_meta,
        "validation_endpoint": "/api/data-lake/public/validation",
        "citation": {
            "doi_placeholder": "10.xxxx/dmx-drpi",
            "press_contact": "press@desarrollosmx.io",
            "guideline": (
                "Para citar: 'Fuente: DesarrollosMX (DRPI), %s.' "
                "Compartir libremente para uso editorial con atribución."
            ) % period,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. SUPERADMIN — list bulletins
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/superadmin/bulletins/list")
async def superadmin_list(
    request: Request,
    type_filter: Optional[str] = Query(None, alias="type"),
    zone_id: Optional[str] = Query(None),
    period: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    await _sa(request)
    db = _db(request)
    q: dict = {}
    if type_filter: q["type"] = type_filter
    if zone_id:     q["zone_id"] = zone_id
    if period:      q["period"] = period
    cursor = db.dmx_bulletins.find(q, {"_id": 0}).sort("generated_at", -1).limit(limit)
    items = [d async for d in cursor]
    return {"items": items, "count": len(items)}


# ══════════════════════════════════════════════════════════════════════════════
# 5. SUPERADMIN — manual generate
# ══════════════════════════════════════════════════════════════════════════════

class GenerateBody(BaseModel):
    type: str = "general"  # general|zone|all
    zone_id: Optional[str] = None
    period: Optional[str] = None
    distribute: bool = False


@router.post("/api/superadmin/bulletins/generate")
async def superadmin_generate(body: GenerateBody, request: Request):
    user = await _sa(request)
    db = _db(request)
    period = body.period or drpi._period_now()

    out: dict = {"period": period, "generated": [], "distributed": 0}

    if body.type == "all":
        result = await bulletins.cron_bulletins_monthly_generate(db)
        out.update(result)
    elif body.type == "general":
        gen = await bulletins.generate_bulletin_general(db, period)
        out["generated"].append({"type": "general", "id": gen["id"]})
        if body.distribute:
            dist = await bulletins.distribute_bulletin(db, gen["id"], "subscribers")
            out["distributed"] += dist.get("distribution_count", 0)
    elif body.type == "zone":
        if not body.zone_id:
            raise HTTPException(400, "zone_id requerido para boletín zone")
        gen = await bulletins.generate_bulletin_zone(db, body.zone_id, period)
        out["generated"].append({"type": "zone", "zone_id": body.zone_id, "id": gen["id"]})
        if body.distribute:
            dist = await bulletins.distribute_bulletin(db, gen["id"], "subscribers")
            out["distributed"] += dist.get("distribution_count", 0)
    else:
        raise HTTPException(400, "type debe ser 'general', 'zone' o 'all'")

    try:
        from audit_log import log_mutation
        await log_mutation(
            db, user, "create", "bulletin_generate",
            f"{body.type}::{body.zone_id or 'general'}::{period}",
            before=None, after=out, request=request,
        )
    except Exception:
        pass
    return out
