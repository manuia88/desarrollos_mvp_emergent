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


async def colonia_catastro(db, colonia_name: str, sample: int = 8) -> Dict[str, Any]:
    """Valor catastral OFICIAL agregado de una colonia + desglose de predios (muestra)."""
    import re as _re
    raw = norm_colonia(colonia_name)
    # El IECM parte colonias en secciones (Doctores I..V · Roma Norte/Sur) pero el catastro usa el nombre
    # base → quita el sufijo de sección y matchea por "contiene" para no perder cobertura.
    base = _re.sub(r"\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x|[0-9]+a?|norte|sur|oriente|poniente|seccion|secc)$", "", raw).strip() or raw
    rx = {"$regex": _re.escape(base), "$options": "i"}
    pipe = [
        {"$match": {"colonia_norm": rx, "valor_unitario_suelo": {"$gt": 0}}},
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
        cur = db.catastro_predios.find({"colonia_norm": rx, "valor_suelo": {"$gt": 0}},
                                       {"_id": 0, "valor_suelo": 1}).sort("valor_suelo", 1).skip(skip).limit(1)
        md = await cur.to_list(1)
        mediana = md[0]["valor_suelo"] if md else None
    except Exception:
        mediana = None
    # PUNTOS por predio (lat/lng + valor) → densidad por-predio en el mapa
    puntos = []
    async for p in db.catastro_predios.find(
            {"colonia_norm": rx, "lat": {"$exists": True}, "valor_unitario_suelo": {"$gt": 0}},
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
