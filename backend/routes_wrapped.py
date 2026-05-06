"""Phase 4 Batch 30 · routes — Wrapped Mensual + Smart Match.

Endpoints:
  GET  /api/comprador/wrapped               → list user's wrappeds (last 24)
  GET  /api/comprador/wrapped/{year_month}  → específico (auth buyer)
  POST /api/comprador/wrapped/annual-optin  → generar anual on-demand
  POST /api/comprador/wrapped/{id}/share    → genera URL share + og:image
  GET  /api/comprador/smart-match           → match score vs quiz answers
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_wrapped")

router = APIRouter(tags=["comprador-wrapped"])


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


async def _require_buyer(request: Request):
    from server import require_auth
    user = await require_auth(request)
    if user.role not in ("buyer", "superadmin"):
        raise HTTPException(403, "Acceso solo para compradores")
    return user


# ─── Pydantic models ─────────────────────────────────────────────────────────

class AnnualOptinBody(BaseModel):
    year: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _clean_wrapped(doc: Dict) -> Dict:
    doc.pop("_id", None)
    for k in ("generated_at", "viewed_at"):
        doc[k] = _iso(doc.get(k))
    return doc


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/comprador/wrapped")
async def list_wrapped(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    docs = await db.buyer_wrapped.find(
        {"user_id": user.user_id},
        {"_id": 0},
    ).sort("year_month", -1).limit(24).to_list(24)
    return [_clean_wrapped(d) for d in docs]


@router.get("/api/comprador/wrapped/{year_month}")
async def get_wrapped(year_month: str, request: Request, user=Depends(_require_buyer)):
    db = _db(request)

    # Special value 'latest' → return most recent
    if year_month == "latest":
        doc = await db.buyer_wrapped.find_one(
            {"user_id": user.user_id},
            {"_id": 0},
            sort=[("year_month", -1)],
        )
        if not doc:
            raise HTTPException(404, "Sin wrappeds generados aún")
        # Mark as viewed
        await db.buyer_wrapped.update_one(
            {"wrapped_id": doc["wrapped_id"]},
            {"$set": {"viewed_at": _now()}},
        )
        doc["viewed_at"] = _iso(_now())
        return _clean_wrapped(doc)

    # Try to get existing
    doc = await db.buyer_wrapped.find_one(
        {"user_id": user.user_id, "year_month": year_month},
        {"_id": 0},
    )

    if not doc:
        # Generate on-demand (month or annual)
        if year_month.endswith("-annual"):
            try:
                year = int(year_month.replace("-annual", ""))
            except Exception:
                raise HTTPException(400, "Formato inválido. Usa YYYY-annual")
            from services.wrapped_generator import generate_annual_wrapped
            doc = await generate_annual_wrapped(db, user.user_id, year)
        else:
            from services.wrapped_generator import generate_monthly_wrapped
            doc = await generate_monthly_wrapped(db, user.user_id, year_month)

        if not doc:
            raise HTTPException(404, "Sin actividad para ese período o wrapped no disponible")

    # Mark as viewed
    if not doc.get("viewed_at"):
        await db.buyer_wrapped.update_one(
            {"wrapped_id": doc["wrapped_id"]},
            {"$set": {"viewed_at": _now()}},
        )
        doc["viewed_at"] = _iso(_now())

    # Log activity
    try:
        from routes_dev_batch14 import log_activity
        await log_activity(
            db, actor_id=user.user_id, actor_type="buyer",
            action="wrapped_viewed", entity_id=doc["wrapped_id"],
            entity_type="buyer_wrapped",
        )
    except Exception:
        pass

    return _clean_wrapped(doc)


@router.post("/api/comprador/wrapped/annual-optin")
async def annual_optin(body: AnnualOptinBody, request: Request, user=Depends(_require_buyer)):
    if body.year < 2024 or body.year > 2030:
        raise HTTPException(400, "Año inválido")
    db = _db(request)
    from services.wrapped_generator import generate_annual_wrapped
    doc = await generate_annual_wrapped(db, user.user_id, body.year)
    if not doc:
        raise HTTPException(404, "Sin actividad para ese año")
    return doc


@router.post("/api/comprador/wrapped/{wrapped_id}/share")
async def share_wrapped(wrapped_id: str, request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    doc = await db.buyer_wrapped.find_one(
        {"wrapped_id": wrapped_id, "user_id": user.user_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Wrapped no encontrado")

    # Increment share count
    await db.buyer_wrapped.update_one(
        {"wrapped_id": wrapped_id},
        {"$inc": {"shared_count": 1}},
    )

    # Build share URL + og:image via routes_share_meta pattern
    year_month = doc.get("year_month", "")
    share_url = f"/comprador/wrapped/{year_month}"

    # Simple og:image using PIL
    og_image_url = None
    try:
        api_url = request.app.state.public_url if hasattr(request.app.state, "public_url") else ""
        og_image_url = f"{api_url}/api/comprador/wrapped/{wrapped_id}/og-image"
    except Exception:
        pass

    return {
        "share_url": share_url,
        "og_image_url": og_image_url,
        "title": f"Mi Wrapped {year_month} · DesarrollosMX",
        "description": doc.get("narrative_text", "")[:100],
    }


@router.get("/api/comprador/wrapped/{wrapped_id}/og-image")
async def wrapped_og_image(wrapped_id: str, request: Request, user=Depends(_require_buyer)):
    """Genera og:image PNG para el wrapped."""
    db = _db(request)
    doc = await db.buyer_wrapped.find_one(
        {"wrapped_id": wrapped_id, "user_id": user.user_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Wrapped no encontrado")

    try:
        from PIL import Image, ImageDraw, ImageFont
        import io

        stats = doc.get("stats", {})
        year_month = doc.get("year_month", "")
        n = stats.get("properties_viewed", 0)
        top_zona = stats.get("top_zonas", [{}])[0].get("zona", "") if stats.get("top_zonas") else ""

        img = Image.new("RGB", (1200, 630), color=(6, 8, 15))
        draw = ImageDraw.Draw(img)

        # Gradient-ish bg strip
        for x in range(1200):
            r = int(99 + (236 - 99) * x / 1200)
            g = int(102 + (72 - 102) * x / 1200)
            b = int(241 + (153 - 241) * x / 1200)
            for y in range(8):
                draw.point((x, y), fill=(r, g, b))

        draw.text((60, 60), "DesarrollosMX", fill=(240, 235, 224), font=None)
        draw.text((60, 110), f"Wrapped {year_month}", fill=(165, 180, 252), font=None)
        draw.text((60, 200), f"{n}", fill=(240, 235, 224), font=None)
        draw.text((60, 260), "propiedades vistas", fill=(240, 235, 224), font=None)
        if top_zona:
            draw.text((60, 360), f"Zona: {top_zona}", fill=(240, 235, 224), font=None)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")
    except Exception as e:
        log.warning(f"[wrapped] og-image error: {e}")
        raise HTTPException(500, "Error generando imagen")


@router.get("/api/comprador/smart-match")
async def get_smart_match(request: Request, user=Depends(_require_buyer)):
    db = _db(request)
    from services.smart_match import compute_buyer_match_score
    result = await compute_buyer_match_score(db, user.user_id)
    return result
