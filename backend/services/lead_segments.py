"""Clasificación viva del board (E1) — fuente de verdad SERVER-SIDE.

Los segmentos del board (Calientes, Foco rojo, Se enfrían, ...) dejaban de ser heurística
client-side y pasan a definirse aquí, sobre señales REALES: buyer_score tier + etapa del
pipeline + RECENCIA de actividad (timeline + hilo lead_events). `tag_segments` adjunta
c['segments']=[...] a cada contacto en list_contactos; el board filtra/cuenta por esas
etiquetas (UX instantánea, una sola definición). "Foco rojo" = preset compuesto real.

Mismos 11 segmentos que aprobó el founder (5 que avanzan + 5 que requieren atención), ahora
con definición real en vez del proxy `!actionByLead`.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

log = logging.getLogger("dmx.lead_segments")

STALE_DAYS = 7        # sin actividad >= 7d → necesita seguimiento
NEW_GRACE_DAYS = 2    # 48h de gracia antes de marcar "sin contactar"

# Catálogo (label/emoji/group) · espejo del board. 'todos' lo maneja la UI.
SEGMENT_DEFS = [
    {"key": "calientes",   "label": "Calientes",       "emoji": "🔥", "group": "pos"},
    {"key": "potencial",   "label": "Potenciales",     "emoji": "⭐", "group": "pos"},
    {"key": "concita",     "label": "Con cita",        "emoji": "📅", "group": "pos"},
    {"key": "negociacion", "label": "En negociación",  "emoji": "🤝", "group": "pos"},
    {"key": "porcerrar",   "label": "Por cerrar",      "emoji": "✅", "group": "pos"},
    {"key": "focorojo",    "label": "Foco rojo",       "emoji": "🔴", "group": "neg"},
    {"key": "sincontacto", "label": "Sin contactar",   "emoji": "⏰", "group": "neg"},
    {"key": "seenfrian",   "label": "Se enfrían",      "emoji": "🧊", "group": "neg"},
    {"key": "sinseg",      "label": "Sin seguimiento", "emoji": "🕓", "group": "neg"},
    {"key": "estancados",  "label": "Estancados",      "emoji": "❄️", "group": "neg"},
]


def _to_dt(v) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def compute_segments(contacto: dict, last_activity, now: datetime) -> List[str]:
    """Devuelve las claves de segmento a las que pertenece un contacto (señales reales)."""
    bs = contacto.get("buyer_score") or {}
    tier = bs.get("tier") or ""
    score_val = bs.get("value") or 0
    temp = (contacto.get("temperatura") or "").lower()
    etapa = contacto.get("etapa") or "nuevo"
    is_hot = tier == "hot" or "calien" in temp
    is_warm = tier == "warm" or "tibio" in temp
    is_cold = tier == "cold"

    la = _to_dt(last_activity)
    created = _to_dt(contacto.get("created_at"))
    age_days = (now - created).days if created else 0
    if la is not None:
        days_since = (now - la).days
        never = False
    else:
        days_since = None
        never = age_days >= NEW_GRACE_DAYS   # 48h de gracia para leads recién creados
    stale = never or (days_since is not None and days_since >= STALE_DAYS)

    segs: List[str] = []
    # ↑ Avanzan al cierre
    if is_hot:
        segs.append("calientes")
    if score_val >= 70:
        segs.append("potencial")
    if etapa == "visita":
        segs.append("concita")
    if etapa == "negociacion":
        segs.append("negociacion")
    if is_hot and etapa in ("visita", "negociacion"):
        segs.append("porcerrar")
    # ↓ Requieren atención
    if stale and (is_hot or is_warm or etapa == "nuevo"):
        segs.append("focorojo")
    if etapa == "nuevo" and never:
        segs.append("sincontacto")
    if is_warm and stale:
        segs.append("seenfrian")
    if stale:
        segs.append("sinseg")
    if is_cold and stale:
        segs.append("estancados")
    return segs


async def _recency_map(db, ids: list) -> dict:
    """contacto_id → último ts de actividad (timeline + hilo lead_events). FAIL-OPEN."""
    out: dict = {}
    if not ids:
        return out
    for coll in ("asesor_contacto_timeline", "lead_events"):
        try:
            async for row in db[coll].aggregate([
                {"$match": {"contacto_id": {"$in": ids}}},
                {"$group": {"_id": "$contacto_id", "last_ts": {"$max": "$ts"}}},
            ]):
                cid = row["_id"]
                ts = _to_dt(row.get("last_ts"))
                if ts and (out.get(cid) is None or ts > out[cid]):
                    out[cid] = ts
        except Exception:
            pass
    return out


async def tag_segments(db, contactos: list, owner_id: str) -> None:
    """Adjunta c['segments']=[...] a cada contacto (in-place). Requiere buyer_score ya
    adjunto. FAIL-OPEN: [] si algo falla (el board cae a su fallback client-side)."""
    try:
        now = datetime.now(timezone.utc)
        ids = [c.get("id") for c in contactos if c.get("id")]
        rec = await _recency_map(db, ids)
        for c in contactos:
            c["segments"] = compute_segments(c, rec.get(c.get("id")), now)
    except Exception as e:
        log.warning(f"[lead_segments] tag_segments fail-open: {e}")
        for c in contactos:
            c.setdefault("segments", [])
