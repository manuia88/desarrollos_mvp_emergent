"""Hilo de actividad del lead — store canónico (E0.8).

La RAÍZ del problema "una acción aparece en una vista pero no en otra" es que cada acción
se cablea punto-a-punto. Este módulo define UN solo registro (`lead_events`) y dos
funciones: un escritor (`record_activity`) que TODAS las superficies usarán, y un lector
normalizado (`read_lead_events`) que TODAS las vistas leen.

E0.8 define el hilo y lo hace real (el tab Actividad ya lo lee + el puente escribe el
primer evento). En E3 se migran los demás escritores (tarea/nota/cita/chat/swipe) a
`record_activity`, manteniendo el lector retro-compatible (la vista Actividad además
mergea las fuentes legacy mientras dure la migración).

Forma normalizada de un evento (la misma del overview): {ts, source, kind, title, body}.
"""
import logging
from uuid import uuid4
from datetime import datetime, timezone
from typing import Optional, List

log = logging.getLogger("dmx.lead_activity")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ts_iso(v) -> str:
    """Normaliza ts (datetime|str) a ISO string."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


async def record_activity(
    db, owner_id: str, contacto_id: str, kind: str,
    *, title: str = "", body: str = "", ts=None,
    source: str = "manual", ref_id: Optional[str] = None, meta: Optional[dict] = None,
) -> Optional[dict]:
    """Escritor canónico del hilo. Inserta UN evento normalizado en `lead_events`.
    kind: nota|tarea|cita|mensaje|swipe|score|etapa|evento... source: manual|whatsapp|
    swipe|agent|system. FAIL-OPEN (nunca rompe al llamador)."""
    try:
        if not owner_id or not contacto_id or not kind:
            return None
        doc = {
            "id": "evt_" + uuid4().hex[:14],
            "owner_id": owner_id,
            "contacto_id": contacto_id,
            "kind": kind,
            "title": title or kind,
            "body": body or "",
            "source": source,
            "ref_id": ref_id,
            "meta": meta or {},
            "ts": _ts_iso(ts) or _now_iso(),
        }
        await db.lead_events.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc
    except Exception as e:
        log.warning(f"[lead_activity] record_activity fail-open: {e}")
        return None


async def read_lead_events(db, contacto_id: str, owner_id: str, limit: int = 200) -> List[dict]:
    """Lector del hilo: eventos del store canónico, en la forma {ts, source, kind, title,
    body} (lista para mergear con las fuentes legacy del overview). Aislado por owner_id."""
    out: List[dict] = []
    try:
        cur = db.lead_events.find(
            {"owner_id": owner_id, "contacto_id": contacto_id}, {"_id": 0},
        ).sort("ts", -1).limit(limit)
        async for e in cur:
            out.append({
                "ts": _ts_iso(e.get("ts")),
                "source": e.get("source", "evento"),
                "kind": e.get("kind", "evento"),
                "title": e.get("title", "Actividad"),
                "body": e.get("body", ""),
            })
    except Exception as e:
        log.warning(f"[lead_activity] read_lead_events fail-open: {e}")
    return out
