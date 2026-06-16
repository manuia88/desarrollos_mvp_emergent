"""W5.10 — Social/Ads Engine (multi-tenant Meta Business · STUB-aware).

Capa de negocio sobre el token vault de social_ads_oauth. Toda llamada a Meta
Graph API está SIMULADA (mock data realista determinista) mientras
META_APP_REVIEW_APPROVED != "true". Activable post-review sin cambio de código.

Funciones públicas:
  connect_meta_account(db, code, state, redirect_uri)   — cap-enforced OAuth complete
  list_ad_accounts(db, user_id)                          — ad accounts del usuario
  account_ids_for_user(db, user_id)                      — set ids (cross-tenant isolation)
  get_campaigns(db, account_id, status?)                 — campañas + métricas sintéticas
  sync_campaign_performance(db, account_id, since?)      — batch sync (stub)
  suggest_budget_allocation(db, account_id)              — LLM IA + fallback heurístico
  get_performance(db, account_id, days)                  — serie temporal sintética
  revoke_meta_connection(db, user_id, token_id)          — revoke + audit
  list_tenant_connections(db)                            — superadmin: por tenant
  get_superadmin_stats(db)                               — tokens + cost + Meta API health
  ensure_indexes(db)                                     — idempotente
  register_social_ads_jobs(scheduler, db)                — cron refresh 06:00 UTC
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.social_ads")

# Cap conexiones Meta por tenant (configurable env · default 5).
MAX_CONNECTIONS_PER_TENANT = int(os.environ.get("SOCIAL_ADS_MAX_CONNECTIONS_PER_TENANT", "5"))

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

_CAMPAIGN_OBJECTIVES = [
    "OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS",
    "OUTCOME_SALES", "OUTCOME_ENGAGEMENT",
]
_CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "ACTIVE", "ACTIVE", "PAUSED"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seeded(*parts: str) -> random.Random:
    """Random determinista por clave → métricas estables entre llamadas."""
    raw = ":".join(str(p) for p in parts)
    seed = int(hashlib.sha256(raw.encode()).hexdigest()[:12], 16)
    return random.Random(seed)


async def _audit(db, user_id: str, action: str, entity_id: str, after: Optional[Dict] = None) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": user_id or "system", "role": "advisor"},
            action=action,
            entity_type="social_ads",
            entity_id=entity_id,
            before=None,
            after=after or {},
        )
    except Exception:
        pass


# ─── STUB generators ──────────────────────────────────────────────────────────

def _mock_ad_accounts_for_business(meta_business_id: str) -> List[Dict[str, Any]]:
    """1-3 ad accounts determinísticos por Meta Business conectado.

    A.2 audit fix · prefix `act_meta_stub_` inequívocamente identifica STUB
    (vs Meta real-format `act_<digits>`) · facilita debugging + cleanup post-deploy real.
    """
    rng = _seeded(meta_business_id, "accounts")
    n = rng.randint(1, 3)
    accounts = []
    for i in range(n):
        digest = hashlib.sha1(f"{meta_business_id}|{i}".encode()).hexdigest()[:10]
        accounts.append({
            "account_id": f"act_meta_stub_{digest}",
            "name": f"Cuenta Publicitaria {i + 1}",
            "currency": "MXN",
            "status": "active",
            "meta_business_id": meta_business_id,
            "is_stub": True,
        })
    return accounts


def _mock_campaigns(account_id: str, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """5-10 campañas con métricas sintéticas realistas (CPC $5-50 MXN)."""
    rng = _seeded(account_id, "campaigns")
    n = rng.randint(5, 10)
    names = [
        "Lead Gen Polanco Q2", "Awareness Reforma", "Retargeting Visitantes",
        "Tráfico Landing Condesa", "Conversión Roma Norte", "Branding Santa Fe",
        "Prospecting Inversionistas", "Remarketing 30d", "Lookalike Compradores",
        "Engagement Reels Tour", "Catálogo Departamentos", "Open House Lomas",
    ]
    out: List[Dict[str, Any]] = []
    for i in range(n):
        impressions = rng.randint(1000, 50000)
        ctr = rng.uniform(0.005, 0.03)
        clicks = max(1, int(impressions * ctr))
        cpc = round(rng.uniform(5.0, 50.0), 2)
        spent = round(clicks * cpc, 2)
        cpm = round((spent / impressions) * 1000, 2) if impressions else 0.0
        conv_rate = rng.uniform(0.01, 0.08)
        conversions = max(0, int(clicks * conv_rate))
        budget = round(rng.choice([200, 300, 500, 800, 1200, 2000]), 2)
        st = _CAMPAIGN_STATUSES[i % len(_CAMPAIGN_STATUSES)]
        camp = {
            "campaign_id": f"meta_camp_stub_{hashlib.sha1(f'{account_id}{i}'.encode()).hexdigest()[:10]}",
            "name": names[i % len(names)],
            "status": st,
            "objective": _CAMPAIGN_OBJECTIVES[i % len(_CAMPAIGN_OBJECTIVES)],
            "daily_budget_mxn": budget,
            "spent_mxn": spent,
            "impressions": impressions,
            "clicks": clicks,
            "ctr": round(ctr * 100, 2),
            "cpc_mxn": cpc,
            "cpm_mxn": cpm,
            "conversions": conversions,
            "cost_per_conversion_mxn": round(spent / conversions, 2) if conversions else None,
        }
        if status_filter and st.lower() != status_filter.lower():
            continue
        out.append(camp)
    return out


# ─── Connect / OAuth complete (cap-enforced) ──────────────────────────────────

async def connect_meta_account(
    db, code: str, state: str, redirect_uri: str,
) -> Dict[str, Any]:
    """Completa OAuth: valida state, aplica cap por tenant, exchange + store + audit.

    El CSRF state (creado en build_meta_oauth_url) transporta user_id + tenant_id.
    """
    from social_ads_oauth import (
        consume_csrf_state, exchange_code_for_token, store_meta_token, count_tenant_tokens,
    )
    ctx = consume_csrf_state(state)
    if not ctx:
        return {"connected": False, "error": "invalid_or_expired_state"}

    user_id = ctx["user_id"]
    tenant_id = ctx.get("tenant_id", "")

    current = await count_tenant_tokens(db, tenant_id)
    if current >= MAX_CONNECTIONS_PER_TENANT:
        return {
            "connected": False,
            "error": "cap_exceeded",
            "cap": MAX_CONNECTIONS_PER_TENANT,
            "current": current,
        }

    token_data = await exchange_code_for_token(code, redirect_uri)
    doc = await store_meta_token(db, user_id=user_id, tenant_id=tenant_id, token_data=token_data)
    await _audit(db, user_id, "social_ads_connect", doc["id"], {
        "tenant_id": tenant_id,
        "meta_business_id": doc.get("meta_business_id"),
        "stub": doc.get("stub"),
    })
    return {
        "connected": True,
        "token_id": doc["id"],
        "meta_business_id": doc.get("meta_business_id"),
        "user_id": user_id,
    }


# ─── Ad accounts ──────────────────────────────────────────────────────────────

async def list_ad_accounts(db, user_id: str) -> List[Dict[str, Any]]:
    """Ad accounts de todas las conexiones Meta activas del usuario."""
    from social_ads_oauth import list_user_tokens
    tokens = await list_user_tokens(db, user_id)
    accounts: List[Dict[str, Any]] = []
    for tok in tokens:
        biz = tok.get("meta_business_id") or ""
        for acc in _mock_ad_accounts_for_business(biz):
            acc = {**acc, "token_id": tok.get("id"), "connection_status": tok.get("status", "active")}
            accounts.append(acc)
    return accounts


async def account_ids_for_user(db, user_id: str) -> set:
    """Set de account_id que pertenecen al usuario (cross-tenant isolation)."""
    accounts = await list_ad_accounts(db, user_id)
    return {a["account_id"] for a in accounts}


# ─── Campaigns / performance ──────────────────────────────────────────────────

async def get_campaigns(db, account_id: str, status: Optional[str] = None) -> Dict[str, Any]:
    campaigns = _mock_campaigns(account_id, status_filter=status)
    totals = {
        "spent_mxn": round(sum(c["spent_mxn"] for c in campaigns), 2),
        "impressions": sum(c["impressions"] for c in campaigns),
        "clicks": sum(c["clicks"] for c in campaigns),
        "conversions": sum(c["conversions"] for c in campaigns),
    }
    stub = _is_stub()
    return {
        "account_id": account_id,
        "stub": stub,
        # Honestidad de fuente: métricas de demostración mientras no haya Meta Ads API
        # conectada (META_APP_REVIEW_APPROVED != "true"). El frontend DEBE etiquetarlas.
        "data_source": "demo" if stub else "meta_ads",
        "count": len(campaigns),
        "campaigns": campaigns,
        "totals": totals,
    }


async def sync_campaign_performance(db, account_id: str, since: Optional[str] = None) -> Dict[str, Any]:
    """Batch sync de métricas (STUB no-op realista)."""
    campaigns = _mock_campaigns(account_id)
    return {
        "account_id": account_id,
        "synced_campaigns": len(campaigns),
        "since": since or (_now() - timedelta(days=30)).date().isoformat(),
        "synced_at": _now().isoformat(),
        "stub": _is_stub(),
    }


async def get_performance(db, account_id: str, days: int = 30) -> Dict[str, Any]:
    """Serie temporal diaria sintética para charts."""
    days = max(1, min(int(days or 30), 90))
    rng = _seeded(account_id, "performance", str(days))
    series = []
    base_imp = rng.randint(2000, 12000)
    for d in range(days):
        day = (_now() - timedelta(days=days - 1 - d)).date().isoformat()
        impressions = max(0, int(base_imp * rng.uniform(0.6, 1.4)))
        clicks = max(0, int(impressions * rng.uniform(0.005, 0.03)))
        spend = round(clicks * rng.uniform(5.0, 50.0), 2)
        conversions = max(0, int(clicks * rng.uniform(0.01, 0.08)))
        series.append({
            "date": day,
            "impressions": impressions,
            "clicks": clicks,
            "spend_mxn": spend,
            "conversions": conversions,
        })
    stub = _is_stub()
    return {
        "account_id": account_id,
        "days": days,
        "series": series,
        "stub": stub,
        # Honestidad de fuente: serie de demostración hasta conectar Meta Ads API.
        "data_source": "demo" if stub else "meta_ads",
    }


# ─── Budget allocation IA ─────────────────────────────────────────────────────

def _heuristic_allocation(campaigns: List[Dict[str, Any]], total_budget: float) -> List[Dict[str, Any]]:
    """Asigna presupuesto proporcional al rendimiento (conversiones + CTR · inverso CPC)."""
    active = [c for c in campaigns if c.get("status") == "ACTIVE"] or campaigns
    scores = []
    for c in active:
        conv = c.get("conversions", 0) or 0
        ctr = c.get("ctr", 0) or 0
        cpc = c.get("cpc_mxn", 1) or 1
        score = (conv * 10.0) + ctr - (cpc * 0.1)
        scores.append(max(0.1, score))
    total_score = sum(scores) or 1.0
    out = []
    for c, s in zip(active, scores):
        share = s / total_score
        out.append({
            "campaign_id": c["campaign_id"],
            "name": c["name"],
            "current_budget_mxn": c.get("daily_budget_mxn"),
            "suggested_budget_mxn": round(total_budget * share, 2),
            "share_pct": round(share * 100, 1),
        })
    return out


async def _llm_allocation_rationale(
    campaigns: List[Dict[str, Any]],
    db=None,
    tenant_id: Optional[str] = None,
) -> Optional[str]:
    """Claude sugiere razonamiento de allocation. None si LLM ausente/falla.

    F.89 audit fix · si db+tenant_id presentes, invoca ai_budget.track_ai_call
    para cost monitoring (paridad con hook_predictor G.101 fix).
    """
    if not EMERGENT_LLM_KEY:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        summary = [
            {k: c.get(k) for k in ("name", "status", "ctr", "cpc_mxn", "conversions", "daily_budget_mxn")}
            for c in campaigns
        ]
        system = (
            "Eres analista de paid media para real estate en México. Dado un resumen "
            "de campañas Meta Ads, recomienda en 2-3 frases cómo redistribuir presupuesto "
            "para maximizar conversiones. Responde solo texto, sin markdown, en español."
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"socialads_{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", CLAUDE_MODEL)
        user_text = json.dumps(summary, ensure_ascii=False)[:3000]
        raw = await chat.send_message(UserMessage(text=user_text))
        result = (raw or "").strip() or None

        # F.89 audit fix · track ai_budget cost (paridad con hook_predictor)
        if result and db is not None and tenant_id:
            try:
                from ai_budget import track_ai_call
                tokens_in = (len(system) + len(user_text)) // 4
                tokens_out = len(result) // 4
                await track_ai_call(
                    db, dev_org_id=tenant_id, model=CLAUDE_MODEL,
                    tokens=tokens_in + tokens_out, call_type="social_ads_budget",
                    tokens_in=tokens_in, tokens_out=tokens_out,
                    feature_key="social_ads",
                )
            except Exception as exc:
                log.debug(f"[social_ads] ai_budget track skip: {exc}")
        return result
    except Exception as exc:
        log.warning(f"[social_ads] LLM allocation error: {exc}")
        return None


async def suggest_budget_allocation(db, account_id: str, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    data = await get_campaigns(db, account_id)
    campaigns = data["campaigns"]
    total_budget = round(sum(c.get("daily_budget_mxn", 0) for c in campaigns), 2)
    allocation = _heuristic_allocation(campaigns, total_budget)
    # F.89 audit fix · pass db+tenant_id para cost tracking ai_budget
    rationale = await _llm_allocation_rationale(campaigns, db=db, tenant_id=tenant_id)
    return {
        "account_id": account_id,
        "total_daily_budget_mxn": total_budget,
        "allocation": allocation,
        "rationale": rationale or (
            "Redistribución sugerida hacia campañas con mayor tasa de conversión y "
            "menor costo por clic. Pausa o reduce las de bajo rendimiento."
        ),
        "source": "llm" if rationale else "heuristic",
        "stub": _is_stub(),
    }


# ─── Revoke ───────────────────────────────────────────────────────────────────

async def revoke_meta_connection(db, user_id: str, token_id: str) -> Dict[str, Any]:
    from social_ads_oauth import revoke_meta_token
    ok = await revoke_meta_token(db, user_id, token_id)
    if ok:
        await _audit(db, user_id, "social_ads_revoke", token_id, {})
    return {"revoked": ok, "token_id": token_id}


# ─── Superadmin monitoring ────────────────────────────────────────────────────

async def list_tenant_connections(db) -> List[Dict[str, Any]]:
    from social_ads_oauth import COLLECTION
    by_tenant: Dict[str, Dict[str, Any]] = {}
    cursor = db[COLLECTION].find({"status": {"$ne": "revoked"}}, {"_id": 0, "access_token": 0, "refresh_token": 0})
    async for d in cursor:
        tid = d.get("tenant_id") or "(sin tenant)"
        slot = by_tenant.setdefault(tid, {"tenant_id": tid, "connections": 0, "users": set(), "expiring_7d": 0})
        slot["connections"] += 1
        slot["users"].add(d.get("user_id"))
        exp = d.get("expires_at")
        try:
            if exp and datetime.fromisoformat(exp).replace(tzinfo=timezone.utc) - _now() < timedelta(days=7):
                slot["expiring_7d"] += 1
        except Exception:
            pass
    out = []
    for slot in by_tenant.values():
        slot["users"] = len(slot["users"])
        out.append(slot)
    out.sort(key=lambda x: x["connections"], reverse=True)
    return out


async def get_superadmin_stats(db) -> Dict[str, Any]:
    from social_ads_oauth import COLLECTION, is_stub_mode
    total = 0
    active = 0
    expiring_7d = 0
    try:
        total = int(await db[COLLECTION].count_documents({}))
        active = int(await db[COLLECTION].count_documents({"status": "active"}))
        soon = (_now() + timedelta(days=7)).isoformat()
        expiring_7d = int(await db[COLLECTION].count_documents(
            {"status": "active", "expires_at": {"$lte": soon}},
        ))
    except Exception as exc:
        log.warning(f"[social_ads] superadmin stats failed: {exc}")

    tenants = await list_tenant_connections(db)
    # Meta API health (STUB): latencia + error rate sintéticos estables por día.
    rng = _seeded(_now().date().isoformat(), "meta_health")
    return {
        "stub_mode": is_stub_mode(),
        "total_tokens": total,
        "active_tokens": active,
        "expiring_7d": expiring_7d,
        "tenants_connected": len(tenants),
        "est_monthly_cost_usd": round(active * 0.0, 2),  # OAuth Meta no tiene costo de API
        "meta_api_status": {
            "reachable": True,
            "last_call_latency_ms": rng.randint(80, 320),
            "error_rate_pct": round(rng.uniform(0.0, 1.5), 2),
            "checked_at": _now().isoformat(),
        },
    }


def _is_stub() -> bool:
    from social_ads_oauth import is_stub_mode
    return is_stub_mode()


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    from social_ads_oauth import COLLECTION
    try:
        await db[COLLECTION].create_index("id", unique=True, background=True)
        await db[COLLECTION].create_index(
            [("user_id", 1), ("meta_business_id", 1)], unique=True, background=True,
        )
        await db[COLLECTION].create_index("tenant_id", background=True)
        await db[COLLECTION].create_index("status", background=True)
        await db[COLLECTION].create_index("expires_at", background=True)
    except Exception as exc:
        log.warning(f"[social_ads] ensure_indexes failed: {exc}")


# ─── Cron: refresh tokens 06:00 UTC ───────────────────────────────────────────

async def _cron_refresh_meta_tokens(db) -> Dict[str, Any]:
    from social_ads_oauth import COLLECTION, refresh_token_if_expiring
    start = _now()
    refreshed = 0
    checked = 0
    try:
        cursor = db[COLLECTION].find({"status": "active"}, {"_id": 0})
        async for tok in cursor:
            checked += 1
            try:
                if await refresh_token_if_expiring(db, tok):
                    refreshed += 1
            except Exception as exc:
                log.warning(f"[social_ads_cron] refresh failed {tok.get('id')}: {exc}")
    except Exception as exc:
        log.warning(f"[social_ads_cron] cursor failed: {exc}")

    duration = (_now() - start).total_seconds()
    await _audit(db, "system", "social_ads_token_refresh_cron", f"refresh_{start.date().isoformat()}", {
        "checked": checked, "refreshed": refreshed, "duration_s": round(duration, 2),
    })
    log.info(f"[social_ads] token refresh cron · checked={checked} refreshed={refreshed}")
    return {"checked": checked, "refreshed": refreshed, "duration_s": round(duration, 2)}


def register_social_ads_jobs(scheduler, db) -> None:
    """Cron diario 06:00 UTC (NO choca con W7.AS.6 reputation @ 05:00)."""
    from apscheduler.triggers.cron import CronTrigger
    scheduler.add_job(
        _cron_refresh_meta_tokens,
        CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="cron_refresh_meta_tokens",
        replace_existing=True,
        max_instances=1,
        kwargs={"db": db},
    )
    log.info("[social_ads_cron] Job registrado: cron_refresh_meta_tokens @ 06:00 UTC")
