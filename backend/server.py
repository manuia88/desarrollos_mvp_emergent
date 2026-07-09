import os
import uuid
import bcrypt
import hashlib
import logging
import jwt as pyjwt
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, computed_field

load_dotenv()

# Phase F0.11 — Sentry MUST init before FastAPI app for auto-instrumentation.
from observability import init_sentry, init_posthog
init_sentry()
init_posthog()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
EMERGENT_LLM_KEY = os.environ.get("ANTHROPIC_API_KEY")

# P1.12 · salt de PII SOLO en el backend (antes el front lo traía en el bundle con default débil).
LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT") or secrets.token_hex(16)


def analytics_id_for(user_id: Optional[str]) -> Optional[str]:
    """ID pseudónimo para analítica (PostHog) — hash con salt de servidor, NO reversible desde el cliente."""
    if not user_id:
        return None
    return hashlib.sha256(f"{user_id}:{LFPDPPP_SALT}".encode()).hexdigest()[:16]


def _is_dev() -> bool:
    """¿Entorno de desarrollo/preview EXPLÍCITO? (DMX_ENV dev/local/preview/staging o DMX_DEV_MODE truthy)."""
    env = os.environ.get("DMX_ENV", "").strip().lower()
    if env in ("local", "dev", "development", "test", "testing", "ci", "preview", "staging"):
        return True
    return os.environ.get("DMX_DEV_MODE", "").strip().lower() in ("1", "true", "yes")


def _is_explicit_prod() -> bool:
    """DMX_ENV declarado EXPLÍCITAMENTE como producción (para el abort duro de secretos del guard)."""
    return os.environ.get("DMX_ENV", "").strip().lower() in ("prod", "production")


def _is_prod() -> bool:
    """Único punto para saber si corremos en producción. SEGURIDAD (pentest 2026-06-27): FAIL-CLOSED — asume PROD
    (modo seguro: docs off, cookies Secure, webhook con firma, HSTS) salvo que se DECLARE dev/preview explícitamente.
    Antes SOLO 'prod'/'production' activaba el modo seguro → un typo en DMX_ENV (p.ej. 'prodd', vacío) dejaba TODO en
    modo dev ABIERTO (docs/superadmin expuestos, cookies inseguras, webhook de pagos sin firma)."""
    return not _is_dev()


def _prod_env_guard():
    """Gate de prod fail-closed (Tanda 2 · P0.5/P0.7/P1.10). En prod EXPLÍCITO ABORTA el arranque si faltan secretos
    críticos; loguea fuerte los recomendados. En dev/preview solo advierte (no rompe arranque). Un solo lugar."""
    # SEGURIDAD (P3 · cierre a verde): en PROD EXPLÍCITO, DMX_DEV_MODE truthy es FATAL — no arrancar.
    # Por qué: si DMX_ENV=production PERO DMX_DEV_MODE=true, `_is_dev()` devuelve True y `_is_prod()` False
    # → toda la app cae a modo dev ABIERTO (docs/openapi expuestos, cookies sin Secure, webhook de pagos sin
    # firma, cuentas demo con contraseña pública sembradas). Es un pie-de-bala silencioso. Mejor no bootear.
    if _is_explicit_prod() and os.environ.get("DMX_DEV_MODE", "").strip().lower() in ("1", "true", "yes"):
        msg = ("PROD inseguro · DMX_DEV_MODE está activo (truthy) con DMX_ENV=production → la app correría en modo "
               "dev ABIERTO (docs expuestos, cookies inseguras, webhook sin firma, cuentas demo). Quita DMX_DEV_MODE "
               "en producción.")
        logging.error(f"[startup] {msg}")
        raise RuntimeError(msg)   # fail-closed: mejor no bootear que bootear en modo dev abierto
    # [AUD-021b] Cierre del hueco del TYPO: si DMX_ENV está SETEADO pero no es ni dev ni prod reconocido
    # (p.ej. 'prodd', 'production ', 'PROD1'), es casi seguro un prod mal escrito → tratarlo como prod para
    # EXIGIR secretos (fail-closed), en vez de arrancar con JWT_SECRET efímero. UNSET se mantiene como dev
    # local (arranque suave, sin romper el flujo de dev que no setea DMX_ENV).
    _env_raw = os.environ.get("DMX_ENV", "").strip()
    _ambiguous_set = bool(_env_raw) and not _is_dev() and not _is_explicit_prod()
    if not _is_explicit_prod() and not _ambiguous_set:
        # dev/preview/UNSET: avisos suaves, no bloquea el arranque (no rompe preview/local sin secretos)
        if not os.environ.get("JWT_SECRET"):
            logging.warning("[startup] JWT_SECRET no seteada — usando secreto efímero (OK en dev, NO en prod)")
        return
    if _ambiguous_set:
        logging.error(f"[startup] DMX_ENV='{_env_raw}' NO reconocido — se trata como PRODUCCIÓN (fail-closed) "
                      "para exigir secretos. ¿Typo? Usa 'production' en prod o 'local'/'preview' en dev.")
    fatal = []
    if not os.environ.get("JWT_SECRET"):
        fatal.append("JWT_SECRET (sin esto las sesiones mueren al reiniciar / no validan entre instancias)")
    apw = os.environ.get("ADMIN_PASSWORD", "")
    if not apw or apw == "Admin2026!":
        fatal.append("ADMIN_PASSWORD (falta o usa el default público 'Admin2026!')")
    # Secretos con default efímero peligroso: sin ellos en prod, la anonimización PII (LFPDPPP),
    # el cifrado en reposo (Fernet) y la auth de crons rotan/rompen en silencio al reiniciar.
    if not os.environ.get("LFPDPPP_SALT"):
        fatal.append("LFPDPPP_SALT (sin esto el hash de PII rota al reiniciar → des-anonimización inconsistente)")
    if not os.environ.get("IE_FERNET_KEY"):
        fatal.append("IE_FERNET_KEY (sin esto el cifrado en reposo usa clave efímera → datos ilegibles tras reinicio)")
    if not os.environ.get("CRON_SECRET"):
        fatal.append("CRON_SECRET (sin esto los endpoints de cron quedan sin auth o con default)")
    if fatal:
        msg = "PROD env inseguro · faltan/inseguros: " + " · ".join(fatal)
        logging.error(f"[startup] {msg}")
        raise RuntimeError(msg)   # fail-closed: mejor no bootear que bootear inseguro
    # Recomendados (no abortan, pero deben gritar en prod)
    if not os.environ.get("STRIPE_WEBHOOK_SECRET"):
        logging.error("[startup] PROD sin STRIPE_WEBHOOK_SECRET — el webhook de pagos rechazará eventos (fail-closed).")
    _dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not _dsn.startswith(("http://", "https://")):
        logging.error("[startup] PROD: SENTRY_DSN no es una URL DSN válida — observabilidad de errores APAGADA. Setea un DSN real.")

# SEGURIDAD (pentest 2026-06-27): en PROD se apaga el "mapa del tesoro" (/openapi.json · /docs · /redoc)
# que listaba 1,524 rutas, incl. 440 de superadmin. En dev sigue disponible para desarrollo.
app = FastAPI(
    title="DesarrollosMX API", version="2.0.0",
    openapi_url=(None if _is_prod() else "/openapi.json"),
    docs_url=(None if _is_prod() else "/docs"),
    redoc_url=(None if _is_prod() else "/redoc"),
)

# Prod: orígenes explícitos vía CORS_ORIGINS (coma-separados, p.ej.
# "https://desarrollosmx.io,https://www.desarrollosmx.io"). Dev: regex localhost.
# Si CORS_ORIGINS no está seteada → solo localhost (comportamiento previo).
_CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    # Spec: si allow_credentials=True NO se puede usar "*" en allow_origins
    # (browser tira las cookies).
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    # P2.14 · acotado a lo realmente usado (antes "*"). Origins ya eran explícitos.
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# Pool acotado + timeouts (C1 Escala): sin tope, las conexiones se acumulan y
# bajo carga se encadenan timeouts. Valores conservadores, configurables por env.
client = AsyncIOMotorClient(
    MONGO_URL,
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", "50")),
    minPoolSize=int(os.environ.get("MONGO_MIN_POOL_SIZE", "5")),
    serverSelectionTimeoutMS=int(os.environ.get("MONGO_SERVER_SELECTION_MS", "5000")),
    connectTimeoutMS=int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "10000")),
    socketTimeoutMS=int(os.environ.get("MONGO_SOCKET_TIMEOUT_MS", "45000")),
)
db = client[DB_NAME]
app.state.db = db

# Wire advisor portal router
from routes.advisor import router as advisor_router
app.include_router(advisor_router)

# B5.2 · Link Tinder de propiedades — endpoints públicos (sin login, por token)
from routes.swipe_public import router as swipe_public_router
app.include_router(swipe_public_router)

# P2 · Agent Workforce (orchestrator + prospector + nurturer · 4 endpoints)
from routes.agent_workforce import router as agent_workforce_router
app.include_router(agent_workforce_router)

# P5.A · Auto-pilot (ejecuta acciones aprobadas · guardrails estrictos)
from routes.auto_pilot import router as auto_pilot_router
app.include_router(auto_pilot_router)

# Wire developer portal router
from routes.developer import router as developer_router
app.include_router(developer_router)

from routes.cube_inbox import router as cube_inbox_router
app.include_router(cube_inbox_router)

# Wire IE Engine (Phase A) router
from routes.ie_engine import router as ie_engine_router, seed_ie_engine
from scheduler_ie import start_scheduler, stop_scheduler
from routes.scores import sa_router as ie_scores_sa_router, pub_router as ie_scores_pub_router
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
from routes.studio import router as studio_router
app.include_router(studio_router)

# Wire Document Intelligence router (Phase 7.1 — Moat #2)
from routes.documents import router as documents_router, dev_alias as documents_dev_alias_router, public_router as assets_public_router
from document_intelligence import ensure_di_indexes
app.include_router(documents_router)
app.include_router(documents_dev_alias_router)
app.include_router(assets_public_router)

# Phase 7.6 — Static asset serving (public, no auth)
from fastapi.staticfiles import StaticFiles
from dev_assets import ASSET_UPLOAD_DIR
app.mount("/api/assets-static", StaticFiles(directory=str(ASSET_UPLOAD_DIR)), name="assets-static")

# P2 #4 — Parallax personalizado generado (público): static_parallax/{key}.mp4
import os as _os_pll
_PARALLAX_DIR = _os_pll.path.join(_os_pll.path.dirname(__file__), "static_parallax")
_os_pll.makedirs(_PARALLAX_DIR, exist_ok=True)
app.mount("/api/parallax-cache", StaticFiles(directory=_PARALLAX_DIR), name="parallax-cache")

# Phase D1 — RAG semantic search routers
from rag_engine import (
    public_router as rag_public_router,
    admin_router as rag_admin_router,
)
app.include_router(rag_public_router)
app.include_router(rag_admin_router)
# W5.x F2 Sub-F · RAG inspector superadmin
try:
    from routes.rag_admin import router as rag_superadmin_router
    app.include_router(rag_superadmin_router)
except Exception as _exc:
    logging.warning(f"[F2] rag_superadmin_router include failed: {_exc}")

# Phase D2 — Caya prep stub
from atlax_engine import router as atlax_router
app.include_router(atlax_router)
from routes.caya_legacy import router as caya_legacy_router
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
from routes.superadmin_tenants import (
    router as superadmin_tenants_router,
    ensure_superadmin_tenant_indexes,
)
app.include_router(superadmin_tenants_router)

# W1.3 SA1.2 — Superadmin System Health
from routes.superadmin_health import router as superadmin_health_router
from cron_heartbeat import ensure_heartbeat_indexes
app.include_router(superadmin_health_router)

# W1.4 ZZ.1 — Bulk Drive Ingestion
from routes.bulk_ingest import router as bulk_ingest_router
from bulk_ingest_engine import ensure_bulk_ingest_indexes
app.include_router(bulk_ingest_router)
from routes.superadmin_alta import router as superadmin_alta_router   # F: alta manual de dev+proyecto
app.include_router(superadmin_alta_router)

# W2.1 SA2 — Data Sources Hub (unified connectors)
from routes.superadmin_data_hub import router as data_hub_router
from connector_registry import ensure_connector_indexes
app.include_router(data_hub_router)

# W2.2 SA3 — Superadmin Audit Log Viewer
from routes.superadmin_audit import (
    router as superadmin_audit_router,
    ensure_superadmin_audit_indexes,
)
app.include_router(superadmin_audit_router)

# W2.3 SA4 — AI Cost Observatory
from routes.superadmin_ai_cost import router as superadmin_ai_cost_router
app.include_router(superadmin_ai_cost_router)

from routes.superadmin_granularity import router as superadmin_granularity_router
app.include_router(superadmin_granularity_router)

from routes.superadmin_demand_intel import router as superadmin_demand_intel_router
app.include_router(superadmin_demand_intel_router)

# W2.4 SA5 — Commercial Foundation (feature flags + plan templates + snapshots)
from routes.superadmin_commercial import (
    router as superadmin_commercial_router,
    me_router as me_feature_flags_router,
)
from feature_flags_engine import ensure_commercial_indexes, seed_commercial
from trial_expiry_cron import ensure_trial_alerts_indexes
app.include_router(superadmin_commercial_router)
app.include_router(me_feature_flags_router)

# W5.FF3 — UI Feature Visibility Matrix (4 endpoints superadmin)
from routes.feature_visibility import router as feature_visibility_router
app.include_router(feature_visibility_router)

# W5.x F6 — Tax/Legal Projector CDMX (publico T0 · open calculator)
try:
    from routes.tax_projector import router as tax_projector_router
    app.include_router(tax_projector_router)
except Exception as _exc:
    logging.warning(f"[F6] tax_projector_router include failed: {_exc}")

# W5.x F4 — Narrative Layer (LLM cross-feature storyteller)
try:
    from routes.narrative import router as narrative_layer_router
    app.include_router(narrative_layer_router)
except Exception as _exc:
    logging.warning(f"[F4] narrative_layer_router include failed: {_exc}")

# W5.x F4.2 — Comparator (side-by-side intelligence + tax + verdict)
try:
    from routes.compare import router as compare_router
    app.include_router(compare_router)
except Exception as _exc:
    logging.warning(f"[F4.2] compare_router include failed: {_exc}")

# W5.x F5 — Reverse Search (NL query → ranked catalog · público T0 · LLM parser)
try:
    from routes.reverse_search import router as reverse_search_router
    app.include_router(reverse_search_router)
except Exception as _exc:
    logging.warning(f"[F5] reverse_search_router include failed: {_exc}")

# W5.x F7 — Marketplace Lead Capture (anon visitor → qualified lead · PDF + WhatsApp)
try:
    from routes.lead_capture_marketplace import router as lead_capture_marketplace_router
    app.include_router(lead_capture_marketplace_router)
except Exception as _exc:
    logging.warning(f"[F7] lead_capture_marketplace_router include failed: {_exc}")

# W5.x F8 — Predictive Alerts (cross-feature signals → asesor feed + email digest)
try:
    from routes.predictive_alerts import router as predictive_alerts_router
    app.include_router(predictive_alerts_router)
except Exception as _exc:
    logging.warning(f"[F8] predictive_alerts_router include failed: {_exc}")

# W5.x F11 — Fit Engine (compatibility lead ↔ property · 6 dimensiones)
try:
    from routes.fit import router as fit_router
    app.include_router(fit_router)
except Exception as _exc:
    logging.warning(f"[F11] fit_router include failed: {_exc}")

# W5.x F10 — Mood Engine (quiz 6 preguntas → vector 5D + property mood profiler)
try:
    from routes.mood import router as mood_router
    app.include_router(mood_router)
except Exception as _exc:
    logging.warning(f"[F10] mood_router include failed: {_exc}")

# W5.9 — Climate Migration (heatmap + patterns + zone detail)
try:
    from routes.climate_migration import router as climate_migration_router
    app.include_router(climate_migration_router)
except Exception as _exc:
    logging.warning(f"[W5.9] climate_migration_router include failed: {_exc}")

# W5.17 — Virtual Staging (Replicate SDXL · 1-3 styles parallel · 30d cache)
try:
    from routes.virtual_staging import router as virtual_staging_router
    app.include_router(virtual_staging_router)
except Exception as _exc:
    logging.warning(f"[W5.17] virtual_staging_router include failed: {_exc}")

# W6.MOV.5 — Construction Quality Index (0-100 score · 4 dimensiones · cache 7d)
try:
    from routes.construction_quality import router as construction_quality_router
    app.include_router(construction_quality_router)
except Exception as _exc:
    logging.warning(f"[W6.MOV.5] construction_quality_router include failed: {_exc}")

# W6.MOV.3 — Reviews Residentes (Google Places + Foursquare + Atlas · sentiment LLM · cache 7d)
try:
    from routes.reviews_residents import router as reviews_residents_router
    app.include_router(reviews_residents_router)
except Exception as _exc:
    logging.warning(f"[W6.MOV.3] reviews_residents_router include failed: {_exc}")

# W6.MOV.2 — Gov Data MX (3 tracks · 6 API + 6 cron + admin upload · 8 endpoints)
try:
    from routes.gov_data_mx import router as gov_data_mx_router
    app.include_router(gov_data_mx_router)
except Exception as _exc:
    logging.warning(f"[W6.MOV.2] gov_data_mx_router include failed: {_exc}")

# W6.MOV.1 — SOC Franchise (Sistema Operación Certificado · scoring 5 dims · 4 levels)
try:
    from routes.soc_franchise import router as soc_franchise_router
    app.include_router(soc_franchise_router)
except Exception as _exc:
    logging.warning(f"[W6.MOV.1] soc_franchise_router include failed: {_exc}")

# W7.AS.6 — Reputation Monitor (Brand24-style · 4 sources · sentiment LLM · alerts)
try:
    from routes.reputation_monitor import router as reputation_monitor_router
    app.include_router(reputation_monitor_router)
except Exception as _exc:
    logging.warning(f"[W7.AS.6] reputation_monitor_router include failed: {_exc}")

# W7.AS.1 — Lead Enrichment (Clay-style waterfall · 4 connectors · cache 30d · cap diario)
try:
    from routes.lead_enrichment import router as lead_enrichment_router
    app.include_router(lead_enrichment_router)
except Exception as _exc:
    logging.warning(f"[W7.AS.1] lead_enrichment_router include failed: {_exc}")

# W5.10 — Social/Ads (Meta multi-tenant OAuth · STUB-aware · 9 endpoints)
try:
    from routes.social_ads import router as social_ads_router
    app.include_router(social_ads_router)
except Exception as _exc:
    logging.warning(f"[W5.10] social_ads_router include failed: {_exc}")

# W5.22 Z.4 — Video Standalone (reusa W5.16 bundle · queue robust + export pipeline)
try:
    from routes.video_standalone import router as video_standalone_router
    from video_standalone_engine import ensure_indexes as ensure_video_standalone_indexes
    app.include_router(video_standalone_router)
except Exception as _exc:
    logging.warning(f"[W5.22 Z.4] video_standalone_router include failed: {_exc}")
    ensure_video_standalone_indexes = None  # noqa: F811

# W6.AS.1 — Workflow Builder Visual (8 endpoints CRUD + toggle + test + runs)
try:
    from routes.workflows import router as workflows_router
    app.include_router(workflows_router)
except Exception as _exc:
    logging.warning(f"[W6.AS.1] workflows_router include failed: {_exc}")

# W6.MOV.4 — Marketing Distribution MCP (4 platforms · stub-aware · cache 24h)
try:
    from routes.marketing_mcp import router as marketing_mcp_router
    app.include_router(marketing_mcp_router)
except Exception as _exc:
    logging.warning(f"[W6.MOV.4] marketing_mcp_router include failed: {_exc}")

# W6.4 — Marketplace Templates (publish + clone + revenue + moderation · 11 endpoints)
try:
    from routes.marketplace_templates import router as marketplace_templates_router
    app.include_router(marketplace_templates_router)
except Exception as _exc:
    logging.warning(f"[W6.4] marketplace_templates_router include failed: {_exc}")

# W6.5 — Project Wizard duplication (3 endpoints · dev/superadmin)
try:
    from routes.project_wizard import router as project_wizard_router
    app.include_router(project_wizard_router)
except Exception as _exc:
    logging.warning(f"[W6.5] project_wizard_router include failed: {_exc}")

# W5.25 — Widget Embed Analytics (1 público tracking + 2 superadmin stats)
from routes.widget_embed_analytics import router as widget_embed_analytics_router
app.include_router(widget_embed_analytics_router)

# W5.16 — Social Cards Renderer (3 públicos PNG + 1 superadmin stats)
from routes.social_cards import router as social_cards_router
app.include_router(social_cards_router)

# W5.20 — External Insights Ingest (12 global sources · 4 endpoints + 2 crons)
from routes.external_insights import router as external_insights_router
app.include_router(external_insights_router)

# W5.22 Z.1 — Studio: Brand Kit + Listing Importer + Asset Library
from routes.studio_brand_kit import router as studio_brand_kit_router
from routes.studio_listing import router as studio_listing_router
from routes.studio_assets import router as studio_assets_router
from studio_brand_kit_engine import ensure_indexes as ensure_brand_kit_indexes
from studio_listing_importer import ensure_indexes as ensure_listing_indexes
from studio_feature_registry_z1 import register_z1_features
app.include_router(studio_brand_kit_router)
app.include_router(studio_listing_router)
app.include_router(studio_assets_router)
register_z1_features()

# W5.22 Z.2 — Studio: Buyer-angle Copy + Carrusel Auto + Auto-content + Hook Score + A/B
from routes.studio_buyer_copy import router as studio_buyer_copy_router
from routes.studio_carrusel import router as studio_carrusel_router
from routes.studio_auto_content import router as studio_auto_content_router
from studio_buyer_copy_engine import ensure_indexes as ensure_buyer_copy_indexes
from studio_carrusel_engine import ensure_indexes as ensure_carrusel_indexes
from studio_auto_content_cron import ensure_indexes as ensure_auto_content_indexes, register_auto_content_job
from studio_feature_registry_z2 import register_z2_features
app.include_router(studio_buyer_copy_router)
app.include_router(studio_carrusel_router)
app.include_router(studio_auto_content_router)
register_z2_features()

# W5.22 Z.8 — Studio: Landing Pages Profesionales (10 templates + A/B + PDF brochure)
from routes.studio_landing import (
    router as studio_landing_router,
    public_router as studio_landing_public_router,
)
from studio_landing_engine import ensure_indexes as ensure_studio_landing_indexes
from studio_feature_registry_z8 import register_z8_features
app.include_router(studio_landing_router)
app.include_router(studio_landing_public_router)
register_z8_features()

# W5.22 Z.8.7 Sub-B1 — Studio Property Intake (PropertyIntake schema + copy generator LLM)
from routes.studio_property_intake import router as studio_property_intake_router
app.include_router(studio_property_intake_router)

# W2.5 SA6 — Granular Metrics Cube UI (city → alcaldia → colonia → development → unit)
from routes.superadmin_metrics_cube import router as superadmin_metrics_cube_router
from metrics_cube_aggregations import ensure_indexes as ensure_metrics_cube_indexes
app.include_router(superadmin_metrics_cube_router)

# W2.8 Phase Z.1 — Consolidated OLAP cube (cross-cut + cache + backfill)
from cube_olap_engine import ensure_consolidated_indexes as ensure_cube_consolidated_indexes

# W2.6 SA8 — Founder Console (executive dashboard + Cmd+K + anomalies)
from routes.superadmin_founder_console import router as superadmin_founder_console_router
from anomaly_detection_engine import ensure_indexes as ensure_founder_anomaly_indexes
app.include_router(superadmin_founder_console_router)

# W2.7 Phase Z.0 — Data Lake (time-series facts + ETL + model validation)
from routes.superadmin_data_lake import router as superadmin_data_lake_router
from data_lake_etl import (
    ensure_facts_indexes as ensure_data_lake_indexes,
    seed_dim_zones as seed_data_lake_dim_zones,
)
app.include_router(superadmin_data_lake_router)

# W2.9 Phase Z.2 — Superadmin Intelligence Hub (executive bird's-eye)
from routes.superadmin_intelligence_hub import router as superadmin_intelligence_hub_router
from intelligence_insights_engine import ensure_indexes as ensure_intelligence_indexes
app.include_router(superadmin_intelligence_hub_router)

# W3.1A Phase 5 Foundation — DENUE + Construction Cost + Zone Score
from routes.phase5_foundation import router as phase5_router, pub_router as phase5_pub_router
from osm_engine import ensure_indexes as ensure_denue_indexes  # DENUE muerto → OSM
from construction_cost_engine import ensure_indexes as ensure_cost_indexes
from zone_score_engine import ensure_indexes as ensure_zone_score_indexes
app.include_router(phase5_router)
app.include_router(phase5_pub_router)

# W3.2 ZZ.2 Transaction Network
from routes.transaction_network import router as txn_network_router
from transaction_network_engine import ensure_indexes as ensure_txn_indexes
app.include_router(txn_network_router)

# W3.3 ZZ.3 — DRPI + Bulletins + Investment Explorer
from routes.drpi import router as drpi_router
from routes.bulletins import router as bulletins_router
from routes.investment_explorer import router as investment_explorer_router
from drpi_engine import ensure_indexes as ensure_drpi_indexes
from hedonic_regression_engine import ensure_indexes as ensure_hedonic_indexes
from bulletins_engine import ensure_indexes as ensure_bulletins_indexes
app.include_router(drpi_router)
app.include_router(bulletins_router)
app.include_router(investment_explorer_router)

# I04 — Índices DMX (IPV/IAB/IDS/IRE/ICO + maestro IDM · composites licenciables)
from routes.dmx_indices import router as dmx_indices_router
app.include_router(dmx_indices_router)

# A12+A07 — ¿Es Buena Compra? (precio justo + buen momento · comprador · reusa AVM+ciclo+índices)
from routes.buy_signal import router as buy_signal_router
app.include_router(buy_signal_router)

# W3.4A ZZ.4 — Fraud Detection + Risk Score V1 (SESNSP)
from routes.fraud_detection import router as fraud_router
from routes.risk_score import router as risk_score_router
from fraud_detection_engine import ensure_indexes as ensure_fraud_indexes
from crime_data_engine import ensure_indexes as ensure_crime_indexes
from risk_score_engine import ensure_indexes as ensure_risk_indexes
app.include_router(fraud_router)
app.include_router(risk_score_router)

# W3.4B ZZ.4 — Risk V2 multi-source + Risk Alerts
from routes.risk_alerts import router as risk_alerts_router
from natural_risk_engine import ensure_indexes as ensure_natural_indexes
from perception_risk_engine import ensure_indexes as ensure_perception_indexes
app.include_router(risk_alerts_router)
# Watchlist de alertas de riesgo (opt-in público) — el router existía pero nunca se
# montó → el formulario público daba 404 y las alertas por email estaban muertas. Conectado.
from routes.watchlist import router as watchlist_router, ensure_indexes as ensure_watchlist_indexes
app.include_router(watchlist_router)

# W3.5 — Public API v1 + Stripe Billing
from routes.public_api_v1 import router as public_api_v1_router
from public_api_auth import ensure_indexes as ensure_public_api_indexes
from stripe_billing_engine import ensure_indexes as ensure_stripe_indexes
app.include_router(public_api_v1_router)

# W3.6 — Vertical Data Products + Data Licensing Bundles (Phase Z.4)
from routes.vertical_products import router as vertical_products_router
from routes.data_licensing import router as data_licensing_router
from vertical_products_engine import ensure_indexes as ensure_vertical_products_indexes
app.include_router(vertical_products_router)
app.include_router(data_licensing_router)

# W3.7 — Phase Z.5 Anonymization + Compliance (LFPDPPP)
from routes.compliance import router as compliance_router
from compliance_engine import ensure_compliance_indexes
app.include_router(compliance_router)

# W3.8 — Cross-sell Intelligence
from routes.cross_sell import router as cross_sell_router
from routes.partners import router as partners_router
from cross_sell_engine import ensure_indexes as ensure_cross_sell_indexes
app.include_router(cross_sell_router)
app.include_router(partners_router)

# Phase 4 Batch 1 — Dev Portal Foundation
from routes.dev_batch1 import router as dev_batch1_router, ensure_dev_batch1_indexes
app.include_router(dev_batch1_router)

# Phase 4 Batch 2 — Dashboards + IE + Construcción + Mapbox tab
from routes.dev_batch2 import router as dev_batch2_router, ensure_dev_batch2_indexes
app.include_router(dev_batch2_router)

# Phase 4 Batch 3 — Internal users login + GeoJSON export
from routes.dev_batch3 import router as dev_batch3_router, ensure_dev_batch3_indexes
app.include_router(dev_batch3_router)

# Phase 4 Batch 4 — Sales / CRM core (leads pipeline + project_brokers)
from routes.dev_batch4 import router as dev_batch4_router, ensure_dev_batch4_indexes
app.include_router(dev_batch4_router)

# Phase 4 Batch 4.1 — Cita Registration + DMX Inmobiliaria + Anti-fraude
from routes.dev_batch4_1 import router as dev_batch4_1_router, ensure_batch4_1_indexes, seed_dmx_inmobiliaria
app.include_router(dev_batch4_1_router)

# W5.11 Parte 3 — Dispute resolution + cooldown 90d
from routes.disputes import router as disputes_router, ensure_disputes_indexes
app.include_router(disputes_router)

# W5.12 Parte 1 — Knowledge Graph (Neo4j)
from routes.knowledge_graph import router as kg_router
app.include_router(kg_router)

# W5.5 Parte 1 — Live Pulse + Readiness + cron configurable
from routes.live_pulse import router as live_pulse_router
app.include_router(live_pulse_router)

# W5.15 Parte 1 — Accuracy / FSD per-property / drift / weights
from routes.accuracy import router as accuracy_router
app.include_router(accuracy_router)

# W5.19 — Probability UX (Kalshi-inspired)
from probability_engine import router as probability_router
app.include_router(probability_router)

# W5.23 — Battle Card (Competitive Intelligence T3)
from routes.battle_card import router as battle_card_router
app.include_router(battle_card_router)

# Phase 4 Batch 4.2 — Universal LeadKanban + client_id + Permission Tiers
from routes.dev_batch4_2 import router as dev_batch4_2_router, ensure_batch4_2_indexes
app.include_router(dev_batch4_2_router)

# Phase 4 Batch 4.3 — Reminders + Magic Link + Auto-Progression
from routes.dev_batch4_3 import router as dev_batch4_3_router, ensure_batch4_3_indexes, register_batch4_3_jobs
# W4.17 — Notifications must be registered BEFORE batch4_3 to take routing priority
from routes.notifications import router as notifications_router_priority
app.include_router(notifications_router_priority)
app.include_router(dev_batch4_3_router)

# Phase 4 Batch 4.4 — AI Engine + Analytics
from routes.dev_batch4_4 import router as dev_batch4_4_router, ensure_batch4_4_indexes, register_batch4_4_jobs
app.include_router(dev_batch4_4_router)

# Phase 4 Batch 5 — Dynamic Pricing A/B + Branded PDF Reports
from routes.dev_batch5 import router as dev_batch5_router, ensure_batch5_indexes, register_batch5_jobs
app.include_router(dev_batch5_router)

# Phase 4 Batch 6 — Demand Heatmap + Engagement Analytics
from routes.dev_batch6 import router as dev_batch6_router, ensure_batch6_indexes
app.include_router(dev_batch6_router)

# Phase 4 Batch 7 — Site Selection AI Standalone
from routes.dev_batch7 import router as dev_batch7_router, ensure_batch7_indexes
app.include_router(dev_batch7_router)

# Phase 4 Batch 7.2 — INEGI Real Demographics
from routes.dev_batch7_2 import router as dev_batch7_2_router, ensure_batch7_2_indexes
app.include_router(dev_batch7_2_router)

# Phase 4 Batch 8 — Cash Flow Forecast IA
from routes.dev_batch11 import router as dev_batch11_router, ensure_batch11_indexes
app.include_router(dev_batch11_router)

from routes.dev_batch10 import router as dev_batch10_router, ensure_batch10_indexes
app.include_router(dev_batch10_router)

from routes.location_intel import router as location_intel_router, ensure_location_intel_indexes
app.include_router(location_intel_router)

from routes.dev_sales_intel import router as dev_sales_intel_router, ensure_sales_intel_indexes
app.include_router(dev_sales_intel_router)

from routes.dev_insights_intel import router as dev_insights_intel_router, ensure_insights_intel_indexes
app.include_router(dev_insights_intel_router)

from routes.dev_amenity_intel import router as dev_amenity_intel_router, ensure_amenity_intel_indexes
app.include_router(dev_amenity_intel_router)

from routes.dev_broker_intel import router as dev_broker_intel_router, ensure_broker_intel_indexes
app.include_router(dev_broker_intel_router)

from routes.dev_price_history import router as dev_price_history_router, ensure_price_history_indexes
app.include_router(dev_price_history_router)

from routes.dev_channel_intel import router as dev_channel_intel_router, ensure_channel_intel_indexes
app.include_router(dev_channel_intel_router)

from routes.dev_project_full import router as dev_project_full_router, ensure_project_full_indexes
from dev_scale_indexes import ensure_dev_scale_indexes  # C1 Escala — índices faltantes del portal Dev
app.include_router(dev_project_full_router)

from routes.asesor_playbook import router as asesor_playbook_router  # B3.1 · playbook dev→asesor
app.include_router(asesor_playbook_router)

from routes.superadmin_catalog_pulse import router as superadmin_catalog_pulse_router  # B3.2 · pulso del catálogo
app.include_router(superadmin_catalog_pulse_router)

from routes.superadmin_devmaster import router as superadmin_devmaster_router  # Portal Dev-Master
app.include_router(superadmin_devmaster_router)

# Fase 3.2 · lente del dev sobre el cubo (benchmark anónimo + amenity ranker + demand-gap)
from routes.dev_market import router as dev_market_router
app.include_router(dev_market_router)

# Cierra ciclo comprador→inmobiliaria DMX · pool de leads de marketplace (dmx_house · regla
# inviolable: leads sin asesor NO van al dev, van a mi inmobiliaria) · superadmin ve + asesor trabaja
from routes.house_leads import router as house_leads_router
app.include_router(house_leads_router)

# F1.2 · Motor de Valor Residual del Terreno ("¿cuánto pago por este terreno?")
from routes.dev_valor_residual import router as dev_valor_residual_router
app.include_router(dev_valor_residual_router)

# F1.1 · Doctrina de Datos (origen de cada número · cross-portal)
from routes.data_doctrine import router as data_doctrine_router
app.include_router(data_doctrine_router)

# F2.1 · El Grafo del Comprador (lado demanda del Modelo del Mundo · cross-portal)
from routes.grafo_comprador import router as grafo_comprador_router
app.include_router(grafo_comprador_router)

# F2.2 · El Generador de Producto ("qué construir" calibrado por demanda · dev)
from routes.generador_producto import router as generador_producto_router
app.include_router(generador_producto_router)

# F2.4 · Demanda Demográfica (modelo EPRAV · demanda potencial sin búsquedas · dev/superadmin)
from routes.demanda_demografica import router as demanda_demografica_router
app.include_router(demanda_demografica_router)

# F2.5 · El Cerebro del Mercado (loop causal predicción↔realidad · panel superadmin)
from routes.cerebro_mercado import router as cerebro_mercado_router
app.include_router(cerebro_mercado_router)

# F2.6 · El Estudio de Mercado Vivo (entregable auto-generado · dev/superadmin)
from routes.estudio_mercado import router as estudio_mercado_router
app.include_router(estudio_mercado_router)

# F2.12 · La Terminal de Mercado CDMX (data utility vendible, k-anónimo)
from routes.terminal_mercado import router as terminal_mercado_router
app.include_router(terminal_mercado_router)

# Fase 3.3 · lente del asesor sobre el cubo (inteligencia de mercado para su pitch)
from routes.asesor_market import router as asesor_market_router
app.include_router(asesor_market_router)

from routes.dev_batch8 import (router as dev_batch8_router, ensure_batch8_indexes,
                              daily_active_projects_recalc)
app.include_router(dev_batch8_router)

# Phase 4 Batch 0 — Auth routes (extracted from server.py)
from routes.auth import router as auth_router
app.include_router(auth_router)

# Phase 4 Batch 0 — Public marketplace routes (extracted from server.py)
from routes.public import (router as public_router, _dev_overlay_cache)
app.include_router(public_router)

from routes.picks import router as picks_router   # DMX Picks IA (el moat: track record datado)
app.include_router(picks_router)

# Phase 4 Batch 0 — User Preferences + Universal Search
from routes.search_prefs import (router as search_prefs_router,
                                  ensure_preferences_indexes)
app.include_router(search_prefs_router)

# Phase 4 Batch 0 — AI Budget tracking
from ai_budget import router as ai_budget_router, ensure_ai_budget_indexes
from ai_quota_engine import ensure_user_quota_indexes
app.include_router(ai_budget_router)

# Phase 4 Batch 0 Sub-chunk C — Badge counters
from routes.badges import router as badges_router
app.include_router(badges_router)

# Phase 4 Batch 0.5 — Diagnostic Engine + Observability
from routes.diagnostic import (router as diagnostic_router,
                                register_diagnostic_jobs)
from diagnostic_engine import ensure_diagnostic_indexes
app.include_router(diagnostic_router)

# W4.1C — Recommendations banner backend
from routes.recommendations import router as recommendations_router
app.include_router(recommendations_router)

# W4.1D — Comparable alerts
from routes.comparable_alerts import router as comparable_alerts_router
app.include_router(comparable_alerts_router)

# W4.2A — MCP server (Model Context Protocol HTTP interface)
from mcp_server import router as mcp_router, ensure_mcp_indexes
app.include_router(mcp_router, prefix="/api/mcp")

# W4.2B — SEO/GEO static files (NO /api prefix — llms.txt, sitemap.xml, ai-plugin.json)
# NOTE: in this Kubernetes environment, non-/api paths go to the React frontend.
# Static files are served from frontend/public/ for the canonical paths.
# This backend router provides /api/seo/* mirror for API clients.
from routes.seo_files import router as seo_router
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
from routes.public_zones import router as public_zones_router
app.include_router(public_zones_router)

# W4.2D3 — Programmatic SEO Tier 1+2 (40 colonias + 16 alcaldías + 5 intents + lead capture)
from routes.landings import (
    router as landings_router,
    sa_router as landings_sa_router,
    ensure_landing_indexes,
)
app.include_router(landings_router)
app.include_router(landings_sa_router)

# W4.2.5 — Embeddable widgets + Press kit live stats (CORS open)
from routes.widgets import router as widgets_router
from routes.press import router as press_router
app.include_router(widgets_router)
app.include_router(press_router)
try:
    from seo_combos_seed import seed_landings_in_sitemap as _seed_landings_import
except ImportError:
    _seed_landings_import = None

# W4.3 — Phase Y.0 Foundation + Behavioral Tracking
from routes.phase_y_controls import router as phase_y_router, ensure_indexes as ensure_phase_y_indexes
from routes.behavioral import router as behavioral_router, sa_router as behavioral_sa_router
from behavioral_tracking_engine import ensure_indexes as ensure_behavioral_indexes
app.include_router(phase_y_router)
app.include_router(behavioral_router)
app.include_router(behavioral_sa_router)

# W4.4 — Phase Y.1A · Director Agent
from routes.director import router as director_router, sa_router as director_sa_router
from director_agent_engine import ensure_indexes as ensure_director_indexes
app.include_router(director_router)
app.include_router(director_sa_router)

# W4.4B — Phase Y.1B · Director Memory Layer
from routes.director_memory import router as director_memory_router, sa_router as director_memory_sa_router
from director_memory_engine import ensure_indexes as ensure_memory_indexes
app.include_router(director_memory_router)
app.include_router(director_memory_sa_router)

# W4.4D — Phase Y.1D · What-if Simulator
from routes.whatif import router as whatif_router, sa_router as whatif_sa_router
from whatif_engine import ensure_indexes as ensure_whatif_indexes
app.include_router(whatif_router)
app.include_router(whatif_sa_router)

# W4.4E — Phase Y.1E · Asistente público comprador
from routes.asistente import router as asistente_router, sa_router as asistente_sa_router
from asistente_engine import ensure_indexes as ensure_asistente_indexes
app.include_router(asistente_router)
app.include_router(asistente_sa_router)

# W7.AS.3.A — Conversation AI Agent (GHL-style) · Core engine + 4 channel adapters
from routes.conversation import router as conversation_router, sa_router as conversation_sa_router
from conversation_engine import ensure_indexes as ensure_conversation_indexes
app.include_router(conversation_router)
app.include_router(conversation_sa_router)

# W7.AS.3.D — Round 2 · KB Gaps (superadmin-only · detect "no supe responder")
from routes.conversation_kb_gaps import (
    router as kb_gaps_router,
    ensure_indexes as ensure_kb_gaps_indexes,
)
app.include_router(kb_gaps_router)

# W7.AS.3.F — Round 2 · Conversation Cost Optimizer router (Terminal F · opcional)
# Defensive: si el módulo de Terminal F aún no está mergeado, NO romper el server.
try:
    from routes.conversation_cost import router as conversation_cost_router  # type: ignore
    app.include_router(conversation_cost_router)
    logging.info("[W7.AS.3.F] conversation cost router wired")
except Exception as _e_cost:
    logging.info(f"[W7.AS.3.F] conversation cost router pending (Terminal F): {_e_cost}")

# W7.AS.3.G — Round 3 · A/B Testing routes (cierra orphan conversation_ab_testing)
from routes.conversation_ab_testing import (
    router as conversation_ab_router,
    ensure_indexes as ensure_conversation_ab_indexes,
)
app.include_router(conversation_ab_router)

# W7.AS.3.H — Round 3 · Confidence Score routes (owner history + superadmin stats)
try:
    from routes.conversation_confidence import (
        router as conversation_confidence_router,
        sa_router as conversation_confidence_sa_router,
        ensure_indexes as ensure_confidence_indexes,
    )
    app.include_router(conversation_confidence_router)
    app.include_router(conversation_confidence_sa_router)
    logging.info("[W7.AS.3.H] conversation confidence routers wired")
except Exception as _e_conf:
    logging.info(f"[W7.AS.3.H] conversation confidence routers pending: {_e_conf}")

# W7.AS.3.I — Round 3 · Drift Dashboard routes (cierra orphan conversation_drift_detector)
ensure_conversation_drift_indexes = None
try:
    from routes.conversation_drift import (
        router as conversation_drift_router,
        ensure_indexes as ensure_conversation_drift_indexes,
    )
    app.include_router(conversation_drift_router)
    logging.info("[W7.AS.3.I] conversation drift router wired")
except Exception as _e_drift:
    logging.info(f"[W7.AS.3.I] conversation drift router pending: {_e_drift}")

# W4.5 Y.2A — Pricing Sub-Agent
from routes.subagents import router as subagents_router, sa_router as subagents_sa_router
from sub_agents.pricing_agent import ensure_pricing_indexes
from sub_agents.marketing_agent import ensure_marketing_indexes
from sub_agents.lead_agent import ensure_lead_indexes
app.include_router(subagents_router)
app.include_router(subagents_sa_router)

# W4.18.1 — Apify Google Trends Integration
from routes.trends import router as trends_router
from apify_trends_engine import ensure_trends_indexes
app.include_router(trends_router)

# W4.6 Y.3A — Agentic CRM · Smart Routing
from routes.agentic_crm import router as agentic_crm_router
from agentic_crm.smart_routing_engine import ensure_routing_indexes
from agentic_crm.visit_prep_engine import ensure_visit_prep_indexes as ensure_visit_prep_dossier_indexes
from agentic_crm.reply_classifier_engine import ensure_reply_indexes
from agentic_crm.disc_inferencer_engine import ensure_disc_indexes as ensure_disc_inferencer_indexes
from lead_nurture_engine import ensure_nurture_sequences_indexes
app.include_router(agentic_crm_router)

# W4.7 Y.4A — Atlax Persona per-tenant
from routes.atlax_persona import router as atlax_persona_router
from atlax_persona_engine import ensure_indexes as ensure_atlax_persona_indexes
app.include_router(atlax_persona_router)

# Phase 4 Batch 12 — Wizard 7 pasos + IA upload + Drive
from routes.wizard import (router as wizard_router, ensure_wizard_indexes)
app.include_router(wizard_router)

# Phase 4 Batch 13 — Tracking attribution + Cross-portal sync
from routes.b13 import (router as b13_router, ensure_b13_indexes)
app.include_router(b13_router)
# Cerebro DMX · Etapa 3 — API de la Sala de Control (multi-perfil · gated CEREBRO_ENABLED)
from routes.cerebro import router as cerebro_router
app.include_router(cerebro_router)

# Phase 4 Batch 14 — Health Score + Activity Feed + Notifications + Weekly Brief
from routes.dev_batch14 import (router as dev_batch14_router, ensure_batch14_indexes)
from health_score import ensure_health_score_indexes
app.include_router(dev_batch14_router)

# Phase 4 Batch 15 — Multi-broker Calendar (Google OAuth + Availability + Auto-assign)
from routes.dev_batch15 import (router as dev_batch15_router, ensure_batch15_indexes)
from oauth_calendar import ensure_oauth_indexes
app.include_router(dev_batch15_router)

# Phase 4 Batch 16 — AI Suggestions Inline + Public Booking Page
from ai_suggestions import (router as ai_suggestions_router,
                             ensure_ai_suggestions_indexes)
from routes.dev_batch16 import router as dev_batch16_public_router
app.include_router(ai_suggestions_router)
app.include_router(dev_batch16_public_router)

# Phase 4 Batch 17 — Inline edit + Undo + Filter presets + Reorder
from routes.dev_batch17 import (router as dev_batch17_router,
                                  ensure_batch17_indexes,
                                  purge_expired_undo_log)
app.include_router(dev_batch17_router)

# Phase 4 Batch 18 Sub-A — Density toggle + Project Switcher preferences
from routes.dev_batch18 import (router as dev_batch18_router,
                                  ensure_batch18_indexes)
app.include_router(dev_batch18_router)

# Phase 4 Batch 19 — Tours + Branding + Cross-portal + Presentation Mode
from routes.dev_batch19 import (router as dev_batch19_router,
                                 ensure_batch19_indexes)
app.include_router(dev_batch19_router)

# Phase 4 Batch 21 Sub-A — Tour Completion Analytics
from routes.tour_analytics import (router as tour_analytics_router,
                                    ensure_batch21_indexes)
app.include_router(tour_analytics_router)

# Phase 4 Batch 18 Sub-B — Floor plan routes
from routes.floor_view import (router as floor_view_router,
                                ensure_floor_view_indexes)
app.include_router(floor_view_router)

# Phase 4 Batch 21 Sub-B/C — Team Productivity + Aggregated Metrics
from routes.team_productivity import router as team_productivity_router
from routes.team_aggregated import router as team_aggregated_router
app.include_router(team_productivity_router)
app.include_router(team_aggregated_router)

# Phase 4 Batch 20 — Asesor metrics + Tracking links + Funnel/Sankey
from routes.asesor_metrics import (router as asesor_metrics_router,
                                     ensure_asesor_metrics_indexes)
from routes.tracking_links import (router as tracking_links_router,
                                     ensure_tracking_links_indexes)
from routes.funnel import (router as funnel_router, ensure_funnel_indexes)
from routes.insights import router as insights_router
from routes.copilot import router as copilot_router, ensure_indexes as ensure_copilot_indexes
from scheduler_asesor_snapshots import schedule_daily_snapshots
app.include_router(asesor_metrics_router)
app.include_router(tracking_links_router)
app.include_router(funnel_router)
app.include_router(insights_router)
app.include_router(copilot_router)

# W5.22 Z.5 — Hook Predictor standalone (4-dim scoring + cache + stats)
# D.61b audit fix · wrap try/except como AS.6/AS.1 patrón fail-soft (evita server crash si módulo roto)
try:
    from routes.hook_predictor import router as hook_predictor_router
    from hook_predictor_engine import ensure_indexes as ensure_hook_predictor_indexes
    app.include_router(hook_predictor_router)
except Exception as _exc:
    logging.warning(f"[W5.22 Z.5] hook_predictor_router include failed: {_exc}")
    ensure_hook_predictor_indexes = None  # noqa: F811

# Phase 4 Batch 24 — Marketplace Map Intelligence + Image Search
from routes.marketplace_map import router as marketplace_map_router
from routes.marketplace_search import router as marketplace_search_router
app.include_router(marketplace_map_router)
app.include_router(marketplace_search_router)

# Phase 4 Batch 25 — External Search + Saved Searches
from routes.external_search import router as external_search_router
app.include_router(external_search_router)

# Phase 4 Batch 26 — Marketplace Lead-Capture Tools (Reporte + Quiz + Comparador)
from routes.marketplace_lead_tools import router as marketplace_lead_tools_router
app.include_router(marketplace_lead_tools_router)

# Phase 4 Batch 27 — Mortgage Calculator + Colonia History + Share-link OG
from routes.marketplace_calculator import router as marketplace_calc_router
from routes.share_meta import router as share_meta_router
app.include_router(marketplace_calc_router)
app.include_router(share_meta_router)

# Phase 4 Batch 28 — Portal Comprador (autenticado)
from routes.comprador import router as comprador_router
app.include_router(comprador_router)

# Phase 4 Batch 29 — Comprador Engagement (Alertas + Chat + Comparador Premium)
from routes.buyer_alerts import router as buyer_alerts_router
from routes.chat import router as chat_router
from routes.comprador_compare import router as comprador_compare_router
app.include_router(buyer_alerts_router)
app.include_router(chat_router)
app.include_router(comprador_compare_router)

# Phase 4 Batch 30 — Wrapped + Smart Match
from routes.wrapped import router as wrapped_router
app.include_router(wrapped_router)

# Phase 3 Batch 31 — Asesor Tools (Briefing Tráfico + Clima + Argumentario RAG)
from routes.briefing_traffic import router as briefing_traffic_router
from routes.argumentario import router as argumentario_router
app.include_router(briefing_traffic_router)
app.include_router(argumentario_router)

# W4.8 Y.5 — Observability + Replay Debugger + AI ROI per-Dev
from routes.observability import router as observability_router
app.include_router(observability_router)

# W4.18 — Data Sources gov MX bundle (6 fuentes oficiales)
from routes.data_sources import router as data_sources_router
app.include_router(data_sources_router)

# W4.10 — WhatsApp Business + Newsletter Pulse + Voice Atlax
from routes.whatsapp import router as whatsapp_router
from whatsapp_engine import ensure_whatsapp_indexes
from routes.newsletter import router as newsletter_router
from newsletter_pulse_engine import ensure_newsletter_indexes
from routes.voice import router as voice_router
from voice_atlax_engine import ensure_voice_indexes
app.include_router(whatsapp_router)
app.include_router(newsletter_router)
app.include_router(voice_router)

# W4.18.2A — Mapa Cerebro Espacial DMX
from routes.maps import router as maps_router
from maps_engine import ensure_maps_indexes
app.include_router(maps_router)

# W4.18.2B — Maps Cross-features (funnel inverso · match catastro · saved zones · battle card)
from routes.maps_cross import router as maps_cross_router
from maps_cross_engine import ensure_maps_cross_indexes
app.include_router(maps_cross_router)

# W4.18.2B Sub-D — AVM público + Colonia stats
from routes.avm_public import router as avm_public_router
app.include_router(avm_public_router)

# Copiloto de Compra · Etapa 1 — Perfilador → recomendación estructurada (sin LLM)
try:
    from routes.perfil_recomendar import router as perfil_router
    app.include_router(perfil_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] perfil_recomendar include failed: {_exc}")

# Copiloto · espinazo de señales del comprador (8 capas · visitor_id)
try:
    from routes.buyer_signals import router as buyer_signals_router
    app.include_router(buyer_signals_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] buyer_signals include failed: {_exc}")

# Copiloto · E4 casamentera proactiva (búsqueda guardada × inventario → alerta comprador + asesor)
try:
    from routes.casamentera import router as casamentera_router
    app.include_router(casamentera_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] casamentera include failed: {_exc}")

# Copiloto · inteligencia superadmin (el CUBO del ciclo del comprador · Bloomberg CDMX)
try:
    from routes.superadmin_copiloto import router as sa_copiloto_router
    app.include_router(sa_copiloto_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] superadmin_copiloto include failed: {_exc}")

# Copiloto · E7 flywheel (cierre captura el viaje completo → entrena AVM/recs/lookalike · capa H)
try:
    from routes.copiloto_flywheel import router as flywheel_router
    app.include_router(flywheel_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] flywheel include failed: {_exc}")

try:
    from routes.favoritos import router as favoritos_router
    app.include_router(favoritos_router)
except Exception as _exc:  # noqa: BLE001
    logging.warning(f"[copiloto] favoritos include failed: {_exc}")

# Fase 3.4 · lente del comprador — inteligencia de mercado pública (cubo anónimo)
from routes.public_market import router as public_market_router
app.include_router(public_market_router)

# W5.1 — AVM accuracy superadmin dashboard
from routes.avm_accuracy import router as avm_accuracy_router
app.include_router(avm_accuracy_router)

# W5.2 — SEO landings temáticas (/cdmx/top-*). El router zones_public (sub-scores /api/zones-public) se retiró:
# quedó huérfano tras el rediseño de la página de zona (la ficha /zona usa /api/zona/*). Sin consumidores front ni back.
from routes.seo_themed import router as seo_themed_router
app.include_router(seo_themed_router)
logging.info("[w5.2] seo-themed router mounted")

# W5.3 Parte 1 — Forecast multi-horizonte (ARIMA)
from routes.forecast_public import router as forecast_public_router
app.include_router(forecast_public_router)
logging.info("[w5.3] forecast-public router mounted")

# W5.3 Parte 2A — Forecast accuracy dashboard (superadmin)
from routes.forecast_accuracy import router as forecast_accuracy_router
app.include_router(forecast_accuracy_router)
logging.info("[w5.3.p2a] forecast-accuracy router mounted")

# W5.15 wire — FSD per-property accuracy (superadmin)
try:
    from routes.fsd import router as fsd_router
    app.include_router(fsd_router)
    logging.info("[w5.15] fsd accuracy router mounted")
except Exception as e:
    logging.warning(f"[w5.15] fsd router mount failed: {e}")

# W5.16-A — Studio Video bundle (TTS + auto-script + cost gating)
try:
    from routes.studio_video import router as studio_video_router
    app.include_router(studio_video_router)
    logging.info("[w5.16] studio_video router mounted")
except Exception as e:
    logging.warning(f"[w5.16] studio_video router mount failed: {e}")

# W4.18.3 — Private Beta Gate (invite codes + waitlist)
from routes.private_beta import router as private_beta_router
from private_beta_engine import ensure_private_beta_indexes, is_private_beta_mode
app.include_router(private_beta_router)

# W4.13.A — Lead Journey Outbound asesor→dev
from routes.lead_journey import router as lead_journey_router
from lead_journey_engine import ensure_lead_journey_indexes
app.include_router(lead_journey_router)

# W4.17 — Smart Notifications Engine (router registered early at line ~280 for routing priority)
from notifications_engine import ensure_notifications_indexes

# W4.14 — Buyer Coach + Investment Simulator
from routes.buyer_coach import router as buyer_coach_router
from buyer_coach_engine import ensure_buyer_coach_indexes
app.include_router(buyer_coach_router)

from routes.investment_simulator import router as investment_sim_router
app.include_router(investment_sim_router)

# W4.9 — Studio Brochure (PDF + 4 social variants + custom upload)
from routes.brochure import router as brochure_router
from brochure_engine import ensure_brochure_indexes as ensure_brochure_indexes_fn
app.include_router(brochure_router)

# W4.9.6 — 3D Gaussian Splatting Tour
from routes.tour_3dgs import router as tour_3dgs_router
from tour_3dgs_engine import ensure_tour_3dgs_indexes as ensure_tour_3dgs_indexes_fn
app.include_router(tour_3dgs_router)

# W4.16 — Marketing (Free Audit + State of CDMX + MCP Distribution)
from routes.free_audit import router as free_audit_router
from free_audit_engine import ensure_free_audit_indexes as ensure_free_audit_indexes_fn
app.include_router(free_audit_router)
from routes.state_of_cdmx import router as state_of_cdmx_router
from state_of_cdmx_engine import ensure_state_of_cdmx_indexes as ensure_state_of_cdmx_indexes_fn
app.include_router(state_of_cdmx_router)
from routes.mcp_distribution import router as mcp_distribution_router
from mcp_distribution_engine import ensure_mcp_distribution_indexes as ensure_mcp_distribution_indexes_fn
app.include_router(mcp_distribution_router)

# F0.1 — Score Inversión DMX
from routes.score_inversion import router as score_inversion_router
from score_inversion_engine import ensure_score_inversion_indexes as ensure_score_inversion_indexes_fn
app.include_router(score_inversion_router)


@app.middleware("http")
async def private_beta_signup_gate(request, call_next):
    """W4.18.3 — Bloquea /api/auth/register cuando PRIVATE_BETA_MODE=true.
    El signup broker (con invite code) sigue funcionando vía /api/auth/signup-broker.
    Login y todos los demás endpoints siguen normales.
    """
    try:
        if (
            is_private_beta_mode()
            and request.method == "POST"
            and request.url.path == "/api/auth/register"
        ):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={
                    "code": "private_beta",
                    "message": "Próximamente · únete a la waitlist o usa código de invitación broker.",
                    "broker_portal": "/broker-portal",
                },
            )
    except Exception:
        pass
    return await call_next(request)


@app.middleware("http")
async def security_headers(request, call_next):
    """P1.13 · Cabeceras de seguridad en toda respuesta (antes solo había CORS).
    HSTS solo en prod (requiere HTTPS). CSP estricta SOLO en respuestas JSON de API
    (no toca HTML/archivos para no romper Swagger ni descargas)."""
    resp = await call_next(request)
    try:
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(self), microphone=(), camera=()")
        if _is_prod():
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if "application/json" in (resp.headers.get("content-type") or ""):
            resp.headers.setdefault("Content-Security-Policy",
                                    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        # Anti-scraping (regla Fable5 #16): la API JSON no debe indexarse ni alimentar
        # crawlers de IA. Los archivos SEO (/llms.txt, /sitemap.xml) van en la raíz, no en /api.
        if request.url.path.startswith("/api/"):
            resp.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
    except Exception:
        pass
    return resp


# ─── CSRF-01 · Defensa CSRF para mutaciones con auth por COOKIE ────────────────
# Cookies SameSite=None (cross-site) + sin token anti-CSRF → cualquier sitio puede
# disparar POST/PUT/PATCH/DELETE contra nuestra API y el browser adjunta la cookie
# de sesión (p.ej. /asesor/autopilot/pause, PATCH unit-status con Origin malicioso).
# Defensa de menor riesgo (no rompe API/tests con Bearer): en métodos MUTANTES cuya
# auth viene de COOKIE, exigimos que Origin/Referer pertenezca a un host propio.
#   · Bearer  → FAIL-OPEN (API/tests usan Authorization, no cookie → no son CSRF).
#   · GET/HEAD/OPTIONS → ignorados (no mutan).
#   · Sin cookie de sesión → ignorado (no hay nada que falsificar).
#   · Sin Origin NI Referer → FAIL-OPEN (clientes no-browser con cookie; el CSRF de
#     browser SIEMPRE manda Origin en mutaciones cross-site).
#   · Cookie + mutación + Origin/Referer EXTERNO → 403 (fail-closed, único caso).
import urllib.parse as _urlparse

# Orígenes permitidos extra (coma-separados). Por defecto reusa CORS_ORIGINS; este
# env existe por si se quiere una lista distinta para CSRF sin tocar CORS.
_CSRF_EXTRA_ORIGINS = {
    o.strip().lower().rstrip("/")
    for o in os.environ.get("CSRF_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
}
_CSRF_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _csrf_host_of(value: str) -> str:
    """netloc (host[:port]) en minúsculas de un Origin/Referer. '' si no parsea."""
    try:
        return (_urlparse.urlsplit(value).netloc or "").lower()
    except Exception:
        return ""


def _csrf_allowed_hosts(request) -> set:
    """Hosts considerados 'propios': el Host de la propia request + CORS_ORIGINS +
    CSRF_ALLOWED_ORIGINS + localhost en dev. Fail-soft."""
    hosts = set()
    try:
        # 1) El host por el que entró la request (same-origin siempre permitido).
        h = (request.headers.get("host") or "").strip().lower()
        if h:
            hosts.add(h)
        # 2) Orígenes CORS configurados (lista explícita de prod) + extra CSRF.
        for o in list(_CORS_ORIGINS) + list(_CSRF_EXTRA_ORIGINS):
            nl = _csrf_host_of(o) or (o or "").strip().lower().rstrip("/")
            if nl:
                hosts.add(nl)
        # 3) En dev, localhost/127.0.0.1 (cualquier puerto) van con el front local.
        if _is_dev():
            for hh in list(hosts):
                if hh.startswith(("localhost", "127.0.0.1")):
                    hosts.add(hh.split(":")[0])
    except Exception:
        pass
    return hosts


def _csrf_reject(message: str = "Origen no permitido para esta acción.", code: str = "csrf_origin_rejected"):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=403, content={"code": code, "message": message})


@app.middleware("http")
async def csrf_cookie_origin_guard(request, call_next):
    # P2-FO-05 · Un control de SEGURIDAD no debe fail-openear ante su propio error.
    # `sensitive` marca que estamos en una mutación auth-por-cookie (no Bearer): si el
    # guard revienta DENTRO de esa rama, en PROD se deniega (fail-closed); en dev se
    # permite para no romper desarrollo. Fuera de esa rama, fallo del guard = fail-soft.
    sensitive = False
    try:
        if request.method in _CSRF_METHODS:
            auth = request.headers.get("authorization", "")
            is_bearer = auth.startswith("Bearer ")
            has_cookie_auth = bool(
                request.cookies.get("access_token")
                or request.cookies.get("session_token")
            )
            # Solo nos metemos con mutaciones auth-por-cookie (no Bearer).
            # Bearer → FAIL-OPEN siempre (API/tests usan Authorization, no son CSRF).
            if has_cookie_auth and not is_bearer:
                sensitive = True
                origin = request.headers.get("origin", "")
                referer = request.headers.get("referer", "")
                src = origin or referer  # Origin primero; Referer como respaldo.
                if src:  # browser cross-site SIEMPRE manda Origin en mutaciones.
                    src_host = _csrf_host_of(src)
                    allowed = _csrf_allowed_hosts(request)
                    # localhost en dev: comparar también sin puerto.
                    src_bare = src_host.split(":")[0] if src_host else ""
                    # P3-CSRF-01: un Origin/Referer PRESENTE pero que NO parsea a host (Origin: null, data:, blob:,
                    # filesystem:) es un origen OPACO/cross-site → src_host=='' hacía que `if src_host` saltara el
                    # rechazo (bypass verificado). Ahora: si hay src pero el host es vacío → rechazar; si el host no
                    # está permitido (y no es localhost en dev) → rechazar.
                    if (not src_host) or (
                        src_host not in allowed and not (_is_dev() and src_bare in allowed)
                    ):
                        logging.warning(
                            f"[csrf] bloqueado {request.method} {request.url.path} "
                            f"origin={src!r} host={src_host!r} no en {sorted(allowed)!r}"
                        )
                        return _csrf_reject()
                else:
                    # Sin Origin NI Referer en una mutación cookie-auth: un browser
                    # SIEMPRE manda Origin en mutaciones cross-site, así que la ausencia
                    # es sospechosa. En PROD → 403 (fail-closed). En dev/local → permitir
                    # (clientes no-browser con cookie; no romper desarrollo).
                    if _is_prod():
                        logging.warning(
                            f"[csrf] bloqueado {request.method} {request.url.path} "
                            f"sin Origin ni Referer (mutación cookie-auth) en prod"
                        )
                        return _csrf_reject(
                            message="Falta Origin/Referer para esta acción.",
                            code="csrf_origin_missing",
                        )
    except Exception:
        # El guard falló internamente. NO fail-openear un control de seguridad: en una
        # mutación cookie-auth en PROD denegamos (fail-closed); en dev/local permitimos.
        logging.exception(
            f"[csrf] fallo interno del guard en {request.method} {request.url.path}"
        )
        if sensitive and _is_prod():
            return _csrf_reject(
                message="No se pudo validar el origen de la petición.",
                code="csrf_guard_error",
            )
    return await call_next(request)


# ─── F3 · ERR-DETAIL-LEAK · Handler global de excepciones no manejadas ─────────
# ~46 sitios reflejan str(e)/{e} en la respuesta (filtra rutas internas, SQL, paths,
# stack hints → reconocimiento para un atacante). Un único handler para Exception NO
# manejada loguea el detalle del lado servidor (con stack) y devuelve un mensaje
# genérico + `ref` corto para correlacionar en logs/Sentry. NO intercepta HTTPException
# ni errores de validación (FastAPI/Starlette los manejan con sus propios handlers).
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    from fastapi.responses import JSONResponse
    # Ruido de cliente que cerró la conexión a media respuesta (cerró el navegador, canceló) —
    # NO es una falla de la app. Antes se logueaba como ERROR con traceback ensuciando el monitoreo.
    if type(exc).__name__ in (
        "ClientDisconnect", "LocalProtocolError", "ConnectionResetError",
        "BrokenPipeError", "CancelledError",
    ):
        logging.getLogger("dmx.error").debug(
            f"[client-disconnect] {request.method} {request.url.path}: {type(exc).__name__}"
        )
        return JSONResponse(status_code=499, content={"detail": "client disconnected"})
    ref = uuid.uuid4().hex[:8]
    logging.getLogger("dmx.error").exception(
        f"[unhandled] ref={ref} {request.method} {request.url.path}: "
        f"{type(exc).__name__}: {exc}"
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno", "ref": ref},
    )


# Phase 4 Batch 32 — Asesor Identity (Endorsements + LinkedIn + DISC + Trust Score)
from routes.asesor_identity import router as asesor_identity_router
app.include_router(asesor_identity_router)

# Phase 4 Batch 33 — Asesor Daily Tools (Calendar bidi + Visit briefing + Client insights)
from routes.asesor_daily_tools import router as asesor_daily_tools_router
app.include_router(asesor_daily_tools_router)

# Phase 4 Batch 34 — Smart Match Lead-to-Asesor + Daily Feed
from routes.lead_match import router as lead_match_router
app.include_router(lead_match_router)

# Phase 18 Batch 35 — Inmobiliaria entity (Foundation + Portal + Relationships)
from routes.inmobiliaria import router as inmobiliaria_router
app.include_router(inmobiliaria_router)

# Phase 13 Batch 36 — Advisor Whitelist + Auto-Approve
from routes.advisor_whitelist import router as whitelist_router
app.include_router(whitelist_router)

# Phase 14 Batch 37 — Internal Users + Mini Market + Cross-Org Partnerships
from routes.internal_users import router as internal_users_router
app.include_router(internal_users_router)

# Phase 15 Batch 38 — Cross directories + lead enrichment
from routes.directories import router as directories_router
app.include_router(directories_router)

# Métricas granulares (roadmap): plusvalía hiper-segmentada + AVM de mercado por predio (nivel manzana en el mapa) +
# gentrificación (zona-subiendo, motor nuevo derivado de plusvalía SHF + crimen a la baja + demanda + edad del parque)
from routes.plusvalia import router as plusvalia_router
app.include_router(plusvalia_router)
from routes.mapa_predios import router as mapa_predios_router
app.include_router(mapa_predios_router)
from routes.gentrificacion import router as gentrificacion_router
app.include_router(gentrificacion_router)
# Selector de CAPAS del mapa: sirve cualquier métrica por colonia (valor/AVM/plusvalía/gentrificación/FAR +
# 8 índices IE con cobertura amplia) para pintar el choropleth "¿qué pinto?" — surface hipergranular.
from routes.mapa_capas import router as mapa_capas_router
app.include_router(mapa_capas_router)
# Compuestas por lente de portal — cablea for_comprador/for_inversor (estaban huérfanos, sin ruta).
from routes.composites import router as composites_router
app.include_router(composites_router)

# ─── Password helpers ─────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "email": email, "iat": now,
               "exp": now + timedelta(hours=8),
               "type": "access", "jti": uuid.uuid4().hex}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_refresh_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now,
               "exp": now + timedelta(days=30),
               "type": "refresh", "jti": uuid.uuid4().hex}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ─── P1.11 · Lista de revocación de tokens (logout que SÍ invalida) ────────────
# JWT es stateless: sin esto, un token sigue válido hasta expirar aunque el usuario
# cierre sesión. Guardamos los `jti` revocados en BD (TTL auto-purga al expirar) y
# en memoria para chequeo O(1) por request. (Multi-instancia: cada proceso carga de
# BD al arrancar; revocaciones de otra instancia se ven tras recargar → mover a Redis.)
_REVOKED_JTIS: set = set()
_revoked_loaded = False


async def _load_revoked_jtis():
    global _revoked_loaded
    try:
        await db.revoked_tokens.create_index("exp_dt", expireAfterSeconds=0)
        cur = db.revoked_tokens.find({}, {"_id": 0, "jti": 1})
        async for d in cur:
            if d.get("jti"):
                _REVOKED_JTIS.add(d["jti"])
    except Exception as e:
        logging.getLogger("dmx.auth").warning(f"[revoked] load fail-open: {e}")
    _revoked_loaded = True


async def _revoke_token_str(token: str):
    """Revoca un JWT por su jti (durable en BD + cache memoria). FAIL-OPEN."""
    if not token:
        return
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"],
                               options={"verify_exp": False})
        jti = payload.get("jti")
        if not jti:
            return
        exp = payload.get("exp")
        exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else datetime.now(timezone.utc) + timedelta(days=30)
        _REVOKED_JTIS.add(jti)
        await db.revoked_tokens.update_one(
            {"jti": jti},
            {"$set": {"jti": jti, "user_id": payload.get("sub"), "exp_dt": exp_dt}},
            upsert=True,
        )
    except Exception as e:
        logging.getLogger("dmx.auth").warning(f"[revoked] revoke fail-open: {e}")

# ─── Models ───────────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None
    onboarded: Optional[bool] = None  # False = needs role-picker; None/True = done

    @computed_field  # P1.12 · el front usa este hash (del backend) en vez de cargar el salt
    @property
    def analytics_id(self) -> Optional[str]:
        return analytics_id_for(self.user_id)

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
                # [AUD-021] cuenta suspendida → sesión inválida. Antes account_blocked solo se
                # checaba en el login-password; el gate por-request (este) lo ignoraba → suspender
                # NO cortaba sesiones vivas y el usuario podía re-loguear por OAuth/magic-link.
                if user_doc.get("account_blocked"):
                    return None
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
            # P1.11 · token revocado (logout) → sesión inválida aunque el JWT no haya expirado.
            if not _revoked_loaded:
                await _load_revoked_jtis()
            if payload.get("jti") and payload["jti"] in _REVOKED_JTIS:
                return None
            user_doc = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user_doc:
                if user_doc.get("account_blocked"):  # [AUD-021] cuenta suspendida → sesión inválida (gate por-request)
                    return None
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
    _prod_env_guard()   # Tanda 2 · fail-closed en prod si faltan secretos críticos
    # Seguridad 2026-06-16 · kill-switch GLOBAL de IA: parcha LlmChat.send_message para
    # que AI_DISABLED corte los ~45 motores que llaman al LLM directo (antes lo saltaban).
    try:
        from llm_killswitch import install_llm_killswitch
        install_llm_killswitch()
    except Exception as _kse:
        logging.warning(f"[startup] kill-switch global de IA no instalado: {_kse}")
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.audit_logs.create_index("ts")
    # P2.3 · índices que faltaban (rapidez de consultas calientes). Idempotente.
    try:
        from pymongo import DESCENDING as _DESC
        await db.market_index_snapshots.create_index([("fecha", _DESC)], name="idx_mis_fecha")
        await db.asesor_busquedas.create_index("id", name="idx_busq_id", sparse=True)
        await db.units.create_index("id", name="idx_units_id", sparse=True)
        await db.units.create_index("unit_id", name="idx_units_unit_id", sparse=True)
        from cerebro_mercado_engine import ensure_indexes as _cerebro_mercado_idx
        await _cerebro_mercado_idx(db)   # índice de drift (cerebro_predictions) — Fase 8 #4 restante
    except Exception as _p23e:
        logging.warning(f"[startup] P2.3 índices fail-open: {_p23e}")
    # P2.11 · validadores de schema (modo WARN = no bloquea escrituras, solo registra docs
    # malformados) para entidades críticas. Antes TODO dependía del código. Idempotente, fail-open.
    _VALIDATORS = {
        "users": {"$jsonSchema": {"bsonType": "object", "required": ["user_id", "email", "role"],
            "properties": {"user_id": {"bsonType": "string"}, "email": {"bsonType": "string"},
                           "role": {"bsonType": "string"}}}},
        "transactions": {"$jsonSchema": {"bsonType": "object", "properties": {
            "closing_price_mxn": {"bsonType": ["double", "int", "long", "decimal"]},
            "m2": {"bsonType": ["double", "int", "long", "decimal"]},
            "closed_at": {"bsonType": ["string", "date"]}}}},
        "leads": {"$jsonSchema": {"bsonType": "object", "properties": {
            "source": {"bsonType": ["string", "null"]},
            "created_at": {"bsonType": ["string", "date"]}}}},
    }
    for _coll, _val in _VALIDATORS.items():
        try:
            await db.command({"collMod": _coll, "validator": _val,
                              "validationLevel": "moderate", "validationAction": "warn"})
        except Exception as _ve:
            # colección aún no existe o el motor no soporta collMod → no rompe el arranque
            logging.info(f"[startup] P2.11 validator {_coll} omitido: {_ve}")
    # Seed superadmin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.io")
    admin_pw    = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
    if admin_pw == "Admin2026!" and os.environ.get("DMX_DEV_MODE", "false").lower() != "true":
        logging.warning("[startup] ADMIN_PASSWORD usa el default público en entorno no-dev · setéala por env antes de exponer")
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
    # Cuentas demo con contraseñas públicas: SOLO en dev (DMX_DEV_MODE=true).
    # En producción no deben existir (eran un hoyo: login conocido).
    if os.environ.get("DMX_DEV_MODE", "false").lower() == "true":
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
        # Vincula al asesor demo al roster de la inmobiliaria system-default, ACTIVO y con user_id → así SÍ recibe los
        # leads públicos del marketplace. Sin esto, el flujo lead→asesor está muerto en el demo (el asesor existe en
        # `users` pero `resolve_public_lead_owner` busca asesores activos en `inmobiliaria_internal_users` con user_id).
        _sysinm = await db.inmobiliarias.find_one({"is_system_default": True}, {"_id": 0, "id": 1})
        if _sysinm:
            await db.inmobiliaria_internal_users.update_one(
                {"inmobiliaria_id": _sysinm["id"], "user_id": "user_asesor_0001"},
                {"$set": {"inmobiliaria_id": _sysinm["id"], "user_id": "user_asesor_0001", "email": adv_email,
                          "name": "Ana Gutiérrez", "role": "asesor", "status": "active", "public_lead_receiver": True}},
                upsert=True)
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
    # P1 · Command Center action queue indexes (user+status+priority + TTL expires_at)
    try:
        from routes.advisor import ensure_command_center_indexes
        await ensure_command_center_indexes(db)
    except Exception as _e:
        logging.warning(f"[startup] command_center indexes: {_e}")
    # Paso 3 · índices del módulo asesor (antes CERO → COLLSCAN por endpoint)
    try:
        from asesor_indexes import ensure_asesor_indexes
        await ensure_asesor_indexes(db)
    except Exception as _e:
        logging.warning(f"[startup] asesor indexes: {_e}")
    # Cerebro DMX · Etapa 0 — cimientos: índices de cola de tareas + memoria gobernada
    # (colecciones vacías/inofensivas · la EJECUCIÓN de agentes va detrás de CEREBRO_ENABLED)
    try:
        from cerebro import ensure_cerebro_all_indexes
        await ensure_cerebro_all_indexes(db)
    except Exception as _e:
        logging.warning(f"[startup] cerebro indexes: {_e}")
    # Auto-reparable (B2) · rutea huérfanos REALES a un asesor + reintenta el espejo de leads que no llegaron a "Mis Leads"
    try:
        from services.lead_bridge import lead_completeness_sweep
        await lead_completeness_sweep(db)
    except Exception as _e:
        logging.warning(f"[startup] lead_completeness_sweep: {_e}")
    # Canoniza inmobiliaria_id de los leads (campo único de inmobiliaria) desde el asesor
    try:
        from services.lead_bridge import backfill_lead_inmobiliaria
        await backfill_lead_inmobiliaria(db)
    except Exception as _e:
        logging.warning(f"[startup] backfill_lead_inmobiliaria: {_e}")
    # Auto-reparable · otorga XP/cierre que quedó pendiente al cerrar una venta
    try:
        from routes.advisor import reconcile_pending_xp
        await reconcile_pending_xp(db)
    except Exception as _e:
        logging.warning(f"[startup] reconcile_pending_xp: {_e}")
    # Copiloto · cierre de ciclo · índices de eventos (auditoría + aprendizaje + métricas)
    try:
        from copilot_events import ensure_copilot_events_indexes
        await ensure_copilot_events_indexes(db)
    except Exception as _e:
        logging.warning(f"[startup] copilot_events indexes: {_e}")
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
        await ensure_watchlist_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] watchlist indexes failed: {e}")
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
    # Buscador IA · formas de pago: siembra (idempotente) esquemas DEMO para 2 desarrollos seed, así el cruce de zonas
    # muestra mensualidades REALES (payment_schemes.compute_breakdown) y no solo estimadas. Los devs reales configuran
    # las suyas en su módulo (db.dev_payment_schemes por tenant); esto solo cubre el catálogo demo (dev_org_id='seed_demo').
    try:
        import payment_schemes as _ps_seed
        _demo_schemes = [
            ("doctores-loft", "2025-06", "2027-11"),
            ("narvarte-32", "2025-01", "2027-05"),
        ]
        for _pid, _fi, _fe in _demo_schemes:
            if not await db.dev_payment_schemes.find_one({"project_id": _pid}):
                await db.dev_payment_schemes.update_one(
                    {"project_id": _pid, "dev_org_id": "seed_demo"},
                    {"$set": {"project_id": _pid, "dev_org_id": "seed_demo",
                              "schemes": _ps_seed.default_schemes(),
                              "fecha_inicio": _fi, "fecha_entrega": _fe, "seeded_demo": True}},
                    upsert=True)
        logging.info("[startup] demo payment schemes ready")
    except Exception as e:
        logging.warning(f"[startup] demo payment schemes failed: {e}")
    # W5.22 Z.1.1 SUB-FIX-1 · Eager-load all modules calling register_feature
    # so catalog returns 42+ features instead of ~13 (lazy import problem).
    try:
        from feature_registry_eager_loader import eager_load_all_registered_features
        ok, failed, total_after = eager_load_all_registered_features()
        logging.info(f"[startup] feature_registry_eager_loader: loaded={ok} failed={failed} total={total_after}")
    except Exception as e:
        logging.warning(f"[startup] feature_registry_eager_loader failed: {e}")
    # W5.FF2 — Self-registering feature catalog sync
    try:
        from feature_registry import ensure_catalog_synced as _ensure_feature_catalog_synced
        catalog_sync = await _ensure_feature_catalog_synced(db)
        logging.info(f"[startup] feature_catalog sync: {catalog_sync}")
    except Exception as e:
        logging.warning(f"[startup] feature_catalog sync failed: {e}")
    # W5.22 Z.1 — Studio Brand Kit + Listing Importer + Asset Library indexes
    try:
        await ensure_brand_kit_indexes(db)
        await ensure_listing_indexes(db)
        await ensure_asset_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] studio Z.1 indexes failed: {e}")
    # W5.22 Z.2 — Studio Buyer-angle Copy + Carrusel + Auto-content indexes (cron registrado abajo)
    try:
        await ensure_buyer_copy_indexes(db)
        await ensure_carrusel_indexes(db)
        await ensure_auto_content_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] studio Z.2 indexes failed: {e}")
    # W5.22 Z.5 — Hook Predictor standalone indexes (D.61b audit · skip si module roto en import)
    try:
        if ensure_hook_predictor_indexes is not None:
            await ensure_hook_predictor_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] hook_predictor indexes failed: {e}")
    # W5.22 Z.8 — Studio Landing Pages indexes
    try:
        await ensure_studio_landing_indexes(db)
        # Z.8.2 migration: existing landings → landing_type=property default
        from studio_landing_engine import migrate_existing_landings
        await migrate_existing_landings(db)
    except Exception as e:
        logging.warning(f"[startup] studio Z.8 indexes failed: {e}")
    # W5.22 Z.8.7 Sub-B1 — Studio Property Intake indexes
    try:
        await db.studio_property_intakes.create_index("created_by_user_id")
        await db.studio_property_intakes.create_index("template_key")
        await db.studio_property_intakes.create_index("property_type")
        await db.studio_property_intakes.create_index("slug", unique=True)
        await db.studio_property_intakes.create_index("landing_id", sparse=True)
        await db.studio_property_intakes.create_index([("created_at", -1)])
    except Exception as e:
        logging.warning(f"[startup] studio Z.8.7 property_intake indexes failed: {e}")
    # W5.x F6 — Tax Projector cache indexes
    try:
        from tax_projector_cache import ensure_indexes as _tax_cache_indexes
        await _tax_cache_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] tax_projector_cache indexes failed: {e}")
    # W5.x F4 — Narrative Layer indexes
    try:
        from narrative_layer_engine import ensure_indexes as _nl_indexes
        await _nl_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] narrative_layer indexes failed: {e}")
    # W5.x F4.2 — Comparator indexes
    try:
        from comparator_engine import ensure_indexes as _cmp_indexes
        await _cmp_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] comparator indexes failed: {e}")
    # W5.x F5 — Reverse Search indexes
    try:
        from reverse_search_engine import ensure_indexes as _rs_indexes
        await _rs_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] reverse_search indexes failed: {e}")
    # W5.x F7 — Marketplace Lead Capture indexes
    try:
        from lead_capture_marketplace_engine import ensure_indexes as _lcm_indexes
        await _lcm_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] lead_capture_marketplace indexes failed: {e}")
    # W5.x F8 — Predictive Alerts indexes
    try:
        from predictive_alerts_engine import ensure_indexes as _pa_indexes
        await _pa_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] predictive_alerts indexes failed: {e}")
    # W5.x F11 — Fit Engine indexes
    try:
        from fit_engine import ensure_indexes as _fit_indexes
        await _fit_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] fit indexes failed: {e}")
    # W5.x F10 — Mood Engine indexes
    try:
        from mood_engine import ensure_indexes as _mood_indexes
        await _mood_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] mood indexes failed: {e}")
    # W5.17 — Virtual Staging indexes
    try:
        from virtual_staging_engine import ensure_indexes as _vs_indexes
        await _vs_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] virtual_staging indexes failed: {e}")
    # W5.16-A — Studio Video scripts + audios indexes
    try:
        from studio_video_engine import ensure_indexes as _sv_indexes
        await _sv_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] studio_video indexes failed: {e}")
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
    # ESCALA — histórico temporal (dmx_market_snapshots): índices al arrancar. Antes NUNCA se creaban → el moat
    # temporal ("el histórico ES el activo") no existía porque no había ni índices ni escrituras.
    try:
        import dmx_snapshots
        await dmx_snapshots.ensure_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] dmx_snapshots indexes failed: {e}")
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
    # Phase 4 — Índices del portal Dev (RESILIENTE: un índice que falle loggea pero NO tumba el
    # arranque · antes un IndexOptionsConflict o duplicados en un unique dejaban el server sin levantar).
    for _n, _fn in (
        ("dev_batch1", ensure_dev_batch1_indexes),
        ("dev_batch2", ensure_dev_batch2_indexes),
        ("dev_batch3", ensure_dev_batch3_indexes),
        ("dev_batch4", ensure_dev_batch4_indexes),
        ("batch4_1", ensure_batch4_1_indexes),
    ):
        try:
            await _fn(db)
        except Exception as exc:
            logging.warning(f"[startup] índices {_n} fallaron (continúa): {exc}")
    try:
        await seed_dmx_inmobiliaria(db)
    except Exception as exc:
        logging.warning(f"[startup] seed_dmx_inmobiliaria falló (continúa): {exc}")
    # W5.11 Parte 3 — Disputes
    try:
        await ensure_disputes_indexes(db)
    except Exception as exc:
        logging.warning(f"[startup] índices disputes fallaron (continúa): {exc}")
    # W5.12 Parte 1 — Knowledge Graph: health check + constraints (best-effort)
    try:
        from knowledge_graph_engine import health_check, ensure_kg_constraints, NODE_TYPES, EDGE_TYPES
        hc = await health_check()
        if hc.get("connected"):
            await ensure_kg_constraints()
            logging.info(
                f"[KG] connected to Neo4j {hc.get('version')} · constraints OK · "
                f"{len(NODE_TYPES)} node types · {len(EDGE_TYPES)} edge types"
            )
        else:
            logging.warning(
                f"[KG] Neo4j unavailable · KG_AVAILABLE=False · reason={hc.get('error')} · "
                f"endpoints retornaran 503 con fallback relational"
            )
        # W5.12 P2 — KG anomaly indexes (Mongo · siempre creamos para que persist no falle)
        try:
            from kg_anomaly_detector import ensure_kg_anomaly_indexes
            await ensure_kg_anomaly_indexes(db)
        except Exception as exc:
            logging.warning(f"[KG anomaly] ensure indexes failed: {exc}")
    except Exception as exc:
        logging.warning(f"[KG] startup hook failed: {exc}")
    # Phase 18 + Phase 4 — más índices (mismo patrón resiliente: cada uno aislado).
    from services.inmobiliaria_relationships import ensure_inmobiliaria_relationship_indexes
    for _n, _fn in (
        ("inmobiliaria_relationships", ensure_inmobiliaria_relationship_indexes),
        ("batch4_2", ensure_batch4_2_indexes),
        ("batch4_3", ensure_batch4_3_indexes),
        ("batch4_4", ensure_batch4_4_indexes),
        ("batch5", ensure_batch5_indexes),
        ("batch6", ensure_batch6_indexes),
        ("batch7", ensure_batch7_indexes),
        ("batch7_2", ensure_batch7_2_indexes),
        ("batch11", ensure_batch11_indexes),
        ("batch10", ensure_batch10_indexes),
        ("location_intel", ensure_location_intel_indexes),
        ("sales_intel", ensure_sales_intel_indexes),
        ("insights_intel", ensure_insights_intel_indexes),
        ("amenity_intel", ensure_amenity_intel_indexes),
        ("broker_intel", ensure_broker_intel_indexes),
        ("price_history", ensure_price_history_indexes),
        ("channel_intel", ensure_channel_intel_indexes),
        ("project_full", ensure_project_full_indexes),
        ("batch8", ensure_batch8_indexes),
        ("dev_scale", ensure_dev_scale_indexes),
    ):
        try:
            await _fn(db)
        except Exception as exc:
            logging.warning(f"[startup] índices {_n} fallaron (continúa): {exc}")
    # Phase 4 Batch 0 — AI Budget + Preferences indexes
    await ensure_ai_budget_indexes(db)
    await ensure_preferences_indexes(db)
    # W5.x F1 — User-tier quotas
    try:
        await ensure_user_quota_indexes(db)
    except Exception as _exc:
        logging.warning(f"[startup] F1 user quota indexes failed: {_exc}")
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
    try:
        await ensure_conversation_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W7.AS.3.A conversation indexes failed: {e}")
    try:
        await ensure_kb_gaps_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W7.AS.3.D kb-gaps indexes failed: {e}")
    try:
        await ensure_conversation_ab_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W7.AS.3.G ab-testing indexes failed: {e}")
    # W7.AS.3.H · confidence indexes (FAIL-OPEN si routes pendientes)
    try:
        await ensure_confidence_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W7.AS.3.H confidence indexes failed: {e}")
    # W7.AS.3.I · drift alerts/baselines indexes (FAIL-OPEN si routes pendientes)
    try:
        if ensure_conversation_drift_indexes is not None:
            await ensure_conversation_drift_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W7.AS.3.I drift indexes failed: {e}")
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
    # W4.6 Y.3A — Smart Routing indexes (lead_routings + routing_metrics)
    try:
        await ensure_routing_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.6 Y.3A routing indexes failed: {e}")
    # W4.6 Y.3B — Visit Prep dossier indexes
    try:
        await ensure_visit_prep_dossier_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.6 Y.3B visit-prep indexes failed: {e}")
    # W4.6 Y.3C — Reply Classifier indexes
    try:
        await ensure_reply_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.6 Y.3C reply_classifier indexes failed: {e}")
    # W4.6 Y.3D — DISC Inferencer indexes
    try:
        await ensure_disc_inferencer_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.6 Y.3D disc_inferencer indexes failed: {e}")
    # W4.6 Y.3E — Nurture Intelligent indexes
    try:
        await ensure_nurture_sequences_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.6 Y.3E nurture_intelligent indexes failed: {e}")
    # W4.7 Y.4A — Atlax Persona indexes
    try:
        await ensure_atlax_persona_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.7 Y.4A atlax_persona indexes failed: {e}")
    # W4.7 Y.4B — Match Weights indexes
    try:
        from agentic_crm.match_weights_engine import ensure_match_weights_indexes
        await ensure_match_weights_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.7 Y.4B match_weights indexes failed: {e}")
    # W4.7 Y.4C — Argumentario indexes
    try:
        from agentic_crm.argumentario_engine import ensure_argumentario_indexes
        await ensure_argumentario_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.7 Y.4C argumentario indexes failed: {e}")
    # W4.8 Y.5 — Observability indexes (audit_replay_events + ml_accuracy_log + ai_roi_per_dev)
    try:
        from agentic_crm.observability_engine import ensure_observability_indexes
        await ensure_observability_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.8 Y.5 observability indexes failed: {e}")
    # W4.18 — Data Sources gov MX indexes (6 collections)
    try:
        from data_sources import ensure_data_sources_indexes
        await ensure_data_sources_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.18 data_sources indexes failed: {e}")
    # W4.10 — WhatsApp + Newsletter + Voice indexes
    try:
        await ensure_whatsapp_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.10 whatsapp indexes failed: {e}")
    try:
        await ensure_newsletter_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.10 newsletter indexes failed: {e}")
    try:
        await ensure_voice_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.10 voice indexes failed: {e}")
    # W4.18.2A — Maps indexes
    try:
        await ensure_maps_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.18.2A maps indexes failed: {e}")
    # W4.18.2B — Maps cross-features indexes
    try:
        await ensure_maps_cross_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.18.2B maps cross indexes failed: {e}")
    # W4.18.3 — Private Beta indexes
    try:
        await ensure_private_beta_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.18.3 private beta indexes failed: {e}")
    # W4.13.A — Lead Journey indexes
    try:
        await ensure_lead_journey_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.13.A lead journey indexes failed: {e}")
    # W4.17 — Notifications indexes
    try:
        await ensure_notifications_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.17 notifications indexes failed: {e}")
    # W4.14 — Buyer Coach indexes
    try:
        await ensure_buyer_coach_indexes(db)
    except Exception as e:
        logging.warning(f"[startup] W4.14 buyer_coach indexes failed: {e}")
    # W4.9 — Brochure indexes
    try:
        await ensure_brochure_indexes_fn(db)
    except Exception as e:
        logging.warning(f"[startup] W4.9 brochure indexes failed: {e}")
    # W4.9.6 — Tour 3DGS indexes
    try:
        await ensure_tour_3dgs_indexes_fn(db)
    except Exception as e:
        logging.warning(f"[startup] W4.9.6 tour_3dgs indexes failed: {e}")
    # W4.16 — Marketing indexes
    try:
        await ensure_free_audit_indexes_fn(db)
        await ensure_state_of_cdmx_indexes_fn(db)
        await ensure_mcp_distribution_indexes_fn(db)
    except Exception as e:
        logging.warning(f"[startup] W4.16 marketing indexes failed: {e}")
    # F0.1 — Score Inversión indexes
    try:
        await ensure_score_inversion_indexes_fn(db)
    except Exception as e:
        logging.warning(f"[startup] F0.1 score_inversion indexes failed: {e}")
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
            from zone_data_cron import schedule_zone_data_cron
            schedule_zone_data_cron(sched, db)
        except Exception as e:
            logging.warning(f"[zone_data] cron register failed: {e}")
        try:
            from gentrification_engine import schedule_gentrification_cron
            schedule_gentrification_cron(sched, db)
        except Exception as e:
            logging.warning(f"[gentrif] cron register failed: {e}")
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
        # W5.FF4 — Churn prediction daily cron (04:00 UTC)
        try:
            from churn_prediction_cron import register_churn_jobs
            register_churn_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W5.FF4] churn scheduler register failed: {e}")
        # W5.22 Z.2 — Studio Auto-content daily cron (06:00 UTC)
        try:
            register_auto_content_job(sched, db)
        except Exception as e:
            logging.warning(f"[W5.22 Z.2] auto-content scheduler register failed: {e}")
        # W7.AS.3.E — Conversation self-tuning (weekly) + drift detector (daily)
        # Defensive: Terminal E modules may not be merged yet · NO crashear startup.
        # register_cron(scheduler, db) con fallback a register_cron(scheduler).
        try:
            from conversation_self_tuning import register_cron as _register_self_tuning
            try:
                _register_self_tuning(sched, db)
            except TypeError:
                _register_self_tuning(sched)
            logging.info("[W7.AS.3.E] conversation self-tuning weekly cron registered")
        except Exception as e:
            logging.info(f"[W7.AS.3.E] self-tuning cron pending (Terminal E): {e}")
        try:
            from conversation_drift_detector import register_cron as _register_drift
            try:
                _register_drift(sched, db)
            except TypeError:
                _register_drift(sched)
            logging.info("[W7.AS.3.E] conversation drift-detector daily cron registered")
        except Exception as e:
            logging.info(f"[W7.AS.3.E] drift-detector cron pending (Terminal E): {e}")
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
        # Privacidad LFPDPPP — purga diaria de cuentas soft-deleted cuya gracia (30d) expiró.
        # Cierra el hueco de "borrado que no borra": el dato personal se elimina de verdad.
        try:
            from apscheduler.triggers.cron import CronTrigger
            from services.privacy_center import purge_expired_accounts
            sched.add_job(
                purge_expired_accounts, CronTrigger(hour=3, minute=30),
                id="privacy_purge_expired_accounts", replace_existing=True,
                kwargs={"db": db}, max_instances=1,
            )
            logging.info("[privacy] purga de cuentas expiradas programada @ 03:30 MX")
        except Exception as e:
            logging.warning(f"[privacy] no se pudo programar la purga: {e}")
        # Phase 4 Batch 0.5 — Diagnostic daily scheduler
        try:
            register_diagnostic_jobs(sched, db, app)
        except Exception as e:
            logging.warning(f"[batch0.5] diagnostic scheduler register failed: {e}")
        # W5.12 Parte 1 — Knowledge Graph nightly rebuild
        try:
            from kg_cron import register_kg_jobs
            register_kg_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[KG cron] register failed: {e}")
        # W5.x F2 — RAG reindex daily + director_memory cleanup
        try:
            from rag_reindex_cron import register_rag_reindex_jobs
            register_rag_reindex_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[F2 cron] register failed: {e}")
        # W5.5 Parte 1 — Live Pulse compute + readiness snapshot cron
        try:
            import live_pulse_engine
            import live_pulse_cron
            await live_pulse_engine.ensure_live_pulse_indexes(db)
            live_pulse_cron.register_live_pulse_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[LivePulse] startup register failed: {e}")
        # Puente demanda del ASESOR → demanda anónima (cierra el cable roto asesor→dev/superadmin)
        try:
            import advisor_demand_bridge
            await advisor_demand_bridge.ensure_indexes(db)
            advisor_demand_bridge.register_advisor_bridge_job(sched, db)
        except Exception as e:
            logging.warning(f"[advisor_demand_bridge] startup register failed: {e}")
        # CUBO TOTAL F1 — átomo financiero por unidad (corridas + escenarios hipotecarios, tasa viva)
        try:
            import dmx_finance_atom
            await dmx_finance_atom.ensure_indexes(db)
            dmx_finance_atom.register_finance_cron(sched, db)
        except Exception as e:
            logging.warning(f"[finance_atom] startup register failed: {e}")
        # CUBO TOTAL F6 — facturación por uso de la API (rollup mensual de api_call_logs → Stripe)
        try:
            import stripe_billing_engine
            stripe_billing_engine.register_billing_cron(sched, db)
        except Exception as e:
            logging.warning(f"[usage_billing] startup register failed: {e}")
        # CUBO TOTAL F3 — alertas por corte guardado del Explorador (re-corre y notifica cambios)
        try:
            import vistas_guardadas
            await vistas_guardadas.ensure_indexes(db)
            vistas_guardadas.register_vistas_corte_cron(sched, db)
        except Exception as e:
            logging.warning(f"[cube_view_alerts] startup register failed: {e}")
        # W5.15 Parte 1 — Accuracy indexes + 3 crons (MAPE / drift / weights)
        try:
            import fsd_engine
            import accuracy_engine
            import drift_detector
            import weight_optimizer
            import accuracy_cron
            await fsd_engine.ensure_fsd_indexes(db)
            await accuracy_engine.ensure_accuracy_indexes(db)
            await drift_detector.ensure_drift_indexes(db)
            await weight_optimizer.ensure_zone_weights_indexes(db)
            accuracy_cron.register_accuracy_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[Accuracy] startup register failed: {e}")
        # W5.19 — Probability UX: indexes + weekly cron threshold crossing
        try:
            import probability_cron
            await probability_cron.ensure_probability_indexes(db)
            probability_cron.register_probability_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[Probability] startup register failed: {e}")
        # W5.23 — Battle Card: indexes + 2 crons (snapshot dom 23:00 + email lun 08:00)
        try:
            import battle_card_engine
            import battle_card_cron
            await battle_card_engine.ensure_battle_card_indexes(db)
            battle_card_cron.register_battle_card_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[BattleCard] startup register failed: {e}")
        # W5.25 — Widget Embed Analytics: indexes + daily digest cron
        try:
            from widget_embed_indexes import ensure_widget_embeds_index
            from widget_embed_cron import register_widget_embed_jobs
            await ensure_widget_embeds_index(db)
            register_widget_embed_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W5.25] widget_embed startup register failed: {e}")
        # W5.20 — External Insights Ingest: indexes + weekly fetch + daily macro alert
        try:
            from external_insights_engine import ensure_external_insights_indexes
            from external_insights_cron import register_external_insights_jobs
            await ensure_external_insights_indexes(db)
            register_external_insights_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W5.20] external_insights startup register failed: {e}")
        # W5.x F8 — Predictive Alerts: signal_detection (30min) + email_digest (08:00 UTC)
        try:
            from predictive_alerts_cron import register_predictive_alerts_jobs
            register_predictive_alerts_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[F8] predictive_alerts scheduler register failed: {e}")
        # W5.9 — Climate Migration: indexes + 2 crons (detect lun 03:00 + heatmap diario 04:00 UTC)
        try:
            from climate_migration_engine import ensure_indexes as climate_migration_ensure_indexes
            from climate_migration_cron import register_climate_migration_jobs
            await climate_migration_ensure_indexes(db)
            register_climate_migration_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W5.9] climate_migration startup register failed: {e}")
        # W6.MOV.5 — Construction Quality Index: indexes + 1 cron (recompute lun 02:00 UTC)
        try:
            from construction_quality_engine import ensure_indexes as construction_quality_ensure_indexes
            from construction_quality_cron import register_construction_quality_jobs
            await construction_quality_ensure_indexes(db)
            register_construction_quality_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W6.MOV.5] construction_quality startup register failed: {e}")
        # W6.MOV.1 — SOC Franchise: indexes (cache + history) · cron lazy/on-demand
        try:
            from soc_franchise_engine import ensure_indexes as soc_franchise_ensure_indexes
            await soc_franchise_ensure_indexes(db)
        except Exception as e:
            logging.warning(f"[W6.MOV.1] soc_franchise startup register failed: {e}")
        # W6.MOV.3 — Reviews Residentes: indexes + 1 cron (scrape lun 03:00 UTC)
        try:
            from reviews_residents_engine import ensure_indexes as reviews_residents_ensure_indexes
            from reviews_residents_cron import register_reviews_residents_jobs
            await reviews_residents_ensure_indexes(db)
            register_reviews_residents_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W6.MOV.3] reviews_residents startup register failed: {e}")
        # W6.MOV.2 — Gov Data MX: indexes + 2 crons (weekly dom 04:00 + monthly día 1 05:00 UTC)
        try:
            from gov_data_mx_engine import ensure_gov_data_mx_indexes
            from gov_data_mx_cron import register_gov_data_mx_jobs
            await ensure_gov_data_mx_indexes(db)
            register_gov_data_mx_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W6.MOV.2] gov_data_mx startup register failed: {e}")
        # W7.AS.6 — Reputation Monitor: indexes + 1 cron (scan diario 05:00 UTC)
        try:
            from reputation_monitor_engine import ensure_indexes as reputation_monitor_ensure_indexes
            from reputation_monitor_cron import register_reputation_monitor_jobs
            await reputation_monitor_ensure_indexes(db)
            register_reputation_monitor_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W7.AS.6] reputation_monitor startup register failed: {e}")
        # W7.AS.1 — Lead Enrichment: indexes (waterfall cache + audit)
        try:
            from lead_enrichment_engine import ensure_indexes as lead_enrichment_ensure_indexes
            await lead_enrichment_ensure_indexes(db)
        except Exception as e:
            logging.warning(f"[W7.AS.1] lead_enrichment startup register failed: {e}")
        # W5.10 — Social/Ads: token vault indexes + 1 cron (refresh tokens diario 06:00 UTC)
        try:
            from social_ads_engine import ensure_indexes as social_ads_ensure_indexes
            from social_ads_engine import register_social_ads_jobs
            await social_ads_ensure_indexes(db)
            register_social_ads_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[W5.10] social_ads startup register failed: {e}")
        # W5.22 Z.4 — Video Standalone: indexes (queue + history) · skip si import falló (fail-soft)
        try:
            if ensure_video_standalone_indexes is not None:
                await ensure_video_standalone_indexes(db)
        except Exception as e:
            logging.warning(f"[W5.22 Z.4] video_standalone startup register failed: {e}")
        # W6.AS.1 — Workflow Builder: indexes (engine + queue) + tick scheduler 60s
        try:
            from workflow_engine import ensure_indexes as wf_ensure_indexes
            from workflow_queue import (
                ensure_indexes as wfq_ensure_indexes,
                register_workflow_queue_job,
            )
            await wf_ensure_indexes(db)
            await wfq_ensure_indexes(db)
            register_workflow_queue_job(sched, db)
        except Exception as e:
            logging.warning(f"[W6.AS.1] workflow startup register failed: {e}")
        # P2 · Agent Workforce: indexes (command_center reuse + runs) + daily 07:00 UTC cron
        try:
            from agent_workforce import orchestrator as agent_workforce_orchestrator
            await agent_workforce_orchestrator.ensure_indexes(db)
            agent_workforce_orchestrator.register_cron(sched, db)
            logging.info("[P2] agent_workforce startup registered (cron 07:00 UTC)")
        except Exception as e:
            logging.warning(f"[P2] agent_workforce startup register failed: {e}")
        # P4 · Smart Digest: indexes (dedup envíos) + daily 07:30 UTC cron (post-agentes)
        try:
            import asesor_digest_engine
            await asesor_digest_engine.ensure_indexes(db)
            asesor_digest_engine.register_cron(sched, db)
            logging.info("[P4] asesor_digest startup registered (cron 07:30 UTC)")
        except Exception as e:
            logging.warning(f"[P4] asesor_digest startup register failed: {e}")
        # P5.A · Auto-pilot: indexes (config + log TTL) + daily 07:20 UTC cron (entre agentes y digest)
        try:
            import auto_pilot_engine
            await auto_pilot_engine.ensure_indexes(db)
            auto_pilot_engine.register_cron(sched, db)
            logging.info("[P5.A] auto_pilot startup registered (cron 07:20 UTC)")
        except Exception as e:
            logging.warning(f"[P5.A] auto_pilot startup register failed: {e}")
        # W6.MOV.4 — Marketing MCP: indexes (log + cache + scheduled)
        try:
            from marketing_mcp_engine import ensure_indexes as marketing_mcp_ensure_indexes
            await marketing_mcp_ensure_indexes(db)
        except Exception as e:
            logging.warning(f"[W6.MOV.4] marketing_mcp startup register failed: {e}")
        # W6.4 — Marketplace Templates: indexes (templates + clones + ratings + cache TTL)
        try:
            from marketplace_templates_engine import ensure_indexes as mt_ensure_indexes
            await mt_ensure_indexes(db)
        except Exception as e:
            logging.warning(f"[W6.4] marketplace_templates startup register failed: {e}")
        # W6.5 — Project Wizard: indexes (duplicate history)
        try:
            from project_wizard_engine import ensure_indexes as project_wizard_ensure_indexes
            await project_wizard_ensure_indexes(db)
        except Exception as e:
            logging.warning(f"[W6.5] project_wizard startup register failed: {e}")
        # W6.11 — Insights Fact-Check: indexes (cache + courses)
        try:
            from insights_factcheck_engine import ensure_factcheck_indexes
            await ensure_factcheck_indexes(db)
        except Exception as e:
            logging.warning(f"[W6.11] insights_factcheck startup register failed: {e}")
        # W2.4 SA5 — Trial expiry email cron (daily 08:00 MX)
        try:
            from trial_expiry_cron import schedule_trial_expiry_cron
            schedule_trial_expiry_cron(sched, db)
        except Exception as e:
            logging.warning(f"[trial_expiry] scheduler register failed: {e}")

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

        # Casamentera proactiva: cada hora busca por el comprador (búsquedas guardadas × inventario → alertas).
        try:
            from scheduler_casamentera import schedule_casamentera
            if sched:
                schedule_casamentera(sched, db)
        except Exception as _ce:
            logging.warning(f"[startup] casamentera cron: {_ce}")

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

        # F0.2 · Sub-F — Digest semanal asesor + Top colonias pre-compute
        try:
            from scheduler_f02 import register_f02_jobs
            if sched:
                register_f02_jobs(sched, db)
        except Exception as e:
            logging.warning(f"[f02] scheduler register failed: {e}")

        # W5.1 — AVM nightly retrain cron (03:00 UTC)
        try:
            from avm_retrain_cron import register_retrain_job, ensure_indexes as _avm_retrain_indexes
            await _avm_retrain_indexes(db)
            if sched:
                register_retrain_job(sched, db)
        except Exception as e:
            logging.warning(f"[w5.1] avm retrain scheduler register failed: {e}")

        # W5.3 — Forecast daily retrain (04:00 UTC, post-DRPI)
        try:
            from forecast_engine import ensure_indexes as _fc_indexes
            from forecast_retrain_cron import register_forecast_job
            await _fc_indexes(db)
            if sched:
                register_forecast_job(sched, db)
            logging.info("[w5.3] forecast retrain cron @ 04:00 UTC")
        except Exception as e:
            logging.warning(f"[w5.3] forecast retrain scheduler register failed: {e}")

        # W5.3 Parte 2A — Subscores reales recompute (02:30 UTC) + accuracy indexes
        try:
            from zone_subscores_cron import register_subscores_job, ensure_indexes as _subs_indexes
            from routes.forecast_accuracy import ensure_indexes as _fa_indexes
            await _subs_indexes(db)
            await _fa_indexes(db)
            if sched:
                register_subscores_job(sched, db)
            logging.info("[w5.3.p2a] subscores cron @ 02:30 UTC")
        except Exception as e:
            logging.warning(f"[w5.3.p2a] subscores/accuracy register failed: {e}")
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

    # W5.4 — Buyer Score Motor + Cron (02:45 UTC)
    try:
        from buyer_score_engine import ensure_buyer_score_indexes
        from routes.buyer_score import router as buyer_score_router
        await ensure_buyer_score_indexes(db)
        app.include_router(buyer_score_router)
        logging.info("[w5.4] buyer_score indexes OK · router registered")
    except Exception as e:
        logging.warning(f"[w5.4] buyer_score init failed: {e}")
    try:
        from buyer_score_cron import register_buyer_score_job
        if sched:
            register_buyer_score_job(sched, db)
        logging.info("[w5.4] buyer_score cron @ 02:45 UTC")
    except Exception as e:
        logging.warning(f"[w5.4] buyer_score cron register failed: {e}")

    # E5/M1 — close_probability auto-tuning (aprende de cierres reales) @ 04:30 UTC
    try:
        from close_probability_tuning import register_close_prob_tuning_cron
        if sched:
            register_close_prob_tuning_cron(sched, db)
    except Exception as e:
        logging.warning(f"[e5.m1] close_prob_tuning cron register failed: {e}")

    # W5.ASR.2 — Pipeline 7+2 Engine
    try:
        from pipeline_engine import ensure_indexes as pipeline_ensure_indexes, backfill_status_v2, reconcile_lead_activo
        # Paso 4b · sincroniza `activo` desde status ANTES de construir el índice único
        # de dedup (red de seguridad: ningún lead cerrado queda bloqueando un alta nueva)
        await reconcile_lead_activo(db)
        await pipeline_ensure_indexes(db)
        # Paso 3 · repara leads con status_v2 V1/inválido (idempotente)
        await backfill_status_v2(db)
        logging.info("[w5.asr.2] pipeline 7+2 engine init OK")
    except Exception as e:
        logging.warning(f"[w5.asr.2] pipeline engine init failed: {e}")

    # W5.ASR.4 Parte 1 — CMA Engine (Comparative Market Analysis)
    try:
        from cma_engine import ensure_indexes as cma_ensure_indexes
        from routes.cma import router as cma_router
        await cma_ensure_indexes(db)
        app.include_router(cma_router)
        logging.info("[w5.asr.4] cma engine init")
    except Exception as e:
        logging.warning(f"[w5.asr.4] cma engine init failed: {e}")

    # Batch 7 — Señales de feedback estructuradas (retro dev sin conversación + índice de demanda)
    try:
        from routes.feedback_signals import router as feedback_signals_router
        app.include_router(feedback_signals_router)
        logging.info("[batch7] feedback_signals router init")
    except Exception as e:
        logging.warning(f"[batch7] feedback_signals router init failed: {e}")

    # W5.ASR.3 Parte 1 — Smart Lists Engine (asesor)
    try:
        from routes.smart_lists import router as smart_lists_router
        app.include_router(smart_lists_router)
        logging.info("[w5.asr.3] smart_lists engine init")
    except Exception as e:
        logging.warning(f"[w5.asr.3] smart_lists engine init failed: {e}")

    # W5.ASR.3 Parte 2 — Auto-Nurture Cron (daily 05:00 UTC)
    try:
        from auto_nurture_cron import (
            ensure_indexes as auto_nurture_ensure_indexes,
            register_auto_nurture_job,
        )
        await auto_nurture_ensure_indexes(db)
        if sched:
            register_auto_nurture_job(sched, db)
        logging.info("[w5.asr.3] auto-nurture cron @ 05:00 UTC")
    except Exception as e:
        logging.warning(f"[w5.asr.3] auto-nurture cron register failed: {e}")

    # W5.ASR.5 Parte 1 — Lead Capture Engine (email alias + portales + FB Lead Ads + UTM)
    try:
        from lead_capture_engine import ensure_indexes as lce_ensure_indexes
        from routes.lead_capture import router as lead_capture_router
        await lce_ensure_indexes(db)
        app.include_router(lead_capture_router)
        logging.info("[w5.asr.5] lead capture engine init OK")
    except Exception as e:
        logging.warning(f"[w5.asr.5] lead capture engine init failed: {e}")

    # W5.11 Parte 1 — Entity Resolution + Audit Inmutable
    try:
        from entity_resolution_engine import ensure_indexes as er_ensure_indexes
        from audit_immutable_engine import ensure_indexes as audit_ensure_indexes
        from routes.entity_resolution import router as entity_resolution_router
        from entity_resolution_cron import register_jobs as er_register_jobs
        await er_ensure_indexes(db)
        await audit_ensure_indexes(db)
        app.include_router(entity_resolution_router)
        if sched:
            er_register_jobs(sched, db)
        logging.info("[w5.11] entity_resolution engine init OK")
    except Exception as e:
        logging.warning(f"[w5.11] entity_resolution engine init failed: {e}")

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

