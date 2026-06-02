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

    # Count active leads per project AND leads in last 30d
    from datetime import timedelta
    leads_agg = {}
    leads_30d_agg = {}
    leads_closed_agg = {}
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)
    TERMINAL_STATUSES = {"cerrado_ganado", "cerrado_perdido", "archivado"}
    async for lead in db.leads.find(
        {"development_id": {"$in": dev_ids}},
        {"_id": 0, "development_id": 1, "status": 1, "created_at": 1}
    ):
        did = lead["development_id"]
        st = lead.get("status", "")
        if st not in TERMINAL_STATUSES:
            leads_agg[did] = leads_agg.get(did, 0) + 1
        if st == "cerrado_ganado":
            leads_closed_agg[did] = leads_closed_agg.get(did, 0) + 1
        created = lead.get("created_at")
        if created:
            if isinstance(created, str):
                try:
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except Exception:
                    created = None
            if created and created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created and created >= since_30d:
                leads_30d_agg[did] = leads_30d_agg.get(did, 0) + 1

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

        # leads_30d, conversion_pct, days_listed
        total_leads_for_dev = leads_agg.get(dev["id"], 0) + leads_closed_agg.get(dev["id"], 0)
        closed = leads_closed_agg.get(dev["id"], 0)
        conversion_pct = round(closed / total_leads_for_dev * 100) if total_leads_for_dev else 0
        # days_listed: use dev.created_at or estimate from stage
        created_at_raw = dev.get("created_at")
        if created_at_raw:
            try:
                ca = datetime.fromisoformat(str(created_at_raw).replace("Z", "+00:00"))
                days_listed = (datetime.now(timezone.utc) - ca).days
            except Exception:
                days_listed = None
        else:
            days_listed = None

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
            "leads_30d": leads_30d_agg.get(dev["id"], 0),
            "conversion_pct": conversion_pct,
            "days_listed": days_listed,
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
# GET /api/dev/projects/plays — "Tus jugadas de hoy" (upgrade Inicio · fusión + agentic)
# Fusiona TU dato con el MERCADO y rankea por $ en juego. Cierra ciclo en memoria del Cerebro.
# ═══════════════════════════════════════════════════════════════════════════════

def _months_until(ym):
    """'YYYY-MM' → meses desde hoy (>=0) o None."""
    try:
        parts = str(ym).split("-")
        y, m = int(parts[0]), int(parts[1])
        now = datetime.now(timezone.utc)
        return max(0, (y - now.year) * 12 + (m - now.month))
    except Exception:
        return None


def _mm(v):
    try:
        return f"${v / 1_000_000:.0f}M"
    except Exception:
        return "$0M"


@router.get("/projects/plays")
async def dev_plays(request: Request):
    """Las 2-3 jugadas de mayor palanca del portafolio, fusionando datos propios + mercado.
    Tipos: precio-vs-mercado · agotamiento-vs-entrega · cierre-a-la-mano · proyecto-que-frena.
    Rankeadas por $ en juego. Registra en memoria gobernada lo que se propuso (cierra ciclo)."""
    user = await _auth(request)
    db = _db(request)
    projects = await list_projects_with_stats(request)   # tenant-scoped + enriquecido

    # mercado comparable: mediana de price_from por colonia (todo el inventario CDMX)
    from data_developments import DEVELOPMENTS
    from data_seed import COLONIAS
    cmap = {c["id"]: c["name"] for c in COLONIAS}
    zone_prices: Dict[str, List[int]] = {}
    for d in DEVELOPMENTS:
        cid = d.get("colonia_id", d.get("colonia", ""))
        cname = cmap.get(cid, str(d.get("colonia", cid)).replace("_", " ").title())
        if d.get("price_from"):
            zone_prices.setdefault(cname, []).append(d["price_from"])

    def market_of(cname):
        ps = sorted(zone_prices.get(cname, []))
        return ps[len(ps) // 2] if ps else None

    plays: List[Dict[str, Any]] = []
    for p in projects:
        by = p.get("units_by_status") or {}
        avail = by.get("disponible", 0)
        pf = p.get("price_from") or 0
        ws = p.get("weekly_sales") or []
        recent = ws[-4:] or [0]
        ritmo = sum(recent) / len(recent) if recent else 0
        name, pid = p.get("name"), p.get("id")
        health = p.get("health_score") or 0
        route = f"/desarrollador/proyectos/{pid}"

        # 1) PRECIO vs MERCADO DE ZONA
        mk = market_of(p.get("colonia"))
        if mk and pf and avail and (pf - mk) / mk >= 0.05:
            gap = (pf - mk) / mk
            plays.append({
                "type": "precio", "severity": "alta", "project_id": pid, "project_name": name,
                "emoji": "🏷️", "title": f"{name} está {round(gap*100)}% arriba del valor de su zona",
                "detail": f"Tu precio {_mm(pf)} vs {_mm(mk)} del mercado en {p.get('colonia')} — por eso va lento. Bajar a mercado vende más rápido con margen sano.",
                "impact_label": f"~{_mm(avail*pf*gap)} afectados por sobreprecio",
                "impact_value": avail * pf * gap,
                "action_label": "Ver y ajustar precio", "action_route": route,
                "sources": "tu precio + valor de zona (DRPI) + valuación (AVM · estimado)",
            })

        # 2) AGOTAMIENTO vs ENTREGA (riesgo de inventario parado)
        md = _months_until(p.get("delivery_estimate"))
        if ritmo > 0 and md is not None and avail:
            leftover = max(0, round(avail - ritmo * 4.33 * md))
            if leftover > 0:
                plays.append({
                    "type": "inventario", "severity": "media", "project_id": pid, "project_name": name,
                    "emoji": "⏳", "title": f"{name} llegaría a la entrega con {leftover} unidades sin vender",
                    "detail": f"Entrega en {md} meses y a tu ritmo ({ritmo:.1f}/sem) no alcanzas. Empuja marketing o ajusta precio ahora.",
                    "impact_label": f"~{_mm(leftover*pf)} podrían quedar parados",
                    "impact_value": leftover * pf,
                    "action_label": "Ver plan", "action_route": route,
                    "sources": "tu ritmo de venta + pronóstico + fecha de entrega",
                })

        # 3) CIERRE A LA MANO (leads activos + demanda)
        leads = p.get("leads_active", 0)
        if leads > 0:
            plays.append({
                "type": "cierre", "severity": "oportunidad", "project_id": pid, "project_name": name,
                "emoji": "🔥", "title": f"{leads} cliente(s) activo(s) en {name} por cerrar",
                "detail": f"Tienen actividad reciente; un empujón cierra. Conversión actual {p.get('conversion_pct', 0)}%.",
                "impact_label": f"~{_mm(leads*pf)} en juego",
                "impact_value": leads * pf,
                "action_label": "Ver leads", "action_route": route,
                "sources": "scoring de leads + pulso de demanda (Live Pulse)",
            })

        # 4) PROYECTO QUE FRENA (salud baja · siempre surfacea lo que estanca dinero)
        if 0 < health < 70 and avail:
            plays.append({
                "type": "salud", "severity": "media", "project_id": pid, "project_name": name,
                "emoji": "🩺", "title": f"{name} va lento — salud {health}/100",
                "detail": "Hay 2-3 cosas frenando sus ventas (fotos, precio o seguimiento). Arréglalas y se mueve.",
                "impact_label": f"{avail} uds · {_mm(avail*pf)} por destrabar",
                "impact_value": avail * pf * 0.4,   # ponderado: no todo está en riesgo, pero pesa
                "action_label": "Ver qué lo frena", "action_route": route,
                "sources": "diagnóstico de salud del proyecto (35 señales)",
            })

    plays.sort(key=lambda x: x["impact_value"], reverse=True)
    top = plays[:3]

    # cierre de ciclo: registra en memoria gobernada lo que el Cerebro le propuso (fail-open)
    try:
        import os
        if os.environ.get("CEREBRO_ENABLED") == "true" and top:
            import cerebro
            await cerebro.remember(db, user, scope="world", key="dev_plays_shown",
                                   value={"types": [t["type"] for t in top], "n": len(top)})
    except Exception:
        pass

    return {"plays": top, "total_detected": len(plays)}


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
