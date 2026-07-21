"""UN score de lead — reconciliador (Palanca 4, auditoría 07-20).

El lead tenía 5 marcadores dispersos (termómetro, buyer_score, señales…) que nunca se
reconciliaban: `leads.score = None` en 59/59. Esto NO calcula un score nuevo (el termómetro ya
lo hace por visitor); RECONCILIA: por lead resuelve su visitor_id, toma la mejor señal disponible
y escribe UN campo canónico `leads.score` (0-100) + banda + fuente, para la bandeja del asesor.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _banda(score: float) -> str:
    return ("hirviendo" if score >= 80 else "caliente" if score >= 60
            else "tibio" if score >= 40 else "frío")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def reconciliar_lead_score(db, lead: Dict[str, Any], *,
                                 temps: Optional[Dict[str, Any]] = None,
                                 sig: Optional[Dict[str, int]] = None) -> Optional[int]:
    """Escribe leads.score (0-100) + score_banda + score_fuente para UN lead. temps/sig se pueden
    precargar para el batch. Devuelve el score o None si no hay señal atribuible."""
    vid = lead.get("visitor_id")
    score: Optional[float] = None
    banda: Optional[str] = None
    fuente: Optional[str] = None
    if vid:
        t = temps.get(vid) if temps is not None else await db.lead_temperaturas.find_one(
            {"visitor_id": vid}, sort=[("fecha", -1)])
        temp = _num((t or {}).get("temperatura"))
        if temp is not None:
            score, banda, fuente = temp, (t or {}).get("banda"), "termometro"
        else:
            n = sig.get(vid) if sig is not None else await db.buyer_signals.count_documents({"visitor_id": vid})
            if n:
                score, fuente = min(100.0, 20 + n * 5), "actividad"
    upd: Dict[str, Any] = {"score_at": _now(), "score_fuente": fuente}
    if score is not None:
        upd["score"] = round(score)
        upd["score_banda"] = banda or _banda(score)
    else:
        upd["score"] = None
        upd["score_banda"] = None
    await db.leads.update_one({"id": lead["id"]}, {"$set": upd})
    return round(score) if score is not None else None


async def reconciliar_todos(db) -> Dict[str, int]:
    """Batch: reconcilia el score de TODOS los leads. Precarga termómetro + actividad una vez."""
    from collections import Counter
    temps: Dict[str, Any] = {}
    async for t in db.lead_temperaturas.find({}).sort("fecha", 1):     # el más reciente gana
        if t.get("visitor_id"):
            temps[t["visitor_id"]] = t
    sig: Counter = Counter()
    async for s in db.buyer_signals.find({}, {"_id": 0, "visitor_id": 1}):
        if s.get("visitor_id"):
            sig[s["visitor_id"]] += 1
    con = tot = 0
    async for lead in db.leads.find({}):
        tot += 1
        if await reconciliar_lead_score(db, lead, temps=temps, sig=sig) is not None:
            con += 1
    return {"leads": tot, "con_score": con}
