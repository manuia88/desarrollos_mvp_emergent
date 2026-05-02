"""Phase 4 Batch 0 — Auth routes extracted from server.py.
Endpoints: /api/auth/{register,login,session,me,select-role,logout}
Backward-compat: same URLs, same cookie behavior.
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional

log = logging.getLogger("dmx.auth")

router = APIRouter(tags=["auth"])

ADVISOR_ROLES = {"advisor", "asesor_admin", "superadmin"}


def _db(request: Request):
    return request.app.state.db


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None
    onboarded: Optional[bool] = None


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str
    role: str = "buyer"


class SessionCreate(BaseModel):
    session_id: str


class SelectRoleIn(BaseModel):
    role: str


@router.post("/api/auth/register")
async def register(payload: RegisterIn, response: Response, request: Request):
    from server import hash_password, create_access_token, create_refresh_token
    db = _db(request)
    payload.email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(400, "El correo ya está registrado")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id, "email": payload.email,
        "name": payload.name, "password_hash": hash_password(payload.password),
        "role": payload.role, "tenant_id": None,
        "onboarded": True,
        "created_at": datetime.now(timezone.utc),
    })
    access = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**user_doc)}


@router.post("/api/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    from server import verify_password, create_access_token, create_refresh_token
    db = _db(request)
    payload.email = payload.email.lower().strip()
    user_doc = await db.users.find_one({"email": payload.email})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(401, "Credenciales incorrectas")
    user_id = user_doc["user_id"]
    access = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    uo = UserOut(**user_doc)
    try:
        from observability import identify_user, capture_event
        identify_user(uo.model_dump())
        capture_event(uo.user_id, "user_logged_in", {"method": "password", "role": uo.role})
    except Exception:
        pass
    return {"user": uo}


@router.post("/api/auth/session")
async def create_session(payload: SessionCreate, response: Response, request: Request):
    db = _db(request)
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(401, "session_id inválido")
    data = resp.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(401, "Datos de sesión incompletos")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "role": "buyer", "tenant_id": None,
            "onboarded": False,
            "created_at": datetime.now(timezone.utc),
        })
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=604800)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": UserOut(**user_doc)}


@router.get("/api/auth/me")
async def get_me(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


@router.post("/api/auth/select-role")
async def select_role(payload: SelectRoleIn, request: Request):
    from server import get_current_user
    db = _db(request)
    allowed = {"buyer", "advisor", "developer_admin"}
    if payload.role not in allowed:
        raise HTTPException(400, "Rol no válido")
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if not user_doc or user_doc.get("onboarded") is not False:
        raise HTTPException(409, "Ya completaste la selección de rol")
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"role": payload.role, "onboarded": True}},
    )
    fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**fresh)}


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    db = _db(request)
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    response.delete_cookie("access_token", path="/", samesite="none", secure=True)
    response.delete_cookie("refresh_token", path="/", samesite="none", secure=True)
    return {"message": "Sesión cerrada"}
