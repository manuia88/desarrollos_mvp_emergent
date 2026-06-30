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
from typing import Any, Dict

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
    """Mapea la zona sísmica oficial a cada colonia → `seismic_zone_colonia`. FAIL-SOFT."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=_UA) as cli:
            r = await cli.get(SEISMIC_GEOJSON)
        r.raise_for_status()
        feats = r.json().get("features", [])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": "seismic_fetch_failed", "error": str(e)[:200]}

    cols = await _colonia_slug_map(db)
    now = datetime.now(timezone.utc)
    written = 0
    for f in feats:
        props = f.get("properties", {}) or {}
        nm = props.get("COLONIA")
        deleg = props.get("DELEG")
        # Nuestros ids canónicos son `slug(nombre)-slug(alcaldía)` → desambigua colonias homónimas.
        # Probar nombre crudo Y nombre con abreviaciones expandidas, con y sin alcaldía.
        ns, ne = _slug(nm), _slug(_expand(nm))
        ds = _slug(deleg)
        zid = (cols.get(f"{ns}-{ds}") or cols.get(f"{ne}-{ds}")
               or cols.get(ns) or cols.get(ne))
        if not zid:
            continue
        res = _resilience(props.get("INTENSIDAD"))
        if res is None:
            continue
        await db.seismic_zone_colonia.update_one(
            {"zone_id": zid},
            {"$set": {"zone_id": zid, "seismic_zone": props.get("INTENSIDAD"),
                      "resilience": res, "alcaldia": props.get("DELEG"),
                      "source": "atlas_sismico_cdmx", "colonia_catalogo": nm, "synced_at": now}},
            upsert=True,
        )
        written += 1
    return {"ok": True, "seismic_colonias": len(feats), "written": written}
