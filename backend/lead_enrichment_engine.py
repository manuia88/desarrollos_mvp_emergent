"""W7.AS.1 · Lead Enrichment Engine (Clay-style).

Waterfall lookup pattern: prueba múltiples fuentes en cadena, cada step cachea
su resultado, partial_success válido (FAIL-OPEN). Resuelve datos profesionales
sobre un lead a partir de email/teléfono/nombre.

Fuentes (en orden):
    1. email_validation     → MX records + sintaxis (stdlib · gratis)
    2. linkedin_pdl         → PeopleDataLabs API (PDL_API_KEY · stub si missing)
    3. company_clearbit     → Clearbit Enrichment (CLEARBIT_API_KEY · stub si missing)
    4. ai_research_summary  → Claude Sonnet 4.5 resume contexto profesional

Cache: `lead_enrichment_cache` colección · 30d TTL · key=sha256(email+phone).
Cost tracking: ai_budget.track_ai_call + audit_immutable.log.
Cap por tenant: env LEAD_ENRICHMENT_DAILY_CAP_PER_TENANT (default 100).

Collections:
    - lead_enrichment_cache         (resultados consolidados · key, data, fetched_at)
    - lead_enrichment_runs          (audit por ejecución · cost · sources · tenant)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.lead_enrichment_engine")

# ─── Config ───────────────────────────────────────────────────────────────────

CACHE_TTL_DAYS = int(os.environ.get("LEAD_ENRICHMENT_CACHE_TTL_DAYS", "30"))
DAILY_CAP_PER_TENANT = int(os.environ.get("LEAD_ENRICHMENT_DAILY_CAP_PER_TENANT", "100"))

PDL_API_KEY = os.environ.get("PDL_API_KEY", "")
CLEARBIT_API_KEY = os.environ.get("CLEARBIT_API_KEY", "")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# Cost estimates (USD per call, approx)
COST_EMAIL_VALIDATION_USD = 0.0    # stdlib free
COST_PDL_USD = 0.08                # ~$0.08 per match
COST_CLEARBIT_USD = 0.06           # ~$0.06 per match
COST_LLM_USD_BASE = 0.012          # ~600 tokens in/out

SOURCES_PREFERENCE_ORDER = ("linkedin_pdl", "company_clearbit", "ai_research_summary")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
DISPOSABLE_DOMAINS = {
    "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
    "throwaway.email", "yopmail.com", "trashmail.com",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cache_key(email: Optional[str], phone: Optional[str]) -> str:
    raw = f"{(email or '').strip().lower()}|{(phone or '').strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _run_id() -> str:
    return f"enr_{uuid.uuid4().hex[:14]}"


# ─── Connectors ───────────────────────────────────────────────────────────────

async def _lookup_email(email: Optional[str]) -> Dict[str, Any]:
    """Connector 1 · email syntactic + domain MX check (stdlib · gratis).

    Returns {success, data:{valid, disposable, domain, mx_present}, source, cost_usd, cached}
    """
    if not email:
        return {"success": False, "source": "email_validation",
                "reason": "no_email", "cost_usd": 0.0, "cached": False}
    e = email.strip().lower()
    if not EMAIL_RE.match(e):
        return {"success": True, "source": "email_validation",
                "data": {"valid": False, "reason": "syntax", "disposable": False,
                         "domain": e.split("@")[-1] if "@" in e else None,
                         "mx_present": False},
                "cost_usd": 0.0, "cached": False}

    domain = e.split("@")[-1]
    disposable = domain in DISPOSABLE_DOMAINS

    # MX records (lazy import dnspython si está disponible · fail-open)
    mx_present = None
    try:
        import dns.resolver  # type: ignore
        try:
            answers = dns.resolver.resolve(domain, "MX", lifetime=3.0)
            mx_present = len(list(answers)) > 0
        except Exception:
            mx_present = False
    except ImportError:
        mx_present = None  # dnspython no instalado · skip MX check

    return {
        "success": True,
        "source": "email_validation",
        "data": {
            "valid": True,
            "disposable": disposable,
            "domain": domain,
            "mx_present": mx_present,
        },
        "cost_usd": COST_EMAIL_VALIDATION_USD,
        "cached": False,
    }


async def _lookup_linkedin_pdl(email: Optional[str], phone: Optional[str],
                               full_name: Optional[str]) -> Dict[str, Any]:
    """Connector 2 · PeopleDataLabs lookup → LinkedIn URL + role + headline.

    Stub-aware: si PDL_API_KEY missing → status="skipped".
    """
    if not PDL_API_KEY:
        return {"success": False, "source": "linkedin_pdl",
                "status": "skipped", "reason": "PDL_API_KEY no configurado",
                "cost_usd": 0.0, "cached": False}

    if not email and not phone:
        return {"success": False, "source": "linkedin_pdl",
                "status": "skipped", "reason": "no_identifier",
                "cost_usd": 0.0, "cached": False}

    try:
        import httpx  # type: ignore
    except ImportError:
        return {"success": False, "source": "linkedin_pdl",
                "status": "skipped", "reason": "httpx_missing",
                "cost_usd": 0.0, "cached": False}

    params: Dict[str, Any] = {}
    if email:
        params["email"] = email.strip().lower()
    if phone:
        params["phone"] = phone.strip()
    if full_name:
        params["name"] = full_name.strip()

    headers = {"X-Api-Key": PDL_API_KEY, "Accept": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.peopledatalabs.com/v5/person/enrich",
                params=params, headers=headers,
            )
            if resp.status_code == 404:
                return {"success": False, "source": "linkedin_pdl",
                        "status": "no_match", "cost_usd": COST_PDL_USD * 0.1,
                        "cached": False}
            if resp.status_code != 200:
                return {"success": False, "source": "linkedin_pdl",
                        "status": "error", "reason": f"http_{resp.status_code}",
                        "cost_usd": 0.0, "cached": False}
            body = resp.json() or {}
            person = body.get("data") or {}
    except Exception as exc:
        log.warning(f"[lead_enrichment] PDL lookup failed: {exc}")
        return {"success": False, "source": "linkedin_pdl",
                "status": "error", "reason": str(exc)[:120],
                "cost_usd": 0.0, "cached": False}

    data = {
        "full_name": person.get("full_name"),
        "linkedin_url": person.get("linkedin_url"),
        "headline": person.get("headline"),
        "job_title": person.get("job_title"),
        "job_company_name": person.get("job_company_name"),
        "job_company_industry": person.get("job_company_industry"),
        "location_name": person.get("location_name"),
    }
    # solo cuenta como success si al menos linkedin_url o job_title
    if not data["linkedin_url"] and not data["job_title"]:
        return {"success": False, "source": "linkedin_pdl",
                "status": "no_match", "cost_usd": COST_PDL_USD * 0.1,
                "cached": False}

    return {"success": True, "source": "linkedin_pdl",
            "data": data, "cost_usd": COST_PDL_USD, "cached": False}


async def _lookup_company_clearbit(email: Optional[str]) -> Dict[str, Any]:
    """Connector 3 · Clearbit company enrichment desde dominio del email.

    Stub-aware: si CLEARBIT_API_KEY missing → status="skipped".
    """
    if not CLEARBIT_API_KEY:
        return {"success": False, "source": "company_clearbit",
                "status": "skipped", "reason": "CLEARBIT_API_KEY no configurado",
                "cost_usd": 0.0, "cached": False}

    if not email or "@" not in email:
        return {"success": False, "source": "company_clearbit",
                "status": "skipped", "reason": "no_email_domain",
                "cost_usd": 0.0, "cached": False}

    domain = email.strip().lower().split("@")[-1]
    # No buscar empresas para gmail/hotmail/etc
    if domain in {"gmail.com", "hotmail.com", "yahoo.com", "outlook.com",
                  "icloud.com", "live.com", "me.com", "protonmail.com"}:
        return {"success": False, "source": "company_clearbit",
                "status": "skipped", "reason": "personal_email_domain",
                "cost_usd": 0.0, "cached": False}

    try:
        import httpx  # type: ignore
    except ImportError:
        return {"success": False, "source": "company_clearbit",
                "status": "skipped", "reason": "httpx_missing",
                "cost_usd": 0.0, "cached": False}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://company.clearbit.com/v2/companies/find?domain={domain}",
                headers={"Authorization": f"Bearer {CLEARBIT_API_KEY}"},
            )
            if resp.status_code == 404:
                return {"success": False, "source": "company_clearbit",
                        "status": "no_match", "cost_usd": COST_CLEARBIT_USD * 0.1,
                        "cached": False}
            if resp.status_code != 200:
                return {"success": False, "source": "company_clearbit",
                        "status": "error", "reason": f"http_{resp.status_code}",
                        "cost_usd": 0.0, "cached": False}
            body = resp.json() or {}
    except Exception as exc:
        log.warning(f"[lead_enrichment] Clearbit lookup failed: {exc}")
        return {"success": False, "source": "company_clearbit",
                "status": "error", "reason": str(exc)[:120],
                "cost_usd": 0.0, "cached": False}

    data = {
        "company_name": body.get("name"),
        "company_domain": body.get("domain"),
        "company_industry": (body.get("category") or {}).get("industry"),
        "company_size": body.get("metrics", {}).get("employees") if isinstance(
            body.get("metrics"), dict) else None,
        "company_location": (body.get("geo") or {}).get("city"),
        "company_description": body.get("description"),
    }
    if not data["company_name"]:
        return {"success": False, "source": "company_clearbit",
                "status": "no_match", "cost_usd": COST_CLEARBIT_USD * 0.1,
                "cached": False}

    return {"success": True, "source": "company_clearbit",
            "data": data, "cost_usd": COST_CLEARBIT_USD, "cached": False}


async def _lookup_ai_research_summary(
    db,
    lead_context: Dict[str, Any],
    prior_results: List[Dict[str, Any]],
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Connector 4 · Claude Sonnet resume contexto profesional consolidado.

    Stub-aware: si EMERGENT_LLM_KEY missing → status="skipped".
    """
    if not EMERGENT_LLM_KEY:
        return {"success": False, "source": "ai_research_summary",
                "status": "skipped", "reason": "EMERGENT_LLM_KEY no configurado",
                "cost_usd": 0.0, "cached": False}

    # Construir contexto desde prior_results
    facts: List[str] = []
    for r in prior_results:
        if not r.get("success"):
            continue
        d = r.get("data") or {}
        for k, v in d.items():
            if v and isinstance(v, (str, int, float, bool)):
                facts.append(f"- {k}: {v}")
    ctx_block = "\n".join(facts) if facts else "(sin datos de connectors previos)"

    lead_email = (lead_context.get("email") or "").strip()
    lead_name = (lead_context.get("full_name") or lead_context.get("name") or "").strip()

    system_prompt = (
        "Eres un research analyst inmobiliario. Resume el contexto profesional "
        "de un lead en 2-3 oraciones (60-100 palabras). Foco en señales de "
        "capacidad de compra / fit con desarrollo premium CDMX. "
        "Si datos insuficientes, sé honesto. Tono profesional · responde solo el resumen."
    )
    user_prompt = (
        f"Lead:\n- email: {lead_email}\n- nombre: {lead_name}\n\n"
        f"Datos enriquecidos:\n{ctx_block}\n\n"
        "Genera el resumen profesional (2-3 oraciones)."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
    except ImportError:
        return {"success": False, "source": "ai_research_summary",
                "status": "skipped", "reason": "emergentintegrations_missing",
                "cost_usd": 0.0, "cached": False}

    session_key = f"lead_enrich_{uuid.uuid4().hex[:10]}"
    model = "claude-sonnet-4-5-20250929"

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=session_key,
            system_message=system_prompt,
        ).with_model("anthropic", model)
        resp = await chat.send_message(UserMessage(text=user_prompt))
        summary = (resp or "").strip()
    except Exception as exc:
        log.warning(f"[lead_enrichment] LLM summary failed: {exc}")
        return {"success": False, "source": "ai_research_summary",
                "status": "error", "reason": str(exc)[:120],
                "cost_usd": 0.0, "cached": False}

    if not summary or len(summary) < 20:
        return {"success": False, "source": "ai_research_summary",
                "status": "no_match", "reason": "empty_response",
                "cost_usd": COST_LLM_USD_BASE * 0.3, "cached": False}

    # Track AI call (fire-and-forget)
    try:
        from ai_budget import track_ai_call
        tokens_in = len(user_prompt + system_prompt) // 4
        tokens_out = len(summary) // 4
        if tenant_id:
            await track_ai_call(
                db, dev_org_id=tenant_id, model=model,
                tokens=tokens_in + tokens_out, call_type="lead_enrichment",
                tokens_in=tokens_in, tokens_out=tokens_out,
                feature_key="lead_enrichment",
            )
    except Exception as exc:
        log.debug(f"[lead_enrichment] ai_budget track skip: {exc}")

    return {
        "success": True, "source": "ai_research_summary",
        "data": {"summary": summary[:1200]},
        "cost_usd": COST_LLM_USD_BASE, "cached": False,
    }


# ─── Merge + cache + waterfall orchestrator ───────────────────────────────────

def _merge_enriched_data(connectors_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Consolida resultados de connectors en un dict plano de enriched_fields.

    Resuelve conflicts según SOURCES_PREFERENCE_ORDER: PDL > Clearbit > AI.
    """
    merged: Dict[str, Any] = {}
    sources_used: List[str] = []

    # Email validation siempre primero (no conflict)
    for r in connectors_results:
        if r.get("source") == "email_validation" and r.get("success"):
            d = r.get("data") or {}
            merged["email_valid"] = d.get("valid")
            merged["email_disposable"] = d.get("disposable")
            merged["email_domain"] = d.get("domain")
            merged["email_mx_present"] = d.get("mx_present")
            sources_used.append("email_validation")

    # Apply each preferred source · later sources NO override existing keys
    for pref in SOURCES_PREFERENCE_ORDER:
        for r in connectors_results:
            if r.get("source") != pref or not r.get("success"):
                continue
            d = r.get("data") or {}
            for k, v in d.items():
                if v is not None and v != "" and k not in merged:
                    merged[k] = v
            if pref not in sources_used:
                sources_used.append(pref)

    return {"enriched_fields": merged, "sources_used": sources_used}


def _compute_confidence(connectors_results: List[Dict[str, Any]]) -> float:
    """Confidence 0.0-1.0 basado en cuántos connectors retornaron datos útiles."""
    weights = {
        "email_validation": 0.15,
        "linkedin_pdl": 0.40,
        "company_clearbit": 0.25,
        "ai_research_summary": 0.20,
    }
    score = 0.0
    for r in connectors_results:
        if r.get("success"):
            score += weights.get(r.get("source"), 0.0)
    return round(min(score, 1.0), 3)


async def _read_cache(db, key: str) -> Optional[Dict[str, Any]]:
    if db is None:
        return None
    try:
        doc = await db.lead_enrichment_cache.find_one({"key": key}, {"_id": 0})
    except Exception:
        return None
    if not doc:
        return None
    fetched_at = doc.get("fetched_at")
    if isinstance(fetched_at, datetime):
        age = _now() - fetched_at
        if age > timedelta(days=CACHE_TTL_DAYS):
            return None
    return doc


async def _write_cache(db, key: str, payload: Dict[str, Any]) -> None:
    if db is None:
        return
    try:
        await db.lead_enrichment_cache.update_one(
            {"key": key},
            {"$set": {**payload, "key": key, "fetched_at": _now()}},
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[lead_enrichment] cache write failed: {exc}")


async def _check_daily_cap(db, tenant_id: Optional[str], is_superadmin: bool = False) -> Tuple[bool, int]:
    """Returns (allowed, used_today). Superadmin bypass."""
    if is_superadmin or not tenant_id or db is None:
        return True, 0
    try:
        since = _now() - timedelta(days=1)
        used = await db.lead_enrichment_runs.count_documents({
            "tenant_id": tenant_id, "started_at": {"$gte": since},
        })
    except Exception:
        return True, 0  # FAIL-OPEN
    return used < DAILY_CAP_PER_TENANT, used


async def enrich_lead(
    db,
    lead_id: str,
    lead_data: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
    actor: Optional[Dict[str, Any]] = None,
    force_refresh: bool = False,
    is_superadmin: bool = False,
) -> Dict[str, Any]:
    """Ejecuta waterfall completo · retorna consolidated payload.

    Args:
        lead_data: opcional dict {email, phone, full_name} si no se desea fetch
                   desde db.leads (útil en tests / endpoints standalone).
        force_refresh: skip cache si True.
    """
    started_at = _now()

    # Fetch lead si no fue provisto
    lead_doc = lead_data
    if lead_doc is None and db is not None:
        try:
            lead_doc = await db.leads.find_one(
                {"$or": [{"id": lead_id}, {"lead_id": lead_id}]},
                {"_id": 0, "email": 1, "phone": 1, "full_name": 1, "name": 1,
                 "tenant_id": 1},
            ) or {}
        except Exception:
            lead_doc = {}

    if not lead_doc:
        return {
            "status": "error", "reason": "lead_not_found",
            "lead_id": lead_id,
        }

    email = (lead_doc.get("email") or "").strip().lower() or None
    phone = (lead_doc.get("phone") or "").strip() or None
    full_name = (lead_doc.get("full_name") or lead_doc.get("name") or "").strip() or None
    eff_tenant = tenant_id or lead_doc.get("tenant_id")

    # Cap check
    allowed, used = await _check_daily_cap(db, eff_tenant, is_superadmin=is_superadmin)
    if not allowed:
        return {
            "status": "rate_limited", "reason": "daily_cap_exceeded",
            "lead_id": lead_id, "tenant_id": eff_tenant,
            "used_today": used, "cap": DAILY_CAP_PER_TENANT,
        }

    cache_key = _cache_key(email, phone)

    # Cache lookup
    if not force_refresh:
        cached = await _read_cache(db, cache_key)
        if cached:
            return {
                "status": "ok_cached", "lead_id": lead_id, "tenant_id": eff_tenant,
                "enriched_fields": cached.get("enriched_fields") or {},
                "sources_used": cached.get("sources_used") or [],
                "confidence": cached.get("confidence", 0.0),
                "cost_usd": 0.0,  # cached = no cost
                "cached": True,
                "cached_at": (cached.get("fetched_at").isoformat()
                              if isinstance(cached.get("fetched_at"), datetime)
                              else None),
                "duration_ms": int((_now() - started_at).total_seconds() * 1000),
            }

    # Waterfall execution (FAIL-OPEN: 1 connector fail no aborta los demás)
    results: List[Dict[str, Any]] = []
    total_cost = 0.0

    r1 = await _lookup_email(email)
    results.append(r1)
    total_cost += r1.get("cost_usd", 0.0)

    r2 = await _lookup_linkedin_pdl(email, phone, full_name)
    results.append(r2)
    total_cost += r2.get("cost_usd", 0.0)

    r3 = await _lookup_company_clearbit(email)
    results.append(r3)
    total_cost += r3.get("cost_usd", 0.0)

    r4 = await _lookup_ai_research_summary(
        db,
        lead_context={"email": email, "full_name": full_name, "phone": phone},
        prior_results=results,
        tenant_id=eff_tenant,
    )
    results.append(r4)
    total_cost += r4.get("cost_usd", 0.0)

    merged = _merge_enriched_data(results)
    confidence = _compute_confidence(results)

    success_count = sum(1 for r in results if r.get("success"))
    status = (
        "ok" if success_count >= 2 else
        "partial_success" if success_count >= 1 else
        "no_match"
    )

    payload = {
        "status": status,
        "lead_id": lead_id,
        "tenant_id": eff_tenant,
        "enriched_fields": merged["enriched_fields"],
        "sources_used": merged["sources_used"],
        "connectors_results": [
            {"source": r.get("source"), "success": bool(r.get("success")),
             "status": r.get("status"), "reason": r.get("reason"),
             "cost_usd": round(r.get("cost_usd", 0.0), 4)}
            for r in results
        ],
        "confidence": confidence,
        "cost_usd": round(total_cost, 4),
        "cached": False,
        "duration_ms": int((_now() - started_at).total_seconds() * 1000),
    }

    # Cache write (sólo si status != error)
    if status != "error":
        await _write_cache(db, cache_key, {
            "lead_id": lead_id,
            "tenant_id": eff_tenant,
            "enriched_fields": merged["enriched_fields"],
            "sources_used": merged["sources_used"],
            "confidence": confidence,
        })

    # Audit run log
    try:
        if db is not None:
            await db.lead_enrichment_runs.insert_one({
                "id": _run_id(),
                "lead_id": lead_id,
                "tenant_id": eff_tenant,
                "started_at": started_at,
                "finished_at": _now(),
                "status": status,
                "sources_used": merged["sources_used"],
                "cost_usd": round(total_cost, 4),
                "confidence": confidence,
                "actor_user_id": (actor or {}).get("user_id"),
                "actor_role": (actor or {}).get("role"),
                "force_refresh": force_refresh,
            })
    except Exception as exc:
        log.warning(f"[lead_enrichment] runs insert failed: {exc}")

    # Immutable audit (best-effort)
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor=actor or {"user_id": "system", "role": "system"},
            action="lead_enrichment.run",
            entity_type="lead",
            entity_id=lead_id,
            before=None,
            after={"status": status, "sources": merged["sources_used"],
                   "cost_usd": round(total_cost, 4)},
        )
    except Exception as exc:
        log.debug(f"[lead_enrichment] audit skip: {exc}")

    return payload


async def get_cached_enrichment(db, lead_id: str) -> Dict[str, Any]:
    """Retorna cache para un lead si existe (sin gatillar nuevo run)."""
    if db is None:
        return {"status": "no_db"}
    try:
        lead_doc = await db.leads.find_one(
            {"$or": [{"id": lead_id}, {"lead_id": lead_id}]},
            {"_id": 0, "email": 1, "phone": 1},
        ) or {}
    except Exception:
        lead_doc = {}
    if not lead_doc:
        return {"status": "lead_not_found", "lead_id": lead_id}

    key = _cache_key(lead_doc.get("email"), lead_doc.get("phone"))
    cached = await _read_cache(db, key)
    if not cached:
        return {"status": "not_cached", "lead_id": lead_id}
    return {
        "status": "ok",
        "lead_id": lead_id,
        "enriched_fields": cached.get("enriched_fields") or {},
        "sources_used": cached.get("sources_used") or [],
        "confidence": cached.get("confidence", 0.0),
        "cached_at": (cached.get("fetched_at").isoformat()
                      if isinstance(cached.get("fetched_at"), datetime)
                      else None),
    }


async def get_stats(db, tenant_id: Optional[str] = None, days: int = 30) -> Dict[str, Any]:
    """Stats agregados para superadmin dashboard."""
    if db is None:
        return {"status": "no_db"}

    since = _now() - timedelta(days=max(1, min(days, 365)))
    match: Dict[str, Any] = {"started_at": {"$gte": since}}
    if tenant_id:
        match["tenant_id"] = tenant_id

    try:
        total = await db.lead_enrichment_runs.count_documents(match)
    except Exception:
        total = 0

    success_count = 0
    avg_cost = 0.0
    total_cost = 0.0
    by_source: Dict[str, int] = {}
    by_tenant: Dict[str, Dict[str, Any]] = {}

    try:
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": None,
                "successes": {"$sum": {"$cond": [
                    {"$in": ["$status", ["ok", "partial_success", "ok_cached"]]}, 1, 0,
                ]}},
                "total_cost": {"$sum": "$cost_usd"},
                "avg_cost": {"$avg": "$cost_usd"},
                "avg_confidence": {"$avg": "$confidence"},
            }},
        ]
        cursor = db.lead_enrichment_runs.aggregate(pipeline)
        async for doc in cursor:
            success_count = int(doc.get("successes") or 0)
            total_cost = round(float(doc.get("total_cost") or 0.0), 4)
            avg_cost = round(float(doc.get("avg_cost") or 0.0), 4)
    except Exception as exc:
        log.warning(f"[lead_enrichment] stats agg failed: {exc}")

    # by source breakdown
    try:
        cursor2 = db.lead_enrichment_runs.aggregate([
            {"$match": match},
            {"$unwind": "$sources_used"},
            {"$group": {"_id": "$sources_used", "count": {"$sum": 1}}},
        ])
        async for doc in cursor2:
            by_source[doc["_id"]] = int(doc.get("count") or 0)
    except Exception:
        pass

    # by tenant (top 20)
    try:
        cursor3 = db.lead_enrichment_runs.aggregate([
            {"$match": match},
            {"$group": {
                "_id": "$tenant_id",
                "count": {"$sum": 1},
                "cost": {"$sum": "$cost_usd"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ])
        async for doc in cursor3:
            tid = doc.get("_id") or "unknown"
            by_tenant[tid] = {
                "count": int(doc.get("count") or 0),
                "cost_usd": round(float(doc.get("cost") or 0.0), 4),
                "near_cap": int(doc.get("count") or 0) >= int(DAILY_CAP_PER_TENANT * 0.8),
            }
    except Exception:
        pass

    success_rate = round(success_count / total, 3) if total else 0.0

    return {
        "status": "ok",
        "days": days,
        "tenant_id": tenant_id,
        "totals": {
            "total_enriched": total,
            "success_rate": success_rate,
            "total_cost_usd": total_cost,
            "avg_cost_usd": avg_cost,
        },
        "by_source": by_source,
        "by_tenant": by_tenant,
        "cap_per_tenant_daily": DAILY_CAP_PER_TENANT,
    }


async def ensure_indexes(db) -> None:
    """Idempotent index creation."""
    if db is None:
        return
    try:
        await db.lead_enrichment_cache.create_index("key", unique=True)
        await db.lead_enrichment_cache.create_index("fetched_at")
        await db.lead_enrichment_cache.create_index("lead_id")
        await db.lead_enrichment_runs.create_index("id", unique=True)
        await db.lead_enrichment_runs.create_index(
            [("tenant_id", 1), ("started_at", -1)],
        )
        await db.lead_enrichment_runs.create_index("lead_id")
        await db.lead_enrichment_runs.create_index("started_at")
    except Exception as exc:
        log.warning(f"[lead_enrichment_engine] ensure_indexes warning: {exc}")
