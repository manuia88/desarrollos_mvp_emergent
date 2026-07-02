"""W6.AS.1 · Workflow Builder Visual · REST routes.

Prefix: /api/workflows
Auth: T2+ advisor (asesor_admin · asesor_freelance · advisor · superadmin).
Cap: 20 workflows per usuario.

Endpoints:
  GET    /api/workflows
  POST   /api/workflows
  GET    /api/workflows/{id}
  PUT    /api/workflows/{id}
  DELETE /api/workflows/{id}
  POST   /api/workflows/{id}/toggle
  POST   /api/workflows/{id}/test
  GET    /api/workflows/{id}/runs?days=30
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from workflow_engine import (
    MAX_WORKFLOWS_PER_USER,
    _wf_id,
    execute_workflow,
    validate_workflow,
)

log = logging.getLogger("dmx.routes_workflows")

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

_ALLOWED_ROLES = ("superadmin", "advisor", "asesor_admin", "asesor_freelance")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _get_user(request: Request):
    from server import get_current_user
    u = await get_current_user(request)
    if not u:
        raise HTTPException(401, "No autenticado")
    return u


async def _require_advisor(request: Request):
    user = await _get_user(request)
    role = getattr(user, "role", None)
    if role not in _ALLOWED_ROLES:
        raise HTTPException(403, "Acceso denegado · solo asesor T2+")
    return user


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}
    out = dict(doc)
    out.pop("_id", None)
    for k in ("created_at", "updated_at", "deleted_at"):
        v = out.get(k)
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


# ─── Models ──────────────────────────────────────────────────────────────────

class WorkflowNodeIn(BaseModel):
    id: str
    type: str  # trigger|action|condition|delay
    config: Optional[Dict[str, Any]] = None
    position: Optional[Dict[str, float]] = None  # {x,y} para canvas


class WorkflowEdgeIn(BaseModel):
    source: str
    target: str
    branch: Optional[str] = None  # 'true'|'false' para conditions


class WorkflowCreateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None
    nodes: List[WorkflowNodeIn]
    edges: List[WorkflowEdgeIn] = []
    status: Optional[str] = "draft"  # draft | active | paused


class WorkflowUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = None
    nodes: Optional[List[WorkflowNodeIn]] = None
    edges: Optional[List[WorkflowEdgeIn]] = None


class WorkflowTestIn(BaseModel):
    lead_id: Optional[str] = None
    context_extra: Optional[Dict[str, Any]] = None


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("")
async def list_workflows(request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None) or "unknown"
    cursor = db.workflows.find(
        {"owner_user_id": owner, "deleted_at": None},
        {"_id": 0},
    ).sort("updated_at", -1).limit(100)
    items = await cursor.to_list(length=100)
    return {"items": [_serialize(d) for d in items], "count": len(items), "cap": MAX_WORKFLOWS_PER_USER}


@router.post("")
async def create_workflow(body: WorkflowCreateIn, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None) or "unknown"

    count = await db.workflows.count_documents({"owner_user_id": owner, "deleted_at": None})
    if count >= MAX_WORKFLOWS_PER_USER:
        raise HTTPException(409, f"Máximo {MAX_WORKFLOWS_PER_USER} workflows por usuario")

    doc = {
        "id": _wf_id(),
        "owner_user_id": owner,
        "owner_email": getattr(user, "email", None),
        "tenant_id": getattr(user, "tenant_id", None) or getattr(user, "org_id", None),
        "name": body.name,
        "description": body.description,
        "nodes": [n.dict() for n in body.nodes],
        "edges": [e.dict() for e in body.edges],
        "status": body.status if body.status in ("draft", "active", "paused") else "draft",
        "created_at": _now(),
        "updated_at": _now(),
        "deleted_at": None,
        "last_run_at": None,
    }
    ok, err = validate_workflow(doc)
    if not ok and doc["status"] == "active":
        raise HTTPException(400, f"Workflow inválido para activar: {err}")
    await db.workflows.insert_one(doc)
    return _serialize(doc)


@router.get("/{wf_id}")
async def get_workflow(wf_id: str, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)
    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    return _serialize(doc)


@router.put("/{wf_id}")
async def update_workflow(wf_id: str, body: WorkflowUpdateIn, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)

    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")

    update: Dict[str, Any] = {"updated_at": _now()}
    if body.name is not None:
        update["name"] = body.name
    if body.description is not None:
        update["description"] = body.description
    if body.nodes is not None:
        update["nodes"] = [n.dict() for n in body.nodes]
    if body.edges is not None:
        update["edges"] = [e.dict() for e in body.edges]

    # Validar si ya está active y se modifican nodes/edges
    if doc.get("status") == "active" and ("nodes" in update or "edges" in update):
        new_doc = {**doc, **update}
        ok, err = validate_workflow(new_doc)
        if not ok:
            raise HTTPException(400, f"Workflow inválido: {err}")

    await db.workflows.update_one({"id": wf_id}, {"$set": update})
    fresh = await db.workflows.find_one({"id": wf_id}, {"_id": 0})
    return _serialize(fresh or {})


@router.delete("/{wf_id}")
async def delete_workflow(wf_id: str, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)
    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    await db.workflows.update_one(
        {"id": wf_id}, {"$set": {"deleted_at": _now(), "status": "paused"}},
    )
    return {"ok": True, "deleted": wf_id}


@router.post("/{wf_id}/toggle")
async def toggle_workflow(wf_id: str, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)
    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    new_status = "paused" if doc.get("status") == "active" else "active"
    if new_status == "active":
        ok, err = validate_workflow(doc)
        if not ok:
            raise HTTPException(400, f"No se puede activar · {err}")
    await db.workflows.update_one(
        {"id": wf_id}, {"$set": {"status": new_status, "updated_at": _now()}},
    )
    return {"ok": True, "id": wf_id, "status": new_status}


@router.post("/{wf_id}/test")
async def test_workflow(wf_id: str, body: WorkflowTestIn, request: Request):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)
    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    # [AUD-042] validaba el workflow propio pero NO el lead_id del body → los nodos condition se evalúan
    # contra el lead ajeno y su outcome vuelve en steps[] (oráculo de atributos). Exigir dueño del lead.
    if body.lead_id:
        from tenant_scope import assert_lead_owner
        await assert_lead_owner(db, user, body.lead_id)
    ok, err = validate_workflow(doc)
    if not ok:
        raise HTTPException(400, f"Workflow inválido: {err}")
    result = await execute_workflow(
        db, doc, lead_id=body.lead_id, context_extra=body.context_extra or {}, dry_run=True,
    )
    return result


@router.get("/{wf_id}/runs")
async def list_runs(wf_id: str, request: Request, days: int = 30):
    user = await _require_advisor(request)
    db = _db(request)
    owner = getattr(user, "user_id", None) or getattr(user, "email", None)
    doc = await db.workflows.find_one({"id": wf_id, "deleted_at": None}, {"_id": 0, "owner_user_id": 1})
    if not doc:
        raise HTTPException(404, "Workflow no encontrado")
    if doc.get("owner_user_id") != owner and getattr(user, "role", None) != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    days = max(1, min(90, int(days)))
    cutoff = _now() - timedelta(days=days)
    cursor = db.workflow_runs.find(
        {"workflow_id": wf_id, "started_at": {"$gte": cutoff}},
        {"_id": 0},
    ).sort("started_at", -1).limit(100)
    runs = await cursor.to_list(length=100)
    for r in runs:
        for k in ("started_at", "finished_at"):
            v = r.get(k)
            if isinstance(v, datetime):
                r[k] = v.isoformat()
        for st in (r.get("steps") or []):
            ts = st.get("ts")
            if isinstance(ts, datetime):
                st["ts"] = ts.isoformat()
    return {"items": runs, "count": len(runs), "window_days": days}
