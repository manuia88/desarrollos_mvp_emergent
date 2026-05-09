"""W4.2D3 — Programmatic SEO Tier 1+2 backend routes.

Public endpoints (sin auth) que alimentan landing pages SEO:
  - GET  /api/public/landing/colonia/{slug}    → datos colonia (full IE si disponible, sino metadata + comparables)
  - GET  /api/public/landing/alcaldia/{slug}   → datos alcaldía + colonias hijas
  - GET  /api/public/landing/intent/{intent}   → datos intent (preventa, casas, etc) + top colonias + recent devs
  - POST /api/public/landing/lead              → lead capture form (email + zone_interest)

Anti-doorway: cada response sin inventario incluye comparable_colonias para que la
página tenga valor único más allá de un mero placeholder.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from seo_landings_config import (
    COLONIAS_TARGET,
    ALCALDIAS_CDMX,
    INTENT_LANDINGS,
    colonias_by_alcaldia,
    top_colonias_with_data,
    comparable_colonias,
)

log = logging.getLogger("dmx.routes_landings")

router = APIRouter(prefix="/api/public/landing", tags=["public-landings"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ─── Colonia landing ──────────────────────────────────────────────────────────
@router.get("/colonia/{slug}")
async def get_colonia_landing(slug: str, request: Request) -> Dict[str, Any]:
    """Datos para /zona/{slug}. Si has_ie_data=True devuelve el shape completo
    de routes_public_zones.get_zone_public; si False devuelve metadata + comparables
    para anti-doorway."""
    info = COLONIAS_TARGET.get(slug)
    if not info:
        raise HTTPException(404, f"Colonia '{slug}' no está en COLONIAS_TARGET")

    if info.get("has_ie_data"):
        # Reuse W4.2D2 endpoint: forward call internally for full data.
        try:
            from routes_public_zones import get_zone_public
            payload = await get_zone_public(slug, request)
            payload["has_ie_data"] = True
            payload["landing_tier"] = "tier1"
            return payload
        except HTTPException:
            # Fall through to tier2 graceful response.
            pass

    # Tier 2: anti-doorway — metadata + comparables + lead capture flag.
    comps = comparable_colonias(info["alcaldia_slug"], exclude_slug=slug, limit=4)
    return {
        "slug": slug,
        "name": info["name"],
        "alcaldia": info["alcaldia"],
        "alcaldia_slug": info["alcaldia_slug"],
        "has_ie_data": False,
        "landing_tier": "tier2",
        "tier": None,
        "ie_scores_summary": None,
        "drpi": None,
        "risk_score": None,
        "demographics": None,
        "active_developments": 0,
        "comparable_colonias": comps,
        "lead_capture_enabled": True,
    }


# ─── Alcaldía landing ─────────────────────────────────────────────────────────
@router.get("/alcaldia/{slug}")
async def get_alcaldia_landing(slug: str, request: Request) -> Dict[str, Any]:
    """Datos para /alcaldia/{slug} — hero + grid de colonias hijas + comparables."""
    name = ALCALDIAS_CDMX.get(slug)
    if not name:
        raise HTTPException(404, f"Alcaldía '{slug}' no encontrada")

    children = colonias_by_alcaldia(slug)
    children_with_data = [c for c in children if c.get("has_ie_data")]
    children_pending = [c for c in children if not c.get("has_ie_data")]

    # Top comparables con IE data (si la alcaldía no tiene seedeadas, fallback a global top).
    comps = comparable_colonias(slug, limit=4)
    if not children_with_data and not comps:
        comps = top_colonias_with_data(limit=4)

    db = request.app.state.db  # noqa: F841 — reserved for future tenant filter
    # Active developments count via data_developments by alcaldia (best effort).
    active_developments = 0
    try:
        from data_developments import DEVELOPMENTS
        from data_seed import COLONIAS_BY_ID
        slugs_in_alcaldia = {
            c_id for c_id, c in COLONIAS_BY_ID.items()
            if (c.get("alcaldia") or "") == name
            or _slugify(c.get("alcaldia") or "") == slug
        }
        active_developments = sum(
            1 for d in DEVELOPMENTS if d.get("colonia_id") in slugs_in_alcaldia
        )
    except Exception as e:
        log.warning(f"[landings] alcaldia devs count failed for {slug}: {e}")

    return {
        "slug": slug,
        "name": name,
        "colonias_count": len(children),
        "colonias_with_data_count": len(children_with_data),
        "colonias_pending_count": len(children_pending),
        "colonias_with_data": children_with_data,
        "colonias_pending": children_pending,
        "comparable_colonias": comps,
        "active_developments": active_developments,
        "lead_capture_enabled": len(children_with_data) == 0,
    }


def _slugify(s: str) -> str:
    """Lightweight slug helper — replicates COLONIAS_TARGET alcaldia_slug format."""
    if not s:
        return ""
    s = s.lower()
    repl = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n",
        " ": "-", ".": "", ",": "",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    return re.sub(r"[^a-z0-9-]", "", s)


# ─── Intent landing ───────────────────────────────────────────────────────────
@router.get("/intent/{intent}")
async def get_intent_landing(intent: str, request: Request) -> Dict[str, Any]:
    """Datos para /cdmx/{intent} — top colonias + recent devs filtrados por stage/tipo."""
    cfg = INTENT_LANDINGS.get(intent)
    if not cfg:
        raise HTTPException(404, f"Intent '{intent}' no soportado")

    top = top_colonias_with_data(limit=8)

    # Recent developments filtered by intent
    recent_devs: List[Dict[str, Any]] = []
    try:
        from data_developments import DEVELOPMENTS
        stage_f = cfg.get("stage_filter")
        tipo_f = cfg.get("tipo_filter")
        for d in DEVELOPMENTS:
            if stage_f and (d.get("stage") or "").lower() != stage_f:
                continue
            if tipo_f:
                tipo_dev = (d.get("tipo") or d.get("property_type") or "").lower()
                if tipo_dev != tipo_f:
                    continue
            recent_devs.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "colonia_id": d.get("colonia_id"),
                "stage": d.get("stage"),
                "price_from_mxn": d.get("price_from") or d.get("price_from_mxn"),
            })
            if len(recent_devs) >= 12:
                break
    except Exception as e:
        log.warning(f"[landings] intent recent_devs failed for {intent}: {e}")

    return {
        "intent": intent,
        "label": cfg["label"],
        "title": cfg["title"],
        "description": cfg["description"],
        "stage_filter": cfg.get("stage_filter"),
        "tipo_filter": cfg.get("tipo_filter"),
        "top_colonias": top,
        "recent_developments": recent_devs,
        "recent_developments_count": len(recent_devs),
    }


# ─── Lead capture ─────────────────────────────────────────────────────────────
class LandingLeadIn(BaseModel):
    email: str
    zone_interest: str = Field(..., description="zone-{slug} | alcaldia-{slug} | intent-{slug}")
    notes: Optional[str] = ""
    source_url: Optional[str] = ""


@router.post("/lead", status_code=201)
async def submit_landing_lead(body: LandingLeadIn, request: Request) -> Dict[str, Any]:
    """Captura lead desde landing page sin inventario.
    Persiste en db.landing_leads + emite system_event watchlist-style."""
    email = (body.email or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        raise HTTPException(400, "Email inválido")

    zone = (body.zone_interest or "").strip().lower()
    if not zone:
        raise HTTPException(400, "zone_interest requerido")

    db = request.app.state.db
    doc = {
        "lead_id": f"land_{secrets.token_urlsafe(10)}",
        "email": email,
        "zone_interest": zone,
        "notes": (body.notes or "")[:500],
        "source_url": (body.source_url or "")[:500],
        "ip_hash": _hash_ip(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_inventory",
    }
    try:
        await db.landing_leads.insert_one(doc)
    except Exception as e:
        log.warning(f"[landings] lead insert failed: {e}")
        raise HTTPException(500, "No se pudo registrar la suscripción")

    # Audit / observability hook (best effort).
    try:
        await db.audit_logs.insert_one({
            "user_id": None,
            "action": "landing_lead_subscribed",
            "resource": zone,
            "data": {"email": email, "source_url": doc["source_url"]},
            "ts": datetime.now(timezone.utc),
        })
    except Exception:
        pass

    return {"ok": True, "lead_id": doc["lead_id"], "message": "Te avisaremos cuando publiquemos inventario."}


def _hash_ip(request: Request) -> str:
    import hashlib
    ip = request.client.host if request.client else "0.0.0.0"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        ip = fwd.split(",")[0].strip()
    return hashlib.sha256(ip.encode()).hexdigest()[:20]


async def ensure_landing_indexes(db) -> None:
    """db.landing_leads indexes (idempotent)."""
    try:
        await db.landing_leads.create_index("email", background=True)
        await db.landing_leads.create_index("zone_interest", background=True)
        await db.landing_leads.create_index("created_at", background=True)
    except Exception as e:
        log.warning(f"[landings] index create failed: {e}")
