"""
DMX · Fase 1.4 — CONECTORES EXTERNOS → ZONA (listos y dormidos)
═══════════════════════════════════════════════════════════════════════════════
Cablea las fuentes externas (AirROI renta-corta, GTFS transporte, OSM negocios,
catastro) a la Zona (dmx_zones). Reusa el patrón connectors_ie (get_connector +
fetch() que devuelve obs con is_stub=True cuando no hay API key) → el conector está
CONECTADO pero DORMIDO: entrega valores estimados/stub hasta que se configure la key,
y entonces se autollena con dato real sin tocar código.

Founder ruling: "sin datos ≠ humo" — todo conectado, se activa al llegar el dato.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS

ZONES = COLLECTIONS["zones"]

# Fuentes que alimentan la zona. (airroi/gtfs_cdmx ya son conectores; osm/catastro
# quedan declarados dormidos hasta tener conector/ token.)
ZONE_SOURCES = ["airroi", "gtfs_cdmx", "osm", "catastro"]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _first_num(payloads: List[Dict[str, Any]], *keys) -> Optional[float]:
    for p in payloads:
        for k in keys:
            v = (p or {}).get(k)
            if isinstance(v, (int, float)):
                return float(v)
    return None


async def _fetch_source(source_id: str, zone_id: str, db=None) -> Dict[str, Any]:
    """Llama un conector; nunca lanza. Devuelve {payloads..., is_stub}.

    [AUD-026] airroi (API de PAGO) SIEMPRE pasa por el candado único `_airroi_zone`
    (1 llamada/zona/mes + tope global 400/mes, caché compartida en db.airroi_cache) —
    NUNCA llama al conector directo. Así esta ruta (enrich) comparte cache+cap con la de
    demand_intelligence: un solo gate de costo para toda la app, imposible cobrar de más."""
    try:
        if source_id == "airroi":
            if db is None:
                return {"payloads": [], "is_stub": True, "note": "airroi requiere db (gate de costo)"}
            from demand_intelligence import _airroi_zone
            data = await _airroi_zone(db, zone_id)
            if not data:
                return {"payloads": [], "is_stub": True, "count": 0}
            payload = {"revenue": data.get("revenue_anual"), "adr": data.get("adr"),
                       "occupancy": data.get("occupancy")}
            return {"payloads": [payload], "is_stub": False, "count": 1}
        import connectors_ie as ci
        if source_id not in {**ci._REAL, **ci._NAMED_STUBS}:
            return {"is_stub": True, "dormant": True, "note": "sin conector aún"}
        conn = ci.get_connector({"id": source_id}, {})
        obs = await conn.fetch(zone_id=zone_id)
        payloads = [(o.get("payload") or {}) for o in (obs or [])]
        is_stub = any(o.get("is_stub") for o in (obs or [])) or not obs
        return {"payloads": payloads, "is_stub": is_stub, "count": len(obs or [])}
    except Exception as e:
        return {"is_stub": True, "dormant": True, "note": str(e)[:120]}


async def enrich_zone(db, zone_id: str) -> Dict[str, Any]:
    """Enriquece una zona con las fuentes externas. Dormant-safe (marca is_stub)."""
    ext: Dict[str, Any] = {"zone_id": zone_id, "updated_at": _iso()}
    stub_flags: Dict[str, bool] = {}

    # AirROI — renta corta (ROI inversión) · pasa por el candado cacheado+capado (db)
    air = await _fetch_source("airroi", zone_id, db=db)
    ext["airroi"] = {
        "annual_revenue_mxn": _first_num(air.get("payloads", []), "annual_revenue", "revenue"),
        "adr_mxn": _first_num(air.get("payloads", []), "adr", "average_daily_rate"),
        "occupancy_pct": _first_num(air.get("payloads", []), "occupancy", "occupancy_rate"),
        "is_stub": air.get("is_stub", True),
    }
    stub_flags["airroi"] = air.get("is_stub", True)

    # GTFS — transporte (líneas/estaciones cercanas)
    gt = await _fetch_source("gtfs_cdmx", zone_id)
    lineas = sum((p.get("lineas") or 0) for p in gt.get("payloads", [])) or None
    estaciones = sum((p.get("estaciones") or 0) for p in gt.get("payloads", [])) or None
    ext["transit"] = {"lineas": lineas, "estaciones": estaciones, "is_stub": gt.get("is_stub", True)}
    stub_flags["gtfs_cdmx"] = gt.get("is_stub", True)

    # Densidad de negocios — OSM (la API de DENUE nunca funcionó · eliminada).
    try:
        import osm_engine as _osm
        _dens = await _osm.get_zone_density(db, zone_id)
    except Exception:
        _dens = None
    ext["negocios"] = {"total": (_dens or {}).get("businesses_count_total"),
                       "por_km2": (_dens or {}).get("businesses_per_km2"),
                       "source": "osm", "is_stub": not bool(_dens)}
    stub_flags["negocios"] = not bool(_dens)

    # Catastro — dormido (placeholder)
    ext["catastro"] = {"is_stub": True, "dormant": True}
    stub_flags["catastro"] = True

    ext["all_stub"] = all(stub_flags.values())
    ext["sources_stub"] = stub_flags

    # Escribir en dmx_zones (upsert · external = capa de fuentes externas)
    await db[ZONES].update_one(
        {"zone_id": zone_id},
        {"$set": {"zone_id": zone_id, "external": ext, "updated_at": _iso()},
         "$setOnInsert": {"tier": "colonia", "created_at": _iso()}},
        upsert=True,
    )
    return ext


async def enrich_all_zones(db, zone_ids: List[str]) -> Dict[str, Any]:
    """Enriquece varias zonas. Idempotente."""
    n = 0
    for z in zone_ids:
        await enrich_zone(db, z)
        n += 1
    return {"enriched": n, "sources": ZONE_SOURCES}
