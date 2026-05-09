"""W4.4 — Phase Y.1A · Director Agent core orchestration engine.

LLM: claude-sonnet-4-6 vía emergentintegrations.LlmChat
Tool calling: structured prompt + <tool_call> tag parsing (2-pass agentic loop)
Session caps: T1=50k/10k · T2=100k/20k · T3=200k/40k · T4=unlimited
Simulation mode: full logic, zero Anthropic calls, response prefixed [SIM]
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.director_agent")

# ─── Constants ────────────────────────────────────────────────────────────────
DIRECTOR_MODEL = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")

# Input/output token caps per tier
TIER_CAPS: Dict[str, Tuple[Optional[int], Optional[int]]] = {
    "off": (0, 0),
    "T1": (
        int(os.environ.get("DIRECTOR_MAX_TOKENS_IN_T1", 50000)),
        int(os.environ.get("DIRECTOR_MAX_TOKENS_OUT_T1", 10000)),
    ),
    "T2": (100_000, 20_000),
    "T3": (200_000, 40_000),
    "T4": (None, None),  # unlimited
}

# Approximate cost per token (Claude Sonnet 4.x pricing)
PRICE_IN_PER_TOK  = 3.0 / 1_000_000   # $3 / 1M input
PRICE_OUT_PER_TOK = 15.0 / 1_000_000  # $15 / 1M output

# Tool call regex
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)

# ─── Custom exceptions ────────────────────────────────────────────────────────
class PhaseYDisabledError(Exception):
    """Phase Y master switch OFF o tier=off para este org."""

class SessionEndedError(Exception):
    """La sesión ya fue cerrada (status=ended)."""

class TierCapExceededError(Exception):
    """La sesión superó el cap de tokens del tier."""

# ─── System prompt builder ─────────────────────────────────────────────────────
def _build_system_prompt(org_id: str, role: str, tier: str, sim_mode: bool) -> str:
    now_mx = datetime.now(timezone(timedelta(hours=-6))).strftime("%d %b %Y, %H:%M hora CDMX")
    sim_note = "\n\n⚠️  SIMULATION MODE: esta es una sesión de prueba. Tu lógica se ejecuta normalmente pero la sesión NO produce acciones reales." if sim_mode else ""

    tools_section = """
═══ TOOLS DISPONIBLES ═══
Cuando necesites datos del sistema, incluye EXACTAMENTE este formato en tu respuesta (una línea separada):

<tool_call>{"tool": "NOMBRE_TOOL", "params": {PARAMS_JSON}}</tool_call>

TOOLS Y PARAMS:

1. get_ie_score
   params: { "developer_id": str }
   devuelve: score IE actual (0-100), percentile en su categoría, ranking

2. get_unit_score
   params: { "unit_id": str }
   devuelve: score IE_UNIT, breakdown de 5 factores (ubicación, precio, demanda, riesgo, yield)

3. get_comparables
   params: { "unit_id": str, "radius_km": float (default 2.0) }
   devuelve: top 5 comparables con price/m2, distancia, delta% vs subject

4. get_org_kpis
   params: { "org_id": str, "period_days": int (default 30) }
   devuelve: leads_count, matches_count, conversion_rate, avg_response_time_hours

REGLAS DE TOOLS:
- Puedes incluir hasta 4 tool_calls en una respuesta
- Solo incluye <tool_call> si realmente necesitas los datos para responder
- Después de recibir los resultados, da tu respuesta final COMPLETA (sin más tool_calls)
- Si el sistema retorna {"error": "..."}, explica que el dato no está disponible y continúa
"""

    return f"""Eres el Director AI de DesarrollosMX (DMX), asistente inteligente de decisión para un desarrollador inmobiliario en México.

Fecha actual: {now_mx}
Organización: {org_id}
Rol del usuario: {role}
Tier Phase Y activo: {tier}
{sim_note}

Tu función es ayudar al equipo a tomar mejores decisiones sobre su portafolio: pricing, comparables, KPIs operativos, alertas de riesgo y oportunidades de mercado.

TONO: Directo, profesional, en español (es-MX). Nada de anglicismos innecesarios. Respuestas concisas pero completas. Usa datos concretos cuando los tengas.
{tools_section}"""


# ─── Tools implementation ──────────────────────────────────────────────────────
async def _exec_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    """Ejecuta una tool interna. Retorna dict con resultado o {"error": "..."}."""
    try:
        if tool_name == "get_ie_score":
            return await _tool_get_ie_score(db, params.get("developer_id", ""))
        elif tool_name == "get_unit_score":
            return await _tool_get_unit_score(db, params.get("unit_id", ""))
        elif tool_name == "get_comparables":
            return await _tool_get_comparables(db, params.get("unit_id", ""), float(params.get("radius_km", 2.0)))
        elif tool_name == "get_org_kpis":
            return await _tool_get_org_kpis(db, params.get("org_id", org_id), int(params.get("period_days", 30)))
        else:
            return {"error": f"Tool '{tool_name}' no existe. Tools válidas: get_ie_score, get_unit_score, get_comparables, get_org_kpis"}
    except Exception as exc:
        log.warning(f"[director_tool] {tool_name} error: {exc}")
        return {"error": str(exc)}


async def _tool_get_ie_score(db, developer_id: str) -> Dict[str, Any]:
    if not developer_id:
        return {"error": "developer_id requerido"}
    doc = await db.ie_scores.find_one({"entity_id": developer_id}, {"_id": 0})
    if not doc:
        # Fallback: try developments collection
        dev = await db.developments.find_one({"id": developer_id}, {"_id": 0, "ie_score": 1, "name": 1})
        if dev and dev.get("ie_score") is not None:
            return {
                "developer_id": developer_id,
                "ie_score": dev["ie_score"],
                "percentile": None,
                "ranking": "Sin ranking (datos insuficientes)",
                "note": "Score desde desarrollo directo",
            }
        return {"error": f"No se encontró score para developer_id='{developer_id}'"}
    return {
        "developer_id": developer_id,
        "ie_score": doc.get("score"),
        "percentile": doc.get("percentile"),
        "ranking": doc.get("ranking"),
        "category": doc.get("category"),
        "updated_at": doc.get("updated_at"),
    }


async def _tool_get_unit_score(db, unit_id: str) -> Dict[str, Any]:
    if not unit_id:
        return {"error": "unit_id requerido"}
    doc = await db.units.find_one({"id": unit_id}, {"_id": 0}) or \
          await db.ie_unit_scores.find_one({"unit_id": unit_id}, {"_id": 0})
    if not doc:
        return {"error": f"Unidad '{unit_id}' no encontrada"}
    return {
        "unit_id": unit_id,
        "ie_unit_score": doc.get("ie_unit_score") or doc.get("score"),
        "factors": {
            "ubicacion":  doc.get("factor_ubicacion"),
            "precio":     doc.get("factor_precio"),
            "demanda":    doc.get("factor_demanda"),
            "riesgo":     doc.get("factor_riesgo"),
            "yield":      doc.get("factor_yield"),
        },
        "price_mxn": doc.get("price_mxn"),
        "area_m2": doc.get("area_m2"),
    }


async def _tool_get_comparables(db, unit_id: str, radius_km: float = 2.0) -> Dict[str, Any]:
    if not unit_id:
        return {"error": "unit_id requerido"}
    comps = await db.comparables.find(
        {"subject_unit_id": unit_id},
        {"_id": 0}
    ).sort("distance_km", 1).limit(5).to_list(length=5)
    if not comps:
        # Fallback genérico — busca en units si hay datos de zona
        return {
            "unit_id": unit_id,
            "radius_km": radius_km,
            "comparables": [],
            "note": "Sin comparables registrados para esta unidad aún."
        }
    return {
        "unit_id": unit_id,
        "radius_km": radius_km,
        "comparables": [
            {
                "comp_id": c.get("comparable_id"),
                "name": c.get("name"),
                "price_m2": c.get("price_per_m2"),
                "distance_km": c.get("distance_km"),
                "delta_pct": c.get("delta_pct_vs_subject"),
            }
            for c in comps
        ],
    }


async def _tool_get_org_kpis(db, org_id: str, period_days: int = 30) -> Dict[str, Any]:
    if not org_id:
        return {"error": "org_id requerido"}
    since = datetime.now(timezone.utc) - timedelta(days=period_days)
    since_q = {"$gte": since}

    # Leads
    leads_q = {"tenant_id": org_id, "created_at": since_q}
    leads_count = await db.leads.count_documents(leads_q)
    matches_count = await db.matches.count_documents({"org_id": org_id, "created_at": since_q}) if leads_count == 0 else 0

    # Conversion rate (leads with status=converted)
    converted = await db.leads.count_documents({**leads_q, "status": "convertido"})
    conversion_rate = round((converted / leads_count) * 100, 1) if leads_count > 0 else 0.0

    # Avg response time
    pipeline = [
        {"$match": {**leads_q, "first_response_at": {"$exists": True}}},
        {"$project": {"delta": {"$subtract": ["$first_response_at", "$created_at"]}}},
        {"$group": {"_id": None, "avg_ms": {"$avg": "$delta"}}},
    ]
    agg = await db.leads.aggregate(pipeline).to_list(length=1)
    avg_resp_hours = round(agg[0]["avg_ms"] / 3_600_000, 1) if agg else None

    return {
        "org_id": org_id,
        "period_days": period_days,
        "leads_count": leads_count,
        "matches_count": matches_count,
        "conversion_rate_pct": conversion_rate,
        "avg_response_time_hours": avg_resp_hours,
        "converted_count": converted,
    }


# ─── Conversation history helpers ─────────────────────────────────────────────
def _estimate_tokens(text: str) -> int:
    """Estimación: 4 chars ≈ 1 token (heurística estándar)."""
    return max(1, len(text or "") // 4)


async def _load_history_as_openai(db, session_id: str, limit: int = 40) -> List[Dict[str, Any]]:
    """Carga los últimos N mensajes como array OpenAI-format."""
    docs = await db.director_messages.find(
        {"session_id": session_id, "role": {"$in": ["user", "assistant"]}},
        {"_id": 0, "role": 1, "content": 1},
    ).sort("created_at", 1).limit(limit).to_list(length=limit)
    return [{"role": d["role"], "content": d["content"] or ""} for d in docs]


# ─── Agentic tool loop ────────────────────────────────────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    """Parsea <tool_call>{...}</tool_call> tags del texto de Claude."""
    calls = []
    for match in _TOOL_CALL_RE.finditer(text):
        raw = match.group(1).strip()
        try:
            calls.append(json.loads(raw))
        except json.JSONDecodeError:
            log.warning(f"[director] tool_call JSON inválido: {raw[:200]}")
    return calls


def _strip_tool_calls(text: str) -> str:
    """Elimina los tags <tool_call> del texto para mostrar al usuario."""
    return _TOOL_CALL_RE.sub("", text).strip()


async def _agentic_loop(
    db,
    chat_obj,
    user_message: str,
    org_id: str,
    max_tool_rounds: int = 3,
) -> Tuple[str, List[Dict[str, Any]], int, int]:
    """
    Ejecuta el loop agentic: send → parse tool_calls → exec → reinject → final response.
    Returns: (final_text, tool_calls_list, total_in_tokens, total_out_tokens)
    """
    from emergentintegrations.llm.chat import UserMessage as LlmUserMsg

    total_in = _estimate_tokens(user_message)
    total_out = 0
    all_tool_calls: List[Dict[str, Any]] = []
    current_message = user_message

    for _round in range(max_tool_rounds):
        raw_resp = await chat_obj.send_message(LlmUserMsg(text=current_message))
        total_out += _estimate_tokens(raw_resp or "")

        tool_call_specs = _extract_tool_calls(raw_resp or "")
        if not tool_call_specs:
            # No hay tool calls — respuesta final
            return _strip_tool_calls(raw_resp or ""), all_tool_calls, total_in, total_out

        # Ejecutar todas las tools de este round
        results_parts = []
        for spec in tool_call_specs[:4]:  # max 4 tools por round
            tool_name = spec.get("tool", "")
            params = spec.get("params") or {}
            t0 = time.monotonic()
            result = await _exec_tool(db, tool_name, params, org_id)
            latency_ms = int((time.monotonic() - t0) * 1000)
            all_tool_calls.append({
                "tool_name": tool_name,
                "input": params,
                "output": result,
                "latency_ms": latency_ms,
            })
            result_str = json.dumps(result, ensure_ascii=False)
            results_parts.append(f"<tool_result tool=\"{tool_name}\">{result_str}</tool_result>")
            total_in += _estimate_tokens(result_str)

        # Reinjectar resultados como mensaje del sistema
        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nAhora da tu respuesta final completa al usuario basándote en estos datos."
        )

    # Si llegamos aquí sin respuesta final, usar el último raw_resp limpio
    last_resp = await chat_obj.send_message(LlmUserMsg(text=current_message))
    total_out += _estimate_tokens(last_resp or "")
    return _strip_tool_calls(last_resp or ""), all_tool_calls, total_in, total_out


# ─── DirectorAgent ────────────────────────────────────────────────────────────
class DirectorAgent:
    def __init__(self, db, org_id: str, user_id: str, role: str):
        self.db = db
        self.org_id = org_id
        self.user_id = user_id
        self.role = role

    async def start_session(self) -> str:
        """Crea sesión nueva. Valida master switch + tier. Returns session_id."""
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)

        if not settings.get("agentic_enabled", False):
            raise PhaseYDisabledError("Phase Y master switch desactivado para esta organización")

        tier = (settings.get("feature_tiers") or {}).get("diagnostic_engine", "off")
        if tier == "off":
            raise PhaseYDisabledError("diagnostic_engine tier está en 'off'")

        session_id = f"dses_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc)
        await self.db.director_sessions.insert_one({
            "_id": session_id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "role": self.role,
            "created_at": now,
            "last_message_at": now,
            "status": "active",
            "tier_at_start": tier,
            "simulation_mode": settings.get("simulation_mode", False),
            "total_tokens_in": 0,
            "total_tokens_out": 0,
            "total_cost_usd": 0.0,
        })
        log.info(f"[director] session started: {session_id} org={self.org_id} tier={tier}")
        return session_id

    async def chat(self, session_id: str, user_message: str) -> Dict[str, Any]:
        """Envía mensaje y retorna respuesta del director. Persiste en DB."""
        db = self.db

        # Load + validate session
        sess = await db.director_sessions.find_one({"_id": session_id}, {"_id": 0})
        if not sess:
            raise ValueError(f"Sesión '{session_id}' no existe")
        if sess.get("status") == "ended":
            raise SessionEndedError(f"La sesión '{session_id}' ya fue cerrada")

        tier = sess.get("tier_at_start", "T1")
        sim_mode = sess.get("simulation_mode", False)
        cap_in, cap_out = TIER_CAPS.get(tier, (50000, 10000))

        # Token cap check
        if cap_in is not None and sess.get("total_tokens_in", 0) >= cap_in:
            raise TierCapExceededError(f"Cap de tokens de entrada alcanzado ({cap_in}) para tier {tier}")
        if cap_out is not None and sess.get("total_tokens_out", 0) >= cap_out:
            raise TierCapExceededError(f"Cap de tokens de salida alcanzado ({cap_out}) para tier {tier}")

        msg_id_user = f"dmsg_{uuid.uuid4().hex[:12]}"
        msg_id_asst = f"dmsg_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        tokens_user = _estimate_tokens(user_message)

        # Persist user message
        await db.director_messages.insert_one({
            "_id": msg_id_user,
            "session_id": session_id,
            "role": "user",
            "content": user_message,
            "tool_calls": None,
            "tool_results": None,
            "tokens_in": tokens_user,
            "tokens_out": 0,
            "cost_usd": 0.0,
            "latency_ms": 0,
            "simulated": False,
            "created_at": now,
        })

        # ── Simulation mode: bypass Anthropic ────────────────────────────────
        if sim_mode:
            sim_text = f"[SIM] Esta es una respuesta simulada para '{user_message[:80]}...'. En producción, el Director AI analizaría tu pregunta con datos reales de la plataforma."
            await db.director_messages.insert_one({
                "_id": msg_id_asst,
                "session_id": session_id,
                "role": "assistant",
                "content": sim_text,
                "tool_calls": None,
                "tool_results": None,
                "tokens_in": 0,
                "tokens_out": _estimate_tokens(sim_text),
                "cost_usd": 0.0,
                "latency_ms": 0,
                "simulated": True,
                "created_at": datetime.now(timezone.utc),
            })
            await db.director_sessions.update_one(
                {"_id": session_id},
                {"$set": {"last_message_at": datetime.now(timezone.utc)}}
            )
            return {
                "message_id": msg_id_asst,
                "assistant_message": sim_text,
                "tool_calls": [],
                "tokens_in": 0,
                "tokens_out": _estimate_tokens(sim_text),
                "cost_usd": 0.0,
                "simulated": True,
            }

        # ── Real LLM call ─────────────────────────────────────────────────────
        from emergentintegrations.llm.chat import LlmChat

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY no configurado")

        system_prompt = _build_system_prompt(self.org_id, self.role, tier, sim_mode)

        # Load conversation history
        history = await _load_history_as_openai(db, session_id, limit=40)
        initial_messages = [{"role": "system", "content": system_prompt}] + history

        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_prompt,
            initial_messages=initial_messages,
        ).with_model("anthropic", DIRECTOR_MODEL)

        t0 = time.monotonic()
        assistant_text, tool_calls_log, tok_in, tok_out = await _agentic_loop(
            db, chat, user_message, self.org_id
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK

        # Persist assistant message
        await db.director_messages.insert_one({
            "_id": msg_id_asst,
            "session_id": session_id,
            "role": "assistant",
            "content": assistant_text,
            "tool_calls": [tc["tool_name"] for tc in tool_calls_log] or None,
            "tool_results": None,
            "tokens_in": tok_in,
            "tokens_out": tok_out,
            "cost_usd": round(cost, 8),
            "latency_ms": latency_ms,
            "simulated": False,
            "created_at": datetime.now(timezone.utc),
        })

        # Persist tool call records
        for tc in tool_calls_log:
            tc_id = f"dtc_{uuid.uuid4().hex[:12]}"
            await db.director_tool_calls.insert_one({
                "_id": tc_id,
                "session_id": session_id,
                "message_id": msg_id_asst,
                "tool_name": tc["tool_name"],
                "input": tc["input"],
                "output": tc["output"],
                "latency_ms": tc["latency_ms"],
                "error": tc["output"].get("error") if isinstance(tc["output"], dict) else None,
                "created_at": datetime.now(timezone.utc),
            })

        # Update session totals
        await db.director_sessions.update_one(
            {"_id": session_id},
            {
                "$set": {"last_message_at": datetime.now(timezone.utc)},
                "$inc": {
                    "total_tokens_in": tok_in,
                    "total_tokens_out": tok_out,
                    "total_cost_usd": round(cost, 8),
                },
            }
        )

        return {
            "message_id": msg_id_asst,
            "assistant_message": assistant_text,
            "tool_calls": tool_calls_log,
            "tokens_in": tok_in,
            "tokens_out": tok_out,
            "cost_usd": round(cost, 8),
            "simulated": False,
        }

    async def end_session(self, session_id: str) -> None:
        """Cierra la sesión. Status → ended."""
        res = await self.db.director_sessions.update_one(
            {"_id": session_id},
            {"$set": {"status": "ended"}},
        )
        if res.matched_count == 0:
            raise ValueError(f"Sesión '{session_id}' no existe")


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.director_sessions.create_index(
            [("org_id", 1), ("status", 1)], name="idx_dir_sess_org_status"
        )
        await db.director_sessions.create_index(
            [("user_id", 1), ("last_message_at", -1)], name="idx_dir_sess_user_time"
        )
        await db.director_messages.create_index(
            [("session_id", 1), ("created_at", 1)], name="idx_dir_msg_sess_time"
        )
        await db.director_tool_calls.create_index(
            [("session_id", 1), ("created_at", 1)], name="idx_dir_tc_sess_time"
        )
        await db.director_tool_calls.create_index(
            [("tool_name", 1), ("created_at", -1)], name="idx_dir_tc_tool_time"
        )
        log.info("[director] indexes OK")
    except Exception as exc:
        log.warning(f"[director] ensure_indexes failed: {exc}")
