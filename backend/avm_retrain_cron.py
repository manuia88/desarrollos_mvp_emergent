"""W5.1 Sub-Chunk A — Nightly retraining cron + auto-promotion.

Re-entrena modelos hedónicos por zona × tier diariamente y promueve si R²
mejora más de 5 puntos porcentuales (5pp) sobre el modelo actualmente promovido.

Registro en `hedonic_promotion_log` con razón y diferencial de R².
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.avm_retrain_cron")

# Umbral: promovemos si new_r2 - old_r2 >= 0.05 (5pp)
R2_PROMOTION_THRESHOLD = 0.05


def _new_id(prefix: str = "promo") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _list_zones_for_retrain(db) -> List[Dict[str, Any]]:
    """Determinar zonas × tier a re-entrenar.

    Conservador: usar zonas con al menos un modelo histórico previo + zonas
    del seed COLONIAS (porque ya las tenemos enmascaradas como zonas).
    """
    zones: Dict[str, Dict[str, Any]] = {}
    try:
        cursor = db.hedonic_models.find({}, {"_id": 0, "zone_id": 1, "tier": 1})
        async for d in cursor:
            zid = d.get("zone_id")
            tier = d.get("tier") or "colonia"
            if not zid:
                continue
            zones[f"{zid}|{tier}"] = {"zone_id": zid, "tier": tier}
    except Exception as exc:
        log.warning(f"[retrain] list previous models failed: {exc}")

    # Add seed colonias (16 CDMX) to ensure coverage even sin histórico
    try:
        from data_seed import COLONIAS
        for c in COLONIAS:
            zid = c.get("id")
            if not zid:
                continue
            key = f"{zid}|colonia"
            zones.setdefault(key, {"zone_id": zid, "tier": "colonia"})
    except Exception as exc:
        log.warning(f"[retrain] seed colonias load failed: {exc}")

    return list(zones.values())


async def _current_promoted_model(db, zone_id: str, tier: str) -> Optional[Dict[str, Any]]:
    """Modelo actualmente promovido (latest available con `promoted_at` set)."""
    doc = await db.hedonic_models.find_one(
        {"zone_id": zone_id, "tier": tier, "available": True, "promoted_at": {"$exists": True}},
        {"_id": 0},
        sort=[("promoted_at", -1)],
    )
    return doc


async def promote_model(db, new_model: Dict[str, Any], old_model: Optional[Dict[str, Any]], reason: str) -> Dict[str, Any]:
    """Marcar `new_model` como promovido y dejar log.

    Devuelve dict con detalles del log creado.
    """
    now = datetime.now(timezone.utc)
    try:
        await db.hedonic_models.update_one(
            {"id": new_model["id"]},
            {"$set": {"promoted_at": now.isoformat(), "promoted_at_dt": now}},
        )
    except Exception as exc:
        log.warning(f"[retrain] mark promotion on hedonic_models failed: {exc}")

    promotion_entry = {
        "id": _new_id("promo"),
        "zone_id": new_model.get("zone_id"),
        "tier": new_model.get("tier"),
        "old_model_id": (old_model or {}).get("id"),
        "new_model_id": new_model["id"],
        "old_r2": (old_model or {}).get("r_squared"),
        "new_r2": new_model.get("r_squared"),
        "delta_r2": round(
            float(new_model.get("r_squared") or 0)
            - float((old_model or {}).get("r_squared") or 0),
            4,
        ),
        "promoted_at": now.isoformat(),
        "promoted_at_dt": now,
        "reason": reason,
        "sample_size": new_model.get("sample_size"),
    }
    try:
        await db.hedonic_promotion_log.insert_one(dict(promotion_entry))
    except Exception as exc:
        log.warning(f"[retrain] insert promotion log failed: {exc}")

    # Invalidate AVM cache
    try:
        import avm_cache
        await avm_cache.invalidate_all()
    except Exception as exc:
        log.warning(f"[retrain] cache invalidate failed: {exc}")

    out = dict(promotion_entry)
    out.pop("promoted_at_dt", None)
    return out


async def retrain_and_maybe_promote(db, zone_id: str, tier: str = "colonia") -> Dict[str, Any]:
    """Re-entrena una zona y decide promoción.

    Devuelve resumen con keys: zone_id, tier, fitted, available, new_r2, old_r2,
    promoted, reason.
    """
    from hedonic_regression_engine import fit_hedonic_model

    summary: Dict[str, Any] = {
        "zone_id": zone_id,
        "tier": tier,
        "fitted": False,
        "available": False,
        "promoted": False,
        "reason": None,
        "new_model_id": None,
        "new_r2": None,
        "old_r2": None,
        "delta_r2": None,
    }

    try:
        new_model = await fit_hedonic_model(db, zone_id, tier=tier)
    except Exception as exc:
        log.warning(f"[retrain] fit failed {zone_id}/{tier}: {exc}")
        summary["reason"] = f"fit_error:{exc}"
        return summary

    summary["fitted"] = True
    summary["available"] = bool(new_model.get("available"))
    summary["new_model_id"] = new_model.get("id")
    summary["new_r2"] = new_model.get("r_squared")

    if not new_model.get("available"):
        summary["reason"] = new_model.get("reason") or "model_unavailable"
        return summary

    old_model = await _current_promoted_model(db, zone_id, tier)
    summary["old_r2"] = (old_model or {}).get("r_squared")

    new_r2 = float(new_model.get("r_squared") or 0)
    old_r2 = float((old_model or {}).get("r_squared") or 0)
    delta = new_r2 - old_r2
    summary["delta_r2"] = round(delta, 4)

    # Promote si: (a) no hay modelo promovido previo, o (b) delta >= threshold
    should_promote = (old_model is None) or (delta >= R2_PROMOTION_THRESHOLD)
    if should_promote:
        reason = "initial_promotion" if old_model is None else f"r2_improvement_{round(delta * 100, 2)}pp"
        await promote_model(db, new_model, old_model, reason)
        summary["promoted"] = True
        summary["reason"] = reason
        log.info(
            f"[retrain] PROMOTED {zone_id}/{tier} · new_r2={new_r2:.4f} old_r2={old_r2:.4f} delta={delta:+.4f} reason={reason}"
        )
    else:
        summary["reason"] = f"below_threshold_delta_{round(delta * 100, 2)}pp"
        log.info(
            f"[retrain] kept old · {zone_id}/{tier} · new_r2={new_r2:.4f} old_r2={old_r2:.4f} delta={delta:+.4f}"
        )

    return summary


async def run_nightly_retrain(db) -> Dict[str, Any]:
    """Entry-point del cron. Itera sobre todas las zonas conocidas.

    Devuelve resumen agregado para el log.
    """
    started_at = datetime.now(timezone.utc)
    zones = await _list_zones_for_retrain(db)
    log.info(f"[retrain] nightly start · zones={len(zones)}")

    results: List[Dict[str, Any]] = []
    promoted = 0
    fitted_ok = 0
    errors = 0

    for z in zones:
        try:
            r = await retrain_and_maybe_promote(db, z["zone_id"], z.get("tier") or "colonia")
            results.append(r)
            if r.get("available"):
                fitted_ok += 1
            if r.get("promoted"):
                promoted += 1
        except Exception as exc:
            errors += 1
            log.warning(f"[retrain] zone error {z['zone_id']}: {exc}")

    finished_at = datetime.now(timezone.utc)
    duration_s = (finished_at - started_at).total_seconds()
    summary = {
        "id": _new_id("retrain_run"),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_s": round(duration_s, 2),
        "zones_total": len(zones),
        "fitted_ok": fitted_ok,
        "promoted": promoted,
        "errors": errors,
        "results_sample": results[:50],
    }

    # Persistir run summary (colección dedicada, opcional)
    try:
        await db.hedonic_retrain_runs.insert_one(dict(summary))
    except Exception as exc:
        log.warning(f"[retrain] insert run summary failed: {exc}")

    log.info(
        f"[retrain] nightly done · zones={len(zones)} fitted_ok={fitted_ok} "
        f"promoted={promoted} errors={errors} duration_s={duration_s:.1f}"
    )
    return summary


async def ensure_indexes(db) -> None:
    try:
        await db.hedonic_promotion_log.create_index(
            [("zone_id", 1), ("tier", 1), ("promoted_at_dt", -1)],
            name="promo_zone_ts",
        )
        await db.hedonic_promotion_log.create_index(
            "promoted_at_dt", expireAfterSeconds=730 * 86400,  # 2 años
            name="promo_ttl_2y",
        )
        await db.hedonic_retrain_runs.create_index(
            "finished_at", name="retrain_finished_at",
        )
    except Exception as exc:
        log.warning(f"[retrain] ensure_indexes failed: {exc}")


def register_retrain_job(scheduler, db) -> None:
    """Registrar el cron en APScheduler. Corre cada noche a las 03:00 UTC."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            run_nightly_retrain,
            CronTrigger(hour=3, minute=0),
            id="avm_nightly_retrain",
            replace_existing=True,
            kwargs={"db": db},
            max_instances=1,
            coalesce=True,
        )
        log.info("[retrain] cron registered · daily @ 03:00 UTC")
    except Exception as exc:
        log.warning(f"[retrain] register_retrain_job failed: {exc}")
