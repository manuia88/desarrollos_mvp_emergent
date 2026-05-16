"""W5.3 Parte 2A Sub-A — Cron diario recompute sub-scores 02:30 UTC.

Itera todas las colonias del seed + zonas con DRPI snapshots, computa los 6
sub-scores oficiales y persiste en `zone_scores[slug].subscores_real`.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List

log = logging.getLogger("dmx.zone_subscores_cron")


def _new_id(prefix: str = "subscores_run") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def _list_zone_slugs(db) -> List[str]:
    seen: set = set()
    out: List[str] = []
    # Seed colonias
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            sid = c.get("id")
            if sid and sid not in seen:
                seen.add(sid)
                out.append(sid)
    except Exception as e:
        log.warning(f"[subscores cron] seed COLONIAS load failed: {e}")
    # zone_scores collection
    try:
        cursor = db.zone_scores.aggregate([{"$group": {"_id": "$zone_id"}}])
        async for d in cursor:
            zid = d.get("_id")
            if zid and zid not in seen and zid != "_national_":
                seen.add(zid)
                out.append(zid)
    except Exception as e:
        log.warning(f"[subscores cron] zone_scores load failed: {e}")
    return out


async def recompute_all_zones(db) -> Dict[str, Any]:
    from zone_subscores_compute import compute_all_subscores

    started_at = datetime.now(timezone.utc)
    zones = await _list_zone_slugs(db)
    log.info(f"[subscores] daily recompute start · zones={len(zones)}")

    ok = 0
    skipped = 0
    errors = 0
    for zone_slug in zones:
        try:
            subs = await compute_all_subscores(db, zone_slug)
            if not subs:
                skipped += 1
                continue
            await db.zone_scores.update_one(
                {"zone_id": zone_slug, "tier": "colonia"},
                {"$set": {
                    "zone_id": zone_slug,
                    "tier": "colonia",
                    "subscores_real": subs,
                    "subscores_real_updated_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            ok += 1
        except Exception as e:
            errors += 1
            log.warning(f"[subscores] error {zone_slug}: {e}")

    finished_at = datetime.now(timezone.utc)
    duration_seconds = (finished_at - started_at).total_seconds()
    summary = {
        "id": _new_id("subscores_run"),
        "ran_at": started_at.isoformat(),
        "ran_at_dt": started_at,
        "finished_at": finished_at.isoformat(),
        "zones_evaluated": len(zones),
        "zones_computed_ok": ok,
        "zones_skipped": skipped,
        "errors_count": errors,
        "duration_seconds": round(duration_seconds, 2),
    }
    try:
        await db.zone_subscores_compute_runs.insert_one(dict(summary))
    except Exception as e:
        log.warning(f"[subscores] insert run summary failed: {e}")

    log.info(
        f"[subscores] daily recompute done · zones={len(zones)} ok={ok} skipped={skipped} "
        f"errors={errors} duration_s={duration_seconds:.1f}"
    )
    out = dict(summary)
    out.pop("ran_at_dt", None)
    return out


def register_subscores_job(scheduler, db) -> None:
    try:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            recompute_all_zones,
            CronTrigger(hour=2, minute=30),
            id="zone_subscores_recompute_daily",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            coalesce=True,
        )
        log.info("[subscores] cron registered · daily @ 02:30 UTC")
    except Exception as e:
        log.warning(f"[subscores] register failed: {e}")


async def ensure_indexes(db) -> None:
    try:
        await db.zone_subscores_compute_runs.create_index(
            "ran_at_dt", expireAfterSeconds=90 * 86400, name="subscores_runs_ttl_90d",
        )
    except Exception as e:
        log.warning(f"[subscores] ensure_indexes failed: {e}")
