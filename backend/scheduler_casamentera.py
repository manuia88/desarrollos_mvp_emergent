"""APScheduler — corre la CASAMENTERA periódicamente (el sistema busca por el comprador).

Cada hora escanea las búsquedas guardadas (marketplace_searches con alert=True) × inventario y crea alertas para los
matches NUEVOS — al comprador ("encontramos algo para ti") y a su asesor (lead dormido con match nuevo → llámalo + WA
si dejó teléfono). Vuelve real la promesa "te avisamos cuando entre inventario", sin que nadie mueva un dedo.

Llama correr_casamentera(db) DIRECTO (no el endpoint HTTP), así que no pasa por el token x-cron-token (ese candado es
solo para disparos externos). Se arranca desde el startup de server.py, sobre el mismo AsyncIOScheduler.
"""
from __future__ import annotations
import logging

log = logging.getLogger("dmx.scheduler_casamentera")


async def run_casamentera(db) -> int:
    try:
        from routes.casamentera import correr_casamentera
        n = await correr_casamentera(db)
        log.info(f"[casamentera] cron: {n} alertas nuevas creadas")
        return n
    except Exception as e:  # noqa: BLE001
        log.warning(f"[casamentera] cron fail-open: {e}")
        return 0


def schedule_casamentera(scheduler, db):
    """Registra el job horario. Se llama desde el startup de server.py."""
    if not scheduler:
        return
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        run_casamentera,
        CronTrigger(minute=0),   # cada hora en punto
        id="casamentera_hourly",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
    )
    log.info("[casamentera] cron programado @ cada hora")
