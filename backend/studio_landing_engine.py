"""W5.22 Z.8 — Studio Landing Pages Engine.

CRUD + slug + A/B group + view tracker + lead handler.

Collections:
  db.studio_landings           Landing docs (con content nested · slug unique global)
  db.studio_landing_ab_groups  A/B group docs (Chi-square via studio_carrusel_ab_engine pattern)
  db.studio_landing_views      TTL 365d daily counters por landing
  db.studio_landing_leads      Leads capturados (raw payload + IP hash)

Append-only · NO modifica engines Z.1/Z.2.
"""
from __future__ import annotations

import hashlib
import logging
import re
import secrets
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_landing_engine")

# Z.8.3 — Themes import (soft · fallback si modulo no disponible)
try:
    from studio_landing_themes import get_theme as _get_theme
except Exception:  # pragma: no cover
    def _get_theme(_k):  # type: ignore
        return None

TEMPLATE_KEYS = (
    "luxury", "modern", "family", "investor", "boutique",
    "urgent", "scrollytelling", "video_first", "social_proof", "compare",
)

# W5.22 Z.8.2 — Landing types + section types (14 catalog)
LANDING_TYPES = ("property", "personal_brand", "marketplace")

# Z.8.5 — Property source (development O reventa Z.1 import)
PROPERTY_SOURCES = ("development", "resale")

# Z.8.5 — Lead routing strategies
LEAD_ROUTING_STRATEGIES = (
    "asesor_directo",
    "hybrid",
    "round_robin",
    "by_zone",
    "by_load",
    "by_disc",
    "manual_queue",
)


def lead_routing_defaults(user_role: str = "asesor") -> Dict[str, Any]:
    """Defaults segun rol: asesor → asesor_directo · inmobiliaria_admin → hybrid."""
    is_admin = user_role in ("inmobiliaria_admin", "tenant_admin", "superadmin")
    return {
        "strategy": "hybrid" if is_admin else "asesor_directo",
        "priority_order": ["by_zone", "by_load", "round_robin"],
        "override_score_threshold": 80,
        "override_pin_asesor_id": None,
    }

SECTION_TYPES = (
    "hero", "property_showcase", "gallery", "video", "map", "stats",
    "features", "testimonials", "lead_form", "calendar_booking",
    "price_table", "faq", "countdown", "footer", "marketplace",
    # Z.8.5 — Unique sections per property template (9 + 1 generic capitulo)
    "servicios_privados",        # Luxury
    "vida_familiar",             # Family
    "proyeccion_financiera",     # Investor
    "curaduria",                 # Boutique
    "scarcity_alert",            # Urgent
    "capitulo",                  # Scrollytelling (4 sub-variants via config.num/key)
    "galeria_video",             # Video-first
    "social_stats",              # Social proof
    "testimonios_grande",        # Social proof
    "comparison_table_grande",   # Compare
)

# Z.8.4 — Marketplace config defaults
MARKETPLACE_SORTS = ("price_asc", "price_desc", "date_new", "name_az", "zone")
MARKETPLACE_PAGINATION = ("buttons", "infinite", "none")
MARKETPLACE_MAX_LIMIT = 500
MARKETPLACE_DEFAULT_LIMIT = 100
# Stage user-friendly mapping (backend uses raw stage labels)
MARKETPLACE_STATUS_FILTERS = ("preventa", "venta", "cerrado")
STAGE_TO_STATUS_FILTER = {
    "preventa": "preventa",
    "en_construccion": "venta",
    "entrega_inmediata": "venta",
    "exclusiva": "venta",
    "entregado": "cerrado",
    "cerrado": "cerrado",
}


def marketplace_config_defaults() -> Dict[str, Any]:
    return {
        "limit": MARKETPLACE_DEFAULT_LIMIT,
        "sort_by": "date_new",
        "default_filters": {
            "cities": [],
            "colonias": [],
            "status": [],
            "price_min": None,
            "price_max": None,
            "amenities_required": [],
        },
        "enable_map": True,
        "enable_search": True,
        "pagination_mode": "buttons",
    }

MAX_UNDO_HISTORY = 10

SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")
LEAD_RATE_LIMIT_SECONDS = 60  # 5/min/IP per slug → window check minimal


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _uid(prefix: str = "lnd") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def slugify(text: str, max_len: int = 60) -> str:
    """Slug es-MX safe · ASCII only · lowercase · dashes."""
    if not text:
        return secrets.token_hex(4)
    t = unicodedata.normalize("NFKD", text)
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) < 3:
        t = (t + "-" + secrets.token_hex(2)).strip("-")
    return t[:max_len]


def _hash_ip(ip: str) -> str:
    return hashlib.sha256((ip or "anon").encode("utf-8")).hexdigest()[:16]


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.studio_landings.create_index("slug", unique=True)
        await db.studio_landings.create_index([("user_id", 1), ("created_at", -1)])
        await db.studio_landings.create_index("tenant_id")
        await db.studio_landings.create_index("project_id")
        await db.studio_landing_ab_groups.create_index("user_id")
        await db.studio_landing_ab_groups.create_index("variant_a_landing_id")
        await db.studio_landing_ab_groups.create_index("variant_b_landing_id")
        await db.studio_landing_views.create_index([("slug", 1), ("date_iso", 1)], unique=True)
        await db.studio_landing_views.create_index("expires_at", expireAfterSeconds=0)
        await db.studio_landing_leads.create_index([("slug", 1), ("created_at", -1)])
        await db.studio_landing_leads.create_index("ip_hash")
        # Z.8.5 — data cache index
        await db.studio_landing_data_cache.create_index("key", unique=True)
        await db.studio_landing_data_cache.create_index("landing_id")
        # Z.8.5 — analytics events (TTL 365d)
        await db.studio_landing_analytics.create_index([("slug", 1), ("created_at", -1)])
        await db.studio_landing_analytics.create_index("expires_at", expireAfterSeconds=0)
        log.info("[studio_landing] indexes ok")
    except Exception as exc:
        log.warning(f"[studio_landing] indexes failed (soft): {exc}")


# ─── Default content template ─────────────────────────────────────────────────
def default_content(title: str, subtitle: str = "") -> Dict[str, Any]:
    return {
        "hero": {
            "title": title or "Tu proximo proyecto",
            "subtitle": subtitle or "Inteligencia inmobiliaria CDMX.",
            "bg_image_r2_key": "",
            "bg_video_r2_key": "",
        },
        "stats": [
            {"label": "Plusvalia 5a", "value": "+38%"},
            {"label": "Entrega", "value": "Q4 2026"},
            {"label": "Desde", "value": "$4.8M MXN"},
        ],
        "features": [
            {"title": "Ubicacion premium", "description": "Walkscore 90+", "icon": "MapPin"},
            {"title": "Amenidades", "description": "Roof + Coworking + Gym", "icon": "Sparkles"},
            {"title": "Plusvalia comprobada", "description": "DRPI verificado", "icon": "TrendingUp"},
        ],
        "testimonials": [],
        "cta": {
            "primary": {"text": "Agenda tu visita", "action": "lead_form"},
            "secondary": {"text": "Descarga brochure", "action": "download_pdf"},
        },
        "lead_form": {
            "fields": [
                {"name": "nombre", "type": "text", "required": True, "label": "Nombre completo"},
                {"name": "email", "type": "email", "required": True, "label": "Correo"},
                {"name": "telefono", "type": "phone", "required": False, "label": "Telefono"},
            ],
            "submit_text": "Enviar",
            "success_message": "Gracias. Te contactamos en menos de 24h.",
        },
        "gallery": {"asset_ids": []},
        "atlax_widget_enabled": False,
        "brochure_pdf_enabled": True,
        "urgent_expires_at": None,
    }


# ─── CRUD ─────────────────────────────────────────────────────────────────────
async def create_landing(
    db,
    *,
    tenant_id: str,
    user_id: str,
    template_key: str,
    title: str,
    slug: Optional[str] = None,
    subtitle: str = "",
    brand_kit_id: Optional[str] = None,
    project_id: Optional[str] = None,
    cta_text: str = "",
    landing_type: str = "property",
    linked_entity_id: Optional[str] = None,
    initial_sections: Optional[List[Dict[str, Any]]] = None,
    property_source: str = "development",
    user_role: str = "asesor",
) -> Dict[str, Any]:
    if template_key not in TEMPLATE_KEYS:
        return {"ok": False, "error": f"template_key invalido. Validos: {list(TEMPLATE_KEYS)}"}
    if landing_type not in LANDING_TYPES:
        return {"ok": False, "error": f"landing_type invalido. Validos: {list(LANDING_TYPES)}"}
    if property_source not in PROPERTY_SOURCES:
        return {"ok": False, "error": f"property_source invalido. Validos: {list(PROPERTY_SOURCES)}"}

    raw_slug = (slug or slugify(title) or secrets.token_hex(4)).lower().strip()
    if not SLUG_RE.match(raw_slug):
        return {"ok": False, "error": "slug invalido (a-z0-9- · 3-60 chars)"}

    existing = await db.studio_landings.find_one({"slug": raw_slug}, {"_id": 0, "id": 1})
    if existing:
        return {"ok": False, "error": "slug ya en uso", "status_code": 422}

    content = default_content(title, subtitle)
    if cta_text:
        content["cta"]["primary"]["text"] = cta_text[:40]

    sections = initial_sections or []
    # Z.8.5.1 — Property landings · auto-apply template spec (inyecta unique_section_type)
    if landing_type == "property":
        try:
            sections = apply_template_spec_to_sections(template_key, sections)
        except Exception as exc:
            log.warning(f"[create_landing apply_template_spec] failed (soft): {exc}")
    # Validate section types
    for sec in sections:
        if sec.get("type") not in SECTION_TYPES:
            return {"ok": False, "error": f"section type invalido: {sec.get('type')}"}

    doc = {
        "id": _uid(),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "project_id": project_id,
        "slug": raw_slug,
        "template_key": template_key,
        "brand_kit_id": brand_kit_id,
        "content": content,
        "landing_type": landing_type,
        "linked_entity_id": linked_entity_id,
        "property_source": property_source if landing_type == "property" else None,
        "template_content": {},
        "lead_routing_config": lead_routing_defaults(user_role) if landing_type == "property" else None,
        "sections": sections,
        "tracking_pixels": {"ga4_id": "", "meta_pixel_id": "", "custom_head": "", "custom_body": ""},
        "custom_domain": None,
        "undo_history": [],
        "ab_group_id": None,
        "variant_label": "single",
        "views_count": 0,
        "leads_count": 0,
        "published": False,
        "published_at": None,
        "deleted": False,
        "created_at": _iso(),
        "updated_at": _iso(),
    }
    await db.studio_landings.insert_one(dict(doc))
    doc.pop("_id", None)
    return {"ok": True, "landing": doc}


async def migrate_existing_landings(db) -> Dict[str, Any]:
    """Idempotent: backfill schemas Z.8.2/Z.8.5."""
    try:
        res1 = await db.studio_landings.update_many(
            {"landing_type": {"$exists": False}},
            {"$set": {"landing_type": "property", "sections": [], "tracking_pixels": {"ga4_id": "", "meta_pixel_id": "", "custom_head": "", "custom_body": ""}, "linked_entity_id": None, "undo_history": []}},
        )
        # Z.8.5 — backfill property_source + template_content + lead_routing_config
        res2 = await db.studio_landings.update_many(
            {"landing_type": "property", "property_source": {"$exists": False}},
            {"$set": {"property_source": "development", "template_content": {}, "lead_routing_config": lead_routing_defaults()}},
        )
        return {"ok": True, "migrated_v1": res1.modified_count, "migrated_z85": res2.modified_count}
    except Exception as exc:
        log.warning(f"[migrate_existing] failed (soft): {exc}")
        return {"ok": False, "error": str(exc)}


# ─── Sections CRUD ────────────────────────────────────────────────────────────
def apply_template_spec_to_sections(template_key: str, existing_sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Z.8.5.1 — Inyecta unique_section_type al sections array si NO existe.

    Lee PROPERTY_TEMPLATES[template_key] · si tiene unique_section_type · y existing_sections
    NO tiene esa section type · la inserta en la posicion correcta segun sections_order.

    Preserva existing_sections existentes (NO duplica).
    Si template_key invalido o sin unique_section_type · devuelve existing_sections sin cambio.
    """
    try:
        from studio_landing_property_templates import get_property_template_spec
        from studio_landing_property_templates import merge_template_with_data as _merge
    except Exception:
        return existing_sections
    spec = get_property_template_spec(template_key)
    unique_type = spec.get("unique_section_type")
    order = spec.get("sections_order") or []
    existing = list(existing_sections or [])
    existing_types = [s.get("type") for s in existing]
    if not unique_type:
        # Modern · no inyectar nada · solo reordenar si aplica
        return _reorder_by_template(existing, order)
    # Multi-capitulo special case (scrollytelling tiene 4 capitulos)
    unique_type = _normalize_section_type(unique_type)
    existing_norm_types = {_normalize_section_type(t) for t in existing_types}
    if unique_type in existing_norm_types:
        # Ya existe · solo reordenar
        return _reorder_by_template(existing, order)
    # Build the unique section via merge helper · sin property data ahora (solo placeholder copy)
    placeholder = _merge(spec, {}, {})
    # Pick las sections del template que NO estan en existing
    missing = [ps for ps in placeholder if ps.get("type") and ps.get("type") not in existing_types]
    if not missing:
        return _reorder_by_template(existing, order)
    # Inyectar al inicio · reordenamiento posterior lo coloca correcto
    combined = existing + missing
    return _reorder_by_template(combined, order)


def _normalize_section_type(t: str) -> str:
    """Z.8.5.1 — Normaliza variants compatibles (capitulo_xxx → capitulo)."""
    if t and t.startswith("capitulo_"):
        return "capitulo"
    return t


def _reorder_by_template(sections: List[Dict[str, Any]], order: List[str]) -> List[Dict[str, Any]]:
    """Reordena sections segun order · sections fuera de order van al final.
    Normaliza variants (capitulo_origen/diseno/vida/inversion → capitulo) para matching.
    """
    if not order:
        return sections
    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for s in sections:
        t = _normalize_section_type(s.get("type"))
        by_type.setdefault(t, []).append(s)
    ordered: List[Dict[str, Any]] = []
    for t in order:
        norm_t = _normalize_section_type(t)
        arr = by_type.get(norm_t)
        if arr:
            ordered.append(arr.pop(0))
            if not arr:
                by_type.pop(norm_t, None)
            else:
                by_type[norm_t] = arr
    leftover: List[Dict[str, Any]] = []
    for arr in by_type.values():
        leftover.extend(arr)
    return ordered + leftover


async def update_sections(db, landing_id: str, user_id: str, sections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Replace sections array · push current to undo_history."""
    landing = await get_landing(db, landing_id, user_id)
    if not landing:
        return {"ok": False, "error": "Landing no encontrada"}
    # Validate types
    for sec in sections:
        if sec.get("type") not in SECTION_TYPES:
            return {"ok": False, "error": f"section type invalido: {sec.get('type')}"}
    # Push current snapshot
    history = (landing.get("undo_history") or [])[:MAX_UNDO_HISTORY - 1]
    history.insert(0, {"sections": landing.get("sections", []), "ts": _iso()})
    await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id},
        {"$set": {"sections": sections, "undo_history": history, "updated_at": _iso()}},
    )
    return {"ok": True}


async def update_tracking_pixels(db, landing_id: str, user_id: str, pixels: Dict[str, Any]) -> Dict[str, Any]:
    safe = {
        "ga4_id": str(pixels.get("ga4_id") or "")[:64],
        "meta_pixel_id": str(pixels.get("meta_pixel_id") or "")[:64],
        "custom_head": str(pixels.get("custom_head") or "")[:4000],
        "custom_body": str(pixels.get("custom_body") or "")[:4000],
    }
    # Sanitize via studio_landing_pixels
    try:
        from studio_landing_pixels import sanitize_pixel_html
        safe["custom_head"] = sanitize_pixel_html(safe["custom_head"])
        safe["custom_body"] = sanitize_pixel_html(safe["custom_body"])
    except Exception:
        pass
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": {"tracking_pixels": safe, "updated_at": _iso()}},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True, "tracking_pixels": safe}


async def undo_sections(db, landing_id: str, user_id: str) -> Dict[str, Any]:
    landing = await get_landing(db, landing_id, user_id)
    if not landing:
        return {"ok": False, "error": "Landing no encontrada"}
    history = landing.get("undo_history") or []
    if not history:
        return {"ok": False, "error": "Nada que deshacer"}
    snap = history[0]
    rest = history[1:]
    await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id},
        {"$set": {"sections": snap.get("sections", []), "undo_history": rest, "updated_at": _iso()}},
    )
    return {"ok": True, "sections": snap.get("sections", [])}


# ─── Hydration por landing_type ───────────────────────────────────────────────
async def hydrate_landing_for_public(db, landing: Dict[str, Any]) -> Dict[str, Any]:
    """Merge linked entity data dentro de la landing (property/personal/marketplace)."""
    lt = landing.get("landing_type", "property")
    enriched = dict(landing)
    try:
        if lt == "property" and landing.get("linked_entity_id"):
            source = landing.get("property_source") or "development"
            if source == "resale":
                # Z.8.5 — Reventa: lookup en listing_imports
                imp = await db.listing_imports.find_one(
                    {"id": landing["linked_entity_id"], "user_id": landing.get("user_id")},
                    {"_id": 0, "raw_html_truncated": 0},
                )
                if imp and (imp.get("parsed_data") or {}):
                    pd = imp["parsed_data"]
                    enriched["linked_entity"] = {
                        "type": "resale",
                        "id": imp.get("id"),
                        "name": pd.get("title") or pd.get("name") or "Propiedad de reventa",
                        "colonia": pd.get("colonia") or pd.get("neighborhood"),
                        "alcaldia": pd.get("alcaldia") or pd.get("borough"),
                        "price_from": pd.get("price"),
                        "price_to": pd.get("price"),
                        "stage": "reventa",
                        "m2_range": [pd.get("m2"), pd.get("m2")] if pd.get("m2") else None,
                        "bedrooms_range": [pd.get("bedrooms"), pd.get("bedrooms")] if pd.get("bedrooms") else None,
                        "bathrooms_range": [pd.get("bathrooms"), pd.get("bathrooms")] if pd.get("bathrooms") else None,
                        "amenities": (pd.get("amenities") or [])[:8],
                        "lat": pd.get("lat"),
                        "lng": pd.get("lng"),
                        "images": (pd.get("images") or [])[:12],
                        "description": pd.get("description"),
                        "source_portal": imp.get("source_portal"),
                        "source_url": imp.get("source_url"),
                    }
            else:
                from data_developments import DEVELOPMENTS_BY_ID
                dev = DEVELOPMENTS_BY_ID.get(landing["linked_entity_id"])
                if dev:
                    enriched["linked_entity"] = {
                        "type": "development",
                        "id": dev.get("id"),
                        "name": dev.get("name"),
                        "colonia": dev.get("colonia"),
                        "alcaldia": dev.get("alcaldia"),
                        "price_from": dev.get("price_from"),
                        "price_to": dev.get("price_to"),
                        "stage": dev.get("stage"),
                        "delivery_estimate": dev.get("delivery_estimate"),
                        "m2_range": dev.get("m2_range"),
                        "bedrooms_range": dev.get("bedrooms_range"),
                        "amenities": dev.get("amenities", [])[:12],
                        "lat": (dev.get("center") or {}).get("lat") if isinstance(dev.get("center"), dict) else dev.get("lat"),
                        "lng": (dev.get("center") or {}).get("lng") if isinstance(dev.get("center"), dict) else dev.get("lng"),
                        "images": dev.get("photos") or dev.get("images", [])[:12],
                        "units_total": dev.get("units_total"),
                        "units_available": dev.get("units_available"),
                        "developer_id": dev.get("developer_id"),
                    }
        elif lt == "personal_brand" and landing.get("linked_entity_id"):
            prof = await db.asesor_profiles.find_one(
                {"user_id": landing["linked_entity_id"]}, {"_id": 0}
            )
            if prof:
                enriched["linked_entity"] = {"type": "asesor_profile", **prof}
        elif lt == "marketplace":
            # Z.8.4 — server-hydrate respetando marketplace_config (limit + sort + default_filters)
            mp_cfg = (enriched.get("content") or {}).get("marketplace_config") or marketplace_config_defaults()
            res = query_marketplace_developments(db, enriched.get("user_id", ""), mp_cfg, override_filters=None, page=1)
            enriched["linked_entity"] = {
                "type": "marketplace",
                "developments": res["items"],
                "total": res["total"],
                "page": res["page"],
                "page_size": res["page_size"],
                "pages": res["pages"],
                "applied_filters": res["applied_filters"],
                "facets": res["facets"],
            }
    except Exception as exc:
        log.warning(f"[hydrate_landing] failed (soft): {exc}")
    # Z.8.3 — merge theme tokens segun template_key (fallback "modern")
    try:
        theme = _get_theme(enriched.get("template_key", "modern"))
        if theme:
            enriched["theme"] = theme
    except Exception as exc:
        log.warning(f"[hydrate_landing theme] failed (soft): {exc}")
    # Z.8.5 — merge atlax_data live con cache TTL per template
    try:
        if lt == "property":
            atlax = await _live_atlax_data(db, enriched)
            if atlax:
                enriched["atlax_data"] = atlax
    except Exception as exc:
        log.warning(f"[hydrate_landing atlax] failed (soft): {exc}")
    return enriched


# Z.8.5 — Live data cache per template
TEMPLATE_CACHE_TTL_SECONDS = {
    "urgent": 0,            # No cache · units_left real-time
    "investor": 3600,       # 1h · ROI/forecast
    "luxury": 21600,        # 6h · waitlist
    "family": 86400,        # 24h · schools/parks
    "boutique": 86400,
    "compare": 7200,        # 2h · Battle Card weekly
    "social_proof": 21600,
    "modern": 86400,
    "scrollytelling": 86400,
    "video_first": 86400,
}


async def _live_atlax_data(db, landing: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Z.8.5 — Fetch atlax data per template_key con cache TTL.

    Cache key: f"{landing_id}:{template_key}". Stored in studio_landing_data_cache TTL.
    Si TTL=0 (urgent) siempre re-fetch · si miss cache → fetch + persist + return.
    """
    from studio_landing_atlax_adapter import auto_fill_template_data
    tk = (landing.get("template_key") or "modern").lower()
    ttl = TEMPLATE_CACHE_TTL_SECONDS.get(tk, 86400)
    landing_id = landing.get("id")
    cache_key = f"{landing_id}:{tk}"

    # Try cache hit (skip si ttl=0)
    if ttl > 0:
        try:
            from datetime import timedelta
            cutoff = _now() - timedelta(seconds=ttl)
            cached = await db.studio_landing_data_cache.find_one(
                {"key": cache_key, "cached_at": {"$gte": cutoff.isoformat()}},
                {"_id": 0},
            )
            if cached:
                return cached.get("data")
        except Exception:
            pass

    # Build property_data from linked_entity already in landing
    le = landing.get("linked_entity") or {}
    if not le:
        return None
    property_data = {
        "id": le.get("id"),
        "name": le.get("name"),
        "colonia": le.get("colonia"),
        "alcaldia": le.get("alcaldia"),
        "price_from": le.get("price_from"),
        "amenities": le.get("amenities", []),
        "stage": le.get("stage"),
        "delivery_estimate": le.get("delivery_estimate"),
        "units_total": le.get("units_total"),
        "units_available": le.get("units_available"),
        "lat": le.get("lat"),
        "lng": le.get("lng"),
    }
    atlax = await auto_fill_template_data(db, tk, property_data, landing)

    # Persist cache (skip si ttl=0)
    if atlax and ttl > 0:
        try:
            from datetime import timedelta
            await db.studio_landing_data_cache.update_one(
                {"key": cache_key},
                {"$set": {
                    "key": cache_key,
                    "landing_id": landing_id,
                    "template_key": tk,
                    "data": atlax,
                    "cached_at": _iso(),
                    "expires_at": (_now() + timedelta(seconds=ttl)).isoformat(),
                }},
                upsert=True,
            )
        except Exception:
            pass

    return atlax


# ─── Catalog helpers ──────────────────────────────────────────────────────────
async def catalog_developments(db, user_id: str) -> List[Dict[str, Any]]:
    try:
        from data_developments import DEVELOPMENTS
        return [
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "colonia": d.get("colonia"),
                "stage": d.get("stage"),
                "price_from": d.get("price_from"),
            }
            for d in DEVELOPMENTS
        ]
    except Exception:
        return []


async def catalog_asesor(db, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.asesor_profiles.find_one({"user_id": user_id}, {"_id": 0})


async def catalog_resales(db, user_id: str, limit: int = 30, skip: int = 0) -> Dict[str, Any]:
    """Z.8.5 — Lista listing_imports del user (Z.1 importer · solo parsed exitosos)."""
    try:
        cur = db.listing_imports.find(
            {"user_id": user_id, "status": "parsed"},
            {"_id": 0, "raw_html_truncated": 0},
        ).sort("created_at", -1).skip(skip).limit(limit)
        items_raw = await cur.to_list(limit)
        items: List[Dict[str, Any]] = []
        for r in items_raw:
            pd = r.get("parsed_data") or {}
            items.append({
                "id": r.get("id"),
                "title": pd.get("title") or pd.get("name") or "Reventa sin titulo",
                "price": pd.get("price"),
                "colonia": pd.get("colonia"),
                "alcaldia": pd.get("alcaldia"),
                "source_portal": r.get("source_portal"),
                "source_url": r.get("source_url"),
                "image": (pd.get("images") or [None])[0],
                "created_at": r.get("created_at"),
            })
        total = await db.listing_imports.count_documents({"user_id": user_id, "status": "parsed"})
        return {"items": items, "total": total}
    except Exception as exc:
        log.warning(f"[catalog_resales] failed (soft): {exc}")
        return {"items": [], "total": 0}


async def update_routing_config(db, landing_id: str, user_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """Z.8.5 — Update lead_routing_config (inmobiliaria_admin recomendado)."""
    strategy = config.get("strategy")
    if strategy and strategy not in LEAD_ROUTING_STRATEGIES:
        return {"ok": False, "error": f"strategy invalido. Validos: {list(LEAD_ROUTING_STRATEGIES)}"}
    landing = await get_landing(db, landing_id, user_id)
    if not landing:
        return {"ok": False, "error": "Landing no encontrada"}
    current = landing.get("lead_routing_config") or lead_routing_defaults()
    safe = {**current, **{k: v for k, v in config.items() if v is not None}}
    # Clamp + sanitize
    if not isinstance(safe.get("priority_order"), list):
        safe["priority_order"] = current.get("priority_order") or ["by_zone", "by_load", "round_robin"]
    safe["override_score_threshold"] = max(0, min(int(safe.get("override_score_threshold") or 80), 100))
    pin = safe.get("override_pin_asesor_id")
    safe["override_pin_asesor_id"] = str(pin)[:80] if pin else None
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": {"lead_routing_config": safe, "updated_at": _iso()}},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True, "lead_routing_config": safe}


async def route_lead(db, landing: Dict[str, Any], lead_data: Dict[str, Any]) -> Dict[str, Any]:
    """Z.8.5 — Aplica lead_routing_config para asignar lead a asesor especifico.

    Returns {"assigned_to": user_id, "strategy": str, "reason": str, "pending": bool}.
    Defaults to landing.user_id si todo falla.
    """
    owner_id = landing.get("user_id")
    cfg = landing.get("lead_routing_config") or lead_routing_defaults()
    strategy = cfg.get("strategy") or "asesor_directo"
    tenant_id = landing.get("tenant_id")

    # Pin override · prioridad maxima
    pin = cfg.get("override_pin_asesor_id")
    if pin:
        return {"assigned_to": pin, "strategy": "manual_pin", "reason": "Pin manual landing", "pending": False}

    if strategy == "manual_queue":
        return {"assigned_to": None, "strategy": strategy, "reason": "Queue pending assignment", "pending": True}

    if strategy == "asesor_directo":
        return {"assigned_to": owner_id, "strategy": strategy, "reason": "Landing owner", "pending": False}

    # Strategies que requieren team: fetch asesores del tenant
    try:
        team = await db.asesor_profiles.find(
            {"tenant_id": tenant_id, "active": {"$ne": False}}, {"_id": 0}
        ).to_list(100)
    except Exception:
        team = []
    if not team:
        return {"assigned_to": owner_id, "strategy": "fallback_owner", "reason": "Sin team", "pending": False}

    def _by_zone(t):
        zone = (lead_data.get("zone_interest") or lead_data.get("zona") or "").lower()
        if not zone:
            return None
        for asesor in t:
            cols = [c.lower() for c in (asesor.get("colonias") or [])]
            if zone in cols or any(zone in c for c in cols):
                return asesor.get("user_id")
        return None

    async def _by_load(t):
        from datetime import timedelta
        cutoff = (_now() - timedelta(days=7)).isoformat()
        scores = []
        for asesor in t:
            uid = asesor.get("user_id")
            try:
                load = await db.leads.count_documents({"assigned_to": uid, "created_at": {"$gte": cutoff}})
            except Exception:
                load = 0
            scores.append((uid, load))
        scores.sort(key=lambda x: x[1])
        return scores[0][0] if scores else None

    async def _round_robin(t):
        try:
            cnt = await db.inmobiliaria_round_robin.find_one_and_update(
                {"tenant_id": tenant_id},
                {"$inc": {"counter": 1}, "$setOnInsert": {"tenant_id": tenant_id}},
                upsert=True,
                return_document=True,
            )
            idx = (cnt.get("counter", 0) - 1) % len(t)
        except Exception:
            idx = 0
        return t[idx].get("user_id")

    def _by_disc(t):
        wanted = (lead_data.get("disc") or "").upper()[:1]
        if not wanted:
            return None
        for asesor in t:
            if (asesor.get("disc_primary") or "").upper()[:1] == wanted:
                return asesor.get("user_id")
        return None

    if strategy == "by_zone":
        uid = _by_zone(team)
        if uid:
            return {"assigned_to": uid, "strategy": strategy, "reason": "Zone match", "pending": False}
    if strategy == "by_load":
        uid = await _by_load(team)
        if uid:
            return {"assigned_to": uid, "strategy": strategy, "reason": "Load balance", "pending": False}
    if strategy == "by_disc":
        uid = _by_disc(team)
        if uid:
            return {"assigned_to": uid, "strategy": strategy, "reason": "DISC match", "pending": False}
    if strategy == "round_robin":
        uid = await _round_robin(team)
        if uid:
            return {"assigned_to": uid, "strategy": strategy, "reason": "Round robin", "pending": False}

    # hybrid: priority_order
    if strategy == "hybrid":
        for step in (cfg.get("priority_order") or []):
            if step == "by_zone":
                uid = _by_zone(team)
                if uid:
                    return {"assigned_to": uid, "strategy": "hybrid:by_zone", "reason": "Hybrid zone", "pending": False}
            elif step == "by_load":
                uid = await _by_load(team)
                if uid:
                    return {"assigned_to": uid, "strategy": "hybrid:by_load", "reason": "Hybrid load", "pending": False}
            elif step == "by_disc":
                uid = _by_disc(team)
                if uid:
                    return {"assigned_to": uid, "strategy": "hybrid:by_disc", "reason": "Hybrid disc", "pending": False}
            elif step == "round_robin":
                uid = await _round_robin(team)
                if uid:
                    return {"assigned_to": uid, "strategy": "hybrid:round_robin", "reason": "Hybrid rr", "pending": False}

    # Fallback owner
    return {"assigned_to": owner_id, "strategy": "fallback_owner", "reason": "Sin match estrategia", "pending": False}


# Z.8.4 — Marketplace runtime query (applies filters + sort + paginate)
def _dev_card(d: Dict[str, Any]) -> Dict[str, Any]:
    """Lightweight dict for marketplace cards · no embedded units list."""
    photos = d.get("photos") or d.get("images") or []
    price_from = d.get("price_from")
    return {
        "id": d.get("id"),
        "name": d.get("name"),
        "slug": d.get("slug"),
        "colonia": d.get("colonia"),
        "alcaldia": d.get("alcaldia"),
        "city": d.get("city") or "Ciudad de México",
        "stage": d.get("stage"),
        "status_filter": STAGE_TO_STATUS_FILTER.get(d.get("stage", ""), "venta"),
        "price_from": price_from,
        "price_to": d.get("price_to"),
        "delivery_estimate": d.get("delivery_estimate"),
        "m2_range": d.get("m2_range"),
        "bedrooms_range": d.get("bedrooms_range"),
        "amenities": (d.get("amenities") or [])[:12],
        "image": photos[0] if photos else None,
        "photos": photos[:4],
        "units_total": d.get("units_total"),
        "units_available": d.get("units_available"),
        "lat": (d.get("center") or {}).get("lat") if isinstance(d.get("center"), dict) else d.get("lat"),
        "lng": (d.get("center") or {}).get("lng") if isinstance(d.get("center"), dict) else d.get("lng"),
        "featured": d.get("featured", False),
    }


def _matches_filters(card: Dict[str, Any], filters: Dict[str, Any], q: str) -> bool:
    cities = filters.get("cities") or []
    if cities and (card.get("city") or "") not in cities and (card.get("alcaldia") or "") not in cities:
        return False
    colonias = filters.get("colonias") or []
    if colonias and (card.get("colonia") or "") not in colonias:
        return False
    statuses = filters.get("status") or []
    if statuses and card.get("status_filter") not in statuses:
        return False
    p_min = filters.get("price_min")
    p_max = filters.get("price_max")
    if p_min is not None and (card.get("price_from") or 0) < p_min:
        return False
    if p_max is not None and (card.get("price_from") or 0) > p_max:
        return False
    req_amenities = filters.get("amenities_required") or []
    if req_amenities:
        card_amenities = set(a.lower() for a in (card.get("amenities") or []))
        for a in req_amenities:
            if a.lower() not in card_amenities:
                return False
    if q:
        ql = q.lower().strip()
        haystack = " ".join([
            str(card.get("name", "")),
            str(card.get("colonia", "")),
            str(card.get("alcaldia", "")),
            str(card.get("city", "")),
        ]).lower()
        if ql not in haystack:
            return False
    return True


def _sort_cards(cards: List[Dict[str, Any]], sort_by: str) -> List[Dict[str, Any]]:
    if sort_by == "price_asc":
        return sorted(cards, key=lambda c: (c.get("price_from") or 0))
    if sort_by == "price_desc":
        return sorted(cards, key=lambda c: -(c.get("price_from") or 0))
    if sort_by == "name_az":
        return sorted(cards, key=lambda c: (c.get("name") or "").lower())
    if sort_by == "zone":
        return sorted(cards, key=lambda c: ((c.get("alcaldia") or ""), (c.get("colonia") or "")))
    # default date_new · featured first then id desc as proxy
    return sorted(cards, key=lambda c: (not c.get("featured"), c.get("id") or ""), reverse=False)


def query_marketplace_developments(
    db,
    user_id: str,
    config: Dict[str, Any],
    *,
    override_filters: Optional[Dict[str, Any]] = None,
    q: str = "",
    page: int = 1,
    page_size: Optional[int] = None,
) -> Dict[str, Any]:
    """Apply marketplace_config + optional override filters + sort + paginate.

    Returns: {items, total, page, page_size, pages, applied_filters, facets}.
    """
    try:
        from data_developments import DEVELOPMENTS
    except Exception:
        DEVELOPMENTS = []

    cfg = {**marketplace_config_defaults(), **(config or {})}
    filters = dict((cfg.get("default_filters") or {}))
    if override_filters:
        for k, v in override_filters.items():
            if v is not None:
                filters[k] = v
    sort_by = cfg.get("sort_by") or "date_new"
    limit_cap = min(int(cfg.get("limit") or MARKETPLACE_DEFAULT_LIMIT), MARKETPLACE_MAX_LIMIT)
    pagination = cfg.get("pagination_mode") or "buttons"
    page = max(1, int(page or 1))
    if pagination == "none":
        per_page = limit_cap
    else:
        per_page = int(page_size or 12)
        per_page = max(1, min(per_page, 48))

    cards = [_dev_card(d) for d in DEVELOPMENTS]
    filtered = [c for c in cards if _matches_filters(c, filters, q or "")]
    sorted_cards = _sort_cards(filtered, sort_by)
    capped = sorted_cards[:limit_cap]
    total = len(capped)

    if pagination == "none":
        page_items = capped
        pages = 1
        page = 1
    else:
        pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, pages)
        start = (page - 1) * per_page
        page_items = capped[start:start + per_page]

    # Facets for filter sidebars (from full capped pool, not paginated slice)
    cities_set = sorted({c.get("alcaldia") for c in cards if c.get("alcaldia")})
    colonias_set = sorted({c.get("colonia") for c in cards if c.get("colonia")})
    amenities_set = sorted({a for c in cards for a in (c.get("amenities") or [])})
    prices = [c.get("price_from") for c in cards if c.get("price_from")]

    return {
        "items": page_items,
        "total": total,
        "total_unfiltered": len(cards),
        "page": page,
        "page_size": per_page,
        "pages": pages,
        "applied_filters": filters,
        "applied_sort": sort_by,
        "applied_query": q,
        "facets": {
            "cities": cities_set,
            "colonias": colonias_set,
            "amenities": amenities_set[:40],
            "status": list(MARKETPLACE_STATUS_FILTERS),
            "price_min": min(prices) if prices else 0,
            "price_max": max(prices) if prices else 0,
        },
    }


async def update_marketplace_config(db, landing_id: str, user_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
    landing = await get_landing(db, landing_id, user_id)
    if not landing:
        return {"ok": False, "error": "Landing no encontrada"}
    safe = {**marketplace_config_defaults(), **(config or {})}
    # Clamps
    safe["limit"] = max(1, min(int(safe.get("limit") or MARKETPLACE_DEFAULT_LIMIT), MARKETPLACE_MAX_LIMIT))
    if safe.get("sort_by") not in MARKETPLACE_SORTS:
        safe["sort_by"] = "date_new"
    if safe.get("pagination_mode") not in MARKETPLACE_PAGINATION:
        safe["pagination_mode"] = "buttons"
    safe["enable_map"] = bool(safe.get("enable_map", True))
    safe["enable_search"] = bool(safe.get("enable_search", True))
    df = safe.get("default_filters") or {}
    safe["default_filters"] = {
        "cities": [str(x)[:60] for x in (df.get("cities") or [])][:30],
        "colonias": [str(x)[:60] for x in (df.get("colonias") or [])][:60],
        "status": [s for s in (df.get("status") or []) if s in MARKETPLACE_STATUS_FILTERS],
        "price_min": int(df["price_min"]) if df.get("price_min") not in (None, "") else None,
        "price_max": int(df["price_max"]) if df.get("price_max") not in (None, "") else None,
        "amenities_required": [str(x)[:40] for x in (df.get("amenities_required") or [])][:20],
    }
    content = dict(landing.get("content") or {})
    content["marketplace_config"] = safe
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": {"content": content, "updated_at": _iso()}},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True, "marketplace_config": safe}


async def catalog_marketplace_filters(db, user_id: str) -> Dict[str, Any]:
    try:
        from data_developments import DEVELOPMENTS
        cities = sorted(set(d.get("alcaldia", "") for d in DEVELOPMENTS if d.get("alcaldia")))
        colonias = sorted(set(d.get("colonia", "") for d in DEVELOPMENTS if d.get("colonia")))
        prices = [d.get("price_from", 0) for d in DEVELOPMENTS if d.get("price_from")]
        return {
            "cities": cities[:50],
            "colonias": colonias[:80],
            "price_min": min(prices) if prices else 0,
            "price_max": max(prices) if prices else 0,
            "statuses": ["pre-venta", "construccion", "ultimas-unidades", "entrega"],
        }
    except Exception:
        return {"cities": [], "colonias": [], "price_min": 0, "price_max": 0, "statuses": []}


async def get_landing(db, landing_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.studio_landings.find_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if doc:
        try:
            theme = _get_theme(doc.get("template_key", "modern"))
            if theme:
                doc["theme"] = theme
        except Exception:
            pass
    return doc


async def get_landing_by_slug(db, slug: str, include_unpublished: bool = False) -> Optional[Dict[str, Any]]:
    q: Dict[str, Any] = {"slug": slug, "deleted": {"$ne": True}}
    if not include_unpublished:
        q["published"] = True
    return await db.studio_landings.find_one(q, {"_id": 0})


async def list_landings(
    db,
    user_id: str,
    *,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    template_key: Optional[str] = None,
    limit: int = 30,
    skip: int = 0,
) -> Dict[str, Any]:
    q: Dict[str, Any] = {"user_id": user_id, "deleted": {"$ne": True}}
    if project_id:
        q["project_id"] = project_id
    if template_key:
        q["template_key"] = template_key
    if status == "published":
        q["published"] = True
    elif status == "draft":
        q["published"] = False
    cursor = db.studio_landings.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(limit)
    total = await db.studio_landings.count_documents(q)
    return {"items": items, "total": total}


async def update_landing(db, landing_id: str, user_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {"content", "template_key", "brand_kit_id", "project_id", "template_content", "property_source", "linked_entity_id"}
    update_doc: Dict[str, Any] = {"updated_at": _iso()}
    for k, v in patch.items():
        if k in allowed and v is not None:
            update_doc[k] = v
    if "template_key" in update_doc and update_doc["template_key"] not in TEMPLATE_KEYS:
        return {"ok": False, "error": "template_key invalido"}
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": update_doc},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True}


async def publish_landing(db, landing_id: str, user_id: str, published: bool = True) -> Dict[str, Any]:
    update_doc: Dict[str, Any] = {"published": published, "updated_at": _iso()}
    if published:
        update_doc["published_at"] = _iso()
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id, "deleted": {"$ne": True}},
        {"$set": update_doc},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True, "published": published}


async def delete_landing(db, landing_id: str, user_id: str) -> Dict[str, Any]:
    res = await db.studio_landings.update_one(
        {"id": landing_id, "user_id": user_id},
        {"$set": {"deleted": True, "deleted_at": _iso()}},
    )
    if res.matched_count == 0:
        return {"ok": False, "error": "Landing no encontrada"}
    return {"ok": True}


# ─── A/B variant ──────────────────────────────────────────────────────────────
async def create_ab_variant(
    db, landing_id: str, user_id: str, *, variant_b_template_key: str
) -> Dict[str, Any]:
    if variant_b_template_key not in TEMPLATE_KEYS:
        return {"ok": False, "error": "template_key invalido para variante B"}

    base = await get_landing(db, landing_id, user_id)
    if not base:
        return {"ok": False, "error": "Landing base no encontrada"}
    if base.get("ab_group_id"):
        return {"ok": False, "error": "Esta landing ya pertenece a un grupo A/B"}

    # Crear variante B (clon con template distinto + slug -B)
    b_slug = f"{base['slug']}-b"[:60]
    # Asegurar unicidad
    if await db.studio_landings.find_one({"slug": b_slug}, {"_id": 0, "id": 1}):
        b_slug = f"{base['slug'][:55]}-{secrets.token_hex(2)}"

    b_doc = dict(base)
    b_doc.pop("_id", None)
    b_doc["id"] = _uid()
    b_doc["slug"] = b_slug
    b_doc["template_key"] = variant_b_template_key
    b_doc["variant_label"] = "B"
    b_doc["views_count"] = 0
    b_doc["leads_count"] = 0
    b_doc["published"] = False
    b_doc["published_at"] = None
    b_doc["created_at"] = _iso()
    b_doc["updated_at"] = _iso()
    await db.studio_landings.insert_one(dict(b_doc))
    b_doc.pop("_id", None)

    group_id = f"lnd_ab_{uuid.uuid4().hex[:10]}"
    group_doc = {
        "id": group_id,
        "user_id": user_id,
        "project_id": base.get("project_id"),
        "variant_a_landing_id": base["id"],
        "variant_b_landing_id": b_doc["id"],
        "winner_id": None,
        "stats": {"a_views": 0, "b_views": 0, "a_leads": 0, "b_leads": 0,
                  "a_conv": 0.0, "b_conv": 0.0},
        "status": "active",
        "created_at": _iso(),
    }
    await db.studio_landing_ab_groups.insert_one(dict(group_doc))
    group_doc.pop("_id", None)

    await db.studio_landings.update_one(
        {"id": base["id"]},
        {"$set": {"ab_group_id": group_id, "variant_label": "A", "updated_at": _iso()}},
    )
    await db.studio_landings.update_one(
        {"id": b_doc["id"]},
        {"$set": {"ab_group_id": group_id, "updated_at": _iso()}},
    )
    return {"ok": True, "group": group_doc, "variant_b_landing_id": b_doc["id"]}


# ─── Tracking ─────────────────────────────────────────────────────────────────
async def record_landing_view(db, slug: str, ip: str = "", referrer: str = "") -> None:
    """Increment views · upsert daily counter."""
    try:
        date_iso = _now().strftime("%Y-%m-%d")
        ip_hash = _hash_ip(ip)
        from datetime import timedelta
        expires_at = _now() + timedelta(days=365)
        await db.studio_landing_views.update_one(
            {"slug": slug, "date_iso": date_iso},
            {
                "$inc": {"views_count": 1},
                "$setOnInsert": {"slug": slug, "date_iso": date_iso, "expires_at": expires_at},
                "$addToSet": {"unique_ip_hashes": ip_hash},
            },
            upsert=True,
        )
        await db.studio_landings.update_one(
            {"slug": slug},
            {"$inc": {"views_count": 1}, "$set": {"last_view_at": _iso()}},
        )

        # Update A/B group stats
        landing = await db.studio_landings.find_one({"slug": slug}, {"_id": 0, "ab_group_id": 1, "variant_label": 1})
        if landing and landing.get("ab_group_id"):
            arm = "a" if landing.get("variant_label") == "A" else "b"
            await db.studio_landing_ab_groups.update_one(
                {"id": landing["ab_group_id"]},
                {"$inc": {f"stats.{arm}_views": 1}},
            )
    except Exception as exc:
        log.warning(f"[record_landing_view] failed (soft) slug={slug}: {exc}")


async def submit_landing_lead(
    db, slug: str, payload: Dict[str, Any], ip: str = "", referrer: str = ""
) -> Dict[str, Any]:
    """Captura lead · rate-limit 5/min/IP per slug · feeds leads collection."""
    landing = await db.studio_landings.find_one(
        {"slug": slug, "deleted": {"$ne": True}, "published": True}, {"_id": 0}
    )
    if not landing:
        return {"ok": False, "error": "landing_not_found_or_unpublished"}

    ip_hash = _hash_ip(ip)
    from datetime import timedelta
    cutoff = _now() - timedelta(seconds=LEAD_RATE_LIMIT_SECONDS)
    recent = await db.studio_landing_leads.count_documents({
        "slug": slug,
        "ip_hash": ip_hash,
        "created_at": {"$gte": cutoff.isoformat()},
    })
    if recent >= 5:
        return {"ok": False, "error": "rate_limited", "message": "Demasiados envios. Intenta de nuevo en un minuto."}

    # Dedup last 60s same IP + same email
    email = (payload.get("email") or "").strip().lower()
    if email:
        dup = await db.studio_landing_leads.find_one({
            "slug": slug, "ip_hash": ip_hash, "payload.email": email,
            "created_at": {"$gte": cutoff.isoformat()},
        }, {"_id": 0, "id": 1})
        if dup:
            return {"ok": True, "deduped": True, "message": landing["content"]["lead_form"].get("success_message", "Recibido.")}

    lead_id = _uid("lndlead")
    lead_doc = {
        "id": lead_id,
        "slug": slug,
        "landing_id": landing["id"],
        "tenant_id": landing.get("tenant_id"),
        "owner_user_id": landing.get("user_id"),
        "payload": {k: str(v)[:500] for k, v in payload.items()},
        "ip_hash": ip_hash,
        "referrer": (referrer or "")[:200],
        "created_at": _iso(),
    }
    await db.studio_landing_leads.insert_one(dict(lead_doc))

    # Z.8.5 — Infer DISC profile + apply routing config
    try:
        from disc_inferencer_landing import infer_disc_from_lead
        inferred_disc = infer_disc_from_lead(payload)
        if inferred_disc:
            payload["disc"] = inferred_disc
    except Exception:
        pass
    routing_decision = await route_lead(db, landing, payload)

    # Mirror al pipeline central `leads` (fire-and-forget · sin romper si falla)
    try:
        from datetime import datetime as _dt
        leads_doc = {
            "id": f"lead_{uuid.uuid4().hex[:12]}",
            "first_name": (payload.get("nombre") or payload.get("name") or "").split(" ")[0][:80],
            "last_name": " ".join((payload.get("nombre") or "").split(" ")[1:])[:80],
            "email": email or None,
            "phone": (payload.get("telefono") or payload.get("phone") or "")[:40],
            "status_v2": "nuevo" if not routing_decision.get("pending") else "pending_assignment",
            "source": f"landing_{slug}",
            "origin": "landing_z8",
            "assigned_to": routing_decision.get("assigned_to") or landing.get("user_id"),
            "routing_strategy": routing_decision.get("strategy"),
            "routing_reason": routing_decision.get("reason"),
            "disc_inferred": payload.get("disc"),
            "notes": (payload.get("mensaje") or payload.get("message") or "")[:500],
            "nurture_active": True,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.leads.insert_one(dict(leads_doc))
    except Exception as exc:
        log.warning(f"[submit_landing_lead] mirror to leads failed (soft): {exc}")

    # Lead nurture feed (fire-and-forget)
    try:
        from lead_journey_engine import emit_step
        await emit_step(
            db,
            lead_id=lead_id,
            tenant_id=landing.get("tenant_id"),
            step_type="captured",
            actor_type="system",
            actor_id="studio_landing_engine",
            payload={"source": f"landing_{slug}", "ip_hash": ip_hash},
        )
    except Exception:
        pass

    # Update counters
    await db.studio_landings.update_one(
        {"slug": slug},
        {"$inc": {"leads_count": 1}, "$set": {"last_lead_at": _iso()}},
    )
    date_iso = _now().strftime("%Y-%m-%d")
    await db.studio_landing_views.update_one(
        {"slug": slug, "date_iso": date_iso},
        {"$inc": {"leads_count": 1}},
        upsert=True,
    )
    if landing.get("ab_group_id"):
        arm = "a" if landing.get("variant_label") == "A" else "b"
        await db.studio_landing_ab_groups.update_one(
            {"id": landing["ab_group_id"]},
            {"$inc": {f"stats.{arm}_leads": 1}},
        )

    return {
        "ok": True,
        "lead_id": lead_id,
        "message": landing["content"]["lead_form"].get("success_message", "Gracias."),
    }


# ─── A/B Stats (Chi-square reuse Z.2 pattern) ─────────────────────────────────
CHI2_THRESHOLD = 3.84  # p<0.05, df=1
MIN_EVENTS_PER_ARM = 30


def _chi_square(a_conv: int, a_total: int, b_conv: int, b_total: int) -> Dict[str, Any]:
    if a_total < MIN_EVENTS_PER_ARM or b_total < MIN_EVENTS_PER_ARM:
        return {"stat": 0.0, "significant": False, "winner": None,
                "reason": f"Insuficientes vistas: A={a_total}, B={b_total} (min {MIN_EVENTS_PER_ARM})"}
    a_no = a_total - a_conv
    b_no = b_total - b_conv
    n = a_total + b_total
    e_a_conv = (a_conv + b_conv) * a_total / n
    e_b_conv = (a_conv + b_conv) * b_total / n
    e_a_no = (a_no + b_no) * a_total / n
    e_b_no = (a_no + b_no) * b_total / n

    def _term(o, e):
        return (o - e) ** 2 / e if e else 0.0

    chi2 = _term(a_conv, e_a_conv) + _term(b_conv, e_b_conv) + _term(a_no, e_a_no) + _term(b_no, e_b_no)
    sig = chi2 >= CHI2_THRESHOLD
    winner = None
    if sig:
        ra = a_conv / a_total if a_total else 0
        rb = b_conv / b_total if b_total else 0
        winner = "A" if ra >= rb else "B"
    return {"stat": round(chi2, 4), "significant": sig, "winner": winner}


# ─── Z.8.5 · Analytics events (scroll · section_visible · click) ─────────────
ANALYTICS_EVENT_TYPES = ("scroll_depth", "section_visible", "click", "cta_click", "time_on_section", "lead_form_focus")


async def record_landing_analytics(db, slug: str, events: List[Dict[str, Any]], ip: str = "") -> Dict[str, Any]:
    """Z.8.5 — Batch insert analytics events (TTL 365d auto-expire)."""
    if not events or not slug:
        return {"ok": True, "inserted": 0}
    from datetime import timedelta
    expires_at = _now() + timedelta(days=365)
    docs: List[Dict[str, Any]] = []
    for ev in events[:50]:  # cap 50 events/batch
        etype = (ev.get("type") or "").strip()
        if etype not in ANALYTICS_EVENT_TYPES:
            continue
        docs.append({
            "id": f"ana_{uuid.uuid4().hex[:12]}",
            "slug": slug,
            "type": etype,
            "section_id": (ev.get("section_id") or "")[:80],
            "section_type": (ev.get("section_type") or "")[:40],
            "value": ev.get("value"),
            "depth_pct": ev.get("depth_pct"),
            "duration_ms": ev.get("duration_ms"),
            "ip_hash": _hash_ip(ip),
            "created_at": _iso(),
            "expires_at": expires_at,
        })
    if not docs:
        return {"ok": True, "inserted": 0}
    try:
        await db.studio_landing_analytics.insert_many(docs, ordered=False)
        return {"ok": True, "inserted": len(docs)}
    except Exception as exc:
        log.warning(f"[record_landing_analytics] failed (soft): {exc}")
        return {"ok": False, "error": str(exc)}


async def get_landing_analytics_summary(db, landing_id: str, user_id: str, days: int = 30) -> Dict[str, Any]:
    """Z.8.5 — Summary stats: scroll depth avg · sections heat · CTAs."""
    landing = await get_landing(db, landing_id, user_id)
    if not landing:
        return {"ok": False, "error": "Landing no encontrada"}
    slug = landing.get("slug")
    from datetime import timedelta
    cutoff = (_now() - timedelta(days=days)).isoformat()
    try:
        # Aggregate by type
        cur = db.studio_landing_analytics.aggregate([
            {"$match": {"slug": slug, "created_at": {"$gte": cutoff}}},
            {"$group": {"_id": {"type": "$type", "section_type": "$section_type"}, "count": {"$sum": 1}, "avg_value": {"$avg": "$value"}, "avg_depth": {"$avg": "$depth_pct"}, "avg_duration": {"$avg": "$duration_ms"}}},
        ])
        rows = await cur.to_list(200)
    except Exception as exc:
        log.warning(f"[get_landing_analytics_summary] failed (soft): {exc}")
        rows = []

    section_views: Dict[str, int] = {}
    cta_clicks = 0
    scroll_samples: List[float] = []
    section_time: Dict[str, float] = {}
    for r in rows:
        key = r["_id"]
        if key["type"] == "section_visible" and key.get("section_type"):
            section_views[key["section_type"]] = section_views.get(key["section_type"], 0) + r["count"]
        elif key["type"] == "cta_click":
            cta_clicks += r["count"]
        elif key["type"] == "scroll_depth" and r.get("avg_depth"):
            scroll_samples.append(r["avg_depth"])
        elif key["type"] == "time_on_section" and key.get("section_type") and r.get("avg_duration"):
            section_time[key["section_type"]] = r["avg_duration"]

    avg_scroll = (sum(scroll_samples) / len(scroll_samples)) if scroll_samples else 0
    return {
        "ok": True,
        "slug": slug,
        "days": days,
        "section_views_heat": section_views,
        "section_avg_time_ms": section_time,
        "cta_clicks": cta_clicks,
        "avg_scroll_depth_pct": round(avg_scroll, 1),
        "views_total": landing.get("views_count", 0),
        "leads_total": landing.get("leads_count", 0),
        "conversion_rate_pct": round((landing.get("leads_count", 0) / max(1, landing.get("views_count", 0)) * 100), 2),
    }


# ─── Z.8.5 · A/B winner pick basado en lead quality (no solo clicks) ─────────
async def ab_winner_by_lead_quality(db, group_id: str, user_id: str) -> Dict[str, Any]:
    """Pick winner usando weighted score:
        rate * 0.6 + completeness_score * 0.3 + disc_alignment * 0.1
    completeness_score: leads con campos completos (email + telefono + mensaje)
    disc_alignment: leads con disc_inferred = template.disc_target
    """
    group = await db.studio_landing_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return {"ok": False, "error": "Grupo A/B no encontrado"}
    a_id = group.get("variant_a_landing_id")
    b_id = group.get("variant_b_landing_id")
    stats = group.get("stats") or {}
    a_views = stats.get("a_views", 0)
    b_views = stats.get("b_views", 0)
    a_leads = stats.get("a_leads", 0)
    b_leads = stats.get("b_leads", 0)
    if a_views < MIN_EVENTS_PER_ARM or b_views < MIN_EVENTS_PER_ARM:
        return {"ok": False, "error": f"Insuficientes vistas (min {MIN_EVENTS_PER_ARM} por arm)"}

    a_rate = a_leads / max(1, a_views)
    b_rate = b_leads / max(1, b_views)

    async def _quality_score(lid: str) -> Dict[str, float]:
        try:
            leads = await db.leads.find({"assigned_to": {"$exists": True}, "source": {"$regex": f"^landing_"}}, {"_id": 0, "email": 1, "phone": 1, "notes": 1, "disc_inferred": 1, "source": 1}).to_list(1000)
        except Exception:
            leads = []
        ll = [l for l in leads if l.get("source") == f"landing_{lid}" or l.get("source", "").endswith(lid)]
        if not ll:
            return {"completeness": 0, "disc_alignment": 0, "count": 0}
        complete = sum(1 for l in ll if l.get("email") and l.get("phone") and (l.get("notes") or "").strip())
        completeness = complete / len(ll)
        # disc_alignment: por template disc_target
        target_disc = None
        try:
            la = await db.studio_landings.find_one({"id": lid}, {"_id": 0, "template_key": 1})
            if la:
                from studio_landing_property_templates import get_property_template_spec
                spec = get_property_template_spec(la.get("template_key", "modern"))
                target_disc = (spec.get("disc_target") or "")[:1]
        except Exception:
            pass
        aligned = sum(1 for l in ll if (l.get("disc_inferred") or "") == target_disc) if target_disc else 0
        disc_alignment = aligned / len(ll) if ll else 0
        return {"completeness": completeness, "disc_alignment": disc_alignment, "count": len(ll)}

    qa = await _quality_score(a_id)
    qb = await _quality_score(b_id)
    a_score = a_rate * 0.6 + qa["completeness"] * 0.3 + qa["disc_alignment"] * 0.1
    b_score = b_rate * 0.6 + qb["completeness"] * 0.3 + qb["disc_alignment"] * 0.1
    winner = "A" if a_score >= b_score else "B"
    winner_id = a_id if winner == "A" else b_id
    delta_pct = abs(a_score - b_score) * 100
    return {
        "ok": True,
        "winner": winner,
        "winner_landing_id": winner_id,
        "a_score": round(a_score, 4),
        "b_score": round(b_score, 4),
        "a_quality": qa,
        "b_quality": qb,
        "delta_pct": round(delta_pct, 2),
        "method": "lead_quality_weighted",
    }


async def get_ab_stats(db, group_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    group = await db.studio_landing_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return None
    stats = group.get("stats") or {}
    a_views = stats.get("a_views", 0)
    b_views = stats.get("b_views", 0)
    a_leads = stats.get("a_leads", 0)
    b_leads = stats.get("b_leads", 0)
    chi = _chi_square(a_leads, a_views, b_leads, b_views)
    rate_a = round(a_leads / a_views * 100, 2) if a_views else 0
    rate_b = round(b_leads / b_views * 100, 2) if b_views else 0
    return {
        **group,
        "chi_square": chi,
        "conversion_rate_a": rate_a,
        "conversion_rate_b": rate_b,
        "auto_winner": chi.get("winner"),
        "can_declare": chi.get("significant", False),
    }


async def declare_ab_winner(
    db, group_id: str, user_id: str, winner_variant: Optional[str] = None
) -> Dict[str, Any]:
    group = await db.studio_landing_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return {"ok": False, "error": "Grupo A/B no encontrado"}
    if winner_variant in ("A", "B"):
        winner_id = (group["variant_a_landing_id"] if winner_variant == "A"
                     else group["variant_b_landing_id"])
    else:
        stats = group.get("stats") or {}
        chi = _chi_square(
            stats.get("a_leads", 0), stats.get("a_views", 0),
            stats.get("b_leads", 0), stats.get("b_views", 0),
        )
        if not chi.get("significant"):
            return {"ok": False, "error": chi.get("reason", "Prueba no significativa aun")}
        w = chi.get("winner")
        winner_id = (group["variant_a_landing_id"] if w == "A"
                     else group["variant_b_landing_id"])
    await db.studio_landing_ab_groups.update_one(
        {"id": group_id},
        {"$set": {"winner_id": winner_id, "status": "stopped", "decided_at": _iso()}},
    )
    return {"ok": True, "winner_landing_id": winner_id, "group_id": group_id}


# ─── Brand kit lookup helper ──────────────────────────────────────────────────
async def fetch_brand_kit(db, brand_kit_id: Optional[str], user_id: str) -> Optional[Dict[str, Any]]:
    if not brand_kit_id:
        # Fallback: kit activo del user
        kit = await db.brand_kits.find_one(
            {"user_id": user_id, "is_active": True}, {"_id": 0}
        )
        return kit
    return await db.brand_kits.find_one({"id": brand_kit_id, "user_id": user_id}, {"_id": 0})
