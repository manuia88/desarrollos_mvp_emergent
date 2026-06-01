"""M1 · E5 — auto-tuning de close_probability desde cierres REALES.

El score de cierre dejaba de ser fijo: aprende qué señales predicen cierre observando
los leads ya cerrados (ganados vs perdidos) y ajusta los pesos. Build for endstate:
con pocos cierres devuelve ≈ pesos default (no rompe); afina conforme se cierran ventas.

Pesos persistidos en `close_prob_weights` (scope=global). `close_probability` los lee
vía get_weights(). Un cron diario corre tune(). Cierra el loop: cierre → reentrena → mejor score.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone

log = logging.getLogger("dmx.close_prob_tuning")

DEFAULT_WEIGHTS = {"buyer_score": 1.5, "temperatura": 1.0, "stage": 2.0, "ofertas": 1.0, "engagement": 1.0}
MIN_SAMPLE = 20   # cierres mínimos para empezar a confiar en lo aprendido
WON = {"cerrado", "ganada", "cerrado_ganado", "ganado"}
LOST = {"perdida", "cerrado_perdido", "perdido"}


async def get_weights(db) -> dict:
    """Pesos aprendidos si hay suficiente data; si no, los default. FAIL-OPEN."""
    try:
        doc = await db.close_prob_weights.find_one(
            {"scope": "global"}, {"_id": 0, "weights": 1, "sample_size": 1})
        if doc and doc.get("weights") and int(doc.get("sample_size", 0)) >= MIN_SAMPLE:
            return {**DEFAULT_WEIGHTS, **doc["weights"]}
    except Exception:
        pass
    return dict(DEFAULT_WEIGHTS)


async def _persist(db, weights, n, confidence):
    try:
        await db.close_prob_weights.update_one(
            {"scope": "global"},
            {"$set": {"scope": "global", "weights": weights, "sample_size": n,
                      "confidence": confidence, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[close_prob_tuning] persist fail-open: {e}")


async def tune(db) -> dict:
    """Reentrena los pesos desde cierres reales. Devuelve el resumen."""
    try:
        won, lost = [], []
        async for c in db.asesor_contactos.find(
            {"etapa": {"$in": list(WON | LOST)}},
            {"_id": 0, "etapa": 1, "temperatura": 1},
        ).limit(5000):
            (won if c.get("etapa") in WON else lost).append(c)
        n = len(won) + len(lost)
        if n < MIN_SAMPLE:
            await _persist(db, dict(DEFAULT_WEIGHTS), n, 0)
            return {"sample_size": n, "applied": False, "reason": "insufficient_sample"}

        base_winrate = len(won) / n

        def winrate_if(pred):
            w = sum(1 for c in won if pred(c))
            l = sum(1 for c in lost if pred(c))
            tot = w + l
            return (w / tot) if tot else base_winrate

        hot = lambda c: any(k in (c.get("temperatura") or "").lower() for k in ("calien", "client"))
        temp_lift = winrate_if(hot) - base_winrate   # -..+ correlación caliente→cierre

        learned = dict(DEFAULT_WEIGHTS)
        learned["temperatura"] = max(0.3, DEFAULT_WEIGHTS["temperatura"] * (1 + 1.5 * temp_lift))

        # Blend por sample: más cierres ⇒ confía más en lo aprendido (espíritu FSD).
        blend = min(1.0, n / 100.0)
        weights = {k: round(DEFAULT_WEIGHTS[k] * (1 - blend) + learned[k] * blend, 3) for k in DEFAULT_WEIGHTS}

        await _persist(db, weights, n, int(blend * 100))
        return {"sample_size": n, "applied": True, "weights": weights,
                "base_winrate": round(base_winrate, 3), "temp_lift": round(temp_lift, 3)}
    except Exception as e:
        log.warning(f"[close_prob_tuning] tune fail-open: {e}")
        return {"applied": False, "reason": "error"}


def register_close_prob_tuning_cron(scheduler, db) -> None:
    """Cron diario (04:30 UTC) que reentrena los pesos. FAIL-OPEN."""
    try:
        from apscheduler.triggers.cron import CronTrigger

        async def _job():
            r = await tune(db)
            log.info(f"[close_prob_tuning] cron: {r}")

        scheduler.add_job(_job, CronTrigger(hour=4, minute=30), id="close_prob_tuning_daily",
                          replace_existing=True, misfire_grace_time=3600)
        log.info("[close_prob_tuning] cron registrado (04:30 UTC)")
    except Exception as e:
        log.warning(f"[close_prob_tuning] cron register fail-open: {e}")
