"""Phase 4 Batch 0 — Public marketplace routes extracted from server.py.
Endpoints: /api/colonias/*, /api/properties/*, /api/developments/*, /api/developers/*,
           /api/search/*, /api/health
Backward-compat: same URLs, same response shape.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

from data_seed import COLONIAS as SEED_COLONIAS, COLONIAS_BY_ID, PROPERTIES as SEED_PROPERTIES
from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID, DEVELOPERS, DEVELOPERS_BY_ID

router = APIRouter(tags=["public"])

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
DMX_FALLBACK_WHATSAPP = os.environ.get("DMX_FALLBACK_WHATSAPP", "+525512345678")

# ─── Dev overlay cache (shared singleton via module-level dict) ────────────────
_dev_overlay_cache: dict = {}


def invalidate_dev_overlay_cache(dev_id: str = None):
    if dev_id:
        _dev_overlay_cache.pop(dev_id, None)
    else:
        _dev_overlay_cache.clear()


async def _ensure_overlay_loaded(dev_id: str, db=None):
    if dev_id in _dev_overlay_cache:
        return _dev_overlay_cache[dev_id]
    if db is None:
        return {}
    try:
        o = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0}) or {}
    except Exception:
        o = {}
    _dev_overlay_cache[dev_id] = o
    return o


def _apply_overlay(d: dict) -> dict:
    overlay = _dev_overlay_cache.get(d["id"]) or {}
    fields = overlay.get("fields") or {}
    units_overlay = overlay.get("units_overlay") or []
    if not fields and not units_overlay:
        return d
    out = dict(d)
    PRIVATE = {"predial_private", "fiscal_private"}
    for k, v in fields.items():
        if k in PRIVATE:
            continue
        out[k] = v
    if units_overlay:
        out["units"] = units_overlay
    out["_overlay_synced_fields"] = sorted(k for k in fields.keys() if k not in PRIVATE)
    if overlay.get("last_auto_sync_at"):
        ts = overlay["last_auto_sync_at"]
        out["last_auto_sync_at"] = ts.isoformat() if hasattr(ts, "isoformat") else ts
    return out


def _dev_public(d: dict, include_units: bool = False) -> dict:
    d = _apply_overlay(d)
    out = {k: v for k, v in d.items() if k != "_id" and (include_units or k != "units")}
    if not include_units:
        out["units_sample"] = d.get("units", [])[:0]
    dev = DEVELOPERS_BY_ID.get(d["developer_id"])
    if dev:
        out["developer"] = {
            "id": dev["id"], "name": dev["name"],
            "founded_year": dev["founded_year"],
            "projects_delivered": dev["projects_delivered"],
            "logo_hue": dev.get("logo_hue", 231),
        }
    out["contact_phone"] = d.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    return out


def _colonia_public(c: dict) -> dict:
    return {k: v for k, v in c.items() if k != "_id"}


def _iso_week_tag() -> str:
    now = datetime.now(timezone.utc)
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


# ─── Colonias ──────────────────────────────────────────────────────────────────
@router.get("/api/colonias")
async def get_colonias():
    return [_colonia_public(c) for c in SEED_COLONIAS]


@router.get("/api/colonias/{colonia_id}")
async def get_colonia(colonia_id: str):
    c = COLONIAS_BY_ID.get(colonia_id)
    if not c:
        raise HTTPException(404, "Colonia no encontrada")
    return _colonia_public(c)


@router.get("/api/colonias/{colonia_id}/propiedades")
async def get_colonia_propiedades(colonia_id: str):
    if colonia_id not in COLONIAS_BY_ID:
        raise HTTPException(404, "Colonia no encontrada")
    return [p for p in SEED_PROPERTIES if p["colonia_id"] == colonia_id]


# ─── Properties ───────────────────────────────────────────────────────────────
@router.get("/api/properties")
async def get_properties(
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    tipo: Optional[str] = None,
    tag: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    sort: Optional[str] = "recent",
    limit: int = 100,
):
    results = list(SEED_PROPERTIES)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [p for p in results if p["colonia_id"].lower() in cset]
    if min_price is not None:
        results = [p for p in results if p["price"] >= min_price]
    if max_price is not None:
        results = [p for p in results if p["price"] <= max_price]
    if min_sqm is not None:
        results = [p for p in results if p["sqm"] >= min_sqm]
    if max_sqm is not None:
        results = [p for p in results if p["sqm"] <= max_sqm]
    if beds is not None:
        results = [p for p in results if p["beds"] >= beds]
    if baths is not None:
        results = [p for p in results if p["baths"] >= baths]
    if parking is not None:
        results = [p for p in results if p["parking"] >= parking]
    if tipo:
        results = [p for p in results if p["tipo"] == tipo]
    if tag:
        results = [p for p in results if p["tag"] == tag]
    if amenity:
        aset = set(amenity)
        results = [p for p in results if aset.issubset(set(p.get("amenities", [])))]
    if sort == "price_asc":
        results.sort(key=lambda p: p["price"])
    elif sort == "price_desc":
        results.sort(key=lambda p: -p["price"])
    elif sort == "sqm_desc":
        results.sort(key=lambda p: -p["sqm"])
    return results[:limit]


@router.get("/api/properties/{prop_id}")
async def get_property(prop_id: str):
    for p in SEED_PROPERTIES:
        if p["id"] == prop_id:
            return p
    raise HTTPException(404, "Propiedad no encontrada")


@router.get("/api/properties/{prop_id}/similares")
async def get_property_similares(prop_id: str):
    target = next((p for p in SEED_PROPERTIES if p["id"] == prop_id), None)
    if not target:
        raise HTTPException(404, "Propiedad no encontrada")
    pool = [p for p in SEED_PROPERTIES if p["id"] != prop_id]

    def score(p):
        s = 0
        if p["colonia_id"] == target["colonia_id"]:
            s -= 100
        s += abs(p["price"] - target["price"]) / 1_000_000
        s += abs(p["sqm"] - target["sqm"]) / 10
        return s

    pool.sort(key=score)
    return pool[:3]


# ─── Property briefing (Claude) ───────────────────────────────────────────────
BRIEFING_SYSTEM = (
    "Eres el analista estrella de DesarrollosMX. Generas briefings contextuales sobre colonias de CDMX "
    "para compradores que están a punto de tomar una decisión. Tu texto se comparte por WhatsApp, así que es "
    "breve, concreto y accionable. Reglas estrictas: máximo 280 caracteres, un solo párrafo, sin emoji, sin "
    "markdown, sin viñetas, sin saludos. Cierra con una recomendación clara. Tono profesional y directo."
)


@router.post("/api/properties/{prop_id}/briefing")
async def generate_property_briefing(prop_id: str, request: Request):
    db = request.app.state.db
    p = next((x for x in SEED_PROPERTIES if x["id"] == prop_id), None)
    if not p:
        raise HTTPException(404, "Propiedad no encontrada")
    c = COLONIAS_BY_ID.get(p["colonia_id"])
    if not c:
        raise HTTPException(404, "Colonia no encontrada para la propiedad")
    week = _iso_week_tag()
    cache_key = f"{prop_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}
    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {})
        prompt = (
            f"Propiedad: {p['titulo']}, {p['sqm']} m², {p['beds']} rec, precio {p['price_display']}.\n"
            f"Colonia: {c['name']}. Momentum: {c.get('momentum', 'n/a')}.\n"
            f"Scores -> Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}, Comercio: {scores.get('comercio', 0)}.\n"
            "Genera el briefing en un solo párrafo de máximo 280 caracteres en español MX."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"brief_{prop_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
        # Budget tracking for public briefing AI
        if text:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(db, "public", "claude-sonnet-4-5-20250929", 0,
                                    "property_briefing", tokens_in=len(prompt)//4, tokens_out=len(text)//4)
            except Exception:
                pass
    except Exception:
        text = None
    if not text:
        scores = c.get("scores", {})
        text = (
            f"{c['name']} marca {c.get('momentum', '+0%')} a 24m. "
            f"Scores: Vida {scores.get('vida', 0)}, Seg {scores.get('seguridad', 0)}."
        )[:280]
    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "property_id": prop_id, "week": week, "text": text,
                  "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}


# ─── Developments ──────────────────────────────────────────────────────────────
@router.get("/api/developments")
async def list_developments(
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    stage: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    featured: Optional[bool] = None,
    sort: Optional[str] = "recent",
    limit: int = 100,
):
    results = list(DEVELOPMENTS)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [d for d in results if d["colonia_id"].lower() in cset]
    if min_price is not None:
        results = [d for d in results if d["price_to"] >= min_price]
    if max_price is not None:
        results = [d for d in results if d["price_from"] <= max_price]
    if min_sqm is not None:
        results = [d for d in results if d["m2_range"][1] >= min_sqm]
    if max_sqm is not None:
        results = [d for d in results if d["m2_range"][0] <= max_sqm]
    if beds is not None:
        results = [d for d in results if d["bedrooms_range"][1] >= beds]
    if baths is not None:
        results = [d for d in results if d["bathrooms_range"][1] >= baths]
    if parking is not None:
        results = [d for d in results if d["parking_range"][1] >= parking]
    if stage:
        results = [d for d in results if d["stage"] == stage]
    if amenity:
        aset = set(amenity)
        results = [d for d in results if aset.issubset(set(d.get("amenities", [])))]
    if featured is not None:
        results = [d for d in results if d["featured"] == featured]
    if sort == "price_asc":
        results.sort(key=lambda d: d["price_from"])
    elif sort == "price_desc":
        results.sort(key=lambda d: -d["price_from"])
    elif sort == "sqm_desc":
        results.sort(key=lambda d: -d["m2_range"][1])
    return [_dev_public(d) for d in results[:limit]]


@router.get("/api/developments/{dev_id}")
async def get_development(dev_id: str, request: Request):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    await _ensure_overlay_loaded(dev_id, request.app.state.db)
    return _dev_public(d, include_units=True)


@router.get("/api/developments/{dev_id}/units")
async def list_dev_units(
    dev_id: str, request: Request,
    status: Optional[str] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    await _ensure_overlay_loaded(dev_id, request.app.state.db)
    d = _apply_overlay(d)
    units = list(d.get("units", []))
    if status:
        units = [u for u in units if u.get("status") == status]
    if beds is not None:
        units = [u for u in units if (u.get("bedrooms") or 0) >= beds]
    if baths is not None:
        units = [u for u in units if (u.get("bathrooms") or 0) >= baths]
    if parking is not None:
        units = [u for u in units if (u.get("parking_spots") or 0) >= parking]
    return units


@router.get("/api/developments/{dev_id}/compliance-badge")
async def get_compliance_badge(dev_id: str, request: Request):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    db = request.app.state.db
    extracted_count = await db.di_documents.count_documents({"development_id": dev_id, "status": "extracted"})
    scores = {}
    for code in ("IE_PROY_RISK_LEGAL", "IE_PROY_COMPLIANCE_SCORE", "IE_PROY_QUALITY_DOCS"):
        s = await db.ie_scores.find_one({"zone_id": dev_id, "code": code}, {"_id": 0})
        if s and not s.get("is_stub"):
            scores[code] = {"value": s.get("value"), "tier": s.get("tier")}
        else:
            scores[code] = None
    overlay = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0, "last_auto_sync_at": 1}) or {}
    last = overlay.get("last_auto_sync_at")
    last_iso = last.isoformat() if last else None
    tier = None
    if extracted_count >= 1 and all(scores[c] is not None for c in scores):
        risk = scores["IE_PROY_RISK_LEGAL"]
        comp = scores["IE_PROY_COMPLIANCE_SCORE"]
        qd = scores["IE_PROY_QUALITY_DOCS"]
        if risk["tier"] == "red":
            tier = None
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 80:
            tier = "green"
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 50:
            tier = "amber"
        else:
            tier = None
    return {
        "development_id": dev_id, "tier": tier,
        "scores": {
            "risk_legal": scores["IE_PROY_RISK_LEGAL"],
            "compliance": scores["IE_PROY_COMPLIANCE_SCORE"],
            "quality_docs": scores["IE_PROY_QUALITY_DOCS"],
        },
        "verified_docs_count": extracted_count,
        "last_update_at": last_iso,
        "label_es": (
            "DMX Verificado · Documentos al día" if tier == "green"
            else ("Documentos parciales · En verificación" if tier == "amber" else None)
        ),
    }


@router.get("/api/developments/{dev_id}/similar")
async def get_similar_developments(dev_id: str):
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")
    pool = [d for d in DEVELOPMENTS if d["id"] != dev_id]
    pool.sort(key=lambda d: (
        -100 if d["colonia_id"] == target["colonia_id"] else 0
    ) + abs(d["price_from"] - target["price_from"]) / 1_000_000)
    return [_dev_public(p) for p in pool[:3]]


@router.get("/api/developments/{dev_id}/rank")
async def get_development_rank(dev_id: str, request: Request):
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")
    peers = [d for d in DEVELOPMENTS if d["colonia_id"] == target["colonia_id"]]
    total = len(peers)
    if total <= 1:
        return {"rank": 1, "total": total, "badge_tier": None, "colonia": target["colonia"]}
    db = request.app.state.db
    peer_ids = [d["id"] for d in peers]
    score_docs = await db.ie_scores.find(
        {"zone_id": {"$in": peer_ids}, "code": "IE_PROY_BADGE_TOP", "is_stub": False, "value": {"$ne": None}},
        {"_id": 0, "zone_id": 1, "value": 1},
    ).to_list(length=50)
    score_by_id = {d["zone_id"]: d["value"] for d in score_docs}
    ranked = sorted(peer_ids, key=lambda i: score_by_id.get(i, -1), reverse=True)
    try:
        rank = ranked.index(dev_id) + 1
    except ValueError:
        rank = total
    has_real_score = dev_id in score_by_id
    pct = rank / total
    if rank == 1 and has_real_score:
        badge_tier = "top"
    elif pct <= 0.30 and has_real_score:
        badge_tier = "high"
    elif has_real_score:
        badge_tier = "mid"
    else:
        badge_tier = None
    return {"rank": rank, "total": total, "badge_tier": badge_tier, "colonia": target["colonia"]}


@router.get("/api/developers/{developer_id}")
async def get_developer(developer_id: str):
    d = DEVELOPERS_BY_ID.get(developer_id)
    if not d:
        raise HTTPException(404, "Desarrolladora no encontrada")
    their_devs = [
        {"id": x["id"], "name": x["name"], "stage": x["stage"], "units_total": x["units_total"]}
        for x in DEVELOPMENTS if x["developer_id"] == developer_id
    ]
    return {**d, "current_developments": their_devs}


@router.post("/api/developments/{dev_id}/briefing")
async def generate_dev_briefing(dev_id: str, request: Request):
    db = request.app.state.db
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    c = COLONIAS_BY_ID.get(d["colonia_id"])
    week = _iso_week_tag()
    cache_key = f"dev_{dev_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}
    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {}) if c else {}
        stage_label = {
            "preventa": "Preventa", "en_construccion": "En construcción",
            "entrega_inmediata": "Entrega inmediata", "exclusiva": "Exclusiva",
        }.get(d["stage"], d["stage"])
        prompt = (
            f"Desarrollo: {d['name']} en {c['name'] if c else d.get('colonia_id', '')}.\n"
            f"Etapa: {stage_label}. Precio desde {d['price_from_display']} hasta {d['price_to_display']}.\n"
            f"Scores Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}. {d['units_available']} unidades disponibles.\n"
            "Genera briefing en máximo 280 caracteres en español MX, un párrafo."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"devbrief_{dev_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
    except Exception:
        text = None
    if not text:
        text = f"{d['name']}: desde {d['price_from_display']}, {d['units_available']} disponibles."[:280]
    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "text": text, "week": week, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}


# ─── AI Search parser ──────────────────────────────────────────────────────────
AI_SEARCH_SYSTEM = (
    "Eres el parser de búsqueda natural de DesarrollosMX para CDMX. Recibes una frase del usuario "
    "y devuelves ESTRICTAMENTE un objeto JSON con los filtros detectables. Schema:\n"
    '{"colonia":[string],"min_price":number,"max_price":number,"min_sqm":number,"max_sqm":number,'
    '"beds":number,"baths":number,"parking":number,"stage":string,"amenity":[string]}\n'
    "Reglas: omite claves sin evidencia. Precios en MXN. '5M' = 5000000."
)


class AISearchIn(BaseModel):
    query: str


@router.post("/api/properties/search-ai")
async def ai_search_parser(payload: AISearchIn, request: Request):
    import json as _json
    db = request.app.state.db
    q = (payload.query or "").strip()
    if not q:
        return {"filters": {}, "query": q, "cached": False}
    cache_key = q.lower()[:500]
    cached = await db.ai_search_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        ts = cached.get("created_at")
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and (datetime.now(timezone.utc) - ts).total_seconds() < 86400:
            return {"filters": cached.get("filters", {}), "query": q, "cached": True}
    parsed = {}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"aisrch_{hash(cache_key) & 0xffffffff}",
            system_message=AI_SEARCH_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=q))
        txt = (raw or "").strip()
        if txt.startswith("```"):
            txt = txt.strip("`")
            if txt.lower().startswith("json"):
                txt = txt[4:].lstrip()
        s, e = txt.find("{"), txt.rfind("}")
        if s >= 0 and e > s:
            parsed = _json.loads(txt[s:e + 1])
    except Exception:
        parsed = {}
    allowed = {"colonia", "min_price", "max_price", "min_sqm", "max_sqm", "beds", "baths", "parking", "stage", "amenity"}
    filters = {k: v for k, v in parsed.items() if k in allowed and v not in (None, "", [], {})}
    await db.ai_search_cache.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "filters": filters, "query": q, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"filters": filters, "query": q, "cached": False}


class NLPSearchIn(BaseModel):
    query: str


@router.post("/api/search/nlp")
async def nlp_search(payload: NLPSearchIn):
    q = payload.query.lower()
    results = [p for p in SEED_PROPERTIES if q in p["colonia"].lower() or q in p["titulo"].lower()]
    return {"properties": results or SEED_PROPERTIES[:3], "reasoning": "Búsqueda por palabras clave", "chips": []}


# ─── Health ────────────────────────────────────────────────────────────────────
@router.get("/api/health")
async def health():
    return {
        "status": "ok", "service": "DesarrollosMX API v2",
        "colonias": len(SEED_COLONIAS), "properties": len(SEED_PROPERTIES),
    }
