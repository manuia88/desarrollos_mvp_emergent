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
            from routes.public_zones import get_zone_public
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

    # W5.ASR.5 — Extraer UTM de query params
    try:
        from lead_capture_engine import extract_utm_from_request
        utm_fields = extract_utm_from_request(request)
    except Exception:
        utm_fields = {}

    doc = {
        "lead_id": f"land_{secrets.token_urlsafe(10)}",
        "email": email,
        "zone_interest": zone,
        "notes": (body.notes or "")[:500],
        "source_url": (body.source_url or "")[:500],
        "ip_hash": _hash_ip(request),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_inventory",
        **utm_fields,
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
        await db.landing_leads.create_index(
            "last_nurture_sent_at", background=True, sparse=True,
        )
    except Exception as e:
        log.warning(f"[landings] index create failed: {e}")


# ─── Superadmin dashboard endpoints (W4.2D3.5) ────────────────────────────────
sa_router = APIRouter(prefix="/api/superadmin/landing-leads", tags=["superadmin-landing-leads"])


async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


def _zone_interest_to_page_type(zi: str) -> str:
    if zi.startswith("zone-"):
        return "colonia"
    if zi.startswith("alcaldia-"):
        return "alcaldia"
    if zi.startswith("intent-"):
        return "intent"
    return "other"


def _zone_interest_slug(zi: str) -> str:
    for prefix in ("zone-", "alcaldia-", "intent-"):
        if zi.startswith(prefix):
            return zi[len(prefix):]
    return zi


@sa_router.get("")
async def list_landing_leads(
    request: Request,
    zone_interest: Optional[str] = None,
    page_type: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = 200,
):
    """Listado paginado de landing_leads con filtros opcionales."""
    await _require_superadmin(request)
    db = request.app.state.db

    q: Dict[str, Any] = {}
    if zone_interest:
        q["zone_interest"] = zone_interest.strip().lower()
    if since:
        q["created_at"] = {"$gte": since}

    # page_type filter via prefix match on zone_interest
    if page_type:
        prefix_map = {"colonia": "zone-", "alcaldia": "alcaldia-", "intent": "intent-"}
        prefix = prefix_map.get(page_type)
        if prefix:
            q["zone_interest"] = {"$regex": f"^{prefix}"}

    limit = max(1, min(500, int(limit)))
    docs = await db.landing_leads.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)

    items = []
    for d in docs:
        zi = d.get("zone_interest", "")
        items.append({
            "lead_id": d.get("lead_id"),
            "email": d.get("email"),
            "zone_interest": zi,
            "zone_slug": _zone_interest_slug(zi),
            "page_type": _zone_interest_to_page_type(zi),
            "notes": d.get("notes") or "",
            "source_url": d.get("source_url") or "",
            "created_at": d.get("created_at"),
            "status": d.get("status") or "pending_inventory",
            "last_nurture_sent_at": d.get("last_nurture_sent_at"),
        })

    total = await db.landing_leads.count_documents(q)
    return {"items": items, "total": total, "limit": limit}


@sa_router.get("/by-zone")
async def landing_leads_by_zone(request: Request):
    """Aggregation por zone_interest con count + last_lead_at."""
    await _require_superadmin(request)
    db = request.app.state.db

    pipeline = [
        {"$group": {
            "_id": "$zone_interest",
            "lead_count": {"$sum": 1},
            "last_lead_at": {"$max": "$created_at"},
            "first_lead_at": {"$min": "$created_at"},
        }},
        {"$sort": {"lead_count": -1, "last_lead_at": -1}},
        {"$limit": 200},
    ]
    rows = await db.landing_leads.aggregate(pipeline).to_list(length=200)
    out = []
    for r in rows:
        zi = r.get("_id", "")
        out.append({
            "zone_interest": zi,
            "zone_slug": _zone_interest_slug(zi),
            "page_type": _zone_interest_to_page_type(zi),
            "lead_count": r.get("lead_count", 0),
            "last_lead_at": r.get("last_lead_at"),
            "first_lead_at": r.get("first_lead_at"),
        })
    return {"items": out, "total_zones": len(out)}


@sa_router.get("/summary")
async def landing_leads_summary(request: Request):
    """KPI strip data: total leads, last 7d, unique zones, top zone."""
    await _require_superadmin(request)
    db = request.app.state.db

    total = await db.landing_leads.count_documents({})
    cutoff_7d = (datetime.now(timezone.utc).timestamp() - 7 * 86400)
    seven_d_iso = datetime.fromtimestamp(cutoff_7d, tz=timezone.utc).isoformat()
    last_7d = await db.landing_leads.count_documents({"created_at": {"$gte": seven_d_iso}})

    distinct_zones = await db.landing_leads.distinct("zone_interest")
    unique_zones = len(distinct_zones)

    top = None
    if total > 0:
        top_pipeline = [
            {"$group": {"_id": "$zone_interest", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 1},
        ]
        rows = await db.landing_leads.aggregate(top_pipeline).to_list(length=1)
        if rows:
            zi = rows[0].get("_id", "")
            top = {
                "zone_interest": zi,
                "zone_slug": _zone_interest_slug(zi),
                "page_type": _zone_interest_to_page_type(zi),
                "lead_count": rows[0].get("count", 0),
            }

    return {
        "total": total,
        "last_7d": last_7d,
        "unique_zones": unique_zones,
        "top_zone": top,
    }


@sa_router.get("/export.csv")
async def export_landing_leads_csv(
    request: Request,
    zone_interest: Optional[str] = None,
    page_type: Optional[str] = None,
    since: Optional[str] = None,
):
    """Stream CSV con todos los leads (filtrados opcionalmente)."""
    from fastapi.responses import StreamingResponse
    import csv
    import io

    await _require_superadmin(request)
    db = request.app.state.db

    q: Dict[str, Any] = {}
    if zone_interest:
        q["zone_interest"] = zone_interest.strip().lower()
    if since:
        q["created_at"] = {"$gte": since}
    if page_type:
        prefix_map = {"colonia": "zone-", "alcaldia": "alcaldia-", "intent": "intent-"}
        prefix = prefix_map.get(page_type)
        if prefix:
            q["zone_interest"] = {"$regex": f"^{prefix}"}

    docs = await db.landing_leads.find(q, {"_id": 0}).sort("created_at", -1).limit(10000).to_list(length=10000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["email", "zone_interest", "page_type", "zone_slug", "notes", "source_url", "created_at", "status"])
    for d in docs:
        zi = d.get("zone_interest", "")
        writer.writerow([
            d.get("email", ""),
            zi,
            _zone_interest_to_page_type(zi),
            _zone_interest_slug(zi),
            (d.get("notes") or "").replace("\n", " "),
            d.get("source_url") or "",
            d.get("created_at") or "",
            d.get("status") or "",
        ])

    buf.seek(0)
    headers = {
        "Content-Disposition": f'attachment; filename="landing_leads_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")}.csv"',
    }
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8", headers=headers)

