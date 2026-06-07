"""W3.1A Phase 5 Foundation — Zone Score A-F Unified Engine.

Composite 6-dimension score over:
  1. Liquidez        — DOM velocity from cube (placeholder 50 until DRPI W3.3)
  2. Supply pressure — units_active / units_total from cube W2.5
  3. Demand growth   — leads delta 30d from facts_daily_zone (or cards delta)
  4. Risk Score      — placeholder 50 until W3.4 ship
  5. Yield esperado  — (alquiler_promedio / precio_mediano) × 100 or estimate
  6. DENUE density   — businesses_per_km2 normalized from denue_zone_density

Each dimension normalized 0–100. Composite = weighted average.
Letter: A≥80, B 65-79, C 50-64, D 35-49, E 20-34, F<20

Collection db.zone_scores:
  { zone_id, tier, score_letter, score_numeric, formula_version,
    components:{liquidez,supply,demand,risk,yield_score,denue_density},
    computed_at }
  index (zone_id, computed_at desc) + TTL 90d
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.zone_score_engine")

FORMULA_VERSION = "1.0.0"
WEIGHTS = {
    "liquidez":      0.20,
    "supply":        0.15,
    "demand":        0.25,
    "risk":          0.15,
    "yield_score":   0.15,
    "denue_density": 0.10,
}
# Referencia ÚNICA de densidad comercial (negocios/km²) — fuente única en metric_normalizer.
# Antes 3000 aquí vs 500 en subscores (contradicción que sub-calificaba todo). Unificado a 500
# (Polanco ~400). Pendiente upgrade a percentil real (Tanda B.2).
from metric_normalizer import DENUE_DENSITY_REF as MAX_DENSITY_REF  # noqa: E402
# Annual gross yield threshold refs
YIELD_HIGH = 8.0    # 8% yield → score 100
YIELD_MID  = 5.0    # 5% yield → score 60
YIELD_LOW  = 2.0    # 2% yield → score 20


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _letter(score: float) -> str:
    if score >= 80:
        return "A"
    if score >= 65:
        return "B"
    if score >= 50:
        return "C"
    if score >= 35:
        return "D"
    if score >= 20:
        return "E"
    return "F"


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


# ─── Dimension helpers ─────────────────────────────────────────────────────────

def _score_supply_pressure(kpis: Dict[str, Any]) -> float:
    """Lower supply overhang → higher score (scarce = liquid)."""
    units_total = kpis.get("units_total") or 0
    units_sold  = kpis.get("units_sold")  or 0
    if units_total <= 0:
        return 50.0
    absorption = units_sold / units_total  # 0..1
    # High absorption (>70%) → high score 80-100
    # Low absorption (<20%)  → low score 10-30
    score = absorption * 100
    return _clamp(score)


def _score_demand_growth(current_leads: float, prev_leads: float) -> float:
    """Demand growth normalized to 0-100."""
    if prev_leads <= 0:
        return 50.0  # no baseline
    delta_pct = (current_leads - prev_leads) / prev_leads * 100
    # +50% → near 100; -50% → near 0; 0% → 50
    score = 50 + delta_pct
    return _clamp(score)


def _score_yield(avg_rental_mxn: Optional[float], avg_price_mxn: Optional[float]) -> float:
    """Gross yield → score 0-100."""
    if not avg_rental_mxn or not avg_price_mxn or avg_price_mxn <= 0:
        return 50.0  # placeholder
    annual_rental = avg_rental_mxn * 12
    gross_yield_pct = (annual_rental / avg_price_mxn) * 100
    if gross_yield_pct >= YIELD_HIGH:
        return 100.0
    if gross_yield_pct >= YIELD_MID:
        frac = (gross_yield_pct - YIELD_MID) / (YIELD_HIGH - YIELD_MID)
        return _clamp(60 + frac * 40)
    if gross_yield_pct >= YIELD_LOW:
        frac = (gross_yield_pct - YIELD_LOW) / (YIELD_MID - YIELD_LOW)
        return _clamp(20 + frac * 40)
    return _clamp(gross_yield_pct * 10)


def _score_denue_density(businesses_per_km2: Optional[float]) -> float:
    """Normalize DENUE density against MAX_DENSITY_REF."""
    if businesses_per_km2 is None:
        return 50.0
    score = min(businesses_per_km2 / MAX_DENSITY_REF, 1.0) * 100
    return _clamp(score)


# ─── Main compute ──────────────────────────────────────────────────────────────

async def compute_zone_score(
    db, zone_id: str, tier: str = "colonia",
) -> Dict[str, Any]:
    """Compute composite zone score for zone_id."""
    # 1. Current KPIs from cube
    cube_row = await db.cube_aggregations.find_one(
        {"tier_id": zone_id, "period": "current"}, {"_id": 0},
    )
    kpis = (cube_row or {}).get("kpis") or {}

    # 2. Demand growth: leads 0-30d vs 30-60d from facts_daily_zone
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_60 = now - timedelta(days=60)

    async def _sum_leads(start, end) -> float:
        recent_cursor = db.facts_daily_zone.find(
            {"meta.zone_id": zone_id, "ts": {"$gte": start, "$lt": end}},
            {"_id": 0, "kpis.leads_count": 1},
        )
        total = 0.0
        async for doc in recent_cursor:
            v = (doc.get("kpis") or {}).get("leads_count") or 0
            total += float(v)
        return total

    leads_now  = await _sum_leads(cutoff_30, now) or float(kpis.get("leads_count") or 0)
    leads_prev = await _sum_leads(cutoff_60, cutoff_30)
    if leads_prev == 0 and leads_now > 0:
        leads_prev = leads_now * 0.85  # assume 15% growth if no history

    # 3. DENUE density
    denue_doc = await db.denue_zone_density.find_one({"zone_id": zone_id}, {"_id": 0})
    denue_density_km2 = (denue_doc or {}).get("businesses_per_km2")

    # 4. Yield — try avg_rental_mxn from cube or estimate
    avg_price = kpis.get("avg_price_mxn")
    avg_rental = kpis.get("avg_rental_mxn")  # may not exist
    if not avg_rental and avg_price:
        # Estimate rental as 0.4% of price per month (very conservative CDMX estimate)
        avg_rental = avg_price * 0.004

    # ── Dimension scores ──
    dim_liquidez      = 50.0   # placeholder until DRPI W3.3
    dim_supply        = _score_supply_pressure(kpis)
    dim_demand        = _score_demand_growth(leads_now, leads_prev)
    # W3.4A — Risk score real (sustituye placeholder)
    try:
        from risk_score_engine import get_risk_score_or_compute
        risk_doc = await get_risk_score_or_compute(db, zone_id)
        if risk_doc.get("available") and isinstance(risk_doc.get("score_numeric"), (int, float)):
            dim_risk = float(risk_doc["score_numeric"])
        else:
            dim_risk = 50.0
    except Exception as e:
        log.warning(f"[score] risk integration failed {zone_id}: {e}")
        dim_risk = 50.0
    dim_yield         = _score_yield(avg_rental, avg_price)
    dim_denue         = _score_denue_density(denue_density_km2)

    components = {
        "liquidez":      round(dim_liquidez, 1),
        "supply":        round(dim_supply, 1),
        "demand":        round(dim_demand, 1),
        "risk":          round(dim_risk, 1),
        "yield_score":   round(dim_yield, 1),
        "denue_density": round(dim_denue, 1),
    }

    # Weighted composite
    composite = sum(
        components[k] * WEIGHTS[k]
        for k in WEIGHTS
    )
    composite = round(composite, 1)
    letter = _letter(composite)

    doc = {
        "zone_id": zone_id,
        "tier": tier,
        "zone_name": (cube_row or {}).get("name") or zone_id,
        "score_letter": letter,
        "score_numeric": composite,
        "components": components,
        "formula_version": FORMULA_VERSION,
        "placeholder_flags": {
            "liquidez": True,   # DRPI W3.3 pending integration into Zone Score
            "risk": False,      # W3.4A active (SESNSP V1)
        },
        "computed_at": _iso(),
        "computed_at_dt": now,
    }
    try:
        await db.zone_scores.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[score] insert failed {zone_id}: {e}")

    out = dict(doc)
    out.pop("_id", None)
    out.pop("computed_at_dt", None)
    return out


async def get_latest_score(db, zone_id: str) -> Optional[Dict[str, Any]]:
    """Return most recent zone score."""
    doc = await db.zone_scores.find_one(
        {"zone_id": zone_id},
        {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    return doc


async def get_score_or_compute(db, zone_id: str, tier: str = "colonia") -> Dict[str, Any]:
    """Return cached score if < 24h old, else recompute."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    cached = await db.zone_scores.find_one(
        {"zone_id": zone_id, "computed_at_dt": {"$gte": cutoff}},
        {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    if cached:
        return {**cached, "cache": "hit"}
    result = await compute_zone_score(db, zone_id, tier)
    return {**result, "cache": "miss"}


async def list_all_scores(
    db, tier: Optional[str] = None, limit: int = 50,
) -> List[Dict[str, Any]]:
    """Return paginated list of latest scores per zone."""
    match = {}
    if tier:
        match["tier"] = tier
    pipeline = [
        {"$sort": {"computed_at_dt": -1}},
        {"$group": {"_id": "$zone_id",
                    "doc": {"$first": "$$ROOT"}}},
        {"$replaceRoot": {"newRoot": "$doc"}},
        {"$project": {"_id": 0, "computed_at_dt": 0}},
        {"$sort": {"score_numeric": -1}},
        {"$limit": limit},
    ]
    if match:
        pipeline.insert(0, {"$match": match})
    cursor = db.zone_scores.aggregate(pipeline)
    return [doc async for doc in cursor]


# ─── W5.2 — Sub-scores desagregados (lifestyle, seguridad, transporte,
#            amenidades, precio, vibe) ─────────────────────────────────────────

SUBSCORE_KEYS = ("lifestyle", "seguridad", "transporte", "amenidades", "precio", "vibe")

SUBSCORE_LABELS_ES = {
    "lifestyle":  "Lifestyle",
    "seguridad":  "Seguridad",
    "transporte": "Transporte",
    "amenidades": "Amenidades",
    "precio":     "Precio / m²",
    "vibe":       "Vibe urbano",
}

SUBSCORE_DEFINITIONS_ES = {
    "lifestyle":  "Calidad de vida diaria: parques, gastronomía, cultura.",
    "seguridad":  "Incidencia delictiva normalizada y percepción ciudadana.",
    "transporte": "Cercanía a Metro, Metrobús y conectividad vial.",
    "amenidades": "Densidad comercial y servicios DENUE en 1 km.",
    "precio":     "Plusvalía esperada y costo / m² competitivo.",
    "vibe":       "Carácter cultural y atractivo de barrio.",
}

# Mapping desde el seed COLONIAS_BY_ID (keys antiguas) a las 6 sub-scores oficiales.
# Decisión conservadora: cuando el seed no tiene la clave nueva, usamos el proxy
# definido aquí para no devolver fallback 50 sobre toda la base.
SEED_KEY_MAPPING = {
    "lifestyle":  "vida",
    "seguridad":  "seguridad",
    "transporte": "movilidad",
    "amenidades": "comercio",
    "precio":     "plusvalia",
    "vibe":       "educacion",
}


def _narrative_es(label: str, value: Optional[float]) -> str:
    if value is None:
        return f"{label}: sin datos suficientes"
    v = float(value)
    if v >= 75:
        return f"{label} alto"
    if v >= 60:
        return f"{label} medio"
    return f"{label} bajo"


def _extract_subscores_from_doc(doc: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """Buscar los 6 sub-scores en un doc de zone_scores o en un seed colonia.

    Orden de prioridad por clave:
      1. `score_{key}` (ej. score_lifestyle) ← canónico (brochure_renderer)
      2. `{key}` directo en root ← fallback brochure
      3. `subscores.{key}` ← formato W5.2 si llega a persistirse así
      4. `scores.{seed_mapping}` ← mock seed COLONIAS_BY_ID
    """
    out: Dict[str, Optional[float]] = {}
    subscores_obj = doc.get("subscores") or {}
    seed_scores = doc.get("scores") or {}
    for key in SUBSCORE_KEYS:
        val = (
            doc.get(f"score_{key}")
            or doc.get(key)
            or subscores_obj.get(key)
            or seed_scores.get(SEED_KEY_MAPPING[key])
        )
        try:
            out[key] = float(val) if val is not None else None
        except (TypeError, ValueError):
            out[key] = None
    return out


async def get_zone_with_subscores(db, slug: str) -> Dict[str, Any]:
    """W5.2 Sub-A — devolver zone + 6 sub-scores + narratives.

    W5.3 Parte 2A — Prioriza `zone_scores[slug].subscores_real` (computado por
    cron de engines reales) sobre la fallback chain de seed.
    """
    # Try zone_scores collection first
    zs_doc = await db.zone_scores.find_one(
        {"zone_id": slug},
        {"_id": 0, "computed_at_dt": 0},
        sort=[("computed_at_dt", -1)],
    )
    source = "fallback"
    subs: Dict[str, Optional[float]] = {k: None for k in SUBSCORE_KEYS}
    per_key_source: Dict[str, str] = {}
    per_key_computed_at: Dict[str, Optional[str]] = {}
    score_total: Optional[float] = None
    score_letter: Optional[str] = None
    name: Optional[str] = None
    alcaldia: Optional[str] = None

    # ── W5.3 Parte 2A — Prioridad: subscores_real ────────────────────────────
    real = (zs_doc or {}).get("subscores_real") or {}
    if real:
        for k in SUBSCORE_KEYS:
            entry = real.get(k) or {}
            val = entry.get("value")
            src = entry.get("source")
            if val is not None and src and src != "stub":
                try:
                    subs[k] = float(val)
                    per_key_source[k] = src
                    per_key_computed_at[k] = entry.get("computed_at")
                    source = "real"
                except (TypeError, ValueError):
                    pass

    if zs_doc:
        score_total = zs_doc.get("score_numeric")
        score_letter = zs_doc.get("score_letter")
        name = zs_doc.get("zone_name")
        extracted = _extract_subscores_from_doc(zs_doc)
        for k in SUBSCORE_KEYS:
            if subs[k] is None and extracted.get(k) is not None:
                subs[k] = extracted[k]
                per_key_source[k] = "zone_scores_legacy"
                if source == "fallback":
                    source = "zone_scores"

    # Fallback to seed COLONIAS_BY_ID for missing sub-scores
    try:
        from data_seed import COLONIAS_BY_ID
        seed = COLONIAS_BY_ID.get(slug)
        if seed:
            name = name or seed.get("name")
            alcaldia = seed.get("alcaldia")
            seed_extracted = _extract_subscores_from_doc(seed)
            for k in SUBSCORE_KEYS:
                if subs[k] is None and seed_extracted.get(k) is not None:
                    subs[k] = seed_extracted[k]
                    per_key_source[k] = "seed"
                    if source == "fallback":
                        source = "seed"
    except Exception:
        pass

    # Build narratives + final fallback 50
    narratives: Dict[str, str] = {}
    final_subs: Dict[str, float] = {}
    final_meta: Dict[str, Dict[str, Any]] = {}
    for k in SUBSCORE_KEYS:
        label = SUBSCORE_LABELS_ES[k]
        val = subs[k]
        if val is None:
            final_subs[k] = 50.0
            narratives[k] = f"{label}: sin datos suficientes"
            final_meta[k] = {"value": 50.0, "source": "stub", "computed_at": None}
        else:
            final_subs[k] = round(float(val), 2)
            narratives[k] = _narrative_es(label, val)
            final_meta[k] = {
                "value": round(float(val), 2),
                "source": per_key_source.get(k, "unknown"),
                "computed_at": per_key_computed_at.get(k),
            }

    return {
        "slug": slug,
        "name": name or slug.replace("-", " ").title(),
        "alcaldia": alcaldia,
        "score_total": round(float(score_total), 2) if score_total is not None else None,
        "score_letter": score_letter,
        "subscores": final_subs,
        "subscores_meta": final_meta,
        "narratives": narratives,
        "labels": SUBSCORE_LABELS_ES,
        "definitions": SUBSCORE_DEFINITIONS_ES,
        "source": source,
        "generated_at": _iso(),
    }


async def list_top_zones_by_subscore(
    db, subscore: str, limit: int = 20,
) -> List[Dict[str, Any]]:
    """W5.2 Sub-A — ordenar colonias por un sub-score específico desc.

    Itera sobre el seed COLONIAS + zone_scores (preferencia DB). Devuelve top N.
    """
    if subscore not in SUBSCORE_KEYS:
        return []

    candidates: Dict[str, Dict[str, Any]] = {}

    # 1) DB zone_scores
    try:
        cursor = db.zone_scores.aggregate([
            {"$sort": {"computed_at_dt": -1}},
            {"$group": {"_id": "$zone_id", "doc": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$doc"}},
        ])
        async for d in cursor:
            zid = d.get("zone_id")
            if not zid:
                continue
            extracted = _extract_subscores_from_doc(d)
            val = extracted.get(subscore)
            if val is not None:
                candidates[zid] = {
                    "slug": zid,
                    "name": d.get("zone_name") or zid,
                    "score": float(val),
                    "alcaldia": None,
                }
    except Exception as e:
        log.warning(f"[w5.2] list_top_zones_by_subscore zone_scores error: {e}")

    # 2) Seed fallback (or augment)
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            slug = c.get("id")
            if not slug:
                continue
            seed_extracted = _extract_subscores_from_doc(c)
            val = seed_extracted.get(subscore)
            if val is None:
                continue
            existing = candidates.get(slug)
            if not existing:
                candidates[slug] = {
                    "slug": slug,
                    "name": c.get("name"),
                    "score": float(val),
                    "alcaldia": c.get("alcaldia"),
                }
            else:
                existing["alcaldia"] = existing.get("alcaldia") or c.get("alcaldia")
                existing["name"] = existing.get("name") or c.get("name")
    except Exception as e:
        log.warning(f"[w5.2] seed COLONIAS load failed: {e}")

    items = sorted(candidates.values(), key=lambda x: -x["score"])
    return items[:limit]


async def list_top_zones_by_avg(
    db, subscores: List[str], limit: int = 20,
) -> List[Dict[str, Any]]:
    """Promedio simple de N sub-scores y ordenar desc."""
    valid = [s for s in subscores if s in SUBSCORE_KEYS]
    if not valid:
        return []

    candidates: Dict[str, Dict[str, Any]] = {}
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            slug = c.get("id")
            if not slug:
                continue
            seed_extracted = _extract_subscores_from_doc(c)
            vals = [seed_extracted.get(s) for s in valid if seed_extracted.get(s) is not None]
            if not vals:
                continue
            avg = sum(vals) / len(vals)
            candidates[slug] = {
                "slug": slug,
                "name": c.get("name"),
                "score": round(avg, 2),
                "alcaldia": c.get("alcaldia"),
            }
    except Exception as e:
        log.warning(f"[w5.2] list_top_zones_by_avg seed failed: {e}")

    items = sorted(candidates.values(), key=lambda x: -x["score"])
    return items[:limit]


async def get_score_history(
    db, zone_id: str, days: int = 90,
) -> List[Dict[str, Any]]:
    """Return time series of zone scores for the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cursor = db.zone_scores.find(
        {"zone_id": zone_id, "computed_at_dt": {"$gte": cutoff}},
        {"_id": 0, "computed_at_dt": 0},
    ).sort("computed_at_dt", 1)
    return [doc async for doc in cursor]


# ─── Daily cron ───────────────────────────────────────────────────────────────

async def cron_zone_score_daily_refresh(db) -> Dict[str, Any]:
    """Refresh zone scores for all active zones (post-ETL 03:00 W2.7)."""
    cursor = db.cube_aggregations.find(
        {"period": "current"}, {"_id": 0, "tier_id": 1, "tier": 1},
    ).limit(500)
    zones = [{"zone_id": r["tier_id"], "tier": r.get("tier", "colonia")}
             async for r in cursor]

    refreshed = 0
    failed = 0
    for z in zones:
        try:
            await compute_zone_score(db, z["zone_id"], z["tier"])
            refreshed += 1
        except Exception as e:
            log.warning(f"[score cron] failed {z['zone_id']}: {e}")
            failed += 1

    return {"ok": True, "refreshed": refreshed, "failed": failed,
            "completed_at": _iso()}


def schedule_zone_score_cron(scheduler, db) -> None:
    """Register cron `zone_score_daily_refresh` 04:00 MX."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            wrap_apscheduler_job(cron_zone_score_daily_refresh, "zone_score_daily_refresh"),
            CronTrigger(hour=4, minute=0, timezone="America/Mexico_City"),
            args=[db], id="zone_score_daily_refresh",
            replace_existing=True, misfire_grace_time=3600,
        )
    except Exception as e:
        log.warning(f"[score] schedule cron failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.zone_scores.create_index(
            [("zone_id", 1), ("computed_at_dt", -1)],
            name="zone_score_zone_ts",
        )
        await db.zone_scores.create_index(
            "computed_at_dt",
            expireAfterSeconds=90 * 86400,
            name="zone_score_ttl_90d",
        )
        await db.zone_scores.create_index("score_letter", name="zone_score_letter")
    except Exception as e:
        log.warning(f"[score] ensure_indexes failed: {e}")

# W5.FF6 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff6_register_feature
_w5ff6_register_feature("zone_score", plan_tier="pro", monthly_price_mxn=199, category="intelligence", name="Zone Score")
