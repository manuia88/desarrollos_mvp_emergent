"""demand_feedback — cierra el LOOP DE CIERRE sobre la demanda (auditoría N3).

Cuando un comprador CIERRA (lead cerrado_ganado del asesor / closing del copiloto), su demanda
registrada (marketplace_searches con unmet / demanda_insatisfecha) seguía contando como hueco
PARA SIEMPRE → inflaba las métricas de demanda insatisfecha que ven dev y superadmin.

Diseño honesto: NO se reescribe la historia (unmet queda como estaba al momento de la búsqueda);
se marca `satisfecha: True` y los LECTORES de demanda viva excluyen las satisfechas.
"""
import logging
from datetime import datetime, timezone

log = logging.getLogger("dmx.demand_feedback")


async def mark_demand_satisfied(db, visitor_id: str = None, lead_id: str = None) -> dict:
    """Marca la demanda del comprador como satisfecha. Resuelve visitor_id desde el lead si hace falta.
    Fail-open: nunca rompe el flujo del cierre."""
    try:
        if not visitor_id and lead_id:
            lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "visitor_id": 1})
            visitor_id = (lead or {}).get("visitor_id")
        if not visitor_id:
            return {"ok": False, "reason": "sin visitor_id"}
        now = datetime.now(timezone.utc).isoformat()
        stamp = {"satisfecha": True, "satisfecha_at": now}
        r1 = await db.marketplace_searches.update_many(
            {"visitor_id": visitor_id, "satisfecha": {"$ne": True}}, {"$set": stamp})
        r2 = await db.demanda_insatisfecha.update_many(
            {"visitor_id": visitor_id, "satisfecha": {"$ne": True}}, {"$set": stamp})
        if r1.modified_count or r2.modified_count:
            log.info(f"[demand_feedback] demanda satisfecha · searches={r1.modified_count} insatisfecha={r2.modified_count}")
        return {"ok": True, "searches": r1.modified_count, "insatisfecha": r2.modified_count}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[demand_feedback] fail-open: {e}")
        return {"ok": False}
