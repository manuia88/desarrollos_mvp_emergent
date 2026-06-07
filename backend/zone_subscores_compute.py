"""W5.3 Parte 2A Sub-A — Compute 6 sub-scores oficiales por colonia.

Funciones async para calcular los 6 sub-scores (lifestyle/seguridad/transporte/
amenidades/precio/vibe) desde engines reales del repo, con fallback `stub` 50
+ log warning si la fuente no está disponible.

Engines fuente:
- lifestyle    ← DENUE (categorías recreativas) · stub si denue_zone_density no existe
- seguridad    ← crime_data_engine.aggregate_crime_zone · inversa
- transporte   ← seed COLONIAS scores.movilidad como proxy (no hay GTFS engine)
- amenidades   ← DENUE total density
- precio       ← DRPI snapshot zona vs mediana CDMX
- vibe         ← apify_trends_engine + DENUE cultural

Las 6 corren en paralelo (asyncio.gather).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.zone_subscores_compute")

STUB = {"value": 50.0, "source": "stub", "sample_size": 0}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _wrap(value: float, source: str, sample_size: int = 0) -> Dict[str, Any]:
    val = max(0.0, min(100.0, float(value)))
    return {
        "value": round(val, 2),
        "source": source,
        "sample_size": int(sample_size),
        "computed_at": _iso(),
    }


# ─── Lifestyle (DENUE recreational) ──────────────────────────────────────────

LIFESTYLE_CATEGORIES = {"restaurante", "bar", "cafe", "ocio", "recreacion"}


async def compute_lifestyle(db, zone_slug: str) -> Dict[str, Any]:
    try:
        doc = await db.denue_zone_density.find_one(
            {"zone_id": zone_slug}, {"_id": 0, "by_category": 1, "businesses_per_km2": 1},
        )
        if not doc:
            log.warning(f"[subscores] lifestyle stub {zone_slug}: denue not synced")
            return STUB
        by_cat = doc.get("by_category") or {}
        rec_count = sum(int(v) for k, v in by_cat.items()
                        if any(token in (k or "").lower() for token in LIFESTYLE_CATEGORIES))
        # Normaliza con cap 200 POIs recreativos → 100 score
        score = min(100.0, (rec_count / 200.0) * 100.0)
        return _wrap(score, "denue", sample_size=rec_count)
    except Exception as e:
        log.warning(f"[subscores] lifestyle error {zone_slug}: {e}")
        return STUB


# ─── Seguridad (SESNSP crime data) ──────────────────────────────────────────

async def compute_seguridad(db, zone_slug: str) -> Dict[str, Any]:
    try:
        from crime_data_engine import aggregate_crime_zone
        data = await aggregate_crime_zone(db, zone_slug, period_months=6)
        if not data.get("available"):
            log.warning(f"[subscores] seguridad stub {zone_slug}: {data.get('reason')}")
            return STUB
        per_100k = data.get("incidents_per_100k")
        if per_100k is None:
            return STUB
        # Mapeo conservador: 0 incidents/100k → 100, 5000+/100k → 0
        score = max(0.0, 100.0 - (float(per_100k) / 50.0))
        return _wrap(score, "sesnsp", sample_size=int(data.get("total_incidents") or 0))
    except Exception as e:
        log.warning(f"[subscores] seguridad error {zone_slug}: {e}")
        return STUB


# ─── Transporte (proxy desde seed COLONIAS o stub) ──────────────────────────

async def compute_transporte(db, zone_slug: str) -> Dict[str, Any]:
    """No existe GTFS engine: usamos `scores.movilidad` del seed como proxy.
    Decisión conservadora: source='seed_proxy' (no stub) cuando el seed tiene
    el dato; stub 50 si la colonia no está en el seed.
    """
    try:
        from data_seed import COLONIAS_BY_ID
        rec = COLONIAS_BY_ID.get(zone_slug) or {}
        seed_scores = rec.get("scores") or {}
        v = seed_scores.get("movilidad")
        if v is None:
            log.warning(f"[subscores] transporte stub {zone_slug}: seed missing")
            return STUB
        return _wrap(float(v), "seed_proxy", sample_size=1)
    except Exception as e:
        log.warning(f"[subscores] transporte error {zone_slug}: {e}")
        return STUB


# ─── Amenidades (DENUE total density) ───────────────────────────────────────

async def compute_amenidades(db, zone_slug: str) -> Dict[str, Any]:
    try:
        doc = await db.denue_zone_density.find_one(
            {"zone_id": zone_slug}, {"_id": 0, "businesses_per_km2": 1, "businesses_count_total": 1},
        )
        if not doc:
            log.warning(f"[subscores] amenidades stub {zone_slug}: denue not synced")
            return STUB
        density = float(doc.get("businesses_per_km2") or 0)
        # Referencia ÚNICA de densidad (negocios/km², Polanco ~400) — fuente en metric_normalizer.
        from metric_normalizer import DENUE_DENSITY_REF
        score = min(100.0, (density / DENUE_DENSITY_REF) * 100.0)
        return _wrap(score, "denue", sample_size=int(doc.get("businesses_count_total") or 0))
    except Exception as e:
        log.warning(f"[subscores] amenidades error {zone_slug}: {e}")
        return STUB


# ─── Precio (DRPI vs mediana CDMX) ──────────────────────────────────────────

_DRPI_MEDIAN_CACHE: Dict[str, float] = {}


async def _drpi_median(db) -> Optional[float]:
    """Mediana DRPI nacional (latest period). Cached in-process por 1h."""
    key = "drpi_median"
    if key in _DRPI_MEDIAN_CACHE:
        return _DRPI_MEDIAN_CACHE[key]
    try:
        pipeline = [
            {"$match": {"available": True, "zone_id": {"$ne": "_national_"}}},
            {"$sort": {"period": -1}},
            {"$group": {"_id": "$zone_id", "v": {"$first": "$index_value"}}},
            {"$group": {"_id": None, "values": {"$push": "$v"}}},
        ]
        rows = await db.drpi_snapshots.aggregate(pipeline).to_list(1)
        if not rows or not rows[0].get("values"):
            return None
        vals = sorted(float(v) for v in rows[0]["values"] if v)
        n = len(vals)
        if n == 0:
            return None
        median = vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2
        _DRPI_MEDIAN_CACHE[key] = float(median)
        return float(median)
    except Exception as e:
        log.warning(f"[subscores] drpi median failed: {e}")
        return None


async def compute_precio(db, zone_slug: str) -> Dict[str, Any]:
    """Score=100 si zona ≤ mediana (mejor precio/calidad). Escala lineal hasta 0
    cuando zona es 2× mediana (zona premium = peor precio/calidad)."""
    try:
        snap = await db.drpi_snapshots.find_one(
            {"zone_id": zone_slug, "available": True},
            {"_id": 0, "index_value": 1},
            sort=[("period", -1)],
        )
        if not snap or not snap.get("index_value"):
            log.warning(f"[subscores] precio stub {zone_slug}: no DRPI")
            return STUB
        median = await _drpi_median(db)
        if median is None or median <= 0:
            return STUB
        zone_val = float(snap["index_value"])
        ratio = zone_val / median
        if ratio <= 1.0:
            score = 100.0
        elif ratio >= 2.0:
            score = 0.0
        else:
            score = 100.0 - ((ratio - 1.0) * 100.0)
        return _wrap(score, "drpi", sample_size=1)
    except Exception as e:
        log.warning(f"[subscores] precio error {zone_slug}: {e}")
        return STUB


# ─── Vibe (Trends + DENUE cultural) ─────────────────────────────────────────

CULTURAL_KEYWORDS = {"museo", "teatro", "galeria", "arte", "cultural"}


# Flag para incluir trends en vibe. Deshabilitado por default (Apify runs son
# lentos · 30-60s/query). Cuando se necesite refinar vibe, set to True.
INCLUDE_TRENDS_IN_VIBE = False


async def _trends_score(db, name: str) -> Optional[int]:
    if not INCLUDE_TRENDS_IN_VIBE:
        return None
    try:
        from apify_trends_engine import ApifyTrendsEngine
        eng = ApifyTrendsEngine(db)
        # Timeout corto: Trends external API es opcional (vibe puede usar solo DENUE).
        data = await asyncio.wait_for(
            eng.get_trends_for_query(query=name, geo="MX-CMX", timeframe="now 90-d"),
            timeout=3.0,
        )
        if not data:
            return None
        rows = data.get("response", {}).get("rows") or data.get("rows") or []
        if not rows:
            return None
        vals = [int(r.get("value") or 0) for r in rows if r.get("value") is not None]
        return int(sum(vals) / len(vals)) if vals else None
    except asyncio.TimeoutError:
        log.warning(f"[subscores] vibe trends timeout {name}")
        return None
    except Exception as e:
        log.warning(f"[subscores] vibe trends error {name}: {e}")
        return None


async def compute_vibe(db, zone_slug: str) -> Dict[str, Any]:
    try:
        # 1) cultural POIs density (DENUE)
        cultural = 0
        doc = await db.denue_zone_density.find_one(
            {"zone_id": zone_slug}, {"_id": 0, "by_category": 1},
        )
        by_cat = (doc or {}).get("by_category") or {}
        for k, v in by_cat.items():
            if any(token in (k or "").lower() for token in CULTURAL_KEYWORDS):
                cultural += int(v)

        # 2) trends score (puede ser None)
        from data_seed import COLONIAS_BY_ID
        name = (COLONIAS_BY_ID.get(zone_slug) or {}).get("name", zone_slug)
        trends_val = await _trends_score(db, name)

        # Mix
        cultural_norm = min(100.0, (cultural / 50.0) * 100.0)
        sources = ["denue"]
        if trends_val is not None:
            sources.append("trends")
            score = (cultural_norm * 0.5) + (trends_val * 0.5)
        else:
            score = cultural_norm
        if cultural == 0 and trends_val is None:
            log.warning(f"[subscores] vibe stub {zone_slug}: no signal")
            return STUB
        return _wrap(score, "+".join(sources), sample_size=cultural)
    except Exception as e:
        log.warning(f"[subscores] vibe error {zone_slug}: {e}")
        return STUB


# ─── Orchestration ──────────────────────────────────────────────────────────

async def compute_all_subscores(db, zone_slug: str) -> Dict[str, Dict[str, Any]]:
    """Ejecuta los 6 en paralelo. Devuelve dict per-key con value/source/sample_size/computed_at."""
    coros = [
        compute_lifestyle(db, zone_slug),
        compute_seguridad(db, zone_slug),
        compute_transporte(db, zone_slug),
        compute_amenidades(db, zone_slug),
        compute_precio(db, zone_slug),
        compute_vibe(db, zone_slug),
    ]
    results = await asyncio.gather(*coros, return_exceptions=True)
    keys = ["lifestyle", "seguridad", "transporte", "amenidades", "precio", "vibe"]
    out: Dict[str, Dict[str, Any]] = {}
    for k, r in zip(keys, results):
        if isinstance(r, Exception):
            log.warning(f"[subscores] {k} exception {zone_slug}: {r}")
            out[k] = dict(STUB, computed_at=_iso())
        else:
            out[k] = r
    return out
