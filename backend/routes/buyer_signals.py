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


class RegistrarLeadIn(BaseModel):
    visitor_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    dev_id: Optional[str] = None       # si se registró desde una ficha
    source: str = "marketplace_save"   # de dónde (guardar búsqueda / contacto ficha / alerta)


@router.post("/api/buyer/registrar")
async def registrar_lead(b: RegistrarLeadIn, request: Request):
    """E3 · El lead deja sus datos en un MOMENTO DE VALOR → se crea el lead, se ENGANCHA todo su histórico anónimo
    (búsquedas, likes, vistas por visitor_id), se ASIGNA (sin referidor → la inmobiliaria de la CASA; la regla del
    founder vía resolve_house_public_receiver) y se ESPEJA al CRM del asesor (mirror_lead_to_asesor_contacto).
    Cierra el triángulo comprador↔asesor↔dev: el asesor ve QUÉ quiere (perfil) y QUÉ le gustó (likes)."""
    from datetime import datetime as _dt
    import uuid as _u
    try:
        db = request.app.state.db
        # 1. Perfil: el último marketplace_search de este visitor (lo que busca de verdad).
        perfil = await db.marketplace_searches.find_one(
            {"visitor_id": b.visitor_id}, {"_id": 0}, sort=[("created_at_dt", -1)]) or {}
        # 2. Histórico de conducta: qué likeó y qué vio (capa C/D).
        liked, viewed = [], []
        async for s in db.buyer_signals.find({"visitor_id": b.visitor_id, "type": "like", "active": True}, {"_id": 0, "entity_id": 1}):
            if s.get("entity_id"):
                liked.append(s["entity_id"])
        async for s in db.buyer_signals.find({"visitor_id": b.visitor_id, "type": "ficha_view"}, {"_id": 0, "entity_id": 1}).limit(50):
            if s.get("entity_id") and s["entity_id"] not in viewed:
                viewed.append(s["entity_id"])
        if b.dev_id and b.dev_id not in liked:
            viewed.insert(0, b.dev_id)
        # 3. Asignación: sin referidor → la CASA (regla founder). (La atribución por link de asesor/dev se cablea
        #    con la cookie dmx_ref en una iteración; el grueso del marketplace público cae a la casa.)
        assigned_to, house_inm = None, None
        try:
            from services.lead_bridge import resolve_house_public_receiver
            rid, house_inm = await resolve_house_public_receiver(db)
            assigned_to = rid
        except Exception:
            pass
        now = _dt.utcnow()
        lead_id = f"lead_{_u.uuid4().hex[:12]}"
        lead = {
            "id": lead_id, "dev_org_id": "default",
            "source": f"copiloto_{b.source}",
            "contact": {"name": b.name[:120], "email": (b.email or None), "phone": (b.phone or None)},
            "status": "nuevo", "status_v2": "lead_nuevo", "activo": True,
            "assigned_to": assigned_to, "inmobiliaria_id": house_inm,
            # Perfil + histórico enganchados (lo que el asesor ve para no preguntar de cero):
            "buyer_profile": {
                "colonias": perfil.get("colonias"), "presupuesto_max": perfil.get("precio_max"),
                "recamaras_min": perfil.get("recamaras_min"), "banos_min": perfil.get("banos_min"),
                "estacionamientos_min": perfil.get("estacionamientos_min"), "stages": perfil.get("stages"),
                "plazo": perfil.get("plazo"), "uso": perfil.get("uso"),
            },
            "liked_devs": liked, "viewed_devs": viewed[:20],
            "visitor_id": b.visitor_id,
            "created_at": now.isoformat(), "updated_at": now.isoformat(), "last_activity_at": now.isoformat(),
            "created_by": "_copiloto",
        }
        await db.leads.insert_one(dict(lead)); lead.pop("_id", None)
        # 4. Espeja al CRM del asesor (idempotente, dedup, aislamiento). Auto-reparable.
        try:
            from services.lead_bridge import mirror_lead_to_asesor_contacto
            await mirror_lead_to_asesor_contacto(db, lead)
        except Exception:
            await db.leads.update_one({"id": lead_id}, {"$set": {"mirror_pending": True}})
        # 5. Engancha el histórico anónimo al lead (el visitor_id deja de ser anónimo).
        await db.buyer_signals.update_many({"visitor_id": b.visitor_id}, {"$set": {"lead_id": lead_id}})
        await db.marketplace_searches.update_many({"visitor_id": b.visitor_id}, {"$set": {"lead_id": lead_id}})
        return {"ok": True, "lead_id": lead_id, "asignado": "tu inmobiliaria" if house_inm else "asesor"}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] registrar lead fail: {e}")
        return {"ok": False}
