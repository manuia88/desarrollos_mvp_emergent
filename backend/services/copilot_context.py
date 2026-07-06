"""Phase 4 Batch 23 · services — Copilot context aggregation per role.

Builds a compact dict (~ ≤2000 tokens) with the most relevant data for the
caller's role so Claude can answer questions grounded in real data.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

# Soft cap for the JSON-encoded context payload sent to Claude.
MAX_CONTEXT_CHARS = 6000  # ≈ 1500-2000 tokens conservative


def _now():
    return datetime.now(timezone.utc)


def _truncate(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Drop optional bulk lists if the payload exceeds the soft cap."""
    drop_order = [
        "funnel_top5_projects",
        "my_links_top3",
        "top_asesores",
        "alerts_recent",
    ]
    while len(json.dumps(payload, default=str, ensure_ascii=False)) > MAX_CONTEXT_CHARS and drop_order:
        k = drop_order.pop(0)
        payload.pop(k, None)
    # Final hard cap
    enc = json.dumps(payload, default=str, ensure_ascii=False)
    if len(enc) > MAX_CONTEXT_CHARS:
        payload["_truncated"] = True
        payload.pop("projects", None)
    return payload


# ─── Developer context ───────────────────────────────────────────────────────

async def _developer_context(db, user) -> Dict[str, Any]:
    org = getattr(user, "tenant_id", None) or "default"
    proj_q: Dict[str, Any] = {}
    if user.role != "superadmin":
        proj_q["dev_org_id"] = org

    projects: List[Dict[str, Any]] = []
    async for p in db.projects.find(proj_q, {"_id": 0, "id": 1, "name": 1, "stage": 1}).limit(8):
        pid = p.get("id")
        units_total = await db.units.count_documents({"project_id": pid})
        units_sold = await db.units.count_documents(
            {"project_id": pid, "status": {"$in": ["vendido", "vendida"]}})
        since = (_now() - timedelta(days=30)).isoformat()
        leads_30d = await db.leads.count_documents(
            {"project_id": pid, "created_at": {"$gte": since}})
        hs = await db.health_scores.find_one(
            {"entity_type": "project", "entity_id": pid},
            {"_id": 0, "score": 1}, sort=[("computed_at", -1)],
        ) or {}
        projects.append({
            "id": pid,
            "nombre": p.get("name"),
            "stage": p.get("stage"),
            "health_score": int(hs.get("score", 0)),
            "units_sold": units_sold,
            "units_total": units_total,
            "leads_30d": leads_30d,
        })

    # Legacy DEVELOPMENTS fallback (handoff: unified reads)
    if not projects:
        try:
            from data_developments import DEVELOPMENTS
            for d in DEVELOPMENTS[:8]:
                pid = d.get("id") or d.get("slug")
                hs = await db.health_scores.find_one(
                    {"entity_type": "project", "entity_id": pid},
                    {"_id": 0, "score": 1}, sort=[("computed_at", -1)],
                ) or {}
                since = (_now() - timedelta(days=30)).isoformat()
                leads_30d = await db.leads.count_documents(
                    {"project_id": pid, "created_at": {"$gte": since}})
                projects.append({
                    "id": pid,
                    "nombre": d.get("name", pid),
                    "stage": d.get("stage"),
                    "health_score": int(hs.get("score", 0)),
                    "units_sold": 0,
                    "units_total": d.get("total_units", 0),
                    "leads_30d": leads_30d,
                })
        except Exception:
            pass

    # Team productivity (B21)
    team_summary = {}
    try:
        from services.asesor_metrics import get_team_aggregated  # type: ignore
        team_summary = await get_team_aggregated(db, org, "30d")  # may not exist
    except Exception:
        # best-effort lightweight fallback
        team_summary = {
            "total_asesores": await db.users.count_documents(
                {"role": "advisor", "tenant_id": org}),
        }

    # Alerts: low-health projects
    alerts_count = sum(1 for p in projects if p.get("health_score", 100) < 60)

    # Top 5 funnel projects (counts only — keep light)
    funnel_top5: List[Dict[str, Any]] = []
    for p in projects[:5]:
        bookings = await db.appointments.count_documents({"project_id": p["id"]})
        funnel_top5.append({
            "project": p["nombre"], "leads_30d": p["leads_30d"],
            "bookings_total": bookings,
        })

    # CUBO F4 (auditoría): la tensión de SUS cortes también en el Copilot (antes solo el Director).
    tension_cortes: List[Dict[str, Any]] = []
    try:
        from tenant_scope import user_dev_ids
        import demand_intelligence as di
        _ids = list(user_dev_ids(user) or [])
        if _ids:
            _t = await di.tension_cortes_dev(db, _ids, max_celdas=3)
            tension_cortes = _t.get("celdas", [])
    except Exception:  # noqa: BLE001 — el bloque del cubo jamás tumba el Copilot
        pass

    return {
        "role": user.role,
        "name": getattr(user, "name", None),
        "projects": projects,
        "alerts_count": alerts_count,
        "team_summary": team_summary,
        "funnel_top5_projects": funnel_top5,
        "tension_de_mis_cortes": tension_cortes,
    }


# ─── Asesor context ──────────────────────────────────────────────────────────

async def _asesor_context(db, user) -> Dict[str, Any]:
    aid = user.user_id
    leads_q = {"$or": [{"asesor_id": aid}, {"assigned_to": aid}],
               "lead_stage": {"$nin": ["cerrado_perdido", "perdido", "cerrado_ganado", "ganado"]}}

    leads: List[Dict[str, Any]] = []
    async for ld in db.leads.find(leads_q,
                                  {"_id": 0, "id": 1, "name": 1, "lead_stage": 1,
                                   "project_id": 1, "score": 1, "last_contact_at": 1}).limit(8):
        leads.append({
            "id": ld.get("id"),
            "nombre": ld.get("name"),
            "stage": ld.get("lead_stage"),
            "project_id": ld.get("project_id"),
            "score": ld.get("score", 0),
            "last_contact_at": ld.get("last_contact_at"),
        })

    pipeline_value = 0
    try:
        async for r in db.leads.aggregate([
            {"$match": {**leads_q}},
            {"$group": {"_id": None, "total": {"$sum": "$expected_value_mxn"}}},
        ]):
            pipeline_value = float(r.get("total", 0) or 0)
    except Exception:
        pass

    now_iso = _now().isoformat()
    in_7d = (_now() + timedelta(days=7)).isoformat()
    citas: List[Dict[str, Any]] = []
    async for c in db.appointments.find(
        {"asesor_id": aid, "datetime": {"$gte": now_iso, "$lte": in_7d}},
        {"_id": 0, "id": 1, "datetime": 1, "project_id": 1, "lead_name": 1},
    ).sort("datetime", 1).limit(8):
        citas.append({
            "datetime": c.get("datetime"),
            "project_id": c.get("project_id"),
            "lead_name": c.get("lead_name"),
        })

    # Top 3 tracking links
    links: List[Dict[str, Any]] = []
    async for lk in db.tracking_links.find(
        {"asesor_id": aid},
        {"_id": 0, "link_id": 1, "project_id": 1, "utm_campaign": 1, "total_clicks": 1},
    ).sort("total_clicks", -1).limit(3):
        links.append({
            "project": lk.get("project_id"),
            "campaign": lk.get("utm_campaign"),
            "clicks": int(lk.get("total_clicks") or 0),
        })

    hs = await db.health_scores.find_one(
        {"entity_type": "asesor", "entity_id": aid},
        {"_id": 0, "score": 1}, sort=[("computed_at", -1)],
    ) or {}

    # E4/A1 · CRM PROPIO del asesor (asesor_contactos) — el Cmd+J era ciego a esto
    # (solo leía db.leads). Ahora también ve su libreta real de prospectos. FAIL-OPEN.
    crm: List[Dict[str, Any]] = []
    crm_count = 0
    try:
        crm_count = await db.asesor_contactos.count_documents({"owner_id": aid, "archived": {"$ne": True}})
        async for c in db.asesor_contactos.find(
            {"owner_id": aid, "archived": {"$ne": True}},
            {"_id": 0, "first_name": 1, "last_name": 1, "etapa": 1, "fuente": 1,
             "temperatura": 1, "origin": 1},
        ).sort("created_at", -1).limit(8):
            crm.append({
                "nombre": f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or "Lead",
                "etapa": c.get("etapa", "nuevo"),
                "fuente": c.get("fuente") or c.get("origin"),
                "temperatura": c.get("temperatura"),
            })
    except Exception:
        pass

    # CUBO F4.4 — los cortes de tus clientes vistos en el cubo (unidades que les quedan +
    # tensión = tu palanca honesta de cierre). Solo las 3 búsquedas más recientes: el bloque
    # entra al prompt entero, compacto o nada.
    cortes_clientes: List[Dict[str, Any]] = []
    try:
        import cube_lens
        from routes.advisor import _busqueda_a_corte
        async for b in db.asesor_busquedas.find({"owner_id": aid}, {"_id": 0}).sort(
                "created_at", -1).limit(3):
            corte = _busqueda_a_corte(b)
            if not corte:
                continue
            lente = await cube_lens.consulta_con_lente(db, "asesor", corte)
            # DISPONIBLES, no el total (auditoría F4: contar vendidas mentía el inventario del pitch)
            n = lente.get("n_disponibles") if lente.get("ok") and not lente.get("suprimido") else None
            esp = await cube_lens.espejo_con_lente(db, "asesor", corte, n_oferta=n)
            # nombre del cliente + resumen del corte: sin esto el LLM solo ve ids opacos
            cliente = None
            try:
                c = await db.asesor_contactos.find_one({"id": b.get("contacto_id")},
                                                       {"_id": 0, "first_name": 1, "last_name": 1})
                if c:
                    cliente = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or None
            except Exception:  # noqa: BLE001
                pass
            resumen = " · ".join(filter(None, [
                ", ".join(b.get("colonias") or []) or None,
                f"{b['recamaras_min']}+ rec" if b.get("recamaras_min") else None,
                f"hasta ${b['precio_max']:,.0f}" if b.get("precio_max") else None]))
            cortes_clientes.append({
                "busqueda_id": b.get("id"), "contacto_id": b.get("contacto_id"),
                "cliente": cliente, "corte_resumen": resumen or None,
                "unidades_que_le_quedan": n,
                "compradores_buscando_lo_mismo": esp.get("personas"),
                "tension_por_unidad": esp.get("tension_por_unidad"),
            })
    except Exception:  # noqa: BLE001 — el bloque del cubo jamás tumba el Copilot
        pass

    return {
        "role": "asesor",
        "name": getattr(user, "name", None),
        "my_leads_active": leads,
        "leads_active_count": len(leads),
        "my_pipeline_value_mxn": round(pipeline_value, 2),
        "my_citas_proximas": citas,
        "my_links_top3": links,
        "my_health_score": int(hs.get("score", 0)),
        "my_crm_contactos": crm,
        "my_crm_count": crm_count,
        "cortes_de_mis_clientes": cortes_clientes,
    }


# ─── Inmobiliaria admin context ──────────────────────────────────────────────

async def _inmobiliaria_context(db, user) -> Dict[str, Any]:
    org = getattr(user, "tenant_id", None) or "default"
    asesores_count = await db.users.count_documents(
        {"role": "advisor", "tenant_id": org})

    # Top 5 asesores by pipeline
    top: List[Dict[str, Any]] = []
    async for u in db.users.find(
        {"role": "advisor", "tenant_id": org},
        {"_id": 0, "user_id": 1, "name": 1},
    ).limit(20):
        aid = u.get("user_id")
        pipeline_v = 0
        try:
            async for r in db.leads.aggregate([
                {"$match": {"asesor_id": aid,
                            "lead_stage": {"$nin": ["cerrado_perdido", "perdido", "cerrado_ganado", "ganado"]}}},
                {"$group": {"_id": None, "v": {"$sum": "$expected_value_mxn"}}},
            ]):
                pipeline_v = float(r.get("v", 0) or 0)
        except Exception:
            pass
        leads_active = await db.leads.count_documents(
            {"asesor_id": aid,
             "lead_stage": {"$nin": ["cerrado_perdido", "perdido", "cerrado_ganado", "ganado"]}})
        top.append({"name": u.get("name"), "pipeline_mxn": round(pipeline_v, 0),
                     "leads_active": leads_active})
    top.sort(key=lambda x: -x["pipeline_mxn"])
    top = top[:5]

    total_pipeline_org = sum(t["pipeline_mxn"] for t in top)

    return {
        "role": "inmobiliaria_admin",
        "name": getattr(user, "name", None),
        "team_summary": {"total_asesores": asesores_count},
        "top_asesores": top,
        "total_pipeline_org": round(total_pipeline_org, 0),
    }


# ─── Public entry point ──────────────────────────────────────────────────────

async def aggregate_user_context(db, user) -> Dict[str, Any]:
    role = (user.role or "").lower()
    if role in ("developer_admin", "developer_director", "developer_member",
                "superadmin"):
        ctx = await _developer_context(db, user)
    elif role in ("inmobiliaria_admin", "asesor_admin"):
        ctx = await _inmobiliaria_context(db, user)
    elif role in ("advisor", "asesor", "inmobiliaria_member"):
        ctx = await _asesor_context(db, user)
    else:
        ctx = {"role": role, "name": getattr(user, "name", None)}

    ctx["generated_at"] = _now().isoformat()
    return _truncate(ctx)
