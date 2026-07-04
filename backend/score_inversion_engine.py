"""F0.1 Sub-A — Score Inversión DMX (0-100 composite score).

Components:
  - TIR normalized        40% weight (investment_simulator base scenario)
  - Zone Score            30% weight (zone_score_engine)
  - Demand-Supply gap     20% weight (maps_cross_engine)
  - Stress resilience     10% weight (investment_simulator stress_test)

Label coding:
  90-100 AAA · 80-89 AA · 70-79 A · 60-69 BBB · 50-59 BB · <50 B

Cache TTL 24h in `score_inversion_cache` collection.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.score_inversion")

CACHE_TTL_HOURS = 24

WEIGHTS = {"tir": 0.40, "zone": 0.30, "demand": 0.20, "stress": 0.10}

ZONE_TIER_TO_SCORE = {"A": 95, "B": 80, "C": 65, "D": 50, "E": 35, "F": 20}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _score_id(colonia: str, precio: float, plazo: int, m2: float,
              recamaras: int, banos: int, antiguedad: int) -> str:
    key = f"{colonia}:{precio:.0f}:{plazo}:{m2:.0f}:{recamaras}:{banos}:{antiguedad}"
    return hashlib.sha256(key.encode()).hexdigest()[:24]


def _label_for(score: int) -> Dict[str, str]:
    if score >= 90:
        return {"label": "AAA · Investment grade prima",
                "recommendation": "Inversión muy recomendada", "tier": "AAA"}
    if score >= 80:
        return {"label": "AA · Investment grade alta",
                "recommendation": "Inversión muy recomendada", "tier": "AA"}
    if score >= 70:
        return {"label": "A · Investment grade",
                "recommendation": "Inversión recomendada", "tier": "A"}
    if score >= 60:
        return {"label": "BBB · Investment grade media",
                "recommendation": "Inversión recomendada con cautela", "tier": "BBB"}
    if score >= 50:
        return {"label": "BB · Especulativo",
                "recommendation": "Considerar alternativas", "tier": "BB"}
    return {"label": "B · Alto riesgo",
            "recommendation": "No recomendado actualmente", "tier": "B"}


# ─── Component normalizations ─────────────────────────────────────────────────

def _normalize_tir(tir_anual_pct: Optional[float]) -> float:
    if tir_anual_pct is None:
        return 50.0
    if tir_anual_pct >= 15:
        return 100.0
    if tir_anual_pct <= 0:
        return 0.0
    return round((tir_anual_pct / 15.0) * 100, 1)


def _normalize_zone(zone_score_doc: Optional[Dict[str, Any]]) -> float:
    if not zone_score_doc:
        return 50.0
    if "score_total" in zone_score_doc:
        return float(zone_score_doc["score_total"])
    if "score" in zone_score_doc:
        return float(zone_score_doc["score"])
    tier = (zone_score_doc.get("tier") or "C").upper()[:1]
    return float(ZONE_TIER_TO_SCORE.get(tier, 50))


def _normalize_demand(score: Optional[float]) -> float:
    # score = dem_norm - sup_norm ∈ [-1,1] (del geojson demand-gap). Mapea a [0,100] centrado en 50.
    # (Antes esperaba una escala de conteo ±30 y leía una clave inexistente → siempre 50 = neutro muerto.)
    if score is None:
        return 50.0
    s = max(-1.0, min(1.0, score))
    return round(50 + s * 50, 1)


def _normalize_stress(stress_result: Optional[Dict[str, Any]]) -> float:
    if not stress_result:
        return 50.0
    scenarios = stress_result.get("scenarios") or []
    if not scenarios:
        # Single result with positive_pct
        pct = stress_result.get("positive_pct")
        if pct is not None:
            return float(pct)
        return 50.0
    positive = sum(1 for s in scenarios if (s.get("roi_pct") or s.get("roi") or 0) >= 0)
    return round((positive / len(scenarios)) * 100, 1)


# ─── Engine hydration (best-effort) ──────────────────────────────────────────

async def _fetch_factors(
    db, colonia_slug: str, precio: float, plazo_meses: int, m2: float,
    recamaras: int, banos: int, antiguedad: int,
) -> Dict[str, Any]:
    tir_anual: Optional[float] = None
    zone_doc: Optional[Dict[str, Any]] = None
    gap_score: Optional[float] = None
    stress_doc: Optional[Dict[str, Any]] = None

    # Investment simulator base scenario
    try:
        from investment_simulator_engine import simulate
        sim = await simulate(
            db,
            precio_entrada=precio, plazo_meses=plazo_meses, m2=m2,
            colonia_slug=colonia_slug,
        )
        # simulate() returns either {scenarios:[…]} OR top-level conservador/base/optimista
        base = sim.get("base") if isinstance(sim.get("base"), dict) else None
        if not base:
            bundles = sim.get("scenarios") or sim.get("bundles") or []
            base = next((b for b in bundles if str(b.get("label", "")).lower().startswith("base")
                         or str(b.get("name", "")).lower().startswith("base")), None)
            if not base and bundles:
                base = bundles[len(bundles) // 2]
        if base:
            tir_anual = float(base.get("tir_anual_pct") or base.get("tir") or 0)
    except Exception as exc:
        log.debug(f"[score_inv] simulate failed: {exc}")

    # Zone score
    try:
        from zone_score_engine import get_score_or_compute
        zs = await get_score_or_compute(db, colonia_slug, tier="colonia")
        if zs and not zs.get("error"):
            zone_doc = zs
    except Exception as exc:
        log.debug(f"[score_inv] zone score failed: {exc}")

    # Demand-supply gap
    try:
        from maps_cross_engine import demand_supply_gap_geojson
        geo = await demand_supply_gap_geojson(db)
        feats = (geo or {}).get("features") or []
        for f in feats:
            p = f.get("properties") or {}
            if p.get("colonia_id") == colonia_slug or p.get("slug") == colonia_slug:
                gap_score = float(p.get("score") or 0)   # 'score' = dem_norm - sup_norm ∈ [-1,1]
                break
    except Exception as exc:
        log.debug(f"[score_inv] demand failed: {exc}")

    # Stress test · P1.3 · stress_test recibe UN scenario_bundle (dict), no db+kwargs sueltos.
    # Antes lanzaba TypeError siempre → stress_doc=None → el componente de stress del score caía a 50.
    try:
        from investment_simulator_engine import stress_test
        tier_zona = "B"
        try:
            if isinstance(base, dict) and base.get("tier"):
                tier_zona = base["tier"]
            elif isinstance(zone_doc, dict):
                tier_zona = zone_doc.get("tier") or zone_doc.get("tier_zona") or "B"
        except Exception:
            pass
        st = await stress_test({
            "precio_entrada": precio,
            "plazo_meses": plazo_meses,
            "m2": m2,
            "tier_zona": tier_zona,
        })
        stress_doc = st
    except Exception as exc:
        log.debug(f"[score_inv] stress failed: {exc}")

    return {
        "tir_anual": tir_anual,
        "zone_doc": zone_doc,
        "gap_score": gap_score,
        "stress_doc": stress_doc,
    }


# ─── Public API ──────────────────────────────────────────────────────────────

async def compute_score(
    db,
    colonia_slug: str,
    precio: float,
    plazo_meses: int = 24,
    m2: float = 80.0,
    recamaras: int = 2,
    banos: int = 2,
    antiguedad_anos: int = 0,
    use_cache: bool = True,
) -> Dict[str, Any]:
    sid = _score_id(colonia_slug, precio, plazo_meses, m2, recamaras, banos, antiguedad_anos)

    if use_cache:
        try:
            cached = await db.score_inversion_cache.find_one({"score_id": sid}, {"_id": 0})
            if cached and cached.get("expires_at"):
                try:
                    exp = datetime.fromisoformat(cached["expires_at"].replace("Z", "+00:00"))
                except Exception:
                    exp = _now() - timedelta(seconds=1)
                if exp > _now():
                    return cached
        except Exception as exc:
            log.debug(f"[score_inv] cache lookup failed: {exc}")

    factors_raw = await _fetch_factors(
        db, colonia_slug, precio, plazo_meses, m2, recamaras, banos, antiguedad_anos,
    )

    n_tir = _normalize_tir(factors_raw["tir_anual"])
    n_zone = _normalize_zone(factors_raw["zone_doc"])
    n_demand = _normalize_demand(factors_raw["gap_score"])
    n_stress = _normalize_stress(factors_raw["stress_doc"])

    contribs = {
        "tir":    round(n_tir * WEIGHTS["tir"], 1),
        "zone":   round(n_zone * WEIGHTS["zone"], 1),
        "demand": round(n_demand * WEIGHTS["demand"], 1),
        "stress": round(n_stress * WEIGHTS["stress"], 1),
    }
    score = int(round(sum(contribs.values())))
    score = max(0, min(score, 100))
    label_info = _label_for(score)

    factors_breakdown = {
        "tir":    {"value": n_tir,    "weight_pct": int(WEIGHTS["tir"] * 100),
                   "contribution": contribs["tir"],    "raw": factors_raw["tir_anual"]},
        "zone":   {"value": n_zone,   "weight_pct": int(WEIGHTS["zone"] * 100),
                   "contribution": contribs["zone"],   "raw": (factors_raw["zone_doc"] or {}).get("tier")},
        "demand": {"value": n_demand, "weight_pct": int(WEIGHTS["demand"] * 100),
                   "contribution": contribs["demand"], "raw": factors_raw["gap_score"]},
        "stress": {"value": n_stress, "weight_pct": int(WEIGHTS["stress"] * 100),
                   "contribution": contribs["stress"], "raw": (factors_raw["stress_doc"] or {}).get("scenarios_count")},
    }

    doc = {
        "score_id": sid,
        "colonia_slug": colonia_slug,
        "precio": precio, "plazo_meses": plazo_meses, "m2": m2,
        "recamaras": recamaras, "banos": banos, "antiguedad_anos": antiguedad_anos,
        "score": score,
        "label": label_info["label"],
        "tier": label_info["tier"],
        "recommendation": label_info["recommendation"],
        "factors": factors_breakdown,
        "computed_at": _iso(),
        "expires_at": (_now() + timedelta(hours=CACHE_TTL_HOURS)).isoformat(),
    }

    try:
        await db.score_inversion_cache.update_one(
            {"score_id": sid}, {"$set": doc}, upsert=True,
        )
    except Exception as exc:
        log.warning(f"[score_inv] cache persist failed: {exc}")
    doc.pop("_id", None)
    return doc


async def top_colonias_by_score(
    db, period: Optional[str] = None, limit: int = 10,
    plazo_meses: int = 24, m2: float = 80.0,
) -> List[Dict[str, Any]]:
    """Compute scores for known colonias (from data_seed) and return top N."""
    try:
        from data_seed import COLONIAS_BY_ID
        candidates = list(COLONIAS_BY_ID.items())
    except Exception:
        candidates = []
    out: List[Dict[str, Any]] = []
    for slug, info in candidates:
        col_price_m2 = float(info.get("price_m2_num") or 50000)
        precio = col_price_m2 * m2
        try:
            sc = await compute_score(
                db, slug, precio=precio, plazo_meses=plazo_meses, m2=m2,
                recamaras=2, banos=2, antiguedad_anos=0, use_cache=True,
            )
            out.append({
                "colonia_slug": slug,
                "colonia_name": info.get("name") or slug.replace("-", " ").title(),
                "score": sc["score"],
                "tier": sc["tier"],
                "label": sc["label"],
                "recommendation": sc["recommendation"],
            })
        except Exception as exc:
            log.debug(f"[score_inv] top compute failed for {slug}: {exc}")
            continue
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:limit]


async def ensure_score_inversion_indexes(db) -> None:
    try:
        await db.score_inversion_cache.create_index("score_id", unique=True)
        await db.score_inversion_cache.create_index("colonia_slug")
        await db.score_inversion_cache.create_index([("computed_at", -1)])
    except Exception as exc:
        log.warning(f"[score_inv] indexes failed: {exc}")
