"""
crime_fgj_engine — Seguridad real por colonia vía FGJ CDMX (carpetas de investigación).
═══════════════════════════════════════════════════════════════════════════════
El motor de crimen previo trabaja a nivel ALCALDÍA (SESNSP) y necesita población. El dataset
FGJ (datos.cdmx · 2.1M carpetas con lat/lng + categoria_delito) es POR PUNTO y SÍ responde.

Honestidad (lección al construir): contar incidentes CRUDOS castiga injustamente a las colonias
céntricas/concurridas (la mayoría son "Delito de Bajo Impacto" = hurto menor, no peligro real).
Por eso medimos así:
  1) Densidad por ÁREA FIJA: incidentes dentro de ~700 m del centro de la colonia (mismo radio
     para todas → comparable, sin sesgo de tamaño de colonia).
  2) Peso por GRAVEDAD: lo violento (homicidio, violación, secuestro, robo con violencia, lesiones)
     pesa mucho; el bajo impacto pesa poco; lo "no delictivo" no cuenta.
  3) Score por PERCENTIL: más seguro = mejor que el X% de las colonias.

Escribe `crime_zone_colonia` {zone_id, incidentes_ponderados, by_category, safety_score, source:'fgj'}.
`compute_seguridad` lo lee primero; cae a SESNSP por alcaldía si no hay. Cero deuda: si FGJ no
responde, no inventa.
"""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import metric_normalizer as _mn

log = logging.getLogger("dmx.crime_fgj_engine")

_RADIUS_M = 700


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _base() -> str:
    b = (os.environ.get("IE_DATOS_CDMX_BASE_URL") or "https://datos.cdmx.gob.mx/api/3/action").rstrip("/")
    if b.endswith("/datastore_search"):
        b = b[: -len("/datastore_search")]
    return b


def _resource() -> Optional[str]:
    return os.environ.get("IE_FGJ_CDMX_RESOURCE_ID")


def _weight(categoria: str) -> float:
    """Peso por gravedad del delito (lo que la gente realmente teme pesa más)."""
    c = (categoria or "").upper()
    if "NO DELICTIVO" in c:
        return 0.0
    if any(t in c for t in ("HOMICIDIO", "FEMINICIDIO", "SECUESTRO", "VIOLACI", "LESIONES")):
        return 6.0
    if "CON VIOLENCIA" in c or "ARMA" in c:
        return 4.0
    if "BAJO IMPACTO" in c:
        return 1.0
    return 2.0   # otros delitos (medio)


async def fetch_weighted_incidents(lat: float, lng: float, year_from: int) -> Optional[Dict[str, Any]]:
    """Incidentes dentro de ~700 m del punto (caja delimitadora), agrupados por categoría.
    Devuelve {'ponderado': float, 'by_category': {cat:int}} o None si FGJ no respondió."""
    rid = _resource()
    if not rid:
        return None
    dlat = _RADIUS_M / 111_320.0
    dlng = _RADIUS_M / (111_320.0 * max(0.2, math.cos(math.radians(lat))))
    sql = (f'SELECT "categoria_delito", COUNT(*) AS n FROM "{rid}" '
           f'WHERE "anio_hecho" >= {year_from} '
           f'AND "latitud"::float BETWEEN {lat - dlat:.5f} AND {lat + dlat:.5f} '
           f'AND "longitud"::float BETWEEN {lng - dlng:.5f} AND {lng + dlng:.5f} '
           f'GROUP BY "categoria_delito"')
    try:
        import httpx
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.get(f"{_base()}/datastore_search_sql", params={"sql": sql})
        if r.status_code != 200 or not r.json().get("success"):
            log.warning(f"[fgj] SQL HTTP {r.status_code}")
            return None
        rows = r.json().get("result", {}).get("records", [])
    except Exception as e:
        log.warning(f"[fgj] fetch: {e}")
        return None

    ponderado = 0.0
    by_cat: Dict[str, int] = {}
    for row in rows:
        try:
            n = int(float(row.get("n") or 0))
        except (TypeError, ValueError):
            n = 0
        cat = (row.get("categoria_delito") or "Otros").strip()
        by_cat[cat] = by_cat.get(cat, 0) + n
        ponderado += n * _weight(cat)
    return {"ponderado": round(ponderado, 1), "by_category": by_cat}


async def sync_crime_for_city(db, city: str = "CDMX", period_years: int = 2, limit: int = 80) -> Dict[str, Any]:
    """Sincroniza seguridad real por colonia desde FGJ (densidad por área + gravedad).
    Score por percentil entre las colonias sincronizadas (más seguro = score más alto).
    Honesto: si FGJ no responde, no inventa."""
    if not _resource():
        return {"ok": False, "matched": 0, "reason": "Falta IE_FGJ_CDMX_RESOURCE_ID."}
    year_from = datetime.now(timezone.utc).year - period_years

    # 1) recolecta el incidente ponderado de cada colonia (consulta espacial por colonia)
    rows: List[Dict[str, Any]] = []
    async for c in db.colonias.find({"city": city, "center": {"$ne": None}},
                                    {"_id": 0, "id": 1, "center": 1}):
        if len(rows) >= limit:
            break
        ctr = c.get("center")
        if not (isinstance(ctr, (list, tuple)) and len(ctr) == 2):
            continue
        lng, lat = float(ctr[0]), float(ctr[1])
        data = await fetch_weighted_incidents(lat, lng, year_from)
        if data is None:
            continue
        rows.append({"zone_id": c["id"], **data})

    if not rows:
        return {"ok": False, "matched": 0, "reason": "FGJ no devolvió datos (reintenta)."}

    # 2) score por percentil (menos incidentes ponderados = más seguro = score más alto)
    dist = _mn.dist_from_values([r["ponderado"] for r in rows])
    sorted_vals = dist.get("_sorted") or []
    for r in rows:
        pr = _mn.percentile_rank(r["ponderado"], sorted_vals)
        r["safety_score"] = round((1.0 - pr) * 100)

    # 3) persiste
    for r in rows:
        top = sorted(r["by_category"].items(), key=lambda kv: -kv[1])[:3]
        await db.crime_zone_colonia.update_one(
            {"zone_id": r["zone_id"]},
            {"$set": {
                "zone_id": r["zone_id"], "incidentes_ponderados": r["ponderado"],
                "by_category": dict(top), "safety_score": r["safety_score"],
                "radius_m": _RADIUS_M, "period_years": period_years,
                "source": "fgj", "last_synced": _iso(),
            }},
            upsert=True,
        )

    return {"ok": True, "city": city, "fuente": "fgj", "matched": len(rows), "radius_m": _RADIUS_M}


async def rescore_safety(db, city: str = "CDMX") -> int:
    """Recalcula el score de seguridad (percentil) sobre TODAS las colonias con dato crudo
    (`incidentes_ponderados`). Barato (sin llamadas externas) — lo usa el cron tras cada lote
    para que el ranking se estabilice conforme se sincronizan más colonias."""
    rows = [d async for d in db.crime_zone_colonia.find(
        {}, {"_id": 0, "zone_id": 1, "incidentes_ponderados": 1})]
    vals = [r["incidentes_ponderados"] for r in rows if r.get("incidentes_ponderados") is not None]
    if not vals:
        return 0
    sorted_vals = (_mn.dist_from_values(vals).get("_sorted") or [])
    for r in rows:
        p = r.get("incidentes_ponderados")
        if p is None:
            continue
        pr = _mn.percentile_rank(p, sorted_vals)
        await db.crime_zone_colonia.update_one(
            {"zone_id": r["zone_id"]}, {"$set": {"safety_score": round((1.0 - pr) * 100)}})
    return len(rows)


async def store_raw_incidents(db, zone_id: str, lat: float, lng: float, year_from: int) -> bool:
    """Trae y guarda el incidente ponderado CRUDO de una colonia (sin score · lo pone rescore)."""
    data = await fetch_weighted_incidents(lat, lng, year_from)
    if data is None:
        return False
    top = sorted(data["by_category"].items(), key=lambda kv: -kv[1])[:3]
    await db.crime_zone_colonia.update_one(
        {"zone_id": zone_id},
        {"$set": {
            "zone_id": zone_id, "incidentes_ponderados": data["ponderado"],
            "by_category": dict(top), "radius_m": _RADIUS_M, "source": "fgj", "last_synced": _iso(),
        }},
        upsert=True,
    )
    return True


async def ensure_indexes(db) -> None:
    try:
        await db.crime_zone_colonia.create_index("zone_id", unique=True, name="crime_col_zone_uniq")
    except Exception as e:
        log.warning(f"[fgj] ensure_indexes: {e}")
