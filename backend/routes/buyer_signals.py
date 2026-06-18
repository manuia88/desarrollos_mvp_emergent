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

VALID = {"view", "ficha_view", "like", "unlike", "save", "unsave", "compare", "share", "dwell", "photo_dwell",
         "unit_view", "unit_save", "unit_unsave"}   # D · embudo POR UNIDAD + unidad como átomo
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
    unit_number: Optional[str] = None  # unidad específica (#02A) para el embudo por unidad + unidad como átomo
    colonia: Optional[str] = None    # nombre o slug (para el Grafo por colonia)
    value: Optional[str] = None      # libre (ej. sección leída, estilo)
    dwell_ms: Optional[int] = None


@router.post("/api/buyer/signal")
async def buyer_signal(s: SignalIn, request: Request):
    """Registra una señal de conducta del comprador (anónima). Fail-open. Es el espinazo de las 8 capas."""
    if s.type not in VALID:
        return {"ok": False, "error": "tipo inválido"}
    # Rate-limit por IP real: frena bots que inflen el espinazo de señales (envenenan gusto/demanda). Fail-soft.
    from services.ratelimit import allow, client_ip
    if not allow("buyer_signal", client_ip(request), 90):
        return {"ok": True, "throttled": True}
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
            "unit_number": (s.unit_number or None),
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
        elif s.type in ("unit_save", "unit_unsave"):
            # Unidad como átomo: guardar/quitar la UNIDAD específica (upsert por visitor+dev+unidad).
            on = s.type == "unit_save"
            await db.buyer_signals.update_one(
                {"visitor_id": doc["visitor_id"], "type": "unit_save", "entity_id": doc["entity_id"], "unit_number": doc["unit_number"]},
                {"$set": {**doc, "type": "unit_save", "active": on}}, upsert=True)
        else:
            await db.buyer_signals.insert_one(doc)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] fail-open: {e}")
        return {"ok": False}


class ElasticidadIn(BaseModel):
    visitor_id: Optional[str] = None
    cedio: str                       # qué relajó: "amenity:cancha_padel" | "unit_feature:balcon" | "baths" …
    texto: Optional[str] = None      # la búsqueda original (contexto)


@router.post("/api/buyer/elasticidad")
async def registrar_elasticidad(b: ElasticidadIn, request: Request):
    """C · Elasticidad: cuando el comprador RELAJA un criterio (no había match), registramos QUÉ cedió. Revela en qué
    transige la gente (amenidad antes que zona, m² antes que precio…) → oro para precio/producto del dev + superadmin."""
    from services.ratelimit import allow, client_ip
    if not allow("elasticidad", client_ip(request), 40):
        return {"ok": True, "throttled": True}
    try:
        db = request.app.state.db
        from datetime import datetime as _dt
        await db.buyer_elasticidad.insert_one({
            "visitor_id": b.visitor_id, "cedio": b.cedio[:60], "texto": (b.texto or "")[:200],
            "created_at_dt": _dt.utcnow(),
        })
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] elasticidad fail: {e}")
        return {"ok": False}


@router.get("/api/desarrollo/{dev_id}/embudo-unidades")
async def embudo_unidades(dev_id: str, request: Request):
    """D · Embudo POR UNIDAD para el dev: cuántos VIERON y GUARDARON cada unidad (#02A) — qué unidad mueve y cuál no."""
    try:
        db = request.app.state.db
        from collections import defaultdict
        fun = defaultdict(lambda: {"vistas": 0, "guardados": 0})
        async for s in db.buyer_signals.find({"entity_id": dev_id, "type": "unit_view"}, {"_id": 0, "unit_number": 1}):
            if s.get("unit_number"):
                fun[s["unit_number"]]["vistas"] += 1
        async for s in db.buyer_signals.find({"entity_id": dev_id, "type": "unit_save", "active": True}, {"_id": 0, "unit_number": 1}):
            if s.get("unit_number"):
                fun[s["unit_number"]]["guardados"] += 1
        out = [{"unidad": k, **v} for k, v in fun.items()]
        out.sort(key=lambda x: (-x["guardados"], -x["vistas"]))
        return {"ok": True, "unidades": out}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] embudo-unidades: {e}")
        return {"ok": True, "unidades": []}


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
            # F · La búsqueda COMPLETA llega al asesor (no vuelve a preguntar): TODOS los criterios que el comprador
            # expresó — zona, precio (min+max), recámaras, m² (rango), baños, cajones, etapa, plazo, crédito,
            # enganche/mensualidad tope, AMENIDADES y FEATURES pedidos, y hasta la frase cruda que escribió.
            "buyer_profile": {
                "colonias": perfil.get("colonias"), "presupuesto_max": perfil.get("precio_max"),
                "presupuesto_min": perfil.get("precio_min"),
                "recamaras_min": perfil.get("recamaras_min"), "banos_min": perfil.get("banos_min"),
                "m2_min": perfil.get("m2_min"), "m2_max": perfil.get("m2_max"),
                "estacionamientos_min": perfil.get("estacionamientos_min"), "stages": perfil.get("stages"),
                "stage_pedido": perfil.get("stage_pedido"), "tipo": perfil.get("tipo_pedido"),
                "plazo": perfil.get("plazo"), "uso": perfil.get("uso"), "credito": perfil.get("credito"),
                "enganche_max": perfil.get("enganche_max"), "mensualidad_max": perfil.get("mensualidad_max"),
                "amenidades_pedidas": perfil.get("amenidades_pedidas") or [],
                "features_pedidos": perfil.get("features_pedidos") or [],
                "busqueda_textual": perfil.get("texto_crudo") or perfil.get("query"),
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
        # 6. LAS DOS CARAS: los favoritos (+ citas/notas) del comprador caen al tablero del asesor (Ficha360), el
        #    mismo que alimenta su link Tinder. Fail-open.
        try:
            from routes.favoritos import mirror_favoritos_to_board
            await mirror_favoritos_to_board(db, b.visitor_id, lead_id)
        except Exception:
            pass
        return {"ok": True, "lead_id": lead_id, "asignado": "tu inmobiliaria" if house_inm else "asesor"}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] registrar lead fail: {e}")
        return {"ok": False}


def _amen_set(dev):
    return {str(a).strip().lower() for a in (dev.get("amenities") or []) if a}


@router.get("/api/buyer/parecidos")
async def parecidos(request: Request, visitor_id: str, limit: int = 6):
    """E2 · perfil de GUSTO: de lo que el comprador LIKEÓ, infiere su gusto (amenidades, precio/m², recámaras,
    estilo de zona) y recomienda PARECIDOS — "porque te gustó X". Netflix-style, sobre el espinazo buyer_signals.
    Reusa la señal del like (= swipe right). No pide formularios."""
    try:
        db = request.app.state.db
        from data_developments import DEVELOPMENTS
        by_id = {d.get("id"): d for d in DEVELOPMENTS}
        liked_ids = []
        async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "like", "active": True}, {"_id": 0, "entity_id": 1}):
            if s.get("entity_id"):
                liked_ids.append(s["entity_id"])
        liked = [by_id[i] for i in liked_ids if i in by_id]
        if not liked:
            return {"ok": True, "gusto": None, "parecidos": []}

        # Perfil de gusto agregado (capa C).
        amen_pref = {}
        for d in liked:
            for a in _amen_set(d):
                amen_pref[a] = amen_pref.get(a, 0) + 1
        top_amen = sorted(amen_pref, key=amen_pref.get, reverse=True)[:6]
        pm2 = [d.get("price_m2_dev") for d in liked if d.get("price_m2_dev")]
        pm2_avg = sum(pm2) / len(pm2) if pm2 else None
        rec_pref = max((d.get("bedrooms_range") or [0, 0])[1] for d in liked) if liked else None

        # Similaridad de cada dev (no likeado) al gusto.
        out = []
        for d in DEVELOPMENTS:
            if d.get("id") in liked_ids:
                continue
            da = _amen_set(d)
            inter = len(da & set(top_amen))
            amen_sim = inter / max(len(top_amen), 1)
            price_sim = 1.0
            if pm2_avg and d.get("price_m2_dev"):
                price_sim = max(0.0, 1 - abs(d["price_m2_dev"] - pm2_avg) / max(pm2_avg, 1))
            rec_sim = 1.0 if (rec_pref and (d.get("bedrooms_range") or [0, 0])[1] >= rec_pref) else 0.6
            score = amen_sim * 0.5 + price_sim * 0.35 + rec_sim * 0.15
            # de cuál liked se parece más (para "porque te gustó X")
            best_ref = max(liked, key=lambda L: len(_amen_set(L) & da)) if liked else None
            out.append({
                "id": d.get("id"), "name": d.get("name"), "colonia": d.get("colonia"),
                "price_from_display": d.get("price_from_display"), "price_m2_dev": d.get("price_m2_dev"),
                "match_amenidades": [a.replace("_", " ") for a in (da & set(top_amen))][:3],
                "porque": (best_ref or {}).get("name"),
                "sim": round(score * 100),
            })
        out.sort(key=lambda x: x["sim"], reverse=True)
        return {"ok": True,
                "gusto": {"amenidades": [a.replace("_", " ") for a in top_amen], "precio_m2_prom": round(pm2_avg) if pm2_avg else None, "recamaras": rec_pref},
                "parecidos": out[:limit]}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] parecidos fail: {e}")
        return {"ok": True, "gusto": None, "parecidos": []}
