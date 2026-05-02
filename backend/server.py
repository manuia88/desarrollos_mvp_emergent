import os
import uuid
import bcrypt
import logging
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
from routes_dev_batch11 import router as dev_batch11_router, ensure_batch11_indexes
app.include_router(dev_batch11_router)

from routes_dev_batch10 import router as dev_batch10_router, ensure_batch10_indexes
app.include_router(dev_batch10_router)

from routes_dev_batch8 import (router as dev_batch8_router, ensure_batch8_indexes,
                              daily_active_projects_recalc)
app.include_router(dev_batch8_router)

# Phase 4 Batch 0 — Auth routes (extracted from server.py)
from routes_auth import router as auth_router
app.include_router(auth_router)

# Phase 4 Batch 0 — Public marketplace routes (extracted from server.py)
from routes_public import (router as public_router, _dev_overlay_cache,
                            invalidate_dev_overlay_cache)
app.include_router(public_router)

# Phase 4 Batch 0 — User Preferences + Universal Search
from routes_search_prefs import (router as search_prefs_router,
                                  ensure_preferences_indexes)
app.include_router(search_prefs_router)

# Phase 4 Batch 0 — AI Budget tracking
from ai_budget import router as ai_budget_router, ensure_ai_budget_indexes
app.include_router(ai_budget_router)

# Phase 4 Batch 0 Sub-chunk C — Badge counters
from routes_badges import router as badges_router
app.include_router(badges_router)

# Phase 4 Batch 0.5 — Diagnostic Engine + Observability
from routes_diagnostic import (router as diagnostic_router,
                                register_diagnostic_jobs)
from diagnostic_engine import ensure_diagnostic_indexes
app.include_router(diagnostic_router)

# Phase 4 Batch 12 — Wizard 7 pasos + IA upload + Drive
from routes_wizard import (router as wizard_router, ensure_wizard_indexes)
app.include_router(wizard_router)

# Phase 4 Batch 13 — Tracking attribution + Cross-portal sync
from routes_b13 import (router as b13_router, ensure_b13_indexes)
app.include_router(b13_router)

# Phase 4 Batch 14 — Health Score + Activity Feed + Notifications + Weekly Brief
from routes_dev_batch14 import (router as dev_batch14_router, ensure_batch14_indexes)
from health_score import ensure_health_score_indexes
app.include_router(dev_batch14_router)

# Phase 4 Batch 15 — Multi-broker Calendar (Google OAuth + Availability + Auto-assign)
from routes_dev_batch15 import (router as dev_batch15_router, ensure_batch15_indexes)
from oauth_calendar import ensure_oauth_indexes
app.include_router(dev_batch15_router)

# Phase 4 Batch 16 — AI Suggestions Inline + Public Booking Page
from ai_suggestions import (router as ai_suggestions_router,
                             ensure_ai_suggestions_indexes)
from routes_dev_batch16 import router as dev_batch16_public_router
app.include_router(ai_suggestions_router)
app.include_router(dev_batch16_public_router)

# Phase 4 Batch 17 — Inline edit + Undo + Filter presets + Reorder
from routes_dev_batch17 import (router as dev_batch17_router,
                                  ensure_batch17_indexes,
                                  purge_expired_undo_log)
app.include_router(dev_batch17_router)

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
    await ensure_batch11_indexes(db)
    await ensure_batch10_indexes(db)
    await ensure_batch8_indexes(db)
    # Phase 4 Batch 0 — AI Budget + Preferences indexes
    await ensure_ai_budget_indexes(db)
    await ensure_preferences_indexes(db)
    # Phase 4 Batch 0.5 — Diagnostic Engine indexes
    await ensure_diagnostic_indexes(db)
    # Phase 4 Batch 12 — Wizard indexes
    await ensure_wizard_indexes(db)
    # Phase 4 Batch 13 — Tracking + cross-portal indexes
    await ensure_b13_indexes(db)
    # Phase 4 Batch 0 Sub-chunk C — project_documents migration
    try:
        await db.project_documents.create_index([("development_id", 1), ("doc_type", 1)])
        await db.project_documents.create_index("development_id")
        migrated_count = 0
        async for dev in db.developments.find(
            {"documents": {"$exists": True, "$not": {"$size": 0}}}, {"_id": 0, "id": 1, "documents": 1}
        ):
            pid = dev.get("id")
            if not pid:
                continue
            for doc in dev.get("documents", []):
                existing = await db.project_documents.find_one({"development_id": pid, "url": doc.get("url")})
                if not existing:
                    await db.project_documents.insert_one({
                        "development_id": pid,
                        "doc_type": doc.get("type", "document"),
                        "name": doc.get("name", ""),
                        "url": doc.get("url", ""),
                        "migrated_from": "developments.documents",
                        "created_at": datetime.now(timezone.utc),
                    })
                    migrated_count += 1
        if migrated_count:
            logging.info(f"[startup] Migrated {migrated_count} embedded documents to project_documents")
    except Exception as e:
        logging.warning(f"[startup] project_documents migration failed: {e}")
    # Phase 4 Batch 0 — project_assets collection setup
    try:
        await db.project_assets.create_index([("development_id", 1), ("asset_type", 1)])
        await db.project_assets.create_index("development_id")
        # Migrate embedded assets from developments if any exist
        async for dev in db.developments.find(
            {"assets": {"$exists": True, "$ne": []}}, {"_id": 0, "project_id": 1, "assets": 1}
        ):
            pid = dev.get("project_id")
            if not pid:
                continue
            for asset in dev.get("assets", []):
                existing = await db.project_assets.find_one({"development_id": pid, "url": asset.get("url")})
                if not existing:
                    await db.project_assets.insert_one({
                        "development_id": pid,
                        "asset_type": asset.get("type", "photo"),
                        "url": asset.get("url"),
                        "filename": asset.get("filename", ""),
                        "migrated_from": "developments",
                        "created_at": datetime.now(timezone.utc),
                    })
    except Exception as e:
        logging.warning(f"project_assets setup failed: {e}")
    # Preload dev_overlays cache (used by routes_public)
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
            logging.info("[batch8] daily cash-flow recalc scheduled @ 06:00 MX")
        except Exception as e:
            logging.warning(f"[batch8] could not schedule daily recalc: {e}")
        # Phase 4 Batch 0.5 — Diagnostic daily scheduler
        try:
            register_diagnostic_jobs(sched, db, app)
        except Exception as e:
            logging.warning(f"[batch0.5] diagnostic scheduler register failed: {e}")

    # Phase 4 Batch 14 — Health Score + Activity + Weekly Brief indexes
    try:
        await ensure_batch14_indexes(db)
        await ensure_health_score_indexes(db)
    except Exception as e:
        logging.warning(f"[batch14] index setup failed: {e}")

    # Phase 4 Batch 15 — OAuth Calendar + Availability indexes
    try:
        await ensure_batch15_indexes(db)
        await ensure_oauth_indexes(db)
    except Exception as e:
        logging.warning(f"[batch15] index setup failed: {e}")

    # Phase 4 Batch 16 — AI Suggestions indexes
    try:
        await ensure_ai_suggestions_indexes(db)
    except Exception as e:
        logging.warning(f"[batch16] index setup failed: {e}")

    # Phase 4 Batch 17 — Undo + Filter presets indexes + purge cron
    try:
        await ensure_batch17_indexes(db)
        if sched:
            from apscheduler.triggers.cron import CronTrigger
            sched.add_job(
                purge_expired_undo_log, CronTrigger(minute=7),
                id="undo_purge_hourly", replace_existing=True,
                kwargs={"db": db}, max_instances=1,
            )
            logging.info("[batch17] undo purge cron scheduled @ :07 hourly")
    except Exception as e:
        logging.warning(f"[batch17] index/cron setup failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()

