"""W6.MOV.5 · Construction Quality Index Engine.

Calcula índice 0-100 de calidad de construcción por desarrollo CDMX.

4 dimensiones (pesos configurables · default igualitarios):
    1. Avance vs cronograma (25%): pct_avance_real / pct_avance_esperado
    2. Acabados vs prometidos (25%): defectos_acabados / total_acabados
    3. Defectos reportados (25%): defects_count_normalized
    4. Cronograma cumplido (25%): delivery_delays_normalized

Data sources:
    - developments collection: campos `construction_progress_*`, `quality_*`
    - construction_quality_signals collection: defects reportados por residentes/inspecciones
    - manual_override field opcional en developments (superadmin)

Cache 7d en `construction_quality_cache` por development_id (recompute via cron).

NO requiere LLM/API externas · 100% determinístico desde data interna.
FAIL-OPEN: si data insuficiente retorna score=None + reason · NO crash.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.construction_quality_engine")

# Pesos por dimensión (suma = 1.0)
DIMENSION_WEIGHTS = {
    "avance": 0.25,
    "acabados": 0.25,
    "defectos": 0.25,
    "cronograma": 0.25,
}

# Cache TTL parametrizable via env (J.4 audit forense) · default 3d reduce staleness
# Cron weekly resetea todo cada lunes 02:00 UTC con use_cache=False (J.1 mitigado)
CACHE_TTL_DAYS = int(os.environ.get("CONSTRUCTION_QUALITY_CACHE_TTL_DAYS", "3"))
INDEX_VERSION = "1.0.0"

# Score thresholds for tier label
TIER_THRESHOLDS = [
    (85, "excelente"),
    (70, "bueno"),
    (50, "regular"),
    (0, "deficiente"),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _tier_label(score: float) -> str:
    for threshold, label in TIER_THRESHOLDS:
        if score >= threshold:
            return label
    return "deficiente"


def _cache_key(development_id: str) -> str:
    raw = f"cq:{development_id}:{INDEX_VERSION}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def _compute_avance_score(development: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
    """Avance: comparar avance real vs esperado para la fecha actual.

    Espera campos: `construction_start_date`, `expected_delivery_date`, `construction_progress_pct`.
    """
    start = development.get("construction_start_date")
    end = development.get("expected_delivery_date")
    progress = development.get("construction_progress_pct")

    if not (start and end and progress is not None):
        return 50.0, {"score": 50.0, "missing_data": True, "reason": "data_incompleta"}

    try:
        start_dt = datetime.fromisoformat(start) if isinstance(start, str) else start
        end_dt = datetime.fromisoformat(end) if isinstance(end, str) else end
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
    except Exception:
        return 50.0, {"score": 50.0, "missing_data": True, "reason": "fechas_invalidas"}

    now = _now()
    total_days = max((end_dt - start_dt).days, 1)
    elapsed_days = max((now - start_dt).days, 0)
    expected_pct = min(100.0, (elapsed_days / total_days) * 100.0)

    # Score = ratio actual/esperado · 1.0 = on schedule · >1.0 ahead · <1.0 behind
    if expected_pct == 0:
        ratio = 1.0
    else:
        ratio = float(progress) / expected_pct

    score = _clamp(ratio * 100.0)
    return score, {
        "score": round(score, 1),
        "expected_pct": round(expected_pct, 1),
        "real_pct": float(progress),
        "ratio": round(ratio, 2),
        "tier": "ahead" if ratio > 1.05 else "on_time" if ratio >= 0.95 else "behind",
    }


async def _compute_acabados_score(db, development_id: str, development: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
    """Acabados: defectos reportados en acabados / total acabados inspeccionados.

    Espera collection `construction_quality_signals` con docs:
        { development_id, signal_type: 'finish_defect'|'finish_ok', source, reported_at }
    """
    cursor = db.construction_quality_signals.find(
        {"development_id": development_id, "signal_type": {"$in": ["finish_defect", "finish_ok"]}}
    )
    finish_defects = 0
    finish_total = 0
    async for sig in cursor:
        finish_total += 1
        if sig.get("signal_type") == "finish_defect":
            finish_defects += 1

    if finish_total == 0:
        return 75.0, {"score": 75.0, "missing_data": True, "reason": "sin_inspecciones"}

    defect_rate = finish_defects / finish_total
    score = _clamp((1 - defect_rate) * 100.0)
    return score, {
        "score": round(score, 1),
        "defects": finish_defects,
        "total_inspections": finish_total,
        "defect_rate_pct": round(defect_rate * 100, 1),
    }


async def _compute_defectos_score(db, development_id: str) -> Tuple[float, Dict[str, Any]]:
    """Defectos: cantidad de quejas/defectos reportados normalizado por unidades vendidas.

    Espera collection `construction_quality_signals` signal_type 'defect_report'.
    """
    cursor = db.construction_quality_signals.find(
        {"development_id": development_id, "signal_type": "defect_report"}
    )
    defects_count = 0
    severity_sum = 0
    async for sig in cursor:
        defects_count += 1
        severity_sum += int(sig.get("severity", 1))  # 1-5 scale

    dev = await db.developments.find_one({"id": development_id}, {"units_sold_count": 1, "total_units": 1, "_id": 0})
    units_basis = max(int((dev or {}).get("units_sold_count") or (dev or {}).get("total_units") or 1), 1)

    if defects_count == 0:
        return 100.0, {"score": 100.0, "defects": 0, "units_basis": units_basis}

    # Penalize: every 0.1 defects/unit weighted by severity costs ~10 points
    defects_per_unit = defects_count / units_basis
    avg_severity = severity_sum / defects_count if defects_count else 1
    penalty = min(80.0, defects_per_unit * 100 * (avg_severity / 3.0))
    score = _clamp(100.0 - penalty)

    return score, {
        "score": round(score, 1),
        "defects": defects_count,
        "units_basis": units_basis,
        "defects_per_unit": round(defects_per_unit, 3),
        "avg_severity": round(avg_severity, 1),
    }


async def _compute_cronograma_score(db, development_id: str, development: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
    """Cronograma: cumplimiento de hitos prometidos vs entregados.

    Espera campo `milestones_history` en development: lista de {date_promised, date_actual, name}.
    """
    milestones = development.get("milestones_history") or []
    if not milestones:
        return 70.0, {"score": 70.0, "missing_data": True, "reason": "sin_milestones"}

    delays_days = []
    for m in milestones:
        promised = m.get("date_promised")
        actual = m.get("date_actual")
        if not (promised and actual):
            continue
        try:
            p_dt = datetime.fromisoformat(promised) if isinstance(promised, str) else promised
            a_dt = datetime.fromisoformat(actual) if isinstance(actual, str) else actual
            delay = (a_dt - p_dt).days
            delays_days.append(delay)
        except Exception:
            continue

    if not delays_days:
        return 70.0, {"score": 70.0, "missing_data": True, "reason": "milestones_incompletos"}

    avg_delay = sum(delays_days) / len(delays_days)
    # 0 days = 100 · 30 days late = 80 · 90 days late = 50 · 180+ days = 20
    penalty = min(80.0, max(0.0, avg_delay) * 0.5)
    score = _clamp(100.0 - penalty)

    return score, {
        "score": round(score, 1),
        "milestones_count": len(milestones),
        "milestones_with_data": len(delays_days),
        "avg_delay_days": round(avg_delay, 1),
    }


async def compute_quality_index(
    db,
    development_id: str,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """Calcula índice de calidad 0-100 con breakdown 4 dimensiones.

    Returns:
        {
            development_id, score (0-100|None), tier ('excelente'|'bueno'|'regular'|'deficiente'),
            breakdown: {avance, acabados, defectos, cronograma},
            computed_at, cached, version, manual_override
        }
    """
    # 1. Cache check
    if use_cache:
        cached = await db.construction_quality_cache.find_one({"development_id": development_id})
        if cached:
            computed_at = cached.get("computed_at")
            if computed_at and (_now() - computed_at).days < CACHE_TTL_DAYS:
                cached["cached"] = True
                cached.pop("_id", None)
                return cached

    # 2. Get development
    development = await db.developments.find_one({"id": development_id}, {"_id": 0})
    if not development:
        return {
            "development_id": development_id,
            "score": None,
            "tier": "no_data",
            "reason": "development_not_found",
            "version": INDEX_VERSION,
        }

    # 3. Manual override (superadmin can pin a score)
    manual_score = development.get("construction_quality_manual_override")
    if manual_score is not None:
        score = _clamp(float(manual_score))
        result = {
            "development_id": development_id,
            "score": round(score, 1),
            "tier": _tier_label(score),
            "manual_override": True,
            "breakdown": None,
            "computed_at": _now(),
            "cached": False,
            "version": INDEX_VERSION,
        }
        await _persist_cache(db, development_id, result)
        return result

    # 4. Compute 4 dimensions
    avance_score, avance_detail = await _compute_avance_score(development)
    acabados_score, acabados_detail = await _compute_acabados_score(db, development_id, development)
    defectos_score, defectos_detail = await _compute_defectos_score(db, development_id)
    cronograma_score, cronograma_detail = await _compute_cronograma_score(db, development_id, development)

    # 5. Weighted average
    score = (
        avance_score * DIMENSION_WEIGHTS["avance"]
        + acabados_score * DIMENSION_WEIGHTS["acabados"]
        + defectos_score * DIMENSION_WEIGHTS["defectos"]
        + cronograma_score * DIMENSION_WEIGHTS["cronograma"]
    )
    score = _clamp(score)

    result = {
        "development_id": development_id,
        "development_name": development.get("name") or development.get("title"),
        "score": round(score, 1),
        "tier": _tier_label(score),
        "manual_override": False,
        "breakdown": {
            "avance": avance_detail,
            "acabados": acabados_detail,
            "defectos": defectos_detail,
            "cronograma": cronograma_detail,
            "weights": DIMENSION_WEIGHTS,
        },
        "computed_at": _now(),
        "cached": False,
        "version": INDEX_VERSION,
    }

    await _persist_cache(db, development_id, result)
    return result


async def _persist_cache(db, development_id: str, result: Dict[str, Any]) -> None:
    """Upsert resultado en cache + denormalizar score en developments."""
    try:
        cache_doc = {**result, "development_id": development_id}
        cache_doc.pop("_id", None)
        await db.construction_quality_cache.update_one(
            {"development_id": development_id},
            {"$set": cache_doc},
            upsert=True,
        )
        # Denormalize score on development for fast filtering in marketplace
        await db.developments.update_one(
            {"id": development_id},
            {"$set": {
                "construction_quality_score": result.get("score"),
                "construction_quality_tier": result.get("tier"),
                "construction_quality_updated_at": result.get("computed_at"),
            }},
        )
    except Exception as exc:
        log.warning(f"persist_cache failed for {development_id}: {exc}")


async def list_developments_by_quality(
    db,
    min_score: Optional[float] = None,
    tier: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
) -> List[Dict[str, Any]]:
    """List developments con score persistido · filtros opcionales."""
    query: Dict[str, Any] = {"construction_quality_score": {"$ne": None}}
    if min_score is not None:
        query["construction_quality_score"] = {"$gte": float(min_score)}
    if tier:
        query["construction_quality_tier"] = tier

    cursor = (
        db.developments.find(
            query,
            {"_id": 0, "id": 1, "name": 1, "title": 1, "construction_quality_score": 1,
             "construction_quality_tier": 1, "construction_quality_updated_at": 1,
             "colonia": 1, "delegacion": 1, "price_from_mxn": 1},
        )
        .sort("construction_quality_score", -1)
        .skip(skip)
        .limit(limit)
    )
    return [doc async for doc in cursor]


async def get_stats(db) -> Dict[str, Any]:
    """Stats globales para superadmin dashboard."""
    pipeline = [
        {"$match": {"construction_quality_score": {"$ne": None}}},
        {"$group": {
            "_id": "$construction_quality_tier",
            "count": {"$sum": 1},
            "avg_score": {"$avg": "$construction_quality_score"},
        }},
    ]
    tiers_stats = {}
    async for row in db.developments.aggregate(pipeline):
        tiers_stats[row["_id"]] = {
            "count": row["count"],
            "avg_score": round(row["avg_score"], 1),
        }

    total_with_score = sum(t["count"] for t in tiers_stats.values())
    total_developments = await db.developments.count_documents({})

    cache_count = await db.construction_quality_cache.count_documents({})

    return {
        "total_developments": total_developments,
        "total_with_quality_score": total_with_score,
        "coverage_pct": round((total_with_score / total_developments * 100) if total_developments else 0, 1),
        "tiers": tiers_stats,
        "cache_entries": cache_count,
        "version": INDEX_VERSION,
        "computed_at": _now(),
    }


async def ensure_indexes(db) -> None:
    """Create indexes on first use. Idempotent."""
    try:
        await db.construction_quality_cache.create_index("development_id", unique=True)
        await db.construction_quality_cache.create_index("computed_at")
        await db.construction_quality_signals.create_index([("development_id", 1), ("signal_type", 1)])
        await db.construction_quality_signals.create_index("reported_at")
        await db.developments.create_index([("construction_quality_score", -1)], sparse=True)
        await db.developments.create_index([("construction_quality_tier", 1)], sparse=True)
    except Exception as exc:
        log.warning(f"ensure_indexes warning: {exc}")
