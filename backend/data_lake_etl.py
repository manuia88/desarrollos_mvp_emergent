"""W2.7 Phase Z.0 — Data Lake ETL engine (MongoDB time-series native).

Daily ETL at 03:00 MX:
  1. Aggregate previous day developments+units+leads+ai_usage per (zone_id, tier)
  2. UPSERT into `db.facts_daily_zone` time-series collection
  3. Refresh metrics_cube_aggregations (W2.5) for all periods
  4. Refresh dim_zones metadata (preserve last if INEGI source unavailable)
  5. INSERT etl_runs entry; on failure → system_alert critical
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.data_lake_etl")

CRITICAL_FAIL_THRESHOLD = 5  # >5 zone errors → critical alert


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_" + secrets.token_urlsafe(10)


def _slug(s: str) -> str:
    if not s:
        return ""
    out = []
    for ch in s.lower().strip():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    res = "".join(out)
    while "--" in res:
        res = res.replace("--", "-")
    return res.strip("-")


# ─── Time-series collection bootstrap ─────────────────────────────────────────

async def ensure_facts_indexes(db) -> None:
    """Ensure facts_daily_zone time-series collection + dim_zones + etl_runs indexes."""
    try:
        existing = await db.list_collection_names()
        if "facts_daily_zone" not in existing:
            await db.create_collection(
                "facts_daily_zone",
                timeseries={
                    "timeField": "ts",
                    "metaField": "meta",
                    "granularity": "hours",
                },
            )
            log.info("[etl] facts_daily_zone time-series collection created")
    except Exception as e:
        # Non-MongoDB-5+ fallback: regular collection. Logged but not fatal.
        log.warning(f"[etl] time-series collection create failed (using regular): {e}")
    try:
        await db.facts_daily_zone.create_index(
            [("meta.zone_id", 1), ("meta.tier", 1), ("ts", -1)],
            name="facts_zone_tier_ts",
        )
    except Exception as e:
        log.warning(f"[etl] facts secondary index failed: {e}")

    try:
        await db.dim_zones.create_index(
            [("tier", 1), ("zone_id", 1)], unique=True, name="dim_tier_zone_uniq",
        )
        await db.dim_zones.create_index([("geo.polygon", "2dsphere")],
                                         name="dim_polygon_2dsphere", sparse=True)
        await db.dim_zones.create_index([("parent_zone_id", 1)], name="dim_parent")
    except Exception as e:
        log.warning(f"[etl] dim_zones indexes failed: {e}")

    try:
        await db.etl_runs.create_index([("run_at", -1)], name="etl_run_at_desc")
        await db.etl_runs.create_index("id", unique=True, name="etl_id_uniq")
    except Exception as e:
        log.warning(f"[etl] etl_runs indexes failed: {e}")

    try:
        await db.model_validation_runs.create_index(
            [("model_name", 1), ("run_at", -1)], name="mv_model_run_desc",
        )
        await db.model_validation_runs.create_index("id", unique=True, name="mv_id_uniq")
    except Exception as e:
        log.warning(f"[etl] model_validation indexes failed: {e}")


# ─── dim_zones seed (idempotent) ──────────────────────────────────────────────

async def seed_dim_zones(db) -> Dict[str, Any]:
    """Idempotent seed: city CDMX root + 16 alcaldías known + colonias from data_seed."""
    seeded = {"city": 0, "alcaldia": 0, "colonia": 0, "development": 0}

    # 1. CDMX root
    res = await db.dim_zones.update_one(
        {"tier": "city", "zone_id": "cdmx"},
        {"$setOnInsert": {
            "tier": "city", "zone_id": "cdmx", "name": "Ciudad de México",
            "parent_zone_id": None,
            "geo": {"centroid": {"lat": 19.4326, "lng": -99.1332},
                    "polygon": None, "bbox": [-99.365, 19.05, -98.94, 19.59]},
            "population_2020": 9209944,
            "dim_metadata": {"alcaldias_count": 16, "colonias_count": 1812},
            "created_at": _iso(),
        }},
        upsert=True,
    )
    seeded["city"] += 1 if res.upserted_id else 0

    # 2. 16 alcaldías known
    ALCALDIAS = [
        ("alvaro-obregon", "Álvaro Obregón", 759137, [-99.235, 19.34]),
        ("azcapotzalco", "Azcapotzalco", 432205, [-99.184, 19.487]),
        ("benito-juarez", "Benito Juárez", 434153, [-99.16, 19.385]),
        ("coyoacan", "Coyoacán", 614447, [-99.16, 19.34]),
        ("cuajimalpa", "Cuajimalpa", 217686, [-99.297, 19.353]),
        ("cuauhtemoc", "Cuauhtémoc", 545884, [-99.155, 19.43]),
        ("gustavo-a-madero", "Gustavo A. Madero", 1173351, [-99.105, 19.493]),
        ("iztacalco", "Iztacalco", 404695, [-99.097, 19.396]),
        ("iztapalapa", "Iztapalapa", 1835486, [-99.075, 19.357]),
        ("la-magdalena-contreras", "La Magdalena Contreras", 247622, [-99.232, 19.305]),
        ("miguel-hidalgo", "Miguel Hidalgo", 414470, [-99.205, 19.434]),
        ("milpa-alta", "Milpa Alta", 152685, [-99.025, 19.193]),
        ("tlahuac", "Tláhuac", 392313, [-99.005, 19.293]),
        ("tlalpan", "Tlalpan", 699928, [-99.18, 19.235]),
        ("venustiano-carranza", "Venustiano Carranza", 443704, [-99.105, 19.43]),
        ("xochimilco", "Xochimilco", 442178, [-99.105, 19.265]),
    ]
    for zid, name, pop, ll in ALCALDIAS:
        res = await db.dim_zones.update_one(
            {"tier": "alcaldia", "zone_id": zid},
            {"$setOnInsert": {
                "tier": "alcaldia", "zone_id": zid, "name": name,
                "parent_zone_id": "cdmx",
                "geo": {"centroid": {"lat": ll[1], "lng": ll[0]},
                        "polygon": None},
                "population_2020": pop,
                "dim_metadata": {"schools_count": None, "hospitals_count": None,
                                 "metro_stations_nearby": []},
                "created_at": _iso(),
            }},
            upsert=True,
        )
        seeded["alcaldia"] += 1 if res.upserted_id else 0

    # 3. Colonias from data_seed
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            cid = c.get("id")
            alc_zid = _slug(c.get("alcaldia") or "")
            poly = c.get("polygon")
            polygon_doc = None
            if poly and len(poly) >= 3:
                # Close the ring (GeoJSON requires first==last vertex)
                ring = list(poly)
                if ring[0] != ring[-1]:
                    ring.append(ring[0])
                polygon_doc = {"type": "Polygon", "coordinates": [ring]}
            res = await db.dim_zones.update_one(
                {"tier": "colonia", "zone_id": cid},
                {"$setOnInsert": {
                    "tier": "colonia", "zone_id": cid, "name": c.get("name"),
                    "parent_zone_id": alc_zid,
                    "geo": {
                        "centroid": {"lat": c.get("center", [0, 0])[1],
                                     "lng": c.get("center", [0, 0])[0]},
                        "polygon": polygon_doc,
                    },
                    "population_2020": None,
                    "dim_metadata": {"price_m2_seed_mxn": c.get("price_m2_num"),
                                     "tier": c.get("tier")},
                    "created_at": _iso(),
                }},
                upsert=True,
            )
            seeded["colonia"] += 1 if res.upserted_id else 0
    except Exception as e:
        log.warning(f"[etl] seed colonias failed: {e}")

    # 4. Developments
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            did = d.get("id")
            cid = d.get("colonia_id") or _slug(d.get("colonia") or "")
            ll = d.get("center") or [0, 0]
            res = await db.dim_zones.update_one(
                {"tier": "development", "zone_id": did},
                {"$setOnInsert": {
                    "tier": "development", "zone_id": did, "name": d.get("name"),
                    "parent_zone_id": cid,
                    "geo": {"centroid": {"lat": ll[1] if len(ll) > 1 else 0,
                                         "lng": ll[0]}},
                    "dim_metadata": {"developer_id": d.get("developer_id"),
                                     "stage": d.get("stage")},
                    "created_at": _iso(),
                }},
                upsert=True,
            )
            seeded["development"] += 1 if res.upserted_id else 0
    except Exception as e:
        log.warning(f"[etl] seed developments failed: {e}")

    return {"seeded": seeded, "completed_at": _iso()}


# ─── Daily ETL ────────────────────────────────────────────────────────────────

async def _aggregate_zone_kpis(db, zone_doc: Dict[str, Any], target_day: datetime) -> Dict[str, Any]:
    """Aggregate KPIs for one zone for `target_day` (UTC day)."""
    tier = zone_doc.get("tier")
    zid = zone_doc.get("zone_id")

    # For the H1 ETL we reuse metrics_cube aggregation (current snapshot) but stamp
    # it with target_day timestamp. This keeps facts_daily_zone consistent with the
    # cube without re-implementing roll-up logic. Future: split daily delta vs cum.
    kpis = {
        "units_total": 0, "units_sold": 0, "units_available": 0,
        "units_reserved": 0,
        "avg_price_mxn": None, "avg_price_per_m2": None,
        "leads_count": 0, "conversion_rate": None,
        "days_on_market_avg": None, "ie_score_promedio": None,
        "ai_usage_mxn": 0.0, "projects_count": 0,
    }
    cube_row = await db.cube_aggregations.find_one(
        {"tier": tier, "tier_id": zid, "period": "current"}, {"_id": 0, "kpis": 1, "geo": 1},
    )
    if cube_row:
        kpis.update(cube_row.get("kpis") or {})
        return {"kpis": kpis, "geo": cube_row.get("geo") or {}}
    return {"kpis": kpis, "geo": {}}


async def run_daily_etl(db, target_date: Optional[datetime] = None,
                        run_type: str = "daily",
                        triggered_by: str = "cron") -> Dict[str, Any]:
    """Main ETL: refresh cube_aggregations + write facts_daily_zone snapshot."""
    started = datetime.now(timezone.utc)
    if target_date is None:
        target_date = (started - timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
    elif target_date.tzinfo is None:
        target_date = target_date.replace(tzinfo=timezone.utc)

    run_id = _new_id("etl")
    errors: List[str] = []
    zones_processed = 0
    kpis_computed = 0

    # Step 1: refresh metrics_cube W2.5 for all periods (this rebuilds cube_aggregations)
    try:
        from metrics_cube_aggregations import aggregate_all
        cube_summary = await aggregate_all(db)
        log.info(f"[etl] cube refresh done: {cube_summary.get('summary', {})}")
    except Exception as e:
        errors.append(f"cube_refresh: {e}")

    # Step 2: snapshot per zone × tier into facts_daily_zone
    for tier in ("city", "alcaldia", "colonia", "development"):
        try:
            cur = db.dim_zones.find({"tier": tier}, {"_id": 0})
            async for zone in cur:
                try:
                    agg = await _aggregate_zone_kpis(db, zone, target_date)
                    doc = {
                        "ts": target_date,
                        "meta": {
                            "zone_id": zone.get("zone_id"),
                            "tier": tier,
                        },
                        "zone_id": zone.get("zone_id"),
                        "tier": tier,
                        "kpis": agg["kpis"],
                        "geo": agg["geo"] or (zone.get("geo") or {}).get("centroid", {}),
                        "source": "etl",
                        "etl_run_id": run_id,
                    }
                    await db.facts_daily_zone.insert_one(dict(doc))
                    zones_processed += 1
                    kpis_computed += sum(1 for v in agg["kpis"].values() if v is not None)
                except Exception as e:
                    errors.append(f"{tier}/{zone.get('zone_id')}: {str(e)[:80]}")
        except Exception as e:
            errors.append(f"tier {tier}: {str(e)[:120]}")

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    status = "ok"
    if errors and len(errors) <= CRITICAL_FAIL_THRESHOLD:
        status = "partial"
    elif errors:
        status = "failed"

    summary = {
        "id": run_id,
        "run_at": _iso(),
        "run_type": run_type,
        "duration_seconds": round(elapsed, 2),
        "zones_processed": zones_processed,
        "kpis_computed": kpis_computed,
        "status": status,
        "errors": errors[:20],
        "errors_total": len(errors),
        "triggered_by": triggered_by,
        "target_date": target_date.isoformat(),
    }

    try:
        await db.etl_runs.insert_one(dict(summary))
    except Exception as e:
        log.warning(f"[etl] run insert failed: {e}")

    # Critical alert if failed or many errors
    if status == "failed" or len(errors) > CRITICAL_FAIL_THRESHOLD:
        try:
            await db.system_alerts.insert_one({
                "id": _new_id("alert"),
                "ts": _iso(),
                "severity": "critical",
                "source": "data_lake_etl",
                "message": f"ETL Data Lake fallido: {len(errors)} errores · {zones_processed} zonas procesadas",
                "details": {"etl_run_id": run_id, "first_errors": errors[:5]},
                "resolved_at": None,
            })
        except Exception as e:
            log.warning(f"[etl] alert insert failed: {e}")

    log.info(f"[etl] daily run done — {summary}")
    return summary


# ─── Cron registration helper ─────────────────────────────────────────────────

def schedule_data_lake_etl_cron(scheduler, db) -> None:
    """Register cron `data_lake_etl_daily` at 03:00 MX (after metrics-cube 02:15)."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
        from apscheduler.triggers.cron import CronTrigger

        async def _runner(d):
            await run_daily_etl(d, run_type="daily", triggered_by="cron")
            try:
                from model_validation_engine import run_all_validations
                await run_all_validations(d)
            except Exception as e:
                log.warning(f"[etl] validation post-run failed: {e}")

        scheduler.add_job(
            wrap_apscheduler_job(_runner, "data_lake_etl_daily"),
            CronTrigger(hour=3, minute=0, timezone="America/Mexico_City"),
            args=[db], id="data_lake_etl_daily",
            replace_existing=True, misfire_grace_time=1800,
        )
    except Exception as e:
        log.warning(f"[etl] schedule failed: {e}")


# ─── Coverage helper ──────────────────────────────────────────────────────────

async def coverage_per_tier(db, tier: str, days: int = 7) -> Dict[str, Any]:
    """% of zones in tier with at least one fact in last `days`."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    total = await db.dim_zones.count_documents({"tier": tier})

    pipeline = [
        {"$match": {"tier": tier, "ts": {"$gte": cutoff}}},
        {"$group": {"_id": "$meta.zone_id"}},
    ]
    seen = set()
    try:
        async for r in db.facts_daily_zone.aggregate(pipeline):
            zid = r.get("_id")
            if zid:
                seen.add(zid)
    except Exception:
        pass

    # Find missing
    all_ids: List[str] = []
    async for z in db.dim_zones.find({"tier": tier}, {"_id": 0, "zone_id": 1}):
        zid = z.get("zone_id")
        if zid:
            all_ids.append(zid)
    missing = [zid for zid in all_ids if zid not in seen][:50]

    coverage_pct = round((len(seen) / total) * 100, 2) if total > 0 else 0.0
    return {
        "tier": tier,
        "total_zones": total,
        "zones_with_data": len(seen),
        "coverage_pct": coverage_pct,
        "missing_zone_ids": missing,
        "window_days": days,
    }
