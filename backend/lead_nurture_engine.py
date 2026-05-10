"""W4.2D3.5 — Lead Nurture Engine.

Daily cron (04:00 MX): para cada landing_lead activo busca desarrollos nuevos en
su zone_interest después de lead.created_at y envía email vía Resend si hay
matches (con throttle anti-spam: 7 días entre emails al mismo (email, zone)).

Si RESEND_API_KEY no presente → log stub + skip envío real (no crash).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.lead_nurture_engine")

NURTURE_THROTTLE_DAYS = 7
RESEND_FROM = os.environ.get(
    "RESEND_FROM_LEAD_NURTURE",
    "DesarrollosMX <no-reply@desarrollosmx.io>",  # default canónico .io
)
SITE_BASE = "https://desarrollosmx.io"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_days_ago(days: int) -> str:
    return (_now() - timedelta(days=days)).isoformat()


def _zone_interest_slug(zi: str) -> str:
    """Strip prefix from zone_interest (zone-/alcaldia-/intent-)."""
    if not zi:
        return ""
    for prefix in ("zone-", "alcaldia-", "intent-"):
        if zi.startswith(prefix):
            return zi[len(prefix):]
    return zi


def _zone_interest_kind(zi: str) -> str:
    if zi.startswith("zone-"):
        return "zone"
    if zi.startswith("alcaldia-"):
        return "alcaldia"
    if zi.startswith("intent-"):
        return "intent"
    return "other"


# ─── Match resolution ─────────────────────────────────────────────────────────
async def _developments_for_zone_kind(kind: str, slug: str, since_iso: str) -> List[Dict[str, Any]]:
    """Return list of dev dicts that match a given (kind, slug) and were created after since_iso.

    For zone (colonia): match colonia_id == slug.
    For alcaldia: match colonia in that alcaldía via data_seed.
    For intent: match by stage/tipo filter from INTENT_LANDINGS.
    Uses data_developments.DEVELOPMENTS as authoritative source (no DB hit).
    """
    try:
        from data_developments import DEVELOPMENTS
    except Exception:
        return []

    matches: List[Dict[str, Any]] = []

    if kind == "zone":
        for d in DEVELOPMENTS:
            if d.get("colonia_id") == slug:
                matches.append(d)
    elif kind == "alcaldia":
        try:
            from seo_landings_config import COLONIAS_TARGET
            slugs_in_alcaldia = {
                k for k, v in COLONIAS_TARGET.items()
                if v.get("alcaldia_slug") == slug
            }
            for d in DEVELOPMENTS:
                if d.get("colonia_id") in slugs_in_alcaldia:
                    matches.append(d)
        except Exception as e:
            log.warning(f"[lead_nurture] alcaldia match failed for {slug}: {e}")
    elif kind == "intent":
        try:
            from seo_landings_config import INTENT_LANDINGS
            cfg = INTENT_LANDINGS.get(slug)
            if cfg:
                stage_f = cfg.get("stage_filter")
                tipo_f = cfg.get("tipo_filter")
                for d in DEVELOPMENTS:
                    if stage_f and (d.get("stage") or "").lower() != stage_f:
                        continue
                    if tipo_f:
                        td = (d.get("tipo") or d.get("property_type") or "").lower()
                        if td != tipo_f:
                            continue
                    matches.append(d)
        except Exception as e:
            log.warning(f"[lead_nurture] intent match failed for {slug}: {e}")

    # Filter by since_iso when dev has created_at; otherwise include (assumes dev is "new" relative to lead).
    out: List[Dict[str, Any]] = []
    for d in matches:
        ca = d.get("created_at") or d.get("listed_at") or ""
        if ca and isinstance(ca, str) and ca < since_iso:
            continue
        out.append(d)
    return out[:5]  # limit to 5 per email


def _zone_display_name(kind: str, slug: str) -> str:
    try:
        if kind == "zone":
            from seo_landings_config import COLONIAS_TARGET
            info = COLONIAS_TARGET.get(slug)
            if info:
                return info["name"]
        elif kind == "alcaldia":
            from seo_landings_config import ALCALDIAS_CDMX
            return ALCALDIAS_CDMX.get(slug, slug)
        elif kind == "intent":
            from seo_landings_config import INTENT_LANDINGS
            cfg = INTENT_LANDINGS.get(slug)
            if cfg:
                return cfg.get("label", slug)
    except Exception:
        pass
    return slug.replace("-", " ").title()


def _zone_landing_url(kind: str, slug: str) -> str:
    if kind == "zone":
        return f"{SITE_BASE}/zona/{slug}"
    if kind == "alcaldia":
        return f"{SITE_BASE}/alcaldia/{slug}"
    if kind == "intent":
        return f"{SITE_BASE}/cdmx/{slug}"
    return f"{SITE_BASE}/marketplace"


# ─── Email composition + send ─────────────────────────────────────────────────
def _compose_email_html(zone_name: str, zone_url: str, devs: List[Dict[str, Any]]) -> str:
    items_html = "".join(
        f"""<li style="margin-bottom: 10px;">
              <strong style="font-family: Arial, sans-serif; font-size: 14px; color: #06080F;">
                {d.get('name') or d.get('id')}
              </strong>
              <span style="font-family: Arial, sans-serif; font-size: 13px; color: #6b7280;">
                · {(d.get('stage') or 'preventa').replace('_', ' ')}
              </span>
            </li>"""
        for d in devs
    )
    return f"""<!doctype html>
<html><body style="background:#F0EBE0; padding:24px; margin:0;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:14px; padding:28px 26px; font-family: Arial, sans-serif;">
    <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#6366F1; margin-bottom:8px;">
      Alerta de inventario · DesarrollosMX
    </div>
    <h1 style="font-family: Arial, sans-serif; font-size:22px; color:#06080F; margin:0 0 12px;">
      Nuevo inventario en {zone_name}
    </h1>
    <p style="font-size:14px; color:#374151; line-height:1.6; margin:0 0 18px;">
      Tu zona de interés <strong>{zone_name}</strong> tiene {len(devs)} nuevo(s) desarrollo(s) verificado(s) por DesarrollosMX.
    </p>
    <ul style="padding-left:18px; margin:0 0 22px;">
      {items_html}
    </ul>
    <a href="{zone_url}"
       style="display:inline-block; padding:10px 22px; border-radius:9999px;
              background: linear-gradient(90deg, #6366F1, #EC4899);
              color:#fff; text-decoration:none; font-weight:700; font-size:14px;">
      Ver en DesarrollosMX
    </a>
    <p style="font-size:11px; color:#9ca3af; margin:26px 0 0;">
      Recibes este correo porque te suscribiste a alertas de {zone_name} en {SITE_BASE}.
      Si ya no te interesa, responde a este correo con "BAJA".
    </p>
  </div>
</body></html>"""


async def _send_resend_email(to_email: str, subject: str, html: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.info(f"[lead_nurture] Resend stub (no RESEND_API_KEY) → would email {to_email}: {subject}")
        return False
    body = {
        "from": RESEND_FROM,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
        ok = r.status_code in (200, 202)
        if not ok:
            log.warning(f"[lead_nurture] Resend HTTP {r.status_code}: {r.text[:200]}")
        return ok
    except Exception as e:
        log.warning(f"[lead_nurture] email send failed: {e}")
        return False


# ─── Main entry: find_matches + send ──────────────────────────────────────────
async def find_matches(db) -> List[Dict[str, Any]]:
    """For each active landing_lead, find new developments after lead.created_at
    where last_nurture_sent_at is older than NURTURE_THROTTLE_DAYS.
    Returns list of {lead_id, email, zone_interest, kind, slug, zone_name, zone_url, dev_matches}.
    """
    cutoff_iso = _iso_days_ago(NURTURE_THROTTLE_DAYS)

    # Query: leads that have NEVER been nurtured OR last sent before cutoff.
    q = {
        "$or": [
            {"last_nurture_sent_at": {"$exists": False}},
            {"last_nurture_sent_at": None},
            {"last_nurture_sent_at": {"$lt": cutoff_iso}},
        ],
    }
    leads = await db.landing_leads.find(q, {"_id": 0}).limit(1000).to_list(length=1000)

    out: List[Dict[str, Any]] = []
    for lead in leads:
        zi = lead.get("zone_interest") or ""
        if not zi:
            continue
        kind = _zone_interest_kind(zi)
        slug = _zone_interest_slug(zi)
        if kind == "other" or not slug:
            continue

        since_iso = lead.get("created_at") or _iso_days_ago(30)
        devs = await _developments_for_zone_kind(kind, slug, since_iso)
        if not devs:
            continue

        out.append({
            "lead_id": lead.get("lead_id"),
            "email": lead.get("email"),
            "zone_interest": zi,
            "kind": kind,
            "slug": slug,
            "zone_name": _zone_display_name(kind, slug),
            "zone_url": _zone_landing_url(kind, slug),
            "dev_matches": devs,
        })
    return out


async def send_nurture_email(email: str, zone_name: str, zone_url: str,
                             dev_matches: List[Dict[str, Any]]) -> bool:
    if not email or not dev_matches:
        return False
    subject = f"Nuevo inventario en {zone_name} · DesarrollosMX"
    html = _compose_email_html(zone_name, zone_url, dev_matches)
    return await _send_resend_email(email, subject, html)


async def run_lead_nurture_match(db) -> Dict[str, Any]:
    """Cron entry point. Returns {matches, sent, skipped, ts, smart_routing}."""
    ts = _now().isoformat()

    # W4.6 Y.3A — Pre-paso: smart-route fresh leads (created_at <2h sin assigned_to)
    routing_summary: Dict[str, Any] = {"routed": 0, "auto_accepted": 0,
                                       "pending": 0, "flagged": 0, "failed": 0}
    try:
        from agentic_crm.smart_routing_engine import auto_route_fresh_leads
        routing_summary = await auto_route_fresh_leads(db, hours_window=2)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[lead_nurture] smart-routing pre-step failed: {e}")

    matches = await find_matches(db)
    sent = 0
    skipped = 0

    for m in matches:
        ok = await send_nurture_email(
            m["email"], m["zone_name"], m["zone_url"], m["dev_matches"],
        )
        if ok:
            try:
                await db.landing_leads.update_one(
                    {"lead_id": m["lead_id"]},
                    {"$set": {
                        "last_nurture_sent_at": _now().isoformat(),
                        "last_nurture_match_count": len(m["dev_matches"]),
                    }},
                )
            except Exception as e:
                log.warning(f"[lead_nurture] update lead failed: {e}")
            sent += 1
        else:
            skipped += 1

    summary = {"matches": len(matches), "sent": sent, "skipped": skipped,
               "smart_routing": routing_summary, "ts": ts}
    log.info(f"[lead_nurture] run completed: {summary}")
    return summary


# ═════════════════════════════════════════════════════════════════════════════
# W4.6 Y.3E — Intelligent Nurture (agentic path · upgrade de template legacy)
# ═════════════════════════════════════════════════════════════════════════════
import json    # noqa: E402
import re      # noqa: E402
import time    # noqa: E402
import uuid    # noqa: E402
from difflib import SequenceMatcher  # noqa: E402
from typing import Tuple             # noqa: E402

from sub_agents.resilience import CircuitBreaker, CircuitOpenError  # noqa: E402

NURTURE_MODEL       = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK    = 3.0 / 1_000_000
PRICE_OUT_PER_TOK   = 15.0 / 1_000_000

SEQUENCE_TTL_DAYS   = 180
SEQ_REFRESH_DAYS    = 14
SIMILARITY_THRESHOLD = 0.78

VALID_SEQUENCE_TYPES = {
    "warm-fast", "warm-medium", "cold-warm",
    "stalled-recovery", "interested-confirmed",
}
VALID_CHANNELS = {"email", "whatsapp", "asesor_handoff"}
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)
_org_min_buckets_nrt: Dict[str, List[float]] = {}
_circuit_breakers_nrt: Dict[str, CircuitBreaker] = {}


class NurtureIntelligentDisabledError(Exception):
    """Phase Y master switch off o tier='off'."""


class NurtureIntelligentRateLimitError(Exception):
    """Cap excedido."""


class NurtureIntelligentNotFoundError(Exception):
    """Lead no encontrado."""


class NurtureIntelligentForbiddenError(Exception):
    """Cross-org acceso denegado."""


def _ensure_utc_dt(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _get_cb_nrt(org_id: str) -> CircuitBreaker:
    key = f"nurture_intelligent_{org_id}"
    if key not in _circuit_breakers_nrt:
        _circuit_breakers_nrt[key] = CircuitBreaker(
            agent_type=key, failure_threshold=5, recovery_seconds=60,
        )
    return _circuit_breakers_nrt[key]


def _check_concurrency_nrt(org_id: str, cap_per_min: int = 30) -> bool:
    now = time.monotonic()
    bucket = _org_min_buckets_nrt.setdefault(org_id, [])
    _org_min_buckets_nrt[org_id] = [t for t in bucket if now - t < 60]
    return len(_org_min_buckets_nrt[org_id]) < cap_per_min


def _record_run_nrt(org_id: str) -> None:
    _org_min_buckets_nrt.setdefault(org_id, []).append(time.monotonic())


def _estimate_tokens_nrt(text: str) -> int:
    return max(1, len(text or "") // 4)


def _extract_tool_calls_nrt(text: str) -> List[Dict[str, Any]]:
    out = []
    for m in _TOOL_CALL_RE.finditer(text or ""):
        try:
            out.append(json.loads(m.group(1).strip()))
        except json.JSONDecodeError:
            continue
    return out


def _strip_tool_calls_nrt(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text or "").strip()


# ─── Tools internos ───────────────────────────────────────────────────────────
async def _nrt_tool_disc(db, org_id: str, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    doc = await db.disc_profiles.find_one(
        {"org_id": org_id, "lead_id": lead_id},
        {"_id": 0, "scores": 1, "predominant_type": 1, "confidence_score": 1,
         "communication_preferences": 1, "recommended_approach_text": 1},
    )
    return doc or {"predominant_type": None, "confidence_score": 0}


async def _nrt_tool_behavioral(db, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    since = _now() - timedelta(days=30)
    cur = db.behavioral_events.find(
        {"$or": [{"lead_id": lead_id}, {"actor_id": lead_id}],
         "timestamp": {"$gte": since}},
        {"_id": 0, "event": 1, "timestamp": 1, "metadata": 1},
    ).sort("timestamp", -1).limit(60)
    events: List[Dict[str, Any]] = []
    async for e in cur:
        if isinstance(e.get("timestamp"), datetime):
            e["timestamp"] = e["timestamp"].isoformat()
        events.append(e)
    lead = await db.leads.find_one(
        {"id": lead_id},
        {"_id": 0, "heat_score": 1, "stage": 1, "budget_band": 1,
         "intent": 1, "zone_interest": 1, "created_at": 1},
    ) or {}
    if isinstance(lead.get("created_at"), datetime):
        lead["created_at"] = lead["created_at"].isoformat()
    return {
        "lead_id": lead_id,
        "heat_score": lead.get("heat_score"),
        "stage": lead.get("stage"),
        "budget_band": lead.get("budget_band"),
        "intent": lead.get("intent"),
        "zone_interest": lead.get("zone_interest"),
        "created_at": lead.get("created_at"),
        "events_count_30d": len(events),
        "events_recent": events[:20],
    }


async def _nrt_tool_recent_replies(db, org_id: str, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    cur = db.email_replies.find(
        {"org_id": org_id, "lead_id": lead_id},
        {"_id": 0, "subject": 1, "classification": 1, "received_at": 1, "status": 1},
    ).sort("received_at", -1).limit(10)
    out: List[Dict[str, Any]] = []
    async for r in cur:
        if isinstance(r.get("received_at"), datetime):
            r["received_at"] = r["received_at"].isoformat()
        out.append(r)
    return {"lead_id": lead_id, "replies": out, "count": len(out)}


async def _nrt_tool_smart_routing(db, org_id: str, lead_id: str) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    doc = await db.lead_routings.find_one(
        {"org_id": org_id, "lead_id": lead_id},
        sort=[("routed_at", -1)],
    )
    if not doc:
        return {"lead_id": lead_id, "routing": None}
    return {
        "lead_id": lead_id,
        "fit_score": doc.get("fit_score"),
        "suggested_asesor_id": doc.get("suggested_asesor_id"),
        "status": doc.get("status"),
        "fit_breakdown": doc.get("fit_breakdown") or {},
    }


async def _nrt_tool_subagent_recs(db, org_id: str, lead_id: str) -> Dict[str, Any]:
    """Lee últimas 5 recommendations relevantes al lead (por project_id si existe)."""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0, "project_id": 1}) or {}
    pid = lead.get("project_id")
    q: Dict[str, Any] = {"org_id": org_id}
    if pid:
        q["target_id"] = pid
    cur = db.lead_recommendations.find(
        q, {"_id": 0, "issue_detected": 1, "severity": 1,
            "suggested_action_text": 1, "expected_lift_pct": 1},
    ).sort("created_at", -1).limit(5)
    recs: List[Dict[str, Any]] = []
    async for r in cur:
        recs.append(r)
    return {"lead_id": lead_id, "project_id": pid, "recommendations": recs}


async def _exec_nrt_tool(db, org_id: str, tool_name: str,
                         params: Dict[str, Any]) -> Dict[str, Any]:
    try:
        lead_id = params.get("lead_id", "")
        if tool_name == "get_disc_profile":
            return await _nrt_tool_disc(db, org_id, lead_id)
        if tool_name == "get_lead_behavioral_summary":
            return await _nrt_tool_behavioral(db, lead_id)
        if tool_name == "get_recent_replies_classification":
            return await _nrt_tool_recent_replies(db, org_id, lead_id)
        if tool_name == "get_smart_routing_history":
            return await _nrt_tool_smart_routing(db, org_id, lead_id)
        if tool_name == "get_sub_agent_recommendations":
            return await _nrt_tool_subagent_recs(db, org_id, lead_id)
        return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


# ─── Validation ───────────────────────────────────────────────────────────────
def _normalize_sequence(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    seq_type = (raw.get("sequence_type") or "").strip().lower()
    if seq_type not in VALID_SEQUENCE_TYPES:
        seq_type = "warm-medium"
    touches_in = raw.get("touches") or []
    if not isinstance(touches_in, list) or not touches_in:
        return None
    touches: List[Dict[str, Any]] = []
    for i, t in enumerate(touches_in[:5]):
        if not isinstance(t, dict):
            continue
        ch = (t.get("channel") or "email").strip().lower()
        if ch not in VALID_CHANNELS:
            ch = "email"
        try:
            offset_h = int(t.get("offset_hours") or t.get("offset_h") or (i * 24))
        except (TypeError, ValueError):
            offset_h = i * 24
        offset_h = max(0, min(24 * 30, offset_h))
        touches.append({
            "step": i + 1,
            "channel": ch,
            "offset_hours": offset_h,
            "subject": str(t.get("subject") or "")[:200],
            "body": str(t.get("body") or t.get("body_text") or "")[:4000],
            "cta": str(t.get("cta") or "")[:200],
            "rationale": str(t.get("rationale") or "")[:300],
            "sent_at": None, "opened_at": None, "replied_at": None,
            "intent_signal": None,
        })
    if not touches:
        return None
    return {"sequence_type": seq_type, "touches": touches}


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _nrt_layer_llm(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    cb = _get_cb_nrt(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit nurture_intelligent abierto · org={org_id}")

    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg

    lead_id = lead.get("id") or ""
    lead_name = (lead.get("contact") or {}).get("name") or lead.get("name") or lead_id

    system_prompt = f"""Eres diseñador AI de secuencias de nurture personalizadas para compradores inmobiliarios CDMX.

LEAD: {lead_name} ({lead_id}) · org={org_id}

OBJETIVO: diseñar secuencia de 3-5 touches PERSONALIZADA usando 5 fuentes de datos.

TOOLS DISPONIBLES (invoca para obtener context antes de diseñar):
<tool_call>{{"tool": "get_disc_profile", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_lead_behavioral_summary", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_recent_replies_classification", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_smart_routing_history", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_sub_agent_recommendations", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>

TIPOS DE SEQUENCE (elige UNA):
- warm-fast: lead high-intent (heat>=70 OR DISC=D OR reply interested+high) → 3 touches concentrados (0h, 24h, 72h) + canal=call/email
- warm-medium: lead medium engagement, sin objeción → 4 touches (0h, 48h, 120h, 240h) + canal=email/whatsapp
- cold-warm: lead frío (heat<35 OR sin actividad 14d) → 5 touches data-rich (0h, 72h, 168h, 336h, 504h) + canal=email
- stalled-recovery: lead con reply objection o soft_silence → 4 touches con argumentario (0h, 48h, 168h, 336h) + último=asesor_handoff
- interested-confirmed: lead con reply interested+high urgency → 3 touches rápidos (0h, 12h, 36h) · primer touch=asesor_handoff

ADAPTACIÓN POR DISC:
- D (dominante): tono directo, body conciso (<120 palabras), CTA en imperativo, canal preferido=call/email
- I (influyente): tono cálido, mencionar amenidades+lifestyle+comunidad, canal=whatsapp+email
- S (estable): tono paciente, ofrecer seguridad+plazos+testimonios, canal=email+whatsapp
- C (concienzudo): tono formal, body detallado con datos+ROI+comparables, canal=email

OUTPUT: SOLO un JSON único con shape:
{{
  "sequence_type": "warm-fast|warm-medium|cold-warm|stalled-recovery|interested-confirmed",
  "rationale": "1 oración explicando por qué esta sequence",
  "touches": [
    {{
      "channel": "email|whatsapp|asesor_handoff",
      "offset_hours": int (horas desde t=0 cuando se ejecuta este touch),
      "subject": "asunto del email (vacío si no email)",
      "body": "body en es-MX, personalizado con DISC tone, <500 palabras",
      "cta": "CTA accionable",
      "rationale": "1 frase fundamentando este touch"
    }}
  ]
}}

REGLAS:
- 3-5 touches máximo
- offset_hours debe ser creciente (touch 2 > touch 1)
- Si el lead tiene reply.objection reciente, primer touch debe abordar la objeción
- Si Smart Routing fit_score>60 y existe asesor sugerido, último touch=asesor_handoff
- Si DISC.confidence_score<35 → usa secuencia genérica warm-medium
- NO inventes datos: si una tool falla, omite ese factor"""

    user_msg = (
        f"Diseña secuencia de nurture personalizada para {lead_name} ({lead_id}). "
        "Invoca las 5 tools, analiza, retorna SOLO el JSON."
    )

    session_id = f"nrt_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id, system_message=system_prompt,
    ).with_model("anthropic", NURTURE_MODEL)

    tok_in = _estimate_tokens_nrt(system_prompt) + _estimate_tokens_nrt(user_msg)
    tok_out = 0
    raw_resp = ""
    current_message = user_msg

    for _ in range(3):
        try:
            raw_resp = await cb.call(chat.send_message, LlmUserMsg(text=current_message))
        except CircuitOpenError:
            raise
        raw_resp = raw_resp or ""
        tok_out += _estimate_tokens_nrt(raw_resp)
        tool_calls = _extract_tool_calls_nrt(raw_resp)
        if not tool_calls:
            break
        results_parts = []
        for spec in tool_calls[:5]:
            tname = spec.get("tool", "")
            p = spec.get("params") or {"lead_id": lead_id}
            res = await _exec_nrt_tool(db, org_id, tname, p)
            res_str = json.dumps(res, ensure_ascii=False, default=str)
            if len(res_str) > 5000:
                res_str = res_str[:5000] + "...(truncated)"
            results_parts.append(f'<tool_result tool="{tname}">{res_str}</tool_result>')
            tok_in += _estimate_tokens_nrt(res_str)
        current_message = ("RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
                           "\n\nDiseña sequence y retorna SOLO el JSON.")

    clean = _strip_tool_calls_nrt(raw_resp).strip()
    json_match = re.search(r"\{.*\}", clean, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return None
    norm = _normalize_sequence(parsed)
    if not norm:
        return None
    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {"payload": norm, "tokens_in": tok_in, "tokens_out": tok_out,
            "cost_usd": round(cost, 8)}


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
def _lead_signature_nrt(lead: Dict[str, Any], disc_type: Optional[str]) -> str:
    seg = (lead.get("budget_band") or "").lower()
    intent = (lead.get("intent") or "").lower()
    zone = (lead.get("zone_interest") or lead.get("zone_id") or "").lower()
    return f"{disc_type or 'X'}|{seg}|{intent}|{zone}"


async def _nrt_layer_cached(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    disc = await db.disc_profiles.find_one(
        {"org_id": org_id, "lead_id": lead.get("id")},
        {"_id": 0, "predominant_type": 1},
    )
    sig = _lead_signature_nrt(lead, (disc or {}).get("predominant_type"))
    if not sig.strip("|").replace("X", "").strip():
        return None
    since = _now() - timedelta(days=14)
    cur = db.nurture_sequences.find(
        {"org_id": org_id, "generated_at": {"$gte": since},
         "lead_id": {"$ne": lead.get("id")}},
        {"_id": 0, "lead_signature": 1, "sequence_type": 1, "touches": 1},
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
    norm = _normalize_sequence({
        "sequence_type": best.get("sequence_type"),
        "touches": [
            {**(t or {}), "rationale": f"[Cacheado · {best_score:.2f}] " + str((t or {}).get("rationale") or "")}
            for t in (best.get("touches") or [])
        ],
    })
    if not norm:
        return None
    return {"payload": norm, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: heuristic (legacy template) ─────────────────────────────────────
async def _nrt_layer_heuristic(db, org_id: str, lead: Dict[str, Any]) -> Dict[str, Any]:
    """Fallback heurístico · usa flags simples para elegir sequence type
    y arma touches con copy genérico (data_quality='legacy_fallback')."""
    disc = await db.disc_profiles.find_one(
        {"org_id": org_id, "lead_id": lead.get("id")},
        {"_id": 0, "predominant_type": 1, "confidence_score": 1,
         "communication_preferences": 1},
    ) or {}
    disc_type = disc.get("predominant_type")
    heat = lead.get("heat_score") or 0
    try:
        heat = int(heat)
    except Exception:
        heat = 0

    # Choose sequence_type
    recent_reply = await db.email_replies.find_one(
        {"org_id": org_id, "lead_id": lead.get("id")},
        {"_id": 0, "classification": 1}, sort=[("received_at", -1)],
    )
    rcat = (recent_reply or {}).get("classification", {}).get("category")
    rurg = (recent_reply or {}).get("classification", {}).get("urgency")

    if rcat == "interested" and rurg == "high":
        seq_type = "interested-confirmed"
        offsets = [0, 12, 36]
        first_channel = "asesor_handoff"
    elif rcat in {"objection", "soft_silence"}:
        seq_type = "stalled-recovery"
        offsets = [0, 48, 168, 336]
        first_channel = "email"
    elif heat >= 70 or disc_type == "D":
        seq_type = "warm-fast"
        offsets = [0, 24, 72]
        first_channel = "email"
    elif heat < 35:
        seq_type = "cold-warm"
        offsets = [0, 72, 168, 336, 504]
        first_channel = "email"
    else:
        seq_type = "warm-medium"
        offsets = [0, 48, 120, 240]
        first_channel = "email"

    name = (lead.get("contact") or {}).get("name") or lead.get("name") or "comprador"
    zone = lead.get("zone_interest") or "tu zona"

    touches: List[Dict[str, Any]] = []
    for i, off in enumerate(offsets):
        ch = first_channel if i == 0 else (
            "asesor_handoff" if (i == len(offsets) - 1 and seq_type == "stalled-recovery") else
            "email" if disc_type != "I" else "whatsapp" if i % 2 == 1 else "email"
        )
        if ch == "asesor_handoff":
            subj = ""
            body = (
                f"Tarea para asesor: contactar a {name} (lead {lead.get('id')}). "
                f"Sequence={seq_type}, paso {i+1}/{len(offsets)}."
            )
            cta = "Contactar lead"
        else:
            subj = f"Sobre {zone} · paso {i+1} · DesarrollosMX"
            body_blocks = [
                f"Hola {name},",
                f"Sobre tu interés en {zone}: te dejamos información clave para esta semana.",
                "Comparativa rápida: nuevos desarrollos, precios actualizados y disponibilidad.",
                "Si te apura tiempo o quieres una visita guiada, responde este correo.",
            ]
            body = "\n\n".join(body_blocks)
            cta = "Ver desarrollos en " + zone
        touches.append({
            "step": i + 1, "channel": ch, "offset_hours": off,
            "subject": subj, "body": body, "cta": cta,
            "rationale": f"Heuristic fallback · {seq_type}",
            "sent_at": None, "opened_at": None, "replied_at": None,
            "intent_signal": None,
        })
    return {"payload": {"sequence_type": seq_type, "touches": touches},
            "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Engine ───────────────────────────────────────────────────────────────────
class NurtureIntelligentEngine:
    """Engine intelligent · 3-layer + Phase Y guards + caps."""

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise NurtureIntelligentDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("nurture_intelligent", "off")
        if tier == "off":
            raise NurtureIntelligentDisabledError("Nurture Intelligent requiere tier T1 o superior")
        sim = sim_override or settings.get("simulation_mode", False)
        return tier, sim

    async def _resolve_lead(self, lead_id: str) -> Dict[str, Any]:
        lead = await self.db.leads.find_one({"id": lead_id})
        if not lead:
            raise NurtureIntelligentNotFoundError(f"Lead {lead_id} no encontrado")
        if lead.get("dev_org_id") and lead["dev_org_id"] != self.org_id:
            raise NurtureIntelligentForbiddenError(f"Lead {lead_id} no pertenece a {self.org_id}")
        return lead

    async def design_sequence(self, lead_id: str, dry_run: bool = False,
                              simulation_override: bool = False) -> Dict[str, Any]:
        _tier, sim_mode = await self._validate_phase_y(simulation_override)
        lead = await self._resolve_lead(lead_id)

        if not _check_concurrency_nrt(self.org_id):
            raise NurtureIntelligentRateLimitError("Cap 30/min/org excedido")
        _record_run_nrt(self.org_id)

        t0 = time.monotonic()
        out = None
        layer_used = "none"

        if not sim_mode:
            try:
                out = await _nrt_layer_llm(self.db, self.org_id, lead)
                if out:
                    layer_used = "llm"
            except Exception as e:  # noqa: BLE001
                log.warning(f"[nurture_intelligent] layer_llm failed: {e}")
            if not out:
                try:
                    out = await _nrt_layer_cached(self.db, self.org_id, lead)
                    if out:
                        layer_used = "cached"
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[nurture_intelligent] layer_cached failed: {e}")
        if not out:
            out = await _nrt_layer_heuristic(self.db, self.org_id, lead)
            layer_used = "heuristic"

        latency_ms = int((time.monotonic() - t0) * 1000)
        payload = out["payload"]
        now = _now()
        first_offset_h = payload["touches"][0]["offset_hours"]
        next_touch_at = now + timedelta(hours=first_offset_h)
        expires_at = now + timedelta(days=SEQUENCE_TTL_DAYS)
        data_quality = "simulated" if sim_mode else (
            "high" if layer_used == "llm" else
            "medium" if layer_used == "cached" else "legacy_fallback"
        )

        # Lead signature for cache reuse
        disc_doc = await self.db.disc_profiles.find_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"_id": 0, "predominant_type": 1},
        )
        signature = _lead_signature_nrt(lead, (disc_doc or {}).get("predominant_type"))

        doc = {
            "org_id": self.org_id, "lead_id": lead_id,
            "lead_signature": signature,
            "sequence_type": payload["sequence_type"],
            "touches": payload["touches"],
            "current_step": 0, "total_steps": len(payload["touches"]),
            "generated_at": now,
            "last_touch_at": None,
            "next_touch_scheduled_at": next_touch_at,
            "status": "active" if not dry_run else "preview",
            "layer_used": layer_used,
            "data_quality": data_quality,
            "tokens_in": out.get("tokens_in", 0),
            "tokens_out": out.get("tokens_out", 0),
            "cost_usd": out.get("cost_usd", 0.0),
            "latency_ms": latency_ms,
            "expires_at": expires_at,
            "simulation": sim_mode,
        }

        if not dry_run:
            existing = await self.db.nurture_sequences.find_one(
                {"org_id": self.org_id, "lead_id": lead_id}, {"_id": 1},
            )
            seq_id = existing["_id"] if existing else f"nrt_{uuid.uuid4().hex[:14]}"
            doc["_id"] = seq_id
            await self.db.nurture_sequences.update_one(
                {"org_id": self.org_id, "lead_id": lead_id},
                {"$set": doc}, upsert=True,
            )

            if layer_used == "llm" and doc["cost_usd"] > 0:
                try:
                    from ai_budget import track_ai_call
                    await track_ai_call(
                        self.db, self.org_id, NURTURE_MODEL,
                        doc["tokens_in"] + doc["tokens_out"],
                        call_type="nurture_intelligent",
                        feature_key="nurture_intelligent",
                    )
                except Exception:
                    pass

            try:
                await self.db.activity_log.insert_one({
                    "id": f"act_{uuid.uuid4().hex[:12]}",
                    "type": "nurture_intelligent.designed",
                    "org_id": self.org_id, "lead_id": lead_id,
                    "sequence_type": payload["sequence_type"],
                    "total_steps": len(payload["touches"]),
                    "layer_used": layer_used,
                    "simulation": sim_mode,
                    "created_at": now,
                })
            except Exception:
                pass

        return self._serialize(doc)

    async def execute_due_touches(self, max_per_org: int = 200) -> Dict[str, Any]:
        """Para sequences activas con next_touch_scheduled_at <= now, ejecuta el siguiente touch."""
        try:
            await self._validate_phase_y()
        except NurtureIntelligentDisabledError:
            return {"executed": 0, "skipped": 0, "disabled": True}
        now = _now()
        cur = self.db.nurture_sequences.find(
            {"org_id": self.org_id, "status": "active",
             "next_touch_scheduled_at": {"$lte": now}},
            {"_id": 1, "lead_id": 1, "current_step": 1, "total_steps": 1,
             "touches": 1, "simulation": 1, "generated_at": 1},
        ).limit(max_per_org)
        executed = 0
        skipped = 0
        async for s in cur:
            try:
                ok = await self._execute_one_touch(s)
                if ok:
                    executed += 1
                else:
                    skipped += 1
            except Exception as e:  # noqa: BLE001
                log.warning(f"[nurture_intelligent] execute_one_touch failed: {e}")
                skipped += 1
        return {"executed": executed, "skipped": skipped, "ts": now.isoformat()}

    async def _execute_one_touch(self, s: Dict[str, Any]) -> bool:
        step_idx = int(s.get("current_step", 0))
        touches = s.get("touches") or []
        if step_idx >= len(touches):
            await self.db.nurture_sequences.update_one(
                {"_id": s["_id"]}, {"$set": {"status": "completed"}},
            )
            return False
        touch = touches[step_idx]
        ch = touch.get("channel")
        sim = bool(s.get("simulation"))
        sent_at = None
        reason = None

        if sim:
            reason = "simulation"
        elif ch == "email":
            lead = await self.db.leads.find_one(
                {"id": s["lead_id"]},
                {"_id": 0, "email": 1, "contact": 1},
            )
            email = (lead or {}).get("email") or ((lead or {}).get("contact") or {}).get("email")
            if email and touch.get("subject"):
                ok = await _send_resend_email(email, touch["subject"],
                                              _intelligent_email_html(touch))
                if ok:
                    sent_at = _now()
                else:
                    reason = "resend_failed"
            else:
                reason = "no_email"
        elif ch == "whatsapp":
            # W4.10 WhatsApp Business pendiente · skip+log
            reason = "whatsapp_pending_W4.10"
        elif ch == "asesor_handoff":
            await self._create_asesor_handoff_task(s["lead_id"], touch)
            sent_at = _now()
        else:
            reason = f"unknown_channel:{ch}"

        # Update touch
        touches[step_idx] = {**touch, "sent_at": sent_at, "skip_reason": reason}
        next_step = step_idx + 1
        if next_step < len(touches):
            base_t = _ensure_utc_dt(s.get("generated_at")) or _now()
            next_offset_h = touches[next_step].get("offset_hours", 24)
            next_at = base_t + timedelta(hours=int(next_offset_h))
            new_status = "active"
        else:
            next_at = None
            new_status = "completed"
        await self.db.nurture_sequences.update_one(
            {"_id": s["_id"]},
            {"$set": {"touches": touches, "current_step": next_step,
                      "last_touch_at": _now(),
                      "next_touch_scheduled_at": next_at,
                      "status": new_status}},
        )
        return sent_at is not None

    async def _create_asesor_handoff_task(self, lead_id: str, touch: Dict[str, Any]) -> None:
        try:
            await self.db.tareas.insert_one({
                "id": f"tarea_{uuid.uuid4().hex[:12]}",
                "tipo": "lead", "titulo": touch.get("body", "Contactar lead nurture")[:140],
                "entity_label": lead_id,
                "due_at": _now() + timedelta(hours=4),
                "prioridad": "alta", "notas": touch.get("rationale", ""),
                "status": "pendiente", "org_id": self.org_id,
                "created_at": _now(), "source": "nurture_intelligent",
            })
        except Exception as e:  # noqa: BLE001
            log.warning(f"[nurture_intelligent] handoff task insert failed: {e}")

    async def pause_sequence(self, lead_id: str) -> Dict[str, Any]:
        seq = await self.db.nurture_sequences.find_one(
            {"org_id": self.org_id, "lead_id": lead_id}, {"_id": 1, "org_id": 1},
        )
        if not seq:
            raise NurtureIntelligentNotFoundError(f"Sequence para lead {lead_id} no encontrada")
        await self.db.nurture_sequences.update_one(
            {"_id": seq["_id"]},
            {"$set": {"status": "paused", "paused_at": _now()}},
        )
        return {"lead_id": lead_id, "status": "paused"}

    async def resume_sequence(self, lead_id: str) -> Dict[str, Any]:
        seq = await self.db.nurture_sequences.find_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"_id": 1, "current_step": 1, "touches": 1, "generated_at": 1},
        )
        if not seq:
            raise NurtureIntelligentNotFoundError(f"Sequence para lead {lead_id} no encontrada")
        step_idx = int(seq.get("current_step", 0))
        touches = seq.get("touches") or []
        next_at = None
        if step_idx < len(touches):
            base_t = _ensure_utc_dt(seq.get("generated_at")) or _now()
            next_offset_h = touches[step_idx].get("offset_hours", 24)
            next_at = max(_now(), base_t + timedelta(hours=int(next_offset_h)))
        await self.db.nurture_sequences.update_one(
            {"_id": seq["_id"]},
            {"$set": {"status": "active", "next_touch_scheduled_at": next_at}},
        )
        return {"lead_id": lead_id, "status": "active",
                "next_touch_scheduled_at": next_at.isoformat() if next_at else None}

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in doc.items() if k != "_id"}
        out["sequence_id"] = doc.get("_id") or doc.get("sequence_id")
        for k in ("generated_at", "last_touch_at", "next_touch_scheduled_at",
                  "expires_at", "paused_at"):
            v = out.get(k)
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        return out


def _intelligent_email_html(touch: Dict[str, Any]) -> str:
    body = (touch.get("body") or "").replace("\n", "<br>")
    cta = touch.get("cta") or "Ver más"
    return f"""<!doctype html><html><body style="background:#F0EBE0;padding:20px;font-family:Arial,sans-serif;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;">
  <div style="font-size:11px;letter-spacing:0.18em;font-weight:700;color:#6366F1;text-transform:uppercase;margin-bottom:6px;">
    DesarrollosMX · Nurture inteligente
  </div>
  <div style="font-size:14px;color:#06080F;line-height:1.6;margin:0 0 18px;">{body}</div>
  <a href="{SITE_BASE}" style="display:inline-block;padding:10px 18px;border-radius:9999px;background:linear-gradient(90deg,#6366F1,#EC4899);color:#fff;text-decoration:none;font-weight:700;font-size:13px;">
    {cta}
  </a>
  <p style="font-size:11px;color:#9ca3af;margin:24px 0 0;">
    Recibes este correo porque te suscribiste a alertas en {SITE_BASE}.
  </p>
</div></body></html>"""


# ─── Cron extension wrapper ───────────────────────────────────────────────────
async def run_lead_nurture_intelligent_for_org(db, org_id: str,
                                                 max_new: int = 50) -> Dict[str, Any]:
    """Para una org con tier intelligent activo: genera sequences nuevas para
    leads sin sequence + ejecuta touches debidos."""
    summary: Dict[str, Any] = {"org_id": org_id, "designed": 0, "executed": 0,
                                "skipped_existing": 0, "errors": 0}
    try:
        engine = NurtureIntelligentEngine(db, org_id)
        await engine._validate_phase_y()
    except NurtureIntelligentDisabledError:
        summary["disabled"] = True
        return summary

    cutoff = _now() - timedelta(days=3)
    cur = db.leads.find(
        {"dev_org_id": org_id,
         "$or": [{"last_activity_at": {"$lte": cutoff}}, {"created_at": {"$lte": cutoff}}],
         "status": {"$nin": ["closed_won", "closed_lost", "spam"]}},
        {"_id": 0, "id": 1},
    ).limit(max_new)
    seen_ids: List[str] = []
    async for ld in cur:
        seen_ids.append(ld["id"])

    for lid in seen_ids:
        existing = await db.nurture_sequences.find_one(
            {"org_id": org_id, "lead_id": lid, "status": {"$in": ["active", "paused"]}},
            {"_id": 1},
        )
        if existing:
            summary["skipped_existing"] += 1
            continue
        try:
            await engine.design_sequence(lid)
            summary["designed"] += 1
        except Exception as e:  # noqa: BLE001
            log.warning(f"[nurture_intelligent] design failed lead={lid}: {e}")
            summary["errors"] += 1

    # Ejecutar touches pendientes
    try:
        exec_summary = await engine.execute_due_touches()
        summary["executed"] = exec_summary.get("executed", 0)
        summary["execute_skipped"] = exec_summary.get("skipped", 0)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[nurture_intelligent] execute_due_touches failed: {e}")
        summary["errors"] += 1
    return summary


async def run_lead_nurture_intelligent_all_orgs(db) -> Dict[str, Any]:
    """Cron entry: itera orgs con tier nurture_intelligent activo + ejecuta intelligent path
    + retorna a legacy para orgs sin tier."""
    org_summaries: List[Dict[str, Any]] = []
    cur = db.phase_y_settings.find(
        {"agentic_enabled": True,
         "feature_tiers.nurture_intelligent": {"$ne": "off"}},
        {"_id": 0, "org_id": 1},
    )
    org_ids: List[str] = []
    async for s in cur:
        if s.get("org_id"):
            org_ids.append(s["org_id"])
    for oid in org_ids:
        try:
            r = await run_lead_nurture_intelligent_for_org(db, oid)
            org_summaries.append(r)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[nurture_intelligent] org={oid} cron failed: {e}")
    return {"orgs_processed": len(org_summaries), "summaries": org_summaries,
            "ts": _now().isoformat()}


async def ensure_nurture_sequences_indexes(db) -> None:
    try:
        await db.nurture_sequences.create_index(
            [("org_id", 1), ("lead_id", 1)], unique=True,
            name="idx_nrt_org_lead_unique", background=True,
        )
        await db.nurture_sequences.create_index(
            [("status", 1), ("next_touch_scheduled_at", 1)],
            name="idx_nrt_status_next", background=True,
        )
        await db.nurture_sequences.create_index(
            "expires_at", expireAfterSeconds=0,
            name="idx_nrt_ttl", background=True,
        )
        log.info("[nurture_intelligent] indexes OK")
    except Exception as exc:
        log.warning(f"[nurture_intelligent] ensure_indexes failed: {exc}")
