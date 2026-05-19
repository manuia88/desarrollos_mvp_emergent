"""W5.22 Z.2 Sub-A — Studio Buyer-angle Copy routes.

Prefijo: /api/studio/copy · T2+ via require_studio.

Endpoints:
    POST /generate             lanza job async, retorna job_id
    GET  /personas             7 personas + metadata
    GET  /job/:id              polling del job
    GET  /jobs                 lista jobs del user
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

import studio_buyer_copy_engine as copy_engine

log = logging.getLogger("dmx.routes_studio_copy")

router = APIRouter(prefix="/api/studio/copy", tags=["studio_copy"])


async def _require_user(request: Request):
    from routes.studio import require_studio
    return await require_studio(request)


def _db(request: Request):
    return request.app.state.db


# ─── Schemas ──────────────────────────────────────────────────────────────────
class CopyGenerateBody(BaseModel):
    buyer_angle: str = Field(..., pattern="^(inversor|familia|first_buyer|exec|extranjero|jubilado|empty_nester)$")
    disc: Optional[str] = Field(None, pattern="^(D|I|S|C)$")
    language: str = Field("es-MX", pattern="^(es-MX|en-US)$")
    project_id: Optional[str] = None
    context_extra: Optional[str] = Field(None, max_length=800)


# ─── Routes ───────────────────────────────────────────────────────────────────
@router.post("/generate")
async def generate_copy(body: CopyGenerateBody, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    job_id = await copy_engine.generate_copy_job(
        db,
        tenant_id=user.tenant_id or "default",
        user_id=user.user_id,
        buyer_angle=body.buyer_angle,
        disc=body.disc,
        language=body.language,
        context_extra=body.context_extra or "",
        project_id=body.project_id,
    )
    return {"ok": True, "job_id": job_id, "status": "pending"}


@router.get("/personas")
async def get_personas(request: Request) -> Dict[str, Any]:
    await _require_user(request)
    return {
        "personas": [
            {
                "key": k,
                "nombre": v["nombre"],
                "enfoque": v["enfoque"],
                "cta": v["cta"],
                "tono": v["tono"],
            }
            for k, v in copy_engine.PERSONAS.items()
        ],
        "disc_profiles": [
            {"key": k, "estilo": v["estilo"]}
            for k, v in copy_engine.DISC.items()
        ],
        "languages": ["es-MX", "en-US"],
    }


@router.get("/job/{job_id}")
async def get_job(job_id: str, request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    job = await copy_engine.get_job(db, job_id, user.user_id)
    if not job:
        raise HTTPException(404, "Job no encontrado")
    return {"job": job}


@router.get("/jobs")
async def list_jobs(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> Dict[str, Any]:
    user = await _require_user(request)
    db = _db(request)
    jobs = await copy_engine.list_jobs(db, user.user_id, limit=limit, skip=skip)
    return {"items": jobs, "total": len(jobs)}
