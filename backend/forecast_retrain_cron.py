"""W5.3 Parte 1 Sub-A — Forecast retrain cron diario.

Itera todas las zonas con DRPI disponible, ajusta ARIMA y persiste el forecast.
Invalida `forecast_cache` al terminar para refrescar respuestas públicas.

APScheduler cron @ 04:00 UTC (después de DRPI 03:30 / AVM 03:00).
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List

log = logging.getLogger("dmx.forecast_retrain_cron")


def _new_id(prefix: str = "fc_run") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def _list_zones_with_drpi(db) -> List[str]:
    """Slugs únicos con al menos un snapshot DRPI disponible."""
    zones: List[str] = []
    try:
        cursor = db.drpi_snapshots.aggregate([
            {"$match": {"available": True}},
            {"$group": {"_id": "$zone_id"}},
        ])
        async for d in cursor:
            zid = d.get("_id")
            if zid:
                zones.append(zid)
    except Exception as e:
        log.warning(f"[forecast] _list_zones_with_drpi failed: {e}")
    return zones


async def retrain_all_zones(db) -> Dict[str, Any]:
    """Re-entrena forecast para todas las zonas con DRPI. Persiste run summary."""
    from forecast_engine import fit_zone_forecast

    started_at = datetime.now(timezone.utc)
    zones = await _list_zones_with_drpi(db)
    log.info(f"[forecast] daily retrain start · zones={len(zones)}")

    fitted_ok = 0
    insufficient = 0
    errors = 0
    samples: List[Dict[str, Any]] = []

    for zone_slug in zones:
        try:
            res = await fit_zone_forecast(db, zone_slug)
            if res.get("available"):
                fitted_ok += 1
                samples.append({
                    "zone_slug": zone_slug,
                    "arima_order": res.get("arima_order"),
                    "mape_test": res.get("mape_test"),
                    "delta_12m_pct": (res.get("horizons") or {}).get("12m", {}).get("delta_pct"),
                })
            else:
                insufficient += 1
        except Exception as e:
            errors += 1
            log.warning(f"[forecast] zone error {zone_slug}: {e}")

    # Cache invalidate
    try:
        import forecast_cache
        await forecast_cache.invalidate_all()
    except Exception as e:
        log.warning(f"[forecast] cache invalidate failed: {e}")

    finished_at = datetime.now(timezone.utc)
    duration_s = (finished_at - started_at).total_seconds()
    summary = {
        "id": _new_id("fc_run"),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_s": round(duration_s, 2),
        "zones_total": len(zones),
        "fitted_ok": fitted_ok,
        "insufficient": insufficient,
        "errors": errors,
        "samples": samples[:50],
    }
    try:
        await db.forecast_retrain_runs.insert_one(dict(summary))
    except Exception as e:
        log.warning(f"[forecast] insert run summary failed: {e}")

    log.info(
        f"[forecast] daily retrain done · zones={len(zones)} fitted_ok={fitted_ok} "
        f"insufficient={insufficient} errors={errors} duration_s={duration_s:.1f}"
    )
    return summary


def register_forecast_job(scheduler, db) -> None:
    """Registrar cron APScheduler @ 04:00 UTC daily."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            retrain_all_zones,
            CronTrigger(hour=4, minute=0),
            id="forecast_retrain_daily",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            coalesce=True,
        )
        log.info("[forecast] cron registered · daily @ 04:00 UTC")
    except Exception as e:
        log.warning(f"[forecast] register_forecast_job failed: {e}")
