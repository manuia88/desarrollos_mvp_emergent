"""
sig_catastro_engine — Valor catastral OFICIAL del suelo ($/m²) por colonia (ING.1/2).
═══════════════════════════════════════════════════════════════════════════════
Fuente: SIG CDMX WFS, capa `geonode:predios2022sig_local` (6,886,398 predios · campos
clave/vsuelo/ayocon/uso_agr). `vsuelo` = valor catastral TOTAL del lote; con el área del
polígono se obtiene el **valor unitario de suelo $/m²** (la base oficial de valuación).

Modelo de valor (reporte founder): valor_comercial ≈ vsuelo($/m²) × factor_SHF × ratio comercial/
catastral. Aquí ingestamos la base oficial granular por colonia (mediana $/m² catastral) y la
mostramos honesta (banda por percentil). El catastral es ~40-65% del comercial → es un PISO/ancla
oficial, no el precio de venta. Cero deuda: si el WFS no responde, no inventa.
"""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import metric_normalizer as _mn

log = logging.getLogger("dmx.sig_catastro")

_RADIUS_M = 450
_COUNT = 300   # muestra de predios por colonia → mediana estable


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _wfs_base() -> str:
    return os.environ.get("IE_SIG_WFS_URL") or "https://catalogov2.sig.cdmx.gob.mx/geoserver/ows"


def _ring(geom: Dict[str, Any]) -> Optional[List[List[float]]]:
    c = geom.get("coordinates") or []
    t = geom.get("type")
    if t == "MultiPolygon":
        return c[0][0] if (c and c[0]) else None
    if t == "Polygon":
        return c[0] if c else None
    return None


def _area_m2(geom: Dict[str, Any]) -> Optional[float]:
    ring = _ring(geom or {})
    if not ring or len(ring) < 3:
        return None
    lat0 = sum(p[1] for p in ring) / len(ring)
    mlat, mlng = 111320.0, 111320.0 * math.cos(math.radians(lat0))
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * mlng, ring[i][1] * mlat
        x2, y2 = ring[i + 1][0] * mlng, ring[i + 1][1] * mlat
        s += x1 * y2 - x2 * y1
    return abs(s) / 2 or None


def _median(xs: List[float]) -> Optional[float]:
    xs = sorted(x for x in xs if x and x > 0)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


async def fetch_vsuelo_zone(lat: float, lng: float, radius_m: int = _RADIUS_M) -> Optional[Dict[str, Any]]:
    """Consulta el WFS de predios alrededor del centro → mediana $/m² catastral del suelo.
    Devuelve {pm2, n} o None si el WFS no respondió (no inventa)."""
    dlat = radius_m / 111320.0
    dlng = radius_m / (111320.0 * max(0.2, math.cos(math.radians(lat))))
    bbox = f"{lat - dlat:.6f},{lng - dlng:.6f},{lat + dlat:.6f},{lng + dlng:.6f},urn:ogc:def:crs:EPSG::4326"
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": "geonode:predios2022sig_local", "count": str(_COUNT),
        "outputFormat": "application/json", "srsName": "EPSG:4326", "bbox": bbox,
    }
    try:
        import httpx
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.get(_wfs_base(), params=params)
        if r.status_code != 200 or "json" not in (r.headers.get("content-type") or "").lower():
            return None
        feats = r.json().get("features", [])
    except Exception as e:
        log.warning(f"[sig] WFS: {e}")
        return None

    pm2s: List[float] = []
    for f in feats:
        try:
            v = float((f.get("properties") or {}).get("vsuelo"))
        except (TypeError, ValueError):
            continue
        a = _area_m2(f.get("geometry") or {})
        if v and a and a > 0:
            pm2s.append(v / a)
    med = _median(pm2s)
    return {"pm2": round(med), "n": len(pm2s)} if med else {"pm2": None, "n": len(pm2s)}


async def sync_vsuelo_for_city(db, city: str = "CDMX", limit: int = 80) -> Dict[str, Any]:
    """Sincroniza el valor catastral del suelo ($/m²) por colonia (mediana de predios) +
    banda por percentil de la ciudad. Honesto: si el WFS no responde, no escribe esa colonia."""
    sincronizadas = con_dato = 0
    rows: List[Dict[str, Any]] = []
    cur = db.colonias.find({"city": city, "center": {"$ne": None}}, {"_id": 0, "id": 1, "center": 1})
    async for c in cur:
        if sincronizadas >= limit:
            break
        ctr = c.get("center")
        if not (isinstance(ctr, (list, tuple)) and len(ctr) == 2):
            continue
        lng, lat = float(ctr[0]), float(ctr[1])
        d = await fetch_vsuelo_zone(lat, lng)
        sincronizadas += 1
        if d and d.get("pm2"):
            rows.append({"id": c["id"], "pm2": d["pm2"], "n": d["n"]})
            con_dato += 1
    # banda por percentil del valor catastral de la ciudad
    dist = _mn.dist_from_values([r["pm2"] for r in rows]) if rows else {"n": 0}
    sv = dist.get("_sorted") or []
    for r in rows:
        pr = _mn.percentile_rank(r["pm2"], sv)
        await db.colonias.update_one({"id": r["id"]}, {"$set": {
            "vsuelo_pm2_catastral": r["pm2"], "vsuelo_n": r["n"],
            "vsuelo_score": round(pr * 100), "vsuelo_synced_at": _iso(),
        }})
    return {"ok": True, "city": city, "sincronizadas": sincronizadas, "con_dato": con_dato,
            "nota": None if con_dato else "El WFS de la SIG no respondió — reintenta."}
