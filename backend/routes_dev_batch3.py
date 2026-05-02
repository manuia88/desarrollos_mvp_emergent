"""Phase 4 Batch 3 — Internal users login flow + GeoJSON export.

Scope:
  4.9  GET  /api/dev/invitations/{token}/verify
       POST /api/dev/invitations/{token}/accept   (creates users entry + JWT cookies)
       POST /api/auth/internal/login              (alias wrapper for main /auth/login)
  4.18 GET  /api/dev/projects/{project_id}/export/geojson

All mutations call audit_log.log_mutation + observability.emit_ml_event.
Reuses existing bcrypt/JWT helpers from server.py (hash_password, verify_password,
create_access_token, create_refresh_token).
"""
from __future__ import annotations

import json
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import Response as FastResponse
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(tags=["dev-batch3"])

INTERNAL_ROLE_TO_USERS_ROLE = {
    "admin":                "developer_admin",
    "commercial_director":  "developer_member",
    "comercial":            "developer_member",
    "obras":                "developer_member",
    "marketing":            "developer_member",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(pfx: str) -> str:
    return f"{pfx}_{uuid.uuid4().hex[:12]}"


def _db(request: Request):
    return request.app.state.db


# ═════════════════════════════════════════════════════════════════════════════
# 4.9 · INVITATION VERIFY + ACCEPT + INTERNAL LOGIN
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/api/dev/invitations/{token}/verify")
async def verify_invitation(token: str, request: Request):
    """Public (no auth). Check token validity and return safe metadata for UI."""
    db = _db(request)
    inv = await db.dev_internal_users.find_one({"activation_token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invitación no encontrada o ya utilizada")
    if inv.get("status") != "invited":
        raise HTTPException(410, "Invitación ya activada o deshabilitada")
    exp_str = inv.get("activation_expires_at")
    if exp_str:
        try:
            exp = datetime.fromisoformat(exp_str)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < _now():
                raise HTTPException(410, "Invitación expirada")
        except ValueError:
            pass  # malformed — treat as no expiry
    # Safe metadata only.
    org_name = (inv.get("dev_org_id", "") or "").replace("_", " ").title() or "DesarrollosMX"
    return {
        "email":        inv["email"],
        "name":         inv.get("name", ""),
        "role":         inv["role"],
        "dev_org_name": org_name,
        "expires_at":   exp_str,
    }


class AcceptInvitationPayload(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)


@router.post("/api/dev/invitations/{token}/accept")
async def accept_invitation(token: str, payload: AcceptInvitationPayload, request: Request, response: Response):
    """Public (no auth). Activates the invited user and auto-logs them in."""
    if payload.password != payload.confirm_password:
        raise HTTPException(400, "Las contraseñas no coinciden")

    db = _db(request)
    inv = await db.dev_internal_users.find_one({"activation_token": token}, {"_id": 0})
    if not inv or inv.get("status") != "invited":
        raise HTTPException(404, "Invitación inválida")

    exp_str = inv.get("activation_expires_at")
    if exp_str:
        try:
            exp = datetime.fromisoformat(exp_str)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < _now():
                raise HTTPException(410, "Invitación expirada")
        except ValueError:
            pass

    # Reuse existing bcrypt/JWT helpers from server.
    from server import hash_password, create_access_token, create_refresh_token

    dev_org_id = inv["dev_org_id"]
    email = inv["email"].lower()

    # Check email not already taken in main users collection.
    existing_user = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "password_hash":  hash_password(payload.password),
                "role":           INTERNAL_ROLE_TO_USERS_ROLE.get(inv["role"], "developer_member"),
                "tenant_id":      dev_org_id,
                "internal_role":  inv["role"],
                "name":           inv.get("name") or email.split("@")[0],
            }},
        )
    else:
        user_id = _uid("user")
        await db.users.insert_one({
            "user_id":        user_id,
            "email":          email,
            "name":           inv.get("name") or email.split("@")[0],
            "password_hash":  hash_password(payload.password),
            "role":           INTERNAL_ROLE_TO_USERS_ROLE.get(inv["role"], "developer_member"),
            "tenant_id":      dev_org_id,
            "internal_role":  inv["role"],
            "onboarded":      True,
            "created_at":     _now(),
        })

    # Update invitation record.
    await db.dev_internal_users.update_one(
        {"id": inv["id"]},
        {"$set": {
            "status":           "active",
            "user_id":          user_id,
            "password_hash":    "set",   # reference flag only — real hash lives in users
            "last_login_at":    _now().isoformat(),
            "activated_at":     _now().isoformat(),
        }, "$unset": {"activation_token": ""}},
    )

    # Issue JWT cookies (same pattern as /api/auth/login).
    access_token  = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    response.set_cookie("access_token",  access_token,
                        httponly=True, secure=True, samesite="none",
                        max_age=60 * 60 * 8, path="/")
    response.set_cookie("refresh_token", refresh_token,
                        httponly=True, secure=True, samesite="none",
                        max_age=60 * 60 * 24 * 30, path="/")

    # Audit + ML event (best-effort).
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        pseudo_user = {"user_id": user_id, "role": INTERNAL_ROLE_TO_USERS_ROLE.get(inv["role"]), "tenant_id": dev_org_id, "name": inv.get("name")}
        await log_mutation(
            db, pseudo_user, "update", "dev_internal_users", inv["id"],
            before={"status": "invited"},
            after={"status": "active", "internal_role": inv["role"]},
            request=request,
        )
        await emit_ml_event(
            db, event_type="internal_user_activated",
            user_id=user_id, org_id=dev_org_id, role=inv["role"],
            context={"internal_user_id": inv["id"], "email": email},
            ai_decision={}, user_action={"action": "accept_invite"},
        )
    except Exception:
        pass

    return {
        "ok":      True,
        "user": {
            "user_id":       user_id,
            "email":         email,
            "name":          inv.get("name") or email.split("@")[0],
            "role":          INTERNAL_ROLE_TO_USERS_ROLE.get(inv["role"], "developer_member"),
            "tenant_id":     dev_org_id,
            "internal_role": inv["role"],
            "onboarded":     True,
        },
    }


class InternalLoginPayload(BaseModel):
    email: str
    password: str


@router.post("/api/auth/internal/login")
async def internal_login(payload: InternalLoginPayload, request: Request, response: Response):
    """Login endpoint for internal (invited) users. Delegates to the main users
    collection but also bumps last_login_at on dev_internal_users when linked.
    """
    from server import verify_password, create_access_token, create_refresh_token

    db = _db(request)
    email = payload.email.lower().strip()
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(401, "Email o contraseña incorrectos")

    # Must be an internal-user flavoured role (dev_admin / dev_member / superadmin).
    if user_doc.get("role") not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Usuario no pertenece al Portal Desarrollador")

    user_id = user_doc["user_id"]
    access  = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token",  access,
                        httponly=True, secure=True, samesite="none",
                        max_age=60 * 60 * 8, path="/")
    response.set_cookie("refresh_token", refresh,
                        httponly=True, secure=True, samesite="none",
                        max_age=60 * 60 * 24 * 30, path="/")

    # Update last_login_at on dev_internal_users (best-effort).
    await db.dev_internal_users.update_one(
        {"user_id": user_id},
        {"$set": {"last_login_at": _now().isoformat()}},
    )

    try:
        from observability import emit_ml_event
        await emit_ml_event(
            db, event_type="internal_user_login",
            user_id=user_id, org_id=user_doc.get("tenant_id"), role=user_doc.get("role"),
            context={"email": email, "internal_role": user_doc.get("internal_role")},
            ai_decision={}, user_action={"action": "login"},
        )
    except Exception:
        pass

    user_doc.pop("password_hash", None)
    return {"ok": True, "user": user_doc}


# ═════════════════════════════════════════════════════════════════════════════
# 4.18 · GEOJSON EXPORT
# ═════════════════════════════════════════════════════════════════════════════

GEOJSON_ALLOWED_ROLES = {"developer_admin", "superadmin", "commercial_director"}


def _unit_offset(idx: int) -> tuple:
    """Synthesize a small offset (~±50m) for each unit around the project
    center so that exports are useful even when per-unit geometry is unknown.
    Deterministic using idx as seed."""
    r = random.Random(idx * 2654435761 % 2**32)
    # ±0.0005° lat ≈ ±55m, ±0.0005° lng ≈ ±52m at CDMX latitude
    return (r.uniform(-0.0005, 0.0005), r.uniform(-0.0005, 0.0005))


@router.get("/api/dev/projects/{project_id}/export/geojson")
async def export_project_geojson(project_id: str, request: Request):
    """Return a FeatureCollection with:
       - 1 Point feature for the project (base location)
       - N Point features (one per unit) around the project
    Requires an explicitly configured location (422 otherwise).
    """
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")

    effective_role = user.role
    if effective_role not in GEOJSON_ALLOWED_ROLES:
        # Consider internal_role too (for developer_member with commercial_director internal role).
        db = _db(request)
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "internal_role": 1})
        if (u or {}).get("internal_role") == "commercial_director":
            effective_role = "commercial_director"
        else:
            raise HTTPException(403, "Rol no autorizado para exportar GeoJSON")

    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")

    db = _db(request)
    tenant_id = getattr(user, "tenant_id", None) or "default"
    meta = await db.dev_project_meta.find_one(
        {"project_id": project_id, "dev_org_id": tenant_id}, {"_id": 0}
    )
    if not meta or meta.get("lat") is None or meta.get("lng") is None:
        raise HTTPException(422, "Geolocalización no configurada — edita la ubicación antes de exportar")

    base_lat = float(meta["lat"])
    base_lng = float(meta["lng"])

    # Pull construction progress for per-unit percent_complete + current_stage.
    prog = await db.project_construction_progress.find_one(
        {"project_id": project_id, "dev_org_id": tenant_id}, {"_id": 0}
    )
    units_progress = {u["unit_id"]: u for u in (prog or {}).get("units", [])}

    # Pull IE overall (best-effort).
    ie_overall: Optional[float] = None
    async for s in db.ie_scores.find({"zone_id": project_id}, {"_id": 0, "code": 1, "value": 1}):
        if s.get("code") == "P1" and s.get("value") is not None:
            ie_overall = float(s["value"])
            break

    # Build features.
    features: List[Dict[str, Any]] = []
    features.append({
        "type": "Feature",
        "id":   f"project-{project_id}",
        "geometry": {"type": "Point", "coordinates": [base_lng, base_lat]},
        "properties": {
            "kind":              "project",
            "project_id":        project_id,
            "name":              dev["name"],
            "colonia":           dev["colonia"],
            "colonia_id":        dev["colonia_id"],
            "units_total":       dev.get("units_total"),
            "units_available":   dev.get("units_available"),
            "status":            dev.get("status") or dev.get("stage"),
            "ie_score_overall":  ie_overall,
            "overall_percent":   (prog or {}).get("overall_percent"),
            "price_from_mxn":    dev.get("price_from"),
            "developer_id":      dev.get("developer_id"),
            "exported_at":       _now().isoformat(),
        },
    })

    for i, u in enumerate(dev.get("units", [])):
        d_lat, d_lng = _unit_offset(i)
        prog_u = units_progress.get(u["id"], {})
        features.append({
            "type": "Feature",
            "id":   f"unit-{u['id']}",
            "geometry": {"type": "Point", "coordinates": [base_lng + d_lng, base_lat + d_lat]},
            "properties": {
                "kind":             "unit",
                "unit_id":          u["id"],
                "unit_number":      u.get("unit_number"),
                "prototype":        u.get("prototype"),
                "level":            u.get("level"),
                "status":           u.get("status"),
                "price_mxn":        u.get("price"),
                "area_m2":          u.get("area_m2"),
                "percent_complete": prog_u.get("percent_complete"),
                "current_stage":    prog_u.get("current_stage"),
            },
        })

    geojson = {
        "type":     "FeatureCollection",
        "features": features,
        "metadata": {
            "generated_by":      "DesarrollosMX",
            "generator_version": "batch3",
            "project_id":        project_id,
            "project_name":      dev["name"],
            "feature_count":     len(features),
        },
    }

    # Audit + ML (best-effort).
    try:
        from audit_log import log_mutation
        from observability import emit_ml_event
        await log_mutation(
            db, user, "read", "project_geojson_export", project_id,
            before=None,
            after={"exported_at": _now().isoformat(), "units_count": len(dev.get("units", [])), "role": effective_role},
            request=request,
        )
        await emit_ml_event(
            db, event_type="geojson_export",
            user_id=user.user_id, org_id=tenant_id, role=user.role,
            context={"project_id": project_id, "units_count": len(dev.get("units", []))},
            ai_decision={}, user_action={"action": "export"},
        )
    except Exception:
        pass

    body = json.dumps(geojson, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"project-{dev.get('slug') or project_id}.geojson"
    return FastResponse(
        content=body,
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═════════════════════════════════════════════════════════════════════════════
# INDEXES
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_dev_batch3_indexes(db) -> None:
    # dev_internal_users already indexed in B1 (email+dev_org_id). Add link index.
    await db.dev_internal_users.create_index([("activation_token", 1)], background=True, sparse=True)
    await db.dev_internal_users.create_index([("user_id", 1)], background=True, sparse=True)
    import logging
    logging.getLogger("dmx").info("[dev_batch3] indexes ensured")
