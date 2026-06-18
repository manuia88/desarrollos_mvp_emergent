"""
Mis Favoritos del comprador público — la cara pública del "link tipo Tinder" del asesor (2026-06-18).

MISMA lógica UX que el swipe del asesor (asesor_lead_properties + /vote + /cita + /nota), construida DISTINTO:
- Identidad = `visitor_id` anónimo (no token+owner_id+contacto_id del asesor).
- El "guardado" reusa el espinazo: buyer_signals like/save con `active` (NO duplica estado).
- buyer_favoritos guarda solo el EXTRA del tablero (cita pedida, nota, estatus) por (visitor_id, dev_id).
- LAS DOS CARAS: cuando el comprador se registra (E3) y se le asigna asesor, sus favoritos + citas + notas se
  ESPEJAN a asesor_lead_properties → aparecen en el MISMO tablero Ficha360 que alimenta el link del asesor. Así
  ambos (comprador y asesor) ven lo que se sube, se baja, se agenda y las notas. Sync built-for-endstate.

Endpoints: GET /api/buyer/favoritos · POST .../quitar · .../cita · .../nota. Fail-open, sin PII anónima extra.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_favoritos")
router = APIRouter(tags=["favoritos"])


def _dev(dev_id):
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        return DEVELOPMENTS_BY_ID.get(dev_id)
    except Exception:
        return None


def _card(dev_id, extra=None):
    """Normaliza un desarrollo a tarjeta de favorito (lo que pinta el front)."""
    d = _dev(dev_id) or {}
    photos = d.get("photos") or d.get("images") or []
    card = {
        "dev_id": dev_id,
        "name": d.get("name") or "Desarrollo",
        "colonia": d.get("colonia") or "",
        "price_from_display": d.get("price_from_display") or "",
        "photo": (photos[0] if photos else None) or d.get("cover") or d.get("hero_image"),
        "recamaras": d.get("recamaras") or d.get("rec") or None,
    }
    if extra:
        card.update({k: extra.get(k) for k in ("cita", "nota", "status") if extra.get(k)})
    return card


@router.get("/api/buyer/favoritos")
async def listar_favoritos(request: Request, visitor_id: str):
    """Los favoritos del comprador: lo que likeó/guardó (espinazo, activos) + su cita/nota (buyer_favoritos)."""
    try:
        db = request.app.state.db
        # 1. Set guardado = like/save activos en el espinazo (dedup por dev).
        ids = []
        async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "type": {"$in": ["like", "save"]}, "active": True},
            {"_id": 0, "entity_id": 1, "created_at_dt": 1}, sort=[("created_at_dt", -1)]):
            if s.get("entity_id") and s["entity_id"] not in ids:
                ids.append(s["entity_id"])
        # 2. UNIDADES guardadas (unidad como átomo) → por dev. Un dev con unidad guardada también es favorito.
        unidades = {}
        async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "type": "unit_save", "active": True},
            {"_id": 0, "entity_id": 1, "unit_number": 1}):
            if s.get("entity_id") and s.get("unit_number"):
                unidades.setdefault(s["entity_id"], []).append(s["unit_number"])
                if s["entity_id"] not in ids:
                    ids.append(s["entity_id"])
        # 3. Extra del tablero (cita/nota/status) por dev.
        extras = {}
        async for f in db.buyer_favoritos.find({"visitor_id": visitor_id}, {"_id": 0, "dev_id": 1, "cita": 1, "nota": 1, "status": 1}):
            extras[f.get("dev_id")] = f
        favoritos = []
        for i in ids:
            if not _dev(i):
                continue
            card = _card(i, extras.get(i))
            if unidades.get(i):
                card["unidades_guardadas"] = unidades[i]
            favoritos.append(card)
        return {"ok": True, "favoritos": favoritos, "total": len(favoritos)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[favoritos] listar fail-open: {e}")
        return {"ok": True, "favoritos": [], "total": 0}


class FavIn(BaseModel):
    visitor_id: str
    dev_id: str


@router.post("/api/buyer/favoritos/quitar")
async def quitar_favorito(b: FavIn, request: Request):
    """Quita un favorito (deja de gustarle): desactiva like+save en el espinazo + marca el tablero."""
    try:
        db = request.app.state.db
        await db.buyer_signals.update_many(
            {"visitor_id": b.visitor_id, "type": {"$in": ["like", "save"]}, "entity_id": b.dev_id},
            {"$set": {"active": False}})
        await db.buyer_favoritos.update_one(
            {"visitor_id": b.visitor_id, "dev_id": b.dev_id},
            {"$set": {"status": "quitado", "updated_at_dt": datetime.utcnow()}}, upsert=True)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[favoritos] quitar fail: {e}")
        return {"ok": False}


class CitaIn(BaseModel):
    visitor_id: str
    dev_id: str
    when: str                       # texto libre ("Sábado 11am") · igual que el swipe del asesor
    lead_id: Optional[str] = None   # si ya es lead (el front lo pasa tras registrar)


@router.post("/api/buyer/favoritos/cita")
async def pedir_cita(b: CitaIn, request: Request):
    """El comprador pide visita de un favorito. Si ya es lead, cae en el tablero del asesor (status cita) + timeline."""
    try:
        db = request.app.state.db
        now = datetime.utcnow()
        await db.buyer_favoritos.update_one(
            {"visitor_id": b.visitor_id, "dev_id": b.dev_id},
            {"$set": {"cita": b.when[:80], "status": "cita", "updated_at_dt": now}}, upsert=True)
        # Si ya es lead → al tablero del asesor (asesor_lead_properties) + rastro en su timeline. Las dos caras.
        if b.lead_id:
            await _push_to_asesor_board(db, b.lead_id, b.dev_id, status="cita", client_cita=b.when[:80])
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[favoritos] cita fail: {e}")
        return {"ok": False}


class NotaIn(BaseModel):
    visitor_id: str
    dev_id: str
    text: str
    lead_id: Optional[str] = None


@router.post("/api/buyer/favoritos/nota")
async def dejar_nota(b: NotaIn, request: Request):
    """El comprador deja una nota en un favorito. Si ya es lead, el asesor la ve en su tablero."""
    try:
        db = request.app.state.db
        await db.buyer_favoritos.update_one(
            {"visitor_id": b.visitor_id, "dev_id": b.dev_id},
            {"$set": {"nota": b.text[:400], "updated_at_dt": datetime.utcnow()}}, upsert=True)
        if b.lead_id:
            await _push_to_asesor_board(db, b.lead_id, b.dev_id, client_note=b.text[:400])
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[favoritos] nota fail: {e}")
        return {"ok": False}


async def _push_to_asesor_board(db, lead_id, dev_id, status=None, client_cita=None, client_note=None):
    """Upsert de UNA propiedad en el tablero del asesor (asesor_lead_properties) — la cara del asesor del favorito."""
    try:
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "assigned_to": 1})
        owner = (lead or {}).get("assigned_to")
        if not owner:
            return
        cont = await db.asesor_contactos.find_one({"owner_id": owner, "source_lead_id": lead_id}, {"_id": 0, "id": 1})
        contacto_id = (cont or {}).get("id")
        if not contacto_id:
            return
        d = _dev(dev_id) or {}
        sset = {"updated_at": datetime.utcnow().isoformat()}
        if status:
            sset["status"] = status
        if client_cita is not None:
            sset["client_cita"] = client_cita
        if client_note is not None:
            sset["client_note"] = client_note
        import uuid as _u
        await db.asesor_lead_properties.update_one(
            {"owner_id": owner, "contacto_id": contacto_id, "dev_id": dev_id},
            {"$set": sset,
             "$setOnInsert": {"id": f"lprop_{_u.uuid4().hex[:10]}", "owner_id": owner, "contacto_id": contacto_id,
                              "dev_id": dev_id, "name": d.get("name"), "price": d.get("price_from"),
                              "colonia": d.get("colonia"), "source": "copiloto", "thumb": "up",
                              "created_at": datetime.utcnow().isoformat()}},
            upsert=True)
    except Exception as e:  # noqa: BLE001
        log.info(f"[favoritos] push board skip: {e}")


async def mirror_favoritos_to_board(db, visitor_id, lead_id):
    """E3 · al registrarse, TODOS los favoritos del comprador caen al tablero de su asesor (status le_gusto + cita/
    nota si las dejó). El asesor ve lo que el comprador eligió solo, en el mismo Ficha360 que su link Tinder."""
    try:
        ids = []
        async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "type": {"$in": ["like", "save"]}, "active": True}, {"_id": 0, "entity_id": 1}):
            if s.get("entity_id") and s["entity_id"] not in ids:
                ids.append(s["entity_id"])
        extras = {}
        async for f in db.buyer_favoritos.find({"visitor_id": visitor_id}, {"_id": 0, "dev_id": 1, "cita": 1, "nota": 1, "status": 1}):
            extras[f.get("dev_id")] = f
        for i in ids:
            ex = extras.get(i) or {}
            await _push_to_asesor_board(
                db, lead_id, i,
                status=("cita" if ex.get("cita") else "le_gusto"),
                client_cita=ex.get("cita"), client_note=ex.get("nota"))
        return len(ids)
    except Exception as e:  # noqa: BLE001
        log.info(f"[favoritos] mirror to board skip: {e}")
        return 0
