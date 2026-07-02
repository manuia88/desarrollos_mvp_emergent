"""W4.6 Y.3C — Reply Classifier · Resend Inbound Webhooks.

Clasifica respuestas de email entrantes (lead nurture, visit confirmations,
asesor follow-ups) en una de 6 categorías:
  interested · objection · soft_silence · question · unsubscribe · spam

3-layer resilience:
  Layer 1 (LLM):       Claude Sonnet 4.5 prompt zero-shot
  Layer 2 (cached):    classifications recientes <30d con bodies similares (SequenceMatcher >0.85)
  Layer 3 (heuristic): keyword-based reglas defensivas

Después de clasificar, dispara `next_best_action`:
  notify_asesor · escalate_manager · add_watchlist · advance_funnel_stage · mark_spam

Phase Y guards:
  master_switch + tier `reply_classifier` ≥ T1
  simulation_mode → solo layer 3 + NO dispatch_action real
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

log = logging.getLogger("dmx.agentic_crm.reply_classifier")

CLASSIFIER_MODEL  = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK  = 3.0 / 1_000_000
PRICE_OUT_PER_TOK = 15.0 / 1_000_000

REPLY_TTL_DAYS    = 180
MIN_CAP_PER_MIN   = 100  # 100 classifications/min/org
SIMILARITY_THRESHOLD = 0.85

CATEGORIES = {"interested", "objection", "soft_silence", "question", "unsubscribe", "spam"}
URGENCIES  = {"high", "medium", "low"}
ACTIONS    = {"notify_asesor", "escalate_manager", "add_watchlist",
              "advance_funnel_stage", "mark_spam"}

_org_min_buckets:  Dict[str, List[float]] = {}
_circuit_breakers: Dict[str, CircuitBreaker] = {}


# ─── Errors ───────────────────────────────────────────────────────────────────
class ReplyClassifierDisabledError(Exception):
    """Phase Y master switch off o tier='off'."""


class ReplyClassifierRateLimitError(Exception):
    """Cap excedido."""


class ReplyClassifierNotFoundError(Exception):
    """Reply doc no encontrado."""


class ReplyClassifierForbiddenError(Exception):
    """Cross-org acceso denegado."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"reply_classifier_{org_id}"
    if key not in _circuit_breakers:
        _circuit_breakers[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
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


def _normalize_body(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())[:2000]


def _strip_quoted(body: str) -> str:
    """Quita líneas citadas (>) y firmas obvias para reducir context al LLM."""
    if not body:
        return ""
    lines = []
    for ln in body.splitlines():
        s = ln.strip()
        if s.startswith(">") or s.startswith("On ") or s.startswith("El "):
            break
        if s.startswith("--") or s.startswith("__"):
            break
        lines.append(ln)
    return "\n".join(lines).strip()[:3000]


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(org_id: str, reply_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit reply_classifier abierto · org={org_id}")

    body = _strip_quoted(reply_doc.get("body_text") or reply_doc.get("body_html") or "")
    if not body:
        return None

    from llm_client import LlmChat, UserMessage as LlmUserMsg

    system_prompt = """Eres clasificador AI de respuestas de email de compradores inmobiliarios CDMX.
Categoriza cada reply en UNA categoría y produce next_best_action.

CATEGORÍAS:
- interested: muestra interés concreto (agendar visita, pide más info, expresa entusiasmo)
- objection: muestra objeción (precio alto, ubicación, tiempos, financiamiento)
- soft_silence: respuesta tibia/cortés/postergamiento ("ahorita no", "después", "lo voy a pensar")
- question: pregunta específica que requiere respuesta del asesor antes de decidir
- unsubscribe: pide remover/no contactar/unsubscribe
- spam: contenido irrelevante, automático, fuera de contexto inmobiliario

URGENCY:
- high: menciona presupuesto+timing+visita / pide agendar / agresivamente interesado
- medium: pregunta específica que bloquea avance / objeción legítima
- low: silencio blando, sin acción inmediata necesaria

NEXT_BEST_ACTION:
- interested → notify_asesor (urgente, asesor responde rápido)
- objection → notify_asesor + add_watchlist
- question → notify_asesor (rápido)
- soft_silence → add_watchlist
- unsubscribe → mark_spam (status archived)
- spam → mark_spam

OUTPUT: SOLO un JSON único:
{
  "category": "interested|objection|soft_silence|question|unsubscribe|spam",
  "confidence_score": 0-100 entero,
  "urgency": "high|medium|low",
  "key_phrases": ["frase 1", "...", "..."],
  "recommended_action_text": "1 oración accionable en es-MX para el asesor",
  "next_best_action_type": "notify_asesor|escalate_manager|add_watchlist|advance_funnel_stage|mark_spam"
}"""

    user_msg = (
        f"From: {reply_doc.get('from_email', '—')}\n"
        f"Subject: {reply_doc.get('subject', '—')}\n\n"
        f"Body:\n{body}\n\n"
        "Clasifica y retorna el JSON."
    )

    session_id = f"rc_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id, system_message=system_prompt,
    ).with_model("anthropic", CLASSIFIER_MODEL)

    tok_in = _estimate_tokens(system_prompt) + _estimate_tokens(user_msg)
    try:
        raw_resp = await cb.call(chat.send_message, LlmUserMsg(text=user_msg))
    except CircuitOpenError:
        raise
    raw_resp = raw_resp or ""
    tok_out = _estimate_tokens(raw_resp)

    json_match = re.search(r"\{.*\}", raw_resp, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return None

    cat = (parsed.get("category") or "").strip().lower()
    if cat not in CATEGORIES:
        return None
    urg = (parsed.get("urgency") or "medium").strip().lower()
    if urg not in URGENCIES:
        urg = "medium"
    nba = (parsed.get("next_best_action_type") or "notify_asesor").strip().lower()
    if nba not in ACTIONS:
        nba = "notify_asesor"

    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {
        "classification": {
            "category": cat,
            "confidence_score": int(parsed.get("confidence_score") or 70),
            "urgency": urg,
            "key_phrases": (parsed.get("key_phrases") or [])[:5],
            "recommended_action_text": (parsed.get("recommended_action_text") or "")[:280],
            "next_best_action_type": nba,
        },
        "tokens_in": tok_in, "tokens_out": tok_out, "cost_usd": round(cost, 8),
    }


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
async def _layer_cached(db, org_id: str, reply_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    body_norm = _normalize_body(reply_doc.get("body_text") or "")
    if not body_norm or len(body_norm) < 8:
        return None
    since = _now() - timedelta(days=30)
    cur = db.email_replies.find(
        {"org_id": org_id, "received_at": {"$gte": since},
         "classification.category": {"$exists": True}},
        {"_id": 0, "body_text": 1, "classification": 1},
    ).limit(60)
    best = None
    best_score = 0.0
    async for doc in cur:
        candidate = _normalize_body(doc.get("body_text") or "")
        if not candidate:
            continue
        score = SequenceMatcher(None, body_norm, candidate).ratio()
        if score > best_score:
            best_score = score
            best = doc
    if not best or best_score < SIMILARITY_THRESHOLD:
        return None
    cls = dict(best.get("classification") or {})
    # Penaliza ligeramente la confianza por ser cacheado
    cls["confidence_score"] = max(50, int((cls.get("confidence_score") or 70) * 0.85))
    cls["recommended_action_text"] = (
        f"[Cacheado · similitud {best_score:.2f}] " + (cls.get("recommended_action_text") or "")
    )[:280]
    return {"classification": cls, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: heuristic ───────────────────────────────────────────────────────
_INTERESTED_RX = re.compile(
    r"\b(interesad[oa]|agend(?:ar|emos)?|visita|cita|cu[aá]ndo puedo|sabad|domingo|me gusta|pap[ae]les|comprar)\b",
    re.IGNORECASE,
)
_OBJECTION_RX = re.compile(
    r"\b(muy caro|fuera de presupuesto|caro|alto|bajar|negociar|descuento|no me alcanza|presupuesto)\b",
    re.IGNORECASE,
)
_UNSUBSCRIBE_RX = re.compile(
    r"\b(unsubscribe|remove|no me contacten|deja de|borrar|baja|elimin(?:ar|en)|stop)\b",
    re.IGNORECASE,
)
_QUESTION_RX = re.compile(r"\?")
_SPAM_RX = re.compile(
    r"\b(viagra|casino|crypto|bitcoin investment|free money|click here|win now)\b",
    re.IGNORECASE,
)


async def _layer_heuristic(_db, _org_id: str, reply_doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    body = (reply_doc.get("body_text") or reply_doc.get("body_html") or "").strip()
    if not body:
        body = reply_doc.get("subject") or ""
    body_low = body.lower()

    category = "soft_silence"
    confidence = 50
    urgency = "low"
    key_phrases: List[str] = []
    nba = "add_watchlist"
    rec_text = "Reply tibio · agregar a watchlist y reintentar en 7 días."

    if _SPAM_RX.search(body_low):
        category = "spam"; confidence = 80; urgency = "low"; nba = "mark_spam"
        rec_text = "Spam detectado por keywords. Archivar."
    elif _UNSUBSCRIBE_RX.search(body_low):
        category = "unsubscribe"; confidence = 85; urgency = "low"; nba = "mark_spam"
        rec_text = "Unsubscribe explícito. Detener nurture y archivar."
    elif _INTERESTED_RX.search(body_low):
        category = "interested"; confidence = 75; urgency = "high"; nba = "notify_asesor"
        rec_text = "Lead muestra interés concreto. Asesor debe contactar en <2h."
    elif _OBJECTION_RX.search(body_low):
        category = "objection"; confidence = 70; urgency = "medium"; nba = "notify_asesor"
        rec_text = "Objeción de precio/presupuesto. Preparar argumentario y propuesta alternativa."
    elif _QUESTION_RX.search(body):
        category = "question"; confidence = 65; urgency = "medium"; nba = "notify_asesor"
        rec_text = "Pregunta específica del comprador. Asesor responde directo."

    # Extract some key phrases (top 3 words >5 chars excluding common stopwords)
    stop = {"para", "este", "esta", "como", "sobre", "donde", "cuando", "porque",
            "tambien", "pero", "muy", "todo", "nada", "yes", "thank", "thanks"}
    words = re.findall(r"[a-záéíóúñ]{5,}", body_low)
    seen = []
    for w in words:
        if w not in stop and w not in seen:
            seen.append(w)
        if len(seen) >= 3:
            break
    key_phrases = seen

    return {
        "classification": {
            "category": category,
            "confidence_score": confidence,
            "urgency": urgency,
            "key_phrases": key_phrases,
            "recommended_action_text": rec_text,
            "next_best_action_type": nba,
        },
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
    }


# ─── Wrapper módulo-level (Tanda 3 · P0.10) ──────────────────────────────────
async def classify_reply(db, reply_text: str, from_address: str = None,
                         org_id: str = None, channel: str = "email", **_kw):
    """Clasifica un texto de respuesta entrante (WhatsApp/email) SIN requerir reply_id.
    whatsapp_engine importaba esta función módulo-level pero solo existía el método de clase
    `ReplyClassifierEngine.classify_reply(reply_id)` (firma distinta) → ImportError tragado →
    las respuestas de WhatsApp NUNCA se clasificaban. Best-effort, determinista (cacheada →
    heurística, sin LLM ni gating Phase-Y); devuelve la clasificación o None. FAIL-OPEN."""
    reply_doc = {"body_text": reply_text or "", "from_email": from_address,
                 "org_id": org_id, "channel": channel}
    out = None
    try:
        out = await _layer_cached(db, org_id or "", reply_doc)
    except Exception as e:
        log.warning(f"[reply_classifier] classify_reply cached fail-open: {e}")
    if not out:
        try:
            out = await _layer_heuristic(db, org_id or "", reply_doc)
        except Exception as e:
            log.warning(f"[reply_classifier] classify_reply heuristic fail-open: {e}")
    if not out:
        return None
    return {"classification": out, "channel": channel, "from_address": from_address}


# ─── Engine ───────────────────────────────────────────────────────────────────
class ReplyClassifierEngine:
    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise ReplyClassifierDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("reply_classifier", "off")
        if tier == "off":
            raise ReplyClassifierDisabledError("Reply Classifier requiere tier T1 o superior")
        sim = sim_override or settings.get("simulation_mode", False)
        return tier, sim

    async def classify_reply(self, reply_id: str, simulation_override: bool = False
                             ) -> Dict[str, Any]:
        _tier, sim_mode = await self._validate_phase_y(simulation_override)

        if not _check_concurrency(self.org_id):
            raise ReplyClassifierRateLimitError(
                "Cap 100/min/org excedido. Intenta en 60 seg."
            )
        _record_run(self.org_id)

        reply = await self.db.email_replies.find_one({"_id": reply_id})
        if not reply:
            raise ReplyClassifierNotFoundError(f"Reply {reply_id} no encontrado")
        if reply.get("org_id") and reply["org_id"] != self.org_id:
            raise ReplyClassifierForbiddenError("Reply pertenece a otra org")

        t0 = time.monotonic()

        # Pipeline manual (simpler than FallbackChain — we want layer error info)
        out: Optional[Dict[str, Any]] = None
        layer_used = "none"
        if not sim_mode:
            try:
                out = await _layer_llm(self.org_id, reply)
                if out:
                    layer_used = "llm"
            except Exception as e:  # noqa: BLE001
                log.warning(f"[reply_classifier] layer_llm failed: {e}")
            if not out:
                try:
                    out = await _layer_cached(self.db, self.org_id, reply)
                    if out:
                        layer_used = "cached"
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[reply_classifier] layer_cached failed: {e}")
        if not out:
            out = await _layer_heuristic(self.db, self.org_id, reply)
            layer_used = "heuristic"

        latency_ms = int((time.monotonic() - t0) * 1000)
        cls = out.get("classification") or {}

        now = _now()
        update = {
            "classification": cls,
            "layer_used": layer_used,
            "tokens_in": out.get("tokens_in", 0),
            "tokens_out": out.get("tokens_out", 0),
            "cost_usd": out.get("cost_usd", 0.0),
            "latency_ms": latency_ms,
            "classified_at": now,
            "data_quality": "simulated" if sim_mode else (
                "high" if layer_used == "llm" else "medium" if layer_used == "cached" else "basic"
            ),
        }
        await self.db.email_replies.update_one({"_id": reply_id}, {"$set": update})

        # AI cost tracking
        if layer_used == "llm" and out.get("cost_usd", 0) > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    self.db, self.org_id, CLASSIFIER_MODEL,
                    out.get("tokens_in", 0) + out.get("tokens_out", 0),
                    call_type="reply_classifier", feature_key="reply_classifier",
                )
            except Exception:
                pass

        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "reply_classifier.classified",
                "org_id": self.org_id, "reply_id": reply_id,
                "lead_id": reply.get("lead_id"),
                "category": cls.get("category"),
                "urgency": cls.get("urgency"),
                "layer_used": layer_used,
                "simulation": sim_mode,
                "created_at": now,
            })
        except Exception:
            pass

        # Fetch updated doc
        updated = await self.db.email_replies.find_one({"_id": reply_id}) or {}
        result = self._serialize(updated)

        # Dispatch action (skip in simulation mode)
        if not sim_mode and cls.get("next_best_action_type"):
            try:
                disp = await self.dispatch_action(reply_id)
                result["dispatch"] = disp
            except Exception as e:  # noqa: BLE001
                log.warning(f"[reply_classifier] dispatch failed: {e}")
                result["dispatch"] = {"ok": False, "error": str(e)}
        else:
            result["dispatch"] = {"ok": False, "skipped": "simulation_mode" if sim_mode else "no_action"}

        return result

    async def dispatch_action(self, reply_id: str) -> Dict[str, Any]:
        reply = await self.db.email_replies.find_one({"_id": reply_id})
        if not reply:
            raise ReplyClassifierNotFoundError(f"Reply {reply_id} no encontrado")
        if reply.get("org_id") != self.org_id:
            raise ReplyClassifierForbiddenError("Cross-org acceso denegado")

        cls = reply.get("classification") or {}
        action = cls.get("next_best_action_type") or "notify_asesor"
        result: Dict[str, Any] = {"ok": True, "action": action, "details": {}}
        now = _now()

        try:
            if action == "notify_asesor":
                result["details"] = await self._action_notify_asesor(reply)
            elif action == "escalate_manager":
                result["details"] = await self._action_escalate_manager(reply)
            elif action == "add_watchlist":
                result["details"] = await self._action_add_watchlist(reply)
            elif action == "advance_funnel_stage":
                result["details"] = await self._action_advance_funnel(reply)
            elif action == "mark_spam":
                result["details"] = await self._action_mark_spam(reply)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[reply_classifier] dispatch {action} failed: {e}")
            result = {"ok": False, "action": action, "error": str(e)}

        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "reply_classifier.action_dispatched",
                "org_id": self.org_id, "reply_id": reply_id,
                "lead_id": reply.get("lead_id"), "action": action,
                "ok": result.get("ok"), "created_at": now,
            })
        except Exception:
            pass
        return result

    async def _action_notify_asesor(self, reply: Dict[str, Any]) -> Dict[str, Any]:
        asesor_id = reply.get("asesor_id")
        if not asesor_id and reply.get("lead_id"):
            lead = await self.db.leads.find_one({"id": reply["lead_id"]}, {"_id": 0, "assigned_to": 1})
            asesor_id = (lead or {}).get("assigned_to")
        if not asesor_id:
            return {"sent": False, "reason": "no_asesor"}
        asesor = await self.db.users.find_one({"user_id": asesor_id}, {"_id": 0, "name": 1, "email": 1})
        if not asesor or not asesor.get("email"):
            return {"sent": False, "reason": "asesor_sin_email"}

        api_key = os.environ.get("RESEND_API_KEY")
        if not api_key:
            return {"sent": False, "reason": "no_resend_key"}

        cls = reply.get("classification") or {}
        html = _compose_notify_html(reply, asesor, cls)
        subject = f"[DMX] Reply {cls.get('category', '?').upper()} · {reply.get('from_email', '?')}"

        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as cli:
                r = await cli.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"from": os.environ.get("RESEND_FROM_LEAD_NURTURE",
                                                  "DesarrollosMX <no-reply@desarrollosmx.io>"),
                          "to": [asesor["email"]], "subject": subject, "html": html},
                )
            return {"sent": r.status_code in (200, 202),
                    "asesor_email": asesor["email"], "status_code": r.status_code}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "error": str(e)}

    async def _action_escalate_manager(self, reply: Dict[str, Any]) -> Dict[str, Any]:
        mgr = await self.db.users.find_one(
            {"tenant_id": self.org_id, "role": {"$in": ["developer_admin", "inmobiliaria_admin"]}},
            {"_id": 0, "name": 1, "email": 1},
        )
        if not mgr or not mgr.get("email"):
            return {"sent": False, "reason": "no_manager"}
        # Reuse notify path with manager as recipient
        synthetic = {**reply, "asesor_id": None}
        api_key = os.environ.get("RESEND_API_KEY")
        if not api_key:
            return {"sent": False, "reason": "no_resend_key"}
        cls = reply.get("classification") or {}
        html = _compose_notify_html(synthetic, mgr, cls, role="manager")
        subject = f"[DMX · Manager] Reply ESCALADO · {reply.get('from_email', '?')}"
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as cli:
                r = await cli.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"from": os.environ.get("RESEND_FROM_LEAD_NURTURE",
                                                  "DesarrollosMX <no-reply@desarrollosmx.io>"),
                          "to": [mgr["email"]], "subject": subject, "html": html},
                )
            return {"sent": r.status_code in (200, 202), "manager_email": mgr["email"]}
        except Exception as e:  # noqa: BLE001
            return {"sent": False, "error": str(e)}

    async def _action_add_watchlist(self, reply: Dict[str, Any]) -> Dict[str, Any]:
        lead_id = reply.get("lead_id")
        if not lead_id:
            return {"added": False, "reason": "no_lead"}
        # Best-effort: tag lead.watchlist=True + add timestamp
        res = await self.db.leads.update_one(
            {"id": lead_id},
            {"$set": {"watchlist": True, "watchlist_added_at": _now(),
                      "watchlist_reason": "reply_classifier_soft_silence_or_objection"}},
        )
        return {"added": res.modified_count > 0 or res.matched_count > 0,
                "lead_id": lead_id}

    async def _action_advance_funnel(self, reply: Dict[str, Any]) -> Dict[str, Any]:
        lead_id = reply.get("lead_id")
        if not lead_id:
            return {"advanced": False, "reason": "no_lead"}
        res = await self.db.leads.update_one(
            {"id": lead_id},
            {"$set": {"stage": "engaged", "last_activity_at": _now()}},
        )
        return {"advanced": res.modified_count > 0, "new_stage": "engaged"}

    async def _action_mark_spam(self, reply: Dict[str, Any]) -> Dict[str, Any]:
        await self.db.email_replies.update_one(
            {"_id": reply["_id"]}, {"$set": {"status": "archived", "archived_at": _now()}},
        )
        return {"archived": True}

    async def mark_action_taken(self, reply_id: str, asesor_id: Optional[str] = None
                                ) -> Dict[str, Any]:
        reply = await self.db.email_replies.find_one({"_id": reply_id})
        if not reply:
            raise ReplyClassifierNotFoundError(f"Reply {reply_id} no encontrado")
        if reply.get("org_id") != self.org_id:
            raise ReplyClassifierForbiddenError("Cross-org acceso denegado")
        if asesor_id and reply.get("asesor_id") and reply["asesor_id"] != asesor_id:
            raise ReplyClassifierForbiddenError("Reply pertenece a otro asesor")

        now = _now()
        await self.db.email_replies.update_one(
            {"_id": reply_id},
            {"$set": {"status": "action_taken", "action_taken_at": now}},
        )
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "reply_classifier.action_taken",
                "org_id": self.org_id, "reply_id": reply_id,
                "asesor_id": asesor_id, "created_at": now,
            })
        except Exception:
            pass
        return {"reply_id": reply_id, "status": "action_taken"}

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in doc.items() if k != "_id"}
        out["reply_id"] = doc.get("_id") or doc.get("reply_id")
        for k in ("received_at", "classified_at", "action_taken_at",
                  "expires_at", "archived_at"):
            v = out.get(k)
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        return out


# ─── Email render ─────────────────────────────────────────────────────────────
def _compose_notify_html(reply: Dict[str, Any], recipient: Dict[str, Any],
                         cls: Dict[str, Any], role: str = "asesor") -> str:
    color = {"high": "#EF4444", "medium": "#F59E0B", "low": "#10B981"}.get(cls.get("urgency"), "#6366F1")
    cat = cls.get("category", "?").upper()
    body_preview = (reply.get("body_text") or "")[:600]
    return f"""<!doctype html><html><body style="background:#F0EBE0;padding:20px;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;">
  <div style="font-size:11px;letter-spacing:0.18em;font-weight:700;color:{color};text-transform:uppercase;margin-bottom:6px;">
    Reply {cat} · {cls.get("urgency", "?").upper()} URGENCY
  </div>
  <h1 style="font-size:20px;color:#06080F;margin:0 0 10px;">
    Nueva respuesta de {reply.get("from_email", "?")}
  </h1>
  <p style="font-size:13px;color:#374151;margin:0 0 14px;">
    Hola {recipient.get("name", role)}: clasificación AI de la respuesta.
  </p>
  <div style="padding:12px;background:#f9fafb;border-radius:10px;margin-bottom:14px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Asunto</div>
    <div style="font-size:13px;color:#06080F;font-weight:600;">{reply.get("subject", "—")}</div>
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:8px;">Body (preview)</div>
    <div style="font-size:13px;color:#374151;white-space:pre-wrap;">{body_preview}</div>
  </div>
  <div style="padding:12px;background:#eef2ff;border-radius:10px;">
    <div style="font-size:11px;color:#6366F1;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Acción recomendada</div>
    <div style="font-size:13.5px;color:#06080F;margin-top:4px;">{cls.get("recommended_action_text", "—")}</div>
  </div>
  <p style="font-size:10px;color:#9ca3af;margin:18px 0 0;">
    Capa: {cls.get("layer_used", "—")} · Confianza: {cls.get("confidence_score", "?")}/100
  </p>
</div></body></html>"""


# ─── Webhook ingest helper ────────────────────────────────────────────────────
async def ingest_webhook_reply(db, payload: Dict[str, Any], raw_body: bytes) -> Dict[str, Any]:
    """Parse Resend webhook payload, persist email_replies, return doc.
    Resend inbound payload (parsed):
      { type: "email.bounced" | "email.replied" | ..., data: { ... } }
    Email reply may be in Resend inbound webhooks (custom domain) with structure:
      data.from, data.to, data.subject, data.text, data.html, data.message_id
    """
    data = (payload.get("data") or payload)  # tolerar shape

    # Normaliza posibles campos
    from_email = (data.get("from") or data.get("From") or "").lower().strip()
    if isinstance(from_email, dict):
        from_email = (from_email.get("email") or "").lower().strip()
    if isinstance(from_email, list) and from_email:
        from_email = (from_email[0].get("email") if isinstance(from_email[0], dict)
                      else str(from_email[0])).lower().strip()
    subject = (data.get("subject") or data.get("Subject") or "")[:500]
    body_text = (data.get("text") or data.get("body_text") or "")[:20000]
    body_html = (data.get("html") or data.get("body_html") or "")[:50000]
    message_id = (data.get("message_id") or data.get("messageId") or
                  data.get("id") or f"rmsg_{uuid.uuid4().hex[:18]}")[:120]

    # Lead lookup por email (case-insensitive)
    lead_match: Optional[Dict[str, Any]] = None
    if from_email:
        lead_match = await db.leads.find_one(
            {"$or": [{"email": from_email},
                      {"contact.email": from_email}]},
            {"_id": 0, "id": 1, "dev_org_id": 1, "assigned_to": 1, "project_id": 1},
        )

    org_id = (lead_match or {}).get("dev_org_id") or "dmx"
    lead_id = (lead_match or {}).get("id")
    asesor_id = (lead_match or {}).get("assigned_to")
    project_id = (lead_match or {}).get("project_id")

    reply_id = f"rep_{uuid.uuid4().hex[:14]}"
    now = _now()
    expires_at = now + timedelta(days=REPLY_TTL_DAYS)

    doc = {
        "_id": reply_id,
        "org_id": org_id,
        "lead_id": lead_id,
        "asesor_id": asesor_id,
        "project_id": project_id,
        "resend_message_id": message_id,
        "from_email": from_email,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "received_at": now,
        "classification": None,
        "layer_used": None,
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
        "latency_ms": 0,
        "status": "pending",
        "action_taken_at": None,
        "expires_at": expires_at,
        "review_needed": lead_id is None,
        "raw_payload_size": len(raw_body),
    }

    try:
        await db.email_replies.insert_one(doc)
    except Exception:  # noqa: BLE001
        # DuplicateKeyError on resend_message_id index → reuse
        existing = await db.email_replies.find_one({"resend_message_id": message_id}, {"_id": 1, "org_id": 1})
        if existing:
            return {"reply_id": existing["_id"], "org_id": existing.get("org_id"),
                    "lead_id": lead_id, "duplicated": True}
        raise

    return {"reply_id": reply_id, "org_id": org_id, "lead_id": lead_id,
            "review_needed": doc["review_needed"]}


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_reply_indexes(db) -> None:
    try:
        await db.email_replies.create_index(
            [("org_id", 1), ("status", 1), ("classification.urgency", 1)],
            name="idx_replies_org_status_urgency", background=True,
        )
        await db.email_replies.create_index(
            [("lead_id", 1), ("received_at", -1)],
            name="idx_replies_lead_received", background=True,
        )
        await db.email_replies.create_index(
            [("asesor_id", 1), ("status", 1)],
            name="idx_replies_asesor_status", background=True,
        )
        await db.email_replies.create_index(
            "resend_message_id", unique=True, name="idx_replies_msgid_unique", background=True,
        )
        await db.email_replies.create_index(
            "expires_at", expireAfterSeconds=0, name="idx_replies_ttl", background=True,
        )
        log.info("[reply_classifier] indexes OK")
    except Exception as exc:
        log.warning(f"[reply_classifier] ensure_indexes failed: {exc}")
