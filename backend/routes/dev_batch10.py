"""Phase 4 Batch 10 — Mis Proyectos enriched stats.

Endpoints:
  GET /api/dev/projects/list-with-stats  — enriched project list for Mis Proyectos page
  GET /api/dev/projects/:id/summary      — single project summary stats
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
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
    from tenant_scope import tenant_of
    return tenant_of(user)


async def _user_dev_ids(request, user) -> List[str]:
    """Desarrollos visibles (multi-tenant · fuente única tenant_scope). P7: seed + devs REALES del tenant."""
    from tenant_scope import user_dev_ids_db
    return await user_dev_ids_db(_db(request), user)


async def _real_weekly_sales_map(db, dev_ids: List[str]) -> Dict[str, List[int]]:
    """Ventas REALES por semana (últimas 8) por desarrollo, desde `units_history`: cada vez que una
    unidad pasa a estado "vendido" queda registrada con fecha. Cierra el ciclo: marcar una unidad
    como vendida en el portal alimenta esta curva. Antes se INVENTABA con un generador sembrado.
    Solo devuelve desarrollos con ventas reales en la ventana; los demás → estado vacío honesto."""
    if not dev_ids:
        return {}
    now = datetime.now(timezone.utc)
    start = now - timedelta(weeks=8)
    out: Dict[str, List[int]] = {}
    try:
        cur = db.units_history.find(
            {"development_id": {"$in": dev_ids}, "field_changed": "status",
             "new_value": "vendido", "changed_at": {"$gte": start.isoformat()}},
            {"_id": 0, "development_id": 1, "changed_at": 1})
        async for h in cur:
            try:
                ts = datetime.fromisoformat(str(h["changed_at"]).replace("Z", "+00:00"))
            except Exception:
                continue
            wk = int((now - ts).days // 7)
            if wk < 0 or wk > 7:
                continue
            arr = out.setdefault(h["development_id"], [0] * 8)
            arr[7 - wk] += 1   # índice 7 = semana más reciente
    except Exception:
        pass
    return out


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

    dev_ids = await _user_dev_ids(request, user)

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

    # Ventas reales por semana (units_history) — antes se inventaban.
    weekly_map = await _real_weekly_sales_map(db, dev_ids)

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

        # Ventas por semana REALES (últimas 8) desde units_history · vacío si no hay ventas registradas.
        weekly_sales = weekly_map.get(dev["id"], [])

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

        import dmx_margin
        price_m2 = dmx_margin.project_price_m2(units_list)

        results.append({
            "id": dev["id"],
            "name": dev["name"],
            "colonia": colonia_name,
            "colonia_id": colonia_id,
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
            "_price_m2": price_m2,
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
            # C6 · bug: leía price_from → el rango salía plano. Ahora usa price_to real.
            "price_to": int(p.get("price_to") or p.get("price_from") or 0),
            "units_total": total_units,
            "units_by_status": by_status,
            "construction_pct": 0,
            "health_score": 65,  # neutral default for fresh projects
            "leads_active": 0,
            "revenue_mtd_est": 0,
            "weekly_sales": [],
            "cover_photo": None,
            "developer_id": p.get("developer_id"),
            "delivery_estimate": None,
            "created_via": "wizard",
            "colonia_id": p.get("colonia_id") or p.get("colonia"),
            "_price_m2": None,
        })

    # INGESTA MASIVA — Incluye los proyectos INGERIDOS del dev (db.developments source='bulk_ingest'). Sin esto el dev
    # no veía en "Mis Proyectos" lo que él mismo subió por Drive (auditoría 07-07). Unidades desde db.units (development_id).
    _seen_ids = {r["id"] for r in results}
    async for p in db.developments.find(
            {"source": "bulk_ingest", "$or": [{"dev_org_id": org}, {"developer_id": org}]}, {"_id": 0}):
        if p.get("id") in _seen_ids:
            continue
        _seen_ids.add(p.get("id"))
        try:
            from ingested_reader import units_for_dev
            _units = await units_for_dev(db, p["id"])
        except Exception:
            _units = []
        by_status: Dict[str, int] = {}
        for u in _units:
            s = u.get("status", "disponible")
            by_status[s] = by_status.get(s, 0) + 1
        _prices = [u.get("price") for u in _units if u.get("price")]
        results.append({
            "id": p["id"], "name": p.get("name", p["id"]), "colonia": p.get("colonia", ""),
            "stage": p.get("stage", "preventa"),
            "price_from": int(min(_prices)) if _prices else int(p.get("price_from") or 0),
            "price_to": int(max(_prices)) if _prices else int(p.get("price_from") or 0),
            "units_total": len(_units) or int(p.get("total_units") or 0), "units_by_status": by_status,
            "construction_pct": 0, "health_score": 65, "leads_active": 0, "revenue_mtd_est": 0,
            "weekly_sales": [], "cover_photo": None, "developer_id": p.get("developer_id"),
            "delivery_estimate": p.get("delivery_estimate"), "created_via": "ingesta",
            "colonia_id": p.get("colonia_id") or p.get("colonia"), "_price_m2": None,
            "marketplace_published": p.get("marketplace_published"),
        })

    # Margen semáforo (upgrade Mis Proyectos · B02): costo INPP/m² vs precio/m² × ritmo de venta.
    try:
        import dmx_margin
        meta = []
        for r in results:
            ws = r.get("weekly_sales") or []
            tail = ws[-4:] if ws else []
            absorption = (sum(tail) / len(tail)) if tail else 0
            meta.append({"id": r["id"], "colonia_id": r.get("colonia_id"),
                         "price_m2": r.get("_price_m2"), "absorption_rate": absorption})
        margins = await dmx_margin.compute_margins(meta)
        for r in results:
            r["margin"] = margins.get(r["id"])
            r.pop("_price_m2", None)
    except Exception:
        for r in results:
            r.pop("_price_m2", None)

    # "1 número" — Full Project Score (upgrade Inteligencia · E01): funde salud + margen +
    # absorción + ritmo + demanda en un score 0-100 comparable. fail-open.
    try:
        import dmx_project_score
        for r in results:
            r["full_score"] = dmx_project_score.compute(r)
    except Exception:
        pass

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
                "evidence": [
                    {"k": "Tu precio (desde)", "v": _mm(pf)},
                    {"k": f"Valor de zona ({p.get('colonia') or '—'})", "v": _mm(mk)},
                    {"k": "Estás arriba", "v": f"+{round(gap*100)}%"},
                    {"k": "Unidades disponibles", "v": f"{avail}"},
                ],
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
                    "evidence": [
                        {"k": "Tu ritmo de venta", "v": f"{ritmo:.1f}/sem"},
                        {"k": "Meses a la entrega", "v": f"{md}"},
                        {"k": "Disponible hoy", "v": f"{avail} uds"},
                        {"k": "Quedarían sin vender", "v": f"{leftover} uds"},
                    ],
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
                "evidence": [
                    {"k": "Clientes activos", "v": f"{leads}"},
                    {"k": "Conversión actual", "v": f"{p.get('conversion_pct', 0)}%"},
                    {"k": "Precio por unidad (desde)", "v": _mm(pf)},
                    {"k": "$ en juego", "v": _mm(leads * pf)},
                ],
            })

        # 4) PROYECTO QUE FRENA (salud baja · siempre surfacea lo que estanca dinero)
        if 0 < health < 70 and avail:
            plays.append({
                "type": "salud", "severity": "media", "project_id": pid, "project_name": name,
                "emoji": "🩺", "title": f"{name} va lento — necesita tu atención",
                "detail": "Hay 2-3 cosas frenando sus ventas (fotos, precio o seguimiento). Arréglalas y se mueve.",
                "impact_label": f"{avail} uds · {_mm(avail*pf)} por destrabar",
                "impact_value": avail * pf * 0.4,   # ponderado: no todo está en riesgo, pero pesa
                "action_label": "Ver qué lo frena", "action_route": route,
                "sources": "diagnóstico de salud del proyecto (35 señales)",
                "evidence": [
                    {"k": "Salud del proyecto", "v": f"{health}/100"},
                    {"k": "Unidades disponibles", "v": f"{avail}"},
                    {"k": "Por destrabar", "v": _mm(avail * pf)},
                    {"k": "Ritmo reciente", "v": f"{ritmo:.1f}/sem"},
                ],
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

    # Db-aware: los proyectos creados por el dev/superadmin viven en db.projects/db.developments y
    # NO en el SEED en memoria — el gate solo-seed daba 403 al dueño legítimo de un proyecto heredado.
    from tenant_scope import assert_db_project_owner
    await assert_db_project_owner(db, user, project_id, not_found="Proyecto no accesible")

    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d["id"] == project_id), None)
    if not dev:
        # Proyecto de BD (wizard/alta/bulk): normaliza a una forma mínima que el resumen entiende.
        dev = await db.developments.find_one({"id": project_id}, {"_id": 0})
        if not dev:
            pdoc = await db.projects.find_one({"id": project_id}, {"_id": 0})
            if pdoc:
                dev = {"id": project_id, "units": pdoc.get("units") or [],
                       "stage": pdoc.get("stage", "preventa"),
                       "price_from": pdoc.get("price_from") or 0, "price_to": pdoc.get("price_to") or 0,
                       "total_units": pdoc.get("total_units") or 0,
                       "construction_progress": pdoc.get("construction_progress", {})}
        if not dev:
            raise HTTPException(404, "Proyecto no encontrado")

    units_raw = dev.get("units", []) or []
    declared_total = int(dev.get("units_total") or dev.get("total_units") or 0)
    units_total = max(1, len(units_raw) or declared_total)

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
    # Embudo real (sin filtros de fecha → robusto): total, ganados, conversión.
    leads_total = await db.leads.count_documents({"development_id": project_id})
    leads_won = await db.leads.count_documents({
        "development_id": project_id, "status": {"$in": ["cerrado_ganado", "ganado", "won"]}
    })
    conversion_pct = round(leads_won / leads_total * 100, 1) if leads_total else 0.0
    # Interés / demanda: vistas de cliente registradas (engagement); 0 si aún no hay tráfico.
    try:
        views_cliente = await db.engagement_events.count_documents({
            "project_id": project_id, "actor_type": "cliente"
        })
    except Exception:
        views_cliente = 0

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
    except Exception as _e:
        log.warning("[audit] emit_ml_event perdido (project_detail_view project=%s): %s", project_id, _e)

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
        "leads_total": leads_total,
        "leads_won": leads_won,
        "conversion_pct": conversion_pct,
        "views_cliente": views_cliente,
        "health_score": health,
        "price_from": price_from,
        "price_to": price_to,
        "delivery_estimate": dev.get("delivery_estimate"),
    }


async def ensure_batch10_indexes(db):
    """Índice ÚNICO en developer_unit_overrides.unit_id → evita filas duplicadas del mismo override
    bajo escrituras concurrentes (el upsert por unit_id no es atómico sin índice único)."""
    await db.developer_unit_overrides.create_index("unit_id", unique=True, background=True)
