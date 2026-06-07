"""
colonias_catalog — Catálogo de colonias por ciudad (EX.1 · build for endstate).
═══════════════════════════════════════════════════════════════════════════════
Hoy: CDMX con 16 colonias curadas. Mañana: crece al ingerir el catálogo oficial
(INEGI/SEDUVI: ~1,800 colonias CDMX con polígono) y al sumar otras ciudades
(Guadalajara, Monterrey, Querétaro, Mérida, Playa del Carmen).

La colección `colonias` y el cargador `upsert_colonias` existen YA: cuando llegue el
dato, se autollena sin tocar el motor (los scores y bandas se calculan por ciudad).
Cero deuda. `coverage()` hace siembra perezosa para que la cobertura sea siempre visible.
"""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.colonias_catalog")


# ── Normalización (mapea catálogos oficiales heterogéneos → doc de colonia) ──
def _slugify(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "colonia"


# campos posibles según el dataset oficial (varían entre fuentes)
_NAME_FIELDS = ["nombre", "colonia", "nom_colonia", "nomgeo", "asentamiento", "asentamien", "nom_col", "name"]
_ALC_FIELDS = ["alcaldia", "alcaldía", "municipio", "nom_mun", "delegacion", "nomgeo_mun"]
_LAT_FIELDS = ["lat", "latitud", "y", "centroid_lat"]
_LON_FIELDS = ["lon", "lng", "longitud", "x", "centroid_lon"]


def _pick(row: Dict[str, Any], fields: List[str]) -> Optional[Any]:
    low = {str(k).lower(): v for k, v in row.items()}
    for f in fields:
        v = low.get(f)
        if v not in (None, ""):
            return v
    return None


def _map_row(row: Dict[str, Any], city: str) -> Optional[Dict[str, Any]]:
    name = _pick(row, _NAME_FIELDS)
    if not name:
        return None
    alc = _pick(row, _ALC_FIELDS)
    lat, lon = _pick(row, _LAT_FIELDS), _pick(row, _LON_FIELDS)
    center = None
    try:
        if lat is not None and lon is not None:
            center = [float(lon), float(lat)]
    except (TypeError, ValueError):
        center = None
    cid = _slugify(f"{name}-{alc}" if alc else name)
    return {
        "id": cid, "name": str(name).title(), "city": city,
        "alcaldia": (str(alc).title() if alc else None), "center": center,
        "source": "catalogo_oficial",
    }


async def seed_colonias(db) -> int:
    """Siembra/actualiza el catálogo desde data_seed.COLONIAS (idempotente · upsert por id)."""
    from data_seed import COLONIAS, CITY_DEFAULT
    n = 0
    for c in COLONIAS:
        doc = {
            "id": c["id"], "name": c.get("name"), "city": c.get("city", CITY_DEFAULT),
            "alcaldia": c.get("alcaldia"), "center": c.get("center"),
            "tier": c.get("tier"), "source": "seed",
        }
        await db.colonias.update_one({"id": c["id"]}, {"$set": doc}, upsert=True)
        n += 1
    return n


async def upsert_colonias(db, city: str, items: List[Dict[str, Any]]) -> int:
    """Cargador para el catálogo futuro (oficial u otra ciudad). Upsert por id.

    `items`: lista de dicts con al menos `id`/`slug` y `name`. Se etiqueta con `city`.
    Es el pipe que conecta la ingesta del catálogo oficial → la plataforma. Cero deuda.
    """
    n = 0
    for it in items:
        cid = it.get("id") or it.get("slug")
        if not cid:
            continue
        doc = {**it, "id": cid, "city": city, "source": it.get("source", "ingesta")}
        await db.colonias.update_one({"id": cid}, {"$set": doc}, upsert=True)
        n += 1
    log.info(f"[colonias_catalog] upsert {n} colonias · city={city}")
    return n


async def coverage(db) -> Dict[str, Any]:
    """Cobertura de colonias por ciudad (siembra perezosa si la colección está vacía)."""
    try:
        if await db.colonias.count_documents({}) == 0:
            await seed_colonias(db)
        rows: List[Dict[str, Any]] = []
        async for r in db.colonias.aggregate([
            {"$group": {
                "_id": "$city",
                "count": {"$sum": 1},
                "con_reales": {"$sum": {"$cond": [{"$gt": ["$scores_cobertura_pct", 0]}, 1, 0]}},
            }},
            {"$sort": {"count": -1}},
        ]):
            rows.append({"city": r["_id"] or "—", "colonias": r["count"],
                         "con_scores_reales": r.get("con_reales", 0)})
        total = sum(r["colonias"] for r in rows)
        con_reales = sum(r["con_scores_reales"] for r in rows)
        return {"ciudades": rows, "total_colonias": total, "total_ciudades": len(rows),
                "total_con_scores_reales": con_reales, "total_pendientes": total - con_reales}
    except Exception as e:  # fail-open: la cobertura nunca rompe la página
        log.warning(f"[colonias_catalog] coverage: {e}")
        return {"ciudades": [], "total_colonias": 0, "total_ciudades": 0}


# ── Ingesta del catálogo oficial (EX.1 · CKAN o GeoJSON) ─────────────────────
def _ckan_base() -> str:
    base = (os.environ.get("IE_DATOS_CDMX_BASE_URL") or "https://datos.cdmx.gob.mx/api/3/action").rstrip("/")
    if base.endswith("/datastore_search"):
        base = base[: -len("/datastore_search")]
    return base


async def _fetch_ckan(resource_id: str, *, page: int = 1000, max_rows: int = 6000) -> List[Dict[str, Any]]:
    """datastore_search paginado (tope de seguridad max_rows · no silencioso: lo logguea)."""
    import httpx
    out: List[Dict[str, Any]] = []
    offset = 0
    base = _ckan_base()
    async with httpx.AsyncClient(timeout=30) as http:
        while offset < max_rows:
            r = await http.get(f"{base}/datastore_search",
                               params={"resource_id": resource_id, "limit": page, "offset": offset})
            if r.status_code != 200 or not r.json().get("success"):
                break
            recs = r.json().get("result", {}).get("records", [])
            if not recs:
                break
            out.extend(recs)
            if len(recs) < page:
                break
            offset += page
    if len(out) >= max_rows:
        log.warning(f"[colonias_catalog] ingesta CKAN alcanzó el tope {max_rows} · puede haber más colonias")
    return out


async def _fetch_geojson(url: str) -> List[Dict[str, Any]]:
    """GeoJSON de colonias → filas planas (properties + centroide aproximado del polígono)."""
    import httpx
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(url)
        r.raise_for_status()
        gj = r.json()
    rows: List[Dict[str, Any]] = []
    for f in (gj.get("features") or []):
        props = dict(f.get("properties") or {})
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        # centroide simple (promedio de vértices del primer anillo) si lo hay
        flat: List[List[float]] = []
        def _walk(c):
            if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
                flat.append(c)
            elif isinstance(c, (list, tuple)):
                for x in c:
                    _walk(x)
        _walk(coords)
        if flat:
            props.setdefault("lon", sum(p[0] for p in flat) / len(flat))
            props.setdefault("lat", sum(p[1] for p in flat) / len(flat))
        rows.append(props)
    return rows


async def compute_catalog_scores(db, city: str = "CDMX", limit: int = 2500) -> Dict[str, Any]:
    """Calcula scores REALES (puente score_bridge → SESNSP/DENUE/DRPI) para cada colonia del
    catálogo de la ciudad y los guarda en su doc. EX.2 · data-driven. Lo que no tenga dato
    queda pendiente (honesto, cero deuda). `limit` = tope de seguridad para corridas grandes."""
    import score_bridge as sb
    computed = con_reales = 0
    cur = db.colonias.find({"city": city}, {"_id": 0, "id": 1})
    async for c in cur:
        if computed >= limit:
            log.warning(f"[colonias_catalog] compute_scores alcanzó el tope {limit} · {city}")
            break
        zid = c.get("id")
        if not zid:
            continue
        r = await sb.real_scores_for(db, zid)
        await db.colonias.update_one({"id": zid}, {"$set": {
            "scores_reales": r["scores"], "scores_fuentes": r["fuentes"],
            "scores_cobertura_pct": r["cobertura_pct"], "scores_es_estimado": r["es_estimado"],
        }})
        computed += 1
        if r["reales"] > 0:
            con_reales += 1
    return {
        "ok": True, "city": city, "computadas": computed,
        "con_scores_reales": con_reales, "pendientes": computed - con_reales,
        "cobertura": await coverage(db),
    }


async def sync_denue_for_city(db, city: str = "CDMX", limit: int = 60, radius_m: int = 1500) -> Dict[str, Any]:
    """Sincroniza la densidad DENUE real (negocios) de cada colonia usando SU centro real,
    y luego recalcula los scores. Una sola acción que cierra el ciclo dato→score.
    Honesto: si DENUE no responde (API caída/token), no inventa — reporta 0 con datos.
    `limit` acota la corrida del botón; el cron semanal cubre el catálogo completo."""
    import denue_engine as de
    sincronizadas = con_datos = 0
    cur = db.colonias.find({"city": city, "center": {"$ne": None}}, {"_id": 0, "id": 1, "center": 1})
    async for c in cur:
        if sincronizadas >= limit:
            log.warning(f"[colonias_catalog] sync DENUE alcanzó el tope {limit} · {city}")
            break
        ctr = c.get("center")
        if not (isinstance(ctr, (list, tuple)) and len(ctr) == 2):
            continue
        lng, lat = float(ctr[0]), float(ctr[1])   # el catálogo guarda [lng, lat]
        try:
            d = await de.compute_zone_density(db, c["id"], "colonia", radius_m=radius_m, lat=lat, lng=lng)
            sincronizadas += 1
            if (d.get("businesses_count_total") or 0) > 0:
                con_datos += 1
        except Exception as e:
            log.warning(f"[colonias_catalog] sync DENUE {c.get('id')}: {e}")
    # Recalcula scores con la densidad nueva (cierra el ciclo)
    scores = await compute_catalog_scores(db, city)
    nota = None if con_datos else ("DENUE no devolvió negocios — verifica que IE_DENUE_TOKEN sea "
                                   "válido y que el API de INEGI sea alcanzable desde el servidor.")
    return {
        "ok": True, "city": city, "sincronizadas": sincronizadas, "con_datos": con_datos,
        "scores": {"con_scores_reales": scores["con_scores_reales"], "pendientes": scores["pendientes"]},
        "nota": nota, "cobertura": scores["cobertura"],
    }


async def ingest_official_catalog(db, city: str = "CDMX") -> Dict[str, Any]:
    """Carga el catálogo oficial de colonias de una ciudad. Fuentes (en orden):
      1) CKAN  → env `IE_COLONIAS_CDMX_RESOURCE_ID` (datos.cdmx datastore_search)
      2) GeoJSON → env `IE_COLONIAS_CDMX_URL`
    Sin fuente configurada → no-op HONESTO con instrucción (cero deuda · build for endstate).
    """
    rid = os.environ.get("IE_COLONIAS_CDMX_RESOURCE_ID")
    url = os.environ.get("IE_COLONIAS_CDMX_URL")
    try:
        if rid:
            raw = await _fetch_ckan(rid)
            fuente = "ckan"
        elif url:
            raw = await _fetch_geojson(url)
            fuente = "geojson"
        else:
            return {
                "ok": False,
                "reason": ("Configura el catálogo oficial: pon en el .env del backend "
                           "IE_COLONIAS_CDMX_RESOURCE_ID (resource_id de colonias en datos.cdmx) "
                           "o IE_COLONIAS_CDMX_URL (un GeoJSON de colonias). Luego vuelve a cargar."),
                "cargadas": 0, "cobertura": await coverage(db),
            }
        items = [m for m in (_map_row(x, city) for x in raw) if m]
        # dedup por id (catálogos a veces repiten)
        items = list({m["id"]: m for m in items}.values())
        n = await upsert_colonias(db, city, items) if items else 0
        return {
            "ok": True, "fuente": fuente, "leidas": len(raw), "cargadas": n, "city": city,
            "cobertura": await coverage(db),
        }
    except Exception as e:
        log.warning(f"[colonias_catalog] ingesta {city}: {e}")
        return {"ok": False, "reason": f"Error al cargar el catálogo: {e}", "cargadas": 0,
                "cobertura": await coverage(db)}
