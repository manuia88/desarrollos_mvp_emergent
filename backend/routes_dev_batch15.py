"""Phase 4 Batch 15 — Multi-broker Calendar: OAuth + Availability + Auto-assign + Metrics.

9 endpoints:
  GET  /api/oauth/google/initiate       → {auth_url}
  GET  /api/oauth/google/callback       → redirect to frontend
  POST /api/oauth/google/revoke
  GET  /api/oauth/connections

  POST /api/appointments/availability   → {slots[]}
  POST /api/appointments/auto-assign    → {appointment_id, asesor_id, ...}
  GET  /api/appointments/policy/{project_id}
  PUT  /api/appointments/policy/{project_id}
  GET  /api/appointments/metrics        → KPIs + table
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

log = logging.getLogger("dmx.batch15")

router = APIRouter(tags=["batch15"])

FRONTEND_BASE = os.environ.get("REACT_APP_FRONTEND_URL",
                                "https://dmx-keys.preview.emergentagent.com")


def _now():
    return datetime.now(timezone.utc)


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


# ─────────────────────────────────────────────────────────────────────────────
# A) OAuth Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/oauth/google/initiate")
async def oauth_google_initiate(request: Request):
    """Generate Google OAuth authorization URL with CSRF state."""
    user = await _auth(request)
    from oauth_calendar import get_provider, generate_csrf_state

    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "")
    if not redirect_uri:
        raise HTTPException(500, "GOOGLE_OAUTH_REDIRECT_URI no configurado")

    state = generate_csrf_state(user.user_id, "google")
    prov = get_provider("google")
    auth_url = prov.get_auth_url(state, redirect_uri)
    return {"auth_url": auth_url, "provider": "google"}


@router.get("/api/oauth/google/callback")
async def oauth_google_callback(
    request: Request,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
):
    """Handle Google OAuth callback. Exchanges code for tokens and redirects to frontend."""
    db = _db(request)
    frontend_base = FRONTEND_BASE

    if error:
        log.warning(f"[oauth] Google error: {error}")
        return RedirectResponse(f"{frontend_base}/asesor/configuracion?oauth_error={error}")

    if not code or not state:
        return RedirectResponse(f"{frontend_base}/asesor/configuracion?oauth_error=missing_params")

    from oauth_calendar import consume_csrf_state, get_provider, store_oauth_token, PROVIDERS

    # Validate CSRF state
    state_data = consume_csrf_state(state)
    if not state_data:
        return RedirectResponse(f"{frontend_base}/asesor/configuracion?oauth_error=invalid_state")

    user_id = state_data["user_id"]
    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "")

    try:
        prov = get_provider("google")
        token_data = await prov.exchange_code(code, redirect_uri)
        await store_oauth_token(db, user_id, "google", token_data)
        log.info(f"[oauth] Google connected for user {user_id} ({token_data.get('email')})")
        return RedirectResponse(
            f"{frontend_base}/asesor/configuracion?oauth_success=google&email={token_data.get('email', '')}"
        )
    except Exception as e:
        log.error(f"[oauth] callback error for {user_id}: {e}")
        return RedirectResponse(f"{frontend_base}/asesor/configuracion?oauth_error=exchange_failed")


@router.post("/api/oauth/google/revoke")
async def oauth_google_revoke(request: Request):
    """Revoke Google Calendar OAuth connection."""
    user = await _auth(request)
    db = _db(request)

    from oauth_calendar import get_valid_access_token, get_provider

    access_token = await get_valid_access_token(db, user.user_id, "google")
    if access_token:
        try:
            prov = get_provider("google")
            await prov.revoke_token(access_token)
        except Exception as e:
            log.warning(f"[oauth] remote revoke failed: {e}")

    await db.oauth_tokens.update_one(
        {"user_id": user.user_id, "provider": "google"},
        {"$set": {"status": "revoked", "access_token": "", "refresh_token": ""}},
    )
    return {"ok": True, "provider": "google", "status": "revoked"}


@router.get("/api/oauth/connections")
async def get_oauth_connections(request: Request):
    """List current user's OAuth connections."""
    user = await _auth(request)
    db = _db(request)

    docs = await db.oauth_tokens.find(
        {"user_id": user.user_id}, {"_id": 0},
    ).to_list(10)

    connections = [
        {
            "provider": d["provider"],
            "email": d.get("email_connected", ""),
            "status": d.get("status", "unknown"),
            "connected_at": d.get("connected_at", ""),
            "last_refreshed_at": d.get("last_refreshed_at", ""),
            "expires_at": d.get("expires_at", ""),
        }
        for d in docs
    ]

    # Add inactive google slot if not connected
    providers_connected = {c["provider"] for c in connections}
    if "google" not in providers_connected:
        connections.append({"provider": "google", "email": "", "status": "not_connected",
                             "connected_at": "", "last_refreshed_at": "", "expires_at": ""})

    return {"connections": connections}


# ─────────────────────────────────────────────────────────────────────────────
# B) Availability + Auto-assign
# ─────────────────────────────────────────────────────────────────────────────

class AvailabilityIn(BaseModel):
    project_id: str
    date_from: str
    date_to: str


class AutoAssignIn(BaseModel):
    project_id: str
    slot_start: str
    slot_end: str
    lead_id: str
    lead_email: Optional[str] = ""


class PolicyIn(BaseModel):
    policy_type: str = "round_robin"
    asesor_pool: List[str] = []
    working_hours: Optional[Dict[str, Any]] = None
    slot_duration_min: int = 60
    buffer_min: int = 15
    max_concurrent_per_asesor: int = 1


@router.post("/api/appointments/availability")
async def post_availability(body: AvailabilityIn, request: Request):
    """Return available slots for a project within a date range."""
    await _auth(request)
    db = _db(request)

    try:
        date_from = datetime.fromisoformat(body.date_from.replace("Z", "+00:00"))
        date_to = datetime.fromisoformat(body.date_to.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(400, f"Formato de fecha inválido: {e}")

    if date_to - date_from > timedelta(days=30):
        raise HTTPException(400, "Rango máximo: 30 días")

    from availability import get_available_slots
    slots = await get_available_slots(db, body.project_id, date_from, date_to)
    return {"slots": slots, "count": len(slots), "project_id": body.project_id}


@router.post("/api/appointments/auto-assign")
async def post_auto_assign(body: AutoAssignIn, request: Request):
    """Auto-assign lead to asesor slot based on project policy."""
    user = await _auth(request)
    db = _db(request)

    from availability import assign_appointment
    try:
        result = await assign_appointment(
            db,
            project_id=body.project_id,
            slot_start=body.slot_start,
            slot_end=body.slot_end,
            lead_id=body.lead_id,
            lead_email=body.lead_email or "",
            actor_user_id=user.user_id,
        )
    except ValueError as e:
        raise HTTPException(409, str(e))

    # Notify asesor
    try:
        from routes_dev_batch14 import create_notification
        await create_notification(
            db, result["asesor_id"], "appointment_assigned",
            "Nueva cita asignada",
            f"Cita agendada: {body.slot_start[:16].replace('T', ' ')} — Proyecto {body.project_id}",
            action_url=f"/asesor/citas/{result['appointment_id']}",
            priority="high",
        )
    except Exception:
        pass

    return result


@router.get("/api/appointments/policy/{project_id}")
async def get_policy_endpoint(project_id: str, request: Request):
    await _auth(request)
    db = _db(request)
    from availability import get_policy
    return await get_policy(db, project_id)


@router.put("/api/appointments/policy/{project_id}")
async def put_policy_endpoint(project_id: str, body: PolicyIn, request: Request):
    user = await _auth(request)
    db = _db(request)

    if body.policy_type not in ("round_robin", "pre_selected", "load_balance"):
        raise HTTPException(400, "policy_type inválido")

    from availability import upsert_policy, _DEFAULT_POLICY
    patch = body.dict()
    if patch.get("working_hours") is None:
        patch["working_hours"] = _DEFAULT_POLICY["working_hours"]

    result = await upsert_policy(db, project_id, patch, user.user_id)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# C) Metrics
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/appointments/metrics")
async def get_appointment_metrics(
    request: Request,
    project_id: Optional[str] = Query(None),
    policy_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    user = await _auth(request)
    db = _db(request)

    # Build query
    q: Dict[str, Any] = {}
    if project_id:
        q["project_id"] = project_id
    if policy_type:
        q["policy_used"] = policy_type
    if date_from:
        try:
            q["created_at"] = {"$gte": date_from}
        except Exception:
            pass
    if date_to:
        q.setdefault("created_at", {})["$lte"] = date_to

    since_30d = (_now() - timedelta(days=30)).isoformat()

    # KPIs
    total_30d = await db.appointments.count_documents({"created_at": {"$gte": since_30d}})
    confirmed_30d = await db.appointments.count_documents({
        "created_at": {"$gte": since_30d}, "status": {"$in": ["confirmed", "completed"]},
    })
    completed_30d = await db.appointments.count_documents({
        "created_at": {"$gte": since_30d}, "status": "completed",
    })
    conversion_pct = round(completed_30d / total_30d * 100) if total_30d else 0

    # Top performer asesor
    pipeline = [
        {"$match": {"created_at": {"$gte": since_30d}, "status": {"$in": ["confirmed", "completed"]}}},
        {"$group": {"_id": "$asesor_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}, {"$limit": 1},
    ]
    top_raw = await db.appointments.aggregate(pipeline).to_list(1)
    top_asesor = top_raw[0]["_id"] if top_raw else None
    top_asesor_count = top_raw[0]["count"] if top_raw else 0

    # Distribution by asesor
    dist_pipeline = [
        {"$match": {"created_at": {"$gte": since_30d}}},
        {"$group": {"_id": "$asesor_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    distribution = await db.appointments.aggregate(dist_pipeline).to_list(20)

    # Recent appointments table
    items = await db.appointments.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)

    return {
        "kpis": {
            "auto_assigned_30d": total_30d,
            "confirmed_30d": confirmed_30d,
            "conversion_pct": conversion_pct,
            "top_asesor_id": top_asesor,
            "top_asesor_count": top_asesor_count,
        },
        "distribution": [{"asesor_id": d["_id"], "count": d["count"]} for d in distribution],
        "items": items,
        "count": len(items),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public booking endpoint (from marketplace)
# ─────────────────────────────────────────────────────────────────────────────

class PublicBookingIn(BaseModel):
    project_id: str
    slot_start: str
    slot_end: str
    lead_name: str
    lead_email: str
    lead_phone: Optional[str] = ""
    notes: Optional[str] = ""


@router.post("/api/public/appointments/book")
async def public_book_appointment(body: PublicBookingIn, request: Request):
    """Public booking endpoint — creates or reuses lead + auto-assigns appointment."""
    db = _db(request)

    # Find or create lead
    lead = await db.leads.find_one({"email": body.lead_email}, {"_id": 0, "lead_id": 1})
    if lead:
        lead_id = lead["lead_id"]
    else:
        lead_id = str(uuid.uuid4())
        await db.leads.insert_one({
            "id": lead_id,
            "lead_id": lead_id,
            "name": body.lead_name,
            "email": body.lead_email,
            "phone": body.lead_phone,
            "project_id": body.project_id,
            "lead_stage": "calificado",
            "source": "marketplace_booking",
            "created_at": _now().isoformat(),
        })
        try:
            from routes_dev_batch14 import log_activity
            await log_activity(
                db, lead_id, "lead", "lead_created", lead_id, "lead",
                metadata={"name": body.lead_name, "project_id": body.project_id,
                           "source": "marketplace_booking"},
            )
        except Exception:
            pass

    from availability import assign_appointment
    try:
        result = await assign_appointment(
            db,
            project_id=body.project_id,
            slot_start=body.slot_start,
            slot_end=body.slot_end,
            lead_id=lead_id,
            lead_email=body.lead_email,
            actor_user_id="public",
        )
    except ValueError as e:
        raise HTTPException(409, str(e))

    # Get asesor name for response
    asesor_name = ""
    asesor_doc = await db.users.find_one({"user_id": result["asesor_id"]}, {"_id": 0, "name": 1})
    if asesor_doc:
        asesor_name = asesor_doc.get("name", "")

    return {
        "ok": True,
        "appointment_id": result["appointment_id"],
        "asesor_id": result["asesor_id"],
        "asesor_name": asesor_name,
        "slot_start": result["slot_start"],
        "slot_end": result["slot_end"],
        "ics": result.get("ics", ""),
        "calendar_html_link": result.get("calendar_html_link", ""),
        "lead_id": lead_id,
    }


@router.get("/api/oauth/advisor-pool")
async def get_advisor_pool(request: Request):
    """List advisors that have an active Google Calendar connection (for asesor pool multi-select)."""
    user = await _auth(request)
    db = _db(request)

    # Get all users with active google connections
    active_tokens = await db.oauth_tokens.find(
        {"provider": "google", "status": "active"},
        {"_id": 0, "user_id": 1, "email_connected": 1},
    ).to_list(200)

    connected_user_ids = [t["user_id"] for t in active_tokens]
    email_map = {t["user_id"]: t.get("email_connected", "") for t in active_tokens}

    advisors = []
    if connected_user_ids:
        users = await db.users.find(
            {"user_id": {"$in": connected_user_ids}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
        ).to_list(100)
        for u in users:
            advisors.append({
                "user_id": u["user_id"],
                "name": u.get("name", ""),
                "email": email_map.get(u["user_id"], u.get("email", "")),
                "google_connected": True,
            })

    return {"advisors": advisors, "count": len(advisors)}


# ─────────────────────────────────────────────────────────────────────────────
# Indexes
# ─────────────────────────────────────────────────────────────────────────────

async def ensure_batch15_indexes(db):
    await db.appointment_policies.create_index("project_id", unique=True, background=True)
    await db.appointment_assign_log.create_index(
        [("project_id", 1), ("asesor_id", 1), ("assigned_at", -1)], background=True,
    )
    await db.availability_cache.create_index(
        [("project_id", 1), ("date_key", 1)], background=True,
    )
    await db.availability_cache.create_index("expires_at", background=True)
    # Extend appointments with B15 fields index
    await db.appointments.create_index("calendar_event_id", sparse=True, background=True)
    await db.appointments.create_index("policy_used", sparse=True, background=True)
    log.info("[batch15] indexes ensured")
