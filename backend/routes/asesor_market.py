"""
DMX · Fase 3.3 — LENTE DEL ASESOR sobre el cubo (inteligencia de mercado para vender)
Prefix /api/asesor/market · auth advisor/asesor_admin/superadmin. El asesor vende across
developments, así que su vista del cubo es la INTELIGENCIA DE MERCADO anónima que le
sirve para su pitch: qué atributo sube el precio (argumento de valor) + zonas calientes.
Reusa los motores del cubo (mismo patrón que la lente del dev).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query

router = APIRouter(prefix="/api/asesor/market", tags=["asesor_market"])
log = logging.getLogger("dmx.routes_asesor_market")

ADVISOR_ROLES = {"advisor", "asesor_admin", "superadmin"}


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ADVISOR_ROLES:
        raise HTTPException(403, "Acceso restringido al portal de asesores")
    return user


@router.get("/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """¿Qué atributo sube el precio/m²? — argumento de valor para tu pitch (hedónico)."""
    await _auth(request)
    import dmx_hedonic_atom
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await dmx_hedonic_atom.fit_and_rank(_db(request), scope)


@router.get("/demand-gap")
async def demand_gap(request: Request, top: int = Query(10, ge=1, le=50)):
    """Zonas y tipologías con demanda alta y poco inventario — dónde hay compradores.
    Con máscara k-anon (celdas <3 unidades no exponen sold/absorción de un competidor identificable)."""
    await _auth(request)
    import dmx_demand
    return dmx_demand.mask_small_cells(await dmx_demand.demand_gap(_db(request), top=top))


# Estados de lead que YA no se trabajan (no son oportunidad viva).
_LEAD_CLOSED = {"cerrado_ganado", "cerrado_perdido", "ganado", "perdido", "descartado", "cancelado"}


@router.get("/oportunidades")
async def oportunidades(request: Request, top: int = Query(20, ge=1, le=60)):
    """OPORTUNIDADES DEL ASESOR — conecta la señal de demanda con TUS clientes y un mensaje listo.

    Reúne 3 piezas que ya existen: (1) demand-gap (dónde hay demanda y poca oferta, por colonia×tipología),
    (2) los desarrollos de esa colonia que el asesor puede ofrecer, (3) los leads del PROPIO asesor en esa
    zona (owner-scoped por assigned_to/asesor_id/owner_id — nunca leads ajenos). Cada lead se convierte en briefing IE
    (pitch + WhatsApp) desde el front reusando BriefingIEModal. No inventa una entidad 'campaña': ordena lo
    existente en 'zona caliente → tus clientes que calzan → el mensaje'."""
    user = await _auth(request)
    db = _db(request)
    import dmx_demand
    from data_developments import DEVELOPMENTS

    dg = await dmx_demand.demand_gap(db, top=max(top, 40))   # pedimos holgado; agrupamos por colonia abajo
    cells = dg.get("cells") or []

    # Demanda agrupada por colonia (varias tipologías por colonia → tomamos la de mayor gap como titular).
    by_col: Dict[str, Dict[str, Any]] = {}
    for c in cells:
        col = c.get("colonia")
        if not col or col == "unknown":
            continue
        e = by_col.setdefault(col, {"colonia": col, "colonia_label": str(col).replace("-", " ").replace("_", " ").title(),
                                    "tipologias": [], "gap_score": None, "verdict": None,
                                    "zone_demand": c.get("zone_demand")})
        e["tipologias"].append({"tipologia": c.get("tipologia"), "gap_score": c.get("gap_score"),
                                "verdict": c.get("verdict"), "available": c.get("available")})
        gs = c.get("gap_score")
        if gs is not None and (e["gap_score"] is None or gs > e["gap_score"]):
            e["gap_score"], e["verdict"] = gs, c.get("verdict")

    # Desarrollos por colonia (lo que el asesor puede ofrecer ahí) + índices dev→nombre/colonia.
    devs_by_col: Dict[str, List[Dict[str, Any]]] = {}
    dev_name: Dict[str, str] = {}
    dev_col: Dict[str, str] = {}
    for d in DEVELOPMENTS:
        did, dcol = d.get("id"), d.get("colonia_id")
        dev_name[did] = d.get("name")
        dev_col[did] = dcol
        if dcol:
            devs_by_col.setdefault(dcol, []).append({"id": did, "name": d.get("name")})

    # Leads del PROPIO asesor, vivos, mapeados a colonia vía su desarrollo. Owner-scoping con los MISMOS
    # campos canónicos que tenant_scope.assert_lead_owner (owner_id/assigned_to/asesor_id) + assignee_id
    # (seed demo). Antes solo assignee_id (que producción nunca escribe) → "tus clientes" salía siempre vacío.
    leads_by_col: Dict[str, List[Dict[str, Any]]] = {}
    try:
        _uid = user.user_id
        cursor = db.leads.find({"$or": [{"assigned_to": _uid}, {"asesor_id": _uid},
                                        {"owner_id": _uid}, {"assignee_id": _uid}]},
                               {"_id": 0, "id": 1, "name": 1, "development_id": 1, "status": 1, "status_v2": 1, "activo": 1})
        async for lead in cursor:
            if lead.get("activo") is False:
                continue
            if (lead.get("status") or "") in _LEAD_CLOSED or (lead.get("status_v2") or "") in _LEAD_CLOSED:
                continue
            col = dev_col.get(lead.get("development_id"))
            if not col:
                continue
            leads_by_col.setdefault(col, []).append({
                "id": lead.get("id"), "name": lead.get("name"),
                "development_id": lead.get("development_id"),
                "development_name": dev_name.get(lead.get("development_id")),
                "status": lead.get("status") or lead.get("status_v2"),
            })
    except Exception as e:  # noqa: BLE001
        log.warning(f"[asesor oportunidades] leads scope falló: {e}")

    out: List[Dict[str, Any]] = []
    for col, e in by_col.items():
        e["tipologias"].sort(key=lambda t: (t["gap_score"] is not None, t["gap_score"] or -1e9), reverse=True)
        e["tipologias"] = e["tipologias"][:5]
        e["desarrollos"] = devs_by_col.get(col, [])
        e["mis_leads"] = leads_by_col.get(col, [])
        e["n_leads"] = len(e["mis_leads"])
        out.append(e)

    # Orden: primero donde TENGO clientes (accionable ya), luego por fuerza de la demanda.
    out.sort(key=lambda e: (e["n_leads"] > 0, e["n_leads"], e["gap_score"] if e["gap_score"] is not None else -1e9), reverse=True)

    return {
        "demand_source": dg.get("demand_source"),
        "es_estimado": dg.get("es_estimado"),
        "lectura_datos": dg.get("lectura_datos"),
        "oportunidades": out[:top],
        "total": len(out),
        "con_leads": sum(1 for e in out if e["n_leads"] > 0),
    }
