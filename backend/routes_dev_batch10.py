"""Phase 4 Batch 10 — Mis Proyectos enriched stats.

Endpoints:
  GET /api/dev/projects/list-with-stats  — enriched project list for Mis Proyectos page
  GET /api/dev/projects/:id/summary      — single project summary stats
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.batch10")
router = APIRouter(prefix="/api/dev", tags=["batch10"])


# ─── helpers ─────────────────────────────────────────────────────────────────

def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _tenant(user) -> str:
    return getattr(user, "tenant_id", None) or getattr(user, "org_id", None) or "default"


def _user_dev_ids(user) -> List[str]:
    from data_developments import DEVELOPMENTS
    tenant = _tenant(user)
    if user.role == "superadmin":
        return [d["id"] for d in DEVELOPMENTS]
    ids = [d["id"] for d in DEVELOPMENTS if d["developer_id"].startswith(tenant.split("_")[-1][:3])]
    return ids or [DEVELOPMENTS[0]["id"], DEVELOPMENTS[1]["id"]]


def _generate_weekly_sales(project_id: str, sold_total: int, stage: str) -> List[int]:
    """
    Deterministic 8-week sales sparkline seeded from project_id.
    Generates a realistic absorption curve:
    - Preventa: crescente (ramp-up hacia semanas recientes)
    - En_construccion: relativamente plano con ligero descenso final
    - Entrega: spike en semanas anteriores, bajo ahora
    """
    if sold_total == 0:
        return [0] * 8

    # LCG seeded by project string hash for determinism
    seed = abs(hash(project_id)) % (2 ** 31)
    def lcg_next(s):
        return (1664525 * s + 1013904223) % (2 ** 32)

    # Generate 8 raw values [0, 1)
    raw = []
    s = seed
    for _ in range(8):
        s = lcg_next(s)
        raw.append(s / (2 ** 32))

    # Apply stage-specific weight curve (index 0 = oldest week, 7 = latest)
    if stage in ("preventa", "en_construccion"):
        # Ramp-up: more weight on recent weeks
        weights = [0.04, 0.06, 0.08, 0.10, 0.14, 0.18, 0.20, 0.20]
    elif stage in ("entrega_inmediata",):
        # Spike mid-history, lower now
        weights = [0.05, 0.18, 0.22, 0.20, 0.15, 0.10, 0.07, 0.03]
    else:
        weights = [0.12, 0.13, 0.12, 0.14, 0.12, 0.13, 0.12, 0.12]

    # Scale each week = weight * sold_total + noise
    scaled = [w * sold_total * (0.7 + raw[i] * 0.6) for i, w in enumerate(weights)]

    # Normalize so sum ≈ sold_total
    total_raw = sum(scaled)
    if total_raw > 0:
        scaled = [v * sold_total / total_raw for v in scaled]

    # Round to integers, ensure non-negative
    result = [max(0, round(v)) for v in scaled]
    return result


def _compute_health_score(
    units_by_status: Dict[str, int],
    units_total: int,
    construction_pct: int,
    stage: str,
    ie_score: Optional[float] = None,
) -> int:
    """Deterministic 0-100 health score for a project card."""
    total = max(1, units_total)
    sold = units_by_status.get("vendido", 0) + units_by_status.get("reservado", 0)
    sold_pct = min(100, sold / total * 100)

    # Entrega inmediata / exclusiva → construction 100 effectively
    if stage in ("entrega_inmediata", "exclusiva"):
        construction_pct = max(construction_pct, 90)

    # Base weights: sales 40%, construction 25%, IE 25%, baseline 10%
    ie_contrib = (ie_score or 60.0) * 0.25
    score = sold_pct * 0.40 + construction_pct * 0.25 + ie_contrib + 10
    return int(min(100, max(0, round(score))))


# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/dev/projects/list-with-stats
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/projects/list-with-stats")
async def list_projects_with_stats(request: Request):
    """
    Returns all projects visible to the authenticated developer org,
    enriched with health score, leads count, estimated revenue MTD, cover photo.
    Used by 'Mis Proyectos' page.
    """
    user = await _auth(request)
    db = _db(request)

    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS

    dev_ids = _user_dev_ids(user)

    # Build quick lookup: colonia_id → colonia name
    colonia_map = {c["id"]: c["name"] for c in COLONIAS}

    # Get override price/unit data from developer_unit_overrides
    overrides_cursor = db.developer_unit_overrides.find(
        {"dev_id": {"$in": dev_ids}}, {"_id": 0}
    )
    overrides: Dict[str, Dict] = {}
    async for ov in overrides_cursor:
        key = f"{ov['dev_id']}__{ov['unit_id']}"
        overrides[key] = ov

    # Get IE scores (optional enrichment)
    ie_scores_map: Dict[str, float] = {}
    async for s in db.ie_scores.find(
        {"zone_id": {"$in": dev_ids}, "code": "IE_PROY_SCORE_VS_COLONIA", "is_stub": False},
        {"_id": 0, "zone_id": 1, "value": 1}
    ):
        ie_scores_map[s["zone_id"]] = s["value"]

    # Count active leads per project
    leads_agg = {}
    TERMINAL_STATUSES = {"cerrado_ganado", "cerrado_perdido", "archivado"}
    async for lead in db.leads.find(
        {"development_id": {"$in": dev_ids}, "status": {"$nin": list(TERMINAL_STATUSES)}},
        {"_id": 0, "development_id": 1}
    ):
        did = lead["development_id"]
        leads_agg[did] = leads_agg.get(did, 0) + 1

    # Get cover photos from dev_assets
    cover_photos: Dict[str, Optional[str]] = {}
    async for asset in db.dev_assets.find(
        {"development_id": {"$in": dev_ids}, "role": "cover"},
        {"_id": 0, "development_id": 1, "url": 1}
    ):
        if asset["development_id"] not in cover_photos:
            cover_photos[asset["development_id"]] = asset.get("url")

    # Build result
    results = []
    for dev in DEVELOPMENTS:
        if dev["id"] not in dev_ids:
            continue

        # Basic fields
        units_raw = dev.get("units", [])
        units_total = len(units_raw)

        # Apply overrides
        units_list = []
        for u in units_raw:
            key = f"{dev['id']}__{u['id']}"
            if key in overrides:
                merged = {**u, **{k: v for k, v in overrides[key].items() if v is not None}}
                units_list.append(merged)
            else:
                units_list.append(u)

        # Compute units_by_status
        by_status: Dict[str, int] = {}
        for u in units_list:
            st = u.get("status", "disponible")
            by_status[st] = by_status.get(st, 0) + 1

        # Construction pct
        cp = dev.get("construction_progress", {})
        construction_pct = int(cp.get("percentage", 0)) if isinstance(cp, dict) else 0

        # Price range
        prices = [u["price"] for u in units_list if u.get("price")]
        price_from = min(prices) if prices else dev.get("price_from", 0)
        price_to = max(prices) if prices else dev.get("price_to", 0)

        # Health score
        ie_score = ie_scores_map.get(dev["id"])
        stage = dev.get("stage", "preventa")
        health = _compute_health_score(by_status, units_total, construction_pct, stage, ie_score)

        # Revenue MTD estimate (vendidas * avg_price / 1M as rough proxy)
        sold_units = by_status.get("vendido", 0)
        avg_price = (price_from + price_to) / 2 if price_to > price_from else price_from
        revenue_mtd_est = int(sold_units * avg_price) if avg_price else 0

        # Weekly sales sparkline (last 8 weeks, deterministic from project seed)
        weekly_sales = _generate_weekly_sales(dev["id"], sold_units, stage)

        colonia_id = dev.get("colonia_id", dev.get("colonia", ""))
        colonia_name = colonia_map.get(colonia_id, dev.get("colonia", colonia_id).replace("_", " ").title())

        results.append({
            "id": dev["id"],
            "name": dev["name"],
            "colonia": colonia_name,
            "stage": stage,
            "price_from": price_from,
            "price_to": price_to,
            "units_total": units_total,
            "units_by_status": by_status,
            "construction_pct": construction_pct,
            "health_score": health,
            "leads_active": leads_agg.get(dev["id"], 0),
            "revenue_mtd_est": revenue_mtd_est,
            "weekly_sales": weekly_sales,
            "cover_photo": cover_photos.get(dev["id"]),
            "developer_id": dev.get("developer_id"),
            "delivery_estimate": dev.get("delivery_estimate"),
        })

    # Phase 4 Batch 12 — Include wizard-created projects (db.projects)
    org = (getattr(user, "tenant_id", None) or
           getattr(user, "org_id", None) or "default")
    async for p in db.projects.find({"dev_org_id": org}, {"_id": 0}):
        if p.get("id") in {r["id"] for r in results}:
            continue
        # Aggregate units from db.units
        total_units = await db.units.count_documents({"project_id": p["id"]})
        by_status: Dict[str, int] = {}
        async for u in db.units.find({"project_id": p["id"]}, {"_id": 0, "status": 1}):
            s = u.get("status", "disponible")
            by_status[s] = by_status.get(s, 0) + 1
        results.append({
            "id": p["id"],
            "name": p.get("name", p["id"]),
            "colonia": p.get("colonia", ""),
            "stage": p.get("stage", "preventa"),
            "price_from": int(p.get("price_from") or 0),
            "price_to": int(p.get("price_from") or 0),
            "units_total": total_units,
            "units_by_status": by_status,
            "construction_pct": 0,
            "health_score": 65,  # neutral default for fresh projects
            "leads_active": 0,
            "revenue_mtd_est": 0,
            "weekly_sales": [0] * 8,
            "cover_photo": None,
            "developer_id": p.get("developer_id"),
            "delivery_estimate": None,
            "created_via": "wizard",
        })

    return results


# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/dev/projects/:id/summary
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/projects/{project_id}/summary")
async def get_project_summary(project_id: str, request: Request):
    """
    Single project summary stats for ProyectoDetail header KPIStrip.
    """
    user = await _auth(request)
    db = _db(request)

    dev_ids = _user_dev_ids(user)
    if project_id not in dev_ids:
        raise HTTPException(403, "Proyecto no accesible")

    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    units_raw = dev.get("units", [])
    units_total = max(1, len(units_raw))

    # Apply overrides
    overrides = {}
    async for ov in db.developer_unit_overrides.find({"dev_id": project_id}, {"_id": 0}):
        overrides[f"{project_id}__{ov['unit_id']}"] = ov

    units_list = []
    for u in units_raw:
        key = f"{project_id}__{u['id']}"
        units_list.append({**u, **{k: v for k, v in overrides.get(key, {}).items() if v is not None}})

    by_status: Dict[str, int] = {}
    for u in units_list:
        st = u.get("status", "disponible")
        by_status[st] = by_status.get(st, 0) + 1

    cp = dev.get("construction_progress", {})
    construction_pct = int(cp.get("percentage", 0)) if isinstance(cp, dict) else 0
    stage = dev.get("stage", "preventa")

    sold = by_status.get("vendido", 0) + by_status.get("reservado", 0)
    sold_pct = round(sold / units_total * 100, 1)

    prices = [u["price"] for u in units_list if u.get("price")]
    price_from = min(prices) if prices else dev.get("price_from", 0)
    price_to = max(prices) if prices else dev.get("price_to", 0)
    avg_price = (price_from + price_to) / 2 if price_to > price_from else price_from
    revenue_mtd_est = int(by_status.get("vendido", 0) * avg_price)

    leads_active = await db.leads.count_documents({
        "development_id": project_id,
        "status": {"$nin": ["cerrado_ganado", "cerrado_perdido", "archivado"]}
    })

    ie_score_doc = await db.ie_scores.find_one(
        {"zone_id": project_id, "code": "IE_PROY_SCORE_VS_COLONIA", "is_stub": False},
        {"_id": 0, "value": 1}
    )
    ie_score = ie_score_doc["value"] if ie_score_doc else None

    health = _compute_health_score(by_status, units_total, construction_pct, stage, ie_score)

    # audit + ml event (fire-and-forget)
    try:
        from observability import emit_ml_event
        import asyncio
        asyncio.create_task(emit_ml_event(
            db, "project_detail_view", user.id, _tenant(user), user.role,
            context={"project_id": project_id}
        ))
    except Exception:
        pass

    return {
        "id": project_id,
        "name": dev["name"],
        "colonia": dev.get("colonia", ""),
        "stage": stage,
        "units_total": units_total,
        "units_by_status": by_status,
        "construction_pct": construction_pct,
        "sold_pct": sold_pct,
        "sold_units": by_status.get("vendido", 0),
        "reserved_units": by_status.get("reservado", 0),
        "revenue_mtd_est": revenue_mtd_est,
        "leads_active": leads_active,
        "health_score": health,
        "price_from": price_from,
        "price_to": price_to,
        "delivery_estimate": dev.get("delivery_estimate"),
    }


async def ensure_batch10_indexes(db):
    """No new collections needed for batch 10."""
    pass
