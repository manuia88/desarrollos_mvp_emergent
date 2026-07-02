"""FGJ crime-trajectory feeder — ¿la seguridad de la colonia MEJORA o EMPEORA con el tiempo?

Fuente: CKAN datos.cdmx.gob.mx, resource `48fcb848-...` (2.1M carpetas FGJ con `anio_hecho`).
NO inventa: agrega los delitos reales por colonia × AÑO (server-side) y calcula la TENDENCIA
(ratio año reciente / año base) → `fgj_trajectory_zone`. Alimenta IE_COL_N04_CRIME_TRAJECTORY
(crimen bajando = seguridad mejorando = score alto; subiendo = score bajo).
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict

import httpx

FGJ_RESOURCE_ID = "48fcb848-220c-4af0-839b-4fd8ac812c0f"
CKAN_SQL = "https://datos.cdmx.gob.mx/api/3/action/datastore_search_sql"
_UA = {"User-Agent": "Mozilla/5.0 DMX-IE"}
_YEARS = ["2022", "2023", "2024"]   # ventana de tendencia (3 años completos)
_MIN_BASE = 5                       # mínimo de delitos en el año base para un ratio significativo


def _slug(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


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


async def ingest_fgj_trajectory(db, *, timeout: float = 120.0) -> Dict[str, Any]:
    """Agrega delitos FGJ por colonia × año y persiste la tendencia en `fgj_trajectory_zone`. FAIL-SOFT."""
    yrs = "','".join(_YEARS)
    sql = (f"SELECT colonia_catalogo, anio_hecho, count(*) AS n FROM \"{FGJ_RESOURCE_ID}\" "
           f"WHERE anio_hecho IN ('{yrs}') GROUP BY colonia_catalogo, anio_hecho")
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=_UA) as cli:
            r = await cli.get(CKAN_SQL, params={"sql": sql})
        r.raise_for_status()
        recs = r.json().get("result", {}).get("records", [])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": "fgj_fetch_failed", "error": str(e)[:200]}

    # colonia → {año: conteo}
    by: Dict[str, Dict[str, int]] = defaultdict(dict)
    for x in recs:
        nm = x.get("colonia_catalogo")
        yr = x.get("anio_hecho")
        try:
            n = int(x.get("n") or 0)
        except (TypeError, ValueError):
            continue
        if nm and yr:
            by[nm][yr] = n

    cols = await _colonia_slug_map(db)
    now = datetime.now(timezone.utc)
    written = 0
    for nm, yrmap in by.items():
        s = _slug(nm)
        if not s or s == "na":
            continue
        zid = cols.get(s)
        if not zid:
            continue
        present = [y for y in _YEARS if y in yrmap]
        if len(present) < 2:
            continue
        base_y, recent_y = present[0], present[-1]
        base, recent = yrmap[base_y], yrmap[recent_y]
        if base < _MIN_BASE:
            continue
        trend_ratio = round(recent / base, 4)   # <1 = crimen bajando (mejora)
        await db.fgj_trajectory_zone.update_one(
            {"zone_id": zid},
            {"$set": {"zone_id": zid, "trend_ratio": trend_ratio,
                      "base_year": base_y, "base_count": base,
                      "recent_year": recent_y, "recent_count": recent,
                      "source": "fgj", "colonia_catalogo": nm, "synced_at": now}},
            upsert=True,
        )
        written += 1
    return {"ok": True, "fgj_colonias": len(by), "written": written}
