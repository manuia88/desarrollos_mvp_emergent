import os
import uuid
import bcrypt
import jwt as pyjwt
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, Depends, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

load_dotenv()

# Phase F0.11 — Sentry MUST init before FastAPI app for auto-instrumentation.
from observability import init_sentry, init_posthog
init_sentry()
init_posthog()

from data_seed import COLONIAS as SEED_COLONIAS, COLONIAS_BY_ID, PROPERTIES as SEED_PROPERTIES
from data_developments import (
    DEVELOPMENTS, DEVELOPMENTS_BY_ID, ALL_UNITS,
    DEVELOPERS, DEVELOPERS_BY_ID,
)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

app = FastAPI(title="DesarrollosMX API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
app.state.db = db

# Wire advisor portal router
from routes_advisor import router as advisor_router
app.include_router(advisor_router)

# Wire developer portal router
from routes_developer import router as developer_router
app.include_router(developer_router)

# Wire IE Engine (Phase A) router
from routes_ie_engine import router as ie_engine_router, seed_ie_engine
from scheduler_ie import start_scheduler, stop_scheduler
from routes_scores import sa_router as ie_scores_sa_router, pub_router as ie_scores_pub_router
from narrative_engine import (
    pub_router as narrative_pub_router,
    sa_router as narrative_sa_router,
    ensure_indexes as narrative_ensure_indexes,
)
from briefing_engine import (
    router as briefing_router,
    ensure_indexes as briefing_ensure_indexes,
)
from score_engine import ensure_score_indexes, auto_discover as discover_recipes
app.include_router(ie_engine_router)
app.include_router(ie_scores_sa_router)
app.include_router(ie_scores_pub_router)
app.include_router(narrative_pub_router)
app.include_router(narrative_sa_router)
app.include_router(briefing_router)

# Wire Studio router (Phase 6 Wave 1)
from routes_studio import router as studio_router
app.include_router(studio_router)

# Wire Document Intelligence router (Phase 7.1 — Moat #2)
from routes_documents import router as documents_router, dev_alias as documents_dev_alias_router, public_router as assets_public_router
from document_intelligence import ensure_di_indexes
app.include_router(documents_router)
app.include_router(documents_dev_alias_router)
app.include_router(assets_public_router)

# Phase 7.6 — Static asset serving (public, no auth)
from fastapi.staticfiles import StaticFiles
from dev_assets import ASSET_UPLOAD_DIR
app.mount("/api/assets-static", StaticFiles(directory=str(ASSET_UPLOAD_DIR)), name="assets-static")

# Phase D1 — RAG semantic search routers
from rag_engine import (
    public_router as rag_public_router,
    admin_router as rag_admin_router,
)
app.include_router(rag_public_router)
app.include_router(rag_admin_router)

# Phase D2 — Caya prep stub
from caya_engine import router as caya_router
app.include_router(caya_router)

# Phase 7.11 — Drive Watch Service
from drive_engine import router as drive_router, dev_alias as drive_dev_alias, ensure_drive_indexes
app.include_router(drive_router)
app.include_router(drive_dev_alias)

# Phase 7.9 — Units history
from units_history import router as uh_router, dev_alias as uh_dev_alias, ensure_units_history_indexes
app.include_router(uh_router)
app.include_router(uh_dev_alias)

# Phase F0.11 — Observability
from observability import router as obs_router, ensure_ml_indexes as ensure_ml_indexes_fn
app.include_router(obs_router)

# Phase F0.1 — Audit Log
from audit_log import router as audit_router, ensure_audit_log_indexes
app.include_router(audit_router)

# Phase 4 Batch 1 — Dev Portal Foundation
from routes_dev_batch1 import router as dev_batch1_router, ensure_dev_batch1_indexes
app.include_router(dev_batch1_router)

# Phase 4 Batch 2 — Dashboards + IE + Construcción + Mapbox tab
from routes_dev_batch2 import router as dev_batch2_router, ensure_dev_batch2_indexes
app.include_router(dev_batch2_router)

# Phase 4 Batch 3 — Internal users login + GeoJSON export
from routes_dev_batch3 import router as dev_batch3_router, ensure_dev_batch3_indexes
app.include_router(dev_batch3_router)

# Phase 4 Batch 4 — Sales / CRM core (leads pipeline + project_brokers)
from routes_dev_batch4 import router as dev_batch4_router, ensure_dev_batch4_indexes
app.include_router(dev_batch4_router)

# Phase 4 Batch 4.1 — Cita Registration + DMX Inmobiliaria + Anti-fraude
from routes_dev_batch4_1 import router as dev_batch4_1_router, ensure_batch4_1_indexes, seed_dmx_inmobiliaria
app.include_router(dev_batch4_1_router)

# Phase 4 Batch 4.2 — Universal LeadKanban + client_id + Permission Tiers
from routes_dev_batch4_2 import router as dev_batch4_2_router, ensure_batch4_2_indexes
app.include_router(dev_batch4_2_router)

# Phase 4 Batch 4.3 — Reminders + Magic Link + Auto-Progression
from routes_dev_batch4_3 import router as dev_batch4_3_router, ensure_batch4_3_indexes, register_batch4_3_jobs
app.include_router(dev_batch4_3_router)

# Phase 4 Batch 4.4 — AI Engine + Analytics
from routes_dev_batch4_4 import router as dev_batch4_4_router, ensure_batch4_4_indexes, register_batch4_4_jobs
app.include_router(dev_batch4_4_router)

# Phase 4 Batch 5 — Dynamic Pricing A/B + Branded PDF Reports
from routes_dev_batch5 import router as dev_batch5_router, ensure_batch5_indexes, register_batch5_jobs
app.include_router(dev_batch5_router)

# Phase 4 Batch 6 — Demand Heatmap + Engagement Analytics
from routes_dev_batch6 import router as dev_batch6_router, ensure_batch6_indexes
app.include_router(dev_batch6_router)

# Phase 4 Batch 7 — Site Selection AI Standalone
from routes_dev_batch7 import router as dev_batch7_router, ensure_batch7_indexes
app.include_router(dev_batch7_router)

# Phase 4 Batch 7.2 — INEGI Real Demographics
from routes_dev_batch7_2 import router as dev_batch7_2_router, ensure_batch7_2_indexes
app.include_router(dev_batch7_2_router)

# Phase 4 Batch 8 — Cash Flow Forecast IA
from routes_dev_batch8 import (router as dev_batch8_router, ensure_batch8_indexes,
                              daily_active_projects_recalc)
app.include_router(dev_batch8_router)

# ─── Password helpers ─────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=8),
               "type": "access"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=30),
               "type": "refresh"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

# ─── Models ───────────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None
    onboarded: Optional[bool] = None  # False = needs role-picker; None/True = done

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
    role: str  # buyer | advisor | developer_admin

# ─── Auth helpers ─────────────────────────────────────────────────────────────
async def get_current_user(request: Request) -> Optional[UserOut]:
    # 1. Check session_token cookie (Google OAuth path)
    session_token = request.cookies.get("session_token")
    if session_token:
        sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if sess:
            exp = sess.get("expires_at")
            if exp:
                if isinstance(exp, str): exp = datetime.fromisoformat(exp)
                if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    await db.user_sessions.delete_one({"session_token": session_token})
                    return None
            user_doc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
            if user_doc: 
                u = UserOut(**user_doc)
                try:
                    from observability import sentry_tag_user
                    sentry_tag_user(u.model_dump())
                except Exception: pass
                return u

    # 2. Check JWT access_token cookie (email/password path)
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "): access_token = auth[7:]

    if access_token:
        try:
            payload = pyjwt.decode(access_token, JWT_SECRET, algorithms=["HS256"])
            if payload.get("type") != "access": return None
            user_doc = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user_doc:
                user_doc.pop("password_hash", None)
                u = UserOut(**user_doc)
                try:
                    from observability import sentry_tag_user
                    sentry_tag_user(u.model_dump())
                except Exception: pass
                return u
        except Exception:
            return None
    return None

async def require_auth(request: Request) -> UserOut:
    user = await get_current_user(request)
    if not user: raise HTTPException(status_code=401, detail="No autenticado")
    return user

def require_role(*roles):
    async def checker(request: Request) -> UserOut:
        user = await require_auth(request)
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        return user
    return checker

# ─── Audit log ────────────────────────────────────────────────────────────────
async def audit(user_id: str, action: str, resource: str, data: dict = None):
    await db.audit_logs.insert_one({
        "user_id": user_id, "action": action, "resource": resource,
        "data": data or {}, "ts": datetime.now(timezone.utc)
    })

# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.audit_logs.create_index("ts")
    # Seed superadmin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.com")
    admin_pw    = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
    existing    = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": "user_admin_0001",
            "email": admin_email,
            "name": "Admin DMX",
            "password_hash": hash_password(admin_pw),
            "role": "superadmin",
            "tenant_id": "dmx",
            "created_at": datetime.now(timezone.utc),
        })
    # Seed demo advisor
    adv_email = "asesor@demo.com"
    if not await db.users.find_one({"email": adv_email}):
        await db.users.insert_one({
            "user_id": "user_asesor_0001",
            "email": adv_email,
            "name": "Ana Gutiérrez",
            "password_hash": hash_password("Asesor2026!"),
            "role": "advisor",
            "tenant_id": "agencia_demo",
            "created_at": datetime.now(timezone.utc),
        })
    # Seed demo developer
    dev_email = "developer@demo.com"
    if not await db.users.find_one({"email": dev_email}):
        await db.users.insert_one({
            "user_id": "user_dev_0001",
            "email": dev_email,
            "name": "Constructora Ariel",
            "password_hash": hash_password("Dev2026!"),
            "role": "developer_admin",
            "tenant_id": "constructora_ariel",
            "created_at": datetime.now(timezone.utc),
        })

    # IE Engine — Phase A seed (idempotent: 18 fuentes)
    await seed_ie_engine(db)
    await narrative_ensure_indexes(db)
    await briefing_ensure_indexes(db)
    # IE Engine — Phase B1 score infra: indexes + recipe auto-discover
    await ensure_score_indexes(db)
    discover_recipes()
    # Phase 7.1 — Document Intelligence indexes
    await ensure_di_indexes(db)
    # Phase 7.2 — Extraction indexes
    from extraction_engine import ensure_extraction_indexes
    await ensure_extraction_indexes(db)
    # Phase 7.3 — Cross-check indexes
    from cross_check_engine import ensure_cross_check_indexes
    await ensure_cross_check_indexes(db)
    # Phase 7.5 — Auto-Sync overlay indexes + preload cache
    from auto_sync_engine import ensure_indexes as ensure_sync_indexes
    await ensure_sync_indexes(db)
    # Phase 7.6 — Asset pipeline indexes
    from dev_assets import ensure_asset_indexes
    await ensure_asset_indexes(db)
    # Phase D1 — RAG indexes + corpus cache preload
    from rag_engine import ensure_rag_indexes, load_corpus_cache
    await ensure_rag_indexes(db)
    try:
        await load_corpus_cache(db)
    except Exception as e:
        import logging
        logging.warning(f"rag corpus preload failed: {e}")
    # Phase D2 — Caya indexes
    from caya_engine import ensure_caya_indexes
    await ensure_caya_indexes(db)
    # Phase 7.11 — Drive connection indexes
    await ensure_drive_indexes(db)
    # Phase 7.9 — units history indexes
    await ensure_units_history_indexes(db)
    # Phase F0.11 — ML training events indexes
    await ensure_ml_indexes_fn(db)
    # Phase F0.1 — Audit log indexes
    await ensure_audit_log_indexes(db)
    # Phase 4 Batch 1 — Dev Portal indexes
    await ensure_dev_batch1_indexes(db)
    # Phase 4 Batch 2 — Dashboards + IE + Construcción indexes
    await ensure_dev_batch2_indexes(db)
    # Phase 4 Batch 3 — Internal users + GeoJSON export indexes
    await ensure_dev_batch3_indexes(db)
    # Phase 4 Batch 4 — Sales / CRM core indexes
    await ensure_dev_batch4_indexes(db)
    # Phase 4 Batch 4.1 — Cita Registration + DMX Inmobiliaria + Anti-fraude
    await ensure_batch4_1_indexes(db)
    await seed_dmx_inmobiliaria(db)
    # Phase 4 Batch 4.2 — Universal LeadKanban + Permission Tiers
    await ensure_batch4_2_indexes(db)
    # Phase 4 Batch 4.3 — Reminders + Magic Link + Auto-Progression
    await ensure_batch4_3_indexes(db)
    # Phase 4 Batch 4.4 — AI Engine + Analytics
    await ensure_batch4_4_indexes(db)
    # Phase 4 Batch 5 — Dynamic Pricing A/B + Branded PDF Reports
    await ensure_batch5_indexes(db)
    # Phase 4 Batch 6 — Demand Heatmap + Engagement Analytics
    await ensure_batch6_indexes(db)
    # Phase 4 Batch 7 — Site Selection AI Standalone
    await ensure_batch7_indexes(db)
    # Phase 4 Batch 7.2 — INEGI Real Demographics
    await ensure_batch7_2_indexes(db)
    # Phase 4 Batch 8 — Cash Flow Forecast IA
    await ensure_batch8_indexes(db)
    try:
        async for o in db.dev_overlays.find({}, {"_id": 0}):
            _dev_overlay_cache[o["development_id"]] = o
    except Exception as e:
        logging.warning(f"dev_overlays preload failed: {e}")
    # IE Engine — Phase A4: APScheduler (cron daily + hourly status check)
    sched = start_scheduler(db)
    # Phase 4 Batch 4.3 — register reminder + post-cita jobs on same scheduler
    if sched:
        try:
            register_batch4_3_jobs(sched, db)
        except Exception as e:
            logging.warning(f"batch4.3 scheduler register failed: {e}")
        try:
            register_batch4_4_jobs(sched, db)
        except Exception as e:
            logging.warning(f"batch4.4 scheduler register failed: {e}")
        try:
            register_batch5_jobs(sched, db)
        except Exception as e:
            logging.warning(f"batch5 scheduler register failed: {e}")
        # Phase 4 Batch 8 — daily 6am cash-flow recalc for active projects
        try:
            from apscheduler.triggers.cron import CronTrigger
            sched.add_job(
                daily_active_projects_recalc, CronTrigger(hour=6, minute=0),
                id="cash_flow_daily_recalc", replace_existing=True,
                kwargs={"db": db, "app": app}, max_instances=1,
            )
            import logging as _bb8_log
            _bb8_log.info("[batch8] daily cash-flow recalc scheduled @ 06:00 MX")
        except Exception as e:
            import logging as _bb8_log
            _bb8_log.warning(f"[batch8] could not schedule daily recalc: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()

# ─── Auth routes ──────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(payload: RegisterIn, response: Response):
    payload.email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(400, "El correo ya está registrado")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id, "email": payload.email,
        "name": payload.name, "password_hash": hash_password(payload.password),
        "role": payload.role, "tenant_id": None,
        "onboarded": True,  # email signup explicitly chose a role
        "created_at": datetime.now(timezone.utc),
    })
    access  = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token",  access,  httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**user_doc)}

@app.post("/api/auth/login")
async def login(payload: LoginIn, response: Response):
    payload.email = payload.email.lower().strip()
    user_doc = await db.users.find_one({"email": payload.email})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(401, "Credenciales incorrectas")
    user_id = user_doc["user_id"]
    access  = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token",  access,  httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc.pop("_id", None); user_doc.pop("password_hash", None)
    uo = UserOut(**user_doc)
    # Phase F0.11 — PostHog identify + login event
    try:
        from observability import identify_user, capture_event
        identify_user(uo.model_dump())
        capture_event(uo.user_id, "user_logged_in", {"method": "password", "role": uo.role})
    except Exception: pass
    return {"user": uo}

@app.post("/api/auth/session")  # Google OAuth
async def create_session(payload: SessionCreate, response: Response):
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(401, "session_id inválido")
    data = resp.json()
    email = data.get("email"); name = data.get("name", ""); picture = data.get("picture", "")
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
            "onboarded": False,  # Google OAuth: role-picker required before first portal access
            "created_at": datetime.now(timezone.utc)
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

@app.get("/api/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    if not user: raise HTTPException(401, "No autenticado")
    return user

@app.post("/api/auth/select-role")
async def select_role(payload: SelectRoleIn, request: Request):
    """Post-OAuth role picker. Allowed only while user.onboarded == False."""
    allowed = {"buyer", "advisor", "developer_admin"}
    if payload.role not in allowed:
        raise HTTPException(400, "Rol no válido")
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    # Strict: only users explicitly flagged onboarded=False may use this endpoint.
    if not user_doc or user_doc.get("onboarded") is not False:
        raise HTTPException(409, "Ya completaste la selección de rol")
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"role": payload.role, "onboarded": True}},
    )
    fresh = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**fresh)}

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    # Clear session_token
    token = request.cookies.get("session_token")
    if token: await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    response.delete_cookie("access_token",  path="/", samesite="none", secure=True)
    response.delete_cookie("refresh_token", path="/", samesite="none", secure=True)
    return {"message": "Sesión cerrada"}

# ─── Public marketplace endpoints ─────────────────────────────────────────────
def _colonia_public(c: dict) -> dict:
    """Return a colonia document safe for public API (keeps all fields, no _id)."""
    return {k: v for k, v in c.items() if k != "_id"}

@app.get("/api/colonias")
async def get_colonias():
    return [_colonia_public(c) for c in SEED_COLONIAS]

@app.get("/api/colonias/{colonia_id}")
async def get_colonia(colonia_id: str):
    c = COLONIAS_BY_ID.get(colonia_id)
    if not c:
        raise HTTPException(404, "Colonia no encontrada")
    return _colonia_public(c)

@app.get("/api/colonias/{colonia_id}/propiedades")
async def get_colonia_propiedades(colonia_id: str):
    if colonia_id not in COLONIAS_BY_ID:
        raise HTTPException(404, "Colonia no encontrada")
    return [p for p in SEED_PROPERTIES if p["colonia_id"] == colonia_id]

@app.get("/api/properties")
async def get_properties(
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    tipo: Optional[str] = None,
    tag: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    sort: Optional[str] = "recent",
    limit: int = 100,
):
    results = list(SEED_PROPERTIES)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [p for p in results if p["colonia_id"].lower() in cset]
    if min_price is not None:
        results = [p for p in results if p["price"] >= min_price]
    if max_price is not None:
        results = [p for p in results if p["price"] <= max_price]
    if min_sqm is not None:
        results = [p for p in results if p["sqm"] >= min_sqm]
    if max_sqm is not None:
        results = [p for p in results if p["sqm"] <= max_sqm]
    if beds is not None:
        results = [p for p in results if p["beds"] >= beds]
    if baths is not None:
        results = [p for p in results if p["baths"] >= baths]
    if parking is not None:
        results = [p for p in results if p["parking"] >= parking]
    if tipo:
        results = [p for p in results if p["tipo"] == tipo]
    if tag:
        results = [p for p in results if p["tag"] == tag]
    if amenity:
        aset = set(amenity)
        results = [p for p in results if aset.issubset(set(p.get("amenities", [])))]
    # Sort
    if sort == "price_asc":
        results.sort(key=lambda p: p["price"])
    elif sort == "price_desc":
        results.sort(key=lambda p: -p["price"])
    elif sort == "sqm_desc":
        results.sort(key=lambda p: -p["sqm"])
    return results[:limit]

@app.get("/api/properties/{prop_id}")
async def get_property(prop_id: str):
    for p in SEED_PROPERTIES:
        if p["id"] == prop_id:
            return p
    raise HTTPException(404, "Propiedad no encontrada")

@app.get("/api/properties/{prop_id}/similares")
async def get_property_similares(prop_id: str):
    target = next((p for p in SEED_PROPERTIES if p["id"] == prop_id), None)
    if not target:
        raise HTTPException(404, "Propiedad no encontrada")
    pool = [p for p in SEED_PROPERTIES if p["id"] != prop_id]

    def score(p):
        # Same colonia gets a big boost, then proximity in price and size
        s = 0
        if p["colonia_id"] == target["colonia_id"]:
            s -= 100
        s += abs(p["price"] - target["price"]) / 1_000_000  # MXN millions distance
        s += abs(p["sqm"] - target["sqm"]) / 10
        return s

    pool.sort(key=score)
    return pool[:3]

# ─── Claude Sonnet 4.5 — 30-second colonia briefing ──────────────────────────
def _iso_week_tag() -> str:
    now = datetime.now(timezone.utc)
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"

BRIEFING_SYSTEM = (
    "Eres el analista estrella de DesarrollosMX. Generas briefings contextuales sobre colonias de CDMX "
    "para compradores que están a punto de tomar una decisión. Tu texto se comparte por WhatsApp, así que es "
    "breve, concreto y accionable. Reglas estrictas: máximo 280 caracteres, un solo párrafo, sin emoji, sin "
    "markdown, sin viñetas, sin saludos. Cierra con una recomendación clara (\"buen momento para entrar\", "
    "\"mercado caliente, considera negociar\", \"vigila la seguridad\", etc.). Tono profesional y directo."
)

def _fallback_briefing(p: dict, c: dict) -> str:
    mom = c.get("momentum", "+0%")
    s = c.get("scores", {})
    vida = s.get("vida", 0)
    mov = s.get("movilidad", 0)
    seg = s.get("seguridad", 0)
    com = s.get("comercio", 0)
    pm2 = c.get("price_m2", 0)
    note = "buen momento para entrar" if c.get("momentum_positive") else "mercado templado, negocia"
    return (
        f"{c['name']} marca {mom} a 24 meses con precio m² de ${pm2}k. "
        f"Vida {vida}, Movilidad {mov}, Seguridad {seg}, Comercio {com}. "
        f"Para {p['sqm']} m² en {p['tipo']}, {note}."
    )[:280]

@app.post("/api/properties/{prop_id}/briefing")
async def generate_property_briefing(prop_id: str):
    """Generate (or return cached) 30-second colonia briefing for a property.
    Cache key: (property_id, ISO week). Regenerates weekly."""
    p = next((x for x in SEED_PROPERTIES if x["id"] == prop_id), None)
    if not p:
        raise HTTPException(404, "Propiedad no encontrada")
    c = COLONIAS_BY_ID.get(p["colonia_id"])
    if not c:
        raise HTTPException(404, "Colonia no encontrada para la propiedad")

    week = _iso_week_tag()
    cache_key = f"{prop_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}

    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {})
        prompt = (
            f"Propiedad: {p['titulo']}, {p['sqm']} m², {p['beds']} rec, {p['baths']} baños, "
            f"precio {p['price_display']} ({p['ppm2_display']}).\n"
            f"Colonia: {c['name']} ({c['alcaldia']}). Precio m² zona ${c['price_m2']}k. "
            f"Momentum 24m: {c.get('momentum', 'n/a')}.\n"
            f"Scores DMX 0-100 -> Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}, Comercio: {scores.get('comercio', 0)}, "
            f"Plusvalía: {scores.get('plusvalia', 0)}, Educación: {scores.get('educacion', 0)}, "
            f"Riesgo: {scores.get('riesgo', 0)}.\n"
            "Genera el briefing en un solo párrafo de máximo 280 caracteres en español MX."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"brief_{prop_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
    except Exception:
        text = None

    if not text:
        text = _fallback_briefing(p, c)

    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {
            "cache_key": cache_key, "property_id": prop_id, "week": week,
            "text": text, "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}

# ─── NLP Search (Claude Sonnet) ───────────────────────────────────────────────
class NLPSearchIn(BaseModel):
    query: str

# ─── Developments marketplace (Iteration A) ──────────────────────────────────
DMX_FALLBACK_WHATSAPP = os.environ.get("DMX_FALLBACK_WHATSAPP", "+525512345678")


# ─── Phase 7.5 — dev overlay cache (auto_sync) ───────────────────────────────
_dev_overlay_cache: dict = {}


def invalidate_dev_overlay_cache(dev_id: str = None):
    if dev_id:
        _dev_overlay_cache.pop(dev_id, None)
    else:
        _dev_overlay_cache.clear()


async def _ensure_overlay_loaded(dev_id: str):
    if dev_id in _dev_overlay_cache:
        return _dev_overlay_cache[dev_id]
    db = app.state.db if hasattr(app, "state") and hasattr(app.state, "db") else None
    if db is None:
        return {}
    try:
        o = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0}) or {}
    except Exception:
        o = {}
    _dev_overlay_cache[dev_id] = o
    return o


def _apply_overlay(d: dict) -> dict:
    overlay = _dev_overlay_cache.get(d["id"]) or {}
    fields = overlay.get("fields") or {}
    units_overlay = overlay.get("units_overlay") or []
    if not fields and not units_overlay:
        return d
    out = dict(d)
    PRIVATE = {"predial_private", "fiscal_private"}
    for k, v in fields.items():
        if k in PRIVATE:
            continue
        out[k] = v
    if units_overlay:
        out["units"] = units_overlay
    out["_overlay_synced_fields"] = sorted(
        k for k in fields.keys() if k not in PRIVATE
    )
    if overlay.get("last_auto_sync_at"):
        ts = overlay["last_auto_sync_at"]
        out["last_auto_sync_at"] = ts.isoformat() if hasattr(ts, "isoformat") else ts
    return out


def _dev_public(d: dict, include_units: bool = False) -> dict:
    """Strip heavy fields for list endpoints; keep everything for detail."""
    d = _apply_overlay(d)
    out = {k: v for k, v in d.items() if k != "_id" and (include_units or k != "units")}
    if not include_units:
        out["units_sample"] = d.get("units", [])[:0]  # no units in list view
    # Enrich with developer summary
    dev = DEVELOPERS_BY_ID.get(d["developer_id"])
    if dev:
        out["developer"] = {
            "id": dev["id"], "name": dev["name"], "founded_year": dev["founded_year"],
            "projects_delivered": dev["projects_delivered"], "logo_hue": dev.get("logo_hue", 231),
        }
    out["contact_phone"] = d.get("contact_phone") or DMX_FALLBACK_WHATSAPP
    return out


@app.get("/api/developments")
async def list_developments(
    colonia: Optional[List[str]] = Query(None),
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_sqm: Optional[int] = None,
    max_sqm: Optional[int] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
    stage: Optional[str] = None,
    amenity: Optional[List[str]] = Query(None),
    featured: Optional[bool] = None,
    sort: Optional[str] = "recent",
    limit: int = 100,
):
    results = list(DEVELOPMENTS)
    if colonia:
        cset = {c.lower() for c in colonia}
        results = [d for d in results if d["colonia_id"].lower() in cset]
    if min_price is not None:
        results = [d for d in results if d["price_to"] >= min_price]
    if max_price is not None:
        results = [d for d in results if d["price_from"] <= max_price]
    if min_sqm is not None:
        results = [d for d in results if d["m2_range"][1] >= min_sqm]
    if max_sqm is not None:
        results = [d for d in results if d["m2_range"][0] <= max_sqm]
    if beds is not None:
        results = [d for d in results if d["bedrooms_range"][1] >= beds]
    if baths is not None:
        results = [d for d in results if d["bathrooms_range"][1] >= baths]
    if parking is not None:
        results = [d for d in results if d["parking_range"][1] >= parking]
    if stage:
        results = [d for d in results if d["stage"] == stage]
    if amenity:
        aset = set(amenity)
        results = [d for d in results if aset.issubset(set(d.get("amenities", [])))]
    if featured is not None:
        results = [d for d in results if d["featured"] == featured]
    if sort == "price_asc":
        results.sort(key=lambda d: d["price_from"])
    elif sort == "price_desc":
        results.sort(key=lambda d: -d["price_from"])
    elif sort == "sqm_desc":
        results.sort(key=lambda d: -d["m2_range"][1])
    return [_dev_public(d) for d in results[:limit]]


@app.get("/api/developments/{dev_id}")
async def get_development(dev_id: str):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    await _ensure_overlay_loaded(dev_id)
    return _dev_public(d, include_units=True)


@app.get("/api/developments/{dev_id}/units")
async def list_dev_units(
    dev_id: str,
    status: Optional[str] = None,
    beds: Optional[int] = None,
    baths: Optional[int] = None,
    parking: Optional[int] = None,
):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    await _ensure_overlay_loaded(dev_id)
    d = _apply_overlay(d)
    units = list(d.get("units", []))
    if status:
        units = [u for u in units if u.get("status") == status]
    if beds is not None:
        units = [u for u in units if (u.get("bedrooms") or 0) >= beds]
    if baths is not None:
        units = [u for u in units if (u.get("bathrooms") or 0) >= baths]
    if parking is not None:
        units = [u for u in units if (u.get("parking_spots") or 0) >= parking]
    return units


# Phase 7.4 — Public compliance badge
@app.get("/api/developments/{dev_id}/compliance-badge")
async def get_compliance_badge(dev_id: str, request: Request):
    """Public endpoint surfacing 3 compliance scores aggregated as a tier.
    Returns tier=null (hidden) when:
      - no documents uploaded yet (cero data → cero overshare)
      - any score < 50 OR tier=red on RISK_LEGAL (anti-fearmongering)
    """
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    db = request.app.state.db

    # Count extracted docs (gate: ≥1 to even consider showing)
    extracted_count = await db.di_documents.count_documents({
        "development_id": dev_id, "status": "extracted",
    })

    scores = {}
    for code in ("IE_PROY_RISK_LEGAL", "IE_PROY_COMPLIANCE_SCORE", "IE_PROY_QUALITY_DOCS"):
        s = await db.ie_scores.find_one({"zone_id": dev_id, "code": code}, {"_id": 0})
        if s and not s.get("is_stub"):
            scores[code] = {"value": s.get("value"), "tier": s.get("tier")}
        else:
            scores[code] = None

    # Last update from overlay or scores
    overlay = await db.dev_overlays.find_one({"development_id": dev_id}, {"_id": 0, "last_auto_sync_at": 1}) or {}
    last = overlay.get("last_auto_sync_at")
    last_iso = last.isoformat() if last else None

    # Compute tier
    tier = None
    if extracted_count >= 1 and all(scores[c] is not None for c in scores):
        risk = scores["IE_PROY_RISK_LEGAL"]
        comp = scores["IE_PROY_COMPLIANCE_SCORE"]
        qd = scores["IE_PROY_QUALITY_DOCS"]
        # Hidden if RISK_LEGAL is red (critical issues active) or any score < 50
        if risk["tier"] == "red":
            tier = None
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 80:
            tier = "green"
        elif min(risk["value"] or 0, comp["value"] or 0, qd["value"] or 0) >= 50:
            tier = "amber"
        else:
            tier = None

    return {
        "development_id": dev_id,
        "tier": tier,
        "scores": {
            "risk_legal": scores["IE_PROY_RISK_LEGAL"],
            "compliance": scores["IE_PROY_COMPLIANCE_SCORE"],
            "quality_docs": scores["IE_PROY_QUALITY_DOCS"],
        },
        "verified_docs_count": extracted_count,
        "last_update_at": last_iso,
        "label_es": (
            "DMX Verificado · Documentos al día" if tier == "green"
            else ("Documentos parciales · En verificación" if tier == "amber" else None)
        ),
    }


@app.get("/api/developments/{dev_id}/similar")
async def get_similar_developments(dev_id: str):
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")
    pool = [d for d in DEVELOPMENTS if d["id"] != dev_id]

    def score(d):
        s = 0
        if d["colonia_id"] == target["colonia_id"]:
            s -= 100
        s += abs(d["price_from"] - target["price_from"]) / 1_000_000
        return s

    pool.sort(key=score)
    return [_dev_public(p) for p in pool[:3]]


@app.get("/api/developments/{dev_id}/rank")
async def get_development_rank(dev_id: str, request: Request):
    """Rank del desarrollo dentro de su colonia según IE_PROY_BADGE_TOP (Phase B3 chunk 1-bis).

    badge_tier:
      - "top"  → rank 1 (y al menos 2 devs en la colonia)
      - "high" → rank en top 30%
      - "mid"  → rango medio
      - null   → sin peers (total==1) para evitar overshare
    """
    target = DEVELOPMENTS_BY_ID.get(dev_id)
    if not target:
        raise HTTPException(404, "Desarrollo no encontrado")

    peers = [d for d in DEVELOPMENTS if d["colonia_id"] == target["colonia_id"]]
    total = len(peers)
    if total <= 1:
        return {"rank": 1, "total": total, "badge_tier": None, "colonia": target["colonia"]}

    db = request.app.state.db
    peer_ids = [d["id"] for d in peers]
    score_docs = await db.ie_scores.find(
        {"zone_id": {"$in": peer_ids}, "code": "IE_PROY_BADGE_TOP", "is_stub": False, "value": {"$ne": None}},
        {"_id": 0, "zone_id": 1, "value": 1},
    ).to_list(length=50)
    score_by_id = {d["zone_id"]: d["value"] for d in score_docs}

    # Sort peers by BADGE_TOP desc; devs without score fall to the end
    ranked = sorted(peer_ids, key=lambda i: score_by_id.get(i, -1), reverse=True)
    try:
        rank = ranked.index(dev_id) + 1
    except ValueError:
        rank = total

    # Only award "top" if this dev actually has a real score (avoid false 1º for missing data)
    has_real_score = dev_id in score_by_id
    pct = rank / total
    if rank == 1 and has_real_score:
        badge_tier = "top"
    elif pct <= 0.30 and has_real_score:
        badge_tier = "high"
    elif has_real_score:
        badge_tier = "mid"
    else:
        badge_tier = None

    return {"rank": rank, "total": total, "badge_tier": badge_tier, "colonia": target["colonia"]}


@app.get("/api/developers/{developer_id}")
async def get_developer(developer_id: str):
    d = DEVELOPERS_BY_ID.get(developer_id)
    if not d:
        raise HTTPException(404, "Desarrolladora no encontrada")
    # Enrich with their current developments
    their_devs = [
        {"id": x["id"], "name": x["name"], "stage": x["stage"], "units_total": x["units_total"]}
        for x in DEVELOPMENTS if x["developer_id"] == developer_id
    ]
    return {**d, "current_developments": their_devs}


@app.post("/api/developments/{dev_id}/briefing")
async def generate_dev_briefing(dev_id: str):
    d = DEVELOPMENTS_BY_ID.get(dev_id)
    if not d:
        raise HTTPException(404, "Desarrollo no encontrado")
    c = COLONIAS_BY_ID.get(d["colonia_id"])

    week = _iso_week_tag()
    cache_key = f"dev_{dev_id}__{week}"
    cached = await db.property_briefings.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached and cached.get("text"):
        return {"text": cached["text"], "cached": True, "week": week}

    text = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        scores = c.get("scores", {})
        stage_label = {
            "preventa": "Preventa",
            "en_construccion": "En construcción",
            "entrega_inmediata": "Entrega inmediata",
            "exclusiva": "Exclusiva",
        }.get(d["stage"], d["stage"])
        prompt = (
            f"Desarrollo: {d['name']} en {c['name']}, {c['alcaldia']}.\n"
            f"Etapa: {stage_label}. Entrega estimada: {d['delivery_estimate']}.\n"
            f"Precio desde {d['price_from_display']} hasta {d['price_to_display']}. "
            f"Precio m² barrio: ${c['price_m2']}k. Momentum 24m: {c.get('momentum')}.\n"
            f"Rango: {d['bedrooms_range'][0]}-{d['bedrooms_range'][1]} rec, "
            f"{d['m2_range'][0]}-{d['m2_range'][1]} m². {d['units_total']} unidades, "
            f"{d['units_available']} disponibles.\n"
            f"Scores DMX 0-100 -> Vida: {scores.get('vida', 0)}, Movilidad: {scores.get('movilidad', 0)}, "
            f"Seguridad: {scores.get('seguridad', 0)}, Comercio: {scores.get('comercio', 0)}.\n"
            "Genera un briefing en un solo párrafo de máximo 280 caracteres en español MX."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"devbrief_{dev_id}_{week}",
            system_message=BRIEFING_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=prompt))
        text = (raw or "").strip().strip('"')
        if len(text) > 290:
            text = text[:277].rstrip() + "..."
    except Exception:
        text = None

    if not text:
        text = (
            f"{d['name']} en {c['name']} arranca en {d['price_from_display']} con scores "
            f"Vida {scores.get('vida', 0)}, Movilidad {scores.get('movilidad', 0)}, "
            f"Seguridad {scores.get('seguridad', 0)}. {d['units_available']} de {d['units_total']} "
            f"unidades disponibles. {'Momento ideal de preventa' if d['stage'] == 'preventa' else 'Entrega pronta'}."
        )[:280]

    await db.property_briefings.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "text": text, "week": week, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"text": text, "cached": False, "week": week}


class AISearchIn(BaseModel):
    query: str


AI_SEARCH_SYSTEM = (
    "Eres el parser de búsqueda natural de DesarrollosMX para CDMX. Recibes una frase del usuario "
    "y devuelves ESTRICTAMENTE un objeto JSON con los filtros detectables. Schema permitido:\n"
    "{\n"
    '  "colonia": [string],  // ids válidos: polanco, lomas-chapultepec, roma-norte, roma-sur, condesa, juarez, cuauhtemoc, del-valle-centro, narvarte, napoles, escandon, anzures, doctores, coyoacan-centro, pedregal, santa-fe\n'
    '  "min_price": number,  // MXN\n'
    '  "max_price": number,  // MXN\n'
    '  "min_sqm": number,\n'
    '  "max_sqm": number,\n'
    '  "beds": number,\n'
    '  "baths": number,\n'
    '  "parking": number,\n'
    '  "stage": string,  // preventa | en_construccion | entrega_inmediata | exclusiva\n'
    '  "amenity": [string]  // gym, roof, alberca, concierge, pet, seguridad, estacionamiento, spa, cowork, bicicletas, business_center, salon_eventos, jardines, area_pets, sky_lounge, cava\n'
    "}\n"
    "Reglas: omite claves sin evidencia, no inventes, no agregues texto fuera del JSON. Si escriben 'roma' asume 'roma-norte'. Si mencionan 'terraza' devuelve amenity=['roof']. Si escriben 'a estrenar' o 'nuevo' -> stage='entrega_inmediata'. Precios en millones MXN por defecto (5M = 5000000). 'Bajo 5 millones' = max_price=5000000."
)


@app.post("/api/properties/search-ai")
async def ai_search_parser(payload: AISearchIn):
    import json as _json
    q = (payload.query or "").strip()
    if not q:
        return {"filters": {}, "query": q, "cached": False}

    # Cache by exact query for 24h
    cache_key = q.lower()[:500]
    cached = await db.ai_search_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        ts = cached.get("created_at")
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts and (datetime.now(timezone.utc) - ts).total_seconds() < 86400:
            return {"filters": cached.get("filters", {}), "query": q, "cached": True}

    parsed = {}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"aisrch_{hash(cache_key) & 0xffffffff}",
            system_message=AI_SEARCH_SYSTEM,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=q))
        txt = (raw or "").strip()
        # Strip markdown fences if any
        if txt.startswith("```"):
            txt = txt.strip("`")
            if txt.lower().startswith("json"):
                txt = txt[4:].lstrip()
        # Find first { and last } to extract JSON
        s, e = txt.find("{"), txt.rfind("}")
        if s >= 0 and e > s:
            parsed = _json.loads(txt[s:e+1])
    except Exception:
        parsed = {}

    # Sanitize: keep only known keys
    allowed = {"colonia", "min_price", "max_price", "min_sqm", "max_sqm", "beds", "baths", "parking", "stage", "amenity"}
    filters = {k: v for k, v in parsed.items() if k in allowed and v not in (None, "", [], {})}

    await db.ai_search_cache.update_one(
        {"cache_key": cache_key},
        {"$set": {"cache_key": cache_key, "filters": filters, "query": q, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"filters": filters, "query": q, "cached": False}


@app.post("/api/search/nlp")
async def nlp_search(payload: NLPSearchIn):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"nlp_search_{uuid.uuid4().hex[:8]}",
            system_message="""Eres un asistente de búsqueda inmobiliaria en CDMX. 
Extrae filtros de búsqueda del texto del usuario y sugiere hasta 3 propiedades del catálogo.

Catálogo disponible:
- p001: Polanco 2rec 2baños $7.2M Penthouse
- p002: Condesa 3rec 3baños $11.4M Penthouse  
- p003: Roma Norte 1rec $5.78M Loft
- p004: Narvarte 1rec $3.25M Studio
- p005: Coyoacán 2rec $5.4M con jardín
- p006: Escandón 2rec $4.1M Preventa

Responde en JSON estricto:
{"matches": ["p001","p003"], "reasoning": "Razón breve", "chips": ["2 recámaras","Roma Norte","<$6M"]}"""
        )
        resp = await chat.send_message(UserMessage(content=payload.query))
        import json, re
        text = resp.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            result = json.loads(m.group())
            matched = [p for p in SEED_PROPERTIES if p["id"] in result.get("matches", [])]
            return {"properties": matched, "reasoning": result.get("reasoning", ""), "chips": result.get("chips", [])}
    except Exception as e:
        pass
    # Fallback: keyword search
    q = payload.query.lower()
    results = [p for p in SEED_PROPERTIES if q in p["colonia"].lower() or q in p["titulo"].lower()]
    return {"properties": results or SEED_PROPERTIES[:3], "reasoning": "Búsqueda por palabras clave", "chips": []}

# ─── Advisor routes ────────────────────────────────────────────────────────────
ADVISOR_ROLES = ["advisor", "advisor_admin", "superadmin"]

@app.get("/api/advisor/contacts")
async def get_contacts(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403, "Acceso denegado")
    contacts = await db.contacts.find(
        {"tenant_id": user.tenant_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return contacts

@app.post("/api/advisor/contacts")
async def create_contact(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    contact_id = f"ct_{uuid.uuid4().hex[:10]}"
    contact = {
        "contact_id": contact_id, "tenant_id": user.tenant_id,
        "advisor_id": user.user_id,
        "name": body.get("name", ""), "email": body.get("email", ""),
        "phone": body.get("phone", ""), "source": body.get("source", "Manual"),
        "temperature": body.get("temperature", "frio"),
        "budget_min": body.get("budget_min"), "budget_max": body.get("budget_max"),
        "zones": body.get("zones", []), "notes": body.get("notes", ""),
        "tags": body.get("tags", []), "created_at": datetime.now(timezone.utc),
    }
    await db.contacts.insert_one(contact)
    await audit(user.user_id, "CREATE", "contact", {"contact_id": contact_id})
    return contact

@app.put("/api/advisor/contacts/{contact_id}")
async def update_contact(contact_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    body.pop("_id", None); body.pop("contact_id", None)
    await db.contacts.update_one(
        {"contact_id": contact_id, "tenant_id": user.tenant_id},
        {"$set": body}
    )
    await audit(user.user_id, "UPDATE", "contact", {"contact_id": contact_id})
    doc = await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    return doc

@app.delete("/api/advisor/contacts/{contact_id}")
async def delete_contact(contact_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    await db.contacts.delete_one({"contact_id": contact_id, "tenant_id": user.tenant_id})
    await audit(user.user_id, "DELETE", "contact", {"contact_id": contact_id})
    return {"ok": True}

@app.post("/api/advisor/argumentario")
async def generate_argumentario(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    contact = body.get("contact", {})
    property_data = body.get("property", {})
    objective = body.get("objective", "persuadir")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = """Eres un experto en argumentario de ventas inmobiliarias en CDMX.
Genera un mensaje persuasivo y personalizado para WhatsApp/email basado en el perfil del contacto y la propiedad.
El tono es profesional pero cálido. Usa datos reales del IE Score. Máximo 200 palabras. Sin emoji.
Responde con el mensaje listo para enviar."""
        prompt = f"""Contacto: {contact.get('name','')}, presupuesto ${contact.get('budget_max','')}, zona preferida: {', '.join(contact.get('zones',[]))}.
Propiedad: {property_data.get('title','')}, precio {property_data.get('price_display','')}, colonia {property_data.get('colonia','')}.
Objetivo: {objective}.
Genera el mensaje argumentario personalizado."""
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"arg_{uuid.uuid4().hex[:8]}", system_message=system)
        result = await chat.send_message(UserMessage(content=prompt))
        return {"message": result, "contact": contact.get("name"), "property": property_data.get("title")}
    except Exception as e:
        return {"message": f"Hola {contact.get('name','')},\n\nTengo una propiedad en {property_data.get('colonia','')} que podría interesarte — {property_data.get('title','')} a {property_data.get('price_display','')}. El IE Score de la zona es de 87/100 con muy buena conectividad. ¿Podemos coordinar una visita esta semana?\n\nSaludos,\n{user.name}", "contact": contact.get("name"), "property": property_data.get("title")}

# ─── Advisor pipeline (búsquedas kanban) ──────────────────────────────────────
BUSQUEDA_STAGES = ["Pendiente","Buscando","Visitando","Ofertando","Cerrando","Ganada"]

@app.get("/api/advisor/busquedas")
async def get_busquedas(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    docs = await db.busquedas.find({"tenant_id": user.tenant_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@app.post("/api/advisor/busquedas")
async def create_busqueda(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    doc_id = f"bq_{uuid.uuid4().hex[:10]}"
    doc = {"busqueda_id": doc_id, "tenant_id": user.tenant_id, "advisor_id": user.user_id,
           "stage": "Pendiente", "contact_name": body.get("contact_name",""),
           "contact_id": body.get("contact_id"), "zones": body.get("zones",[]),
           "budget_max": body.get("budget_max"), "beds": body.get("beds"),
           "notes": body.get("notes",""), "priority": body.get("priority","media"),
           "created_at": datetime.now(timezone.utc)}
    await db.busquedas.insert_one(doc)
    return doc

@app.patch("/api/advisor/busquedas/{busqueda_id}/stage")
async def update_busqueda_stage(busqueda_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    new_stage = body.get("stage")
    if new_stage not in BUSQUEDA_STAGES: raise HTTPException(400, "Etapa inválida")
    await db.busquedas.update_one(
        {"busqueda_id": busqueda_id, "tenant_id": user.tenant_id},
        {"$set": {"stage": new_stage, "stage_updated_at": datetime.now(timezone.utc)}}
    )
    await audit(user.user_id, "STAGE_CHANGE", "busqueda", {"busqueda_id": busqueda_id, "new_stage": new_stage})
    doc = await db.busquedas.find_one({"busqueda_id": busqueda_id}, {"_id": 0})
    return doc

# ─── Developer routes ─────────────────────────────────────────────────────────
DEV_ROLES = ["developer_admin", "superadmin"]

@app.get("/api/developer/projects")
async def get_projects(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    docs = await db.projects.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(100)
    if not docs:
        # Seed demo projects
        demo = [
            {"project_id":"proj_001","tenant_id": user.tenant_id,
             "name":"Torre Ariel Polanco","colonia":"Polanco","alcaldia":"Miguel Hidalgo",
             "units_total":48,"units_sold":31,"units_available":17,
             "price_from":6500000,"price_to":14000000,
             "delivery":"Q3 2026","status":"Construcción","progress":72,
             "created_at": datetime.now(timezone.utc)},
            {"project_id":"proj_002","tenant_id": user.tenant_id,
             "name":"Residencias Coyoacán Jardín","colonia":"Coyoacán","alcaldia":"Coyoacán",
             "units_total":24,"units_sold":18,"units_available":6,
             "price_from":4800000,"price_to":7200000,
             "delivery":"Q1 2026","status":"Entrega","progress":98,
             "created_at": datetime.now(timezone.utc)},
        ]
        await db.projects.insert_many(demo)
        return demo
    return docs

@app.post("/api/developer/projects")
async def create_project(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    body = await request.json()
    project_id = f"proj_{uuid.uuid4().hex[:8]}"
    doc = {**body, "project_id": project_id, "tenant_id": user.tenant_id,
           "created_at": datetime.now(timezone.utc)}
    await db.projects.insert_one(doc)
    await audit(user.user_id, "CREATE", "project", {"project_id": project_id})
    doc.pop("_id", None)
    return doc

@app.get("/api/developer/stats")
async def get_dev_stats(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    return {
        "units_sold_mtd": 8, "units_available": 23,
        "revenue_mtd": 52000000, "avg_days_to_close": 42,
        "top_colonia": "Polanco", "lead_conversion": 0.18,
        "velocity": 2.4, "pipeline_value": 187000000,
    }

@app.post("/api/developer/report")
async def generate_dev_report(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    projects = await db.projects.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(10)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = "Eres el Director de Inteligencia de DesarrollosMX. Genera reportes ejecutivos concisos y accionables para desarrolladoras inmobiliarias en CDMX. Usa datos reales proporcionados. Tono profesional, sin relleno."
        prompt = f"""Genera un reporte mensual ejecutivo para la desarrolladora con estos proyectos: {projects}

Incluye: 1) Resumen ejecutivo (1 párrafo), 2) Top 3 logros del mes, 3) Top 3 alertas/áreas de mejora, 4) Recomendaciones accionables, 5) Forecast próximo mes.
Formato: secciones claras, datos específicos, sin tablas."""
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"report_{uuid.uuid4().hex[:8]}", system_message=system)
        result = await chat.send_message(UserMessage(content=prompt))
        return {"report": result, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception:
        return {"report": "**Resumen Ejecutivo**\n\nEl portafolio muestra absorción positiva con 8 unidades vendidas en el mes, destacando Torre Ariel Polanco con 72% de avance de obra. El precio promedio se mantiene estable en $95k/m² en el segmento premium.\n\n**Top 3 Logros:**\n1. Cierre récord Torre Polanco — 3 unidades en una semana\n2. NPS asesor aliado subió a 4.7/5\n3. Entrega Residencias Coyoacán programada en 30 días\n\n**Top 3 Alertas:**\n1. Velocidad de venta bajó 12% vs mes anterior en unidades tipo A\n2. 6 apartados sin confirmación de contrato después de 15 días\n3. Competidor GIG lanzó proyecto a $89k/m² a 3 cuadras\n\n**Recomendaciones:**\n- Activar campaña de seguimiento para los 6 apartados en riesgo\n- Evaluar ajuste de precio unitario tipo A (-3%) para acelerar absorción\n- Programar open house exclusivo para unidades de mayor ticket\n\n**Forecast Próximo Mes:**\nSe proyectan 7-9 unidades si se mantiene el ritmo actual. Alta probabilidad de cierre Residencias Coyoacán completo.", "generated_at": datetime.now(timezone.utc).isoformat()}

# ─── Demand heatmap (seed data) ───────────────────────────────────────────────
@app.get("/api/developer/demand")
async def get_demand(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    return [
        {"colonia":"Polanco","searches":487,"supply":67,"gap":420,"trend":"+18%"},
        {"colonia":"Condesa","searches":412,"supply":89,"gap":323,"trend":"+12%"},
        {"colonia":"Roma Norte","searches":389,"supply":115,"gap":274,"trend":"+24%"},
        {"colonia":"Narvarte","searches":356,"supply":178,"gap":178,"trend":"+8%"},
        {"colonia":"Del Valle","searches":298,"supply":142,"gap":156,"trend":"+6%"},
        {"colonia":"Coyoacán","searches":245,"supply":94,"gap":151,"trend":"+15%"},
        {"colonia":"Escandón","searches":221,"supply":142,"gap":79,"trend":"-2%"},
        {"colonia":"Doctores","searches":312,"supply":234,"gap":78,"trend":"+31%"},
        {"colonia":"Lindavista","searches":189,"supply":312,"gap":-123,"trend":"+3%"},
    ]

# ─── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status":"ok","service":"DesarrollosMX API v2","colonias":len(SEED_COLONIAS),"properties":len(SEED_PROPERTIES)}
