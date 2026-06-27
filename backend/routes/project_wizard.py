"""W6.5 — Project Wizard duplication routes.

Endpoints:
  POST /api/projects/duplicate            duplicate a project (T2+ dev or superadmin)
  GET  /api/projects/templates            list duplicable templates per tenant
  POST /api/projects/{id}/mark-as-template  toggle is_template flag (superadmin or dev director)

Rate limit: 30/min/IP per endpoint.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from project_wizard_engine import (
    duplicate_project,
    list_templates,
    mark_as_template,
)
from permissions import DEV_IN_HOUSE_ROLES
from ratelimit import client_ip as _dmx_canon_ip  # SEGURIDAD: IP anti-spoofing (pentest 2026-06-27)

log = logging.getLogger("dmx.routes_project_wizard")

router = APIRouter(tags=["project_wizard"])

_RATE: Dict[str, deque] = defaultdict(lambda: deque(maxlen=30))
_RATE_WINDOW_S = 60


def _client_ip(request: Request) -> str:
    ip = _dmx_canon_ip(request)
    if not ip and request.client:
        ip = request.client.host
    return ip or "unknown"


def _check_rate(ip: str, limit: int = 30) -> None:
    bkt = _RATE[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(status_code=429, detail=f"Rate limit · {limit}/min")
    bkt.append(now)


async def _require_dev_or_superadmin(request: Request):
    from server import get_current_user

    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    role = getattr(user, "role", None)
    if role != "superadmin" and role not in DEV_IN_HOUSE_ROLES:
        raise HTTPException(403, "Acceso restringido a developer o superadmin")
    return user


class DuplicateIn(BaseModel):
    source_id: str
    new_name: str
    override_fields: Optional[Dict[str, Any]] = None


class MarkTemplateIn(BaseModel):
    enabled: bool = True


DAILY_DUPLICATE_CAP_PER_TENANT = 10  # G.92 audit · cap antiabuse (superadmin bypass)


async def _check_daily_duplicate_cap(db, tenant_id: Optional[str], role: str) -> None:
    """G.92 fix · cap 10 duplicaciones/día/tenant (superadmin bypass)."""
    if role == "superadmin" or not tenant_id:
        return
    from datetime import datetime, timezone, timedelta
    since = datetime.now(timezone.utc) - timedelta(days=1)
    try:
        count = await db.developments.count_documents({
            "tenant_id": tenant_id,
            "duplicated_from": {"$exists": True, "$ne": None},
            "created_at": {"$gte": since},
        })
    except Exception:
        return  # FAIL-OPEN si query falla
    if count >= DAILY_DUPLICATE_CAP_PER_TENANT:
        raise HTTPException(
            429,
            f"daily_duplicate_cap_exceeded · max {DAILY_DUPLICATE_CAP_PER_TENANT}/día/tenant",
        )


@router.post("/api/projects/duplicate")
async def duplicate_project_endpoint(body: DuplicateIn, request: Request):
    _check_rate(_client_ip(request))
    user = await _require_dev_or_superadmin(request)
    db = request.app.state.db
    from tenant_scope import assert_db_project_owner
    await assert_db_project_owner(db, user, body.source_id)   # no forkear proyecto de otra dev
    actor = {
        "user_id": getattr(user, "user_id", "unknown"),
        "role": getattr(user, "role", "unknown"),
        "tenant_id": getattr(user, "tenant_id", None),
    }
    # G.92 audit · enforce cap 10/día/tenant antes de duplicate (superadmin bypass)
    await _check_daily_duplicate_cap(db, actor["tenant_id"], actor["role"])
    res = await duplicate_project(
        db,
        source_id=body.source_id,
        new_name=body.new_name,
        actor=actor,
        override_fields=body.override_fields,
    )
    if res.get("error"):
        raise HTTPException(400, res["error"])
    return res


@router.get("/api/projects/templates")
async def list_templates_endpoint(request: Request, limit: int = 50):
    _check_rate(_client_ip(request))
    user = await _require_dev_or_superadmin(request)
    db = request.app.state.db
    tenant_id = getattr(user, "tenant_id", None) if getattr(user, "role", None) != "superadmin" else None
    items = await list_templates(db, tenant_id=tenant_id, limit=limit)
    return {"items": items, "count": len(items)}


@router.post("/api/projects/{project_id}/mark-as-template")
async def mark_as_template_endpoint(project_id: str, body: MarkTemplateIn, request: Request):
    _check_rate(_client_ip(request))
    user = await _require_dev_or_superadmin(request)
    db = request.app.state.db
    from tenant_scope import assert_db_project_owner
    await assert_db_project_owner(db, user, project_id)   # no marcar/exponer como template proyecto ajeno
    actor = {
        "user_id": getattr(user, "user_id", "unknown"),
        "role": getattr(user, "role", "unknown"),
        "tenant_id": getattr(user, "tenant_id", None),
    }
    res = await mark_as_template(db, project_id=project_id, actor=actor, enabled=body.enabled)
    if res.get("error"):
        raise HTTPException(404, res["error"])
    return res
