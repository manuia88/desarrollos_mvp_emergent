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


@router.post("/api/superadmin/colonias/ingest")
async def superadmin_colonias_ingest(
    request: Request,
    city: str = Query("CDMX", description="ciudad a cargar"),
):
    """Carga el catálogo oficial de colonias de una ciudad (EX.1). Sin fuente configurada,
    responde con la instrucción de qué env var poner (no-op honesto)."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.ingest_official_catalog(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/compute-scores")
async def superadmin_colonias_compute_scores(
    request: Request,
    city: str = Query("CDMX", description="ciudad a computar"),
):
    """Calcula scores REALES por colonia desde el dato (SESNSP/DENUE/DRPI) y los guarda (EX.2).
    Lo que no tenga dato queda pendiente y se autollena al ingestar (honesto)."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.compute_catalog_scores(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/sync-comercios")
async def superadmin_colonias_sync_comercios(
    request: Request,
    city: str = Query("CDMX", description="ciudad a sincronizar"),
    source: str = Query("osm", description="osm (gratis · default) | denue (respaldo)"),
):
    """Sincroniza la densidad real de comercios por colonia (OSM por defecto · gratis y confiable)
    usando su centro + recalcula scores. Cierra el ciclo dato→score en un clic. Honesto si la
    fuente no responde."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.sync_business_density(request.app.state.db, city=city, source=source)


@router.post("/api/superadmin/colonias/sync-seguridad")
async def superadmin_colonias_sync_seguridad(
    request: Request,
    city: str = Query("CDMX", description="ciudad a sincronizar"),
):
    """Sincroniza seguridad real por colonia (FGJ CDMX · carpetas de investigación) + recalcula
    scores. Score por percentil de incidentes de la ciudad. Cierra el ciclo dato→score."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.sync_seguridad(request.app.state.db, city=city)


@router.get("/api/superadmin/shf")
async def superadmin_shf(request: Request):
    """Índice SHF (plusvalía OFICIAL) — snapshot + plusvalía por alcaldía CDMX (ING.3). Las 5
    alcaldías con índice propio + el promedio estatal que heredan las otras 11."""
    await _sa(request)
    import shf_engine as shf
    db = request.app.state.db
    doc = await shf.ensure_shf(db)
    alcaldias = doc.get("alcaldias") or {}
    tabla = [{"alcaldia": k, **v, "es_propio": True} for k, v in alcaldias.items()]
    tabla.sort(key=lambda r: -(r.get("plusvalia_anual_pct") or 0))
    est = doc.get("cdmx_estatal") or {}
    serie_n = await db.shf_series.count_documents({})
    return {
        "snapshot": {k: doc.get(k) for k in
                     ("periodo", "fuente", "nacional_anual_pct", "nueva_anual_pct",
                      "usada_anual_pct", "avaluo_mediana", "zm_valle_mexico_anual_pct")},
        "cdmx_estatal": {"alcaldia": "Promedio CDMX", **est, "es_propio": False},
        "alcaldias": tabla, "serie_filas": serie_n,
    }


@router.get("/api/superadmin/shf/serie")
async def superadmin_shf_serie(request: Request, alcaldia: Optional[str] = Query(None)):
    """Serie histórica trimestral del índice SHF (para la gráfica de plusvalía)."""
    await _sa(request)
    import shf_engine as shf
    return await shf.get_series(request.app.state.db, alcaldia=alcaldia, desde_anio=2005)


@router.post("/api/superadmin/shf/refresh")
async def superadmin_shf_refresh(request: Request):
    """Refresca SHF desde el XLSX oficial (snapshot + serie por alcaldía). Si el CDN no es
    alcanzable, conserva el valor oficial sembrado + la serie del repo (honesto)."""
    await _sa(request)
    import shf_engine as shf
    return await shf.refresh_from_xlsx(request.app.state.db)


@router.post("/api/superadmin/colonias/sync-catastro")
async def superadmin_colonias_sync_catastro(
    request: Request,
    city: str = Query("CDMX", description="ciudad a sincronizar"),
):
    """Sincroniza el valor catastral OFICIAL del suelo ($/m²) por colonia desde el WFS de la SIG
    CDMX (predios2022sig_local · vsuelo/área). Base oficial granular de valuación (ING.1/2)."""
    await _sa(request)
    import sig_catastro_engine as sig
    return await sig.sync_vsuelo_for_city(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/sync-zonificacion")
async def superadmin_colonias_sync_zonificacion(
    request: Request,
    city: str = Query("CDMX", description="ciudad a sincronizar"),
):
    """F1.0 · Sincroniza la ZONIFICACIÓN por colonia (uso de suelo + COS + CUS + niveles) agregando
    los predios del SIG CDMX. Base para el Valor Residual ('¿cuánto puedo construir aquí?')."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.sync_zonificacion_for_city(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/dedupe")
async def superadmin_colonias_dedupe(
    request: Request,
    city: str = Query("CDMX", description="ciudad a deduplicar"),
):
    """F1.0 · Unifica el padrón de colonias: fusiona las que vienen duplicadas de dos catálogos
    oficiales (uso de suelo + delito) en UNA por colonia real, conservando todo el dato. Idempotente."""
    await _sa(request)
    import colonias_catalog as cc
    return await cc.dedupe_colonias(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/recalibrate-comercial")
async def superadmin_colonias_recalibrate_comercial(
    request: Request,
    city: str = Query("CDMX", description="ciudad a recalibrar"),
):
    """Recalibra el modelo del valor del SUELO al valor COMERCIAL (ING.2): aprende la relación con
    las colonias que tienen valor catastral Y ventas reales, y mide su fiabilidad (R²). Honesto:
    con pocas ventas no estima, solo deja el suelo como piso. Cada venta lo afina (flywheel)."""
    await _sa(request)
    import comercial_value_model as cvm
    return await cvm.recalibrate(request.app.state.db, city=city)


@router.get("/api/superadmin/colonias/calibracion-comercial")
async def superadmin_colonias_calibracion(
    request: Request,
    city: str = Query("CDMX", description="ciudad"),
):
    """Estado del modelo suelo→comercial (coeficientes, R², confianza, muestras)."""
    await _sa(request)
    import comercial_value_model as cvm
    return await cvm.get_calibration(request.app.state.db, city=city)


@router.get("/api/superadmin/colonias/valores-unitarios")
async def superadmin_valores_unitarios_status(request: Request, city: str = Query("CDMX")):
    """Estado del conector de Valores Unitarios oficiales 2026 (ING.2b · stub-ready)."""
    await _sa(request)
    import valores_unitarios_engine as vu
    return await vu.status(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/valores-unitarios/ingest")
async def superadmin_valores_unitarios_ingest(request: Request, city: str = Query("CDMX")):
    """Carga la tabla oficial 2026 desde la fuente configurada (Gaceta). Honesto si no hay URL."""
    await _sa(request)
    import valores_unitarios_engine as vu
    return await vu.ingest_from_source(request.app.state.db, city=city)


@router.post("/api/superadmin/colonias/fill-chunk")
async def superadmin_colonias_fill_chunk(
    request: Request,
    city: str = Query("CDMX", description="ciudad"),
    chunk: int = Query(40, ge=5, le=120, description="cuántas colonias por lote"),
):
    """Llena un lote de colonias (comercios OSM + seguridad FGJ + scores). El cron sigue solo
    cada 12 min. Sirve para arrancar el llenado ahora y ver el avance."""
    await _sa(request)
    import zone_data_cron as zc
    return await zc.run_zone_data_chunk(request.app.state.db, city=city, chunk=chunk)
