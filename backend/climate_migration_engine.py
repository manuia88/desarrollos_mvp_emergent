"""W5.9 — Climate Migration Engine.

Detecta patrones de migración intra-CDMX impulsados por señales climáticas
agregando 3 dimensiones:
  1. Climate signals (drought / flood / air quality) — natural_risk_layers + ie_col_clima + cenapred.
  2. Behavioral trends (visits / leads / search_intent) — behavioral_events + lead_captures + reverse_search_cache.
  3. Demographic signals (outflow/inflow INEGI) — best-effort local snapshot.

Pipeline:
  - Cron weekly (lunes 03:00 UTC) → detect_migration_patterns: pares (origin, destination)
    para top 50 colonias CDMX; magnitud > 40 + confidence>=media → narrative + alert T3.
  - Cron daily (04:00 UTC) → compute_heatmap_snapshot: cache 24h por zona.

Schemas (FAIL-SOFT, defensive):
  - climate_migration_heatmap  (TTL 24h por doc · ttl_until expireAfterSeconds=0)
  - climate_migration_patterns (TTL 365d · pattern_id unique)
  - climate_migration_runs     (TTL 30d · resumen runs)

Tier T0 público para heatmap · T3 inversionista para alertas.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.climate_migration_engine")

# ─── Constants ────────────────────────────────────────────────────────────────

COLLECTION_HEATMAP = "climate_migration_heatmap"
COLLECTION_PATTERNS = "climate_migration_patterns"
COLLECTION_RUNS = "climate_migration_runs"

PATTERNS_TTL_DAYS = 365
HEATMAP_TTL_HOURS = 24
RUNS_TTL_DAYS = 30

MAGNITUDE_THRESHOLD = 40
DATA_COMPLETENESS_MIN = 30  # %
PAIR_LOOKBACK_DAYS = 7  # idempotency: skip pair analizado últimos N días
TOP_ZONES_LIMIT = 50

VALID_CONFIDENCES = {"alta", "media", "baja"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(prefix: str = "cmp") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    try:
        return max(lo, min(hi, float(v)))
    except Exception:
        return lo


# ─── Aggregators (FAIL-SOFT) ──────────────────────────────────────────────────

async def aggregate_climate_signals_per_zone(
    db, zone_slug: str, days: int = 90,
) -> Dict[str, Any]:
    """Agrega señales climáticas de 3 fuentes con FAIL-SOFT por fuente.

    Retorna:
      {
        temperature_anomaly: float | None,
        drought_severity: float (0-100),
        flood_risk: float (0-100),
        air_quality_index: float (0-100, mayor = peor),
        top_drivers: [str max 3],
        data_completeness_pct: int 0-100,
      }
    """
    out: Dict[str, Any] = {
        "temperature_anomaly": None,
        "drought_severity": 0.0,
        "flood_risk": 0.0,
        "air_quality_index": 0.0,
        "top_drivers": [],
        "data_completeness_pct": 0,
    }

    if db is None or not zone_slug:
        return out

    sources_hit = 0
    sources_total = 3
    drivers: List[tuple] = []  # (driver_name, severity)

    # 1) natural_risk_layers — flood_pct + subsidence (fail-soft)
    try:
        doc = await db.natural_risk_layers.find_one(
            {"zone_id": zone_slug}, {"_id": 0}
        )
        if doc:
            flood_pct = float(doc.get("flood_pct") or 0)
            out["flood_risk"] = _clamp(flood_pct)
            if flood_pct >= 30:
                drivers.append(("flood", flood_pct))
            sismic_score = float(doc.get("sismic_score") or 0)
            if sismic_score >= 50:
                drivers.append(("seismic", sismic_score))
            sources_hit += 1
    except Exception as e:
        log.debug(f"[climate_migration] natural_risk fail zone={zone_slug}: {e}")

    # 2) ie_col_clima latest snapshot (clima/AQI) — fail-soft
    try:
        snap = await db.ie_col_clima.find_one(
            {"zone_slug": zone_slug},
            {"_id": 0},
            sort=[("fetched_at", -1)],
        )
        if snap:
            aqi = float(snap.get("air_quality_index") or snap.get("aqi") or 0)
            out["air_quality_index"] = _clamp(aqi)
            temp_anom = snap.get("temperature_anomaly")
            if temp_anom is not None:
                try:
                    out["temperature_anomaly"] = float(temp_anom)
                except Exception:
                    pass
            drought = float(snap.get("drought_severity") or snap.get("drought_index") or 0)
            out["drought_severity"] = _clamp(drought)
            if aqi >= 60:
                drivers.append(("air_quality", aqi))
            if drought >= 50:
                drivers.append(("drought", drought))
            sources_hit += 1
    except Exception as e:
        log.debug(f"[climate_migration] ie_col_clima fail zone={zone_slug}: {e}")

    # 3) cenapred_events — eventos recientes (fail-soft)
    try:
        cutoff = _now() - timedelta(days=days)
        cnt = await db.cenapred_events.count_documents({
            "zone_id": zone_slug,
            "event_date": {"$gte": cutoff},
        })
        if cnt > 0:
            # severity bump 5 per evento, cap 100
            sev = _clamp(cnt * 5)
            if sev >= 25:
                drivers.append(("cenapred_events", sev))
        sources_hit += 1
    except Exception as e:
        log.debug(f"[climate_migration] cenapred_events fail zone={zone_slug}: {e}")

    # Top 3 drivers by severity desc
    drivers.sort(key=lambda x: x[1], reverse=True)
    out["top_drivers"] = [d[0] for d in drivers[:3]]
    out["data_completeness_pct"] = int(round((sources_hit / sources_total) * 100))

    return out


async def aggregate_behavioral_trends_per_zone(
    db, zone_slug: str, days: int = 90,
) -> Dict[str, Any]:
    """Trends behavioral por zona: visits + leads + search_intent.

    visits_trend_pct = ((last_30d - baseline_30_to_60d) / baseline) * 100, cap [-100, +200].
    """
    out: Dict[str, Any] = {
        "visits_trend_pct": 0.0,
        "leads_trend_pct": 0.0,
        "visits_count_last_30d": 0,
        "leads_count_last_30d": 0,
        "search_intent_pct": 0.0,
    }
    if db is None or not zone_slug:
        return out

    now = _now()
    cutoff_30 = now - timedelta(days=30)
    cutoff_60 = now - timedelta(days=60)

    def _trend(recent: int, base: int) -> float:
        if base <= 0:
            return 0.0 if recent == 0 else 100.0
        try:
            return max(-100.0, min(200.0, ((recent - base) / base) * 100.0))
        except Exception:
            return 0.0

    # 1) Visits (behavioral_events) — fail-soft
    try:
        recent_visits = await db.behavioral_events.count_documents({
            "zone_slug": zone_slug,
            "timestamp": {"$gte": cutoff_30},
        })
        base_visits = await db.behavioral_events.count_documents({
            "zone_slug": zone_slug,
            "timestamp": {"$gte": cutoff_60, "$lt": cutoff_30},
        })
        out["visits_count_last_30d"] = int(recent_visits)
        out["visits_trend_pct"] = round(_trend(recent_visits, base_visits), 1)
    except Exception as e:
        log.debug(f"[climate_migration] behavioral_events fail zone={zone_slug}: {e}")

    # 2) Leads (lead_captures) — fail-soft. Join via property zone is non-trivial,
    # best-effort lookup por target_zone embed.
    try:
        recent_leads = await db.lead_captures.count_documents({
            "zone_slug": zone_slug,
            "created_at": {"$gte": cutoff_30},
        })
        base_leads = await db.lead_captures.count_documents({
            "zone_slug": zone_slug,
            "created_at": {"$gte": cutoff_60, "$lt": cutoff_30},
        })
        out["leads_count_last_30d"] = int(recent_leads)
        out["leads_trend_pct"] = round(_trend(recent_leads, base_leads), 1)
    except Exception as e:
        log.debug(f"[climate_migration] lead_captures fail zone={zone_slug}: {e}")

    # 3) search_intent (reverse_search_cache) — fail-soft. Cuenta búsquedas con
    # esta colonia en parse últimos 30d vs baseline.
    try:
        recent_rs = await db.reverse_search_cache.count_documents({
            "parsed.colonias": zone_slug,
            "created_at": {"$gte": cutoff_30},
        })
        base_rs = await db.reverse_search_cache.count_documents({
            "parsed.colonias": zone_slug,
            "created_at": {"$gte": cutoff_60, "$lt": cutoff_30},
        })
        out["search_intent_pct"] = round(_trend(recent_rs, base_rs), 1)
    except Exception as e:
        log.debug(f"[climate_migration] reverse_search_cache fail zone={zone_slug}: {e}")

    return out


async def aggregate_demographic_signals(
    db, zone_slug: str, period: str = "last_12m",
) -> Dict[str, Any]:
    """INEGI outflow/inflow per zone. Local snapshot best-effort.

    Si no existe `inegi_migration_snapshots` o no hay row para zona →
    {data_unavailable: True}.
    """
    if db is None or not zone_slug:
        return {"data_unavailable": True}

    try:
        snap = await db.inegi_migration_snapshots.find_one(
            {"zone_slug": zone_slug, "period": period},
            {"_id": 0},
            sort=[("fetched_at", -1)],
        )
        if not snap:
            return {"data_unavailable": True}
        return {
            "inegi_outflow_pct": float(snap.get("outflow_pct") or 0),
            "inegi_inflow_pct": float(snap.get("inflow_pct") or 0),
            "period": period,
            "source": "INEGI",
        }
    except Exception as e:
        log.debug(f"[climate_migration] inegi fail zone={zone_slug}: {e}")
        return {"data_unavailable": True}


# ─── Scoring (pure) ───────────────────────────────────────────────────────────

def compute_outflow_score(
    climate: Dict[str, Any],
    behavioral: Dict[str, Any],
    demographic: Dict[str, Any],
) -> int:
    """Weighted score 0-100:
      - climate (drought + flood + air) 40%
      - behavioral negative trend 30%
      - demographic outflow 20%
      - search_intent decrease 10%
    Si data_completeness_pct < 30 → 0 (insufficient_data).
    """
    try:
        completeness = int(climate.get("data_completeness_pct", 0))
        if completeness < DATA_COMPLETENESS_MIN:
            return 0

        # Climate component
        drought = float(climate.get("drought_severity") or 0)
        flood = float(climate.get("flood_risk") or 0)
        air = float(climate.get("air_quality_index") or 0)
        climate_avg = (drought + flood + air) / 3.0

        # Behavioral negative-trend component (invertimos signo)
        visits_trend = float(behavioral.get("visits_trend_pct") or 0)
        leads_trend = float(behavioral.get("leads_trend_pct") or 0)
        # Map negative trends (people leaving) to 0-100 outflow signal
        # trend -100 → 100 outflow · trend 0 → 0 · trend +200 → 0
        beh_negative = max(0.0, min(100.0, -((visits_trend + leads_trend) / 2.0)))

        # Demographic outflow component
        if demographic.get("data_unavailable"):
            demo_outflow = 0.0
        else:
            demo_outflow = float(demographic.get("inegi_outflow_pct") or 0)
            demo_outflow = _clamp(demo_outflow)

        # Search intent decrease component
        search_pct = float(behavioral.get("search_intent_pct") or 0)
        search_dec = max(0.0, min(100.0, -search_pct))

        score = (
            climate_avg * 0.40
            + beh_negative * 0.30
            + demo_outflow * 0.20
            + search_dec * 0.10
        )
        return int(round(_clamp(score)))
    except Exception as e:
        log.debug(f"[climate_migration] compute_outflow fail: {e}")
        return 0


def compute_inflow_score(
    climate: Dict[str, Any],
    behavioral: Dict[str, Any],
    demographic: Dict[str, Any],
) -> int:
    """Mismo patrón invertido:
      - climate refugio (100 - severities) 40%
      - behavioral positive trend 30%
      - demographic inflow 20%
      - search_intent increase 10%
    """
    try:
        completeness = int(climate.get("data_completeness_pct", 0))
        if completeness < DATA_COMPLETENESS_MIN:
            return 0

        drought = float(climate.get("drought_severity") or 0)
        flood = float(climate.get("flood_risk") or 0)
        air = float(climate.get("air_quality_index") or 0)
        # Refugio = 100 - mean(severities)
        climate_refugio = max(0.0, 100.0 - ((drought + flood + air) / 3.0))

        visits_trend = float(behavioral.get("visits_trend_pct") or 0)
        leads_trend = float(behavioral.get("leads_trend_pct") or 0)
        beh_positive = max(0.0, min(100.0, (visits_trend + leads_trend) / 2.0))

        if demographic.get("data_unavailable"):
            demo_inflow = 0.0
        else:
            demo_inflow = float(demographic.get("inegi_inflow_pct") or 0)
            demo_inflow = _clamp(demo_inflow)

        search_pct = float(behavioral.get("search_intent_pct") or 0)
        search_inc = max(0.0, min(100.0, search_pct))

        score = (
            climate_refugio * 0.40
            + beh_positive * 0.30
            + demo_inflow * 0.20
            + search_inc * 0.10
        )
        return int(round(_clamp(score)))
    except Exception as e:
        log.debug(f"[climate_migration] compute_inflow fail: {e}")
        return 0


def detect_pattern_pair(
    origin_signals: Dict[str, Any],
    destination_signals: Dict[str, Any],
    magnitude_threshold: int = MAGNITUDE_THRESHOLD,
) -> Optional[Dict[str, Any]]:
    """Si origin.outflow_score>50 Y destination.inflow_score>50 → potential pattern.

    magnitude = (out + in) / 2.
    confidence:
      - alta  : magnitude > 70 Y both data_completeness > 70
      - media : magnitude > 50
      - baja  : resto
    Si magnitude > threshold → dict, sino None.
    """
    try:
        out_score = int(origin_signals.get("outflow_score") or 0)
        in_score = int(destination_signals.get("inflow_score") or 0)

        if out_score <= 50 or in_score <= 50:
            return None

        magnitude = (out_score + in_score) / 2.0

        if magnitude <= magnitude_threshold:
            return None

        origin_completeness = int(
            (origin_signals.get("climate") or {}).get("data_completeness_pct", 0)
        )
        dest_completeness = int(
            (destination_signals.get("climate") or {}).get("data_completeness_pct", 0)
        )

        if magnitude > 70 and origin_completeness > 70 and dest_completeness > 70:
            confidence = "alta"
        elif magnitude > 50:
            confidence = "media"
        else:
            confidence = "baja"

        origin_drivers = (origin_signals.get("climate") or {}).get("top_drivers") or []
        climate_driver = origin_drivers[0] if origin_drivers else "unknown"

        return {
            "magnitude": int(round(magnitude)),
            "confidence": confidence,
            "climate_driver": climate_driver,
            "origin_outflow_score": out_score,
            "destination_inflow_score": in_score,
        }
    except Exception as e:
        log.debug(f"[climate_migration] detect_pattern_pair fail: {e}")
        return None


# ─── Narrative + Alerts ───────────────────────────────────────────────────────

async def generate_pattern_narrative(db, pattern: Dict[str, Any]) -> str:
    """Narrative LLM via narrative_layer_engine.generate (audience=investor).

    Fallback templated si LLM falla o engine no disponible.
    """
    origin_zone = pattern.get("origin_zone", "?")
    destination_zone = pattern.get("destination_zone", "?")
    magnitude = pattern.get("magnitude", 0)
    climate_driver = pattern.get("climate_driver", "factor climático")
    pattern_id = pattern.get("pattern_id") or _uid()

    fallback = (
        f"Se detectó un patrón de migración climática desde {origin_zone} "
        f"hacia {destination_zone} con magnitud {magnitude}/100, "
        f"impulsado por {climate_driver}."
    )

    try:
        from narrative_layer_engine import generate as narrative_generate

        result = await narrative_generate(
            db,
            scope="climate_migration_pattern",
            entity_id=f"cmp_{pattern_id}",
            audience="investor",
            custom_facts={
                "origin_zone": origin_zone,
                "destination_zone": destination_zone,
                "magnitude": magnitude,
                "climate_driver": climate_driver,
                "behavioral_evidence": pattern.get("behavioral_evidence") or {},
                "demographic_signal": pattern.get("demographic_signal") or {},
                "confidence": pattern.get("confidence", "media"),
            },
            custom_tax_block={},
        )
        text = (
            result.get("narrative_long")
            or result.get("narrative_medium")
            or result.get("narrative_short")
            or ""
        ).strip()
        if text:
            return text
        return fallback
    except Exception as e:
        log.warning(f"[climate_migration] narrative LLM fail: {e}")
        return fallback


async def _pattern_recently_emitted(
    db, origin: str, destination: str, days: int = 30,
) -> bool:
    """True si ya hay pattern emitido para este par en los últimos N días."""
    if db is None:
        return False
    try:
        cutoff = _now() - timedelta(days=days)
        doc = await db[COLLECTION_PATTERNS].find_one(
            {
                "origin_zone": origin,
                "destination_zone": destination,
                "detected_at": {"$gte": cutoff},
            },
            {"_id": 0, "pattern_id": 1},
        )
        return doc is not None
    except Exception as e:
        log.debug(f"[climate_migration] pattern_recent check fail: {e}")
        return False


async def emit_t3_alert(db, pattern: Dict[str, Any]) -> None:
    """Si confidence='alta' Y pattern NUEVO (no par mismo últimos 30d) → emit alert T3.

    Custom signal_type='climate_migration_detected' (no está en VALID_SIGNALS
    de predictive_alerts_engine) → fallback: insert directo a predictive_alerts.
    audit_log + FAIL-SOFT.
    """
    if db is None:
        return

    if pattern.get("confidence") != "alta":
        return

    origin = pattern.get("origin_zone", "")
    destination = pattern.get("destination_zone", "")

    # Already emitted last 30d?
    if await _pattern_recently_emitted(db, origin, destination, 30):
        return

    alert_id = f"alert_{uuid.uuid4().hex[:16]}"
    magnitude = int(pattern.get("magnitude", 0))
    tier = "alta"  # confidence==alta → urgency_tier alta

    doc = {
        "alert_id": alert_id,
        "lead_id": None,
        "session_id": None,
        "advisor_id": None,  # target broadcast: T3 advisors filter en consumo
        "signal_type": "climate_migration_detected",
        "urgency_score": magnitude,
        "urgency_tier": tier,
        "property_id": None,
        "property_title": None,
        "message": (
            f"Migración climática detectada: {origin} → {destination} "
            f"(magnitud {magnitude}, driver: {pattern.get('climate_driver','?')})"
        ),
        "context": {
            "pattern_id": pattern.get("pattern_id"),
            "origin_zone": origin,
            "destination_zone": destination,
            "magnitude": magnitude,
            "climate_driver": pattern.get("climate_driver"),
            "confidence": pattern.get("confidence"),
            "target_tier": "investor_t3",
        },
        "status": "active",
        "created_at": _now(),
    }

    # Direct insert (custom signal_type out of VALID_SIGNALS predictive_alerts_engine).
    try:
        from predictive_alerts_engine import COLLECTION_ALERTS as PA_COLL
        await db[PA_COLL].insert_one(doc)
    except Exception as e:
        log.warning(f"[climate_migration] predictive_alerts insert fail: {e}")
        try:
            await db.predictive_alerts.insert_one(doc)
        except Exception as e2:
            log.warning(f"[climate_migration] fallback alert insert fail: {e2}")
            return

    # Audit log (best-effort)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="climate_migration_alert_emit",
            entity_type="climate_migration_pattern",
            entity_id=pattern.get("pattern_id") or "?",
            before=None,
            after={
                "alert_id": alert_id,
                "origin": origin,
                "destination": destination,
                "magnitude": magnitude,
            },
        )
    except Exception as e:
        log.debug(f"[climate_migration] audit_log fail: {e}")


# ─── Top zones helper ─────────────────────────────────────────────────────────

async def _top_zones_cdmx(db, limit: int = TOP_ZONES_LIMIT) -> List[Dict[str, Any]]:
    """Top N colonias CDMX por score_ie desc (fallback: cualquier orden).

    Schema asumido `dim_zones`: {zone_id, tier, name, centroid: {lat,lng}, score_ie}.
    """
    if db is None:
        return []
    out: List[Dict[str, Any]] = []
    try:
        cursor = db.dim_zones.find(
            {"tier": "colonia"},
            {"_id": 0, "zone_id": 1, "name": 1, "centroid": 1, "score_ie": 1},
        ).sort("score_ie", -1).limit(limit)
        async for z in cursor:
            out.append(z)
    except Exception as e:
        log.warning(f"[climate_migration] top_zones fail: {e}")
    return out


# ─── Main detect (cron weekly) ────────────────────────────────────────────────

async def detect_migration_patterns(db, lookback_days: int = 90) -> List[Dict[str, Any]]:
    """Top 50 zonas CDMX · pares (origin, destination).

    Idempotency: skip pares analizados últimos PAIR_LOOKBACK_DAYS.
    Por cada pair: aggregate signals + detect_pattern_pair.
    Si pattern → generate_narrative + emit_t3_alert + insert.

    Retorna lista patterns nuevos creados.
    """
    started_at = _now()
    new_patterns: List[Dict[str, Any]] = []

    if db is None:
        return new_patterns

    zones = await _top_zones_cdmx(db, TOP_ZONES_LIMIT)
    if len(zones) < 2:
        log.info("[climate_migration] insufficient zones for pair detection")
        return new_patterns

    # Pre-compute signals por zona (1 vez por zona)
    signals_cache: Dict[str, Dict[str, Any]] = {}
    for z in zones:
        zid = z.get("zone_id")
        if not zid:
            continue
        try:
            climate = await aggregate_climate_signals_per_zone(db, zid, days=lookback_days)
            behavioral = await aggregate_behavioral_trends_per_zone(db, zid, days=lookback_days)
            demographic = await aggregate_demographic_signals(db, zid)
            outflow = compute_outflow_score(climate, behavioral, demographic)
            inflow = compute_inflow_score(climate, behavioral, demographic)
            signals_cache[zid] = {
                "zone_name": z.get("name") or zid,
                "centroid": z.get("centroid") or {},
                "climate": climate,
                "behavioral": behavioral,
                "demographic": demographic,
                "outflow_score": outflow,
                "inflow_score": inflow,
            }
        except Exception as e:
            log.warning(f"[climate_migration] zone signal fail zone={zid}: {e}")

    # Pares: solo origin con outflow>50 y destination con inflow>50, evita pares iguales
    candidate_origins = [
        zid for zid, s in signals_cache.items() if s["outflow_score"] > 50
    ]
    candidate_destinations = [
        zid for zid, s in signals_cache.items() if s["inflow_score"] > 50
    ]

    for origin in candidate_origins:
        for destination in candidate_destinations:
            if origin == destination:
                continue

            # Idempotency: skip si analizado últimos PAIR_LOOKBACK_DAYS
            try:
                cutoff = _now() - timedelta(days=PAIR_LOOKBACK_DAYS)
                recent = await db[COLLECTION_PATTERNS].find_one(
                    {
                        "origin_zone": origin,
                        "destination_zone": destination,
                        "detected_at": {"$gte": cutoff},
                    },
                    {"_id": 0, "pattern_id": 1},
                )
                if recent:
                    continue
            except Exception as e:
                log.debug(f"[climate_migration] idempotency check fail: {e}")

            pair = detect_pattern_pair(
                signals_cache[origin],
                signals_cache[destination],
                magnitude_threshold=MAGNITUDE_THRESHOLD,
            )
            if not pair:
                continue

            if pair["confidence"] not in {"alta", "media"}:
                continue

            pattern_id = _uid()
            pattern_doc = {
                "pattern_id": pattern_id,
                "origin_zone": origin,
                "destination_zone": destination,
                "origin_zone_name": signals_cache[origin]["zone_name"],
                "destination_zone_name": signals_cache[destination]["zone_name"],
                "magnitude": pair["magnitude"],
                "climate_driver": pair["climate_driver"],
                "behavioral_evidence": {
                    "origin": signals_cache[origin]["behavioral"],
                    "destination": signals_cache[destination]["behavioral"],
                },
                "demographic_signal": {
                    "origin": signals_cache[origin]["demographic"],
                    "destination": signals_cache[destination]["demographic"],
                },
                "confidence": pair["confidence"],
                "detected_at": _now(),
                "ttl_until": _now() + timedelta(days=PATTERNS_TTL_DAYS),
            }

            # Narrative (LLM + fallback)
            try:
                narrative_text = await generate_pattern_narrative(db, pattern_doc)
                pattern_doc["narrative_long"] = narrative_text
                pattern_doc["narrative_short"] = narrative_text[:280]
            except Exception as e:
                log.warning(f"[climate_migration] narrative fail pattern={pattern_id}: {e}")
                pattern_doc["narrative_long"] = ""
                pattern_doc["narrative_short"] = ""

            # Insert
            try:
                await db[COLLECTION_PATTERNS].insert_one(dict(pattern_doc))
                new_patterns.append({
                    "pattern_id": pattern_id,
                    "origin_zone": origin,
                    "destination_zone": destination,
                    "magnitude": pair["magnitude"],
                    "confidence": pair["confidence"],
                })
            except Exception as e:
                log.warning(f"[climate_migration] pattern insert fail: {e}")
                continue

            # Emit T3 alert (only if confidence alta)
            try:
                await emit_t3_alert(db, pattern_doc)
            except Exception as e:
                log.warning(f"[climate_migration] alert emit fail: {e}")

    # Audit summary
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="climate_migration_detect_run",
            entity_type="climate_migration_runs",
            entity_id=f"run_{started_at.isoformat()}",
            before=None,
            after={
                "zones_processed": len(signals_cache),
                "patterns_new": len(new_patterns),
                "duration_s": int((_now() - started_at).total_seconds()),
            },
        )
    except Exception as e:
        log.debug(f"[climate_migration] audit run fail: {e}")

    return new_patterns


# ─── Heatmap snapshot (cron daily) ────────────────────────────────────────────

async def compute_heatmap_snapshot(db) -> Dict[str, Any]:
    """Por top 50 zonas: outflow + inflow + net. Upsert heatmap con TTL 24h."""
    started_at = _now()
    if db is None:
        return {"zones_processed": 0, "generated_at": started_at.isoformat()}

    zones = await _top_zones_cdmx(db, TOP_ZONES_LIMIT)
    processed = 0

    for z in zones:
        zid = z.get("zone_id")
        if not zid:
            continue
        try:
            climate = await aggregate_climate_signals_per_zone(db, zid, days=90)
            behavioral = await aggregate_behavioral_trends_per_zone(db, zid, days=90)
            demographic = await aggregate_demographic_signals(db, zid)
            outflow = compute_outflow_score(climate, behavioral, demographic)
            inflow = compute_inflow_score(climate, behavioral, demographic)
            net = int(round(inflow - outflow))
            ttl_until = _now() + timedelta(hours=HEATMAP_TTL_HOURS)
            doc = {
                "zone_slug": zid,
                "zone_name": z.get("name") or zid,
                "outflow_score": int(outflow),
                "inflow_score": int(inflow),
                "net_score": net,
                "centroid": z.get("centroid") or {},
                "climate_drivers": climate.get("top_drivers") or [],
                "last_updated": _now(),
                "ttl_until": ttl_until,
            }
            await db[COLLECTION_HEATMAP].update_one(
                {"zone_slug": zid},
                {"$set": doc},
                upsert=True,
            )
            processed += 1
        except Exception as e:
            log.warning(f"[climate_migration] heatmap snapshot zone={zid} fail: {e}")
            continue

    # Audit summary (best-effort)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="climate_migration_heatmap_run",
            entity_type="climate_migration_heatmap",
            entity_id=f"run_{started_at.isoformat()}",
            before=None,
            after={
                "zones_processed": processed,
                "duration_s": int((_now() - started_at).total_seconds()),
            },
        )
    except Exception as e:
        log.debug(f"[climate_migration] audit heatmap fail: {e}")

    # AI budget tracking (heatmap no usa LLM normalmente, pero registramos call_type)
    try:
        from ai_budget import track_ai_call
        # No LLM tokens (0) — feature_key para analytics breakdown
        await track_ai_call(
            db, dev_org_id="system", model="none", tokens=0,
            call_type="climate_migration_heatmap",
            feature_key="climate_migration_heatmap",
        )
    except Exception:
        pass

    return {
        "zones_processed": processed,
        "generated_at": started_at.isoformat(),
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    """Crea indexes para climate_migration_* collections."""
    if db is None:
        return
    try:
        # heatmap
        await db[COLLECTION_HEATMAP].create_index("zone_slug", unique=True)
        await db[COLLECTION_HEATMAP].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
    except Exception as e:
        log.debug(f"[climate_migration] heatmap index fail: {e}")

    try:
        # patterns
        await db[COLLECTION_PATTERNS].create_index("pattern_id", unique=True)
        await db[COLLECTION_PATTERNS].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
        await db[COLLECTION_PATTERNS].create_index([("detected_at", -1)])
        await db[COLLECTION_PATTERNS].create_index([
            ("origin_zone", 1), ("destination_zone", 1),
        ])
    except Exception as e:
        log.debug(f"[climate_migration] patterns index fail: {e}")

    try:
        # runs
        await db[COLLECTION_RUNS].create_index(
            "ttl_until", expireAfterSeconds=0,
        )
        await db[COLLECTION_RUNS].create_index([("started_at", -1)])
    except Exception as e:
        log.debug(f"[climate_migration] runs index fail: {e}")
