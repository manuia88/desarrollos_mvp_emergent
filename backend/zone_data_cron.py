"""
zone_data_cron — Llenado automático (en lotes, resumible) de datos reales por colonia.
═══════════════════════════════════════════════════════════════════════════════
Con ~1,352 colonias en el catálogo, sincronizar todo de un jalón satura las APIs gratis (OSM,
FGJ). Este cron procesa un LOTE de las colonias menos recientes cada pocos minutos: comercios
(OSM) + seguridad (FGJ crudo), marca `data_synced_at`, recalcula el percentil de seguridad y los
scores. Resumible (siempre toma las más viejas/sin sincronizar) y educado (throttle entre llamadas).
Así el catálogo se llena solo y se mantiene fresco. Cero deuda: si una fuente falla, sigue.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

log = logging.getLogger("dmx.zone_data_cron")

DEFAULT_CHUNK = 40
THROTTLE_S = 0.4          # educado con las APIs gratis
PERIOD_YEARS = 2


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def run_zone_data_chunk(db, city: str = "CDMX", chunk: int = DEFAULT_CHUNK) -> dict:
    """Sincroniza un lote de colonias (las menos recientes) y recalcula. Resumible."""
    import osm_engine as osm
    import crime_fgj_engine as fgj
    import colonias_catalog as cc

    year_from = datetime.now(timezone.utc).year - PERIOD_YEARS
    procesadas = con_comercio = con_seguridad = 0

    # Las que no tienen `data_synced_at` salen primero (null ordena antes en Mongo).
    cur = db.colonias.find(
        {"city": city, "center": {"$ne": None}},
        {"_id": 0, "id": 1, "center": 1},
    ).sort("data_synced_at", 1).limit(chunk)

    async for c in cur:
        ctr = c.get("center")
        if not (isinstance(ctr, (list, tuple)) and len(ctr) == 2):
            continue
        lng, lat = float(ctr[0]), float(ctr[1])
        zid = c["id"]
        # Comercios (OSM)
        try:
            d = await osm.compute_zone_density_osm(db, zid, lat, lng)
            if d.get("ok") and (d.get("total") or 0) > 0:
                con_comercio += 1
        except Exception as e:
            log.warning(f"[zone_data] osm {zid}: {e}")
        await asyncio.sleep(THROTTLE_S)
        # Seguridad (FGJ crudo · el score lo pone rescore al final)
        try:
            if await fgj.store_raw_incidents(db, zid, lat, lng, year_from):
                con_seguridad += 1
        except Exception as e:
            log.warning(f"[zone_data] fgj {zid}: {e}")
        await db.colonias.update_one({"id": zid}, {"$set": {"data_synced_at": _iso()}})
        await asyncio.sleep(THROTTLE_S)
        procesadas += 1

    # Recalcula seguridad + precio/valor (percentil sobre todas · barato · local) + scores
    await fgj.rescore_safety(db, city)
    try:
        import resale_data as rd
        await rd.precio_rescore(db, city)
    except Exception as e:
        log.warning(f"[zone_data] precio_rescore: {e}")
    scores = await cc.compute_catalog_scores(db, city)

    faltan = await db.colonias.count_documents(
        {"city": city, "data_synced_at": {"$in": [None]}})
    total = await db.colonias.count_documents({"city": city})
    return {
        "ok": True, "city": city, "procesadas": procesadas,
        "con_comercio": con_comercio, "con_seguridad": con_seguridad,
        "faltan_sin_tocar": faltan, "total_colonias": total,
        "con_scores_reales": scores["con_scores_reales"],
    }


def schedule_zone_data_cron(scheduler, db) -> None:
    """Registra el llenado automático cada 12 min (toma el siguiente lote)."""
    try:
        from cron_heartbeat import wrap_apscheduler_job
    except Exception:
        def wrap_apscheduler_job(fn, _job_id):  # noqa: ARG001
            return fn
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        wrap_apscheduler_job(run_zone_data_chunk, "zone_data_fill"),
        CronTrigger(minute="*/12", timezone="America/Mexico_City"),
        args=[db], id="zone_data_fill", replace_existing=True, misfire_grace_time=600,
    )
    log.info("[zone_data] cron de llenado registrado (cada 12 min)")
