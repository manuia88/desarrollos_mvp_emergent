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
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pydantic import BaseModel
from tenant_scope import assert_dev_project   # IDOR: el dev solo ve SU dev_id (no cross-tenant)

log = logging.getLogger("dmx.routes_buyer_signals")
router = APIRouter(tags=["buyer-signals"])

# Inteligencia comercial PRIVADA del dev (embudo por unidad · demanda de zona) = MOAT.
# Cierra la fuga anónima detectada en auditoría de seguridad 2026-06-27: robots/IAs/anónimos NO ven el moat.
_DEV_ROLES = {"developer_admin", "developer_member", "developer_director", "superadmin"}


async def _require_dev(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user or getattr(user, "role", None) not in _DEV_ROLES:
        raise HTTPException(403, "Solo el desarrollador (o superadmin) puede ver esta inteligencia.")
    return user

VALID = {"view", "ficha_view", "like", "unlike", "save", "unsave", "compare", "share", "dwell", "photo_dwell",
         "unit_view", "unit_save", "unit_unsave",
         "zone_intent",   # D · embudo POR UNIDAD + unidad como átomo · zone_intent = perfil declarado en una zona (value=perfil)
         # Conducta de la ficha que alimenta el ENGAGEMENT del comprador → temperatura del lead (antes se rechazaban):
         "lens",          # eligió un lente (vivir/invertir) — intención declarada (value = lente)
         "intent",        # alto intento sobre una unidad — agendar (value = acción)
         "module_open",   # abrió un módulo de análisis — engagement profundo (value = módulo)
         "lead",          # pidió hablar con Atlax sobre una unidad (value = origen)
         # Atlax (superficie LLM) · TODA búsqueda/perfilado/veredicto se registra GRANULAR → aprendizaje + superadmin:
         "atlax_query",   # escribió requisitos en el buscador (meta = filtros parseados + #resultados)
         "atlax_profile", # respondió el perfilador guiado (meta = paso/respuesta o perfil completo)
         "dismiss",       # 👎 descartó una opción (value/meta.reason = fotos·precio·zona·tamaño·amenidad·entrega) = el porqué del NO
         "photo_zoom",    # hizo zoom a una foto (entity_id + value=photo_idx) — interés visual granular
         # El front YA disparaba estos 4; el back los RECHAZABA (tipo inválido) → se perdían. Re-conectados:
         "section_time",  # tiempo en una sección de la ficha (value=sección, seconds, unit_number) — engagement de contenido
         "section_view",  # vio una sección de la ficha (value=sección) — qué contenido capta atención
         "zone_profile",  # declaró su perfil en una zona (meta = familia/primera/vivir + respuestas) — demanda declarada
         "atlax_apartado",  # intentó APARTAR con enganche (meta = credito/enganche) — señal casi-compra, la más caliente
         # Exploración financiera (antes invisible) → intención alta + qué pide en dinero:
         "payment_explore",  # exploró el cotizador/plan de pago (meta = enganche/mensualidad/esquema/plazo)
         "roi_explore"}    # exploró rentabilidad/ROI (meta = escenario/yield/plusvalía) — lente inversionista
_TTL_DAYS = 120
_indexed = {"done": False}


async def _ensure_index(db):
    if _indexed["done"]:
        return
    try:
        await db.buyer_signals.create_index("created_at_dt", expireAfterSeconds=_TTL_DAYS * 86400)
        await db.buyer_signals.create_index([("visitor_id", 1), ("type", 1)])
        await db.buyer_signals.create_index([("entity_id", 1), ("type", 1)])
        # Oportunidad #1: cache del taste · TTL 24h (red de seguridad si nunca se invalida explícitamente)
        await db.visitor_taste_materialized.create_index("visitor_id", unique=True, name="vtm_vid_uniq")
        await db.visitor_taste_materialized.create_index("computed_at_dt", expireAfterSeconds=86400, name="vtm_ttl")
        await db.experiencia_views.create_index("created_at_dt", expireAfterSeconds=_TTL_DAYS * 86400, name="ev_ttl")
        # B1: el flywheel escanea copiloto_closings por ventana de recencia (18m) en cada cierre + cron → índice por fecha
        await db.copiloto_closings.create_index("closed_at_dt", name="cc_closed_at")
        # B4: marketplace_searches NO tenía índices (solo _id) → COLLSCAN en demand-intel/zona-cambios/demanda-mapa/donde-vivir
        await db.marketplace_searches.create_index([("colonia_id", 1), ("created_at_dt", -1)], name="ms_colonia_dt")
        await db.marketplace_searches.create_index([("visitor_id", 1), ("created_at_dt", -1)], name="ms_vid_dt")
        # B4: timeline de señales de un visitante (record_closing 'primera señal' + dwell) — antes solo (visitor_id, type)
        await db.buyer_signals.create_index([("visitor_id", 1), ("created_at_dt", -1)], name="bs_vid_dt")
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
    seconds: Optional[int] = None    # tiempo en una sección (section_time) — engagement de contenido
    meta: Optional[Dict[str, Any]] = None  # granular (Atlax): {recamaras, precio_max, intent, amenidades, n_exact, n_casi, cross_zone…}


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
        from services.ratelimit import client_ip as _c  # SEGURIDAD anti-spoofing (pentest 2026-06-27)
        ip = _c(request)
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
            "seconds": (s.seconds if (isinstance(s.seconds, int) and 0 <= s.seconds <= 86400) else None),
            "ip_hash": hashlib.sha256(f"{ip}:dmx_bs".encode()).hexdigest()[:16] if ip else None,
            "created_at_dt": now,
        }
        # meta granular: se guarda en las señales que la traen (Atlax + perfil de zona + apartado), sanitizado y acotado.
        if s.type in ("atlax_query", "atlax_profile", "dismiss", "zone_profile", "atlax_apartado", "payment_explore", "roi_explore") and isinstance(s.meta, dict):
            clean = {}
            for k, v in list(s.meta.items())[:20]:
                if isinstance(v, (str, int, float, bool)) or v is None:
                    clean[str(k)[:40]] = (v[:120] if isinstance(v, str) else v)
                elif isinstance(v, list):
                    clean[str(k)[:40]] = [str(x)[:60] for x in v[:15]]
            doc["meta"] = clean
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
        # Oportunidad #1: invalida el taste materializado SÓLO cuando la señal cambia el gusto (no en view/dwell de página)
        if s.type in ("like", "unlike", "save", "unsave", "unit_save", "unit_unsave", "dismiss", "photo_dwell", "photo_zoom"):
            try:
                from visitor_taste import invalidate_visitor_taste
                await invalidate_visitor_taste(db, doc["visitor_id"])
            except Exception:  # noqa: BLE001
                pass
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
    user = await _require_dev(request); assert_dev_project(user, dev_id)   # MOAT privado — rol dev + SOLO su dev_id (no anónimo/crawler/cross-tenant)
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
    user = await _require_dev(request); assert_dev_project(user, dev_id)   # MOAT privado — rol dev + SOLO su dev_id (no anónimo/crawler/cross-tenant)
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
            "views": (round(views / 10) * 10) if views >= K else 0,   # k-anon + redondeo: prueba social, no tráfico exacto del dev
            "interes": "alto" if likes >= 10 else "medio" if likes >= K else "bajo",
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] interes fail-open: {e}")
        return {"ok": True, "likes": 0, "saves": 0, "views": 0, "interes": "bajo"}


@router.get("/api/buyer/mi-gusto")
async def mi_gusto(request: Request, visitor_id: str):
    """El GUSTO granular del visitante (cuartos·features·zonas·precio + qué evita) para mostrárselo: 'Atlax ya te
    conoce'. Da VISIBILIDAD al comprador (y lo puede corregir). Anónimo (visitor_id) · fail-open."""
    try:
        from visitor_taste import build_visitor_taste
        return {"ok": True, "gusto": await build_visitor_taste(request.app.state.db, visitor_id)}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] mi-gusto fail-open: {e}")
        return {"ok": True, "gusto": None}


_AMEN_TO_FEAT = {"terraza": "terraza", "balcon": "terraza", "roof garden": "terraza", "roof": "terraza",
                 "vista": "vista_ciudad", "areas verdes": "vista_area_verde", "jardin": "vista_area_verde",
                 "ventanales": "ventanal", "ventanal": "ventanal", "luz": "luz_natural", "luminoso": "luz_natural"}


async def _coldstart_feats(db, visitor_id):
    """#6 cold-start: sin gusto de fotos aún, siembra prefs de FEATURE desde lo que el visitante PIDIÓ en Atlax
    (amenidades → features de foto). Light, fail-open."""
    feats = []
    try:
        async for s in db.buyer_signals.find(
            {"visitor_id": visitor_id, "type": {"$in": ["atlax_query", "atlax_profile"]}},
            {"_id": 0, "meta": 1}).limit(40):
            am = (s.get("meta") or {}).get("amenidades") or []
            if isinstance(am, str):
                am = [am]
            for a in am:
                f = _AMEN_TO_FEAT.get(str(a).strip().lower())
                if f and f not in feats:
                    feats.append(f)
    except Exception:  # noqa: BLE001
        pass
    return feats


@router.get("/api/buyer/experiencia-fotos/{dev_id}")
async def experiencia_fotos(dev_id: str, request: Request, visitor_id: str = ""):
    """P2 ficha-experiencia personalizada: reordena las fotos del dev por el GUSTO del comprador (CUARTO + FEATURE) → el
    recorrido abre por el espacio/atributo que le importa, con caption a su medida. Reusa photo_tagger + visitor_taste.
    Cold-start: siembra de lo que pidió en Atlax. Sin gusto → orden original. Fail-open."""
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(dev_id) or {}
        photos = [p for p in (dev.get("photos") or []) if p]
        if not photos:
            return {"ok": True, "photos": [], "personalized": False}
        from photo_tagger import tag_from_url
        tagged = []
        for u in photos:
            t = tag_from_url(u) or {}
            tagged.append({"url": u, "room": t.get("room") or "interior",
                           "room_label": t.get("room_label") or "Interior", "features": t.get("features") or []})
        db = request.app.state.db
        pref_rooms, pref_feats, basis = [], [], None
        if visitor_id:
            from visitor_taste import get_visitor_taste_cached
            k = ((await get_visitor_taste_cached(db, visitor_id)) or {}).get("keys") or {}
            pref_rooms = k.get("rooms") or []
            pref_feats = k.get("features") or []
            if pref_rooms or pref_feats:
                basis = "gusto"
            else:   # #6 cold-start
                pref_feats = await _coldstart_feats(db, visitor_id)
                if pref_feats:
                    basis = "coldstart"
        personalized = bool(pref_rooms or pref_feats)
        # #5 medir: registra cada experiencia con su flag (personalizada vs estándar) → se cruza con photo_dwell para el lift
        try:
            from datetime import datetime as _dt
            await db.experiencia_views.insert_one({
                "dev_id": dev_id, "visitor_id": visitor_id or None,
                "personalized": personalized, "basis": basis, "created_at_dt": _dt.utcnow(),
            })
        except Exception:  # noqa: BLE001
            pass
        rrank = {r: i for i, r in enumerate(pref_rooms)}
        pfset = set(pref_feats)
        if personalized:   # #1 score: cuarto preferido (peso, decae) + cada FEATURE que ama suma
            def _score(t):
                s = (3.0 - rrank[t["room"]] * 0.4) if t["room"] in rrank else 0.0
                s += sum(1.0 for f in t["features"] if f in pfset)
                return -s
            tagged.sort(key=_score)   # estable
        from visitor_taste import FEAT_LABEL

        def _cap(t):   # #2 caption grounded (solo features detectados)
            mf = [FEAT_LABEL.get(f, f.replace("_", " ")) for f in t["features"] if f in pfset]
            if mf:
                return f"{t['room_label']} · {mf[0]} como buscas"
            if t["room"] in rrank:
                return f"{t['room_label']} — tu espacio favorito"
            return t["room_label"]
        return {
            "ok": True,
            "photos": [t["url"] for t in tagged],
            "rooms": [t["room"] for t in tagged],
            "captions": [(_cap(t) if personalized else t["room_label"]) for t in tagged],
            "personalized": personalized, "basis": basis,
            "pref_rooms": pref_rooms[:5], "pref_features": pref_feats[:5],
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] experiencia-fotos fail-open: {e}")
        return {"ok": True, "photos": [], "personalized": False}


@router.get("/api/buyer/experiencia-parallax/{dev_id}")
async def experiencia_parallax(dev_id: str, request: Request, background: BackgroundTasks, visitor_id: str = ""):
    """P2 #4: parallax 3D LOCAL (gratis) generado en el ORDEN del gusto del comprador. Cacheado por (dev, orden). Listo →
    URL; si no → lo genera en BACKGROUND y devuelve ready:false (la experiencia usa el default esta vez, el personalizado
    la próxima visita). Mismo orden que experiencia-fotos (cuarto + feature). Fail-open."""
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        photos = [p for p in ((DEVELOPMENTS_BY_ID.get(dev_id) or {}).get("photos") or []) if p]
        if len(photos) < 2:
            return {"ok": True, "ready": False, "personalized": False}
        db = request.app.state.db
        from photo_tagger import tag_from_url
        tagged = []
        for u in photos:
            t = tag_from_url(u) or {}
            tagged.append({"url": u, "room": t.get("room") or "interior", "features": t.get("features") or []})
        pref_rooms, pref_feats = [], []
        if visitor_id:
            from visitor_taste import get_visitor_taste_cached
            k = ((await get_visitor_taste_cached(db, visitor_id)) or {}).get("keys") or {}
            pref_rooms = k.get("rooms") or []
            pref_feats = k.get("features") or []
            if not (pref_rooms or pref_feats):
                pref_feats = await _coldstart_feats(db, visitor_id)
        personalized = bool(pref_rooms or pref_feats)
        if personalized:
            rrank = {r: i for i, r in enumerate(pref_rooms)}
            pfset = set(pref_feats)
            tagged.sort(key=lambda t: -((3.0 - rrank[t["room"]] * 0.4) if t["room"] in rrank else 0.0)
                        - sum(1.0 for f in t["features"] if f in pfset))
        urls = [t["url"] for t in tagged][:6]
        from parallax_engine import cached_url, generate
        url = cached_url(dev_id, urls)
        if url:
            return {"ok": True, "ready": True, "url": url, "personalized": personalized}
        # #8 seguridad: la generación es CPU-CARA → rate-limit por IP (anti-abuso). Si se pasa, NO genera (usa el default
        # esta vez, no rompe nada). Reusa services.ratelimit.
        from services.ratelimit import allow, client_ip
        if allow("parallax_gen", client_ip(request), limit=5, window=300):
            background.add_task(generate, dev_id, urls)   # generación local en background (gratis)
        return {"ok": True, "ready": False, "personalized": personalized}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] experiencia-parallax fail-open: {e}")
        return {"ok": True, "ready": False, "personalized": False}


# ─── "¿Dónde vivirías feliz?" (cuña brújula · lente espacial del comprador) ──────
# El espejo de comprador de la tarjeta del founder: dado el GUSTO (zonas que te gustan · presupuesto · qué evitas),
# rankea las colonias que te quedan por calidad de vida + presupuesto + afinidad de zona. Reusa visitor_taste + db.colonias.
_VIDA_W = {"vida": 0.30, "seguridad": 0.25, "movilidad": 0.18, "comercio": 0.12, "educacion": 0.10, "riesgo": -0.15}


def _vida_score(sr):
    if not isinstance(sr, dict):
        return 50.0
    s = wsum = 0.0
    for k, w in _VIDA_W.items():
        v = sr.get(k)
        if v is None:
            continue
        s += (v if w > 0 else (100 - v)) * abs(w)
        wsum += abs(w)
    return round(s / wsum, 1) if wsum else 50.0


def _budget_fit(pm2, target):
    if not pm2 or not target:
        return 0.6
    r = pm2 / target
    return min(1.0, 0.7 + 0.3 * r) if r <= 1.0 else max(0.0, 1.0 - (r - 1.0) * 1.5)


def _donde_why(r, target, liked_tiers):
    sr = r.get("vida") or {}
    bits = []
    if target and r.get("precio_pm2") and r["precio_pm2"] <= target * 1.05:
        bits.append("dentro de tu presupuesto")
    if r.get("tier") in liked_tiers:
        bits.append("zona como las que te gustan")
    for k, lbl in (("seguridad", "segura"), ("movilidad", "bien conectada"), ("comercio", "con todo cerca"), ("educacion", "buenas escuelas")):
        if (sr.get(k) or 0) >= 65:
            bits.append(lbl)
            break
    return " · ".join(bits[:3]) or "buena calidad de vida"


@router.get("/api/buyer/donde-vivir")
async def donde_vivir(request: Request, visitor_id: str = "", limit: int = 8):
    """Mapa personal '¿dónde vivirías feliz?': rankea colonias por calidad de vida + tu presupuesto + afinidad con las
    zonas que te gustan (excluye las que evitas). Reusa visitor_taste + db.colonias (scores reales). Fail-open."""
    try:
        from services.ratelimit import allow, client_ip
        if not allow("donde_vivir", client_ip(request), limit=30, window=60):   # #8 anti-abuso (recorre 2788 colonias)
            return {"ok": True, "colonias": []}
        db = request.app.state.db
        liked, evita, techo, basis = [], set(), None, None
        if visitor_id:
            from visitor_taste import get_visitor_taste_cached
            tp = await get_visitor_taste_cached(db, visitor_id) or {}
            k = tp.get("keys") or {}
            liked = [str(z).lower() for z in (k.get("zonas_gustan") or [])]
            evita = {str(z).lower() for z in (k.get("zonas_evita") or [])}
            techo = tp.get("precio_techo")
            if liked or techo:
                basis = "gusto"
            else:
                # #4 cold-start: sin gusto aún → personaliza desde su ÚLTIMA BÚSQUEDA (zona+presupuesto que escribió)
                try:
                    from services.visitor_identity import resolve_visitors
                    vids = await resolve_visitors(db, visitor_id) or [visitor_id]
                except Exception:  # noqa: BLE001
                    vids = [visitor_id]
                s = await db.marketplace_searches.find_one(
                    {"visitor_id": {"$in": vids}}, {"_id": 0, "precio_max": 1, "colonias": 1}, sort=[("created_at_dt", -1)])
                if s:
                    techo = s.get("precio_max") or techo
                    liked = [str(z).lower() for z in (s.get("colonias") or [])]
                    if liked or techo:
                        basis = "coldstart"
        target_pm2, liked_tiers = None, set()
        if liked:
            pms = []
            async for c in db.colonias.find({"id": {"$in": liked}}, {"_id": 0, "precio_pm2": 1, "tier": 1}):
                if c.get("precio_pm2"):
                    pms.append(c["precio_pm2"])
                if c.get("tier"):
                    liked_tiers.add(c["tier"])
            if pms:
                target_pm2 = sorted(pms)[len(pms) // 2]
        if not target_pm2 and techo:
            target_pm2 = techo / 80.0
        rows = []
        async for c in db.colonias.find(
            {"scores_reales": {"$exists": True}},
            {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "tier": 1, "precio_pm2": 1, "scores_reales": 1}):
            cid = c.get("id")
            if not cid or cid in evita:
                continue
            sr = c.get("scores_reales") or {}
            vida = _vida_score(sr)
            budget = _budget_fit(c.get("precio_pm2"), target_pm2)
            tier_m = 1.0 if (c.get("tier") in liked_tiers) else 0.55
            score = 0.45 * vida + 0.35 * (budget * 100) + 0.20 * (tier_m * 100)
            rows.append({"id": cid, "nombre": c.get("name") or cid, "alcaldia": c.get("alcaldia"),
                         "score": round(score), "precio_pm2": c.get("precio_pm2"), "tier": c.get("tier"), "vida": sr})
        rows.sort(key=lambda r: -r["score"])
        top = rows[:max(1, min(int(limit or 8), 20))]
        for r in top:
            r["por_que"] = _donde_why(r, target_pm2, liked_tiers)
            r.pop("vida", None)
        return {"ok": True, "colonias": top, "personalizado": bool(liked or techo), "basis": basis,
                "presupuesto_m2": round(target_pm2) if target_pm2 else None}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] donde-vivir fail-open: {e}")
        return {"ok": True, "colonias": []}


@router.get("/api/buyer/demanda-mapa")
async def demanda_mapa(request: Request, visitor_id: str = ""):
    """L55 · lente ESPACIAL del comprador — MAPA de calor de la DEMANDA del mercado por colonia (dónde está buscando la
    gente) y resalta las zonas que A TI te laten (de tu última búsqueda). Reusa la geometría (data_seed COLONIAS +
    _build_polygon de dev_batch6) y la señal anónima y agregada de marketplace_searches. Devuelve un FeatureCollection
    con el MISMO shape que el heatmap del dev → reusa el componente de mapa. Público · rate-limit · anónimo."""
    import datetime as _dt
    from collections import Counter
    try:
        from services.ratelimit import allow, client_ip
        if not allow("demanda_mapa", client_ip(request), limit=20, window=60):
            return {"type": "FeatureCollection", "features": []}
        db = request.app.state.db
        from data_seed import COLONIAS
        from routes.dev_batch6 import _build_polygon

        since = _dt.datetime.utcnow() - _dt.timedelta(days=90)
        demanda = Counter()
        try:
            async for r in db.marketplace_searches.find({"created_at_dt": {"$gte": since}},
                                                        {"_id": 0, "colonia_id": 1, "colonias": 1}):
                zs = [str(z).strip().lower() for z in (r.get("colonias") or []) if z]
                if not zs and r.get("colonia_id"):
                    zs = [str(r["colonia_id"]).strip().lower()]
                for z in zs:
                    demanda[z] += 1
        except Exception:  # noqa: BLE001
            pass

        mine = set()
        if visitor_id:
            try:
                from services.visitor_identity import resolve_visitors
                vids = await resolve_visitors(db, visitor_id)
                s = await db.marketplace_searches.find_one({"visitor_id": {"$in": vids}}, {"_id": 0, "colonias": 1},
                                                           sort=[("created_at_dt", -1)])
                for z in ((s or {}).get("colonias") or []):
                    mine.add(str(z).strip().lower())
            except Exception:  # noqa: BLE001
                pass

        max_raw = max(demanda.values()) if demanda else 1
        features = []
        for col in COLONIAS:
            cid = col.get("id")
            key = str(cid).strip().lower()
            raw = demanda.get(key, 0)
            if raw == 0 and key not in mine:
                continue   # mapa limpio: solo colonias con demanda real o que le laten al comprador
            features.append({
                "type": "Feature",
                "properties": {
                    "colonia_id": cid, "colonia": col.get("name", cid), "alcaldia": col.get("alcaldia"),
                    "searches_count": raw, "demand_score": round(100 * raw / max_raw, 1) if max_raw else 0,
                    "mine": key in mine, "center": col.get("center", [-99.16, 19.41]),
                },
                "geometry": {"type": "Polygon", "coordinates": [_build_polygon(col)]},
            })
        top = sorted(features, key=lambda f: -f["properties"]["demand_score"])[:8]
        return {"type": "FeatureCollection", "features": features,
                "top": [{"colonia_id": f["properties"]["colonia_id"], "colonia": f["properties"]["colonia"],
                         "demand_score": f["properties"]["demand_score"], "mine": f["properties"]["mine"]} for f in top]}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] demanda-mapa fail-open: {e}")
        return {"type": "FeatureCollection", "features": []}


@router.get("/api/desarrollo/{dev_id}/percepcion")
async def percepcion_desarrollo(dev_id: str, request: Request):
    """Cómo VEN los compradores este desarrollo (SOLO el dev dueño): interés + EL PORQUÉ DEL NO (rechazo por motivo) +
    GAP DE PRESENTACIÓN (si lo rechazan sobre todo por las FOTOS → el producto encaja pero la imagen MATA → Studio).
    Reusa las señales like/save/dismiss de Atlax. MOAT privado: rol dev + su propio dev_id (no cross-tenant)."""
    user = await _require_dev(request); assert_dev_project(user, dev_id)
    try:
        from collections import Counter
        db = request.app.state.db
        likes = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "like", "active": True})
        saves = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "save", "active": True})
        quickviews = await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "view", "value": "atlax_quickview"})
        motivos, total = Counter(), 0
        async for x in db.buyer_signals.find({"entity_id": dev_id, "type": "dismiss"}, {"_id": 0, "value": 1}):
            r = (x.get("value") or "").strip().lower()
            if r:
                motivos[r] += 1; total += 1
        rechazo_por_motivo = [{"motivo": m, "veces": n} for m, n in motivos.most_common(8)]
        fotos = motivos.get("fotos", 0)
        pct_fotos = round(100 * fotos / total) if total else 0
        gap = total >= 3 and pct_fotos >= 40
        reco = None
        if gap:
            reco = "Tu producto encaja con la demanda, pero las FOTOS están frenando a los compradores. Mejora tus renders con Studio."
        elif total >= 3 and rechazo_por_motivo:
            reco = f"El motivo #1 por el que descartan este desarrollo es: {rechazo_por_motivo[0]['motivo']}."
        return {"ok": True, "interes": {"likes": likes, "guardados": saves, "vistas_rapidas": quickviews},
                "rechazos": total, "rechazo_por_motivo": rechazo_por_motivo, "gap_presentacion": gap,
                "pct_fotos": pct_fotos, "recomendacion": reco}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] percepcion fail: {e}")
        return {"ok": True, "interes": {}, "rechazos": 0, "rechazo_por_motivo": [], "gap_presentacion": False, "recomendacion": None}


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
        from pymongo.errors import DuplicateKeyError
        try:
            await db.leads.insert_one(dict(lead)); lead.pop("_id", None)
        except DuplicateKeyError:
            # CONCURRENCIA: otra request del MISMO visitor ganó la carrera (índice único parcial leads_vid_uniq) → reusa
            # ese lead (idempotente). De aquí se trata como 'ya existía': mismo lead_id, espejo idempotente, sin doble-aviso.
            existing = await db.leads.find_one({"visitor_id": visitor_id}, {"_id": 0})
            if not existing:
                raise
            lead, lead_id = existing, existing["id"]
    # 4. Espeja al CRM del asesor (idempotente, aislamiento). Si no se puede aún → mirror_pending (auto-reparable).
    try:
        from services.lead_bridge import mirror_lead_to_asesor_contacto
        if not await mirror_lead_to_asesor_contacto(db, lead):
            await db.leads.update_one({"id": lead_id}, {"$set": {"mirror_pending": True}})
    except Exception:
        await db.leads.update_one({"id": lead_id}, {"$set": {"mirror_pending": True}})
    # 4.5 · PROPAGACIÓN/AUDITORÍA: el superadmin ve la creación/ruteo del lead vía MARKETPLACE (antes audit-dark — el
    # camino de lead más común no dejaba rastro). Actor 'marketplace' (system, by_ai=False) → distinto de staff humano
    # y de agente IA. Fail-open.
    try:
        from audit_log import log_mutation
        await log_mutation(db, {"user_id": "marketplace", "role": "system", "name": "Marketplace"},
                           ("update" if existing else "create"), "lead", entity_id=lead_id,
                           after={"assigned_to": lead.get("assigned_to"), "source": lead.get("source"),
                                  "temperatura": temperatura, "dev": dev_id}, by_ai=False)
    except Exception:
        pass
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
    # 8. IDENTIDAD: pega este visitor_id a la persona (email/teléfono) → su gusto/lista la siguen cross-device.
    try:
        from services.visitor_identity import link as _link_visitor
        await _link_visitor(db, email, phone, visitor_id)
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
    # SEGURIDAD (pentest): rate-limit anti inyección/spam de leads (sin esto cualquiera inundaba el CRM del asesor).
    from services.ratelimit import allow, client_ip
    if not allow("buyer_registrar", client_ip(request), 8, 60):
        raise HTTPException(429, "Demasiados registros seguidos. Intenta en un momento.")
    try:
        db = request.app.state.db
        lead_id, house_inm = await create_buyer_lead(db, b.visitor_id, b.name, b.email, b.phone, b.dev_id, b.source,
                                                      unit_number=b.unit_number, lens=b.lens, contexto=b.contexto)
        return {"ok": True, "lead_id": lead_id, "asignado": "tu inmobiliaria" if house_inm else "asesor"}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] registrar lead fail: {e}")
        return {"ok": False}


class ClaimIn(BaseModel):
    visitor_id: str


@router.post("/api/buyer/claim")
async def claim_visitor(b: ClaimIn, request: Request):
    """U1 cross-device para usuario LOGUEADO: vincula este visitor_id a la identidad del usuario autenticado
    (email/teléfono) → su gusto y su lista lo siguen en CUALQUIER dispositivo donde inicie sesión, sin tener que
    re-registrarse. Idempotente, fail-open. Sin sesión = no-op (200, claimed:false), no rompe el flujo anónimo."""
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if not u or not b.visitor_id:
            return {"ok": True, "claimed": False}
        db = request.app.state.db
        from services.visitor_identity import link
        await link(db, getattr(u, "email", None), getattr(u, "phone", None), b.visitor_id)
        # Cierre de ciclo (auditoría Fix #2): si el usuario ya tiene un lead, refresca su tablero con los favoritos
        # recién VINCULADOS → el asesor ve la actividad real, no un lead "vacío". mirror_favoritos_to_board ya une
        # todos los visitor_id de la persona (resolve_visitors). FAIL-OPEN.
        try:
            uid = getattr(u, "user_id", None); uemail = getattr(u, "email", None)
            lead = None
            if uid or uemail:
                lead = await db.leads.find_one(
                    {"$or": [q for q in ({"user_id": uid} if uid else None, {"email": uemail} if uemail else None) if q]},
                    {"_id": 0, "id": 1},
                )
            if lead and lead.get("id"):
                from routes.favoritos import mirror_favoritos_to_board
                await mirror_favoritos_to_board(db, b.visitor_id, lead["id"])
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "claimed": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[buyer_signals] claim fail-open: {e}")
        return {"ok": True, "claimed": False}


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
