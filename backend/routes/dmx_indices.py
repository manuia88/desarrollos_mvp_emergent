"""Índices DMX (I04) — endpoints del producto licenciable.

Público (tier-gated, espeja DRPI):
  GET /api/indices/zona/{zone_id}   — los 5 índices + maestro IDM de una colonia.
                                       free → letra + banda (cualitativo);
                                       pro/enterprise → valores exactos + lecturas + jugada.

Superadmin (terminal · alimenta la vista vendible):
  GET /api/superadmin/indices       — todas las colonias × 5 índices, ordenadas por IDM.

El cálculo vive en dmx_indices_engine (mismo motor que usa el dev y el comprador).
La absorción real por zona se agrega desde DEVELOPMENTS (vendido/total del mercado).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

import dmx_indices_engine as ix

log = logging.getLogger("dmx.routes_indices")

router = APIRouter(tags=["indices_dmx"])


async def _sa(request: Request):
    from permissions import require_superadmin
    return await require_superadmin(request)


async def _user_tier(request: Request) -> str:
    """free | pro | enterprise — espeja drpi._user_tier."""
    try:
        from server import get_current_user
        user = await get_current_user(request)
        if not user:
            return "free"
        if getattr(user, "role", "") == "superadmin":
            return "enterprise"
        db = request.app.state.db
        tenant_id = getattr(user, "tenant_id", None)
        if tenant_id:
            org = await db.organizations.find_one(
                {"tenant_id": tenant_id}, {"_id": 0, "plan": 1, "tier": 1},
            )
            if org:
                p = (org.get("plan") or org.get("tier") or "").lower()
                if p in ("enterprise", "premium"):
                    return "enterprise"
                if p in ("pro", "growth", "trial"):
                    return "pro"
        return "free"
    except Exception:
        return "free"


def _market_absorcion_by_colonia() -> Dict[str, Dict[str, int]]:
    """Absorción de mercado por colonia (vendido/total de TODOS los proyectos)."""
    from data_developments import DEVELOPMENTS
    agg: Dict[str, Dict[str, int]] = {}
    for d in DEVELOPMENTS:
        zn = d.get("colonia")
        if not zn:
            continue
        a = agg.setdefault(zn, {"sold": 0, "total": 0})
        units = d.get("units") or []
        if units:
            a["sold"] += sum(1 for u in units if u.get("status") == "vendido")
            a["total"] += len(units)
        else:
            a["sold"] += int(d.get("units_sold") or 0)
            a["total"] += int(d.get("units_total") or 0)
    return agg


def _ctx_for(colonia: Dict[str, Any], abs_map: Dict[str, Dict[str, int]]) -> Dict[str, Any]:
    a = abs_map.get(colonia.get("name")) or {}
    ctx: Dict[str, Any] = {}
    if a.get("total"):
        ctx["absorcion_pct"] = round(a["sold"] / a["total"] * 100, 1)
    return ctx


def _qualitative(result: Dict[str, Any]) -> Dict[str, Any]:
    """Vista free: nivel honesto (Alta/Media/Baja) sin el número exacto (gating)."""
    out = {
        "zona": result["zona"], "tier": result["tier"],
        "idm": {k: result["idm"].get(k) for k in
                ("nombre", "nivel", "etiqueta", "banda", "color", "fuente", "comparado_con")},
        "indices": [{"key": i["key"], "nombre": i["nombre"], "que_mide": i["que_mide"],
                     "nivel": i["nivel"], "etiqueta": i["etiqueta"],
                     "banda": i["banda"], "color": i["color"], "es_estimado": i["es_estimado"]}
                    for i in result["indices"]],
        "senal_leyenda": ix.signal_leyenda(),
        "upgrade_required": "pro",
        "nota": "Los valores exactos, las lecturas y la jugada están en el plan Pro/Enterprise.",
    }
    return out


# ── Público (tier-gated) ──
@router.get("/api/indices/zona/{zone_id}")
async def public_zone_indices(zone_id: str, request: Request):
    from data_seed import COLONIAS
    colonia = next((c for c in COLONIAS if c.get("id") == zone_id or c.get("name") == zone_id), None)
    if not colonia:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    abs_map = _market_absorcion_by_colonia()
    # Banda por percentil real: compara esta zona contra TODA la ciudad (lazy · idempotente).
    ix.ensure_index_distributions(COLONIAS, ctx_fn=lambda c: _ctx_for(c, abs_map))
    result = ix.compute_indices(colonia, _ctx_for(colonia, abs_map))
    result["senal_leyenda"] = ix.signal_leyenda(result.get("city") or "CDMX")
    tier_label = await _user_tier(request)
    if tier_label == "free":
        return {"tier_label": "free", "source": "via DMX Índices", **_qualitative(result)}
    result["jugada"] = ix.indices_play(result)
    return {"tier_label": tier_label, "source": "via DMX Índices", **result}


# ── Superadmin (terminal vendible) ──
@router.get("/api/superadmin/indices")
async def superadmin_indices(
    request: Request,
    tier: Optional[str] = Query(None, description="filtrar por tier de colonia"),
    limit: int = Query(100, ge=1, le=500),
):
    await _sa(request)
    from data_seed import COLONIAS
    abs_map = _market_absorcion_by_colonia()
    ix.ensure_index_distributions(COLONIAS, ctx_fn=lambda c: _ctx_for(c, abs_map))
    rows: List[Dict[str, Any]] = []
    for c in COLONIAS:
        if tier and (c.get("tier") or "").lower() != tier.lower():
            continue
        r = ix.compute_indices(c, _ctx_for(c, abs_map))
        rows.append(r)
    rows.sort(key=lambda x: -x["idm"]["valor"])
    rows = rows[:limit]
    # KPIs de la malla (para la cabecera del terminal)
    n = len(rows) or 1
    avg_idm = round(sum(r["idm"]["valor"] for r in rows) / n, 1)
    top = rows[0] if rows else None
    return {
        "items": rows, "count": len(rows),
        "kpis": {
            "avg_idm": avg_idm,
            "zona_top": top["zona"] if top else None,
            "idm_top": top["idm"]["valor"] if top else None,
            "grado_A": sum(1 for r in rows if r["idm"]["letra"] == "A"),
        },
        "leyenda": [{"key": k, **v} for k, v in ix.INDICES_META.items()],
        "idm_meta": ix.IDM_META,
        "senal_leyenda": ix.signal_leyenda(),
        "cobertura": await _colonias_coverage(request),
    }


async def _colonias_coverage(request: Request) -> Dict[str, Any]:
    """Cobertura de colonias por ciudad (para la cabecera del terminal · fail-open)."""
    try:
        import colonias_catalog as cc
        return await cc.coverage(request.app.state.db)
    except Exception:
        return {"ciudades": [], "total_colonias": 0, "total_ciudades": 0}


@router.get("/api/superadmin/colonias/coverage")
async def superadmin_colonias_coverage(request: Request):
    """Catálogo de colonias por ciudad — cuántas cubre cada mercado (EX.1)."""
    await _sa(request)
    return await _colonias_coverage(request)
