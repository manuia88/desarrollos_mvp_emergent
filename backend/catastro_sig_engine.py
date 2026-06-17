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


async def colonia_catastro(db, colonia_name: str, sample: int = 8) -> Dict[str, Any]:
    """Valor catastral OFICIAL agregado de una colonia + desglose de predios (muestra)."""
    cn = norm_colonia(colonia_name)
    # match flexible: la colonia tal cual o sus secciones ("Polanco" → "Polanco I/II/.. Seccion")
    import re as _re
    rx = {"$regex": f"^{_re.escape(cn)}( |$)", "$options": "i"}
    pipe = [
        {"$match": {"colonia_norm": rx, "valor_unitario_suelo": {"$gt": 0}}},
        {"$group": {
            "_id": None, "predios": {"$sum": 1},
            "vus_prom": {"$avg": "$valor_unitario_suelo"},
            "valor_suelo_prom": {"$avg": "$valor_suelo"},
            "sup_terreno_prom": {"$avg": "$sup_terreno"},
        }},
    ]
    agg = await db.catastro_predios.aggregate(pipe).to_list(1)
    if not agg:
        return {"colonia": colonia_name, "disponible": False, "predios": 0}
    a = agg[0]
    predios = []
    async for p in db.catastro_predios.find(
            {"colonia_norm": rx, "valor_suelo": {"$gt": 0}},
            {"_id": 0, "calle": 1, "sup_terreno": 1, "sup_construccion": 1, "anio": 1, "valor_suelo": 1, "valor_unitario_suelo": 1}
    ).sort("valor_suelo", -1).limit(sample):
        predios.append(p)
    return {
        "colonia": colonia_name, "disponible": True,
        "predios": a["predios"],
        "valor_unitario_suelo_prom": round(a.get("vus_prom") or 0),
        "valor_suelo_prom": round(a.get("valor_suelo_prom") or 0),
        "sup_terreno_prom": round(a.get("sup_terreno_prom") or 0, 1),
        "muestra_predios": predios,
        "fuente": "Catastro SIGCDMX 2021 (oficial)",
    }


async def ensure_indexes(db) -> None:
    await db.catastro_predios.create_index("catastro_id", unique=True)
    await db.catastro_predios.create_index("colonia_norm")
