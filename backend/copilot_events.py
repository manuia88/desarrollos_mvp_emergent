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


# ── SUPERADMIN · inteligencia agregada de toda la operación (founder) ──
_OBJ_LABEL = {
    "precio": "Precio / presupuesto", "ubicacion": "Ubicación", "financiamiento": "Financiamiento",
    "tiempo": "No es el momento", "competencia": "Comparando opciones", "duda": "Tiene dudas",
}


async def copilot_admin_overview(db, days: int = 30) -> Dict[str, Any]:
    """CIERRE · panel founder. Agrega TODA la operación: adopción, eficacia, objeciones que
    dominan el mercado, guiones que funcionan, asesores que más lo aprovechan + alertas
    accionables. FAIL-OPEN a ceros."""
    from datetime import timedelta
    since = _now() - timedelta(days=days)
    total_used = total_positive = total_ask = 0
    by_type: Dict[str, int] = {}
    objeciones: Dict[str, int] = {}
    by_advisor: Dict[str, Dict[str, int]] = {}
    active_advisors = set()
    try:
        async for ev in db.asesor_copilot_events.find(
                {"ts": {"$gte": since}},
                {"_id": 0, "owner_id": 1, "suggestion_type": 1, "outcome": 1, "kind": 1}).limit(50000):
            owner = ev.get("owner_id")
            if owner:
                active_advisors.add(owner)
            oc = ev.get("outcome")
            a = by_advisor.setdefault(owner, {"used": 0, "positive": 0})
            if oc in ("used", "sent"):
                total_used += 1; a["used"] += 1
                st = ev.get("suggestion_type") or "otro"
                by_type[st] = by_type.get(st, 0) + 1
            if oc == "positive":
                total_positive += 1; a["positive"] += 1
            if ev.get("kind") == "copilot_ask":
                total_ask += 1
            if ev.get("kind") == "objecion" and ev.get("suggestion_type"):
                objeciones[ev["suggestion_type"]] = objeciones.get(ev["suggestion_type"], 0) + 1
    except Exception:
        pass

    # ranking de asesores por uso (top 8)
    top_advisors = sorted(
        ([{"owner_id": k, "used": v["used"], "positive": v["positive"],
           "rate": round(v["positive"] / v["used"], 2) if v["used"] else 0.0}
          for k, v in by_advisor.items() if v["used"] > 0]),
        key=lambda x: -x["used"])[:8]
    # nombres de asesores (best-effort)
    try:
        ids = [a["owner_id"] for a in top_advisors]
        if ids:
            users = {u["user_id"]: u.get("name") or u.get("email") or u["user_id"]
                     async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})}
            for a in top_advisors:
                a["name"] = users.get(a["owner_id"], a["owner_id"][:12])
    except Exception:
        for a in top_advisors:
            a["name"] = a["owner_id"][:12]

    top_obj = sorted(objeciones.items(), key=lambda x: -x[1])[:5]
    top_scripts = sorted(by_type.items(), key=lambda x: -x[1])[:5]

    # UPGRADE · alertas accionables para el founder (insights, no solo números)
    alerts: List[Dict[str, str]] = []
    rate = round(total_positive / total_used, 2) if total_used else 0.0
    if total_used == 0:
        alerts.append({"level": "warn", "text": "Nadie está usando las sugerencias del Copiloto. Revisa visibilidad/onboarding."})
    elif rate < 0.3:
        alerts.append({"level": "warn", "text": f"Baja eficacia ({int(rate*100)}%): los guiones no están convirtiendo. Conviene afinarlos."})
    elif rate >= 0.6:
        alerts.append({"level": "good", "text": f"Alta eficacia ({int(rate*100)}%): los guiones del Copiloto están funcionando — replícalos."})
    if top_obj:
        lbl = _OBJ_LABEL.get(top_obj[0][0], top_obj[0][0])
        alerts.append({"level": "info", "text": f"Objeción dominante del mercado: «{lbl}» ({top_obj[0][1]}×). Prepara material para rebatirla."})
    if len(active_advisors) and len(top_advisors) and top_advisors[0]["used"] > 3 * (total_used / max(1, len(active_advisors))):
        alerts.append({"level": "info", "text": f"{top_advisors[0]['name']} usa el Copiloto mucho más que el promedio — buen caso para capacitar al resto."})

    return {
        "days": days,
        "active_advisors": len(active_advisors),
        "total_used": total_used,
        "total_positive": total_positive,
        "total_ask": total_ask,
        "response_rate": rate,
        "top_objeciones": [{"type": k, "label": _OBJ_LABEL.get(k, k), "count": v} for k, v in top_obj],
        "top_scripts": [{"type": k, "count": v} for k, v in top_scripts],
        "top_advisors": top_advisors,
        "alerts": alerts,
    }
