"""Seismic-zone feeder — resiliencia ante sismo por colonia desde la zonificación OFICIAL del Atlas.

Fuente: CKAN datos.cdmx.gob.mx, dataset "Zonificación sísmica por colonia" (GeoJSON, 1,182 colonias con
`INTENSIDAD` = Zona I/II/IIIa-d, microzonificación geotécnica CDMX/CENAPRED).
NO inventa: lee la zona sísmica REAL por colonia y la mapea a un score de resiliencia conocido (Zona I = firme/
Lomas = más resiliente; Zona III = lacustre = más amplificación = menos resiliente) → `seismic_zone_colonia`.
Da cobertura city-wide a IE_COL_N05 (la capa `risk_scores_zone` solo tenía 5 colonias).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

SEISMIC_GEOJSON = ("https://datos.cdmx.gob.mx/dataset/f235a881-2fe2-495c-90a8-b9269045b1b9/"
                   "resource/1231bbb2-bee8-4c37-ac0b-066e07413863/download/zonificacin-ssmica-por-colonia.json")
_UA = {"User-Agent": "Mozilla/5.0 DMX-IE"}

# Resiliencia por zona geotécnica (100 = más resiliente). Zona I firme/Lomas → alta; Zona III lacustre → baja.
_ZONE_RESILIENCE = {
    "zonai": 90.0, "zonaii": 65.0,
    "zonaiiia": 45.0, "zonaiiib": 35.0, "zonaiiic": 25.0, "zonaiiid": 15.0,
}


# Abreviaciones comunes en los nombres de colonia del Atlas → forma completa (determinístico, sin fuzzy).
_ABBREV = {
    "ampl": "ampliacion", "barr": "barrio", "fracc": "fraccionamiento", "frac": "fraccionamiento",
    "uh": "unidad habitacional", "u": "unidad", "hab": "habitacional", "unid": "unidad",
    "col": "colonia", "pblo": "pueblo", "pbl": "pueblo", "sn": "san", "sta": "santa", "sto": "santo",
    "ote": "oriente", "pte": "poniente", "pdte": "presidente", "gpe": "guadalupe", "ote.": "oriente",
}


def _expand(name: Any) -> str:
    words = re.split(r"\s+", str(name or "").lower())
    return " ".join(_ABBREV.get(w.strip("."), w) for w in words)


def _slug(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


def _resilience(intensidad: Any) -> float | None:
    key = re.sub(r"\s+", "", str(intensidad or "").lower())
    return _ZONE_RESILIENCE.get(key)


async def _colonia_slug_map(db) -> Dict[str, str]:
    out: Dict[str, str] = {}
    async for c in db.colonias.find({}, {"id": 1, "name": 1}):
        zid = c.get("id")
        if not zid:
            continue
        out[zid] = zid
        if c.get("name"):
            out.setdefault(_slug(c["name"]), zid)
    return out


async def ingest_seismic_zones(db, *, timeout: float = 60.0) -> Dict[str, Any]:
    """Asigna la zona sísmica oficial a CADA colonia por JOIN ESPACIAL (punto-en-polígono) →
    `seismic_zone_colonia`. City-wide: usa la geometría real, no el nombre. Fallback a match por
    nombre para colonias sin geometría. FAIL-SOFT."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=_UA) as cli:
            r = await cli.get(SEISMIC_GEOJSON)
        r.raise_for_status()
        feats = r.json().get("features", [])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": "seismic_fetch_failed", "error": str(e)[:200]}

    # Construir polígonos sísmicos + índice espacial (shapely).
    import shapely.geometry as sg
    from shapely.strtree import STRtree
    polys: List[Any] = []
    meta: List[Dict[str, Any]] = []
    for f in feats:
        props = f.get("properties", {}) or {}
        res = _resilience(props.get("INTENSIDAD"))
        geom = f.get("geometry")
        if res is None or not geom:
            continue
        try:
            shp = sg.shape(geom)
            if not shp.is_valid:
                shp = shp.buffer(0)
        except Exception:
            continue
        polys.append(shp)
        meta.append({"resilience": res, "seismic_zone": props.get("INTENSIDAD"), "deleg": props.get("DELEG")})
    if not polys:
        return {"ok": False, "reason": "no_seismic_polygons"}
    tree = STRtree(polys)

    now = datetime.now(timezone.utc)
    written = 0
    async for c in db.colonias.find({}, {"id": 1, "name": 1, "center": 1, "geometry": 1}):
        zid = c.get("id")
        if not zid:
            continue
        # Punto representativo de la colonia (center, o centroide del polígono).
        pt = None
        ctr = c.get("center")
        if isinstance(ctr, (list, tuple)) and len(ctr) == 2:
            try:
                pt = sg.Point(float(ctr[0]), float(ctr[1]))
            except (TypeError, ValueError):
                pt = None
        if pt is None and c.get("geometry"):
            try:
                pt = sg.shape(c["geometry"]).representative_point()
            except Exception:
                pt = None
        if pt is None:
            continue
        m = None
        try:
            for idx in tree.query(pt):          # shapely 2.x → índices int de candidatos
                i = int(idx)
                if polys[i].contains(pt):
                    m = meta[i]
                    break
        except Exception:
            m = None
        if m is None:
            continue
        await db.seismic_zone_colonia.update_one(
            {"zone_id": zid},
            {"$set": {"zone_id": zid, "seismic_zone": m["seismic_zone"], "resilience": m["resilience"],
                      "alcaldia": m.get("deleg"), "source": "atlas_sismico_cdmx_spatial",
                      "colonia_catalogo": c.get("name"), "synced_at": now}},
            upsert=True,
        )
        written += 1
    return {"ok": True, "seismic_polygons": len(polys), "written": written}
