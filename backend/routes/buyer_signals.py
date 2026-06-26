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
         "unit_view", "unit_save", "unit_unsave",
         "zone_intent",   # D · embudo POR UNIDAD + unidad como átomo · zone_intent = perfil declarado en una zona (value=perfil)
         # Conducta de la ficha que alimenta el ENGAGEMENT del comprador → temperatura del lead (antes se rechazaban):
         "lens",          # eligió un lente (vivir/invertir) — intención declarada (value = lente)
         "intent",        # alto intento sobre una unidad — agendar (value = acción)
         "module_open",   # abrió un módulo de análisis — engagement profundo (value = módulo)
         "lead"}          # pidió hablar con Atlax sobre una unidad (value = origen)
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
        fun = defaultdict(lambda: {"vistas": 0, "guardados": 0, "leads": 0})
        async for s in db.buyer_signals.find({"entity_id": dev_id, "type": "unit_view"}, {"_id": 0, "unit_number": 1}):
            if s.get("unit_number"):
                fun[s["unit_number"]]["vistas"] += 1
        async for s in db.buyer_signals.find({"entity_id": dev_id, "type": "unit_save", "active": True}, {"_id": 0, "unit_number": 1}):
            if s.get("unit_number"):
                fun[s["unit_number"]]["guardados"] += 1
        # LEADS por unidad (cierra la granularidad comprador→dev): leads que eligieron esta unidad concreta en la
        # ficha/cotizador (unidad_interes). Antes el embudo solo tenía vistas/guardados; ahora ve hasta el lead por unidad.
        async for ld in db.leads.find({"development_id": dev_id, "unidad_interes": {"$nin": [None, ""]}}, {"_id": 0, "unidad_interes": 1}):
            fun[ld["unidad_interes"]]["leads"] += 1
        out = [{"unidad": k, **v} for k, v in fun.items()]
        out.sort(key=lambda x: (-x["leads"], -x["guardados"], -x["vistas"]))
        return {"ok": True, "unidades": out}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] embudo-unidades: {e}")
        return {"ok": True, "unidades": []}


@router.get("/api/desarrollo/{dev_id}/demanda-zona")
async def demanda_zona(dev_id: str, request: Request):
    """UPGRADE cierra-ciclo comprador→dev: HUECOS de producto en la zona de ESTE desarrollo. Búsquedas COMPLETAS de
    compradores en su colonia que NO encontraron nada que cumpla todo (demanda_insatisfecha) → qué construir / a qué
    precio. El mismo dato que ve el superadmin, aterrizado a la zona del dev."""
    try:
        db = request.app.state.db
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            d = DEVELOPMENTS_BY_ID.get(dev_id) or {}
        except Exception:
            d = {}
        zona = d.get("colonia_id")
        if not zona:
            return {"ok": True, "zona": None, "huecos": []}
        from collections import Counter
        groups: dict = {}
        async for x in db.demanda_insatisfecha.find({"zona": zona}, {"_id": 0, "criterios": 1, "falta_top": 1}):
            c = x.get("criterios") or {}
            key = (c.get("beds"), c.get("max_price"), c.get("min_sqm"))
            g = groups.setdefault(key, {"personas": 0, "falta": Counter()})
            g["personas"] += 1
            for f in (x.get("falta_top") or []):
                g["falta"][f] += 1
        huecos = [{"recamaras": k[0], "presupuesto_max": k[1], "m2_min": k[2], "personas": g["personas"],
                   "lo_que_mas_falta": [f for f, _ in g["falta"].most_common(3)]}
                  for k, g in groups.items()]
        huecos.sort(key=lambda h: -h["personas"])
        return {"ok": True, "zona": zona, "zona_nombre": d.get("colonia"), "huecos": huecos[:8]}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] demanda-zona fail: {e}")
        return {"ok": True, "zona": None, "huecos": []}


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
    unit_number: Optional[str] = None  # unidad concreta que eligió en la ficha
    lens: Optional[str] = None         # vivir | invertir (lente de la ficha)
    contexto: Optional[str] = None     # respuesta clave / escenario — lo que la UI le promete al asesor


async def compute_engagement(db, visitor_id: str) -> dict:
    """ENGAGEMENT del comprador desde su conducta REAL (buyer_signals) → score 0-100 + temperatura + factores
    explicables. Es lo que hace que el asesor priorice por INTERÉS real, no por orden de llegada. FAIL-OPEN.
    Pesos: del compromiso más fuerte (guardar/agendar una unidad) al más leve (ver). Cada tipo capado para no
    inflar con repeticiones; bonus leve por tiempo total. Reusable por create_buyer_lead y por el detalle del asesor."""
    counts: dict = {}
    dwell_ms = 0
    try:
        async for row in db.buyer_signals.aggregate([
            {"$match": {"visitor_id": visitor_id, "active": {"$ne": False}}},
            {"$group": {"_id": "$type", "n": {"$sum": 1}, "dwell": {"$sum": {"$ifNull": ["$dwell_ms", 0]}}}},
        ]):
            counts[str(row.get("_id"))] = int(row.get("n") or 0)
            dwell_ms += int(row.get("dwell") or 0)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[engagement] agg fail-open: {e}")
        return {"score": 0, "temperatura": "frio", "factores": []}

    def cn(t):
        return int(counts.get(t, 0))
    # (tipo, peso por unidad, tope, etiqueta legible para el asesor)
    pesos = [
        ("unit_save",   25, 50, lambda c: f"Guardó {c} unidad{'es' if c > 1 else ''}"),
        ("intent",      20, 40, lambda c: "Pidió agendar una visita"),
        ("like",        12, 36, lambda c: f"Le gustaron {c} desarrollo{'s' if c > 1 else ''}"),
        ("compare",     10, 20, lambda c: "Comparó propiedades"),
        ("lead",         8, 16, lambda c: "Habló con el asistente (Atlax)"),
        ("unit_view",    6, 30, lambda c: f"Vio {c} unidad{'es' if c > 1 else ''} a detalle"),
        ("module_open",  5, 25, lambda c: f"Abrió {c} análisis a fondo"),
        ("ficha_view",   3, 21, lambda c: f"Vio {c} ficha{'s' if c > 1 else ''}"),
        ("lens",         4,  8, lambda c: "Definió para qué la quiere"),
    ]
    score, factores = 0, []
    for t, w, cap, label in pesos:
        c = cn(t)
        if c <= 0:
            continue
        score += min(c * w, cap)
        factores.append(label(c))
    if dwell_ms >= 60000:  # bonus por tiempo: 1 pt/min, tope 10
        mins = round(dwell_ms / 60000)
        score += min(mins, 10)
        factores.append(f"~{mins} min explorando")
    score = max(0, min(100, score))
    temp = "caliente" if score >= 55 else ("tibio" if score >= 25 else "frio")
    return {"score": score, "temperatura": temp, "factores": factores[:6]}


async def create_buyer_lead(db, visitor_id, name=None, email=None, phone=None, dev_id=None, source="marketplace_save",
                            unit_number=None, lens=None, contexto=None):
    """E3 · Crea (o ACTUALIZA si ya existe) el lead del comprador en un momento de ALTO INTENTO. Engancha su histórico
    anónimo (búsquedas/likes/vistas), lo ASIGNA a la casa, lo ESPEJA al CRM del asesor y baja sus favoritos al tablero.
    IDEMPOTENTE por visitor_id → un comprador = UN lead; varias acciones de alto intento solo lo enriquecen (sin
    duplicar). Temperatura por CONDUCTA (mucha actividad = caliente). Devuelve (lead_id, house_inm)."""
    from datetime import datetime as _dt
    import uuid as _u
    # 1. Perfil: el último marketplace_search de este visitor (lo que busca de verdad).
    perfil = await db.marketplace_searches.find_one(
        {"visitor_id": visitor_id}, {"_id": 0}, sort=[("created_at_dt", -1)]) or {}
    # 2. Histórico de conducta: qué likeó y qué vio (capa C/D).
    liked, viewed = [], []
    async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "like", "active": True}, {"_id": 0, "entity_id": 1}):
        if s.get("entity_id"):
            liked.append(s["entity_id"])
    async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "ficha_view"}, {"_id": 0, "entity_id": 1}).limit(50):
        if s.get("entity_id") and s["entity_id"] not in viewed:
            viewed.append(s["entity_id"])
    if dev_id and dev_id not in liked:
        viewed.insert(0, dev_id)
    # Temperatura por CONDUCTA real: engagement de TODAS sus señales (guardó/agendó/abrió análisis/vio unidades…) →
    # el asesor prioriza por interés real, no por orden de llegada. Guardamos score + factores explicables.
    engagement = await compute_engagement(db, visitor_id)
    temperatura = engagement["temperatura"]
    _eng = {"engagement_score": engagement["score"], "engagement_factores": engagement["factores"]}
    profile = {
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
    }
    now = _dt.utcnow()
    # development_id = el desarrollo del que se registró (o el más relevante que vio) → el DEV filtra TODO por este campo;
    # sin él, el lead existe pero el dev NUNCA lo ve en su cockpit/dashboard ni cuenta para su KPI de demanda.
    development_id = dev_id or (viewed[0] if viewed else None)
    # contexto que la ficha PROMETE al asesor (unidad/lente/escenario) — solo lo que llegó, no pisa lo previo con None.
    _ctx = {k: v for k, v in {"development_id": development_id, "unidad_interes": unit_number,
                              "lente": lens, "contexto_registro": contexto}.items() if v}
    # 3. ¿Ya existe lead de este visitor? → ACTUALIZA (no dupliques). Si no, créalo asignado a la casa.
    existing = await db.leads.find_one({"visitor_id": visitor_id}, {"_id": 0, "id": 1, "contact": 1})
    if existing:
        lead_id = existing["id"]
        c = existing.get("contact") or {}
        contact = {"name": (name[:120] if name else None) or c.get("name"),
                   "email": email or c.get("email"), "phone": phone or c.get("phone")}
        await db.leads.update_one({"id": lead_id}, {"$set": {
            "buyer_profile": profile, "liked_devs": liked, "viewed_devs": viewed[:20],
            "temperatura": temperatura, "contact": contact,
            "last_activity_at": now.isoformat(), "updated_at": now.isoformat(), **_eng, **_ctx}})
        lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
        house_inm = lead.get("inmobiliaria_id")
    else:
        assigned_to, house_inm = None, None
        try:
            from services.lead_bridge import resolve_public_lead_owner
            rid, house_inm = await resolve_public_lead_owner(db, liked, viewed, perfil.get("colonias"))
            assigned_to = rid
        except Exception:
            pass
        lead_id = f"lead_{_u.uuid4().hex[:12]}"
        lead = {
            "id": lead_id, "dev_org_id": "default", "source": f"copiloto_{source}",
            "contact": {"name": (name or "Comprador")[:120], "email": (email or None), "phone": (phone or None)},
            "status": "nuevo", "status_v2": "lead_nuevo", "activo": True, "temperatura": temperatura,
            "assigned_to": assigned_to, "inmobiliaria_id": house_inm,
            "buyer_profile": profile, "liked_devs": liked, "viewed_devs": viewed[:20], "visitor_id": visitor_id,
            "created_at": now.isoformat(), "updated_at": now.isoformat(), "last_activity_at": now.isoformat(),
            "created_by": "_copiloto", **_eng, **_ctx,
        }
        await db.leads.insert_one(dict(lead)); lead.pop("_id", None)
    # 4. Espeja al CRM del asesor (idempotente, aislamiento). Si no se puede aún → mirror_pending (auto-reparable).
    try:
        from services.lead_bridge import mirror_lead_to_asesor_contacto
        if not await mirror_lead_to_asesor_contacto(db, lead):
            await db.leads.update_one({"id": lead_id}, {"$set": {"mirror_pending": True}})
    except Exception:
        await db.leads.update_one({"id": lead_id}, {"$set": {"mirror_pending": True}})
    # 5. Engancha el histórico anónimo al lead (el visitor_id deja de ser anónimo).
    await db.buyer_signals.update_many({"visitor_id": visitor_id}, {"$set": {"lead_id": lead_id}})
    await db.marketplace_searches.update_many({"visitor_id": visitor_id}, {"$set": {"lead_id": lead_id}})
    # 6. LAS DOS CARAS: favoritos (+ citas/notas/unidades) del comprador al tablero del asesor (Ficha360). Fail-open.
    try:
        from routes.favoritos import mirror_favoritos_to_board
        await mirror_favoritos_to_board(db, visitor_id, lead_id)
    except Exception:
        pass
    # 7. El admin de la casa SIEMPRE se entera del lead NUEVO (asignado o por asignar) y puede reasignar. Solo en alta.
    if not existing:
        try:
            from services.lead_bridge import notify_house_admin_new_lead
            await notify_house_admin_new_lead(db, lead, assigned_to=lead.get("assigned_to"))
        except Exception:
            pass
    return lead_id, house_inm


class PromoteIn(BaseModel):
    visitor_id: str
    dev_id: Optional[str] = None
    source: str = "ficha_alto_intento"


@router.post("/api/buyer/promote")
async def promote_buyer(b: PromoteIn, request: Request):
    """ALTO INTENTO vía login: tras autenticarse en un gate de la ficha (agendar/contactar/cotizar/desbloquear), el
    comprador se vuelve lead con su perfil — usa el email/nombre del USUARIO autenticado + su visitor_id. Idempotente
    (create_buyer_lead dedup por visitor). No crea lead si no hay sesión (login casual del header no pasa por aquí)."""
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if not u:
            return {"ok": False, "error": "no auth"}
        db = request.app.state.db
        lead_id, _ = await create_buyer_lead(db, b.visitor_id, name=getattr(u, "name", None),
                                             email=getattr(u, "email", None), dev_id=b.dev_id, source=b.source)
        return {"ok": True, "lead_id": lead_id}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] promote fail: {e}")
        return {"ok": False}


@router.post("/api/buyer/registrar")
async def registrar_lead(b: RegistrarLeadIn, request: Request):
    """E3 · El comprador deja sus datos en un momento de ALTO INTENTO → crea/actualiza el lead (wrapper sobre
    create_buyer_lead). Cierra el triángulo comprador↔asesor↔dev."""
    try:
        db = request.app.state.db
        lead_id, house_inm = await create_buyer_lead(db, b.visitor_id, b.name, b.email, b.phone, b.dev_id, b.source,
                                                      unit_number=b.unit_number, lens=b.lens, contexto=b.contexto)
        return {"ok": True, "lead_id": lead_id, "asignado": "tu inmobiliaria" if house_inm else "asesor"}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] registrar lead fail: {e}")
        return {"ok": False}


def _amen_set(dev):
    return {str(a).strip().lower() for a in (dev.get("amenities") or []) if a}


async def taste_scores(db, visitor_id: str) -> dict:
    """{dev_id: score 0-100} de afinidad al GUSTO del visitante (sus likes). Misma lógica que /parecidos, reutilizable
    para reordenar la búsqueda ('Para ti'). Vacío si no hay likes (→ se cae al orden normal). Fail-open."""
    try:
        from data_developments import DEVELOPMENTS
        by_id = {d.get("id"): d for d in DEVELOPMENTS}
        liked_ids = []
        async for s in db.buyer_signals.find({"visitor_id": visitor_id, "type": "like", "active": True}, {"_id": 0, "entity_id": 1}):
            if s.get("entity_id"):
                liked_ids.append(s["entity_id"])
        liked = [by_id[i] for i in liked_ids if i in by_id]
        if not liked:
            return {}
        amen_pref = {}
        for d in liked:
            for a in _amen_set(d):
                amen_pref[a] = amen_pref.get(a, 0) + 1
        top_amen = set(sorted(amen_pref, key=amen_pref.get, reverse=True)[:6])
        pm2 = [d.get("price_m2_dev") for d in liked if d.get("price_m2_dev")]
        pm2_avg = sum(pm2) / len(pm2) if pm2 else None
        rec_pref = max((d.get("bedrooms_range") or [0, 0])[1] for d in liked)
        scores = {}
        for d in DEVELOPMENTS:
            da = _amen_set(d)
            amen_sim = len(da & top_amen) / max(len(top_amen), 1)
            price_sim = 1.0
            if pm2_avg and d.get("price_m2_dev"):
                price_sim = max(0.0, 1 - abs(d["price_m2_dev"] - pm2_avg) / max(pm2_avg, 1))
            rec_sim = 1.0 if (rec_pref and (d.get("bedrooms_range") or [0, 0])[1] >= rec_pref) else 0.6
            scores[d.get("id")] = round((amen_sim * 0.5 + price_sim * 0.35 + rec_sim * 0.15) * 100)
        return scores
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] taste_scores fail: {e}")
        return {}


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
