"""W4.6 Y.3D — DISC Inferencer.

Infiere personalidad DISC del comprador desde behavioral_events + Atlax chat
(asistente_messages/atlax_messages) + email_replies.

Output: 4 scores (D/I/S/C 0-100) + predominant_type + communication_preferences
+ recommended_approach_text + evidence (signals concretas).

3-layer resilience (idéntico patrón Y.3A/Y.3B/Y.3C):
  Layer 1 (LLM):       Claude Sonnet 4.5 + 3 tools (behavioral signals, atlax
                       messages, email replies) + zero-shot DISC prompt
  Layer 2 (cached):    disc_profiles <30d con behavioral_signature parecida
                       (mismo segment + budget_band + intent_pattern) via fuzzy
                       similarity sobre signals.
  Layer 3 (heuristic): rules-based scoring sobre behavioral signals · default
                       "S" + low confidence si vacío.

Phase Y guards:
  master_switch + tier `disc_inferencer` ≥ T1 (asesor)
  simulation_mode → solo layer 3 + data_quality="simulated"

Caps:
  - 1 refresh por lead / 24h (rate limit dedicado)
  - 30 inferences/min/org
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from sub_agents.resilience import CircuitBreaker, CircuitOpenError

log = logging.getLogger("dmx.agentic_crm.disc_inferencer")

DISC_MODEL        = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK  = 3.0 / 1_000_000
PRICE_OUT_PER_TOK = 15.0 / 1_000_000

PROFILE_TTL_DAYS  = 90
MIN_CAP_PER_MIN   = 30
REFRESH_COOLDOWN_HOURS = 24
SIMILARITY_THRESHOLD   = 0.78

DIMENSIONS = ("dominante", "influyente", "estable", "concienzudo")
TYPE_KEY   = {"dominante": "D", "influyente": "I", "estable": "S", "concienzudo": "C"}
KEY_TYPE   = {v: k for k, v in TYPE_KEY.items()}
TONES         = {"direct", "warm", "patient", "formal"}
LENGTHS       = {"concise", "moderate", "detailed"}
URGENCIES     = {"immediate", "warm-up", "methodical", "data-driven"}
CHANNELS      = {"call", "whatsapp", "email"}

_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)

_org_min_buckets: Dict[str, List[float]] = {}
_circuit_breakers: Dict[str, CircuitBreaker] = {}


# ─── Errors ───────────────────────────────────────────────────────────────────
class DISCInferencerDisabledError(Exception):
    """Phase Y master switch off o tier='off'."""


class DISCInferencerRateLimitError(Exception):
    """Cap excedido (30/min/org o 1/24h/lead)."""


class DISCInferencerNotFoundError(Exception):
    """Lead no encontrado."""


class DISCInferencerForbiddenError(Exception):
    """Cross-org acceso denegado."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"disc_inferencer_{org_id}"
    if key not in _circuit_breakers:
        _circuit_breakers[key] = CircuitBreaker(
            agent_type=key, failure_threshold=5, recovery_seconds=60,
        )
    return _circuit_breakers[key]


def _check_concurrency(org_id: str) -> bool:
    now = time.monotonic()
    bucket = _org_min_buckets.setdefault(org_id, [])
    _org_min_buckets[org_id] = [t for t in bucket if now - t < 60]
    return len(_org_min_buckets[org_id]) < MIN_CAP_PER_MIN


def _record_run(org_id: str) -> None:
    _org_min_buckets.setdefault(org_id, []).append(time.monotonic())


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    out = []
    for m in _TOOL_CALL_RE.finditer(text or ""):
        try:
            out.append(json.loads(m.group(1).strip()))
        except json.JSONDecodeError:
            continue
    return out


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text or "").strip()


# ─── Tools internos ───────────────────────────────────────────────────────────
async def _tool_behavioral_signals(db, lead_id: str) -> Dict[str, Any]:
    """Behavioral events + appointments + heat_score · últimos 60d."""
    if not lead_id:
        return {"error": "lead_id requerido"}
    since = _now() - timedelta(days=60)
    cur = db.behavioral_events.find(
        {"$or": [{"lead_id": lead_id}, {"actor_id": lead_id}],
         "timestamp": {"$gte": since}},
        {"_id": 0, "event": 1, "timestamp": 1, "metadata": 1},
    ).sort("timestamp", -1).limit(120)
    events: List[Dict[str, Any]] = []
    async for e in cur:
        if isinstance(e.get("timestamp"), datetime):
            e["timestamp"] = e["timestamp"].isoformat()
        events.append(e)

    # Appointments para detectar velocidad de decisión
    appts = []
    cur2 = db.appointments.find(
        {"lead_id": lead_id},
        {"_id": 0, "scheduled_at": 1, "slot_start": 1, "status": 1, "created_at": 1},
    ).sort("scheduled_at", -1).limit(20)
    async for a in cur2:
        for k in ("scheduled_at", "slot_start", "created_at"):
            v = a.get(k)
            if isinstance(v, datetime):
                a[k] = v.isoformat()
        appts.append(a)

    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "heat_score": 1,
                                                      "budget_band": 1, "intent": 1,
                                                      "created_at": 1, "stage": 1})
    if lead and isinstance(lead.get("created_at"), datetime):
        lead["created_at"] = lead["created_at"].isoformat()

    # Métricas derivadas
    unit_views = sum(1 for e in events if "unit" in (e.get("event") or ""))
    amenity_queries = sum(
        1 for e in events
        if "amenit" in (e.get("event") or "").lower()
        or "amenit" in str((e.get("metadata") or {}).get("query") or "").lower()
    )
    comparable_views = sum(1 for e in events if "compar" in (e.get("event") or "").lower())
    total_sessions = len({(e.get("metadata") or {}).get("session_id")
                          for e in events
                          if (e.get("metadata") or {}).get("session_id")})
    return {
        "lead_id": lead_id,
        "heat_score": (lead or {}).get("heat_score"),
        "budget_band": (lead or {}).get("budget_band"),
        "intent": (lead or {}).get("intent"),
        "stage": (lead or {}).get("stage"),
        "lead_created_at": (lead or {}).get("created_at"),
        "events_count_60d": len(events),
        "unit_views_60d": unit_views,
        "amenity_queries_60d": amenity_queries,
        "comparable_views_60d": comparable_views,
        "distinct_sessions_60d": total_sessions,
        "appointments_count": len(appts),
        "events_recent": events[:30],
        "appointments_recent": appts[:10],
    }


async def _tool_atlax_messages(db, lead_id: str) -> Dict[str, Any]:
    """Mensajes Atlax + Asistente del lead (últimos 60 mensajes)."""
    if not lead_id:
        return {"error": "lead_id requerido"}
    msgs: List[Dict[str, Any]] = []
    for coll_name in ("atlax_messages", "asistente_messages"):
        try:
            cur = db[coll_name].find(
                {"$or": [{"lead_id": lead_id}, {"actor_id": lead_id}],
                 "role": {"$in": ["user", "buyer"]}},
                {"_id": 0, "content": 1, "intent_detected": 1, "created_at": 1, "role": 1},
            ).sort("created_at", -1).limit(40)
            async for m in cur:
                if isinstance(m.get("created_at"), datetime):
                    m["created_at"] = m["created_at"].isoformat()
                m["source"] = coll_name
                msgs.append(m)
        except Exception:
            continue
    return {"lead_id": lead_id, "messages": msgs[:60], "count": len(msgs)}


async def _tool_email_replies(db, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    cur = db.email_replies.find(
        {"lead_id": lead_id},
        {"_id": 0, "subject": 1, "body_text": 1, "classification": 1, "received_at": 1},
    ).sort("received_at", -1).limit(20)
    replies: List[Dict[str, Any]] = []
    async for r in cur:
        if isinstance(r.get("received_at"), datetime):
            r["received_at"] = r["received_at"].isoformat()
        if r.get("body_text"):
            r["body_text"] = r["body_text"][:600]
        replies.append(r)
    return {"lead_id": lead_id, "replies": replies, "count": len(replies)}


async def _exec_disc_tool(db, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    try:
        lead_id = params.get("lead_id", "")
        if tool_name == "get_lead_behavioral_signals":
            return await _tool_behavioral_signals(db, lead_id)
        if tool_name == "get_lead_atlax_messages":
            return await _tool_atlax_messages(db, lead_id)
        if tool_name == "get_lead_email_replies":
            return await _tool_email_replies(db, lead_id)
        return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


# ─── Validation ───────────────────────────────────────────────────────────────
def _normalize_disc_payload(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Asegura shape estable del payload DISC. None si scores no parsean."""
    scores_in = raw.get("scores") or {}
    scores: Dict[str, int] = {}
    for d in DIMENSIONS:
        v = scores_in.get(d)
        try:
            scores[d] = max(0, min(100, int(v)))
        except (TypeError, ValueError):
            return None
    # Predominant: el score más alto
    predominant_dim = max(scores, key=scores.get)
    predominant_type = (raw.get("predominant_type") or "").strip().upper()
    if predominant_type not in KEY_TYPE:
        predominant_type = TYPE_KEY[predominant_dim]

    try:
        confidence = max(0, min(100, int(raw.get("confidence_score") or 50)))
    except (TypeError, ValueError):
        confidence = 50

    cp_in = raw.get("communication_preferences") or {}
    tone = (cp_in.get("tone") or "warm").strip().lower()
    if tone not in TONES:
        tone = "warm"
    length_pref = (cp_in.get("length_preference") or cp_in.get("length") or "moderate").strip().lower()
    if length_pref not in LENGTHS:
        length_pref = "moderate"
    urgency = (cp_in.get("urgency_response") or "warm-up").strip().lower()
    if urgency not in URGENCIES:
        urgency = "warm-up"
    channel = (cp_in.get("preferred_channel") or "whatsapp").strip().lower()
    if channel not in CHANNELS:
        channel = "whatsapp"

    evidence_in = raw.get("evidence") or {}
    evidence = {
        "behavioral_signals": [str(s)[:200] for s in (evidence_in.get("behavioral_signals") or [])][:6],
        "chat_signals":       [str(s)[:200] for s in (evidence_in.get("chat_signals")       or [])][:6],
        "reply_signals":      [str(s)[:200] for s in (evidence_in.get("reply_signals")      or [])][:6],
    }

    return {
        "scores": scores,
        "predominant_type": predominant_type,
        "confidence_score": confidence,
        "communication_preferences": {
            "tone": tone,
            "length_preference": length_pref,
            "urgency_response": urgency,
            "preferred_channel": channel,
        },
        "recommended_approach_text": str(raw.get("recommended_approach_text") or "")[:1200],
        "evidence": evidence,
    }


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit disc_inferencer abierto · org={org_id}")

    from llm_client import LlmChat, UserMessage as LlmUserMsg

    lead_id = lead.get("id") or ""
    lead_name = (lead.get("contact") or {}).get("name") or lead.get("name") or lead_id

    system_prompt = f"""Eres analista AI experto en perfilado DISC para compradores de real estate residencial en CDMX.

DISC framework (4 dimensiones, escala 0-100):
- D (Dominante): decisiones rápidas, directo, results-oriented, pide cifras y siguiente paso. Bajo tolerancia a small talk.
- I (Influyente): sociable, entusiasta, persuadible por amenidades/lifestyle/comunidad, alto engagement social. Busca experiencia.
- S (Estable): paciente, busca seguridad, lento decidir, requiere familia/cónyuge en decisión. Múltiples sesiones largas.
- C (Concienzudo): analítico, pide datos, ROI, comparables, spreadsheets, due diligence detallado. Pregunta riesgos.

LEAD A ANALIZAR: {lead_name} ({lead_id})

TOOLS DISPONIBLES (incluye en tu respuesta para invocarlas):
<tool_call>{{"tool": "get_lead_behavioral_signals", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_lead_atlax_messages", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_lead_email_replies", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>

TAREA: tras invocar tools, retorna SOLO un JSON único con shape exacto:
{{
  "scores": {{"dominante": int, "influyente": int, "estable": int, "concienzudo": int}},
  "predominant_type": "D"|"I"|"S"|"C",
  "confidence_score": int (0-100),
  "communication_preferences": {{
    "tone": "direct"|"warm"|"patient"|"formal",
    "length_preference": "concise"|"moderate"|"detailed",
    "urgency_response": "immediate"|"warm-up"|"methodical"|"data-driven",
    "preferred_channel": "call"|"whatsapp"|"email"
  }},
  "recommended_approach_text": "3-4 oraciones específicas para el asesor (es-MX, accionable, NO genérico)",
  "evidence": {{
    "behavioral_signals": ["frase concreta extraída de behavioral data", "..."],
    "chat_signals": ["frase concreta extraída de chat", "..."],
    "reply_signals": ["frase concreta extraída de email replies", "..."]
  }}
}}

REGLAS:
- Los 4 scores deben sumar aproximadamente 100 (margen ±10)
- predominant_type = key del score más alto (D=dominante, I=influyente, S=estable, C=concienzudo)
- evidence: signals CONCRETAS con datos reales de las tools (ej. "agendó cita 2h después de primer contacto = D" / "preguntó por amenidades 4 veces en 1 sesión = I" / "pidió 12 comparables financieros = C" / "5 sesiones en 14 días sin agendar visita = S")
- Si TODAS las tools retornan datos vacíos: scores=25 cada uno, predominant_type="S", confidence_score<30, recommended_approach_text="Datos insuficientes. Usar approach neutral basado en seguridad y paciencia hasta acumular más signals."
- NO inventes datos: si una tool falla, omite la sección correspondiente en evidence."""

    user_msg = (
        f"Infiere el perfil DISC para {lead_name} ({lead_id}). "
        "Invoca las 3 tools, analiza signals concretas, retorna el JSON."
    )

    session_id = f"disc_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id, system_message=system_prompt,
    ).with_model("anthropic", DISC_MODEL)

    tok_in = _estimate_tokens(system_prompt) + _estimate_tokens(user_msg)
    tok_out = 0
    raw_resp = ""
    current_message = user_msg

    for _ in range(3):
        try:
            raw_resp = await cb.call(chat.send_message, LlmUserMsg(text=current_message))
        except CircuitOpenError:
            raise
        raw_resp = raw_resp or ""
        tok_out += _estimate_tokens(raw_resp)

        tool_calls = _extract_tool_calls(raw_resp)
        if not tool_calls:
            break

        results_parts = []
        for spec in tool_calls[:5]:
            tname = spec.get("tool", "")
            p = spec.get("params") or {"lead_id": lead_id}
            res = await _exec_disc_tool(db, tname, p)
            res_str = json.dumps(res, ensure_ascii=False, default=str)
            if len(res_str) > 6000:
                res_str = res_str[:6000] + "...(truncated)"
            results_parts.append(f'<tool_result tool="{tname}">{res_str}</tool_result>')
            tok_in += _estimate_tokens(res_str)

        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nAnaliza signals y retorna SOLO el JSON DISC final."
        )

    clean = _strip_tool_calls(raw_resp).strip()
    json_match = re.search(r"\{.*\}", clean, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return None

    payload = _normalize_disc_payload(parsed)
    if not payload:
        return None

    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {
        "payload": payload,
        "tokens_in": tok_in, "tokens_out": tok_out, "cost_usd": round(cost, 8),
    }


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
def _signature_of(lead: Dict[str, Any]) -> str:
    seg = (lead.get("budget_band") or "").lower()
    intent = (lead.get("intent") or "").lower()
    zone = (lead.get("zone_interest") or lead.get("zone_id") or "").lower()
    return f"{seg}|{intent}|{zone}"


async def _layer_cached(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sig = _signature_of(lead)
    if not sig.strip("|"):
        return None
    since = _now() - timedelta(days=30)
    cur = db.disc_profiles.find(
        {"org_id": org_id, "inferred_at": {"$gte": since},
         "lead_id": {"$ne": lead.get("id")}},
        {"_id": 0, "lead_signature": 1, "scores": 1, "predominant_type": 1,
         "confidence_score": 1, "communication_preferences": 1,
         "recommended_approach_text": 1},
    ).limit(80)
    best = None
    best_score = 0.0
    async for doc in cur:
        cand_sig = doc.get("lead_signature") or ""
        s = SequenceMatcher(None, sig, cand_sig).ratio()
        if s > best_score:
            best_score = s
            best = doc
    if not best or best_score < SIMILARITY_THRESHOLD:
        return None

    payload = {
        "scores": dict(best.get("scores") or {}),
        "predominant_type": best.get("predominant_type") or "S",
        "confidence_score": max(40, int(int(best.get("confidence_score") or 60) * 0.85)),
        "communication_preferences": dict(
            best.get("communication_preferences") or {
                "tone": "warm", "length_preference": "moderate",
                "urgency_response": "warm-up", "preferred_channel": "whatsapp",
            }
        ),
        "recommended_approach_text": (
            f"[Plantilla cacheada · similitud {best_score:.2f}] "
            + (best.get("recommended_approach_text") or "")
        )[:1200],
        "evidence": {"behavioral_signals": [], "chat_signals": [], "reply_signals": []},
    }
    payload = _normalize_disc_payload(payload) or payload
    return {"payload": payload, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: heuristic ───────────────────────────────────────────────────────
async def _layer_heuristic(db, _org_id: str, lead: Dict[str, Any]) -> Dict[str, Any]:
    """Rules-based scoring sobre behavioral signals · default S si vacío."""
    lead_id = lead.get("id") or ""
    sigs = await _tool_behavioral_signals(db, lead_id) if lead_id else {}
    msgs_data = await _tool_atlax_messages(db, lead_id) if lead_id else {"messages": []}
    replies_data = await _tool_email_replies(db, lead_id) if lead_id else {"replies": []}

    appts = sigs.get("appointments_recent") or []
    msgs = msgs_data.get("messages") or []
    replies = replies_data.get("replies") or []

    # Inicializar scores baseline
    scores = {"dominante": 25, "influyente": 25, "estable": 25, "concienzudo": 25}
    behavioral_sig: List[str] = []
    chat_sig: List[str] = []
    reply_sig: List[str] = []

    # D: velocidad de decisión (cita agendada <24h tras 1er contacto)
    lead_created = sigs.get("lead_created_at")
    earliest_appt = None
    if appts:
        try:
            earliest_appt = min(
                (datetime.fromisoformat(a["scheduled_at"].replace("Z", "+00:00"))
                 for a in appts if a.get("scheduled_at")),
                default=None,
            )
        except Exception:
            earliest_appt = None
    if lead_created and earliest_appt:
        try:
            lc = datetime.fromisoformat(str(lead_created).replace("Z", "+00:00"))
            hours = (earliest_appt - lc).total_seconds() / 3600
            if hours < 12:
                scores["dominante"] += 25
                behavioral_sig.append(f"Agendó cita {hours:.1f}h después del 1er contacto · señal D fuerte")
            elif hours < 48:
                scores["dominante"] += 12
                behavioral_sig.append(f"Agendó cita {hours:.1f}h después · ritmo D moderado")
        except Exception:
            pass

    heat = sigs.get("heat_score") or 0
    try:
        heat = int(heat)
    except Exception:
        heat = 0
    if heat >= 75:
        scores["dominante"] += 10
        behavioral_sig.append(f"Heat score {heat}/100 · alta intención inmediata")

    # I: amenity queries y muchas conversaciones cortas
    amen = int(sigs.get("amenity_queries_60d") or 0)
    if amen >= 4:
        scores["influyente"] += 22
        behavioral_sig.append(f"{amen} consultas amenidades en 60d · señal I")
    elif amen >= 2:
        scores["influyente"] += 10
    if len(msgs) >= 12 and len(appts) == 0:
        scores["influyente"] += 10
        chat_sig.append(f"{len(msgs)} mensajes Atlax sin cita aún · perfil social")

    # S: muchas sesiones distribuidas en muchos días sin avanzar
    sessions = int(sigs.get("distinct_sessions_60d") or 0)
    events_count = int(sigs.get("events_count_60d") or 0)
    if sessions >= 5 and len(appts) == 0:
        scores["estable"] += 22
        behavioral_sig.append(f"{sessions} sesiones distintas en 60d sin agendar · perfil S paciente")
    elif sessions >= 3:
        scores["estable"] += 10

    # C: comparable views + mensajes largos pidiendo datos
    comps = int(sigs.get("comparable_views_60d") or 0)
    if comps >= 6:
        scores["concienzudo"] += 24
        behavioral_sig.append(f"{comps} vistas a comparables · señal C analítica")
    elif comps >= 3:
        scores["concienzudo"] += 12

    long_msgs = sum(1 for m in msgs if len(str(m.get("content") or "")) > 240)
    if long_msgs >= 3:
        scores["concienzudo"] += 14
        chat_sig.append(f"{long_msgs} mensajes largos pidiendo datos · perfil C")

    # Reply signals
    for r in replies[:6]:
        cls = r.get("classification") or {}
        cat = (cls.get("category") or "").lower()
        if cat == "objection":
            scores["concienzudo"] += 6
            reply_sig.append("Objeción explícita en reply · perfil C analítico")
        elif cat == "interested" and (cls.get("urgency") == "high"):
            scores["dominante"] += 6
            reply_sig.append("Reply interested+high urgency · perfil D")
        elif cat == "question":
            scores["concienzudo"] += 4

    # Confidence depende de cantidad de evidencia
    evidence_total = events_count + len(msgs) + len(replies)
    if evidence_total == 0:
        confidence = 18
    elif evidence_total < 8:
        confidence = 35
    elif evidence_total < 25:
        confidence = 55
    else:
        confidence = 70

    # Normalizar scores a ~100
    s_total = sum(scores.values()) or 1
    factor = 100 / s_total
    for d in DIMENSIONS:
        scores[d] = max(0, min(100, int(round(scores[d] * factor))))

    predominant_dim = max(scores, key=scores.get)
    predominant_type = TYPE_KEY[predominant_dim]

    # Communication preferences por type
    comm_by_type = {
        "D": {"tone": "direct",  "length_preference": "concise",
              "urgency_response": "immediate",   "preferred_channel": "call"},
        "I": {"tone": "warm",    "length_preference": "moderate",
              "urgency_response": "warm-up",     "preferred_channel": "whatsapp"},
        "S": {"tone": "patient", "length_preference": "moderate",
              "urgency_response": "methodical",  "preferred_channel": "whatsapp"},
        "C": {"tone": "formal",  "length_preference": "detailed",
              "urgency_response": "data-driven", "preferred_channel": "email"},
    }
    cp = comm_by_type[predominant_type]

    approach_by_type = {
        "D": "Comprador de perfil dominante. Ve directo al grano: precio, plazo y siguiente paso. Evita small talk, comparte datos clave en bullets. Cierra con propuesta accionable en menos de 24h.",
        "I": "Comprador de perfil influyente. Construye rapport rápido, comparte historias de otros propietarios y enfatiza amenidades, comunidad y lifestyle. Usa WhatsApp con voice notes y fotos.",
        "S": "Comprador de perfil estable. Ofrece seguridad, plazos claros y testimonios. Permítele tomar varias sesiones; involucra a su pareja/familia. Evita presión y compromete cronograma de seguimiento sin agresividad.",
        "C": "Comprador de perfil concienzudo. Prepara comparables financieros, ROI y due diligence formal. Responde por email con datos verificables y cita fuentes. Anticipa objeciones técnicas y trae documentación.",
    }
    approach_text = approach_by_type[predominant_type]
    if confidence < 35:
        approach_text = ("[Confianza baja · pocos signals] " + approach_text)[:1200]

    payload = _normalize_disc_payload({
        "scores": scores,
        "predominant_type": predominant_type,
        "confidence_score": confidence,
        "communication_preferences": cp,
        "recommended_approach_text": approach_text,
        "evidence": {
            "behavioral_signals": behavioral_sig,
            "chat_signals": chat_sig,
            "reply_signals": reply_sig,
        },
    }) or {}
    return {"payload": payload, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Engine ───────────────────────────────────────────────────────────────────
class DISCInferencer:
    """Inferencer 3-layer + Phase Y + caps + audit log."""

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise DISCInferencerDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("disc_inferencer", "off")
        if tier == "off":
            raise DISCInferencerDisabledError("DISC Inferencer requiere tier T1 o superior")
        sim = sim_override or settings.get("simulation_mode", False)
        return tier, sim

    async def _resolve_lead(self, lead_id: str) -> Dict[str, Any]:
        lead = await self.db.leads.find_one({"id": lead_id})
        if not lead:
            raise DISCInferencerNotFoundError(f"Lead {lead_id} no encontrado")
        if lead.get("dev_org_id") and lead["dev_org_id"] != self.org_id:
            raise DISCInferencerForbiddenError(f"Lead {lead_id} no pertenece a {self.org_id}")
        return lead

    async def infer_profile(self, lead_id: str, force_refresh: bool = False,
                            simulation_override: bool = False) -> Dict[str, Any]:
        _tier, sim_mode = await self._validate_phase_y(simulation_override)

        lead = await self._resolve_lead(lead_id)

        # Rate limit lead-level (1 refresh / 24h) cuando force_refresh=True
        existing = await self.db.disc_profiles.find_one({"org_id": self.org_id,
                                                         "lead_id": lead_id})
        if force_refresh and existing:
            inferred_at = _ensure_utc(existing.get("inferred_at"))
            if inferred_at and (_now() - inferred_at) < timedelta(hours=REFRESH_COOLDOWN_HOURS):
                raise DISCInferencerRateLimitError(
                    f"Refresh disponible en {REFRESH_COOLDOWN_HOURS}h tras última inferencia"
                )

        # Si no force_refresh y existe y no expirado: devolver cache
        if not force_refresh and existing:
            inferred_at = _ensure_utc(existing.get("inferred_at"))
            if inferred_at and (_now() - inferred_at) < timedelta(days=7):
                out = self._serialize(existing)
                out["from_cache"] = True
                return out

        # Cap concurrencia org
        if not _check_concurrency(self.org_id):
            raise DISCInferencerRateLimitError(
                "Cap 30/min/org excedido. Intenta en 60 seg."
            )
        _record_run(self.org_id)

        t0 = time.monotonic()
        out = None
        layer_used = "none"

        if not sim_mode:
            try:
                out = await _layer_llm(self.db, self.org_id, lead)
                if out:
                    layer_used = "llm"
            except Exception as e:  # noqa: BLE001
                log.warning(f"[disc_inferencer] layer_llm failed: {e}")
            if not out:
                try:
                    out = await _layer_cached(self.db, self.org_id, lead)
                    if out:
                        layer_used = "cached"
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[disc_inferencer] layer_cached failed: {e}")
        if not out:
            out = await _layer_heuristic(self.db, self.org_id, lead)
            layer_used = "heuristic"

        latency_ms = int((time.monotonic() - t0) * 1000)
        payload = out["payload"]
        now = _now()
        expires_at = now + timedelta(days=PROFILE_TTL_DAYS)
        data_quality = "simulated" if sim_mode else (
            "high" if layer_used == "llm" else
            "medium" if layer_used == "cached" else "basic"
        )

        doc = {
            "_id": existing.get("_id") if existing else f"disc_{uuid.uuid4().hex[:14]}",
            "org_id": self.org_id,
            "lead_id": lead_id,
            "lead_signature": _signature_of(lead),
            "scores": payload["scores"],
            "predominant_type": payload["predominant_type"],
            "confidence_score": payload["confidence_score"],
            "communication_preferences": payload["communication_preferences"],
            "recommended_approach_text": payload["recommended_approach_text"],
            "evidence": payload["evidence"],
            "layer_used": layer_used,
            "data_quality": data_quality,
            "tokens_in": out.get("tokens_in", 0),
            "tokens_out": out.get("tokens_out", 0),
            "cost_usd": out.get("cost_usd", 0.0),
            "latency_ms": latency_ms,
            "inferred_at": now,
            "refresh_count": int((existing or {}).get("refresh_count") or 0) + (1 if existing else 0),
            "expires_at": expires_at,
        }

        await self.db.disc_profiles.update_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"$set": doc}, upsert=True,
        )

        # AI cost tracking
        if layer_used == "llm" and doc["cost_usd"] > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    self.db, self.org_id, DISC_MODEL,
                    doc["tokens_in"] + doc["tokens_out"],
                    call_type="disc_inferencer", feature_key="disc_inferencer",
                )
            except Exception:
                pass

        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "disc_inferencer.inferred",
                "org_id": self.org_id, "lead_id": lead_id,
                "predominant_type": payload["predominant_type"],
                "confidence_score": payload["confidence_score"],
                "layer_used": layer_used,
                "simulation": sim_mode,
                "created_at": now,
            })
        except Exception:
            pass

        # W4.13.A — Lead Journey hook
        try:
            from lead_journey_engine import emit_step
            await emit_step(
                self.db, lead_id=lead_id, tenant_id=self.org_id,
                step_type="disc_inferred", actor_type="system",
                payload={
                    "disc_bucket": doc.get("primary_style") or doc.get("disc_bucket"),
                    "confidence": doc.get("confidence"),
                    "layer": doc.get("layer_used"),
                },
            )
        except Exception:
            pass

        return self._serialize(doc)

    async def refresh_profile(self, lead_id: str) -> Dict[str, Any]:
        return await self.infer_profile(lead_id, force_refresh=True)

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in doc.items() if k != "_id"}
        out["profile_id"] = doc.get("_id") or doc.get("profile_id")
        for k in ("inferred_at", "expires_at"):
            v = out.get(k)
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        return out


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_disc_indexes(db) -> None:
    try:
        await db.disc_profiles.create_index(
            [("org_id", 1), ("lead_id", 1)], unique=True,
            name="idx_disc_org_lead_unique", background=True,
        )
        await db.disc_profiles.create_index(
            [("predominant_type", 1), ("inferred_at", -1)],
            name="idx_disc_type_inferred", background=True,
        )
        await db.disc_profiles.create_index(
            "expires_at", expireAfterSeconds=0,
            name="idx_disc_ttl", background=True,
        )
        await db.disc_profiles.create_index(
            [("org_id", 1), ("lead_signature", 1), ("inferred_at", -1)],
            name="idx_disc_signature_cache", background=True,
        )
        log.info("[disc_inferencer] indexes OK")
    except Exception as exc:
        log.warning(f"[disc_inferencer] ensure_indexes failed: {exc}")
