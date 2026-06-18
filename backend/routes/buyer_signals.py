"""
Buyer Signals — el ESPINAZO de las 8 capas del Copiloto (2026-06-18).

Captura TODA la conducta del comprador en el marketplace público, anónima, atada al `visitor_id`
(localStorage). Tipos: view · ficha_view · like · unlike · save · compare · share · dwell. Sin PII (ip_hash + TTL).

Cierra ciclos (no standalone):
  - like/view/save por colonia → el Grafo del Comprador los lee como INTERÉS → dev (/api/dev/grafo-comprador)
    + superadmin lo ven (k-anon).
  - el perfil de GUSTO (E2) se construye sobre estos eventos (reusa taste_profile).
  - al registrarse, el visitor_id engancha este histórico al lead (E3).

El LIKE es señal de DOS caras: afina el gusto del comprador + le dice al dev que su desarrollo interesa.
"""
import logging
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_buyer_signals")
router = APIRouter(tags=["buyer-signals"])

VALID = {"view", "ficha_view", "like", "unlike", "save", "unsave", "compare", "share", "dwell", "photo_dwell"}
_TTL_DAYS = 120
_indexed = {"done": False}


async def _ensure_index(db):
    if _indexed["done"]:
        return
    try:
        await db.buyer_signals.create_index("created_at_dt", expireAfterSeconds=_TTL_DAYS * 86400)
        await db.buyer_signals.create_index([("visitor_id", 1), ("type", 1)])
        await db.buyer_signals.create_index([("entity_id", 1), ("type", 1)])
        _indexed["done"] = True
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] index: {e}")


class SignalIn(BaseModel):
    visitor_id: str
    type: str                       # view | ficha_view | like | unlike | save | compare | share | dwell | photo_dwell
    entity_id: Optional[str] = None  # dev/propiedad
    colonia: Optional[str] = None    # nombre o slug (para el Grafo por colonia)
    value: Optional[str] = None      # libre (ej. sección leída, estilo)
    dwell_ms: Optional[int] = None


@router.post("/api/buyer/signal")
async def buyer_signal(s: SignalIn, request: Request):
    """Registra una señal de conducta del comprador (anónima). Fail-open. Es el espinazo de las 8 capas."""
    if s.type not in VALID:
        return {"ok": False, "error": "tipo inválido"}
    try:
        db = request.app.state.db
        await _ensure_index(db)
        ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request.client else ""))
        now = datetime.now(timezone.utc)
        dwell = s.dwell_ms if (isinstance(s.dwell_ms, int) and 0 <= s.dwell_ms <= 600000) else None
        doc = {
            "id": f"bs_{uuid.uuid4().hex[:12]}",
            "visitor_id": s.visitor_id[:64],
            "type": s.type,
            "entity_id": (s.entity_id or None),
            "colonia": (s.colonia or "").strip().lower() or None,
            "value": (s.value or "")[:120] or None,
            "dwell_ms": dwell,
            "ip_hash": hashlib.sha256(f"{ip}:dmx_bs".encode()).hexdigest()[:16] if ip else None,
            "created_at_dt": now,
        }
        # like/save/unlike → upsert por (visitor, type, entity) para no duplicar el estado; el resto = append.
        if s.type in ("like", "unlike", "save", "unsave"):
            base = s.type.replace("un", "") if s.type.startswith("un") else s.type  # like/save
            on = not s.type.startswith("un")
            await db.buyer_signals.update_one(
                {"visitor_id": doc["visitor_id"], "type": base, "entity_id": doc["entity_id"]},
                {"$set": {**doc, "type": base, "active": on}}, upsert=True)
        else:
            await db.buyer_signals.insert_one(doc)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] fail-open: {e}")
        return {"ok": False}


@router.get("/api/desarrollo/{dev_id}/interes")
async def interes_desarrollo(dev_id: str, request: Request):
    """Interés PÚBLICO/agregado de un desarrollo (likes + vistas + guardados · k-anon ≥3 para likes/guardados).
    Lo consume la ficha (prueba social) y conecta al dev (su desarrollo interesa)."""
    try:
        db = request.app.state.db
        likes = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "like", "active": True})
        saves = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "save", "active": True})
        views = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "ficha_view"})
        K = 3
        return {
            "ok": True,
            "likes": likes if likes >= K else 0,
            "saves": saves if saves >= K else 0,
            "views": views,
            "interes": "alto" if likes >= 10 else "medio" if likes >= K else "bajo",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] interes fail-open: {e}")
        return {"ok": True, "likes": 0, "saves": 0, "views": 0, "interes": "bajo"}
