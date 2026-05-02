"""Phase 4 Batch 4.4 — AI Engine + Analytics.

Sub-chunks:
  4.35  Lead Heat AI Score          Claude haiku scoring batch + on-demand
  4.36  AI Summary + Recommendations Claude coaching summary cached 4h
  4.37  Analytics Cancel Reasons    Aggregations of B4.3 captured data
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

log = logging.getLogger("dmx.batch4_4")
router = APIRouter(tags=["batch4.4"])

# In-memory cache for AI summary expiry & rate-limit (ephemeral, no Redis required)
_AI_SUMMARY_RATE: Dict[str, datetime] = {}     # lead_id → last refresh ts
_HEAT_QUEUE_LOCK = False                       # naive in-process lock for batch run

CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _db(request: Request):
    return request.app.state.db


async def _auth(request: Request):
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(401, "No autenticado")
    return user


async def _safe_audit_ml(
    db, actor, *, action: str, entity_type: str, entity_id: str,
    before: Optional[Dict] = None, after: Optional[Dict] = None,
    request: Optional[Request] = None,
    ml_event: Optional[str] = None, ml_context: Optional[Dict] = None,
) -> None:
    try:
        from audit_log import log_mutation
        await log_mutation(db, actor, action, entity_type, entity_id, before, after, request=request)
    except Exception:
        pass
    if ml_event:
        try:
            from observability import emit_ml_event
            uid = getattr(actor, "user_id", None) or (actor.get("user_id") if isinstance(actor, dict) else "system")
            role = getattr(actor, "role", None) or (actor.get("role") if isinstance(actor, dict) else "system")
            org = getattr(actor, "tenant_id", None) or (actor.get("tenant_id") if isinstance(actor, dict) else "dmx")
            await emit_ml_event(
                db, event_type=ml_event, user_id=uid or "system",
                org_id=org or "dmx", role=role or "system",
                context=ml_context or {}, ai_decision={}, user_action={},
            )
        except Exception:
            pass


async def _claude_json(*, system: str, user_text: str, session_id: str, max_chars: int = 4000) -> Optional[Dict]:
    """Call Claude haiku-4-5 and parse JSON response. Returns None on failure."""
    if not EMERGENT_LLM_KEY:
        log.warning("[batch4.4] EMERGENT_LLM_KEY not set — claude call skipped")
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system + "\n\nResponde EXCLUSIVAMENTE con JSON válido (sin markdown, sin backticks). Si no puedes evaluar, responde {\"error\":\"no_data\"}.",
        ).with_model("anthropic", CLAUDE_HAIKU_MODEL)
        msg = UserMessage(text=user_text[:max_chars])
        raw = await chat.send_message(msg)
        # Strip code fences just in case
        text = (raw or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
        return json.loads(text)
    except Exception as e:
        log.warning(f"[batch4.4] claude call failed: {e}")
        return None


# ═════════════════════════════════════════════════════════════════════════════
# 4.35 · LEAD HEAT AI SCORE
# ═════════════════════════════════════════════════════════════════════════════
HEAT_TAG_MAP = [(70, "caliente"), (40, "tibio"), (0, "frio")]


def _heat_tag_for(score: int) -> str:
    for thr, tag in HEAT_TAG_MAP:
        if score >= thr:
            return tag
    return "frio"


def _payment_weight(pms: List[str]) -> int:
    """recursos_propios > hipotecario > infonavit > otros."""
    if not pms:
        return 5
    if "recursos_propios" in pms:
        return 25
    if "hipotecario" in pms or "credito_hipotecario" in pms:
        return 18
    if "infonavit" in pms or "fovissste" in pms:
        return 12
    return 8


def _source_weight(source: Optional[str]) -> int:
    return {"web_form": 18, "asesor_referral": 16, "caya_bot": 14, "feria": 12,
            "cita_form": 14, "erp_webhook": 10, "manual": 8}.get(source or "manual", 6)


def _budget_realism(lead: Dict, project: Optional[Dict]) -> tuple[int, str]:
    """Return (score 0-25, explanation)."""
    br = lead.get("budget_range") or {}
    b_max = br.get("max") or 0
    if not project or not b_max:
        return 8, "Presupuesto no comparable"
    # Prefer project price band if present
    price_min = (project.get("price_band") or {}).get("min") or project.get("price_min") or 0
    price_max = (project.get("price_band") or {}).get("max") or project.get("price_max") or 0
    if price_min and b_max < price_min * 0.8:
        return 4, "Presupuesto subexpuesto al rango del proyecto"
    if price_max and b_max > price_max * 1.4:
        return 10, "Presupuesto holgado (sobreexpuesto)"
    return 22, "Presupuesto realista al rango del proyecto"


async def _asesor_track(db, asesor_id: Optional[str]) -> Dict:
    """Compute lightweight asesor metrics (close_rate, avg ttl)."""
    if not asesor_id:
        return {"close_rate": 0, "leads_total": 0}
    leads = await db.leads.find(
        {"assigned_to": asesor_id}, {"_id": 0, "status": 1, "created_at": 1, "updated_at": 1}
    ).to_list(500)
    total = len(leads)
    closed_won = sum(1 for ld in leads if ld.get("status") == "cerrado_ganado")
    return {"close_rate": round(100 * closed_won / max(total, 1)), "leads_total": total}


async def _client_history(db, client_global_id: Optional[str], current_lead_id: str) -> Dict:
    if not client_global_id:
        return {"prior_leads": 0, "abandonments": 0}
    leads = await db.leads.find(
        {"client_global_id": client_global_id, "id": {"$ne": current_lead_id}},
        {"_id": 0, "status": 1}
    ).to_list(50)
    return {
        "prior_leads": len(leads),
        "abandonments": sum(1 for ld in leads if ld.get("status") in ("cerrado_perdido", "cancelado")),
    }


async def compute_heat_for_lead(db, lead: Dict) -> Dict:
    """Heuristic + Claude scoring. Returns {score, tag, factors, calculated_at}."""
    project = None
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            if d["id"] == lead.get("project_id"):
                project = d
                break
    except Exception:
        pass

    pms = lead.get("payment_methods") or []
    source = lead.get("source")
    days_old = 0
    try:
        ca = lead.get("created_at", "")
        if ca:
            dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
            days_old = max(0, (_now() - dt).days)
    except Exception:
        pass

    pay_w = _payment_weight(pms)
    src_w = _source_weight(source)
    budget_w, budget_reason = _budget_realism(lead, project)
    track = await _asesor_track(db, lead.get("assigned_to"))
    history = await _client_history(db, lead.get("client_global_id"), lead.get("id", ""))
    decay = max(0, 15 - days_old)  # max 15 if same day, decays linearly

    base = pay_w + src_w + budget_w + decay
    base += min(15, track["close_rate"] // 7)        # asesor performance bump (max 15)
    if history["prior_leads"] > 0 and history["abandonments"] == 0:
        base += 8                                    # client returns and never abandoned
    if history["abandonments"] >= 2:
        base -= 12                                   # repeat abandoner

    # Velocity flag (B4.1) gives big positive
    if lead.get("velocity_flag"):
        base += 8

    base = max(0, min(100, base))
    factors = {
        "presupuesto": budget_reason,
        "forma_pago": f"Métodos: {', '.join(pms) or 'no especificado'} (peso {pay_w})",
        "origen": f"Fuente {source or 'manual'} (peso {src_w})",
        "antigüedad": f"Lead con {days_old} días (decay {decay})",
        "asesor": f"Close rate del asesor: {track['close_rate']}% sobre {track['leads_total']} leads",
        "historial_cliente": f"Otros leads del cliente: {history['prior_leads']} (abandonos: {history['abandonments']})",
    }

    # Optionally enhance with Claude (graceful fallback if no key)
    claude_summary: Optional[str] = None
    payload = {
        "presupuesto_max": (lead.get("budget_range") or {}).get("max"),
        "intent": lead.get("intent"),
        "status": lead.get("status"),
        "source": source, "payment_methods": pms,
        "days_old": days_old,
        "project_name": (project or {}).get("name"),
        "asesor_close_rate": track["close_rate"],
        "client_prior_leads": history["prior_leads"],
        "client_abandonments": history["abandonments"],
        "velocity_flag": bool(lead.get("velocity_flag")),
    }
    claude = await _claude_json(
        system=(
            "Eres analista IA de leads inmobiliarios para LATAM. Evalúa el lead 0-100 con base en los factores "
            "(presupuesto, urgencia, forma de pago, origen, asesor, historial). Responde JSON con keys: "
            "score (int), tag ('frio'|'tibio'|'caliente'), confidence (int 0-100), summary (str max 90 chars)."
        ),
        user_text=f"Lead data: {json.dumps(payload, ensure_ascii=False)}",
        session_id=f"heat_{lead.get('id', '')}",
        max_chars=2000,
    )
    if claude and isinstance(claude.get("score"), int):
        # Blend heuristic + Claude (60% heuristic, 40% claude)
        blended = int(round(base * 0.6 + max(0, min(100, claude["score"])) * 0.4))
        base = max(0, min(100, blended))
        claude_summary = claude.get("summary")

    tag = _heat_tag_for(base)
    if claude_summary:
        factors["ia_summary"] = claude_summary

    return {
        "heat_score": base,
        "heat_tag": tag,
        "heat_factors": factors,
        "heat_calculated_at": _now().isoformat(),
        "heat_recalc_pending": False,
    }


@router.post("/api/leads/{lead_id}/recalc-heat")
async def recalc_heat(lead_id: str, request: Request):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "superadmin", "system"):
        raise HTTPException(403, "Solo dev_admin o superadmin puede forzar recalc")
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    new_heat = await compute_heat_for_lead(db, lead)
    await db.leads.update_one({"id": lead_id}, {"$set": new_heat})
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_heat", entity_id=lead_id,
        before={"heat_score": lead.get("heat_score")},
        after={"heat_score": new_heat["heat_score"], "heat_tag": new_heat["heat_tag"]},
        request=request,
        ml_event="heat_score_calculated",
        ml_context={"lead_id": lead_id, "score": new_heat["heat_score"], "tag": new_heat["heat_tag"]},
    )
    return {"ok": True, **new_heat}


@router.get("/api/leads/{lead_id}/heat")
async def get_heat(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    # Permission gate (reuse helpers from batch4_2)
    try:
        from routes_dev_batch4_2 import can_view_full_client_data
        if not can_view_full_client_data(user, lead):
            raise HTTPException(403, "Sin permisos para ver heat de este lead")
    except ImportError:
        pass
    return {
        "lead_id": lead_id,
        "heat_score": lead.get("heat_score"),
        "heat_tag": lead.get("heat_tag"),
        "heat_factors": lead.get("heat_factors") or {},
        "heat_calculated_at": lead.get("heat_calculated_at"),
        "heat_recalc_pending": lead.get("heat_recalc_pending", False),
    }


async def queue_heat_recalc(db, lead_id: str) -> None:
    """Mark lead for heat recalculation. Non-blocking."""
    try:
        await db.leads.update_one({"id": lead_id}, {"$set": {"heat_recalc_pending": True}})
    except Exception:
        pass


async def process_heat_queue(db) -> Dict[str, int]:
    """APScheduler job — process up to 50 pending leads."""
    global _HEAT_QUEUE_LOCK
    if _HEAT_QUEUE_LOCK:
        return {"skipped": 1}
    _HEAT_QUEUE_LOCK = True
    processed, errors = 0, 0
    try:
        pending = await db.leads.find(
            {"heat_recalc_pending": True}, {"_id": 0}
        ).limit(50).to_list(50)
        for lead in pending:
            try:
                new_heat = await compute_heat_for_lead(db, lead)
                await db.leads.update_one({"id": lead["id"]}, {"$set": new_heat})
                processed += 1
            except Exception as e:
                log.warning(f"[batch4.4] heat compute failed lead={lead.get('id')}: {e}")
                errors += 1
    finally:
        _HEAT_QUEUE_LOCK = False
    summary = {"processed": processed, "errors": errors}
    log.info(f"[batch4.4] heat queue run: {summary}")
    return summary


# ═════════════════════════════════════════════════════════════════════════════
# 4.36 · AI SUMMARY + RECOMMENDATIONS
# ═════════════════════════════════════════════════════════════════════════════
SUMMARY_TTL_HOURS = 4
SUMMARY_RATE_LIMIT_HOURS = 1


async def _build_ai_summary(db, lead: Dict) -> Dict:
    """Generate AI summary via Claude with deterministic fallback."""
    notes = (lead.get("notes") or [])[-10:]
    audit = []
    try:
        audit = await db.audit_log.find(
            {"entity_id": lead.get("id"), "entity_type": {"$in": ["lead", "lead_status_change", "lead_heat"]}},
            {"_id": 0, "action": 1, "ts": 1, "entity_type": 1, "after": 1},
        ).sort("ts", -1).limit(20).to_list(20)
    except Exception:
        pass
    appts = await db.appointments.find(
        {"lead_id": lead.get("id")}, {"_id": 0, "status": 1, "datetime": 1, "modalidad": 1, "cancel_reason": 1}
    ).sort("datetime", -1).limit(10).to_list(10)

    payload = {
        "status": lead.get("status"), "intent": lead.get("intent"),
        "budget_range": lead.get("budget_range"), "payment_methods": lead.get("payment_methods", []),
        "heat_tag": lead.get("heat_tag"),
        "notes_count": len(lead.get("notes") or []),
        "recent_notes": [{"text": n.get("text", "")[:120], "ts": n.get("created_at")} for n in notes[-5:]],
        "audit_recent": [{"action": a.get("action"), "type": a.get("entity_type"), "ts": a.get("ts")} for a in audit[:10]],
        "appointments": appts,
    }
    claude = await _claude_json(
        system=(
            "Eres coach senior de ventas inmobiliarias en México. Analiza este lead y produce JSON válido con keys: "
            "summary (str max 200 caracteres, narrativa breve del estado actual), "
            "last_action (str max 80 caracteres), "
            "sentiment ('positivo'|'neutral'|'preocupante'), "
            "next_steps (array de 2 a 3 strings, cada uno max 80 caracteres). "
            "Tono: directo, accionable, sin juicio. Usa 'el cliente' (no nombre). "
            "El asesor verá esto para mejorar — frame en términos de oportunidad."
        ),
        user_text=f"Lead context: {json.dumps(payload, ensure_ascii=False, default=str)}",
        session_id=f"ai_summary_{lead.get('id', '')}",
        max_chars=4000,
    )

    if claude and "summary" in claude:
        result = {
            "summary": str(claude.get("summary", ""))[:200],
            "last_action": str(claude.get("last_action", ""))[:120],
            "sentiment": claude.get("sentiment", "neutral"),
            "next_steps": [str(s)[:120] for s in (claude.get("next_steps") or [])[:3]],
        }
    else:
        # Deterministic fallback
        last_audit = audit[0] if audit else None
        result = {
            "summary": f"Cliente en etapa {lead.get('status', 'nuevo')} con presupuesto "
                       f"{(lead.get('budget_range') or {}).get('max', 0)/1_000_000:.1f}M MXN. "
                       f"{len(appts)} citas registradas, {len(notes)} notas del asesor.",
            "last_action": (last_audit or {}).get("action", "sin_actividad") if last_audit else "sin actividad reciente",
            "sentiment": "preocupante" if lead.get("velocity_flag") else
                         "positivo" if lead.get("heat_tag") == "caliente" else "neutral",
            "next_steps": [
                "Confirmar disponibilidad del cliente para visita esta semana",
                "Validar pre-aprobación crediticia si aplica",
                "Documentar próxima conversación con timestamps",
            ],
        }
    now = _now()
    result["generated_at"] = now.isoformat()
    result["expires_at"] = (now + timedelta(hours=SUMMARY_TTL_HOURS)).isoformat()
    return result


async def _check_ai_summary_permission(user, lead: Dict):
    try:
        from routes_dev_batch4_2 import can_view_ai_summary
        if not can_view_ai_summary(user, lead):
            raise HTTPException(403, "Sin permisos para ver el resumen IA de este lead")
    except ImportError:
        pass


@router.get("/api/leads/{lead_id}/ai-summary-v2")
async def get_ai_summary(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    await _check_ai_summary_permission(user, lead)

    cached = lead.get("ai_summary")
    now = _now()
    if cached and isinstance(cached, dict):
        try:
            exp = datetime.fromisoformat(cached.get("expires_at", "").replace("Z", "+00:00"))
            if exp > now:
                await _safe_audit_ml(
                    db, user, action="read", entity_type="lead_ai_summary", entity_id=lead_id,
                    request=request, ml_event="ai_summary_viewed",
                    ml_context={"lead_id": lead_id, "cache_hit": True},
                )
                return {**cached, "lead_id": lead_id, "_cached": True}
        except Exception:
            pass

    # Cache miss → generate
    summary = await _build_ai_summary(db, lead)
    await db.leads.update_one({"id": lead_id}, {"$set": {"ai_summary": summary}})
    await _safe_audit_ml(
        db, user, action="create", entity_type="lead_ai_summary", entity_id=lead_id,
        request=request, ml_event="ai_summary_viewed",
        ml_context={"lead_id": lead_id, "cache_hit": False},
    )
    return {**summary, "lead_id": lead_id, "_cached": False}


@router.post("/api/leads/{lead_id}/refresh-ai-summary")
async def refresh_ai_summary(lead_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    await _check_ai_summary_permission(user, lead)

    # Rate-limit 1x/hour per (user, lead)
    rl_key = f"{user.user_id}:{lead_id}"
    last = _AI_SUMMARY_RATE.get(rl_key)
    if last and (_now() - last).total_seconds() < SUMMARY_RATE_LIMIT_HOURS * 3600:
        wait = SUMMARY_RATE_LIMIT_HOURS * 3600 - (_now() - last).total_seconds()
        raise HTTPException(429, f"Espera {int(wait/60)} min antes de refrescar de nuevo")
    _AI_SUMMARY_RATE[rl_key] = _now()

    summary = await _build_ai_summary(db, lead)
    await db.leads.update_one({"id": lead_id}, {"$set": {"ai_summary": summary}})
    await _safe_audit_ml(
        db, user, action="update", entity_type="lead_ai_summary", entity_id=lead_id,
        request=request, ml_event="ai_summary_refreshed",
        ml_context={"lead_id": lead_id},
    )
    return {**summary, "lead_id": lead_id, "_cached": False, "_refreshed": True}


# ═════════════════════════════════════════════════════════════════════════════
# 4.37 · ANALYTICS — CANCEL/RESCHEDULE/LOST REASONS + MOVEMENT ALERTS
# ═════════════════════════════════════════════════════════════════════════════
def _period_to_dates(period: str) -> tuple[str, str]:
    now = _now()
    if period == "7d":
        f = now - timedelta(days=7)
    elif period == "90d":
        f = now - timedelta(days=90)
    elif period == "12m":
        f = now - timedelta(days=365)
    else:
        f = now - timedelta(days=30)
    return f.isoformat(), now.isoformat()


def _bucket(rows: List[Dict], key: str) -> List[Dict]:
    counts = Counter()
    for r in rows:
        v = r.get(key) or "no_especificada"
        counts[v] += 1
    total = sum(counts.values()) or 1
    return [{"reason": k, "count": v, "pct": round(100 * v / total, 1)}
            for k, v in counts.most_common()]


def _month_key(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return f"{dt.year}-{dt.month:02d}"
    except Exception:
        return "—"


async def _build_analytics(db, *, scope_filter: Dict, period: str, project_id: Optional[str]) -> Dict:
    f, t = _period_to_dates(period)
    apt_q: Dict[str, Any] = {**scope_filter, "updated_at": {"$gte": f, "$lte": t}}
    lead_q: Dict[str, Any] = {**scope_filter, "updated_at": {"$gte": f, "$lte": t}}
    if project_id:
        apt_q["project_id"] = project_id
        lead_q["project_id"] = project_id

    cancel_apts = await db.appointments.find(
        {**apt_q, "status": "cancelada"}, {"_id": 0, "cancel_reason": 1, "updated_at": 1}
    ).to_list(5000)
    resched_apts = await db.appointments.find(
        {**apt_q, "status": "reagendada"}, {"_id": 0, "reschedule_reason": 1, "updated_at": 1}
    ).to_list(5000)
    lost_leads = await db.leads.find(
        {**lead_q, "status": "cerrado_perdido"}, {"_id": 0, "lost_reason": 1, "updated_at": 1}
    ).to_list(5000)

    cancel_break = _bucket(cancel_apts, "cancel_reason")
    resched_break = _bucket([{**r, "reason": r.get("reschedule_reason")} for r in resched_apts], "reason")
    lost_break = _bucket(lost_leads, "lost_reason")

    # Trend per_month
    by_month = defaultdict(lambda: {"cancellations": 0, "reschedules": 0, "lost": 0})
    for r in cancel_apts:
        by_month[_month_key(r.get("updated_at", ""))]["cancellations"] += 1
    for r in resched_apts:
        by_month[_month_key(r.get("updated_at", ""))]["reschedules"] += 1
    for r in lost_leads:
        by_month[_month_key(r.get("updated_at", ""))]["lost"] += 1
    trend = sorted([{"month": m, **v} for m, v in by_month.items()], key=lambda x: x["month"])

    return {
        "period": period,
        "from": f, "to": t,
        "cancel_reasons_breakdown": cancel_break,
        "reschedule_reasons_breakdown": resched_break,
        "lost_reasons_breakdown": lost_break,
        "trends": {"per_month": trend},
        "totals": {
            "cancellations": len(cancel_apts),
            "reschedules": len(resched_apts),
            "lost": len(lost_leads),
        },
    }


@router.get("/api/dev/analytics/cancel-reasons")
async def dev_analytics_cancel_reasons(
    request: Request,
    period: str = Query("30d"),
    project_id: Optional[str] = None,
):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    scope = {} if user.role == "superadmin" else {"dev_org_id": org}
    out = await _build_analytics(db, scope_filter=scope, period=period, project_id=project_id)
    await _safe_audit_ml(
        db, user, action="read", entity_type="analytics_cancel_reasons", entity_id=org,
        request=request, ml_event="analytics_cancel_reasons_viewed",
        ml_context={"period": period, "scope": "dev_org"},
    )
    return out


@router.get("/api/inmobiliaria/analytics/cancel-reasons")
async def inm_analytics_cancel_reasons(
    request: Request,
    period: str = Query("30d"),
    project_id: Optional[str] = None,
):
    user = await _auth(request)
    if user.role not in ("inmobiliaria_admin", "inmobiliaria_director", "developer_admin", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    inm_id = getattr(user, "inmobiliaria_id", None) or "default"
    scope = {} if user.role == "superadmin" else {"inmobiliaria_id": inm_id}
    out = await _build_analytics(db, scope_filter=scope, period=period, project_id=project_id)
    await _safe_audit_ml(
        db, user, action="read", entity_type="analytics_cancel_reasons", entity_id=inm_id,
        request=request, ml_event="analytics_cancel_reasons_viewed",
        ml_context={"period": period, "scope": "inmobiliaria"},
    )
    return out


@router.get("/api/dev/analytics/heat-cohort")
async def heat_cohort(request: Request, period: str = Query("30d"), project_id: Optional[str] = None):
    """Cohort distribution: leads grouped by heat_tag with close-rate per cohort."""
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    f, t = _period_to_dates(period)
    q: Dict[str, Any] = {"created_at": {"$gte": f, "$lte": t}}
    if user.role != "superadmin":
        q["dev_org_id"] = org
    if project_id:
        q["project_id"] = project_id

    leads = await db.leads.find(q, {"_id": 0, "heat_tag": 1, "status": 1}).to_list(5000)
    cohort = {tag: {"total": 0, "won": 0} for tag in ("caliente", "tibio", "frio", "sin_calcular")}
    for ld in leads:
        tag = ld.get("heat_tag") or "sin_calcular"
        if tag not in cohort:
            tag = "sin_calcular"
        cohort[tag]["total"] += 1
        if ld.get("status") == "cerrado_ganado":
            cohort[tag]["won"] += 1

    total_n = max(len(leads), 1)
    out = [
        {"tag": tag,
         "total": c["total"], "won": c["won"],
         "close_rate": round(100 * c["won"] / max(c["total"], 1), 1),
         "share_pct": round(100 * c["total"] / total_n, 1)}
        for tag, c in cohort.items()
    ]
    return {"period": period, "total_leads": len(leads), "cohort": out}



@router.get("/api/dev/analytics/movement-alerts")
async def movement_alerts_analytics(request: Request, period: str = Query("30d")):
    user = await _auth(request)
    if user.role not in ("developer_admin", "developer_director", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    db = _db(request)
    org = getattr(user, "tenant_id", None) or "default"
    f, t = _period_to_dates(period)

    q: Dict[str, Any] = {"type": {"$in": ["competitor_movement", "lead_velocity_alert"]},
                         "created_at": {"$gte": f, "$lte": t}}
    if user.role != "superadmin":
        q["org_id"] = org
    notifs = await db.notifications.find(q, {"_id": 0}).to_list(5000)
    total = len(notifs)

    by_user = defaultdict(int)
    responded = 0
    for n in notifs:
        uid = n.get("user_id", "unknown")
        by_user[uid] += 1
        if n.get("read_at") or n.get("dismissed_at"):
            responded += 1

    # Resolve names
    uids = list(by_user.keys())
    name_by_id = {}
    if uids:
        async for u in db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}):
            name_by_id[u["user_id"]] = u.get("name") or u.get("email", "—")
    by_user_list = sorted(
        [{"asesor_id": k, "asesor_name": name_by_id.get(k, k), "alerts_received": v}
         for k, v in by_user.items()],
        key=lambda x: -x["alerts_received"],
    )

    # Reactivation rate: proportion of related leads that progressed status post-alert
    related_lead_ids = {n.get("related_id") for n in notifs if n.get("related_id")}
    reactivated = 0
    if related_lead_ids:
        progressed = await db.leads.count_documents({
            "id": {"$in": list(related_lead_ids)},
            "status": {"$in": ["en_contacto", "visita_realizada", "propuesta", "cerrado_ganado"]},
        })
        reactivated = progressed

    return {
        "period": period,
        "total_alerts_sent": total,
        "alerts_by_asesor": by_user_list,
        "response_rate": round(100 * responded / max(total, 1), 1),
        "reactivation_rate": round(100 * reactivated / max(len(related_lead_ids), 1), 1),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Indexes + scheduler hook
# ═════════════════════════════════════════════════════════════════════════════
async def ensure_batch4_4_indexes(db) -> None:
    await db.leads.create_index([("heat_recalc_pending", 1)], background=True)
    await db.leads.create_index([("heat_tag", 1)], background=True)
    await db.appointments.create_index([("status", 1), ("updated_at", 1)], background=True)
    log.info("[batch4.4] indexes ensured")


def register_batch4_4_jobs(scheduler, db):
    """Add heat queue processor job. Runs every 30 min."""
    from apscheduler.triggers.cron import CronTrigger
    TZ = "America/Mexico_City"
    scheduler.add_job(
        process_heat_queue, CronTrigger(minute="*/30", timezone=TZ),
        args=[db], id="lead_heat_queue_30min", replace_existing=True,
        misfire_grace_time=300,
    )
    log.info("[batch4.4] heat-queue job registered")
