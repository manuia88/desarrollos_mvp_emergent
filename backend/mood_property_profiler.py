"""W5.x F10 · Mood Property Profiler.

Heurísticas determinísticas (NO LLM) para inferir mood_tags de una propiedad
en 5 dimensiones (calm, social, eclectic, modern, connected). Cache 7 días en
collection `property_mood_profiles`.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.mood_profiler")

PROFILE_COLLECTION = "property_mood_profiles"
PROFILE_TTL_DAYS = 7

DIMENSIONS = ["calm", "social", "eclectic", "modern", "connected"]

_CALM_QUIET = {"polanco", "lomas-chapultepec", "lomas", "san-angel",
                "san_angel", "coyoacan", "tlalpan", "pedregal"}
_CALM_BUZZY = {"roma-norte", "roma_norte", "condesa", "juarez", "centro"}
_SOCIAL_HOT = {"roma-norte", "roma_norte", "condesa", "juarez"}
_ECLECTIC_HOT = {"roma-norte", "roma_norte", "condesa", "coyoacan"}

_AMEN_CALM = {"alberca", "jardin", "jardines", "spa"}
_AMEN_SOCIAL = {"rooftop", "lounge", "sky_lounge", "club_house", "salon_eventos"}
_AMEN_CONNECTED = {"coworking", "lounge", "club_house"}

_NAME_BOUTIQUE_KW = ("loft", "atelier", "boutique", "concept")
_NAME_MODERN_KW = ("tower", "torre", "loft", "smart", "signature")
_NAME_TRADITIONAL_KW = ("colonial", "casa", "hacienda", "residencias")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _norm(s: Any) -> str:
    if not s:
        return ""
    return str(s).lower().strip()


def _construction_year(prop: Dict[str, Any]) -> Optional[int]:
    """Inferir año construcción de delivery_estimate (YYYY-MM) o campos directos."""
    for k in ("construction_year", "year_built", "year"):
        v = prop.get(k)
        if isinstance(v, int) and 1900 <= v <= 2100:
            return v
    de = prop.get("delivery_estimate") or ""
    m = re.match(r"(\d{4})", str(de))
    if m:
        try:
            y = int(m.group(1))
            if 1900 <= y <= 2100:
                return y
        except Exception:
            pass
    return None


def infer_property_mood(property_doc: Dict[str, Any]) -> Dict[str, float]:
    """Aplica heurísticas determinísticas · retorna dict 5 dimensiones [0,1]."""
    tags: Dict[str, float] = {d: 0.5 for d in DIMENSIONS}
    if not property_doc:
        return tags

    colonia = _norm(property_doc.get("colonia_id") or property_doc.get("colonia"))
    amenities = [_norm(a) for a in (property_doc.get("amenities") or [])]
    amen_set = set(amenities)
    name = _norm(property_doc.get("name"))
    description = _norm(property_doc.get("description"))
    name_desc = f"{name} {description}"
    units_total = int(property_doc.get("units_total") or 0)
    cyear = _construction_year(property_doc)

    # ─── calm ───
    if colonia in _CALM_QUIET:
        tags["calm"] += 0.3
    elif colonia in _CALM_BUZZY:
        tags["calm"] -= 0.2
    if amen_set & _AMEN_CALM:
        tags["calm"] += 0.1

    # ─── social ───
    if colonia in _SOCIAL_HOT:
        tags["social"] += 0.3
    if amen_set & _AMEN_SOCIAL:
        tags["social"] += 0.2
    if 0 < units_total < 10:
        tags["social"] -= 0.2

    # ─── eclectic ───
    if any(k in name_desc for k in ("moderno minimalista", "loft", "concept")):
        tags["eclectic"] -= 0.2
    if colonia in _ECLECTIC_HOT:
        tags["eclectic"] += 0.2
    if cyear and cyear >= 2020:
        tags["eclectic"] -= 0.1

    # ─── modern ───
    if cyear:
        if cyear >= 2020:
            tags["modern"] += 0.3
        elif cyear < 2000:
            tags["modern"] -= 0.3
    if any(k in name for k in _NAME_MODERN_KW):
        tags["modern"] += 0.2
    if any(k in name for k in _NAME_TRADITIONAL_KW):
        tags["modern"] -= 0.2

    # ─── connected ───
    if units_total > 50:
        tags["connected"] += 0.2
    if amen_set & _AMEN_CONNECTED:
        tags["connected"] += 0.2
    if 0 < units_total <= 10:
        tags["connected"] -= 0.2

    # Clamp + round
    return {d: round(_clamp(tags[d]), 3) for d in DIMENSIONS}


def build_vibe_summary(mood_tags: Dict[str, float]) -> str:
    """Adjetiva la propiedad con las 3 dimensiones más extremas (mayor |0.5-v|)."""
    adj_map = {
        "calm": {"high": "tranquilo", "low": "energético", "mid": "balanceado"},
        "social": {"high": "social", "low": "íntimo", "mid": "versátil"},
        "eclectic": {"high": "ecléctico", "low": "minimalista", "mid": "clásico"},
        "modern": {"high": "moderno", "low": "tradicional", "mid": "atemporal"},
        "connected": {"high": "conectado", "low": "privado", "mid": "equilibrado"},
    }
    ranked = sorted(
        DIMENSIONS, key=lambda d: abs(float(mood_tags.get(d, 0.5)) - 0.5), reverse=True
    )
    parts: List[str] = []
    for d in ranked[:3]:
        v = float(mood_tags.get(d, 0.5))
        if v >= 0.6:
            parts.append(adj_map[d]["high"])
        elif v <= 0.4:
            parts.append(adj_map[d]["low"])
        else:
            parts.append(adj_map[d]["mid"])
    return "Espacio " + ", ".join(parts[:2]) + (f" y {parts[2]}" if len(parts) > 2 else "")


async def _fetch_property(db, property_id: str) -> Optional[Dict[str, Any]]:
    """Lookup DEVELOPMENTS_BY_ID first, fallback db.developments."""
    if not property_id:
        return None
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        dev = DEVELOPMENTS_BY_ID.get(property_id)
        if dev:
            return dev
    except Exception:
        pass
    if db is None:
        return None
    try:
        return await db.developments.find_one(
            {"$or": [{"id": property_id}, {"_id": property_id}, {"slug": property_id}]},
            {"_id": 0},
        )
    except Exception:
        return None


async def get_or_build_profile(
    db, property_id: str, force_refresh: bool = False
) -> Optional[Dict[str, Any]]:
    """Retorna {property_id, mood_tags, vibe_summary, photo_url, name} o None."""
    if not property_id:
        return None
    now = _now()

    # Cache check
    if db is not None and not force_refresh:
        try:
            cached = await db[PROFILE_COLLECTION].find_one(
                {"property_id": property_id}, {"_id": 0}
            )
            if cached:
                ttl = cached.get("ttl_until")
                if isinstance(ttl, datetime) and ttl > now:
                    return cached
        except Exception as e:
            log.debug(f"[mood_profiler] cache read fail: {e}")

    prop = await _fetch_property(db, property_id)
    if not prop:
        return None

    tags = infer_property_mood(prop)
    summary = build_vibe_summary(tags)
    photos = prop.get("photos") or []
    photo_url = photos[0] if isinstance(photos, list) and photos else None

    doc = {
        "property_id": property_id,
        "name": prop.get("name") or property_id,
        "mood_tags": tags,
        "vibe_summary": summary,
        "photo_url": photo_url,
        "generated_at": now,
        "ttl_until": now + timedelta(days=PROFILE_TTL_DAYS),
    }
    if db is not None:
        try:
            await db[PROFILE_COLLECTION].update_one(
                {"property_id": property_id}, {"$set": doc}, upsert=True
            )
        except Exception as e:
            log.debug(f"[mood_profiler] cache write fail: {e}")
    return doc
