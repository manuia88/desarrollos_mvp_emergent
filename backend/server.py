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
from atlax_engine import router as atlax_router
app.include_router(atlax_router)
from routes_caya_legacy import router as caya_legacy_router
app.include_router(caya_legacy_router)

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

# W1.2 SA1.1 — Superadmin Tenants Management
from routes_superadmin_tenants import (
    router as superadmin_tenants_router,
    ensure_superadmin_tenant_indexes,
)
app.include_router(superadmin_tenants_router)

# W1.3 SA1.2 — Superadmin System Health
from routes_superadmin_health import router as superadmin_health_router
from cron_heartbeat import ensure_heartbeat_indexes
app.include_router(superadmin_health_router)

# W1.4 ZZ.1 — Bulk Drive Ingestion
from routes_bulk_ingest import router as bulk_ingest_router
from bulk_ingest_engine import ensure_bulk_ingest_indexes
app.include_router(bulk_ingest_router)

# W2.1 SA2 — Data Sources Hub (unified connectors)
from routes_superadmin_data_hub import router as data_hub_router
from connector_registry import ensure_connector_indexes
app.include_router(data_hub_router)

# W2.2 SA3 — Superadmin Audit Log Viewer
from routes_superadmin_audit import (
    router as superadmin_audit_router,
    ensure_superadmin_audit_indexes,
)
app.include_router(superadmin_audit_router)

# W2.3 SA4 — AI Cost Observatory
from routes_superadmin_ai_cost import router as superadmin_ai_cost_router
app.include_router(superadmin_ai_cost_router)

# W2.4 SA5 — Commercial Foundation (feature flags + plan templates + snapshots)
from routes_superadmin_commercial import (
    router as superadmin_commercial_router,
    me_router as me_feature_flags_router,
)
from feature_flags_engine import ensure_commercial_indexes, seed_commercial
from trial_expiry_cron import ensure_trial_alerts_indexes
app.include_router(superadmin_commercial_router)
app.include_router(me_feature_flags_router)

# W2.5 SA6 — Granular Metrics Cube UI (city → alcaldia → colonia → development → unit)
from routes_superadmin_metrics_cube import router as superadmin_metrics_cube_router
from metrics_cube_aggregations import ensure_indexes as ensure_metrics_cube_indexes
app.include_router(superadmin_metrics_cube_router)

# W2.8 Phase Z.1 — Consolidated OLAP cube (cross-cut + cache + backfill)
from cube_olap_engine import ensure_consolidated_indexes as ensure_cube_consolidated_indexes

# W2.6 SA8 — Founder Console (executive dashboard + Cmd+K + anomalies)
from routes_superadmin_founder_console import router as superadmin_founder_console_router
from anomaly_detection_engine import ensure_indexes as ensure_founder_anomaly_indexes
app.include_router(superadmin_founder_console_router)

# W2.7 Phase Z.0 — Data Lake (time-series facts + ETL + model validation)
from routes_superadmin_data_lake import router as superadmin_data_lake_router
from data_lake_etl import (
    ensure_facts_indexes as ensure_data_lake_indexes,
    seed_dim_zones as seed_data_lake_dim_zones,
)
app.include_router(superadmin_data_lake_router)

# W2.9 Phase Z.2 — Superadmin Intelligence Hub (executive bird's-eye)
from routes_superadmin_intelligence_hub import router as superadmin_intelligence_hub_router
from intelligence_insights_engine import ensure_indexes as ensure_intelligence_indexes
app.include_router(superadmin_intelligence_hub_router)

# W3.1A Phase 5 Foundation — DENUE + Construction Cost + Zone Score
from routes_phase5_foundation import router as phase5_router, pub_router as phase5_pub_router
from denue_engine import ensure_indexes as ensure_denue_indexes
from construction_cost_engine import ensure_indexes as ensure_cost_indexes
from zone_score_engine import ensure_indexes as ensure_zone_score_indexes
app.include_router(phase5_router)
app.include_router(phase5_pub_router)

# W3.2 ZZ.2 Transaction Network
from routes_transaction_network import router as txn_network_router
from transaction_network_engine import ensure_indexes as ensure_txn_indexes
app.include_router(txn_network_router)

# W3.3 ZZ.3 — DRPI + Bulletins + Investment Explorer
from routes_drpi import router as drpi_router
from routes_bulletins import router as bulletins_router
from routes_investment_explorer import router as investment_explorer_router
from drpi_engine import ensure_indexes as ensure_drpi_indexes
from hedonic_regression_engine import ensure_indexes as ensure_hedonic_indexes
from bulletins_engine import ensure_indexes as ensure_bulletins_indexes
app.include_router(drpi_router)
app.include_router(bulletins_router)
app.include_router(investment_explorer_router)

# W3.4A ZZ.4 — Fraud Detection + Risk Score V1 (SESNSP)
from routes_fraud_detection import router as fraud_router
from routes_risk_score import router as risk_score_router
from fraud_detection_engine import ensure_indexes as ensure_fraud_indexes
from crime_data_engine import ensure_indexes as ensure_crime_indexes
from risk_score_engine import ensure_indexes as ensure_risk_indexes
app.include_router(fraud_router)
app.include_router(risk_score_router)

# W3.4B ZZ.4 — Risk V2 multi-source + Risk Alerts
from routes_risk_alerts import router as risk_alerts_router
from natural_risk_engine import ensure_indexes as ensure_natural_indexes
from perception_risk_engine import ensure_indexes as ensure_perception_indexes
app.include_router(risk_alerts_router)

# W3.5 — Public API v1 + Stripe Billing
from routes_public_api_v1 import router as public_api_v1_router
from public_api_auth import ensure_indexes as ensure_public_api_indexes
from stripe_billing_engine import ensure_indexes as ensure_stripe_indexes
app.include_router(public_api_v1_router)

# W3.6 — Vertical Data Products + Data Licensing Bundles (Phase Z.4)
from routes_vertical_products import router as vertical_products_router
from routes_data_licensing import router as data_licensing_router
from vertical_products_engine import ensure_indexes as ensure_vertical_products_indexes
app.include_router(vertical_products_router)
app.include_router(data_licensing_router)

# W3.7 — Phase Z.5 Anonymization + Compliance (LFPDPPP)
from routes_compliance import router as compliance_router
from compliance_engine import ensure_compliance_indexes
app.include_router(compliance_router)

# W3.8 — Cross-sell Intelligence
from routes_cross_sell import router as cross_sell_router
from routes_partners import router as partners_router
from cross_sell_engine import ensure_indexes as ensure_cross_sell_indexes
app.include_router(cross_sell_router)
app.include_router(partners_router)

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

# W4.1C — Recommendations banner backend
from routes_recommendations import router as recommendations_router
app.include_router(recommendations_router)

# W4.1D — Comparable alerts
from routes_comparable_alerts import router as comparable_alerts_router
app.include_router(comparable_alerts_router)

# W4.2A — MCP server (Model Context Protocol HTTP interface)
from mcp_server import router as mcp_router, ensure_mcp_indexes
app.include_router(mcp_router, prefix="/api/mcp")

# W4.2B — SEO/GEO static files (NO /api prefix — llms.txt, sitemap.xml, ai-plugin.json)
# NOTE: in this Kubernetes environment, non-/api paths go to the React frontend.
# Static files are served from frontend/public/ for the canonical paths.
# This backend router provides /api/seo/* mirror for API clients.
from routes_seo_files import router as seo_router
app.include_router(seo_router, prefix="/api/seo")

# W4.2D1 — seed SEO filter combos on startup
try:
    from seo_combos_seed import (
        seed_seo_combos as _seed_seo_combos_import,
        seed_zone_pages_in_sitemap as _seed_zone_pages_import,
    )
except ImportError:
    _seed_seo_combos_import = None
    _seed_zone_pages_import = None

# W4.2D2 — Public zones router (programmatic SEO landing pages)
from routes_public_zones import router as public_zones_router
app.include_router(public_zones_router)

# W4.2D3 — Programmatic SEO Tier 1+2 (40 colonias + 16 alcaldías + 5 intents + lead capture)
from routes_landings import (
    router as landings_router,
    sa_router as landings_sa_router,
    ensure_landing_indexes,
)
app.include_router(landings_router)
app.include_router(landings_sa_router)

# W4.2.5 — Embeddable widgets + Press kit live stats (CORS open)
from routes_widgets import router as widgets_router
from routes_press import router as press_router
app.include_router(widgets_router)
app.include_router(press_router)
try:
    from seo_combos_seed import seed_landings_in_sitemap as _seed_landings_import
except ImportError:
    _seed_landings_import = None

# W4.3 — Phase Y.0 Foundation + Behavioral Tracking
from routes_phase_y_controls import router as phase_y_router, ensure_indexes as ensure_phase_y_indexes
from routes_behavioral import router as behavioral_router, sa_router as behavioral_sa_router
from behavioral_tracking_engine import ensure_indexes as ensure_behavioral_indexes
app.include_router(phase_y_router)
app.include_router(behavioral_router)
app.include_router(behavioral_sa_router)

# W4.4 — Phase Y.1A · Director Agent
from routes_director import router as director_router, sa_router as director_sa_router
from director_agent_engine import ensure_indexes as ensure_director_indexes
app.include_router(director_router)
app.include_router(director_sa_router)

# W4.4B — Phase Y.1B · Director Memory Layer
from routes_director_memory import router as director_memory_router, sa_router as director_memory_sa_router
from director_memory_engine import ensure_indexes as ensure_memory_indexes
app.include_router(director_memory_router)
app.include_router(director_memory_sa_router)

# W4.4D — Phase Y.1D · What-if Simulator
from routes_whatif import router as whatif_router, sa_router as whatif_sa_router
from whatif_engine import ensure_indexes as ensure_whatif_indexes
app.include_router(whatif_router)
app.include_router(whatif_sa_router)

# W4.4E — Phase Y.1E · Asistente público comprador
from routes_asistente import router as asistente_router, sa_router as asistente_sa_router
from asistente_engine import ensure_indexes as ensure_asistente_indexes
app.include_router(asistente_router)
app.include_router(asistente_sa_router)

# W4.5 Y.2A — Pricing Sub-Agent
from routes_subagents import router as subagents_router, sa_router as subagents_sa_router
from sub_agents.pricing_agent import ensure_pricing_indexes
from sub_agents.marketing_agent import ensure_marketing_indexes
from sub_agents.lead_agent import ensure_lead_indexes
app.include_router(subagents_router)
app.include_router(subagents_sa_router)

# W4.18.1 — Apify Google Trends Integration
from routes_trends import router as trends_router
from apify_trends_engine import ensure_trends_indexes
app.include_router(trends_router)

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

# Phase 4 Batch 18 Sub-A — Density toggle + Project Switcher preferences
from routes_dev_batch18 import (router as dev_batch18_router,
                                  ensure_batch18_indexes)
app.include_router(dev_batch18_router)

# Phase 4 Batch 19 — Tours + Branding + Cross-portal + Presentation Mode
from routes_dev_batch19 import (router as dev_batch19_router,
                                 ensure_batch19_indexes)
app.include_router(dev_batch19_router)

# Phase 4 Batch 21 Sub-A — Tour Completion Analytics
from routes_tour_analytics import (router as tour_analytics_router,
                                    ensure_batch21_indexes)
app.include_router(tour_analytics_router)

# Phase 4 Batch 18 Sub-B — Floor plan routes
from routes_floor_view import (router as floor_view_router,
                                ensure_floor_view_indexes)
app.include_router(floor_view_router)

# Phase 4 Batch 21 Sub-B/C — Team Productivity + Aggregated Metrics
from routes_team_productivity import router as team_productivity_router
from routes_team_aggregated import router as team_aggregated_router
app.include_router(team_productivity_router)
app.include_router(team_aggregated_router)

# Phase 4 Batch 20 — Asesor metrics + Tracking links + Funnel/Sankey
from routes_asesor_metrics import (router as asesor_metrics_router,
                                     ensure_asesor_metrics_indexes)
from routes_tracking_links import (router as tracking_links_router,
                                     ensure_tracking_links_indexes)
from routes_funnel import (router as funnel_router, ensure_funnel_indexes)
from routes_insights import router as insights_router
from routes_copilot import router as copilot_router, ensure_indexes as ensure_copilot_indexes
from scheduler_asesor_snapshots import schedule_daily_snapshots
app.include_router(asesor_metrics_router)
app.include_router(tracking_links_router)
app.include_router(funnel_router)
app.include_router(insights_router)
app.include_router(copilot_router)

# Phase 4 Batch 24 — Marketplace Map Intelligence + Image Search
from routes_marketplace_map import router as marketplace_map_router
from routes_marketplace_search import router as marketplace_search_router
app.include_router(marketplace_map_router)
app.include_router(marketplace_search_router)

# Phase 4 Batch 25 — External Search + Saved Searches
from routes_external_search import router as external_search_router
app.include_router(external_search_router)

# Phase 4 Batch 26 — Marketplace Lead-Capture Tools (Reporte + Quiz + Comparador)
from routes_marketplace_lead_tools import router as marketplace_lead_tools_router
app.include_router(marketplace_lead_tools_router)

# Phase 4 Batch 27 — Mortgage Calculator + Colonia History + Share-link OG
from routes_marketplace_calculator import router as marketplace_calc_router
from routes_share_meta import router as share_meta_router
app.include_router(marketplace_calc_router)
app.include_router(share_meta_router)

# Phase 4 Batch 28 — Portal Comprador (autenticado)
from routes_comprador import router as comprador_router
app.include_router(comprador_router)

# Phase 4 Batch 29 — Comprador Engagement (Alertas + Chat + Comparador Premium)
from routes_buyer_alerts import router as buyer_alerts_router
from routes_chat import router as chat_router
from routes_comprador_compare import router as comprador_compare_router
app.include_router(buyer_alerts_router)
app.include_router(chat_router)
app.include_router(comprador_compare_router)

# Phase 4 Batch 30 — Wrapped + Smart Match
from routes_wrapped import router as wrapped_router
app.include_router(wrapped_router)

# Phase 3 Batch 31 — Asesor Tools (Briefing Tráfico + Clima + Argumentario RAG)
from routes_briefing_traffic import router as briefing_traffic_router
from routes_argumentario import router as argumentario_router
app.include_router(briefing_traffic_router)
app.include_router(argumentario_router)

# Phase 4 Batch 32 — Asesor Identity (Endorsements + LinkedIn + DISC + Trust Score)
from routes_asesor_identity import router as asesor_identity_router
app.include_router(asesor_identity_router)

# Phase 4 Batch 33 — Asesor Daily Tools (Calendar bidi + Visit briefing + Client insights)
from routes_asesor_daily_tools import router as asesor_daily_tools_router
app.include_router(asesor_daily_tools_router)

# Phase 4 Batch 34 — Smart Match Lead-to-Asesor + Daily Feed
from routes_lead_match import router as lead_match_router
app.include_router(lead_match_router)

# Phase 18 Batch 35 — Inmobiliaria entity (Foundation + Portal + Relationships)
from routes_inmobiliaria import router as inmobiliaria_router
app.include_router(inmobiliaria_router)

# Phase 13 Batch 36 — Advisor Whitelist + Auto-Approve
from routes_advisor_whitelist import router as whitelist_router
app.include_router(whitelist_router)

# Phase 14 Batch 37 — Internal Users + Mini Market + Cross-Org Partnerships
from routes_internal_users import router as internal_users_router
app.include_router(internal_users_router)

# Phase 15 Batch 38 — Cross directories + lead enrichment
from routes_directories import router as directories_router
app.include_router(directories_router)

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
    from atlax_engine import ensure_atlax_indexes
    await ensure_atlax_indexes(db)
    # Phase 7.11 — Drive connection indexes
    await ensure_drive_indexes(db)
    # Phase 7.9 — units history indexes
    await ensure_units_history_indexes(db)
    # Phase F0.11 — ML training events indexes
    await ensure_ml_indexes_fn(db)
    # Phase F0.1 — Audit log indexes
    await ensure_audit_log_indexes(db)
    try:
        await ensure_superadmin_tenant_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] superadmin tenant indexes failed: {e}")
    try:
        await ensure_heartbeat_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] heartbeat indexes failed: {e}")
    try:
        await ensure_bulk_ingest_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] bulk ingest indexes failed: {e}")
    try:
        await ensure_connector_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] connector indexes failed: {e}")
    try:
        await ensure_superadmin_audit_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] superadmin audit indexes failed: {e}")
    # W2.4 SA5 — Commercial foundation
    try:
        await ensure_commercial_indexes(db)
        await ensure_trial_alerts_indexes(db)
        seed_result = await seed_commercial(db)
        logging.info(f"[startup] commercial seeds: {seed_result}")
    except Exception as e:
        logging.warning(f"[startup] commercial init failed: {e}")
    # W2.5 SA6 — Metrics Cube indexes
    try:
        await ensure_metrics_cube_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] metrics cube indexes failed: {e}")
    # W2.8 Phase Z.1 — Consolidated OLAP indexes
    try:
        await ensure_cube_consolidated_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] cube consolidated indexes failed: {e}")
    # W2.6 SA8 — Founder Console anomaly indexes
    try:
        await ensure_founder_anomaly_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] founder anomaly indexes failed: {e}")
    # W2.7 Phase Z.0 — Data Lake indexes + dim_zones seed
    try:
        await ensure_data_lake_indexes(db)
        seed_summary = await seed_data_lake_dim_zones(db)
        logging.info(f"[startup] data lake dim_zones seed: {seed_summary}")
    except Exception as e:
        logging.warning(f"[startup] data lake init failed: {e}")
    # W2.9 Phase Z.2 — Intelligence Hub indexes
    try:
        await ensure_intelligence_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] intelligence hub indexes failed: {e}")
    # W3.1A Phase 5 Foundation — DENUE + Construction Cost + Zone Score indexes
    try:
        await ensure_denue_indexes(db)
        await ensure_cost_indexes(db)
        await ensure_zone_score_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] phase5 foundation indexes failed: {e}")
    # W3.2 Transaction Network indexes
    try:
        await ensure_txn_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] transaction network indexes failed: {e}")
    # W3.3 ZZ.3 — DRPI + Hedonic + Bulletins indexes
    try:
        await ensure_hedonic_indexes(db)
        await ensure_drpi_indexes(db)
        await ensure_bulletins_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.3 DRPI indexes failed: {e}")
    # W3.4A ZZ.4 — Fraud Detection + SESNSP + Risk Score indexes
    try:
        await ensure_fraud_indexes(db)
        await ensure_crime_indexes(db)
        await ensure_risk_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.4A indexes failed: {e}")
    # W3.4B ZZ.4 — Natural Risk + Perception indexes
    try:
        await ensure_natural_indexes(db)
        await ensure_perception_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.4B indexes failed: {e}")
    # W3.5 — Public API + Stripe indexes
    try:
        await ensure_public_api_indexes(db)
        await ensure_stripe_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.5 indexes failed: {e}")
    # W3.6 — Vertical Products + Data Licensing indexes
    try:
        await ensure_vertical_products_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.6 indexes failed: {e}")
    # W3.7 — Compliance LFPDPPP indexes
    try:
        await ensure_compliance_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W3.7 compliance indexes failed: {e}")
    # W3.8 — Cross-sell Intelligence indexes + seed partners
    try:
        await ensure_cross_sell_indexes(db)
        from cross_sell_engine import seed_initial_partners, seed_demo_offers
        await seed_initial_partners(db)
        await seed_demo_offers(db)
    except Exception as e:
        logging.warning(f"[startup] W3.8 cross-sell seed failed: {e}")
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
    # Phase 18 Batch 35 — Inmobiliaria relationships + AMPI verifications
    from services.inmobiliaria_relationships import ensure_inmobiliaria_relationship_indexes
    await ensure_inmobiliaria_relationship_indexes(db)
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
    # W4.1D — Comparable anomaly alert indexes
    try:
        from comparable_anomaly_engine import ensure_comparable_alert_indexes
        await ensure_comparable_alert_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.1D comparable alert indexes failed: {e}")
    # W4.2A — MCP usage log indexes
    try:
        await ensure_mcp_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.2A MCP indexes failed: {e}")
    # W4.2D1 — SEO filter combos seed
    try:
        if _seed_seo_combos_import:
            await _seed_seo_combos_import(db)
    except Exception as e:
        logging.warning(f"[startup] W4.2D1 seo combos seed failed: {e}")
    # W4.2D2 — Zone pages seed in sitemap
    try:
        if _seed_zone_pages_import:
            await _seed_zone_pages_import(db)
    except Exception as e:
        logging.warning(f"[startup] W4.2D2 zone pages seed failed: {e}")
    # W4.2D3 — Landings (40 colonias + 16 alcaldías + 5 intents) sitemap + indexes
    try:
        if _seed_landings_import:
            await _seed_landings_import(db)
        await ensure_landing_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.2D3 landings seed/indexes failed: {e}")
    try:
        await ensure_phase_y_indexes(db)
        await ensure_behavioral_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.3 phase-y/behavioral indexes failed: {e}")
    try:
        await ensure_director_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.4 director indexes failed: {e}")
    try:
        await ensure_memory_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.4B memory indexes failed: {e}")
    try:
        await ensure_whatif_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.4D whatif indexes failed: {e}")
    try:
        await ensure_asistente_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.4E asistente indexes failed: {e}")
    # W4.5 Y.2A — Pricing Sub-Agent indexes
    try:
        await ensure_pricing_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.5 pricing sub-agent indexes failed: {e}")
    # W4.5 Y.2B — Marketing Sub-Agent indexes
    try:
        await ensure_marketing_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.5 marketing sub-agent indexes failed: {e}")
    # W4.5 Y.2C — Lead Sub-Agent indexes
    try:
        await ensure_lead_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.5 lead sub-agent indexes failed: {e}")
    # W4.18.1 — Apify Google Trends cache indexes
    try:
        await ensure_trends_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.18.1 apify trends indexes failed: {e}")
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
    # W3.1B-5 — initial recompute (background) if ie_scores collection is empty
    try:
        import asyncio as _asyncio_w3_1b5
        from scheduler_ie import run_initial_recompute_if_empty
        _asyncio_w3_1b5.create_task(run_initial_recompute_if_empty(db))
    except Exception as e:
        logging.warning(f"[startup] initial recompute task failed to schedule: {e}")
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

    # Phase 4 Batch 18 Sub-A — Density + Project Switcher
    try:
        await ensure_batch18_indexes(db)
    except Exception as e:
        logging.warning(f"[batch18] index setup failed: {e}")

    # Phase 4 Batch 19 — Tours + Branding + Presentation Mode
    try:
        await ensure_batch19_indexes(db)
    except Exception as e:
        logging.warning(f"[batch19] index setup failed: {e}")

    # Phase 4 Batch 21 Sub-A — Tour Completion Analytics
    try:
        await ensure_batch21_indexes(db)
    except Exception as e:
        logging.warning(f"[batch21] index setup failed: {e}")

    # Phase 4 Batch 18 Sub-B — Floor plan view
    try:
        await ensure_floor_view_indexes(db)
    except Exception as e:
        logging.warning(f"[floor_view] index setup failed: {e}")

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

    # Phase 4 Batch 20 — Asesor metrics + Tracking + Funnel indexes + 6am snapshots
    try:
        await ensure_asesor_metrics_indexes(db)
        await ensure_tracking_links_indexes(db)
        await ensure_funnel_indexes(db)
        await ensure_copilot_indexes(db)
        if sched:
            schedule_daily_snapshots(sched, db)

        # Phase 4 Batch 25 — Saved Search alerts (8am) + Image Embeddings (3am)
        try:
            from scheduler_saved_search_alerts import register_saved_search_jobs
            if sched:
                register_saved_search_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[batch25] scheduler register failed: {e}")

        # Phase 4 Batch 29 — Buyer Alerts (instant 5min + daily + weekly)
        try:
            from scheduler_buyer_alerts import register_buyer_alerts_jobs
            if sched:
                register_buyer_alerts_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[batch29] buyer alerts scheduler register failed: {e}")

        # Phase 4 Batch 30 — Wrapped cron jobs
        try:
            from scheduler_wrapped import register_wrapped_jobs
            if sched:
                register_wrapped_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[batch30] wrapped scheduler register failed: {e}")
    except Exception as e:
        logging.warning(f"[batch20] setup failed: {e}")


    # Phase 4 Batch 28 — Comprador Portal — no extra indexes needed (handled by routes_comprador)

    # Phase 4 Batch 29 — Buyer Alerts + Chat indexes
    try:
        from services.buyer_alerts import ensure_buyer_alerts_indexes
        await ensure_buyer_alerts_indexes(db)
    except Exception as e:
        logging.warning(f"[batch29] buyer_alerts indexes failed: {e}")
    try:
        from services.chat_engine import ensure_chat_indexes
        await ensure_chat_indexes(db)
    except Exception as e:
        logging.warning(f"[batch29] chat indexes failed: {e}")

    # Phase 4 Batch 30 — Wrapped + Smart Match indexes
    try:
        from services.wrapped_generator import ensure_wrapped_indexes
        await ensure_wrapped_indexes(db)
    except Exception as e:
        logging.warning(f"[batch30] wrapped indexes failed: {e}")
    try:
        from services.smart_match import ensure_smart_match_indexes
        await ensure_smart_match_indexes(db)
    except Exception as e:
        logging.warning(f"[batch30] smart_match indexes failed: {e}")

    # Phase 3 Batch 31 — Asesor Tools (Tráfico/Clima + Argumentario RAG)
    try:
        from services.traffic_briefing import ensure_traffic_indexes
        await ensure_traffic_indexes(db)
    except Exception as e:
        logging.warning(f"[batch31] traffic indexes failed: {e}")
    try:
        from services.argumentario_rag import ensure_argumentario_indexes
        await ensure_argumentario_indexes(db)
        from services.argumentario_seed import seed_kb_if_empty
        inserted = await seed_kb_if_empty(db)
        if inserted:
            logging.info(f"[batch31] argumentario seeded {inserted} entries")
    except Exception as e:
        logging.warning(f"[batch31] argumentario init failed: {e}")

    # Phase 4 Batch 32 — Asesor Identity (Endorsements + LinkedIn + DISC + Trust)
    try:
        from services.endorsements import ensure_endorsement_indexes
        await ensure_endorsement_indexes(db)
        from services.linkedin_import import ensure_linkedin_indexes
        await ensure_linkedin_indexes(db)
        from services.disc_test import ensure_disc_indexes
        await ensure_disc_indexes(db)
        from services.trust_score import ensure_trust_score_indexes
        await ensure_trust_score_indexes(db)
    except Exception as e:
        logging.warning(f"[batch32] asesor_identity indexes failed: {e}")

    # Phase 4 Batch 33 — Asesor Daily Tools indexes + scheduler jobs
    try:
        from services.calendar_bidirectional import ensure_calendar_bidi_indexes
        await ensure_calendar_bidi_indexes(db)
        from services.visit_auto_prep import ensure_visit_prep_indexes
        await ensure_visit_prep_indexes(db)
        from services.client_insights import ensure_client_insights_indexes
        await ensure_client_insights_indexes(db)
    except Exception as e:
        logging.warning(f"[batch33] daily tools indexes failed: {e}")

    # Phase 4 Batch 34 — Smart Match + Daily Feed indexes
    try:
        from services.lead_to_asesor_match import ensure_lead_match_indexes
        await ensure_lead_match_indexes(db)
        from services.asesor_daily_feed import ensure_daily_feed_indexes
        await ensure_daily_feed_indexes(db)
    except Exception as e:
        logging.warning(f"[batch34] indexes failed: {e}")

    # Phase 13 Batch 36 — Advisor Whitelist + Auto-Approve indexes
    try:
        from services.advisor_authorization import ensure_whitelist_indexes
        await ensure_whitelist_indexes(db)
    except Exception as e:
        logging.warning(f"[batch36] whitelist indexes failed: {e}")

    # Phase 14 Batch 37 — Internal Users + Cross-Org Partnerships indexes
    try:
        from services.internal_users import ensure_invitation_indexes
        await ensure_invitation_indexes(db)
        from services.cross_org_partnerships import ensure_cross_partnership_indexes
        await ensure_cross_partnership_indexes(db)
    except Exception as e:
        logging.warning(f"[batch37] indexes failed: {e}")
    try:
        # Polling 30min · auto-renew daily 03:00 · briefing cron hourly
        if sched is not None:
            from services.calendar_bidirectional import (
                polling_sync_all, renew_expiring_webhooks,
            )
            from services.visit_auto_prep import auto_generate_upcoming_briefings
            sched.add_job(
                polling_sync_all, "interval", minutes=30,
                args=[db], id="b33_calendar_polling",
                replace_existing=True, max_instances=1,
            )
            sched.add_job(
                renew_expiring_webhooks, "cron", hour=3, minute=0,
                args=[db], id="b33_webhook_renew",
                replace_existing=True, max_instances=1,
            )
            sched.add_job(
                auto_generate_upcoming_briefings, "interval", minutes=60,
                args=[db], id="b33_visit_briefing_cron",
                replace_existing=True, max_instances=1,
            )
            logging.info("[batch33] scheduler jobs registered")
    except Exception as e:
        logging.warning(f"[batch33] scheduler jobs failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()

