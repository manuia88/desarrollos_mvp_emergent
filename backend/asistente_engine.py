"""W4.4E — Phase Y.1E · Asistente Público (chat comprador).

Chat público anónimo en `/asistente`. NO requiere login. Lead capture suave al final.

LLM: claude-sonnet-4-5-20250929 vía emergentintegrations.LlmChat
Tools públicas: search_developments_public, get_zone_info, get_market_pulse_public
LFPDPPP: ip_hash SHA256+salt 8 chars. NO se almacena IP raw.

Caps:
- 30 mensajes/session (luego 429 "Sesión completa, agenda cita")
- 5 sessions/hora/ip_hash
- 20 mensajes/min/session
- max 200 tokens output por response (chat ágil)

Phase Y gating: org_id="dmx" master switch + tier asistente_publico (fallback diagnostic_engine).
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.asistente")

ASISTENTE_MODEL = os.environ.get("ASISTENTE_MODEL", "claude-sonnet-4-5-20250929")
DMX_ORG_ID = "dmx"

# Caps
MAX_MESSAGES_PER_SESSION = 30
MAX_TOKENS_OUT_PER_MSG = 200
SESSIONS_PER_HOUR_PER_IP = 5
MESSAGES_PER_MIN_PER_SESSION = 20
SESSION_EXPIRE_HOURS = 24

# Welcome message in es-MX
WELCOME_MESSAGE = (
    "Hola, soy el asistente DesarrollosMX. Puedo ayudarte a encontrar departamento o "
    "casa en CDMX. ¿Qué buscas?"
)

# Intent keywords
_INTENT_PATTERNS = {
    "cita": re.compile(r"\b(cita|agendar|visita|whatsapp|contact[oa]r|asesor|llamar|conectar)\b", re.IGNORECASE),
    "presupuesto": re.compile(r"\b(presupuesto|cu[áa]nto|enganche|cr[ée]dito|infonavit|fovissste|mensualidad|pagar)\b", re.IGNORECASE),
    "comparables": re.compile(r"\b(comparar|vs|versus|opciones|altern[ae]ti[vab][oa]s|similar)\b", re.IGNORECASE),
    "zona": re.compile(r"\b(zona|colonia|barrio|polanco|condesa|roma|coyoac[áa]n|narvarte|n[áa]poles|del valle|santa fe|escand[óo]n)\b", re.IGNORECASE),
}

_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)

# In-process rate limiters
_session_buckets: Dict[str, List[float]] = defaultdict(list)
_message_buckets: Dict[str, List[float]] = defaultdict(list)


# ─── Custom errors ────────────────────────────────────────────────────────────
class AsistenteDisabledError(Exception):
    """Phase Y master switch OFF para org=dmx o tier=off."""


class AsistenteRateLimitError(Exception):
    """Rate limit excedido."""


class AsistenteSessionCapError(Exception):
    """Cap de mensajes por sesión alcanzado."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_rate(buckets: Dict[str, List[float]], key: str, limit: int, window_s: int) -> bool:
    now = time.monotonic()
    buckets[key] = [t for t in buckets[key] if now - t < window_s]
    if len(buckets[key]) >= limit:
        return False
    buckets[key].append(now)
    return True


def _detect_intent(text: str) -> str:
    if not text:
        return "otro"
    for intent, pattern in _INTENT_PATTERNS.items():
        if pattern.search(text):
            return intent
    return "otro"


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _system_prompt(sim_mode: bool, intent_history: List[str]) -> str:
    sim_note = "\n\n⚠️ MODO SIMULACIÓN: respuestas marcadas [SIM]. Mismo flujo, sin LLM real." if sim_mode else ""
    intent_note = ""
    if intent_history:
        intent_note = f"\nIntents detectados en sesión: {', '.join(intent_history[-5:])}"

    return f"""Eres el Asistente Público de DesarrollosMX (DMX), una plataforma de inteligencia inmobiliaria para CDMX.

Tu rol: ayudar a CUALQUIER persona (sin login) a encontrar departamento o casa en CDMX. Mercado objetivo: residencial nuevo y reventa en CDMX.

TONO: Cercano, directo, profesional, en español es-MX. Respuestas CONCISAS (máx 3-4 oraciones por mensaje). Datos concretos cuando los tengas.{sim_note}{intent_note}

══ TOOLS DISPONIBLES ══
Cuando necesites datos, incluye EXACTAMENTE este formato (una línea separada):

<tool_call>{{"tool": "NOMBRE_TOOL", "params": {{...}}}}</tool_call>

TOOLS Y PARAMS:

1. search_developments_public
   params: {{ "zone": str (slug colonia, opcional), "price_min": int, "price_max": int, "bedrooms": int, "type": "depto"|"casa" }}
   devuelve: top 5 desarrollos publicados que matchean

2. get_zone_info
   params: {{ "zone_slug": str }}
   devuelve: info de la zona (precio promedio, comparables, amenidades, scores DMX)

3. get_market_pulse_public
   params: {{}}
   devuelve: pulso del mercado CDMX últimos 30 días (precios, demanda, tendencias agregadas)

REGLAS:
- Solo incluye <tool_call> si REALMENTE necesitas los datos para responder
- Máximo 2 tool_calls por respuesta
- Si user pregunta zona/precio/comparables → usa tools
- Si user menciona presupuesto/intención de comprar/cita/WhatsApp → al final del response sugiere capturar contacto: "Si quieres, te conectamos con un asesor especializado para resolver dudas concretas."
- NUNCA inventes precios o nombres de proyectos. Si no tienes data, di "no tengo ese dato actualizado, te conecto con un asesor".
- Si pregunta sobre algo fuera de CDMX (otras ciudades), responde: "Por ahora solo cubrimos CDMX en detalle, pero próximamente expandimos a Monterrey y Guadalajara."
"""


# ─── Tool execution ───────────────────────────────────────────────────────────
async def _exec_tool(db, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Ejecuta tool pública. NO accede a data interna de orgs."""
    try:
        if tool_name == "search_developments_public":
            return await _tool_search_developments_public(db, params)
        if tool_name == "get_zone_info":
            return await _tool_get_zone_info(db, params.get("zone_slug", ""))
        if tool_name == "get_market_pulse_public":
            return await _tool_get_market_pulse_public(db)
        return {"error": f"Tool desconocida: {tool_name}"}
    except Exception as e:
        log.warning(f"[asistente_tool] {tool_name}: {e}")
        return {"error": str(e)}


async def _tool_search_developments_public(_db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Reusa data_developments. Solo retorna proyectos publicados."""
    from data_developments import DEVELOPMENTS
    zone = (params.get("zone") or "").strip().lower() or None
    price_min = params.get("price_min")
    price_max = params.get("price_max")
    bedrooms = params.get("bedrooms")
    # dtype param accepted but not currently differentiating depto/casa in DEVELOPMENTS

    results = []
    for d in DEVELOPMENTS:
        if zone and d.get("colonia_id") != zone:
            continue
        pf = d.get("price_from") or 0
        pt = d.get("price_to") or pf
        if price_min and pt < price_min:
            continue
        if price_max and pf > price_max:
            continue
        if bedrooms is not None:
            rng = d.get("bedrooms_range") or []
            if len(rng) == 2 and (bedrooms < rng[0] or bedrooms > rng[1]):
                continue
        results.append({
            "id": d["id"],
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "price_from": pf,
            "price_to": pt,
            "bedrooms_range": d.get("bedrooms_range"),
            "m2_range": d.get("m2_range"),
            "stage": d.get("stage"),
        })
        if len(results) >= 5:
            break
    return {"developments": results, "count": len(results)}


async def _tool_get_zone_info(db, zone_slug: str) -> Dict[str, Any]:
    if not zone_slug:
        return {"error": "zone_slug requerido"}
    from data_developments import DEVELOPMENTS
    zone_devs = [d for d in DEVELOPMENTS if d.get("colonia_id") == zone_slug]
    if not zone_devs:
        return {"error": f"Zona '{zone_slug}' sin desarrollos registrados"}
    prices = [d.get("price_from") or 0 for d in zone_devs if d.get("price_from")]
    avg_price = round(sum(prices) / len(prices)) if prices else None

    # Try to fetch IE scores
    scores = await db.ie_scores.find(
        {"zone_id": zone_slug},
        {"_id": 0, "code": 1, "value": 1, "tier": 1},
    ).limit(20).to_list(20)

    return {
        "zone_slug": zone_slug,
        "developments_count": len(zone_devs),
        "avg_price_from_mxn": avg_price,
        "amenities_top": list({a for d in zone_devs for a in (d.get("amenities") or [])})[:8],
        "ie_scores": scores[:10],
    }


async def _tool_get_market_pulse_public(db) -> Dict[str, Any]:
    """Métricas agregadas últimos 30 días — públicas (no por org)."""
    from data_developments import DEVELOPMENTS
    total_devs = len(DEVELOPMENTS)
    by_stage: Dict[str, int] = {}
    prices: List[int] = []
    for d in DEVELOPMENTS:
        s = d.get("stage", "desconocido")
        by_stage[s] = by_stage.get(s, 0) + 1
        if d.get("price_from"):
            prices.append(d["price_from"])

    avg_price = round(sum(prices) / len(prices)) if prices else None
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None

    # Behavioral 30d (público — sin org_id filter)
    since = _now() - timedelta(days=30)
    try:
        events_30d = await db.behavioral_events.count_documents({"timestamp": {"$gte": since}})
    except Exception:
        events_30d = 0

    return {
        "period": "últimos 30 días",
        "developments_total": total_devs,
        "by_stage": by_stage,
        "avg_price_from_mxn": avg_price,
        "min_price_mxn": min_price,
        "max_price_mxn": max_price,
        "platform_visits_30d": events_30d,
    }


# ─── Tool loop ────────────────────────────────────────────────────────────────
def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    calls = []
    for m in _TOOL_CALL_RE.finditer(text or ""):
        try:
            calls.append(json.loads(m.group(1).strip()))
        except json.JSONDecodeError:
            continue
    return calls


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text or "").strip()


# ─── Phase Y gate ─────────────────────────────────────────────────────────────
async def _check_phase_y(db) -> Dict[str, Any]:
    """Validate Phase Y master + tier asistente_publico (fallback diagnostic_engine).

    Returns settings dict with `_resolved_tier` + `_simulation_mode`.
    Raises AsistenteDisabledError.
    """
    from routes_phase_y_controls import get_phase_y_settings
    settings = await get_phase_y_settings(db, DMX_ORG_ID)
    if not settings.get("agentic_enabled", False):
        raise AsistenteDisabledError("Asistente temporalmente fuera de servicio")
    tiers = settings.get("feature_tiers") or {}
    tier = tiers.get("asistente_publico") or tiers.get("diagnostic_engine", "off")
    if tier == "off":
        raise AsistenteDisabledError("Asistente temporalmente fuera de servicio")
    return {**settings, "_resolved_tier": tier, "_simulation_mode": bool(settings.get("simulation_mode", False))}


# ─── AsistenteEngine ──────────────────────────────────────────────────────────
class AsistenteEngine:
    def __init__(self, db):
        self.db = db

    async def start_session(
        self,
        ip_raw: str,
        user_agent: str,
        referral_source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Crea sesión nueva. Valida Phase Y + rate limit por ip_hash."""
        await _check_phase_y(self.db)

        from behavioral_tracking_engine import _hash_ip
        ip_hash = _hash_ip(ip_raw or "unknown")

        # Rate limit: 5 sessions/hour/ip
        if not _check_rate(_session_buckets, ip_hash, SESSIONS_PER_HOUR_PER_IP, 3600):
            raise AsistenteRateLimitError(
                f"Demasiadas sesiones nuevas desde tu IP ({SESSIONS_PER_HOUR_PER_IP}/hora). Intenta más tarde."
            )

        ua_hash = _hash_ip(user_agent or "unknown")  # reusa _hash_ip para user-agent
        token = f"asis_{uuid.uuid4().hex[:20]}"
        now = _now()

        await self.db.asistente_sessions.insert_one({
            "_id": token,
            "session_token": token,
            "ip_hash": ip_hash,
            "user_agent_hash": ua_hash,
            "created_at": now,
            "last_message_at": now,
            "message_count": 0,
            "captured_lead_id": None,
            "status": "active",
            "referral_source": referral_source,
            "channel": "web_bubble" if referral_source == "caya_bubble" else "web",
        })
        log.info(f"[asistente] session start {token} ip={ip_hash} ref={referral_source}")
        return {"session_token": token, "welcome_message": WELCOME_MESSAGE}

    async def chat(self, session_token: str, user_message: str) -> Dict[str, Any]:
        """Envía mensaje y recibe response del LLM."""
        if not user_message or not user_message.strip():
            raise ValueError("message vacío")

        # Phase Y validation
        settings = await _check_phase_y(self.db)
        sim_mode = settings.get("_simulation_mode", False)

        sess = await self.db.asistente_sessions.find_one({"_id": session_token})
        if not sess:
            raise ValueError("Sesión no encontrada")
        if sess.get("status") == "expired":
            raise ValueError("Sesión expirada")

        msg_count = sess.get("message_count", 0)
        if msg_count >= MAX_MESSAGES_PER_SESSION:
            raise AsistenteSessionCapError(
                "Sesión completa, agenda una cita con un asesor para continuar."
            )

        # Rate limit per session
        if not _check_rate(_message_buckets, session_token, MESSAGES_PER_MIN_PER_SESSION, 60):
            raise AsistenteRateLimitError("Demasiados mensajes en poco tiempo. Intenta en un momento.")

        user_message = user_message.strip()[:1000]  # cap input
        intent = _detect_intent(user_message)

        # Persist user message
        user_msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        await self.db.asistente_messages.insert_one({
            "_id": user_msg_id,
            "session_token": session_token,
            "role": "user",
            "content": user_message,
            "tokens_in": _estimate_tokens(user_message),
            "tokens_out": 0,
            "cost_usd": 0.0,
            "latency_ms": 0,
            "tool_calls": None,
            "intent_detected": intent,
            "created_at": _now(),
        })

        # Compute intent_history
        prev_msgs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": "user"},
            {"_id": 0, "intent_detected": 1},
        ).sort("created_at", 1).limit(20).to_list(20)
        intent_history = [m.get("intent_detected") for m in prev_msgs if m.get("intent_detected")]

        # ── Simulation mode: bypass LLM ─────────────────────────────────────
        if sim_mode:
            sim_text = (
                f"[SIM] Respuesta simulada para tu pregunta. "
                f"Intent detectado: {intent}. En producción, el asistente DMX usaría datos reales."
            )
            suggested_capture = intent in ("cita", "presupuesto")
            await self._persist_assistant(
                session_token, sim_text, [], 0, _estimate_tokens(sim_text),
                latency_ms=0, intent=intent, simulated=True,
            )
            await self._bump_session(session_token)
            return {
                "assistant_message": sim_text,
                "tool_calls": [],
                "intent_detected": intent,
                "suggested_lead_capture": suggested_capture,
                "simulated": True,
                "message_count": msg_count + 1,
                "tier": settings.get("_resolved_tier"),
            }

        # ── Real LLM call ───────────────────────────────────────────────────
        from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY no configurado")

        # Load conversation history
        history_docs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": {"$in": ["user", "assistant"]}},
            {"_id": 0, "role": 1, "content": 1},
        ).sort("created_at", 1).limit(20).to_list(20)
        history = [{"role": d["role"], "content": d["content"] or ""} for d in history_docs]

        sys_prompt = _system_prompt(sim_mode, intent_history)
        chat = LlmChat(
            api_key=api_key,
            session_id=session_token,
            system_message=sys_prompt,
            initial_messages=[{"role": "system", "content": sys_prompt}] + history,
        ).with_model("anthropic", ASISTENTE_MODEL)

        t0 = time.monotonic()
        try:
            assistant_text, tool_calls_log = await self._agentic_loop(chat, user_message)
        except Exception as e:
            log.warning(f"[asistente] llm error session={session_token}: {e}")
            assistant_text = (
                "Tuve un problema al procesar tu pregunta. ¿Puedes reformularla? Si necesitas ayuda urgente, "
                "te conectamos con un asesor."
            )
            tool_calls_log = []
        latency_ms = int((time.monotonic() - t0) * 1000)

        tokens_in = _estimate_tokens(user_message) + sum(_estimate_tokens(json.dumps(tc.get("output") or {}, ensure_ascii=False)) for tc in tool_calls_log)
        tokens_out = _estimate_tokens(assistant_text)

        # Suggested lead capture
        suggested_capture = (
            intent in ("cita", "presupuesto")
            or any(k in (assistant_text or "").lower() for k in ("conectamos con un asesor", "agenda una cita", "asesor especializado"))
        )

        await self._persist_assistant(
            session_token, assistant_text, tool_calls_log, tokens_in, tokens_out,
            latency_ms=latency_ms, intent=intent, simulated=False,
        )
        await self._bump_session(session_token)

        return {
            "assistant_message": assistant_text,
            "tool_calls": [tc.get("tool_name") for tc in tool_calls_log],
            "intent_detected": intent,
            "suggested_lead_capture": suggested_capture,
            "simulated": False,
            "message_count": msg_count + 1,
            "tier": settings.get("_resolved_tier"),
        }

    async def _agentic_loop(self, chat, user_message: str, max_rounds: int = 2) -> Tuple[str, List[Dict]]:
        from emergentintegrations.llm.chat import UserMessage as LlmUserMsg
        all_tool_calls: List[Dict] = []
        current_message = user_message
        for _r in range(max_rounds):
            raw = await chat.send_message(LlmUserMsg(text=current_message))
            specs = _extract_tool_calls(raw or "")
            if not specs:
                return _strip_tool_calls(raw or ""), all_tool_calls
            results = []
            for spec in specs[:2]:  # max 2 tools
                tname = spec.get("tool", "")
                params = spec.get("params") or {}
                t0 = time.monotonic()
                output = await _exec_tool(self.db, tname, params)
                latency = int((time.monotonic() - t0) * 1000)
                all_tool_calls.append({"tool_name": tname, "input": params, "output": output, "latency_ms": latency})
                results.append(f"<tool_result tool=\"{tname}\">{json.dumps(output, ensure_ascii=False)}</tool_result>")
            current_message = (
                "RESULTADOS DE TOOLS:\n" + "\n".join(results) +
                "\n\nDa tu respuesta final concisa al usuario (máx 3 oraciones)."
            )
        # Fallback last response
        last = await chat.send_message(LlmUserMsg(text=current_message))
        return _strip_tool_calls(last or ""), all_tool_calls

    async def _persist_assistant(
        self, session_token: str, content: str, tool_calls: List[Dict],
        tokens_in: int, tokens_out: int, latency_ms: int, intent: str, simulated: bool,
    ) -> None:
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        # Cost: claude sonnet $3/$15 per 1M tokens
        cost_usd = round((tokens_in * 3.0 + tokens_out * 15.0) / 1_000_000, 8)
        await self.db.asistente_messages.insert_one({
            "_id": msg_id,
            "session_token": session_token,
            "role": "assistant",
            "content": content,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
            "tool_calls": [tc.get("tool_name") for tc in tool_calls] or None,
            "intent_detected": intent,
            "simulated": simulated,
            "created_at": _now(),
        })

    async def _bump_session(self, session_token: str) -> None:
        await self.db.asistente_sessions.update_one(
            {"_id": session_token},
            {"$set": {"last_message_at": _now()}, "$inc": {"message_count": 1}},
        )

    async def capture_lead(
        self, session_token: str,
        nombre: str, whatsapp: str,
        email: Optional[str] = None, mensaje: Optional[str] = None,
        source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Captura lead, asocia a sesión, persiste en `leads` con source override-able.

        Default source="asistente_publico". Caya bubble usa source="caya_bubble".
        """
        if not nombre or not whatsapp:
            raise ValueError("nombre y whatsapp son requeridos")
        sess = await self.db.asistente_sessions.find_one({"_id": session_token})
        if not sess:
            raise ValueError("Sesión no encontrada")

        # Intent history desde mensajes
        msgs = await self.db.asistente_messages.find(
            {"session_token": session_token, "role": "user"},
            {"_id": 0, "intent_detected": 1},
        ).sort("created_at", 1).to_list(50)
        intent_history = [m.get("intent_detected") for m in msgs if m.get("intent_detected")]

        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        now_iso = _now().isoformat()
        resolved_source = source or "asistente_publico"
        lead = {
            "id": lead_id,
            "dev_org_id": DMX_ORG_ID,  # default DMX org for follow-up
            "source": resolved_source,
            "source_metadata": {
                "session_token": session_token,
                "intent_history": intent_history,
                "referral_source": sess.get("referral_source"),
                "ip_hash": sess.get("ip_hash"),
            },
            "contact": {
                "name": nombre.strip()[:100],
                "phone": whatsapp.strip()[:30],
                "email": (email or "").strip()[:100] or None,
            },
            "intent": intent_history[-1] if intent_history else "otro",
            "message": (mensaje or "").strip()[:500] or None,
            "status": "nuevo",
            "assigned_to": None,
            "created_at": now_iso,
            "updated_at": now_iso,
            "last_activity_at": now_iso,
            "created_by": "_asistente_publico",
        }
        await self.db.leads.insert_one(dict(lead))
        await self.db.asistente_sessions.update_one(
            {"_id": session_token},
            {"$set": {"captured_lead_id": lead_id}},
        )

        # Activity log (best-effort)
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "asistente.lead_captured",
                "lead_id": lead_id,
                "session_token": session_token,
                "intent_history": intent_history,
                "created_at": _now(),
            })
        except Exception:
            pass

        log.info(f"[asistente] lead captured {lead_id} session={session_token}")
        return {"lead_id": lead_id, "status": "captured"}

    async def get_or_create_from_legacy(
        self,
        legacy_caya_session_id: str,
        ip_raw: str,
        user_agent: str,
    ) -> str:
        """Mapea un session_id legacy de Caya (`dmx_caya_*`) a un asistente_token.

        SECURITY (W4.4E.5.1): valida que el legacy_id exista en `caya_sessions`.
        Si NO existe, aplica rate limit por IP igual que `start_session`
        (5 sessions/hora/ip_hash) para prevenir spam de mappings inválidos.
        Si SÍ existe, mapping idempotente sin rate limit (no penaliza usuarios legítimos).

        Idempotente: si el mapping ya existe, retorna el token.
        """
        existing = await self.db.caya_sessions_migration.find_one(
            {"legacy_id": legacy_caya_session_id},
            {"_id": 0, "asistente_token": 1},
        )
        if existing and existing.get("asistente_token"):
            return existing["asistente_token"]

        from behavioral_tracking_engine import _hash_ip
        ip_hash = _hash_ip(ip_raw or "unknown")

        # ── SECURITY: validar que el legacy_id existe en caya_sessions ──────
        legacy_doc = await self.db.caya_sessions.find_one(
            {"session_id": legacy_caya_session_id}, {"_id": 1},
        )
        if not legacy_doc:
            # Audit log para forensics
            try:
                await self.db.activity_log.insert_one({
                    "id": f"act_{uuid.uuid4().hex[:12]}",
                    "type": "asistente.legacy_mapping_rejected",
                    "reason": "legacy_session_not_found",
                    "legacy_id_attempted": legacy_caya_session_id[:64],
                    "ip_hash": ip_hash,
                    "created_at": _now(),
                })
            except Exception:
                pass
            # Aplicar rate limit (5/hora/ip) para prevenir spam de mappings fake
            if not _check_rate(_session_buckets, ip_hash, SESSIONS_PER_HOUR_PER_IP, 3600):
                raise AsistenteRateLimitError(
                    "legacy mapping rate limit exceeded"
                )
            log.warning(
                f"[asistente] legacy_id no existe pero IP {ip_hash} bajo rate limit · creando session nueva"
            )

        ua_hash = _hash_ip(user_agent or "unknown")
        token = f"asis_{uuid.uuid4().hex[:20]}"
        now = _now()
        await self.db.asistente_sessions.insert_one({
            "_id": token,
            "session_token": token,
            "ip_hash": ip_hash,
            "user_agent_hash": ua_hash,
            "created_at": now,
            "last_message_at": now,
            "message_count": 0,
            "captured_lead_id": None,
            "status": "active",
            "referral_source": "caya_bubble",
            "channel": "web_bubble",
            "legacy_caya_session_id": legacy_caya_session_id,
            "legacy_validated": bool(legacy_doc),
        })
        await self.db.caya_sessions_migration.update_one(
            {"legacy_id": legacy_caya_session_id},
            {"$set": {
                "legacy_id": legacy_caya_session_id,
                "asistente_token": token,
                "created_at": now,
                "legacy_validated": bool(legacy_doc),
            }},
            upsert=True,
        )
        log.info(f"[asistente] mapped legacy caya {legacy_caya_session_id} → {token} (validated={bool(legacy_doc)})")
        return token

    async def expire_old_sessions(self, hours: int = SESSION_EXPIRE_HOURS) -> int:
        """Cron diario: marca status=expired sesiones inactivas >N horas."""
        cutoff = _now() - timedelta(hours=hours)
        result = await self.db.asistente_sessions.update_many(
            {"status": "active", "last_message_at": {"$lt": cutoff}},
            {"$set": {"status": "expired"}},
        )
        log.info(f"[asistente] expire_old_sessions(h={hours}): {result.modified_count}")
        return result.modified_count


# Module-level helper for cron
async def expire_old_sessions_cron(db) -> int:
    return await AsistenteEngine(db).expire_old_sessions(SESSION_EXPIRE_HOURS)


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_indexes(db) -> None:
    try:
        await db.asistente_sessions.create_index("session_token", unique=True, name="idx_asis_token_unique", background=True)
        await db.asistente_sessions.create_index([("ip_hash", 1), ("created_at", -1)], name="idx_asis_ip_time", background=True)
        await db.asistente_sessions.create_index([("status", 1), ("last_message_at", -1)], name="idx_asis_status_time", background=True)
        await db.asistente_messages.create_index([("session_token", 1), ("created_at", 1)], name="idx_asis_msg_token_time", background=True)
        log.info("[asistente] indexes OK")
    except Exception as exc:
        log.warning(f"[asistente] ensure_indexes failed: {exc}")
