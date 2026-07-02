"""Phase 4 Batch 25 · APScheduler — Saved Search Alerts + Image Embeddings Nightly.

Jobs:
  • daily 08:00 UTC — saved_search_alerts: para cada confirmed saved_search,
    busca nuevas propiedades y envía alertas por email si las hay.
  • nightly 03:00 UTC (si IMAGE_EMBEDDINGS_ENABLED=true) — update_all_embeddings_batch:
    genera embeddings para hasta 100 assets sin procesar.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Dict

log = logging.getLogger("dmx.scheduler_saved_search")

IMAGE_EMBEDDINGS_ENABLED = os.getenv("IMAGE_EMBEDDINGS_ENABLED", "false").lower() == "true"


async def run_saved_search_alerts(db) -> Dict:
    """
    Cron diario 8am: procesa todas las búsquedas guardadas confirmadas.
    Envía alertas si encontró propiedades nuevas.
    """
    now = datetime.now(timezone.utc)
    sent = 0
    skipped = 0
    errors = 0

    try:
        confirmed_searches = await db.saved_searches.find(
            {"confirmed": True},
            {"_id": 0},
        ).to_list(500)
    except Exception as e:
        log.error(f"[scheduler_saved_search] DB query failed: {e}")
        return {"sent": 0, "skipped": 0, "errors": 1}

    from services.saved_searches import send_alert

    for search in confirmed_searches:
        freq = search.get("alert_frequency", "weekly")
        last_sent = search.get("last_alert_sent")

        # Verificar si corresponde enviar
        should_send = False
        if freq == "daily":
            should_send = last_sent is None or (now - last_sent).total_seconds() >= 86400
        elif freq == "weekly":
            should_send = last_sent is None or (now - last_sent).total_seconds() >= 7 * 86400

        if not should_send:
            skipped += 1
            continue

        try:
            result = await send_alert(db, search)
            if result:
                sent += 1
            else:
                skipped += 1  # Sin nuevas propiedades
        except Exception as e:
            log.warning(f"[scheduler_saved_search] alert failed for {search.get('email')}: {e}")
            errors += 1

    log.info(f"[scheduler_saved_search] alerts done: sent={sent} skipped={skipped} errors={errors}")
    return {"sent": sent, "skipped": skipped, "errors": errors}


async def run_image_embeddings_nightly(db) -> Dict:
    """
    Cron nightly 3am: genera embeddings para assets sin procesar.
    Solo ejecuta si IMAGE_EMBEDDINGS_ENABLED=true.
    """
    if not IMAGE_EMBEDDINGS_ENABLED:
        log.debug("[scheduler_embeddings] IMAGE_EMBEDDINGS_ENABLED=false, skip")
        return {"processed": 0, "errors": 0, "skipped": "disabled"}

    from services.image_embeddings import update_all_embeddings_batch
    result = await update_all_embeddings_batch(db, limit=100)
    log.info(f"[scheduler_embeddings] nightly done: {result}")
    return result


def register_saved_search_jobs(sched, db) -> None:
    """Registra los jobs en el APScheduler existente."""
    from apscheduler.triggers.cron import CronTrigger

    # Alertas diarias 8am UTC
    sched.add_job(
        run_saved_search_alerts,
        CronTrigger(hour=8, minute=0),
        id="saved_search_daily_alerts",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Saved Search — Alertas diarias 8am",
    )
    log.info("[scheduler_saved_search] daily alerts job registered @ 08:00 UTC")

    # Embeddings nightly 3am UTC
    sched.add_job(
        run_image_embeddings_nightly,
        CronTrigger(hour=3, minute=0),
        id="image_embeddings_nightly",
        replace_existing=True,
        kwargs={"db": db},
        max_instances=1,
        name="Image Embeddings — Nightly 3am",
    )
    enabled_str = "ACTIVO" if IMAGE_EMBEDDINGS_ENABLED else "DESHABILITADO (set IMAGE_EMBEDDINGS_ENABLED=true)"
    log.info(f"[scheduler_embeddings] nightly job registered @ 03:00 UTC — {enabled_str}")
