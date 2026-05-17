"""W5.ASR.4 Parte 1 · CMA Routes.

Endpoints:
  POST /api/asesor/cma/generate     · genera CMA (rate-limit 30/hr/asesor)
  GET  /api/asesor/cma/list         · lista del asesor authenticated
  GET  /api/asesor/cma/{cma_id}     · detalle (owner-only · 403 otro)
  GET  /api/public/cma/{cma_id}     · shape pública (rate-limit 60/min/IP)
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("dmx.cma_routes")
router = APIRouter(tags=["cma"])


# ─── Rate-limit buckets (in-memory, monotonic) ──────────────────────────────

_GENERATE_BUCKETS: Dict[str, List[float]] = {}
GENERATE_CAP_PER_HOUR = 30

_PUBLIC_BUCKETS: Dict[str, List[float]] = {}
PUBLIC_CAP_PER_MIN = 60


def _check_rate(buckets: Dict[str, List[float]], key: str, cap: int, window_s: int) -> bool:
    """Sliding window: True si permitido (y registra hit); False si excedido."""
    now = time.monotonic()
    bucket = buckets.setdefault(key, [])
    pruned = [t for t in bucket if now - t < window_s]
    buckets[key] = pruned
    if len(pruned) >= cap:
        return False
    pruned.append(now)
    return True


# ─── Helpers ────────────────────────────────────────────────────────────────

def _db(request: Request):
    return request.app.state.db


async def _auth_asesor(request: Request):
    """Verifica auth y rol asesor. Retorna user dict-like con user_id."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = (getattr(user, "role", "") or "").lower()
    allowed = {"advisor", "asesor", "asesor_admin", "asesor_freelance", "broker", "superadmin"}
    if role not in allowed:
        raise HTTPException(403, "Solo asesores pueden generar CMAs")
    return user


# ─── Payloads ───────────────────────────────────────────────────────────────

class CMASubjectPayload(BaseModel):
    colonia_slug: str = Field(..., min_length=1, max_length=120)
    m2: float = Field(..., ge=10, le=2000)
    recamaras: int = Field(..., ge=0, le=20)
    banos: int = Field(..., ge=0, le=20)
    antiguedad: int = Field(..., ge=0, le=150)
    address: Optional[str] = Field(None, max_length=240)


class GenerateCMAPayload(BaseModel):
    subject: CMASubjectPayload


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/api/asesor/cma/generate")
async def generate_cma_endpoint(payload: GenerateCMAPayload, request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "") or "anon"

    if not _check_rate(_GENERATE_BUCKETS, asesor_id, GENERATE_CAP_PER_HOUR, 3600):
        raise HTTPException(429, "Límite de 30 CMAs por hora alcanzado. Intenta en 1 hora.")

    from cma_engine import generate_cma
    cma = await generate_cma(db, asesor_id, payload.subject.model_dump())
    if "error" in cma:
        raise HTTPException(422, cma["error"])
    return cma


@router.get("/api/asesor/cma/list")
async def list_cmas_endpoint(
    request: Request, limit: int = 50, offset: int = 0,
) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "") or "anon"
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    from cma_engine import list_cmas_by_asesor
    items = await list_cmas_by_asesor(db, asesor_id, limit=limit, offset=offset)
    return {"items": items, "count": len(items), "limit": limit, "offset": offset}


@router.get("/api/asesor/cma/{cma_id}")
async def get_cma_endpoint(cma_id: str, request: Request) -> Dict[str, Any]:
    user = await _auth_asesor(request)
    db = _db(request)
    asesor_id = getattr(user, "user_id", "") or "anon"
    role = (getattr(user, "role", "") or "").lower()
    from cma_engine import get_cma
    cma = await get_cma(db, cma_id)
    if not cma:
        raise HTTPException(404, "CMA no encontrado")
    # Owner-only · superadmin override permitido
    if cma.get("asesor_id") != asesor_id and role != "superadmin":
        raise HTTPException(403, "Sin acceso a este CMA")
    return cma


@router.get("/api/public/cma/{cma_id}")
async def public_cma_endpoint(cma_id: str, request: Request) -> Dict[str, Any]:
    db = _db(request)
    ip = request.client.host if request.client else "unknown"
    if not _check_rate(_PUBLIC_BUCKETS, ip, PUBLIC_CAP_PER_MIN, 60):
        raise HTTPException(429, "Límite de 60 solicitudes/min alcanzado. Intenta en un momento.")
    from cma_engine import get_cma, increment_share_count
    cma = await get_cma(db, cma_id)
    if not cma:
        raise HTTPException(404, "CMA no encontrado")
    await increment_share_count(db, cma_id)
    # Shape pública: strip asesor_id + shared_count + flags internas
    return {k: v for k, v in cma.items() if k not in ("asesor_id", "shared_count", "_id")}
