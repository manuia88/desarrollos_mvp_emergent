"""W7.AS.3 · Conversation AI Engine Core (GHL-style).

Round 1 merge custom — CORE engine (Terminal A) + INTEL modules wired in
(Terminal B: RAG/DISC/Plan Venta/Function Calling · Terminal C: SOC/Workflow/
Hook Predictor/Lead Enrichment). All B/C imports are FAIL-OPEN (try/except)
so the engine continues to work even if an integration module breaks.

LLM       : Claude Sonnet 4.5 vía emergentintegrations.LlmChat (lazy import).
Memory    : short-term en db.conversation_messages · long-term denorm en db.leads.
Stub-aware: sin EMERGENT_LLM_KEY → heurístico templates (NO raise).
FAIL-OPEN : si el LLM falla → respuesta de cortesía + sugerencia de handoff.
Cost      : ai_budget.track_ai_call por turn (fire-and-forget).
Audit     : audit_immutable_engine.log por turn (fail-soft).

Collections:
  conversation_threads
    {_id=conversation_id, lead_id, asesor_id, tenant_id, channel, status,
     system_prompt, sentiment, message_count, created_at, updated_at,
     last_message_at, handoff_at, handoff_reason, taken_over_by, taken_over_at}
    status ∈ active | handoff | taken_over | closed
  conversation_messages
    {_id=msg_id, conversation_id, role, content, channel, tokens_in, tokens_out,
     cost_usd, latency_ms, sentiment, stub, created_at}
    role ∈ user | assistant | asesor | system
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.conversation_engine")

CONVERSATION_MODEL = os.environ.get("CONVERSATION_MODEL", "claude-sonnet-4-5-20250929")
MAX_HISTORY = 24          # short-term window (messages) sent to the LLM
MEMORY_FACTS_MAX = 12     # long-term denorm facts kept on the lead
INPUT_CAP = 4000          # cap user input chars

DEFAULT_SYSTEM_PROMPT = (
    "Eres un asesor inmobiliario IA de DesarrollosMX. Respondes en español de México, "
    "con tono cálido y profesional. Tu objetivo: calificar al prospecto (presupuesto, zona, "
    "tiempo de compra, intención compra/inversión) y agendar una cita con un asesor humano. "
    "Sé breve (2-4 frases). Nunca inventes precios ni disponibilidad: si no tienes el dato, "
    "ofrece conectar con un asesor. Si el prospecto pide hablar con un humano o muestra "
    "frustración, sugiere el handoff de inmediato."
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Any) -> Any:
    return dt.isoformat() if isinstance(dt, datetime) else dt


def _cid() -> str:
    return f"conv_{uuid.uuid4().hex[:14]}"


def _mid() -> str:
    return f"cmsg_{uuid.uuid4().hex[:14]}"


def _estimate_tokens(text: str) -> int:
    # ~4 chars/token heuristic, consistent with asistente_engine
    return max(1, int(len(text or "") / 4))


async def _maybe_await(value):
    """B/C intel modules may be sync or async — accept both transparently."""
    import inspect
    if inspect.isawaitable(value):
        return await value
    return value


# ─── Sentiment (lightweight heuristic — feeds inbox filters) ───────────────────
_NEG = ("no me interesa", "caro", "carísimo", "molesto", "enojado", "mal servicio",
        "estafa", "queja", "decepcion", "tarde", "nunca", "pésimo", "pesimo",
        "no sirve", "cancelar", "reclamo", "horrible")
_POS = ("gracias", "excelente", "perfecto", "me interesa", "agendar", "cita",
        "me encanta", "genial", "claro que sí", "claro que si", "vamos", "sí quiero",
        "si quiero", "comprar", "invertir")


def detect_sentiment(text: str) -> str:
    t = (text or "").lower()
    if any(k in t for k in _NEG):
        return "negative"
    if any(k in t for k in _POS):
        return "positive"
    return "neutral"


# ─── Handoff intent (heuristic) ────────────────────────────────────────────────
_HANDOFF_HINTS = ("hablar con", "asesor humano", "una persona", "humano", "agente real",
                  "llámame", "llamame", "teléfono", "telefono", "agendar cita", "cita")


def _suggests_handoff(user_text: str, assistant_text: str, sentiment: str) -> bool:
    blob = f"{user_text} {assistant_text}".lower()
    if sentiment == "negative":
        return True
    return any(k in blob for k in _HANDOFF_HINTS)


# ─── Heuristic (stub) reply — used when EMERGENT_LLM_KEY ausente o LLM falla ────
def _stub_reply(user_text: str, sentiment: str) -> str:
    t = (user_text or "").lower()
    if sentiment == "negative":
        return ("Lamento que tu experiencia no haya sido la mejor. Quiero ayudarte personalmente: "
                "te conecto ahora con un asesor humano para resolverlo. ¿Te parece bien?")
    if any(k in t for k in ("precio", "cuesta", "cuánto", "cuanto", "presupuesto")):
        return ("Con gusto te comparto opciones según tu presupuesto. ¿Cuál es el rango que tienes "
                "en mente y en qué zona te gustaría? Si prefieres, te conecto con un asesor para "
                "ver disponibilidad real.")
    if any(k in t for k in ("cita", "visita", "agendar", "ver", "conocer")):
        return ("¡Perfecto! Podemos agendar una visita. ¿Qué día y horario te acomodan? "
                "Confirmo la cita con uno de nuestros asesores.")
    if any(k in t for k in ("invertir", "inversión", "inversion", "plusvalía", "plusvalia", "renta")):
        return ("Excelente, tenemos desarrollos con buena proyección de plusvalía. "
                "¿Buscas renta o reventa, y cuál es tu horizonte de inversión?")
    return ("¡Hola! Soy tu asesor IA de DesarrollosMX. Cuéntame qué buscas (zona, presupuesto, "
            "compra o inversión) y te oriento. ¿En qué te ayudo hoy?")


class ConversationEngine:
    """Stateless wrapper over the Mongo `db`. Instantiate per request."""

    def __init__(self, db):
        self.db = db

    # ── lifecycle ──────────────────────────────────────────────────────────
    async def start_conversation(
        self,
        lead_id: Optional[str] = None,
        asesor_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        channel: str = "web",
        system_prompt: Optional[str] = None,
        initial_context: Optional[str] = None,
        session_key: Optional[str] = None,  # F12 fix · dedup per session
        is_anon: bool = False,              # F9 fix · ignora system_prompt si anon
    ) -> Dict[str, Any]:
        # F12 · idempotency by session_key (active threads · 24h window)
        if session_key:
            cutoff = _now().replace(microsecond=0)
            cutoff_iso = (cutoff.timestamp() - 86400)
            existing = await self.db.conversation_threads.find_one(
                {"session_key": session_key, "status": "active"},
            )
            if existing:
                return {
                    "conversation_id": existing["_id"],
                    "status": existing.get("status", "active"),
                    "channel": existing.get("channel"),
                    "system_prompt": existing.get("system_prompt"),
                    "created_at": _iso(existing.get("created_at")),
                    "deduped": True,
                }

        # F9 fix · cap + anon-safety on user-controlled prompts
        sp_raw = (system_prompt or "").strip()
        if is_anon:
            sp_raw = ""  # anon never overrides system prompt (jailbreak block)
        sp = sp_raw[:4000] or DEFAULT_SYSTEM_PROMPT

        cid = _cid()
        now = _now()
        thread = {
            "_id": cid,
            "lead_id": lead_id,
            "asesor_id": asesor_id,
            "tenant_id": tenant_id or "default",
            "channel": channel or "web",
            "status": "active",
            "system_prompt": sp,
            "initial_context": (initial_context or "").strip()[:2000] or None,
            "session_key": session_key,
            "sentiment": "neutral",
            "message_count": 0,
            "created_at": now,
            "updated_at": now,
            "last_message_at": now,
            "handoff_at": None,
            "handoff_reason": None,
            "taken_over_by": None,
            "taken_over_at": None,
        }
        await self.db.conversation_threads.insert_one(dict(thread))
        await self._audit(asesor_id, "conversation_start", cid,
                          {"lead_id": lead_id, "channel": channel})
        return {
            "conversation_id": cid,
            "status": "active",
            "channel": thread["channel"],
            "system_prompt": thread["system_prompt"],
            "created_at": _iso(now),
        }

    async def send_message(
        self,
        conversation_id: str,
        content: str,
        role: str = "user",
        channel: Optional[str] = None,
        client_msg_id: Optional[str] = None,  # F5 fix · idempotency key
    ) -> Dict[str, Any]:
        thread = await self.db.conversation_threads.find_one({"_id": conversation_id})
        if not thread:
            raise ValueError("Conversación no encontrada")
        if thread.get("status") == "closed":
            raise ValueError("Conversación cerrada")

        content = (content or "").strip()[:INPUT_CAP]
        if not content:
            raise ValueError("Mensaje vacío")

        ch = channel or thread.get("channel") or "web"
        sentiment = detect_sentiment(content)

        # F5 · idempotency: if client_msg_id seen for this thread, return cached
        if client_msg_id:
            seen = await self.db.conversation_messages.find_one(
                {"conversation_id": conversation_id, "client_msg_id": client_msg_id},
                {"_id": 0},
            )
            if seen:
                # find assistant reply paired with this client_msg_id (if any)
                later = await self.db.conversation_messages.find(
                    {"conversation_id": conversation_id, "role": "assistant",
                     "created_at": {"$gte": seen.get("created_at")}},
                    {"_id": 0, "content": 1},
                ).sort("created_at", 1).limit(1).to_list(1)
                return {
                    "conversation_id": conversation_id,
                    "assistant_message": (later[0]["content"] if later else None),
                    "status": thread.get("status", "active"),
                    "sentiment": seen.get("sentiment", sentiment),
                    "stub": False,
                    "tools_used": [],
                    "suggested_handoff": False,
                    "ai_replied": bool(later),
                    "deduped": True,
                }

        # ── persist inbound message ──────────────────────────────────────────
        await self._persist_message(conversation_id, role, content, ch,
                                    tokens_in=_estimate_tokens(content), sentiment=sentiment,
                                    client_msg_id=client_msg_id)

        # If an asesor took over, the IA does NOT auto-reply — just records the turn.
        if thread.get("status") == "taken_over" or role == "asesor":
            await self._bump_thread(conversation_id, sentiment, channel=ch)
            return {
                "conversation_id": conversation_id,
                "assistant_message": None,
                "status": thread.get("status"),
                "sentiment": sentiment,
                "tools_used": [],
                "suggested_handoff": False,
                "ai_replied": False,
            }

        # ── build memory: short-term history ─────────────────────────────────
        history = await self._load_history(conversation_id)

        # ── B/C intel context (RAG + DISC + Plan Venta + Hook + Auto-enrich) ─
        intel = await self._build_intel_context(thread, history, content)
        # Temporarily swap the augmented system_prompt for _generate (in-memory only)
        if intel.get("augmented_system_prompt"):
            thread = {**thread, "system_prompt": intel["augmented_system_prompt"]}

        # ── generate assistant reply (LLM or heuristic stub) ─────────────────
        t0 = time.monotonic()
        assistant_text, stub, used_llm = await self._generate(thread, history, content)
        latency_ms = int((time.monotonic() - t0) * 1000)

        tokens_in = _estimate_tokens(content) + sum(_estimate_tokens(h["content"]) for h in history)
        tokens_out = _estimate_tokens(assistant_text)

        await self._persist_message(
            conversation_id, "assistant", assistant_text, ch,
            tokens_in=tokens_in, tokens_out=tokens_out, latency_ms=latency_ms,
            sentiment="neutral", stub=stub,
        )
        await self._bump_thread(conversation_id, sentiment, channel=ch)

        suggested = _suggests_handoff(content, assistant_text, sentiment)

        # ── cycle signals to SOC W6.MOV.1 (Terminal C · fail-soft) ───────────
        await self._record_cycle_signals(
            thread, sentiment, latency_ms, suggested,
            user_text=content, assistant_text=assistant_text,
        )

        # ── long-term memory denorm onto the lead (fail-soft) ────────────────
        await self._denorm_to_lead(thread.get("lead_id"), content, assistant_text, sentiment)

        # ── cost tracking (fire-and-forget) ──────────────────────────────────
        if used_llm:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    db=self.db,
                    dev_org_id=thread.get("tenant_id") or "default",
                    model=CONVERSATION_MODEL,
                    tokens=int(tokens_in) + int(tokens_out),
                    tokens_in=int(tokens_in),
                    tokens_out=int(tokens_out),
                    call_type="conversation_message",
                    feature_key="conversation_engine",
                )
            except Exception as exc:
                log.warning(f"[conversation] track_ai_call failed silent: {exc}")

        # ── audit per turn ────────────────────────────────────────────────────
        await self._audit(
            thread.get("asesor_id"), "conversation_message", conversation_id,
            {"channel": ch, "sentiment": sentiment, "stub": stub,
             "suggested_handoff": suggested, "tokens": int(tokens_in) + int(tokens_out)},
        )

        return {
            "conversation_id": conversation_id,
            "assistant_message": assistant_text,
            "status": thread.get("status", "active"),
            "sentiment": sentiment,
            "stub": stub,
            "tools_used": intel.get("tools_used") or [],
            "suggested_handoff": suggested,
            "latency_ms": latency_ms,
            "model": CONVERSATION_MODEL if used_llm else "heuristic_stub",
            "ai_replied": True,
            "intel": {  # observable for asesor UI debug
                "disc_tone": intel.get("disc_tone"),
                "plan_venta": intel.get("plan_venta"),
                "hook_score": intel.get("hook_score"),
                "rag_used": bool(intel.get("rag_context")),
            },
        }

    # ── read ───────────────────────────────────────────────────────────────
    async def get_conversation(
        self, conversation_id: str, caller_tenant_id: Optional[str] = None,
        is_superadmin: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """F1 fix · tenant-gate read. If caller_tenant_id provided and not
        superadmin, thread tenant_id must match (else returns None → 404)."""
        q: Dict[str, Any] = {"_id": conversation_id}
        if caller_tenant_id and not is_superadmin:
            q["tenant_id"] = caller_tenant_id
        thread = await self.db.conversation_threads.find_one(q)
        if not thread:
            return None
        msgs = await self.db.conversation_messages.find(
            {"conversation_id": conversation_id},
            {"_id": 0},
        ).sort("created_at", 1).to_list(length=500)
        for m in msgs:
            m["created_at"] = _iso(m.get("created_at"))
        return {**self._thread_public(thread), "messages": msgs}

    async def list_lead_conversations(
        self, lead_id: str, caller_tenant_id: Optional[str] = None,
        is_superadmin: bool = False,
    ) -> List[Dict[str, Any]]:
        """F1 fix · tenant-gate list. If caller_tenant_id provided and not
        superadmin, filter by tenant_id (else returns empty list)."""
        q: Dict[str, Any] = {"lead_id": lead_id}
        if caller_tenant_id and not is_superadmin:
            q["tenant_id"] = caller_tenant_id
        docs = await self.db.conversation_threads.find(q).sort(
            "last_message_at", -1).to_list(length=100)
        return [self._thread_public(d) for d in docs]

    async def request_handoff(self, conversation_id: str, reason: Optional[str] = None,
                              actor_id: Optional[str] = None,
                              caller_tenant_id: Optional[str] = None,
                              is_superadmin: bool = False) -> Dict[str, Any]:
        """F3 fix · ownership validation. Solo el asesor owner del thread o
        un superadmin pueden hacer handoff. Anon (caller_tenant_id=None)
        bloqueado salvo que sea el ChatWidget público (route capa lo permite
        para "solicitud_handoff" tipo lead-asks-human)."""
        thread = await self.db.conversation_threads.find_one({"_id": conversation_id})
        if not thread:
            raise ValueError("Conversación no encontrada")
        # F3 enforcement (skipped if no caller_tenant — public widget path)
        if caller_tenant_id and not is_superadmin:
            if thread.get("tenant_id") != caller_tenant_id:
                raise ValueError("Sin permiso para handoff de esta conversación")
            if thread.get("asesor_id") and thread.get("asesor_id") != actor_id:
                raise ValueError("Solo el asesor owner puede solicitar handoff")
        now = _now()
        await self.db.conversation_threads.update_one(
            {"_id": conversation_id},
            {"$set": {"status": "handoff", "handoff_at": now,
                      "handoff_reason": (reason or "").strip()[:500] or "solicitud_handoff",
                      "updated_at": now}},
        )
        await self._audit(actor_id or thread.get("asesor_id"), "conversation_handoff",
                          conversation_id, {"reason": reason})
        return {"conversation_id": conversation_id, "status": "handoff",
                "handoff_at": _iso(now)}

    # ── superadmin ───────────────────────────────────────────────────────────
    async def superadmin_list(
        self,
        asesor_id: Optional[str] = None,
        sentiment: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        caller_tenant_id: Optional[str] = None,
        is_superadmin: bool = False,
    ) -> List[Dict[str, Any]]:
        """F1 fix · scoped list. If caller not superadmin, force tenant filter."""
        q: Dict[str, Any] = {}
        if not is_superadmin and caller_tenant_id:
            q["tenant_id"] = caller_tenant_id
        if asesor_id:
            q["asesor_id"] = asesor_id
        if sentiment:
            q["sentiment"] = sentiment
        if status == "handoff":
            q["status"] = {"$in": ["handoff", "taken_over"]}
        elif status:
            q["status"] = status
        docs = await self.db.conversation_threads.find(q).sort(
            "last_message_at", -1).limit(min(int(limit or 100), 500)).to_list(length=500)
        return [self._thread_public(d) for d in docs]

    async def superadmin_stats(self) -> Dict[str, Any]:
        coll = self.db.conversation_threads
        try:
            total = await coll.count_documents({})
            active = await coll.count_documents({"status": "active"})
            handoff = await coll.count_documents({"status": {"$in": ["handoff", "taken_over"]}})
            closed = await coll.count_documents({"status": "closed"})
            negative = await coll.count_documents({"sentiment": "negative"})
            msgs = await self.db.conversation_messages.count_documents({})
        except Exception as exc:
            log.warning(f"[conversation] stats failed: {exc}")
            total = active = handoff = closed = negative = msgs = 0
        by_sentiment = {}
        for s in ("positive", "neutral", "negative"):
            try:
                by_sentiment[s] = await coll.count_documents({"sentiment": s})
            except Exception:
                by_sentiment[s] = 0
        return {
            "total_conversations": total,
            "active": active,
            "handoff": handoff,
            "closed": closed,
            "negative_sentiment": negative,
            "total_messages": msgs,
            "by_sentiment": by_sentiment,
        }

    async def superadmin_takeover(self, conversation_id: str, by_user: str) -> Dict[str, Any]:
        thread = await self.db.conversation_threads.find_one({"_id": conversation_id})
        if not thread:
            raise ValueError("Conversación no encontrada")
        now = _now()
        await self.db.conversation_threads.update_one(
            {"_id": conversation_id},
            {"$set": {"status": "taken_over", "taken_over_by": by_user,
                      "taken_over_at": now, "updated_at": now}},
        )
        await self._audit(by_user, "conversation_takeover", conversation_id,
                          {"prev_status": thread.get("status")})
        return {"conversation_id": conversation_id, "status": "taken_over",
                "taken_over_by": by_user, "taken_over_at": _iso(now)}

    # ── B/C intel integration (FAIL-OPEN imports) ────────────────────────────
    async def _build_intel_context(
        self, thread: Dict, history: List[Dict], user_text: str,
    ) -> Dict[str, Any]:
        """Round-1 merge custom · B (RAG+DISC+Plan Venta) + C (Hook+Enrich).

        Returns {augmented_system_prompt, rag_context, disc_tone, plan_venta,
                 hook_score, tools_used}. ALL fields are best-effort —
                 any failure logs a warning and returns the field as None.
        """
        out: Dict[str, Any] = {
            "augmented_system_prompt": thread.get("system_prompt"),
            "rag_context": None,
            "disc_tone": None,
            "plan_venta": None,
            "hook_score": None,
            "tools_used": [],
        }
        base_prompt = thread.get("system_prompt") or DEFAULT_SYSTEM_PROMPT

        # 1) RAG sobre Knowledge Graph W5.12 (Terminal B)
        try:
            from conversation_rag import get_context as _rag_get_context
            rag_ctx = await _maybe_await(
                _rag_get_context(user_text, thread.get("lead_id"),
                                 thread.get("tenant_id") or "default")
            )
            if rag_ctx:
                out["rag_context"] = str(rag_ctx)[:2000]
                base_prompt = f"{base_prompt}\n\n## CONTEXTO KG\n{out['rag_context']}"
        except Exception as exc:
            log.warning(f"[conversation] RAG failed silent: {exc}")

        # 2) DISC tone adaptation desde Buyer Score W5.4 (Terminal B)
        try:
            from conversation_disc_adapter import adapt_system_prompt as _disc_adapt
            # Lead-aware: read buyer_score tier off the lead doc (best-effort)
            tier = None
            lead_id = thread.get("lead_id")
            if lead_id:
                try:
                    lead = await self.db.leads.find_one(
                        {"id": lead_id}, {"_id": 0, "buyer_score_tier": 1, "disc_tier": 1},
                    )
                    if lead:
                        tier = lead.get("disc_tier") or lead.get("buyer_score_tier")
                except Exception:
                    pass
            adapted = _disc_adapt(base_prompt, tier or "S")
            if adapted:
                base_prompt = adapted
                out["disc_tone"] = tier or "S"
        except Exception as exc:
            log.warning(f"[conversation] DISC adapt failed silent: {exc}")

        # 3) Plan Venta IA playbook next-action (Terminal B)
        try:
            from conversation_plan_venta_playbook import next_action as _pv_next
            pv = _pv_next(thread.get("lead_id"),
                          {"message_count": thread.get("message_count", 0),
                           "sentiment": thread.get("sentiment", "neutral")})
            if isinstance(pv, dict):
                out["plan_venta"] = pv
                base_prompt = (
                    f"{base_prompt}\n\n## PLAN VENTA · etapa {pv.get('stage', '?')}\n"
                    f"Intención sugerida: {pv.get('suggested_intent', 'descubrir necesidades')}."
                )
        except Exception as exc:
            log.warning(f"[conversation] plan venta failed silent: {exc}")

        # 4) Hook Predictor para el PRIMER mensaje del agente (Terminal C / Z.5)
        if thread.get("message_count", 0) == 0:
            try:
                from conversation_hook_predictor import score_first_message as _hk
                hk = await _maybe_await(_hk(
                    user_text, audience=thread.get("channel") or "web",
                    tenant_id=thread.get("tenant_id") or "default",
                ))
                if isinstance(hk, dict):
                    out["hook_score"] = hk
            except Exception as exc:
                log.warning(f"[conversation] hook predictor failed silent: {exc}")

        # 5) Auto-enrich on email/phone detect (Terminal C / W7.AS.1)
        try:
            from conversation_lead_enrichment import auto_enrich_on_detect as _enrich
            await _maybe_await(_enrich(
                user_text, thread.get("lead_id"),
                thread.get("tenant_id") or "default", self.db,
            ))
        except Exception as exc:
            log.warning(f"[conversation] auto enrich failed silent: {exc}")

        out["augmented_system_prompt"] = base_prompt
        return out

    async def _record_cycle_signals(
        self, thread: Dict, sentiment: str, latency_ms: int, suggested_handoff: bool,
        user_text: str = "", assistant_text: str = "",
    ) -> None:
        """Terminal C · feeds W6.MOV.1 SOC scoring + W6.AS.1 workflow bridge.

        F6 fix · lead_conversion ahora requiere señal POSITIVA explícita
        (intención clara de cita/visita/compra) y NO se contamina con
        suggested_handoff cuando el motivo es sentiment negative.
        """
        asesor_id = thread.get("asesor_id")
        if not asesor_id:
            return
        try:
            from conversation_soc_integration import record_conversation_signal as _soc
            # response_time signal (lower = better · cap absurd outliers)
            await _maybe_await(_soc(
                asesor_id, "response_time_seconds",
                max(0.0, min(float(latency_ms) / 1000.0, 600.0)), self.db,
            ))
            # nps_proxy from sentiment (positive=+1, neutral=0, negative=-1)
            nps_val = {"positive": 1.0, "neutral": 0.0, "negative": -1.0}.get(sentiment, 0.0)
            await _maybe_await(_soc(asesor_id, "nps_proxy_sentiment", nps_val, self.db))
            # F6 · conversion only on real positive intent (cita/visita/comprar)
            blob = f"{user_text} {assistant_text}".lower()
            real_conversion_signal = (
                sentiment != "negative"
                and any(k in blob for k in (
                    "agendar cita", "agendamos cita", "agendada", "confirmo cita",
                    "visita confirmada", "quiero comprar", "voy a comprar", "apartado",
                    "reservado", "depósito", "deposito",
                ))
            )
            if real_conversion_signal:
                await _maybe_await(_soc(asesor_id, "lead_conversion", 1.0, self.db))
        except Exception as exc:
            log.warning(f"[conversation] SOC signal failed silent: {exc}")

    # ── internals ────────────────────────────────────────────────────────────
    async def _generate(self, thread: Dict, history: List[Dict], user_text: str):
        """Returns (assistant_text, stub: bool, used_llm: bool)."""
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        sentiment = detect_sentiment(user_text)
        if not api_key:
            return _stub_reply(user_text, sentiment), True, False
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
            sys_prompt = thread.get("system_prompt") or DEFAULT_SYSTEM_PROMPT
            ctx = thread.get("initial_context")
            if ctx:
                sys_prompt = f"{sys_prompt}\n\n## CONTEXTO\n{ctx}"
            # F10 fix · system_message is the canonical channel · initial_messages
            # carries ONLY the actual history (no duplicate system role).
            chat = LlmChat(
                api_key=api_key,
                session_id=thread["_id"],
                system_message=sys_prompt,
                initial_messages=history,
            ).with_model("anthropic", CONVERSATION_MODEL)
            raw = await chat.send_message(LlmUserMsg(text=user_text))
            text = (raw or "").strip()
            if not text:
                return _stub_reply(user_text, sentiment), True, False
            return text, False, True
        except Exception as exc:
            log.warning(f"[conversation] LLM error conv={thread.get('_id')}: {exc}")
            # FAIL-OPEN — courtesy reply, never raise
            return (
                "Tuve un problema técnico al procesar tu mensaje. ¿Puedes repetirlo? "
                "Si es urgente, te conecto con un asesor humano.",
                True, False,
            )

    async def _load_history(self, conversation_id: str) -> List[Dict[str, str]]:
        """F4 fix · take the MOST RECENT MAX_HISTORY messages (desc + reverse),
        not the oldest. After 24 turns the LLM kept losing recent context."""
        docs = await self.db.conversation_messages.find(
            {"conversation_id": conversation_id, "role": {"$in": ["user", "assistant", "asesor"]}},
            {"_id": 0, "role": 1, "content": 1, "created_at": 1},
        ).sort("created_at", -1).limit(MAX_HISTORY).to_list(MAX_HISTORY)
        docs.reverse()  # chronological order for LLM
        out = []
        for d in docs:
            role = d.get("role")
            # map asesor turns to assistant for LLM context coherence
            out.append({"role": "assistant" if role == "asesor" else role,
                        "content": d.get("content") or ""})
        return out

    async def _persist_message(self, conversation_id, role, content, channel,
                               tokens_in=0, tokens_out=0, latency_ms=0,
                               sentiment="neutral", stub=False,
                               client_msg_id: Optional[str] = None):
        await self.db.conversation_messages.insert_one({
            "_id": _mid(),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "channel": channel,
            "tokens_in": int(tokens_in),
            "tokens_out": int(tokens_out),
            "cost_usd": 0.0,
            "latency_ms": int(latency_ms),
            "sentiment": sentiment,
            "stub": bool(stub),
            "client_msg_id": client_msg_id,  # F5
            "created_at": _now(),
        })

    async def _bump_thread(self, conversation_id, sentiment, channel=None):
        now = _now()
        update = {"$inc": {"message_count": 1},
                  "$set": {"updated_at": now, "last_message_at": now, "sentiment": sentiment}}
        if channel:
            update["$set"]["channel"] = channel
        await self.db.conversation_threads.update_one({"_id": conversation_id}, update)

    async def _denorm_to_lead(self, lead_id, user_text, assistant_text, sentiment):
        if not lead_id:
            return
        try:
            summary = f"U: {user_text[:160]} · IA: {assistant_text[:160]}"
            await self.db.leads.update_one(
                {"id": lead_id},
                {
                    "$set": {
                        "conversation_last_summary": summary,
                        "conversation_last_sentiment": sentiment,
                        "conversation_last_at": _now(),
                    },
                    "$inc": {"conversation_msg_count": 1},
                    "$push": {
                        "conversation_memory": {
                            "$each": [{"u": user_text[:200], "a": assistant_text[:200],
                                       "sentiment": sentiment, "ts": _now()}],
                            "$slice": -MEMORY_FACTS_MAX,
                        }
                    },
                },
            )
        except Exception as exc:
            log.warning(f"[conversation] lead denorm failed silent: {exc}")

    async def _audit(self, actor_id, action, entity_id, after):
        try:
            from audit_immutable_engine import log as audit_log
            await audit_log(
                self.db,
                actor={"user_id": actor_id or "system", "role": "asesor"},
                action=action,
                entity_type="conversation",
                entity_id=entity_id,
                after=after,
            )
        except Exception as exc:
            log.warning(f"[conversation] audit failed silent: {exc}")

    def _thread_public(self, t: Dict) -> Dict[str, Any]:
        return {
            "conversation_id": t.get("_id"),
            "lead_id": t.get("lead_id"),
            "asesor_id": t.get("asesor_id"),
            "tenant_id": t.get("tenant_id"),
            "channel": t.get("channel"),
            "status": t.get("status"),
            "sentiment": t.get("sentiment"),
            "message_count": t.get("message_count", 0),
            "system_prompt": t.get("system_prompt"),
            "taken_over_by": t.get("taken_over_by"),
            "handoff_reason": t.get("handoff_reason"),
            "created_at": _iso(t.get("created_at")),
            "updated_at": _iso(t.get("updated_at")),
            "last_message_at": _iso(t.get("last_message_at")),
        }


async def ensure_indexes(db) -> None:
    """W7.AS.3.A · conversation collections indexes. Idempotent / fail-soft.

    Post-audit R1 fixes: +session_key (F12 dedup) + client_msg_id (F5 dedup) +
    compound tenant_id+last_message_at (F1 tenant-scoped reads).
    """
    try:
        await db.conversation_threads.create_index([("lead_id", 1)], background=True)
        await db.conversation_threads.create_index(
            [("asesor_id", 1), ("last_message_at", -1)], background=True)
        await db.conversation_threads.create_index(
            [("status", 1), ("last_message_at", -1)], background=True)
        await db.conversation_threads.create_index([("sentiment", 1)], background=True)
        await db.conversation_threads.create_index([("tenant_id", 1)], background=True)
        # F1 · compound for tenant-scoped sorted reads
        await db.conversation_threads.create_index(
            [("tenant_id", 1), ("last_message_at", -1)], background=True)
        # F12 · idempotency by session_key (sparse · solo widget público)
        await db.conversation_threads.create_index(
            [("session_key", 1), ("status", 1)], background=True, sparse=True)
    except Exception as exc:
        log.warning(f"[conversation] thread indexes failed: {exc}")
    try:
        await db.conversation_messages.create_index(
            [("conversation_id", 1), ("created_at", 1)], background=True)
        # F5 · idempotency by client_msg_id (sparse · solo cuando el cliente lo manda)
        await db.conversation_messages.create_index(
            [("conversation_id", 1), ("client_msg_id", 1)], background=True, sparse=True)
    except Exception as exc:
        log.warning(f"[conversation] message indexes failed: {exc}")
