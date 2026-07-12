"""Phase 4 Batch 0 — Auth routes extracted from server.py.
Endpoints: /api/auth/{register,login,session,me,select-role,logout}
Backward-compat: same URLs, same cookie behavior.
"""
import os
import time
import uuid
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, computed_field, field_validator
from typing import Optional

log = logging.getLogger("dmx.auth")

router = APIRouter(tags=["auth"])

ADVISOR_ROLES = {"advisor", "asesor_admin", "superadmin"}

# Roles que un registro público puede auto-asignar. Cualquier otro (superadmin,
# asesor_admin, …) se fuerza a "buyer": elevar privilegio es solo vía invitación/admin.
# Espejo del allowlist de /select-role. Cierra el hueco de "registrarse como superadmin".
PUBLIC_REGISTER_ROLES = {"buyer", "advisor", "developer_admin"}

# Dev/Prod cookie config · localhost requiere secure=False + samesite=lax
# porque browser bloquea cookies con secure=True sin HTTPS.
# CSRF-01: en prod la cookie sale SameSite=None (cross-site) — el riesgo CSRF que eso
# abre lo cierra el middleware server.csrf_cookie_origin_guard (valida Origin/Referer en
# mutaciones auth-por-cookie). NO cambiar a 'lax' aquí sin verificar flujos cross-site.
_DEV_MODE = os.environ.get("DMX_DEV_MODE", "false").lower() == "true"
COOKIE_SECURE = not _DEV_MODE
COOKIE_SAMESITE = "lax" if _DEV_MODE else "none"


def _db(request: Request):
    return request.app.state.db


# ─── P1.9 · Freno a fuerza bruta en login (in-memory, sliding window) ──────────
# Cuenta intentos FALLIDOS por (ip+email) y por ip; al éxito se limpia. Defiende sin
# castigar al usuario legítimo que sí acierta. (Para multi-instancia, mover a Redis.)
_LOGIN_FAILS = defaultdict(deque)
LOGIN_MAX_FAILS = 8          # por (ip, email) en la ventana
LOGIN_MAX_FAILS_IP = 40      # por ip (anti-spray a muchos correos)
LOGIN_WINDOW_S = 300         # 5 minutos


def _client_ip(request: Request) -> str:
    # SEGURIDAD (pentest 2026-06-27): delega al helper canónico anti-spoofing. Antes tomaba XFF[0] = el valor que
    # CONTROLA el cliente → rotando X-Forwarded-For se evadía el anti-brute-force del login (credential stuffing
    # sin freno). El canónico usa el salto de confianza (ver ratelimit.client_ip).
    try:
        from ratelimit import client_ip as _canonical
        return _canonical(request)
    except Exception:
        pass
    fwd = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else "unknown")


def _login_guard(ip: str, email: str) -> None:
    now = time.time()
    for key, limit in ((f"e:{ip}:{email}", LOGIN_MAX_FAILS), (f"i:{ip}", LOGIN_MAX_FAILS_IP)):
        b = _LOGIN_FAILS[key]
        while b and (now - b[0]) > LOGIN_WINDOW_S:
            b.popleft()
        if len(b) >= limit:
            raise HTTPException(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")


def _login_fail(ip: str, email: str) -> None:
    now = time.time()
    _LOGIN_FAILS[f"e:{ip}:{email}"].append(now)
    _LOGIN_FAILS[f"i:{ip}"].append(now)


def _login_ok(ip: str, email: str) -> None:
    _LOGIN_FAILS.pop(f"e:{ip}:{email}", None)


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None
    onboarded: Optional[bool] = None

    @computed_field  # P1.12 · hash de analítica calculado en el backend (salt server-only)
    @property
    def analytics_id(self) -> Optional[str]:
        try:
            from server import analytics_id_for
            return analytics_id_for(self.user_id)
        except Exception:
            return None


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str = Field(..., min_length=10, max_length=200)
    name: str
    role: str = "buyer"

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        # SEGURIDAD P1 (auditoría 2026-07-12): antes register aceptaba passwords de 1 carácter.
        # Mínimo 10 chars (Field) + debe combinar letras y números. (max_length: bcrypt trunca a 72 bytes;
        # el cap evita DoS por hashing de passwords gigantes.)
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("La contraseña debe incluir letras y números")
        return v


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
    # Seguridad: el role del cliente solo puede ser self-serve (espejo de /select-role).
    # Privilegiados (superadmin/asesor_admin/developer_director/inmobiliaria_*) SOLO se
    # asignan server-side (seed/admin), nunca por registro público.
    if payload.role not in PUBLIC_REGISTER_ROLES:
        log.warning(f"[auth] register rechazado: role '{payload.role}' no permitido para {payload.email}")
        raise HTTPException(400, "Rol no válido")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    # [AUD-023] BLOCKER IDOR cross-tenant: antes se registraba con tenant_id=None y tenant_of() cae a
    # el sentinel COMPARTIDO "default" → todos los developer_admin auto-registrados quedaban en el MISMO
    # tenant y veían/tocaban los datos de los demás. Se provisiona un tenant PROPIO por dev self-registrado
    # (roles org-scoped) para aislarlos; buyer/advisor no poseen datos multi-tenant vía tenant_of → None ok.
    _tenant = f"org_{user_id}" if payload.role == "developer_admin" else None
    await db.users.insert_one({
        "user_id": user_id, "email": payload.email,
        "name": payload.name, "password_hash": hash_password(payload.password),
        "role": payload.role, "tenant_id": _tenant,
        "onboarded": True,
        "created_at": datetime.now(timezone.utc),
    })
    access = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=2592000)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**user_doc)}


@router.post("/api/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    from server import verify_password, create_access_token, create_refresh_token
    db = _db(request)
    payload.email = payload.email.lower().strip()
    ip = _client_ip(request)
    _login_guard(ip, payload.email)  # P1.9 · bloquea fuerza bruta
    user_doc = await db.users.find_one({"email": payload.email})
    # SEGURIDAD (pentest 2026-06-27): corre bcrypt SIEMPRE — aun si el email no existe — contra un hash dummy válido,
    # para que el tiempo de respuesta sea igual exista o no la cuenta (cierra la enumeración de cuentas por timing).
    _hash = (user_doc or {}).get("password_hash") or "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
    _pw_ok = verify_password(payload.password, _hash)
    if not user_doc or not _pw_ok:
        _login_fail(ip, payload.email)
        raise HTTPException(401, "Credenciales incorrectas")
    # W1.2 SA1.1 — Block suspended accounts before issuing session cookies
    if user_doc.get("account_blocked"):
        raise HTTPException(403, "Cuenta suspendida. Contactar soporte.")
    _login_ok(ip, payload.email)
    user_id = user_doc["user_id"]
    access = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=2592000)
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
    # SEGURIDAD P0 (auditoría 2026-07-12): este endpoint hacía un GET a
    # demobackend.emergentagent.com (proveedor RETIRADO) y confiaba en el email que devolvía →
    # cualquiera podía autenticarse como cualquier cuenta (account takeover). Emergent está retirado
    # y CC construye todo; el flujo OAuth de Emergent ya está muerto en el front (solo disparaba con
    # session_id en el hash, que ya nadie recibe). Se DESACTIVA para cerrar el vector. Login = /api/auth/login.
    raise HTTPException(410, "OAuth de sesión externo desactivado. Usa /api/auth/login.")


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
    # P1.11 · revoca los JWT (no solo borra cookies): el token deja de servir aunque alguien lo tenga.
    try:
        from server import _revoke_token_str
        for ck in ("access_token", "refresh_token"):
            tk = request.cookies.get(ck)
            if tk:
                await _revoke_token_str(tk)
    except Exception:
        pass
    response.delete_cookie("session_token", path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
    response.delete_cookie("access_token", path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
    response.delete_cookie("refresh_token", path="/", samesite=COOKIE_SAMESITE, secure=COOKIE_SECURE)
    return {"message": "Sesión cerrada"}


# ─── Phase 4 Batch 28 — Magic Link auth (buyer portal) ────────────────────────

import secrets as _secrets
import hashlib as _hashlib
from collections import defaultdict as _dd, deque as _dq
import time as _time

class MagicLinkRequestIn(BaseModel):
    email: str
    name: Optional[str] = None

_ML_RATE = _dd(_dq)


def _ml_check_rate(ip: str, limit: int = 5) -> bool:
    key = _hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = _time.monotonic()
    win = _ML_RATE[key]
    while win and now - win[0] > 60:
        win.popleft()
    if len(win) >= limit:
        return False
    win.append(now)
    return True


def _ml_get_ip(request: Request) -> str:
    # [AUD-022] Antes tomaba X-Forwarded-For[0] (PRIMER hop, controlado por el cliente) → rotar el header
    # evadía el rate-limit 5/min del magic-link (spam de correos / enumeración). Se usa el client_ip
    # CANÓNICO anti-spoof (mismo helper que el pentest 2026-06-27 aplicó al resto de rate-limits).
    try:
        from ratelimit import client_ip
        return client_ip(request) or "unknown"
    except Exception:
        return request.client.host if request.client else "unknown"


def _ml_frontend_base() -> str:
    """Best-effort base url para el link (lee env var si existe)."""
    base = os.environ.get("FRONTEND_BASE_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    if base:
        return base.rstrip("/")
    return ""


@router.post("/api/auth/comprador/magic-link/request")
async def request_magic_link(payload: MagicLinkRequestIn, request: Request):
    """Envía un magic-link al email. Crea user role=buyer si no existe (lo materializa el verify)."""
    if not _ml_check_rate(_ml_get_ip(request), 5):
        raise HTTPException(429, "Demasiadas solicitudes. Intenta en 1 minuto.")

    email = (payload.email or "").strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Email inválido")
    if len(email) > 200:
        raise HTTPException(400, "Email demasiado largo")

    db = _db(request)
    token = _secrets.token_urlsafe(24)
    token_hash = _hashlib.sha256(token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=15)

    # Guardar token (única doc por email para invalidar previos)
    await db.magic_link_tokens.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "name_hint": (payload.name or "").strip()[:120] or None,
            "used": False,
            "created_at": now,
        }},
        upsert=True,
    )

    # Construir URL al frontend. SEGURIDAD (pentest 2026-06-27): NO confiar en headers controlados por el
    # cliente (Origin / X-Forwarded-Host) — antes permitían host-header injection: el email del usuario llevaba
    # un link al dominio del ATACANTE (phishing / robo del token). Solo FRONTEND_BASE_URL (env de confianza) o
    # el dominio canónico de producción.
    base = _ml_frontend_base() or "https://desarrollosmx.io"
    link = f"{base}/login-comprador?token={token}"

    # Enviar email
    email_sent = False
    try:
        from services.lead_capture import _send_email
        html = f"""<!DOCTYPE html><html lang="es"><body style="background:#06080F;font-family:'DM Sans',Arial;padding:32px 20px;max-width:560px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:22px;">
            <div style="display:inline-block;padding:7px 18px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:12px;">DesarrollosMX</div>
          </div>
          <h1 style="font-family:Outfit,Arial;font-weight:800;font-size:22px;color:#F0EBE0;margin:0 0 12px;letter-spacing:-0.02em;">Tu acceso seguro</h1>
          <p style="color:rgba(240,235,224,0.65);font-size:14px;line-height:1.6;margin:0 0 22px;">
            Haz clic en el botón para entrar a tu cuenta. Este enlace expira en 15 minutos.
          </p>
          <div style="text-align:center;margin:18px 0;">
            <a href="{link}" style="display:inline-block;padding:13px 28px;background:linear-gradient(90deg,#6366F1,#EC4899);border-radius:9999px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;">
              Entrar a DesarrollosMX
            </a>
          </div>
          <p style="color:rgba(240,235,224,0.40);font-size:11px;margin:22px 0 0;">
            Si no solicitaste este link, ignora este correo. Tu cuenta sigue protegida.
          </p>
        </body></html>"""
        email_sent = await _send_email(
            to=email,
            subject="Tu acceso a DesarrollosMX",
            html=html,
        )
    except Exception as ex:
        log.warning(f"[magic_link] email failed: {ex}")

    # SEGURIDAD (pentest 2026-06-27): NUNCA devolver el token en la respuesta HTTP. Antes, si el email fallaba se
    # devolvía debug_token/debug_link = un token de login VÁLIDO → toma de control de CUALQUIER cuenta (bastaba con
    # forzar el fallo de envío con un email que rebota). El token solo viaja por el correo.
    return {"sent": True, "email_sent": email_sent, "expires_in_minutes": 15}


@router.get("/api/auth/comprador/magic-link/verify")
async def verify_magic_link(token: str, request: Request, response: Response):
    from server import create_access_token, create_refresh_token
    if not token or len(token) > 200:
        raise HTTPException(400, "Token inválido")

    db = _db(request)
    token_hash = _hashlib.sha256(token.encode()).hexdigest()
    doc = await db.magic_link_tokens.find_one({"token_hash": token_hash}, {"_id": 0})
    if not doc:
        raise HTTPException(401, "Token inválido o ya usado")

    if doc.get("used"):
        raise HTTPException(401, "Este link ya fue usado")

    expires = doc.get("expires_at")
    if isinstance(expires, datetime):
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(401, "Link expirado · solicita uno nuevo")

    email = doc["email"]

    # Find or create user
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    is_new = user_doc is None
    if is_new:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email,
            "name": doc.get("name_hint") or email.split("@")[0],
            "role": "buyer", "tenant_id": None,
            "onboarded": True,
            "created_at": datetime.now(timezone.utc),
            "auth_method": "magic_link",
        })
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    else:
        user_id = user_doc["user_id"]
        # Si el user existe y estaba soft-deleted, NO lo restauramos automáticamente:
        # el usuario debe cancelar la eliminación de forma explícita desde el portal
        # (POST /api/comprador/privacy/cancel-delete) durante el período de gracia.
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"last_login_at": datetime.now(timezone.utc)}},
        )

    # Mark token as used
    await db.magic_link_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}},
    )

    # Issue cookies (mismo formato que login con password)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=2592000)

    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    return {"user": UserOut(**user_doc), "is_new": is_new}


# ─── Phase 14 Batch 37 — In-house Invitation Accept ───────────────────────────

class AcceptInvitationIn(BaseModel):
    token: str = Field(..., min_length=10)
    name: str = Field(..., min_length=2, max_length=100)
    password: Optional[str] = Field(None, min_length=8)


@router.post("/api/auth/in-house/accept-invitation")
async def accept_in_house_invitation(
    payload: AcceptInvitationIn,
    response: Response,
    request: Request,
):
    db = request.app.state.db
    from server import hash_password, create_access_token, create_refresh_token
    from services.internal_users import accept_invitation

    password_hash = None
    if payload.password:
        password_hash = hash_password(payload.password)

    try:
        user_doc = await accept_invitation(
            db, payload.token, payload.name, password_hash,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    if not user_doc:
        raise HTTPException(500, "Error al crear el usuario")

    user_id = user_doc.get("user_id")
    email = user_doc.get("email", "")
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE, max_age=2592000)

    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)

    # Determine redirect based on org_type
    org_type_hint = ""
    try:
        u_full = await db.users.find_one({"user_id": user_id}, {"_id": 0, "role": 1})
        if u_full:
            role = u_full.get("role", "")
            if role.startswith("inmobiliaria"):
                org_type_hint = "inmobiliaria"
            elif role.startswith("developer"):
                org_type_hint = "dev"
    except Exception:
        pass

    return {
        "user": UserOut(**user_doc),
        "org_type": org_type_hint,
        "redirect": "/inmobiliaria" if org_type_hint == "inmobiliaria" else "/desarrollador",
    }
