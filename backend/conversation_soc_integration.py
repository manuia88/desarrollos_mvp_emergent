"""W7.AS.3.C · Conversation → SOC Franchise signal integration (cycle-closer).

Módulo puro standalone, importable por conversation_engine.py.
Captura señales conversacionales del asesor y las persiste como inputs
para soc_franchise_engine (W6.MOV.1). El cómputo del score lo hace el engine;
aquí sólo registramos las señales crudas de forma idempotente y cron-friendly.

Signal types soportados:
    - response_time_seconds   → tiempo de respuesta del asesor (menor = mejor)
    - nps_proxy_sentiment     → proxy de satisfacción (-1.0 .. 1.0)
    - lead_conversion         → evento de conversión (0/1)

Collections:
    - conversation_soc_signals   (señales crudas · idempotentes vía signal_id)

FAIL-OPEN: cualquier fallo de DB o engine retorna shape neutro sin crash.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict

log = logging.getLogger("dmx.conversation_soc_integration")

VALID_SIGNAL_TYPES = {"response_time_seconds", "nps_proxy_sentiment", "lead_conversion"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _neutral(reason: str, **extra: Any) -> Dict[str, Any]:
    """Shape neutro FAIL-OPEN · nunca crashea al caller."""
    out = {"ok": False, "recorded": False, "idempotent": False, "reason": reason}
    out.update(extra)
    return out


def _signal_id(asesor_id: str, signal_type: str, value: Any, bucket: str) -> str:
    """ID determinístico → 2da invocación con mismos params NO duplica."""
    seed = f"{asesor_id}|{signal_type}|{value}|{bucket}"
    return "csoc_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:20]


async def record_conversation_signal(
    asesor_id: str,
    signal_type: str,
    value: Any,
    db,
) -> Dict[str, Any]:
    """Registra una señal conversacional como input para soc_franchise_engine.

    Idempotente: el mismo (asesor_id, signal_type, value) dentro de la misma
    hora-bucket genera el mismo signal_id → upsert sin duplicar.

    FAIL-OPEN: retorna shape neutro si falta DB o algo falla.

    Returns:
        {ok, recorded, idempotent, signal_id, asesor_id, signal_type, value, bucket}
    """
    if not asesor_id:
        return _neutral("missing_asesor_id")
    if signal_type not in VALID_SIGNAL_TYPES:
        return _neutral("invalid_signal_type", signal_type=signal_type)

    # Normaliza value a float cuando aplica (sentiment / response_time / conversion)
    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return _neutral("non_numeric_value", signal_type=signal_type)

    now = _now()
    bucket = now.strftime("%Y%m%d%H")  # hora-bucket → idempotency window
    sig_id = _signal_id(asesor_id, signal_type, numeric_value, bucket)

    if db is None:
        return _neutral("no_db", signal_id=sig_id)

    doc = {
        "signal_id": sig_id,
        "asesor_id": asesor_id,
        "signal_type": signal_type,
        "value": numeric_value,
        "bucket": bucket,
        "recorded_at": now,
        "flushed": False,  # cron flush lo marca True tras alimentar al engine
    }
    try:
        res = await db.conversation_soc_signals.update_one(
            {"signal_id": sig_id},
            {"$setOnInsert": doc},
            upsert=True,
        )
        # upserted_id presente sólo en el primer insert
        was_new = getattr(res, "upserted_id", None) is not None
        return {
            "ok": True,
            "recorded": was_new,
            "idempotent": not was_new,
            "signal_id": sig_id,
            "asesor_id": asesor_id,
            "signal_type": signal_type,
            "value": numeric_value,
            "bucket": bucket,
        }
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_soc] record failed: {exc}")
        return _neutral("persist_error", signal_id=sig_id, error=str(exc))


async def flush_signals_to_soc(db, asesor_id: str = None, limit: int = 500) -> Dict[str, Any]:
    """Cron-friendly batch flush · agrega señales no flushadas y las marca.

    No recalcula el score (eso lo hace soc_franchise_engine.compute_soc_score);
    sólo deja las señales listas y marca flushed=True para no re-procesarlas.

    FAIL-OPEN: retorna shape neutro con flushed=0 si algo falla.
    """
    if db is None:
        return {"ok": False, "flushed": 0, "reason": "no_db"}
    query: Dict[str, Any] = {"flushed": False}
    if asesor_id:
        query["asesor_id"] = asesor_id
    try:
        cursor = db.conversation_soc_signals.find(query, {"_id": 0}).limit(limit)
        pending = await cursor.to_list(length=limit)
        if not pending:
            return {"ok": True, "flushed": 0, "asesores": []}
        ids = [s["signal_id"] for s in pending]
        await db.conversation_soc_signals.update_many(
            {"signal_id": {"$in": ids}},
            {"$set": {"flushed": True, "flushed_at": _now()}},
        )
        asesores = sorted({s.get("asesor_id") for s in pending if s.get("asesor_id")})
        return {"ok": True, "flushed": len(ids), "asesores": asesores}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[conversation_soc] flush failed: {exc}")
        return {"ok": False, "flushed": 0, "reason": "flush_error", "error": str(exc)}


async def ensure_indexes(db) -> None:
    try:
        await db.conversation_soc_signals.create_index("signal_id", unique=True)
        await db.conversation_soc_signals.create_index(
            [("asesor_id", 1), ("flushed", 1)], name="idx_csoc_asesor_flushed", background=True
        )
    except Exception as exc:
        log.warning(f"[conversation_soc] ensure_indexes failed: {exc}")
