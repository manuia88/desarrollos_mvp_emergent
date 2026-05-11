"""W4.10 Sub-Fix 2 — Newsletter Pulse routes.

Prefix: /api/superadmin/newsletter · /api/users/{id}/newsletter-*
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from newsletter_pulse_engine import (
    NewsletterPulseEngine,
    VALID_SEGMENTS,
    ensure_newsletter_indexes,
)

log = logging.getLogger("dmx.routes_newsletter")

router = APIRouter(tags=["newsletter"])


def _now():
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _get_user(request: Request) -> Dict[str, Any]:
    from server import get_current_user
    return await get_current_user(request)


# ─── Superadmin endpoints ──────────────────────────────────────────────────────

@router.post("/api/superadmin/newsletter/preview")
async def preview_newsletter(segment: str, request: Request):
    """Dry-run — genera preview sin persistir ni enviar."""
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    if segment not in VALID_SEGMENTS:
        raise HTTPException(422, f"Segmento inválido. Válidos: {list(VALID_SEGMENTS)}")

    db = _db(request)
    engine = NewsletterPulseEngine(db)
    now = _now()
    from datetime import timedelta
    result = await engine.generate_pulse(
        period_start=now - timedelta(days=7),
        period_end=now,
        segments=[segment],
        dry_run=True,
    )
    return JSONResponse({"ok": True, "preview": result.get("segments", {}).get(segment, {})})


@router.get("/api/superadmin/newsletter/runs")
async def list_newsletter_runs(
    request: Request,
    days: int = 30,
    segment: Optional[str] = None,
    status: Optional[str] = None,
):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    from datetime import timedelta
    since = _now() - timedelta(days=days)
    query: Dict[str, Any] = {"generated_at": {"$gte": since}}
    if segment:
        query["segment"] = segment
    if status:
        query["status"] = status

    cursor = db.newsletter_pulse_runs.find(query, {"_id": 0, "per_user_personalizations": 0}).sort("generated_at", -1).limit(100)
    runs = await cursor.to_list(100)

    # Serializar datetimes
    for run in runs:
        for k in ("generated_at", "sent_at", "period_start", "period_end"):
            if run.get(k) and hasattr(run[k], "isoformat"):
                run[k] = run[k].isoformat()

    return JSONResponse({"ok": True, "runs": runs, "count": len(runs)})


@router.post("/api/superadmin/newsletter/send-manual")
async def send_newsletter_manual(segment: str, request: Request):
    """Envío manual override por segmento."""
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    if segment not in VALID_SEGMENTS:
        raise HTTPException(422, f"Segmento inválido")

    db = _db(request)
    # Buscar último run generado del segmento
    run = await db.newsletter_pulse_runs.find_one(
        {"segment": segment, "status": "generated"},
        sort=[("generated_at", -1)],
    )
    if not run:
        # Generar uno nuevo si no hay
        engine = NewsletterPulseEngine(db)
        from datetime import timedelta
        now = _now()
        gen_result = await engine.generate_pulse(
            period_start=now - timedelta(days=7),
            period_end=now,
            segments=[segment],
        )
        run_id = (gen_result.get("segments", {}).get(segment, {}) or {}).get("run_id")
        if not run_id:
            raise HTTPException(500, "No se pudo generar el Pulse")
    else:
        run_id = run["_id"]

    engine = NewsletterPulseEngine(db)
    result = await engine.send_pulse(run_id)
    return JSONResponse(result)


@router.get("/api/superadmin/newsletter/stats")
async def newsletter_stats(request: Request):
    user = await _get_user(request)
    if getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo superadmin")

    db = _db(request)
    stats: Dict[str, Any] = {}
    for seg in VALID_SEGMENTS:
        sent = await db.newsletter_pulse_runs.count_documents({"segment": seg, "status": "sent"})
        opt_ins = await db.newsletter_opt_ins.count_documents({"segment": seg, "status": "active"})
        stats[seg] = {"sent_runs": sent, "opt_ins": opt_ins}

    return JSONResponse({"ok": True, "by_segment": stats})


# ─── User opt-in / opt-out ────────────────────────────────────────────────────

@router.post("/api/users/{user_id}/newsletter-opt-in")
async def newsletter_opt_in(user_id: str, segment: str, request: Request):
    """Self-service opt-in (requiere auth)."""
    user = await _get_user(request)
    # Usuario puede optar en sí mismo; superadmin puede optar cualquiera
    if getattr(user,"user_id",None) != user_id and getattr(user,"role",None) != "superadmin":
        raise HTTPException(403, "Solo puedes gestionar tu propia suscripción")
    if segment not in VALID_SEGMENTS:
        raise HTTPException(422, f"Segmento inválido")

    db = _db(request)
    # Upsert opt-in
    await db.newsletter_opt_ins.update_one(
        {"user_id": user_id, "segment": segment},
        {"$set": {
            "user_id": user_id,
            "segment": segment,
            "email": getattr(user,"email",None) or "",
            "name": getattr(user,"name",None) or "",
            "org_id": getattr(user,"org_id",None) or getattr(user,"tenant_id",None) or "dmx",
            "status": "active",
            "opted_in_at": _now(),
        }},
        upsert=True,
    )
    return JSONResponse({"ok": True, "segment": segment, "status": "active"})


@router.post("/api/users/{user_id}/newsletter-opt-out/{segment}")
@router.get("/api/users/{user_id}/newsletter-opt-out/{segment}")
async def newsletter_opt_out(user_id: str, segment: str, request: Request):
    """Opt-out público (link en email · no requiere auth)."""
    if segment not in VALID_SEGMENTS and segment != "all":
        raise HTTPException(422, f"Segmento inválido")

    db = _db(request)
    query: Dict[str, Any] = {"user_id": user_id}
    if segment != "all":
        query["segment"] = segment

    await db.newsletter_opt_ins.update_many(
        query,
        {"$set": {"status": "unsubscribed", "unsubscribed_at": _now()}},
    )

    # Respuesta HTML amigable para link de email
    html = """<!DOCTYPE html><html><body style="font-family:Arial;padding:40px;text-align:center;background:#06080F;color:#F0EBE0;">
    <h2>Suscripcion cancelada</h2>
    <p>Has cancelado tu suscripcion al boletin DMX correctamente.</p>
    <a href="https://desarrollosmx.io" style="color:#6366F1;">Volver al inicio</a>
    </body></html>"""

    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)
