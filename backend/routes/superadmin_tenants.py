"""W1.2 · SA1.1 — Superadmin Tenants Management.

Endpoints:
  GET    /api/superadmin/tenants                 → list devs+inms (filters)
  GET    /api/superadmin/tenants/{tenant_id}     → detail (members, audit, AI usage, projects)
  POST   /api/superadmin/tenants/{tenant_id}/impersonate   → start impersonation
  POST   /api/superadmin/tenants/impersonate/end           → end impersonation
  PATCH  /api/superadmin/tenants/{tenant_id}/status        → change status (suspend/active/trial/inactive)

Guards: require_superadmin on 1,2,3,5. Endpoint 4 also accepts impersonated session.
"""
from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Response, Query
from pydantic import BaseModel, Field

from permissions import DEV_IN_HOUSE_ROLES

log = logging.getLogger("dmx.routes_superadmin_tenants")

router = APIRouter(tags=["superadmin_tenants"])
PREFIX = "/api/superadmin/tenants"
IMPERSONATE_COOKIE = "dmx_impersonate_session"
IMPERSONATE_TTL_SEC = 30 * 60  # 30 min


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v) -> Optional[str]:
    if isinstance(v, datetime):
        return v.isoformat()
    return v


def _db(request: Request):
    return request.app.state.db


# ─── Auth helpers ─────────────────────────────────────────────────────────────

async def _require_superadmin(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role != "superadmin":
        raise HTTPException(403, "Solo superadmin")
    return user


async def _require_superadmin_or_impersonating(request: Request):
    """For /impersonate/end — accept either superadmin (still authenticated)
    or an active impersonated session (cookie present)."""
    from server import get_current_user
    user = await get_current_user(request)
    if user and user.role == "superadmin":
        return user, None
    cookie_token = request.cookies.get(IMPERSONATE_COOKIE)
    if cookie_token:
        return user, cookie_token
    raise HTTPException(401, "Sin sesión de impersonation")


def _tenant_name_from_id(tenant_id: str) -> str:
    return re.sub(r"[_\-]+", " ", tenant_id or "").strip().title() or tenant_id


# ─── Aggregation helpers ──────────────────────────────────────────────────────

async def _members_count(db, tenant_id: str) -> int:
    return await db.users.count_documents({"tenant_id": tenant_id})


async def _projects_count(db, tenant_id: str, type_: str) -> int:
    if type_ != "dev":
        return 0
    return await db.developments.count_documents({"developer_id": tenant_id})


async def _ai_usage_month_mxn(db, tenant_id: str) -> float:
    start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "ts": {"$gte": start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$cost_mxn"}}},
    ]
    try:
        async for row in db.ai_usage.aggregate(pipeline):
            return round(float(row.get("total") or 0), 2)
    except Exception:
        pass
    return 0.0


async def _last_activity_at(db, tenant_id: str) -> Optional[str]:
    doc = await db.audit_log.find_one(
        {"actor.tenant_id": tenant_id},
        {"_id": 0, "ts": 1},
        sort=[("ts", -1)],
    )
    if doc and doc.get("ts"):
        return _iso(doc["ts"])
    # Fallback: actor.user_id → users tenant lookup
    pipeline = [
        {"$lookup": {"from": "users", "localField": "actor.user_id",
                     "foreignField": "user_id", "as": "u"}},
        {"$match": {"u.tenant_id": tenant_id}},
        {"$sort": {"ts": -1}},
        {"$limit": 1},
        {"$project": {"_id": 0, "ts": 1}},
    ]
    try:
        async for row in db.audit_log.aggregate(pipeline):
            return _iso(row.get("ts"))
    except Exception:
        pass
    return None


async def _plan_tier(db, tenant_id: str) -> str:
    doc = await db.tenant_features.find_one(
        {"tenant_id": tenant_id}, {"_id": 0, "plan_tier": 1},
    )
    return (doc or {}).get("plan_tier") or "basic"


async def _tenant_status(db, tenant_id: str, type_: str) -> str:
    if type_ == "inm":
        doc = await db.inmobiliarias.find_one(
            {"id": tenant_id}, {"_id": 0, "status": 1},
        )
        return (doc or {}).get("status") or "active"
    doc = await db.dev_orgs.find_one(
        {"$or": [{"tenant_id": tenant_id}, {"org_id": tenant_id}]}, {"_id": 0, "status": 1},
    )
    return (doc or {}).get("status") or "active"


async def _build_summary(db, tenant_id: str, type_: str, *, name: Optional[str] = None) -> Dict[str, Any]:
    members = await _members_count(db, tenant_id)
    projects = await _projects_count(db, tenant_id, type_)
    ai_usage = await _ai_usage_month_mxn(db, tenant_id)
    last_act = await _last_activity_at(db, tenant_id)
    status = await _tenant_status(db, tenant_id, type_)
    plan = await _plan_tier(db, tenant_id)

    # Created_at: pick earliest member or org doc
    created_at = None
    org_doc = None
    if type_ == "inm":
        org_doc = await db.inmobiliarias.find_one(
            {"id": tenant_id},
            {"_id": 0, "created_at": 1, "name": 1},
        )
    else:
        org_doc = await db.dev_orgs.find_one(
            {"$or": [{"tenant_id": tenant_id}, {"org_id": tenant_id}]},
            {"_id": 0, "created_at": 1, "name": 1, "display_name": 1},
        )
    if org_doc:
        created_at = _iso(org_doc.get("created_at"))
        if not name:
            name = org_doc.get("display_name") or org_doc.get("name")
    if not created_at:
        first = await db.users.find_one(
            {"tenant_id": tenant_id},
            {"_id": 0, "created_at": 1},
            sort=[("created_at", 1)],
        )
        created_at = _iso((first or {}).get("created_at"))

    return {
        "id": tenant_id,
        "tenant_id": tenant_id,
        "type": type_,
        "name": name or _tenant_name_from_id(tenant_id),
        # SIN FICHA DE CLIENTE: hay una cuenta de usuario con este tenant pero NO existe la
        # organización en `dev_orgs` (auditoría 07-26). Es el caso de `constructora_ariel`, que es la
        # cuenta de demostración. Aparece en la lista para que se vea que está ahí, pero NO cuenta
        # como cliente — y por eso el inicio y esta pantalla ya pueden decir el mismo número.
        "sin_ficha_cliente": org_doc is None,
        "status": status,
        "members_count": members,
        "projects_count": projects,
        "ai_usage_month_mxn": ai_usage,
        "last_activity_at": last_act,
        "created_at": created_at,
        "plan_tier": plan,
    }


# ─── 1) GET /api/superadmin/tenants — list ────────────────────────────────────

@router.get(PREFIX)
async def list_tenants(
    request: Request,
    type: Literal["dev", "inm", "all"] = Query("all"),
    status: Literal["active", "inactive", "trial", "suspended", "all"] = Query("all"),
    search: Optional[str] = None,
    sort: Literal["created_at", "name", "members", "last_activity"] = Query("last_activity"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    await _require_superadmin(request)
    db = _db(request)

    summaries: List[Dict[str, Any]] = []

    # Devs: distinct tenant_id from users with in-house dev role
    if type in ("dev", "all"):
        # LA LISTA SON LOS CLIENTES, NO LOS USUARIOS (auditoría 07-26). Esto salía de
        # `users.distinct("tenant_id")`, así que mostraba organizaciones que solo existen porque
        # alguien tiene cuenta (`constructora_ariel`) y OMITÍA a los clientes dados de alta que
        # todavía no han entrado — Deca y Estrategia Urbana no aparecían. Por eso el inicio y esta
        # pantalla nunca coincidían. Ahora se unen las dos fuentes: quien tiene cuenta y quien está
        # dado de alta.
        dev_tenant_ids = await db.users.distinct(
            "tenant_id", {"role": {"$in": list(DEV_IN_HOUSE_ROLES)}, "tenant_id": {"$ne": None}},
        )
        _de_alta = await db.dev_orgs.distinct("tenant_id", {"tenant_id": {"$ne": None}})
        dev_tenant_ids = list(dict.fromkeys([*dev_tenant_ids, *_de_alta]))
        for tid in dev_tenant_ids:
            if not tid:
                continue
            summaries.append(await _build_summary(db, tid, "dev"))

    # Inmobiliarias (excluir is_system_default=true)
    if type in ("inm", "all"):
        async for doc in db.inmobiliarias.find(
            {"is_system_default": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1},
        ):
            tid = doc.get("id")
            if not tid:
                continue
            summaries.append(await _build_summary(db, tid, "inm", name=doc.get("name")))

    # Status filter
    if status != "all":
        summaries = [s for s in summaries if s["status"] == status]

    # Search
    if search:
        q = search.lower().strip()
        summaries = [
            s for s in summaries
            if q in (s["name"] or "").lower() or q in (s["tenant_id"] or "").lower()
        ]

    # Sort
    def _sk(s):
        if sort == "name":
            return (s["name"] or "").lower()
        if sort == "members":
            return -int(s.get("members_count") or 0)
        if sort == "created_at":
            return s.get("created_at") or ""
        # last_activity desc
        return s.get("last_activity_at") or ""

    reverse = sort in ("last_activity", "created_at")
    summaries.sort(key=_sk, reverse=reverse)

    total = len(summaries)
    page = summaries[skip: skip + limit]
    return {"items": page, "total": total, "skip": skip, "limit": limit}


# ─── 2) GET /api/superadmin/tenants/{tenant_id} — detail ──────────────────────

@router.get(PREFIX + "/{tenant_id}")
async def get_tenant(tenant_id: str, request: Request):
    await _require_superadmin(request)
    db = _db(request)

    # Resolve type
    is_inm = await db.inmobiliarias.find_one({"id": tenant_id}, {"_id": 0, "id": 1}) is not None
    type_ = "inm" if is_inm else "dev"

    base = await _build_summary(db, tenant_id, type_)

    # Members (max 100)
    members_total = await db.users.count_documents({"tenant_id": tenant_id})
    members_cursor = db.users.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "last_login_at": 1, "created_at": 1, "account_blocked": 1},
    ).sort("created_at", -1).limit(100)
    members = []
    async for u in members_cursor:
        members.append({
            "id": u.get("user_id"),
            "name": u.get("name") or u.get("email"),
            "email": u.get("email"),
            "role": u.get("role"),
            "last_login_at": _iso(u.get("last_login_at")),
            "created_at": _iso(u.get("created_at")),
            "account_blocked": bool(u.get("account_blocked")),
        })

    # Recent audit (20)
    recent_audit = []
    async for doc in db.audit_log.find(
        {"actor.tenant_id": tenant_id},
        {"_id": 0, "ts": 1, "action": 1, "entity_type": 1, "actor": 1},
    ).sort("ts", -1).limit(20):
        recent_audit.append({
            "ts": _iso(doc.get("ts")),
            "action": doc.get("action"),
            "entity_type": doc.get("entity_type"),
            "actor_user_id": (doc.get("actor") or {}).get("user_id"),
        })

    # AI usage breakdown (haiku|sonnet) current month
    start = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    breakdown = {"haiku": 0.0, "sonnet": 0.0, "other": 0.0}
    try:
        pipeline = [
            {"$match": {"tenant_id": tenant_id, "ts": {"$gte": start.isoformat()}}},
            {"$group": {"_id": "$model", "total": {"$sum": "$cost_mxn"}}},
        ]
        async for row in db.ai_usage.aggregate(pipeline):
            model = (row.get("_id") or "").lower()
            if "haiku" in model:
                breakdown["haiku"] += float(row.get("total") or 0)
            elif "sonnet" in model:
                breakdown["sonnet"] += float(row.get("total") or 0)
            else:
                breakdown["other"] += float(row.get("total") or 0)
        for k in breakdown:
            breakdown[k] = round(breakdown[k], 2)
    except Exception:
        pass

    # Projects summary (max 50, dev only)
    projects_summary = []
    if type_ == "dev":
        async for d in db.developments.find(
            {"developer_id": tenant_id},
            {"_id": 0, "id": 1, "name": 1, "status": 1, "units_count": 1, "total_units": 1},
        ).limit(50):
            projects_summary.append({
                "id": d.get("id"),
                "name": d.get("name"),
                "status": d.get("status"),
                "units_count": d.get("units_count") or d.get("total_units") or 0,
            })

    return {
        **base,
        "members": members,
        "members_total": members_total,
        "recent_audit": recent_audit,
        "ai_usage_breakdown": breakdown,
        "projects_summary": projects_summary,
    }


# ─── 3) POST /api/superadmin/tenants/{tenant_id}/impersonate ──────────────────

@router.post(PREFIX + "/{tenant_id}/impersonate")
async def start_impersonation(tenant_id: str, request: Request, response: Response):
    superadmin = await _require_superadmin(request)
    db = _db(request)

    # Find first admin of tenant
    target = await db.users.find_one(
        {"tenant_id": tenant_id, "role": {"$in": ["developer_admin", "inmobiliaria_admin"]}},
        {"_id": 0, "password_hash": 0},
        sort=[("created_at", 1)],
    )
    if not target:
        raise HTTPException(404, "No se encontró admin para ese tenant")

    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(seconds=IMPERSONATE_TTL_SEC)

    # Store impersonation session
    sess = {
        "token": token,
        "impersonator_user_id": superadmin.user_id,
        "target_user_id": target["user_id"],
        "target_tenant_id": tenant_id,
        "target_role": target.get("role"),
        "started_at": _now().isoformat(),
        "expires_at": expires_at.isoformat(),
        "active": True,
    }
    await db.impersonation_sessions.insert_one(dict(sess))
    sess.pop("_id", None)

    # Audit start
    audit_doc = {
        "action": "impersonate_start",
        "impersonator_user_id": superadmin.user_id,
        "target_user_id": target["user_id"],
        "target_tenant_id": tenant_id,
        "target_role": target.get("role"),
        "ts": _now().isoformat(),
        "expires_at": expires_at.isoformat(),
        "actor": {"user_id": superadmin.user_id, "tenant_id": getattr(superadmin, "tenant_id", None),
                  "role": "superadmin"},
        "entity_type": "impersonation",
        "entity_id": token,
    }
    audit_res = await db.audit_log.insert_one(audit_doc)
    audit_id = str(audit_res.inserted_id)

    # Set cookie + a short-lived access_token for target
    try:
        from server import create_access_token
        access = create_access_token(target["user_id"], target.get("email") or "")
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=IMPERSONATE_TTL_SEC, path="/")
    except Exception as e:
        log.warning(f"[impersonate] failed to set access_token: {e}")

    response.set_cookie(
        IMPERSONATE_COOKIE, token, httponly=True, secure=True,
        samesite="lax", max_age=IMPERSONATE_TTL_SEC, path="/",
    )

    return {
        "impersonation_token": token,
        "target_user_id": target["user_id"],
        "target_role": target.get("role"),
        "target_tenant_id": tenant_id,
        "target_name": target.get("name") or target.get("email"),
        "expires_at": expires_at.isoformat(),
        "audit_id": audit_id,
    }


# ─── 4) POST /api/superadmin/tenants/impersonate/end ──────────────────────────

@router.post(PREFIX + "/impersonate/end")
async def end_impersonation(request: Request, response: Response):
    user, cookie_token = await _require_superadmin_or_impersonating(request)
    db = _db(request)

    duration_seconds = 0
    if cookie_token:
        sess = await db.impersonation_sessions.find_one(
            {"token": cookie_token, "active": True}, {"_id": 0},
        )
        if sess:
            try:
                started = datetime.fromisoformat(sess["started_at"])
                duration_seconds = int((_now() - started).total_seconds())
            except Exception:
                duration_seconds = 0
            await db.impersonation_sessions.update_one(
                {"token": cookie_token},
                {"$set": {"active": False, "ended_at": _now().isoformat()}},
            )
            try:
                await db.audit_log.insert_one({
                    "action": "impersonate_end",
                    "impersonator_user_id": sess.get("impersonator_user_id"),
                    "target_user_id": sess.get("target_user_id"),
                    "target_tenant_id": sess.get("target_tenant_id"),
                    "duration_seconds": duration_seconds,
                    "ts": _now().isoformat(),
                    "actor": {"user_id": sess.get("impersonator_user_id"),
                              "role": "superadmin"},
                    "entity_type": "impersonation",
                    "entity_id": cookie_token,
                })
            except Exception:
                pass

    # Clear cookies
    response.delete_cookie(IMPERSONATE_COOKIE, path="/")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True, "duration_seconds": duration_seconds}


# ─── 5) PATCH /api/superadmin/tenants/{tenant_id}/status ──────────────────────

class StatusPatch(BaseModel):
    status: Literal["active", "inactive", "trial", "suspended"]
    reason: Optional[str] = Field(None, max_length=500)


@router.patch(PREFIX + "/{tenant_id}/status")
async def patch_tenant_status(tenant_id: str, payload: StatusPatch, request: Request):
    sa = await _require_superadmin(request)
    db = _db(request)
    new_status = payload.status

    # Resolve type
    is_inm = await db.inmobiliarias.find_one({"id": tenant_id}, {"_id": 0, "id": 1}) is not None
    if is_inm:
        await db.inmobiliarias.update_one(
            {"id": tenant_id},
            {"$set": {"status": new_status, "status_updated_at": _now().isoformat(),
                      "status_reason": payload.reason}},
        )
    else:
        await db.dev_orgs.update_one(
            {"$or": [{"tenant_id": tenant_id}, {"org_id": tenant_id}]},
            {"$set": {"status": new_status, "status_updated_at": _now().isoformat(),
                      "status_reason": payload.reason},
             "$setOnInsert": {"tenant_id": tenant_id, "created_at": _now().isoformat()}},
            upsert=True,
        )

    # Apply user-level block / unblock
    if new_status == "suspended":
        await db.users.update_many(
            {"tenant_id": tenant_id},
            {"$set": {"account_blocked": True, "blocked_at": _now().isoformat(),
                      "blocked_reason": payload.reason}},
        )
    elif new_status == "active":
        await db.users.update_many(
            {"tenant_id": tenant_id},
            {"$set": {"account_blocked": False, "unblocked_at": _now().isoformat()}},
        )

    # Audit
    try:
        await db.audit_log.insert_one({
            "action": "tenant_status_change",
            "ts": _now().isoformat(),
            "actor": {"user_id": sa.user_id, "tenant_id": getattr(sa, "tenant_id", None),
                      "role": "superadmin"},
            "entity_type": "tenant",
            "entity_id": tenant_id,
            "before": None,
            "after": {"status": new_status, "reason": payload.reason},
        })
    except Exception:
        pass

    return {"ok": True, "tenant_id": tenant_id, "status": new_status}


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_superadmin_tenant_indexes(db):
    try:
        await db.impersonation_sessions.create_index("token", unique=True)
        await db.impersonation_sessions.create_index("expires_at")
    except Exception as e:
        log.warning(f"[indexes] superadmin tenants: {e}")
