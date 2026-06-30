"""SACMEX water-security feeder — ingesta de incidentes de agua REALES por colonia.

Fuente: CKAN datos.cdmx.gob.mx, resource `a8069e94-...` (313k+ reportes: fuga, falta de agua, etc.).
NO inventa: agrega los reportes reales por colonia (server-side, 1 query SQL) → `sacmex_zone_colonia`.
Alimenta IE_COL_N07_WATER_SECURITY (más incidentes = menor seguridad hídrica, percentil de ciudad invertido).
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Dict

import httpx

SACMEX_RESOURCE_ID = "a8069e94-c7cb-45d7-8166-561e80884422"
CKAN_SQL = "https://datos.cdmx.gob.mx/api/3/action/datastore_search_sql"
_UA = {"User-Agent": "Mozilla/5.0 DMX-IE"}


def _slug(s: Any) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")


async def _colonia_slug_map(db) -> Dict[str, str]:
    """slug(nombre)/id → zone_id de nuestras colonias, para casar los nombres de SACMEX."""
    out: Dict[str, str] = {}
    async for c in db.colonias.find({}, {"id": 1, "name": 1}):
        zid = c.get("id")
        if not zid:
            continue
        out[zid] = zid
        if c.get("name"):
            out.setdefault(_slug(c["name"]), zid)
    return out


async def ingest_sacmex_water(db, *, timeout: float = 90.0) -> Dict[str, Any]:
    """Agrega incidentes SACMEX por colonia y los persiste en `sacmex_zone_colonia`. FAIL-SOFT."""
    sql = f'SELECT colonia_catalogo, count(*) AS n FROM "{SACMEX_RESOURCE_ID}" GROUP BY colonia_catalogo'
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=_UA) as cli:
            r = await cli.get(CKAN_SQL, params={"sql": sql})
        r.raise_for_status()
        recs = r.json().get("result", {}).get("records", [])
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": "sacmex_fetch_failed", "error": str(e)[:200]}

    cols = await _colonia_slug_map(db)
    now = datetime.now(timezone.utc)
    written = 0
    matched_total_incidents = 0
    for x in recs:
        nm = x.get("colonia_catalogo")
        s = _slug(nm)
        if not s or s == "na":
            continue
        zid = cols.get(s)
        if not zid:
            continue
        try:
            n = int(x.get("n") or 0)
        except (TypeError, ValueError):
            continue
        await db.sacmex_zone_colonia.update_one(
            {"zone_id": zid},
            {"$set": {"zone_id": zid, "incidents": n, "source": "sacmex",
                      "colonia_catalogo": nm, "synced_at": now}},
            upsert=True,
        )
        written += 1
        matched_total_incidents += n
    return {"ok": True, "sacmex_colonias": len(recs), "written": written,
            "incidents_matched": matched_total_incidents}
