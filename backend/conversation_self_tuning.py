"""W7.AS.3.E (R2) — Conversation Self-Tuning (ML loop).

Módulo PURO importable por conversation_engine (opcional · FAIL-OPEN si no
existe). NO toca server/engine/asistente/UI. Terminal D wirea register_cron()
en el startup de server.py.

Idea: una vez por semana, un LLM (Claude) analiza las top-50 vs bottom-50
conversaciones de cada tenant (rankeadas por handoff rate + sentiment + lead
conversion) y propone un DIFF al system_prompt base del asesor. El diff queda
en estado `pending_approval` — superadmin aprueba manualmente antes de aplicar.

Reglas:
  - FAIL-OPEN si <20 conversaciones → {"skipped": "insufficient_data"}.
  - Cap de presupuesto $5/tenant por semana (ai_budget). Si se excede → skip.
  - track_ai_call tras la llamada LLM.
  - Cron WEEKLY domingo 04:30 UTC (NO choca con W6.MOV.2 a las 04:00),
    max_instances=1.

Funciones públicas:
  - analyze_tenant(db, tenant_id) -> dict
  - register_cron(scheduler, db=None) -> None   (D la invoca con (sched, db))

Sin imports pesados a nivel módulo (apscheduler / emergentintegrations / engines
se importan perezosamente) → el módulo es importable en cualquier entorno.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.conversation_self_tuning")

MIN_CONVOS = 20                      # FAIL-OPEN bajo este umbral
WEEKLY_BUDGET_CAP_USD = 5.0          # cap por tenant por semana
TOP_N = 50                           # top/bottom N a comparar
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _proposal_id() -> str:
    return f"sttune_{secrets.token_urlsafe(8)}"


def _week_iso() -> str:
    y, w, _ = _now().isocalendar()
    return f"{y}-W{w:02d}"


def _sentiment_num(s: Optional[str]) -> float:
    return {"positive": 1.0, "neutral": 0.0, "negative": -1.0}.get(s or "neutral", 0.0)


def _quality_score(thread: Dict[str, Any]) -> float:
    """Score de calidad de una conversación (más alto = mejor).

    Premia conversión y sentimiento positivo; penaliza handoff.
    """
    converted = 1.0 if thread.get("converted") or thread.get("lead_converted") else 0.0
    handoff = 1.0 if thread.get("status") == "handoff" else 0.0
    sentiment = _sentiment_num(thread.get("sentiment"))
    return (converted * 2.0) + sentiment - (handoff * 1.5)


async def _weekly_spend(db, tenant_id: str) -> float:
    """Gasto acumulado de self-tuning para el tenant en la semana ISO actual."""
    try:
        cur = db.conversation_tuning_runs.find(
            {"tenant_id": tenant_id, "week_iso": _week_iso()},
            {"_id": 0, "cost_usd": 1},
        )
        total = 0.0
        async for d in cur:
            total += float(d.get("cost_usd") or 0.0)
        return total
    except Exception:
        return 0.0


async def _call_llm_for_diff(top: List[Dict[str, Any]],
                             bottom: List[Dict[str, Any]],
                             base_prompt: str) -> Optional[Dict[str, Any]]:
    """Pide a Claude un diff propuesto al system_prompt. Retorna dict con
    {diff, tokens_in, tokens_out} o None si LLM no disponible/falla (FAIL-OPEN).
    """
    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        from llm_client import LlmChat, UserMessage

        def _digest(rows: List[Dict[str, Any]]) -> str:
            n = len(rows)
            if not n:
                return "sin datos"
            handoff = sum(1 for r in rows if r.get("status") == "handoff") / n
            sent = sum(_sentiment_num(r.get("sentiment")) for r in rows) / n
            conv = sum(1 for r in rows if r.get("converted") or r.get("lead_converted")) / n
            return f"n={n} · handoff_rate={handoff:.0%} · avg_sentiment={sent:+.2f} · conversion={conv:.0%}"

        system = (
            "Eres un optimizador de prompts para un asesor inmobiliario IA (es-MX). "
            "Comparas conversaciones exitosas vs fallidas y propones un DIFF conciso "
            "al system prompt base. Responde SOLO con el texto del diff propuesto."
        )
        user = (
            f"PROMPT BASE ACTUAL:\n{base_prompt[:2000]}\n\n"
            f"TOP (mejores): {_digest(top)}\n"
            f"BOTTOM (peores): {_digest(bottom)}\n\n"
            "Propón ajustes concretos al prompt base para subir conversión y bajar handoff."
        )
        chat = LlmChat(
            api_key=api_key,
            session_id=f"selftune_{secrets.token_urlsafe(6)}",
            system_message=system,
        ).with_model("anthropic", CLAUDE_MODEL)
        raw = await chat.send_message(UserMessage(text=user[:6000]))
        if not raw:
            return None
        return {
            "diff": str(raw).strip(),
            "tokens_in": (len(system) + len(user[:6000])) // 4,
            "tokens_out": len(str(raw)) // 4,
        }
    except Exception as exc:
        log.warning(f"[self_tuning] LLM error: {exc}")
        return None


async def analyze_tenant(db, tenant_id: str) -> Dict[str, Any]:
    """Analiza las conversaciones del tenant y propone un diff al system prompt.

    Returns:
        {"skipped": "insufficient_data", "count": n}      si <20 convos
        {"skipped": "budget_cap", "spend": x}             si se excede cap
        {"skipped": "no_llm" | "llm_failed" | "error"}    FAIL-OPEN
        {"status": "proposal_created", "proposal_id": id} en éxito
    """
    try:
        total = await db.conversation_threads.count_documents({"tenant_id": tenant_id})
        if total < MIN_CONVOS:
            return {"skipped": "insufficient_data", "tenant_id": tenant_id, "count": total}

        spend = await _weekly_spend(db, tenant_id)
        if spend >= WEEKLY_BUDGET_CAP_USD:
            return {"skipped": "budget_cap", "tenant_id": tenant_id, "spend": round(spend, 2)}

        # Cargar conversaciones del tenant (últimos 90d) y rankear por calidad.
        cutoff = _now() - timedelta(days=90)
        cur = db.conversation_threads.find(
            {"tenant_id": tenant_id, "created_at": {"$gte": cutoff}},
            {"_id": 1, "status": 1, "sentiment": 1, "converted": 1,
             "lead_converted": 1, "system_prompt": 1},
        )
        threads = [t async for t in cur]
        if len(threads) < MIN_CONVOS:
            return {"skipped": "insufficient_data", "tenant_id": tenant_id, "count": len(threads)}

        threads.sort(key=_quality_score, reverse=True)
        top = threads[:TOP_N]
        bottom = threads[-TOP_N:]
        base_prompt = next((t.get("system_prompt") for t in threads if t.get("system_prompt")), "") or ""

        llm = await _call_llm_for_diff(top, bottom, base_prompt)
        if llm is None:
            return {"skipped": "llm_unavailable", "tenant_id": tenant_id}

        # track_ai_call post-LLM
        cost_usd = 0.0
        try:
            from ai_budget import track_ai_call, _cost_usd
            await track_ai_call(
                db, dev_org_id=tenant_id, model=CLAUDE_MODEL, tokens=0,
                call_type="conversation_self_tuning",
                tokens_in=llm["tokens_in"], tokens_out=llm["tokens_out"],
                feature_key="conversation_self_tuning",
            )
            cost_usd = _cost_usd(CLAUDE_MODEL, llm["tokens_in"], llm["tokens_out"])
        except Exception as exc:
            log.debug(f"[self_tuning] track_ai_call skip: {exc}")

        proposal_id = _proposal_id()
        proposal = {
            "_id": proposal_id,
            "proposal_id": proposal_id,
            "tenant_id": tenant_id,
            "status": "pending_approval",   # superadmin aprueba manual
            "diff": llm["diff"],
            "base_prompt_excerpt": base_prompt[:500],
            "convos_analyzed": len(threads),
            "created_at": _now(),
        }
        try:
            await db.conversation_tuning_proposals.insert_one(dict(proposal))
            await db.conversation_tuning_runs.insert_one({
                "tenant_id": tenant_id, "week_iso": _week_iso(),
                "cost_usd": round(cost_usd, 6), "ran_at": _now(),
                "proposal_id": proposal_id,
            })
        except Exception as exc:
            log.debug(f"[self_tuning] persist skip: {exc}")

        return {"status": "proposal_created", "proposal_id": proposal_id,
                "tenant_id": tenant_id, "convos_analyzed": len(threads)}

    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[self_tuning] analyze_tenant fail-open: {exc}")
        return {"skipped": "error", "tenant_id": tenant_id, "error": str(exc)[:160]}


async def _run_all_tenants(db=None) -> Dict[str, Any]:
    """Job del cron: itera tenants distintos y analiza cada uno. FAIL-OPEN."""
    if db is None:
        log.warning("[self_tuning] cron sin db — skip")
        return {"skipped": "no_db"}
    analyzed = 0
    try:
        tenants = await db.conversation_threads.distinct("tenant_id")
    except Exception as exc:
        log.warning(f"[self_tuning] distinct tenants failed: {exc}")
        return {"skipped": "error"}
    for tid in tenants or []:
        if not tid:
            continue
        try:
            await analyze_tenant(db, tid)
            analyzed += 1
        except Exception as exc:
            log.warning(f"[self_tuning] tenant {tid} failed: {exc}")
    return {"tenants_analyzed": analyzed}


def register_cron(scheduler, db=None) -> None:
    """Registra el cron WEEKLY domingo 04:30 UTC (max_instances=1).

    Usa el trigger 'cron' por string → sin import de apscheduler aquí (el módulo
    permanece importable sin la dependencia). FAIL-OPEN: nunca propaga errores.
    """
    try:
        scheduler.add_job(
            _run_all_tenants,
            "cron",
            day_of_week="sun", hour=4, minute=30, timezone="UTC",
            args=[db],
            id="conversation_self_tuning_weekly",
            replace_existing=True,
            max_instances=1,
        )
        log.info("[self_tuning] job registered @ Sun 04:30 UTC weekly")
    except Exception as exc:
        log.warning(f"[self_tuning] register_cron failed: {exc}")
