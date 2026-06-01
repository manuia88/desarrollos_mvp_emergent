"""Copiloto · cierre de ciclo (2026-05-31).

Una sola base para los 4 cierres que pidió el founder:
  1. APRENDER de lo que sí funciona — registra cada sugerencia usada + su resultado.
  2. ACCIONES alimentan al lead — al enviar/usar, sube last_contact + temperatura.
  3. SEGURIDAD — auditoría de qué se envió a cada cliente (la colección ES el log).
  4. MÉTRICAS — agregados para el panel del Copiloto.

Colección: asesor_copilot_events
  {id, owner_id, lead_id, kind, suggestion_type?, channel?, text_preview?,
   outcome?(used|sent|positive|ignored), ts}

FAIL-OPEN en todo: si algo falla, NO rompe el envío/sugerencia.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_copilot_events_indexes(db) -> None:
    """Índices idempotentes. Llamado en startup. FAIL-OPEN."""
    try:
        await db.asesor_copilot_events.create_index([("owner_id", 1), ("ts", -1)])
        await db.asesor_copilot_events.create_index([("owner_id", 1), ("lead_id", 1), ("ts", -1)])
        await db.asesor_copilot_events.create_index([("owner_id", 1), ("suggestion_type", 1)])
    except Exception:
        pass


async def log_event(db, owner_id: str, lead_id: Optional[str], kind: str, *,
                    suggestion_type: Optional[str] = None, channel: Optional[str] = None,
                    text: Optional[str] = None, outcome: Optional[str] = None) -> None:
    """Registra un evento del Copiloto (auditoría + aprendizaje). FAIL-OPEN."""
    try:
        await db.asesor_copilot_events.insert_one({
            "id": "cev_" + uuid.uuid4().hex[:12],
            "owner_id": owner_id, "lead_id": lead_id, "kind": kind,
            "suggestion_type": suggestion_type, "channel": channel,
            "text_preview": (text or "")[:160] if text else None,
            "outcome": outcome, "ts": _now(),
        })
    except Exception:
        pass


async def touch_lead_on_action(db, owner_id: str, lead_id: str, *, warm: bool = False) -> None:
    """CIERRE #2 · una acción (enviar/usar) actualiza el lead: last_contact siempre;
    sube temperatura a 'caliente' si warm y no estaba ya caliente. FAIL-OPEN."""
    try:
        now = _now()
        upd: Dict[str, Any] = {"last_contact": now, "ultima_interaccion": now}
        if warm:
            c = await db.asesor_contactos.find_one({"id": lead_id, "owner_id": owner_id}, {"_id": 0, "temperatura": 1})
            if c and str(c.get("temperatura", "")).lower() not in ("caliente", "hot"):
                upd["temperatura"] = "tibio" if str(c.get("temperatura", "")).lower() in ("frio", "frío", "") else c.get("temperatura")
        await db.asesor_contactos.update_one({"id": lead_id, "owner_id": owner_id}, {"$set": upd})
    except Exception:
        pass


# CIERRE #1 · pesos de aprendizaje. Por cada tipo de sugerencia: usos vs resultados positivos.
# El Copiloto sube los tipos que SÍ funcionan para este asesor y baja los ignorados.
_DECAY = 0.0  # sin decay por ahora; el ranking es por ratio positivo


async def suggestion_weights(db, owner_id: str) -> Dict[str, float]:
    """Devuelve {suggestion_type: peso 0..1} según el historial real del asesor.
    peso = (positivos + 1) / (usos + 2)  (suavizado Laplace). Default 0.5 si sin data."""
    weights: Dict[str, Dict[str, int]] = {}
    try:
        async for ev in db.asesor_copilot_events.find(
                {"owner_id": owner_id, "suggestion_type": {"$ne": None}},
                {"_id": 0, "suggestion_type": 1, "outcome": 1}).limit(2000):
            st = ev.get("suggestion_type")
            w = weights.setdefault(st, {"used": 0, "pos": 0})
            if ev.get("outcome") in ("used", "sent"):
                w["used"] += 1
            if ev.get("outcome") == "positive":
                w["pos"] += 1
    except Exception:
        return {}
    out: Dict[str, float] = {}
    for st, w in weights.items():
        out[st] = round((w["pos"] + 1) / (w["used"] + 2), 3)
    return out


async def copilot_metrics(db, owner_id: str, days: int = 30) -> Dict[str, Any]:
    """CIERRE #4 · métricas para el panel: sugerencias usadas, tasa de respuesta positiva,
    objeciones más frecuentes. FAIL-OPEN a ceros."""
    from datetime import timedelta
    since = _now() - timedelta(days=days)
    used = positive = 0
    by_type: Dict[str, int] = {}
    objeciones: Dict[str, int] = {}
    try:
        async for ev in db.asesor_copilot_events.find(
                {"owner_id": owner_id, "ts": {"$gte": since}},
                {"_id": 0, "suggestion_type": 1, "outcome": 1, "kind": 1}).limit(5000):
            oc = ev.get("outcome")
            if oc in ("used", "sent"):
                used += 1
                st = ev.get("suggestion_type") or "otro"
                by_type[st] = by_type.get(st, 0) + 1
            if oc == "positive":
                positive += 1
            if ev.get("kind") == "objecion" and ev.get("suggestion_type"):
                objeciones[ev["suggestion_type"]] = objeciones.get(ev["suggestion_type"], 0) + 1
    except Exception:
        pass
    top_obj = sorted(objeciones.items(), key=lambda x: -x[1])[:3]
    return {
        "used": used,
        "positive": positive,
        "response_rate": round(positive / used, 2) if used else 0.0,
        "by_type": by_type,
        "top_objeciones": [{"type": k, "count": v} for k, v in top_obj],
        "days": days,
    }
