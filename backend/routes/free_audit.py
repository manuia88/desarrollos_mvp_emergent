"""W4.16 Sub-A — Free Audit API routes."""
from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field

import free_audit_engine as engine
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_free_audit")
router = APIRouter()

_RL_IP: Dict[str, Deque[float]] = defaultdict(deque)
_RL_EMAIL: Dict[str, Deque[float]] = defaultdict(deque)
RL_IP_LIMIT = 30
RL_EMAIL_LIMIT = 5
RL_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    fwd =_dmx_canon_ip(request)
    return fwd or (request.client.host if request.client else "unknown")


def _bucket_check(bucket: Dict[str, Deque[float]], key: str, limit: int) -> None:
    now = time.time()
    b = bucket[key]
    while b and (now - b[0]) > RL_WINDOW_S:
        b.popleft()
    if len(b) >= limit:
        raise HTTPException(429, "rate_limit_exceeded")
    b.append(now)


def _db(request: Request):
    return request.app.state.db


class SubmitRequest(BaseModel):
    project_name: str = Field(..., min_length=1, max_length=120)
    colonia_slug: str = Field(..., min_length=1, max_length=60)
    m2: float = Field(..., gt=0, le=5000)
    recamaras: int = Field(..., ge=0, le=20)
    banos: int = Field(..., ge=0, le=20)
    antiguedad_anos: int = Field(0, ge=0, le=200)
    precio_estimado: float = Field(0, ge=0)
    descripcion: Optional[str] = Field("", max_length=500)
    floor_plan_url: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    locale: Optional[str] = "es-MX"
    consent: bool = True


@router.post("/api/free-audit/submit")
async def submit_route(request: Request, body: SubmitRequest, background: BackgroundTasks):
    ip = _client_ip(request)
    _bucket_check(_RL_IP, ip, RL_IP_LIMIT)
    _bucket_check(_RL_EMAIL, str(body.email).lower(), RL_EMAIL_LIMIT)
    if not body.consent:
        raise HTTPException(400, "consent_required")
    db = _db(request)
    try:
        doc = await engine.submit_audit(db, body.model_dump(), ip=ip,
                                        user_agent=request.headers.get("user-agent", ""))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    audit_id = doc["audit_id"]

    async def _bg():
        try:
            await engine.generate_audit_pdf(db, audit_id)
            await engine.send_audit_email(db, audit_id)
        except Exception as exc:
            log.warning(f"[free_audit] background gen failed audit={audit_id}: {exc}")

    background.add_task(_bg)  # FastAPI await el coroutine; create_task aquí truena ("no running event loop")
    return JSONResponse({"ok": True, "audit_id": audit_id, "status": "processing"})


@router.post("/api/free-audit/upload-floor-plan")
async def upload_floor_plan(request: Request, file: UploadFile = File(...)):
    ip = _client_ip(request)
    _bucket_check(_RL_IP, ip, RL_IP_LIMIT)
    if not file.filename:
        raise HTTPException(400, "invalid_file")
    name_lower = file.filename.lower()
    allowed_exts = ("pdf", "png", "jpg", "jpeg", "webp")
    if not any(name_lower.endswith(f".{e}") for e in allowed_exts):
        raise HTTPException(400, "format_not_allowed")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "file_too_large")
    ext = name_lower.rsplit(".", 1)[-1]
    fid = f"{uuid.uuid4()}.{ext}"
    target = engine.UPLOAD_DIR / fid
    with open(target, "wb") as f:
        f.write(content)
    return JSONResponse({
        "ok": True,
        "floor_plan_url": f"/api/free-audit/floor-plan/{fid}",
        "size_kb": round(len(content) / 1024),
    })


@router.get("/api/free-audit/floor-plan/{filename}")
async def serve_floor_plan(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "invalid_filename")
    p = engine.UPLOAD_DIR / filename
    if not p.exists():
        raise HTTPException(404, "not_found")
    return FileResponse(str(p))


@router.get("/api/free-audit/{audit_id}")
async def get_audit_route(request: Request, audit_id: str):
    db = _db(request)
    doc = await engine.get_audit(db, audit_id)
    if not doc:
        raise HTTPException(404, "audit_not_found")
    # SEGURIDAD (pentest 2026-06-27): submitted_email (PII) NO va en la respuesta pública — el polling de estado/
    # descarga no lo necesita y el audit_id, aunque es UUID, puede filtrarse por link/referrer compartido.
    out = {k: doc.get(k) for k in ("audit_id", "status", "generated_pdf_url", "generated_at",
                                    "project_name", "colonia_slug")}
    return JSONResponse({"ok": True, "audit": out})


@router.get("/api/free-audit/{audit_id}/download")
async def download_audit_pdf(request: Request, audit_id: str):
    db = _db(request)
    doc = await engine.get_audit(db, audit_id)
    if not doc:
        raise HTTPException(404, "audit_not_found")
    if doc.get("status") != "ready":
        try:
            await engine.generate_audit_pdf(db, audit_id)
        except Exception as exc:
            raise HTTPException(503, f"pdf_not_ready:{exc}")
    path = engine.resolve_pdf_path(audit_id)
    if not path:
        raise HTTPException(404, "pdf_not_found")
    return FileResponse(str(path), media_type="application/pdf",
                        filename=f"DMX_Audit_{audit_id[:8]}.pdf")


@router.post("/api/free-audit/{audit_id}/resend-email")
async def resend_email_route(request: Request, audit_id: str):
    ip = _client_ip(request)
    _bucket_check(_RL_IP, ip, RL_IP_LIMIT)
    db = _db(request)
    sent = await engine.send_audit_email(db, audit_id)
    return JSONResponse({"ok": True, "sent": sent})


# ─── F0.2·Sub-E · Admin funnel stats ─────────────────────────────────────────

async def _require_superadmin(request: Request) -> dict:
    try:
        from server import get_current_user
        u = await get_current_user(request)
        if u:
            u = u.model_dump() if hasattr(u, "model_dump") else dict(u)
            if (u.get("role") or "").lower() == "superadmin":
                return u
    except Exception:
        pass
    raise HTTPException(403, "superadmin_required")


@router.get("/api/free-audit/admin/funnel-stats")
async def admin_funnel_stats(request: Request, period_days: int = 30):
    await _require_superadmin(request)
    if period_days < 1 or period_days > 365:
        period_days = 30
    db = _db(request)
    stats = await engine.funnel_stats(db, period_days=period_days)
    return JSONResponse({"ok": True, **stats})


@router.get("/api/free-audit/admin/recent")
async def admin_recent(request: Request, limit: int = 50):
    await _require_superadmin(request)
    db = _db(request)
    if limit < 1 or limit > 200:
        limit = 50
    out = []
    try:
        cursor = db.free_audit_submissions.find(
            {},
            {"_id": 0, "audit_id": 1, "project_name": 1, "colonia_slug": 1,
             "submitted_email": 1, "status": 1, "submitted_at": 1,
             "generated_at": 1, "sent_email_at": 1, "utm_source": 1,
             "precio_estimado": 1, "m2": 1},
        ).sort("submitted_at", -1).limit(limit)
        async for d in cursor:
            out.append(d)
    except Exception:
        pass
    return JSONResponse({"ok": True, "items": out, "count": len(out)})


# ─── F0.3·Sub-C · CSV export for CRM ─────────────────────────────────────────

from fastapi.responses import Response  # noqa: E402


@router.get("/api/free-audit/admin/export.csv")
async def admin_export_csv(request: Request, period_days: int = 30):
    user = await _require_superadmin(request)
    if period_days < 1 or period_days > 365:
        period_days = 30
    db = _db(request)
    body = await engine.export_to_csv(db, period_days=period_days)
    # Audit log (best-effort)
    try:
        from datetime import datetime, timezone
        await db.audit_log.insert_one({
            "user_id": user.get("user_id"),
            "action": "free_audit.export_csv",
            "resource": f"period_days:{period_days}",
            "ts": datetime.now(timezone.utc).isoformat(),
            "payload": {"bytes": len(body)},
        })
    except Exception:
        pass
    filename = f"free_audit_{period_days}d.csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
