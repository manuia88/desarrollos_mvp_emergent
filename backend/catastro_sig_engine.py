"""Catastro SIGCDMX (oficial) — ingesta POR PREDIO desde catalogov2.sig.cdmx.gob.mx.

Fuente oficial: catastro2021_{ALCALDIA}.csv · una fila por predio con colonia, superficie, año y
valor catastral del suelo (valor_unitario_suelo · valor_suelo). NO trae lat/lng (la geometría está en
el shapefile); pero sí permite el DESGLOSE POR PREDIO + el valor catastral oficial agregado por colonia
— justo la granularidad que pedía el founder (la que tiene propiedades.com).
"""
import csv
import io
import logging
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.catastro_sig")

BASE = "https://catalogov2.sig.cdmx.gob.mx/descargas/csv_shapes_catastro/tablas_csv"
ALCALDIAS = [
    "ALVARO_OBREGON", "AZCAPOTZALCO", "BENITO_JUAREZ", "COYOACAN", "CUAJIMALPA_DE_MORELOS",
    "CUAUHTEMOC", "GUSTAVO_A_MADERO", "IZTACALCO", "IZTAPALAPA", "MAGDALENA_CONTRERAS",
    "MIGUEL_HIDALGO", "MILPA_ALTA", "TLAHUAC", "TLALPAN", "VENUSTIANO_CARRANZA", "XOCHIMILCO",
    "CUAJIMALPA",  # ojo: el archivo es CUAJIMALPA (no CUAJIMALPA_DE_MORELOS)
]


def norm_colonia(s: str) -> str:
    s = (s or "").strip().lower()
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def _f(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


async def ingest_alcaldia(db, alc: str, batch: int = 5000) -> Dict[str, Any]:
    """Descarga el CSV de una alcaldía → guarda un doc por predio en db.catastro_predios (upsert por fid)."""
    url = f"{BASE}/catastro2021_{alc}.csv"
    try:
        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as cli:
            r = await cli.get(url)
            if r.status_code != 200:
                return {"ok": False, "alcaldia": alc, "reason": f"HTTP {r.status_code}", "predios": 0}
            content = r.text
    except Exception as e:
        return {"ok": False, "alcaldia": alc, "reason": str(e)[:120], "predios": 0}

    reader = csv.DictReader(io.StringIO(content))
    ops: List[Any] = []
    n = 0
    from pymongo import UpdateOne
    now = datetime.now(timezone.utc)
    for d in reader:
        fid = (d.get("fid") or "").strip()
        if not fid:
            continue
        col = (d.get("colonia") or "").strip()
        cid = f"{alc}:{fid}"  # el fid se reinicia por alcaldía → clave compuesta para no pisar
        doc = {
            "catastro_id": cid, "fid": fid, "alcaldia": (d.get("alcaldia") or alc).strip().title(),
            "colonia": col.title(), "colonia_norm": norm_colonia(col),
            "cp": (d.get("codigo_postal") or "").strip(),
            "calle": (d.get("calle_numero") or "").strip()[:120],
            "sup_terreno": _f(d.get("sup_terreno")), "sup_construccion": _f(d.get("sup_construccion")),
            "anio": d.get("anio_construccion"), "valor_unitario_suelo": _f(d.get("valor_unitario_suelo")),
            "valor_suelo": _f(d.get("valor_suelo")), "fuente": "sigcdmx_catastro2021", "ingested_at": now,
        }
        ops.append(UpdateOne({"catastro_id": cid}, {"$set": doc}, upsert=True))
        if len(ops) >= batch:
            await db.catastro_predios.bulk_write(ops, ordered=False)
            n += len(ops); ops = []
    if ops:
        await db.catastro_predios.bulk_write(ops, ordered=False)
        n += len(ops)
    return {"ok": True, "alcaldia": alc, "predios": n}


SHP_BASE = "https://catalogov2.sig.cdmx.gob.mx/descargas/csv_shapes_catastro/shapefiles"


async def ingest_shapefile_coords(db, alc: str, batch: int = 5000) -> Dict[str, Any]:
    """Descarga el SHAPEFILE de la alcaldía → centroide por predio → reproyecta UTM14N→WGS84 →
    añade lng/lat al doc del predio (match por catastro_id=alc:fid). Habilita predios como PUNTOS en el mapa."""
    import os
    import tempfile
    import zipfile
    url = f"{SHP_BASE}/catastro2021_{alc}.zip"
    try:
        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as cli:
            r = await cli.get(url)
            if r.status_code != 200:
                return {"ok": False, "alcaldia": alc, "reason": f"HTTP {r.status_code}", "coords": 0}
            data = r.content
    except Exception as e:
        return {"ok": False, "alcaldia": alc, "reason": str(e)[:120], "coords": 0}
    import shapefile
    from pymongo import UpdateOne
    from pyproj import CRS, Transformer
    n = 0
    with tempfile.TemporaryDirectory() as td:
        zp = os.path.join(td, "s.zip")
        with open(zp, "wb") as f:
            f.write(data)
        with zipfile.ZipFile(zp) as z:
            z.extractall(td)
        shp = next((os.path.join(td, x) for x in os.listdir(td) if x.endswith(".shp")), None)
        prj = next((os.path.join(td, x) for x in os.listdir(td) if x.endswith(".prj")), None)
        if not shp:
            return {"ok": False, "alcaldia": alc, "reason": "sin .shp", "coords": 0}
        crs = CRS.from_wkt(open(prj).read()) if prj else CRS.from_epsg(32614)
        tr = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        sf = shapefile.Reader(shp[:-4])
        fld = [f[0] for f in sf.fields[1:]]
        fi = fld.index("fid") if "fid" in fld else 0
        ops: List[Any] = []
        for sr in sf.iterShapeRecords():
            try:
                fid = str(sr.record[fi])
                b = sr.shape.bbox
                lon, lat = tr.transform((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
                ops.append(UpdateOne({"catastro_id": f"{alc}:{fid}"},
                                     {"$set": {"lng": round(lon, 6), "lat": round(lat, 6)}}))
                if len(ops) >= batch:
                    await db.catastro_predios.bulk_write(ops, ordered=False); n += len(ops); ops = []
            except Exception:
                continue
        if ops:
            await db.catastro_predios.bulk_write(ops, ordered=False); n += len(ops)
    return {"ok": True, "alcaldia": alc, "coords": n}


async def ingest_shapefile_polygons(db, alc: str, batch: int = 3000, tol: float = 0.00002) -> Dict[str, Any]:
    """Guarda el POLÍGONO del lote (forma real, reproyectada a WGS84 + simplificada) y un centroide
    indexable (geo) por predio. Habilita dibujar predios como polígonos por viewport/zoom (estilo
    propiedades.com · la manzana verde)."""
    import os
    import tempfile
    import zipfile
    url = f"{SHP_BASE}/catastro2021_{alc}.zip"
    try:
        async with httpx.AsyncClient(timeout=300, follow_redirects=True) as cli:
            r = await cli.get(url)
            if r.status_code != 200:
                return {"ok": False, "alcaldia": alc, "reason": f"HTTP {r.status_code}", "polys": 0}
            data = r.content
    except Exception as e:
        return {"ok": False, "alcaldia": alc, "reason": str(e)[:120], "polys": 0}
    import shapefile
    from pymongo import UpdateOne
    from pyproj import CRS, Transformer
    from shapely.geometry import Polygon as ShPoly, mapping
    n = 0
    with tempfile.TemporaryDirectory() as td:
        zp = os.path.join(td, "s.zip")
        with open(zp, "wb") as f:
            f.write(data)
        with zipfile.ZipFile(zp) as z:
            z.extractall(td)
        shp = next((os.path.join(td, x) for x in os.listdir(td) if x.endswith(".shp")), None)
        prj = next((os.path.join(td, x) for x in os.listdir(td) if x.endswith(".prj")), None)
        if not shp:
            return {"ok": False, "alcaldia": alc, "reason": "sin .shp", "polys": 0}
        crs = CRS.from_wkt(open(prj).read()) if prj else CRS.from_epsg(32614)
        tr = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        sf = shapefile.Reader(shp[:-4])
        fld = [f[0] for f in sf.fields[1:]]
        fi = fld.index("fid") if "fid" in fld else 0
        ops: List[Any] = []
        for sr in sf.iterShapeRecords():
            try:
                sh = sr.shape
                if not sh.points:
                    continue
                parts = list(sh.parts) + [len(sh.points)]
                ring = sh.points[parts[0]:parts[1]]   # anillo exterior
                if len(ring) < 4:
                    continue
                lon, lat = tr.transform([p[0] for p in ring], [p[1] for p in ring])
                poly = ShPoly(list(zip(lon, lat))).simplify(tol, preserve_topology=True)
                if poly.is_empty or poly.geom_type != "Polygon":
                    continue
                cen = poly.centroid
                ops.append(UpdateOne({"catastro_id": f"{alc}:{str(sr.record[fi])}"},
                                     {"$set": {"poly": mapping(poly),
                                               "geo": {"type": "Point", "coordinates": [round(cen.x, 6), round(cen.y, 6)]}}}))
                if len(ops) >= batch:
                    await db.catastro_predios.bulk_write(ops, ordered=False); n += len(ops); ops = []
            except Exception:
                continue
        if ops:
            await db.catastro_predios.bulk_write(ops, ordered=False); n += len(ops)
    try:
        await db.catastro_predios.create_index([("geo", "2dsphere")])
    except Exception:
        pass
    return {"ok": True, "alcaldia": alc, "polys": n}


async def colonia_catastro(db, colonia_name: str, sample: int = 8) -> Dict[str, Any]:
    """Valor catastral OFICIAL agregado de una colonia + desglose de predios.
    `colonia_name` puede ser el ID de colonia IECM (preferido · cruce espacial · exacto, 99%) o el nombre."""
    import re as _re
    # 1) Preferir el id IECM (lo que el panel manda) → match EXACTO por cruce espacial (no falla por nombre).
    base_filter: Dict[str, Any] = {}
    try:
        if await db.catastro_predios.count_documents({"colonia_iecm": colonia_name}, limit=1):
            base_filter = {"colonia_iecm": colonia_name}
    except Exception:
        pass
    # 2) Si no es id, caer al nombre (regex base, ignora sección).
    if not base_filter:
        raw = norm_colonia(colonia_name)
        base = _re.sub(r"\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|[0-9]+a?|norte|sur|oriente|poniente|seccion|secc)$", "", raw).strip() or raw
        base_filter = {"colonia_norm": {"$regex": _re.escape(base), "$options": "i"}}
    pipe = [
        {"$match": {**base_filter, "valor_unitario_suelo": {"$gt": 0}}},
        {"$group": {
            "_id": None, "predios": {"$sum": 1},
            "vus_prom": {"$avg": "$valor_unitario_suelo"},
            "sup_terreno_prom": {"$avg": "$sup_terreno"},
        }},
    ]
    agg = await db.catastro_predios.aggregate(pipe).to_list(1)
    if not agg or not agg[0].get("predios"):
        return {"colonia": colonia_name, "disponible": False, "predios": 0}
    a = agg[0]
    n = a["predios"]
    # Valor TÍPICO del suelo de un predio = mediana de valor_suelo (no el promedio, que infla por mega-lotes).
    mediana = None
    try:
        skip = max(0, n // 2)
        cur = db.catastro_predios.find({**base_filter, "valor_suelo": {"$gt": 0}},
                                       {"_id": 0, "valor_suelo": 1}).sort("valor_suelo", 1).skip(skip).limit(1)
        md = await cur.to_list(1)
        mediana = md[0]["valor_suelo"] if md else None
    except Exception:
        mediana = None
    # PUNTOS por predio (lat/lng + valor) → densidad por-predio en el mapa
    puntos = []
    async for p in db.catastro_predios.find(
            {**base_filter, "lat": {"$exists": True}, "valor_unitario_suelo": {"$gt": 0}},
            {"_id": 0, "lat": 1, "lng": 1, "valor_unitario_suelo": 1, "valor_suelo": 1, "calle": 1, "sup_terreno": 1, "anio": 1}
    ).limit(1500):
        puntos.append(p)
    return {
        "colonia": colonia_name, "disponible": True, "predios": n,
        "valor_suelo_m2": round(a.get("vus_prom") or 0),          # $/m² de SUELO (lo claro)
        "valor_predio_tipico": round(mediana) if mediana else None,  # valor típico de un predio (mediana)
        "sup_terreno_prom": round(a.get("sup_terreno_prom") or 0),
        "puntos": puntos,
        "fuente": "Catastro SIGCDMX 2021 (oficial)",
    }


async def ingest_units(db, alc: str, batch: int = 4000, max_u: int = 30) -> Dict[str, Any]:
    """Guarda las UNIDADES por edificio (predio/fid): el catastro trae 1 fila por depto/local, pero el
    predio (fid) es el edificio. Agrupa por fid → array `unidades` en el doc del edificio (Campeche 322 →
    6 deptos + 2 locales). Sin perder el polígono/valor del edificio."""
    url = f"{BASE}/catastro2021_{alc}.csv"
    try:
        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as cli:
            r = await cli.get(url)
            if r.status_code != 200:
                return {"ok": False, "alcaldia": alc, "reason": f"HTTP {r.status_code}", "edificios": 0}
            content = r.text
    except Exception as e:
        return {"ok": False, "alcaldia": alc, "reason": str(e)[:120], "edificios": 0}
    by_fid: Dict[str, List[Dict[str, Any]]] = {}
    reader = csv.DictReader(io.StringIO(content))
    for d in reader:
        fid = (d.get("fid") or "").strip()
        if not fid:
            continue
        lst = by_fid.setdefault(fid, [])
        if len(lst) < max_u:
            lst.append({
                "ref": (d.get("calle_numero") or "").strip()[:80],
                "sup_construccion": _f(d.get("sup_construccion")),
                "sup_terreno": _f(d.get("sup_terreno")),
                "anio": d.get("anio_construccion"),
                "valor_suelo": _f(d.get("valor_suelo")),
            })
    from pymongo import UpdateOne
    ops: List[Any] = []
    edif = 0
    for fid, unidades in by_fid.items():
        if len(unidades) <= 1:
            continue   # un solo registro = no hay desglose de unidades
        ops.append(UpdateOne({"catastro_id": f"{alc}:{fid}"},
                             {"$set": {"unidades": unidades, "n_unidades": len(unidades)}}))
        edif += 1
        if len(ops) >= batch:
            await db.catastro_predios.bulk_write(ops, ordered=False); ops = []
    if ops:
        await db.catastro_predios.bulk_write(ops, ordered=False)
    return {"ok": True, "alcaldia": alc, "edificios_con_unidades": edif}


def canon_colonia(colnorm: str) -> str:
    """Nombre base canónico para CRUZAR catastro (SIGCDMX) con polígonos (IECM): quita prefijos
    ('col', 'colonia', 'barrio'…) y sufijos de sección (I..V, Norte/Sur, seccion)."""
    import re as _re
    s = colnorm or ""
    s = _re.sub(r"^(col|colonia|priv|privada|prolong|prolongacion|de los|de la|del|barrio|unidad|u hab|fracc|fraccionamiento|ampliacion)\s+", "", s)
    s = _re.sub(r"\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|[0-9]+a?|seccion|secc|norte|sur|oriente|poniente)$", "", s).strip()
    return s


async def build_colonia_index(db) -> Dict[str, Any]:
    """Precomputa valor del suelo por colonia BASE (canónica) → db.colonia_catastro_idx. Lo consume el
    choropleth para colorear TODO el mapa por valor catastral real (cruza nombres SIGCDMX↔IECM)."""
    pipe = [{"$match": {"valor_unitario_suelo": {"$gt": 0}}},
            {"$group": {"_id": "$colonia_norm", "vus": {"$avg": "$valor_unitario_suelo"}, "n": {"$sum": 1}}}]
    agg: Dict[str, Dict[str, float]] = {}
    async for r in db.catastro_predios.aggregate(pipe, allowDiskUse=True):
        base = canon_colonia(r["_id"] or "")
        if not base:
            continue
        e = agg.setdefault(base, {"sum": 0.0, "n": 0})
        e["sum"] += (r["vus"] or 0) * r["n"]
        e["n"] += r["n"]
    docs = [{"base": b, "valor_suelo_m2": round(v["sum"] / v["n"]), "predios": int(v["n"])}
            for b, v in agg.items() if v["n"]]
    await db.colonia_catastro_idx.delete_many({})
    if docs:
        await db.colonia_catastro_idx.insert_many(docs)
        await db.colonia_catastro_idx.create_index("base")
    return {"bases": len(docs)}


async def spatial_join_predios(db, batch: int = 8000) -> Dict[str, Any]:
    """Cruce ESPACIAL: asigna cada predio (centroide) a la colonia (polígono IECM) que lo contiene →
    colonia_iecm. 100% robusto, sin adivinar nombres. Reusa shapely STRtree. Luego reindexa por colonia."""
    from shapely.geometry import shape, Point
    from shapely import STRtree
    from pymongo import UpdateOne
    cols = []
    async for c in db.colonias.find({"geometry": {"$exists": True}}, {"_id": 0, "id": 1, "geometry": 1}):
        try:
            cols.append((c["id"], shape(c["geometry"])))
        except Exception:
            pass
    if not cols:
        return {"ok": False, "reason": "sin polígonos de colonia"}
    ids = [i for i, _ in cols]
    geoms = [g for _, g in cols]
    tree = STRtree(geoms)
    ops: List[Any] = []
    matched = 0
    async for p in db.catastro_predios.find({"lat": {"$exists": True}}, {"_id": 0, "catastro_id": 1, "lng": 1, "lat": 1}):
        pt = Point(p["lng"], p["lat"])
        cid = None
        for idx in tree.query(pt):
            if geoms[idx].contains(pt):
                cid = ids[idx]
                break
        if cid:
            ops.append(UpdateOne({"catastro_id": p["catastro_id"]}, {"$set": {"colonia_iecm": cid}}))
            matched += 1
        if len(ops) >= batch:
            await db.catastro_predios.bulk_write(ops, ordered=False)
            ops = []
    if ops:
        await db.catastro_predios.bulk_write(ops, ordered=False)
    return {"ok": True, "asignados": matched}


async def build_index_by_iecm(db) -> Dict[str, Any]:
    """Valor del suelo por colonia IECM (id) desde el cruce espacial → db.colonia_catastro_byid. Lo consume
    el choropleth (match exacto por id · 99% cobertura)."""
    pipe = [{"$match": {"colonia_iecm": {"$exists": True}, "valor_unitario_suelo": {"$gt": 0}}},
            {"$group": {"_id": "$colonia_iecm", "vus": {"$avg": "$valor_unitario_suelo"}, "n": {"$sum": 1}}}]
    docs = []
    async for r in db.catastro_predios.aggregate(pipe, allowDiskUse=True):
        docs.append({"colonia_id": r["_id"], "valor_suelo_m2": round(r["vus"]), "predios": int(r["n"])})
    await db.colonia_catastro_byid.delete_many({})
    if docs:
        await db.colonia_catastro_byid.insert_many(docs)
        await db.colonia_catastro_byid.create_index("colonia_id", unique=True)
    return {"colonias": len(docs)}


async def ensure_indexes(db) -> None:
    await db.catastro_predios.create_index("catastro_id", unique=True)
    await db.catastro_predios.create_index("colonia_norm")
    await db.catastro_predios.create_index("colonia_iecm")


# ─── FAR (intensidad de construcción) + VINTAGE (edad del parque) ───────────────────────────────
# far_aprovechado = sup_construccion / sup_terreno (por predio). Bajo = SUBUTILIZADO = potencial de
# desarrollo (land intelligence). vintage = edad del parque construido (2025 - anio). Fuente: Catastro
# SIGCDMX 2021 (oficial, es_estimado=False). NADA inventado: si no hay dato del predio, no cuenta.
YEAR_NOW = 2025          # año de referencia para la edad (catastro 2021 + margen)
FAR_MAX = 20.0           # descarta ratios absurdos (errores de captura del catastro)
SUBUTIL_FAR = 0.5        # umbral "subutilizado": construyó <50% de su terreno (1 nivel o menos)


def year_int(v) -> Optional[int]:
    """anio del catastro → int válido (1800..YEAR_NOW) o None. Tolera 'NA', '0', '', floats."""
    try:
        y = int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None
    return y if 1800 <= y <= YEAR_NOW else None


def far_of(sup_construccion, sup_terreno) -> Optional[float]:
    """FAR aprovechado del predio = construcción/terreno. None si falta dato o ratio absurdo."""
    try:
        st = float(sup_terreno); sc = float(sup_construccion)
    except (TypeError, ValueError):
        return None
    if st <= 0 or sc < 0:
        return None
    far = sc / st
    return far if 0.0 < far <= FAR_MAX else None


def rollup_far_vintage(predios) -> Dict[str, Any]:
    """Agrega FAR + vintage sobre un iterable de predios (dicts con sup_construccion/sup_terreno/anio).
    Devuelve el rollup listo para colonia_catastro_byid. Usado por el seed y por la lectura en vivo →
    UNA sola fórmula (cero divergencia). Mediana por conteo (streaming-friendly, sin sort caro)."""
    import statistics
    fars: List[float] = []
    anios: List[int] = []
    for d in predios:
        far = far_of(d.get("sup_construccion"), d.get("sup_terreno"))
        if far is not None:
            fars.append(far)
        yr = year_int(d.get("anio"))
        if yr is not None:
            anios.append(yr)
    n_far = len(fars)
    n_anio = len(anios)
    sub = [f for f in fars if f < SUBUTIL_FAR]
    return {
        "far_medio": round(statistics.fmean(fars), 3) if fars else None,
        "far_mediana": round(statistics.median(fars), 3) if fars else None,
        "far_n": n_far,
        "pct_subutilizado": round(100.0 * len(sub) / n_far, 1) if n_far else None,
        "edad_media_parque": round(YEAR_NOW - statistics.fmean(anios), 1) if anios else None,
        "anio_medio_parque": round(statistics.fmean(anios)) if anios else None,
        "anio_mediana_parque": int(statistics.median(anios)) if anios else None,
        "vintage_n": n_anio,
    }


async def far_vintage_colonia(db, colonia_id: str, max_live: int = 60000) -> Dict[str, Any]:
    """FAR (intensidad de construcción) + VINTAGE (edad del parque) por colonia IECM.
    Land intelligence: far_medio bajo + %subutilizado alto = MÁS potencial de desarrollo (terreno sin
    aprovechar). Lee del rollup precomputado (colonia_catastro_byid, sembrado por seed_far_predios.py) y
    si aún no está calculado para esa colonia lo computa EN VIVO desde catastro_predios (fail-soft).
    `colonia_id` = id IECM (match exacto por cruce espacial). NADA inventado (fuente/confianza por celda)."""
    out_base = {
        "colonia_id": colonia_id,
        "fuente": "Catastro SIGCDMX 2021 (oficial)",
        "es_estimado": False,
        "confianza": "alta",
    }
    # 1) rollup precomputado (rápido) — lo escribe el seed en colonia_catastro_byid
    try:
        doc = await db.colonia_catastro_byid.find_one(
            {"colonia_id": colonia_id},
            {"_id": 0, "far_medio": 1, "far_mediana": 1, "far_n": 1, "pct_subutilizado": 1,
             "edad_media_parque": 1, "anio_medio_parque": 1, "anio_mediana_parque": 1,
             "vintage_n": 1, "predios": 1},
        )
    except Exception:
        doc = None
    if doc and doc.get("far_medio") is not None:
        d = {k: v for k, v in doc.items() if v is not None}
        d["potencial_desarrollo"] = _potencial_label(doc.get("far_medio"), doc.get("pct_subutilizado"))
        return {**out_base, "disponible": True, "origen": "rollup", **d}
    # 2) fallback EN VIVO (colonia aún no sembrada) — mismo motor de agregación
    cur = db.catastro_predios.find(
        {"colonia_iecm": colonia_id, "sup_terreno": {"$gt": 0}},
        {"_id": 0, "sup_construccion": 1, "sup_terreno": 1, "anio": 1},
    ).limit(max_live)
    predios = await cur.to_list(max_live)
    if not predios:
        return {**out_base, "disponible": False, "predios": 0}
    roll = rollup_far_vintage(predios)
    if roll.get("far_medio") is None:
        return {**out_base, "disponible": False, "predios": len(predios)}
    roll["potencial_desarrollo"] = _potencial_label(roll.get("far_medio"), roll.get("pct_subutilizado"))
    return {**out_base, "disponible": True, "origen": "vivo", "predios": len(predios), **roll,
            "confianza": "media" if len(predios) >= max_live else "alta"}


def _potencial_label(far_medio, pct_sub) -> Optional[str]:
    """Semáforo de potencial de desarrollo (land intelligence) desde FAR medio + %subutilizado."""
    if far_medio is None:
        return None
    if far_medio < 0.6 or (pct_sub or 0) >= 35:
        return "alto"        # parque bajo/subutilizado → hay tierra que aprovechar
    if far_medio < 1.2 or (pct_sub or 0) >= 20:
        return "medio"
    return "bajo"            # ya densificado
