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


async def public_catalog(db, limit: int = 1000) -> List[Dict[str, Any]]:
    """Lista pública del catálogo REAL de colonias (db.colonias) para la cara pública
    (página de barrios, SEO). Crece solo con el sync SIG/zonificación. Siembra perezosa:
    si la colección está vacía cae al seed → nunca devuelve lista vacía en entorno limpio.
    Ordena las colonias CON dato real primero, luego alfabético. Cada item: {id, name,
    alcaldia, has_data}. Fuente única reusable (no dupliques este query en routers)."""
    if await db.colonias.count_documents({}) == 0:
        await seed_colonias(db)
    rows: List[Dict[str, Any]] = []
    async for c in db.colonias.find(
        {}, {"_id": 0, "id": 1, "name": 1, "alcaldia": 1,
             "scores_cobertura_pct": 1, "cus": 1, "vsuelo_pm2_catastral": 1},
    ).limit(int(limit)):
        cid, name = c.get("id"), c.get("name")
        if not cid or not name:
            continue
        has_data = bool((c.get("scores_cobertura_pct") or 0) > 0
                        or (c.get("cus") or 0) > 0
                        or (c.get("vsuelo_pm2_catastral") or 0) > 0)
        rows.append({"id": cid, "name": name,
                     "alcaldia": c.get("alcaldia"), "has_data": has_data})
    # Las que YA tienen lectura real primero; dentro de cada grupo, alfabético.
    rows.sort(key=lambda r: (not r["has_data"], (r["name"] or "").lower()))
    return rows


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


def _zf(v):
    try:
        s = str(v).strip().replace("%", "")
        return float(s) if s and s.replace(".", "", 1).replace("-", "", 1).isdigit() else None
    except Exception:
        return None


def _zi(v):
    f = _zf(v)
    return int(f) if f is not None else None


async def sync_zonificacion_for_city(db, city: str = "CDMX", alcaldias: Optional[List[str]] = None) -> Dict[str, Any]:
    """F1.0 · Agrega la zonificación PREDIO a PREDIO (uso de suelo · área libre · niveles ·
    densidad del SIG CDMX) → COS/CUS POR COLONIA. Reusa `SIGCDMXEngine.fetch_alcaldia`.
    Fórmula oficial: COS = 1 − (%área libre); CUS ≈ COS × niveles. Honesto: la colonia que
    no tenga predios con dato queda sin COS/CUS (cero deuda). Cada número es DATO real del SIG."""
    import statistics
    from datetime import datetime, timezone
    from data_sources.sigcdmx_engine import SIGCDMXEngine, ALCALDIAS
    iso = lambda: datetime.now(timezone.utc).isoformat()
    eng = SIGCDMXEngine(db)
    targets = alcaldias or ALCALDIAS
    by_col: Dict[str, Dict[str, Any]] = {}
    alc_ok = 0
    for alc in targets:
        try:
            rows = await eng.fetch_alcaldia(alc)
        except Exception as e:
            log.warning(f"[zonif] {alc} fuente: {e}")
            continue
        if not rows:
            continue
        alc_ok += 1
        alc_title = alc.replace("_", " ").title()
        for r in rows:
            rm = r.get("raw_metadata") or {}
            col = (rm.get("colonia") or "").strip()
            if not col:
                continue
            slug = _slugify(f"{col}-{alc_title}")
            d = by_col.setdefault(slug, {
                "name": (col.title() if col.isupper() else col), "alcaldia": alc_title,
                "uso": [], "al": [], "niv": [], "dens": [], "lng": [], "lat": []})
            plng, plat = _zf(rm.get("longitud")), _zf(rm.get("latitud"))
            if plng is not None and plat is not None and -100 < plng < -98 and 19 < plat < 20:
                d["lng"].append(plng); d["lat"].append(plat)
            uso = r.get("uso_suelo_categoria") or rm.get("uso_descri")
            if uso and str(uso) != "n/d":
                d["uso"].append(str(uso))
            al = _zf(rm.get("area_libre"))
            if al is not None and 0 <= al <= 100:
                d["al"].append(al)
            niv = r.get("niveles_max") or _zi(rm.get("niveles"))
            if niv and 0 < niv < 80:
                d["niv"].append(niv)
            dens = rm.get("densidad_d") or r.get("densidad_permitida")
            if dens and str(dens).upper() not in ("NA", "N/D", ""):
                d["dens"].append(str(dens))
    escritas = con_coscus = 0
    for slug, d in by_col.items():
        if not d["niv"] and not d["al"]:
            continue
        uso_modal = max(set(d["uso"]), key=d["uso"].count) if d["uso"] else None
        al_med = round(statistics.median(d["al"]), 1) if d["al"] else None   # % área libre
        niv_med = round(statistics.median(d["niv"])) if d["niv"] else None
        dens_modal = max(set(d["dens"]), key=d["dens"].count) if d["dens"] else None
        cos = round(1 - (al_med / 100.0), 3) if al_med is not None else None  # COS = 1 − %área libre
        cus = round(cos * niv_med, 2) if (cos is not None and niv_med) else None
        center = [round(statistics.median(d["lng"]), 6), round(statistics.median(d["lat"]), 6)] if d["lng"] and d["lat"] else None
        upd = {"zonif_uso": uso_modal, "zonif_area_libre_pct": al_med, "zonif_niveles": niv_med,
               "zonif_densidad": dens_modal, "cos": cos, "cus": cus,
               "zonif_n": len(d["niv"] or d["al"]), "zonif_synced_at": iso()}
        if center:
            upd["center"] = center  # centroide REAL del SIG (promedio de predios) → habilita el match por cercanía
        await db.colonias.update_one(
            {"id": slug},
            {"$set": {k: v for k, v in upd.items() if v is not None},
             "$setOnInsert": {"id": slug, "city": city, "name": d["name"],
                              "alcaldia": d["alcaldia"], "source": "sigcdmx_zonif"}},
            upsert=True)
        escritas += 1
        if cos is not None and cus is not None:
            con_coscus += 1
    return {"ok": True, "city": city, "alcaldias_procesadas": alc_ok,
            "colonias_con_zonificacion": escritas, "con_cos_cus": con_coscus,
            "cobertura": await coverage(db)}


async def dedupe_colonias(db, city: str = "CDMX", max_km: float = 1.6) -> Dict[str, Any]:
    """F1.0 · Unifica el padrón: la misma colonia real venía DUPLICADA (catálogo de uso de suelo
    vs catálogo de delito, con nombres distintos). Las fusiona en UNA por colonia real (mismo
    nombre normalizado + centroides cercanos ≤ max_km), conservando TODO el dato. Idempotente.
    Prioridad de superviviente: seed (ids curados que usa la app) > con COS/CUS > con valor de suelo.
    Guarda los ids fusionados en `aliases` (no se pierde ninguna referencia · cero deuda)."""
    import math
    import unicodedata as _ud
    import re as _re
    from datetime import datetime, timezone
    from collections import defaultdict

    def _norm(s: Any) -> str:
        s = _ud.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
        s = _re.sub(r"[^a-z0-9 ]", " ", s)
        s = _re.sub(r"\b(col|colonia|u h|unidad habitacional|ampliacion|ampl|fraccionamiento|fracc)\b", " ", s)
        return _re.sub(r"\s+", " ", s).strip()

    def _km(a, b) -> float:
        if not (isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)) and len(a) == 2 and len(b) == 2):
            return 9999.0
        return math.hypot((a[1] - b[1]) * 111.0, (a[0] - b[0]) * 105.0)

    def _rank(c: Dict[str, Any]) -> int:
        r = 0
        if c.get("source") == "seed":
            r += 100000
        if (c.get("cus") or 0) > 0:
            r += 10000
        if (c.get("vsuelo_pm2_catastral") or 0) > 0:
            r += 5000
        if (c.get("scores_cobertura_pct") or 0) > 0:
            r += 1000
        return r + sum(1 for v in c.values() if v not in (None, 0, ""))

    iso = datetime.now(timezone.utc).isoformat()
    _MERGE = ["vsuelo_pm2_catastral", "vsuelo_n", "vsuelo_score", "vsuelo_synced_at",
              "cos", "cus", "zonif_uso", "zonif_area_libre_pct", "zonif_niveles",
              "zonif_densidad", "zonif_n", "zonif_synced_at", "scores_reales", "scores_fuentes",
              "scores_cobertura_pct", "scores_es_estimado", "precio_pm2", "precio_score",
              "center", "alcaldia", "tier"]
    cols: List[Dict[str, Any]] = []
    async for c in db.colonias.find({"city": city}, {"_id": 0}):
        cols.append(c)
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for c in cols:
        groups[_norm(c.get("name"))].append(c)
    fusionados = eliminadas = 0
    for name, members in groups.items():
        if not name or len(members) < 2:
            continue
        clusters: List[List[Dict[str, Any]]] = []
        for c in members:
            for cl in clusters:
                if _km(c.get("center"), cl[0].get("center")) <= max_km:
                    cl.append(c)
                    break
            else:
                clusters.append([c])
        for cl in clusters:
            if len(cl) < 2:
                continue
            cl.sort(key=_rank, reverse=True)
            survivor = cl[0]
            patch: Dict[str, Any] = {}
            for f in _MERGE:
                if survivor.get(f) in (None, 0, ""):
                    for sib in cl[1:]:
                        if sib.get(f) not in (None, 0, ""):
                            patch[f] = sib[f]
                            break
            patch["aliases"] = sorted(set((survivor.get("aliases") or []) + [s["id"] for s in cl[1:]]))
            patch["deduped_at"] = iso
            await db.colonias.update_one({"id": survivor["id"]}, {"$set": patch})
            res = await db.colonias.delete_many({"id": {"$in": [s["id"] for s in cl[1:]]}})
            eliminadas += res.deleted_count
            fusionados += 1
    # Pass 2 · cross-source por cercanía: una colonia SIN COS/CUS muy cerca de una CON COS/CUS
    # (≤ prox_thr, misma alcaldía) = la misma colonia que el otro catálogo nombró distinto →
    # fusiona la de delito en la de uso de suelo (que es la canónica para el Valor Residual).
    prox_thr = 0.45  # km
    con_cos = [c async for c in db.colonias.find(
        {"city": city, "cus": {"$gt": 0}, "center": {"$ne": None}}, {"_id": 0})]
    sin_cos = [c async for c in db.colonias.find(
        {"city": city, "cus": {"$exists": False}, "center": {"$ne": None}, "source": {"$ne": "seed"}}, {"_id": 0})]
    for s in sin_cos:
        best, bestd = None, 9999.0
        sa = _norm(s.get("alcaldia"))
        for c in con_cos:
            if sa and _norm(c.get("alcaldia")) and sa != _norm(c.get("alcaldia")):
                continue
            dkm = _km(s["center"], c["center"])
            if dkm < bestd:
                best, bestd = c, dkm
        if best and bestd <= prox_thr:
            patch: Dict[str, Any] = {}
            for f in ["scores_reales", "scores_fuentes", "scores_cobertura_pct",
                      "scores_es_estimado", "precio_pm2", "precio_score",
                      "vsuelo_pm2_catastral", "vsuelo_n", "vsuelo_score", "vsuelo_synced_at"]:
                if best.get(f) in (None, 0, "") and s.get(f) not in (None, 0, ""):
                    patch[f] = s[f]
            patch["aliases"] = sorted(set((best.get("aliases") or []) + [s["id"]]))
            patch["deduped_at"] = iso
            await db.colonias.update_one({"id": best["id"]}, {"$set": patch})
            await db.colonias.delete_one({"id": s["id"]})
            fusionados += 1
            eliminadas += 1
    return {"ok": True, "city": city, "grupos_fusionados": fusionados,
            "colonias_eliminadas": eliminadas, "cobertura": await coverage(db)}


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
                "con_vsuelo": {"$sum": {"$cond": [{"$gt": ["$vsuelo_pm2_catastral", 0]}, 1, 0]}},
                "con_zonif": {"$sum": {"$cond": [{"$gt": ["$cus", 0]}, 1, 0]}},
            }},
            {"$sort": {"count": -1}},
        ]):
            rows.append({"city": r["_id"] or "—", "colonias": r["count"],
                         "con_scores_reales": r.get("con_reales", 0),
                         "con_valor_suelo": r.get("con_vsuelo", 0),
                         "con_zonificacion": r.get("con_zonif", 0)})
        total = sum(r["colonias"] for r in rows)
        con_reales = sum(r["con_scores_reales"] for r in rows)
        con_vsuelo = sum(r["con_valor_suelo"] for r in rows)
        con_zonif = sum(r["con_zonificacion"] for r in rows)
        return {"ciudades": rows, "total_colonias": total, "total_ciudades": len(rows),
                "total_con_scores_reales": con_reales, "total_pendientes": total - con_reales,
                "total_con_valor_suelo": con_vsuelo, "total_con_zonificacion": con_zonif}
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
    """Calcula scores REALES (puente score_bridge → SESNSP/OSM/DRPI) para cada colonia del
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


async def sync_business_density(db, city: str = "CDMX", source: str = "osm",
                                limit: int = 80, radius_m: Optional[int] = None) -> Dict[str, Any]:
    """Sincroniza la densidad real de comercios de cada colonia usando SU centro, luego
    recalcula los scores. Una acción que cierra el ciclo dato→score.

    `source`: "osm" (OpenStreetMap Overpass · única fuente · DENUE eliminado).
    Honesto: si la fuente no responde, no inventa — reporta cuántas quedaron con datos.
    `limit` acota la corrida del botón; el cron cubre el catálogo completo."""
    sincronizadas = con_datos = 0
    rad = radius_m or (700 if source == "osm" else 1500)
    cur = db.colonias.find({"city": city, "center": {"$ne": None}}, {"_id": 0, "id": 1, "center": 1})
    async for c in cur:
        if sincronizadas >= limit:
            log.warning(f"[colonias_catalog] sync densidad alcanzó el tope {limit} · {city}")
            break
        ctr = c.get("center")
        if not (isinstance(ctr, (list, tuple)) and len(ctr) == 2):
            continue
        lng, lat = float(ctr[0]), float(ctr[1])   # el catálogo guarda [lng, lat]
        try:
            # Densidad SIEMPRE por OSM (la API de DENUE nunca funcionó · se eliminó).
            import osm_engine as osm
            d = await osm.compute_zone_density_osm(db, c["id"], lat, lng, radius_m=rad)
            sincronizadas += 1
            if (d.get("businesses_count_total") or d.get("total") or 0) > 0:
                con_datos += 1
        except Exception as e:
            log.warning(f"[colonias_catalog] sync densidad {c.get('id')}: {e}")
    # Recalcula scores con la densidad nueva (cierra el ciclo)
    scores = await compute_catalog_scores(db, city)
    fuente_txt = "OpenStreetMap"  # DENUE eliminado · siempre OSM
    nota = None if con_datos else (f"{fuente_txt} no devolvió comercios — reintenta en un momento "
                                   "(la instancia gratis puede estar saturada) o revisa la red del servidor.")
    return {
        "ok": True, "city": city, "fuente": source, "sincronizadas": sincronizadas, "con_datos": con_datos,
        "scores": {"con_scores_reales": scores["con_scores_reales"], "pendientes": scores["pendientes"]},
        "nota": nota, "cobertura": scores["cobertura"],
    }


async def sync_seguridad(db, city: str = "CDMX", period_years: int = 2) -> Dict[str, Any]:
    """Sincroniza seguridad real por colonia (FGJ) + recalcula scores. Cierra el ciclo dato→score.
    Honesto: si FGJ no responde o no empareja colonias, lo reporta."""
    import crime_fgj_engine as fgj
    res = await fgj.sync_crime_for_city(db, city, period_years=period_years)
    if not res.get("ok"):
        return {"ok": False, "city": city, "con_seguridad_real": 0, "nota": res.get("reason"),
                "cobertura": await coverage(db)}
    scores = await compute_catalog_scores(db, city)
    return {
        "ok": True, "city": city, "fuente": "fgj",
        "con_seguridad_real": res["matched"],
        "scores": {"con_scores_reales": scores["con_scores_reales"], "pendientes": scores["pendientes"]},
        "nota": None, "cobertura": scores["cobertura"],
    }


async def ingest_catalog_from_fgj(db, city: str = "CDMX", period_years: int = 3, min_incidents: int = 15) -> Dict[str, Any]:
    """Deriva el catálogo de colonias del propio dataset FGJ (que ya tiene cada colonia con
    coordenadas) — sin esperar el GeoJSON oficial. El centro es el promedio de ubicaciones
    (aproximado, se afina al cargar polígonos oficiales). Cero deuda · build for endstate."""
    rid = os.environ.get("IE_FGJ_CDMX_RESOURCE_ID")
    if not rid:
        return {"ok": False, "reason": "Falta IE_FGJ_CDMX_RESOURCE_ID.", "cargadas": 0, "cobertura": await coverage(db)}
    import re as _re
    from datetime import datetime as _dt, timezone as _tz
    year_from = _dt.now(_tz.utc).year - period_years
    base = _ckan_base()
    sql = (f'SELECT "colonia_catalogo", "alcaldia_catalogo", AVG("latitud") AS lat, '
           f'AVG("longitud") AS lng, COUNT(*) AS n FROM "{rid}" '
           f'WHERE "anio_hecho" >= {year_from} AND "latitud" BETWEEN 19 AND 20 '
           f'AND "longitud" BETWEEN -100 AND -98 AND "colonia_catalogo" != \'\' '
           f'GROUP BY "colonia_catalogo", "alcaldia_catalogo" HAVING COUNT(*) > {min_incidents}')
    try:
        import httpx
        async with httpx.AsyncClient(timeout=110) as c:
            r = await c.get(f"{base}/datastore_search_sql", params={"sql": sql})
        if r.status_code != 200 or not r.json().get("success"):
            return {"ok": False, "reason": "FGJ no respondió.", "cargadas": 0, "cobertura": await coverage(db)}
        rows = r.json().get("result", {}).get("records", [])
    except Exception as e:
        log.warning(f"[colonias_catalog] fgj catalog: {e}")
        return {"ok": False, "reason": str(e), "cargadas": 0, "cobertura": await coverage(db)}

    items: List[Dict[str, Any]] = []
    for row in rows:
        name = (row.get("colonia_catalogo") or "").strip()
        alc = (row.get("alcaldia_catalogo") or "").strip()
        if not name:
            continue
        # title case suave (respeta nombres ya formateados, arregla MAYÚSCULAS)
        if name.isupper():
            name = name.title()
        if alc.isupper():
            alc = alc.title()
        try:
            lat, lng = float(row["lat"]), float(row["lng"])
        except (TypeError, ValueError, KeyError):
            continue
        cid = _slugify(f"{name}-{alc}" if alc else name)
        items.append({"id": cid, "name": name, "city": city, "alcaldia": alc or None,
                      "center": [lng, lat], "source": "fgj_derivado"})
    items = list({m["id"]: m for m in items}.values())
    n = await upsert_colonias(db, city, items) if items else 0
    return {"ok": True, "fuente": "fgj", "leidas": len(rows), "cargadas": n, "city": city,
            "cobertura": await coverage(db)}


async def ingest_official_catalog(db, city: str = "CDMX", source: str = "fgj") -> Dict[str, Any]:
    """Carga el catálogo de colonias de una ciudad. Fuentes:
      - "fgj" (DEFAULT): deriva las colonias del dataset FGJ (ya conectado · ~1,244 con coords).
      - CKAN  → env `IE_COLONIAS_CDMX_RESOURCE_ID`
      - GeoJSON → env `IE_COLONIAS_CDMX_URL`
    Sin nada configurado → no-op HONESTO con instrucción (cero deuda · build for endstate).
    """
    if source == "fgj":
        return await ingest_catalog_from_fgj(db, city)
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
