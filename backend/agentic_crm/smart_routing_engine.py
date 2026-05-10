"""W4.6 Y.3A — Smart Routing Lead <60 seg.

Cuando llega un lead nuevo (marketplace, /asistente, CayaBubble, landings), el
sistema asigna automáticamente al asesor de la org con mejor fit en <60 seg,
basado en:
  1) zone_expertise: ¿el asesor cierra deals en la zona del lead?
  2) segment match: alto/medio/inversionista vs perfil del asesor
  3) capacity: leads activos asignados (max 30)
  4) conversion_rate_30d
  5) horario disponible (México time vs lead created_at)

3-layer resilience reusando sub_agents/resilience.py (Y.2A):
  Layer 1 (LLM primary):    Claude Sonnet + 3 tools (asesor metrics, zone expertise, current load)
  Layer 2 (cached similar): clona routing reciente (<7d) de leads con zone+segment similar
  Layer 3 (heuristic):      ranking (capacity_score × conversion_30d × zone_match_pct)

Phase Y guards:
  master_switch on + tier `smart_routing_lead` ≥ T1
  simulation_mode → solo layer 3 + data_quality="simulated" + NO afecta lead.assigned_to real

Caps:
  - 50 routings/min/org
  - 1000/día/org tier T1 · 5000 T2 · 20000 T3+ · ilimitado T4
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sub_agents.resilience import CircuitBreaker, CircuitOpenError, FallbackChain

log = logging.getLogger("dmx.agentic_crm.smart_routing")

ROUTING_MODEL       = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK    = 3.0 / 1_000_000
PRICE_OUT_PER_TOK   = 15.0 / 1_000_000

ROUTING_TTL_DAYS    = 30
ROUTING_PENDING_HRS = 24
MAX_ASESOR_CAPACITY = 30
SLA_SECONDS         = 60

DAY_CAPS  = {"T1": 1000, "T2": 5000, "T3": 20000, "T4": 10**9}
MIN_CAP   = 50  # 50 routings/min/org

# In-process rate limit buckets per org
_org_min_buckets:  Dict[str, List[float]] = {}
_org_day_buckets:  Dict[str, List[float]] = {}
_circuit_breakers: Dict[str, CircuitBreaker] = {}
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


# ─── Errors ───────────────────────────────────────────────────────────────────
class SmartRoutingDisabledError(Exception):
    """Phase Y master switch off o tier='off'."""


class SmartRoutingRateLimitError(Exception):
    """Rate limit excedido (50/min o cap diario tier)."""


class SmartRoutingNotFoundError(Exception):
    """Lead, routing o asesor no encontrado."""


class SmartRoutingForbiddenError(Exception):
    """Cross-org access denied."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"smart_routing_{org_id}"
    if key not in _circuit_breakers:
        _circuit_breakers[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
    return _circuit_breakers[key]


def _check_concurrency(org_id: str, tier: str) -> bool:
    now = time.monotonic()
    mins = _org_min_buckets.setdefault(org_id, [])
    _org_min_buckets[org_id] = [t for t in mins if now - t < 60]
    if len(_org_min_buckets[org_id]) >= MIN_CAP:
        return False
    day_cap = DAY_CAPS.get(tier, DAY_CAPS["T1"])
    days = _org_day_buckets.setdefault(org_id, [])
    _org_day_buckets[org_id] = [t for t in days if now - t < 86400]
    if len(_org_day_buckets[org_id]) >= day_cap:
        return False
    return True


def _record_run(org_id: str) -> None:
    now = time.monotonic()
    _org_min_buckets.setdefault(org_id, []).append(now)
    _org_day_buckets.setdefault(org_id, []).append(now)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _extract_tool_calls(text: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for m in _TOOL_CALL_RE.finditer(text or ""):
        try:
            out.append(json.loads(m.group(1).strip()))
        except json.JSONDecodeError:
            continue
    return out


def _strip_tool_calls(text: str) -> str:
    return _TOOL_CALL_RE.sub("", text or "").strip()


def _segment_of_lead(lead: Dict[str, Any]) -> str:
    """Infer buyer segment from budget / intent_history."""
    bb = (lead.get("budget_band") or "").lower()
    if bb in {"alto", "high", "premium", "inversionista", "investor"}:
        return bb if bb in {"inversionista", "investor"} else "alto"
    intent = (lead.get("intent") or "").lower()
    if intent in {"inversion", "inversionista", "investor"}:
        return "inversionista"
    msg = (lead.get("message") or "").lower()
    if any(k in msg for k in ("invertir", "inversión", "inversion", "renta")):
        return "inversionista"
    return bb or "medio"


def _zone_of_lead(lead: Dict[str, Any]) -> Optional[str]:
    return (
        lead.get("zone_interest") or lead.get("zone_id")
        or (lead.get("source_metadata") or {}).get("zone_interest")
    )


# ─── LLM tools ────────────────────────────────────────────────────────────────
async def _exec_routing_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    try:
        if tool_name == "get_asesores_metrics_30d":
            return await _tool_asesores_metrics(db, org_id)
        if tool_name == "get_asesor_zone_expertise":
            return await _tool_asesor_zone_expertise(db, org_id, params.get("asesor_id"), params.get("zone"))
        if tool_name == "get_asesor_current_load":
            return await _tool_asesor_current_load(db, org_id, params.get("asesor_id"))
        return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


async def _list_active_asesores(db, org_id: str) -> List[Dict[str, Any]]:
    """Asesores activos de la org. Reusa colección `users` con role asesor o `asesores`."""
    cur = db.users.find(
        {"tenant_id": org_id, "role": {"$in": ["advisor", "asesor", "asesor_freelance", "asesor_admin"]}, "active": {"$ne": False}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "preferred_zones": 1, "preferred_segments": 1, "schedule": 1},
    )
    rows = await cur.to_list(length=200)
    if rows:
        return [
            {"asesor_id": r.get("user_id"), "name": r.get("name") or r.get("email") or r.get("user_id"),
             "preferred_zones": r.get("preferred_zones") or [],
             "preferred_segments": r.get("preferred_segments") or [],
             "schedule": r.get("schedule") or {}}
            for r in rows if r.get("user_id")
        ]
    # Fallback: asesores collection
    cur2 = db.asesores.find({"dev_org_id": org_id, "active": {"$ne": False}}, {"_id": 0})
    rows2 = await cur2.to_list(length=200)
    return [
        {"asesor_id": r.get("id") or r.get("asesor_id"),
         "name": r.get("name") or r.get("email"),
         "preferred_zones": r.get("preferred_zones") or [],
         "preferred_segments": r.get("preferred_segments") or [],
         "schedule": r.get("schedule") or {}}
        for r in rows2 if r.get("id") or r.get("asesor_id")
    ]


async def _tool_asesores_metrics(db, org_id: str) -> Dict[str, Any]:
    asesores = await _list_active_asesores(db, org_id)
    since = _now() - timedelta(days=30)

    pipeline = [
        {"$match": {"dev_org_id": org_id, "created_at": {"$gte": since}, "assigned_to": {"$ne": None}}},
        {"$group": {
            "_id": "$assigned_to",
            "total":  {"$sum": 1},
            "closed": {"$sum": {"$cond": [{"$eq": ["$status", "closed"]}, 1, 0]}},
            "active": {"$sum": {"$cond": [{"$in": ["$status", ["new", "active", "contacted", "qualified", "proposal"]]}, 1, 0]}},
        }},
    ]
    rows = await db.leads.aggregate(pipeline).to_list(length=200)
    metrics_by_id = {r["_id"]: r for r in rows}

    out = []
    for a in asesores:
        m = metrics_by_id.get(a["asesor_id"], {"total": 0, "closed": 0, "active": 0})
        total = m.get("total", 0)
        closed = m.get("closed", 0)
        out.append({
            "asesor_id": a["asesor_id"],
            "name": a["name"],
            "preferred_zones": a.get("preferred_zones", []),
            "preferred_segments": a.get("preferred_segments", []),
            "leads_30d": total,
            "closed_30d": closed,
            "active_load": m.get("active", 0),
            "conversion_pct": round((closed / total * 100) if total > 0 else 0, 1),
        })
    return {"org_id": org_id, "count": len(out), "asesores": out}


async def _tool_asesor_zone_expertise(db, org_id: str, asesor_id: Optional[str], zone: Optional[str]) -> Dict[str, Any]:
    if not asesor_id:
        return {"error": "asesor_id requerido"}
    if not zone:
        return {"asesor_id": asesor_id, "zone": None, "expertise_pct": 0, "closed_in_zone": 0, "total_in_zone": 0}
    since = _now() - timedelta(days=180)
    q_zone = {"dev_org_id": org_id, "assigned_to": asesor_id, "created_at": {"$gte": since},
              "$or": [{"zone_interest": zone}, {"zone_id": zone}, {"source_metadata.zone_interest": zone}]}
    total = await db.leads.count_documents(q_zone)
    closed = await db.leads.count_documents({**q_zone, "status": "closed"})
    pct = round((closed / total * 100) if total > 0 else 0, 1)
    return {"asesor_id": asesor_id, "zone": zone, "expertise_pct": pct,
            "closed_in_zone": closed, "total_in_zone": total}


async def _tool_asesor_current_load(db, org_id: str, asesor_id: Optional[str]) -> Dict[str, Any]:
    if not asesor_id:
        return {"error": "asesor_id requerido"}
    active = await db.leads.count_documents({
        "dev_org_id": org_id, "assigned_to": asesor_id,
        "status": {"$in": ["new", "active", "contacted", "qualified", "proposal"]},
    })
    capacity_pct = round(active / MAX_ASESOR_CAPACITY * 100, 1)
    return {"asesor_id": asesor_id, "active_leads": active,
            "max_capacity": MAX_ASESOR_CAPACITY, "capacity_pct": capacity_pct,
            "available": active < MAX_ASESOR_CAPACITY}


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")

    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit smart_routing abierto · org={org_id}")

    asesores = await _list_active_asesores(db, org_id)
    if not asesores:
        raise RuntimeError("Sin asesores activos en la org")

    zone = _zone_of_lead(lead) or "—"
    segment = _segment_of_lead(lead)
    lead_id = lead.get("id") or lead.get("lead_id") or ""

    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg

    system_prompt = f"""Eres el ruteador inteligente de leads de DesarrollosMX (México). Asignas leads a asesores con base en fit real.

Lead actual:
  id={lead_id} · zona={zone} · segmento={segment}
  intent={lead.get('intent') or '—'} · created_at={lead.get('created_at') or '—'}

Asesores disponibles ({len(asesores)}): {", ".join(a['asesor_id'] for a in asesores[:25])}

TOOLS DISPONIBLES:
<tool_call>{{"tool": "get_asesores_metrics_30d", "params": {{}}}}</tool_call>
<tool_call>{{"tool": "get_asesor_zone_expertise", "params": {{"asesor_id": "ID", "zone": "{zone}"}}}}</tool_call>
<tool_call>{{"tool": "get_asesor_current_load", "params": {{"asesor_id": "ID"}}}}</tool_call>

CRITERIOS (suma ponderada 0-100, lead se asigna al MÁXIMO):
  1. zone_expertise (0-25): % deals cerrados en la zona del lead últimos 180d
  2. segment_match (0-20): asesor con segmento preferido == segmento del lead
  3. capacity (0-20): 100 - (active_leads/30 × 100); descarta si capacity_pct >= 100
  4. conversion_30d (0-25): conversion_pct directa
  5. schedule (0-10): disponible en horario MX en `created_at` del lead (si no hay schedule, asume 10)

OUTPUT: SOLO un objeto JSON único (sin lista) con:
{{
  "suggested_asesor_id": "asesor_xxx",
  "fit_score": 0-100 (entero),
  "fit_breakdown": {{"zone": int, "segment": int, "capacity": int, "conversion": int, "schedule": int}},
  "rationale_text": "1-2 frases en es-MX explicando el match"
}}

Si NINGÚN asesor cumple capacity (todos saturados), retorna {{ "suggested_asesor_id": null, "fit_score": 0, "fit_breakdown": {{...zeros}}, "rationale_text": "Todos los asesores al límite. Escalar a manager." }}.
NO inventes asesor_id; usa SOLO IDs de la lista."""

    user_msg = (
        f"Asigna lead {lead_id} (zona={zone}, segmento={segment}) al asesor con mejor fit. "
        "Usa las tools y retorna el JSON."
    )

    session_id = f"sr_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id, system_message=system_prompt,
    ).with_model("anthropic", ROUTING_MODEL)

    tok_in = _estimate_tokens(user_msg)
    tok_out = 0
    current_message = user_msg
    raw_resp = ""

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
            p = spec.get("params") or {}
            res = await _exec_routing_tool(db, tname, p, org_id)
            res_str = json.dumps(res, ensure_ascii=False)
            results_parts.append(f'<tool_result tool="{tname}">{res_str}</tool_result>')
            tok_in += _estimate_tokens(res_str)

        current_message = (
            "RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
            "\n\nRetorna el JSON con la asignación."
        )

    clean = _strip_tool_calls(raw_resp).strip()
    json_match = re.search(r"\{.*\}", clean, re.DOTALL)
    if not json_match:
        return None

    parsed = json.loads(json_match.group(0))
    sug_id = parsed.get("suggested_asesor_id")
    valid_ids = {a["asesor_id"] for a in asesores}
    if sug_id and sug_id not in valid_ids:
        # LLM hallucinated an asesor_id → reject
        log.warning(f"[smart_routing] LLM hallucinated asesor_id={sug_id} not in {valid_ids}")
        return None

    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {
        "suggested_asesor_id": sug_id,
        "fit_score": int(parsed.get("fit_score") or 0),
        "fit_breakdown": parsed.get("fit_breakdown") or {},
        "rationale_text": (parsed.get("rationale_text") or "")[:280],
        "tokens_in": tok_in, "tokens_out": tok_out, "cost_usd": round(cost, 8),
    }


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
async def _layer_cached(db, org_id: str, lead: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Busca lead_routings recientes (<7d) con zone+segment similar."""
    zone = _zone_of_lead(lead)
    segment = _segment_of_lead(lead)
    since_7d = _now() - timedelta(days=7)

    q = {
        "org_id": org_id,
        "routed_at": {"$gte": since_7d},
        "status": {"$in": ["accepted", "pending"]},
        "lead_zone": zone,
        "lead_segment": segment,
    }
    doc = await db.lead_routings.find_one(q, sort=[("fit_score", -1), ("routed_at", -1)])
    if not doc:
        return None

    asesor_id = doc.get("suggested_asesor_id")
    if not asesor_id:
        return None
    # Validar que asesor sigue activo y con capacidad
    load = await _tool_asesor_current_load(db, org_id, asesor_id)
    if load.get("error") or not load.get("available"):
        return None

    fit = max(40, int((doc.get("fit_score") or 50) * 0.85))  # penalty por reuso
    return {
        "suggested_asesor_id": asesor_id,
        "fit_score": fit,
        "fit_breakdown": doc.get("fit_breakdown") or {},
        "rationale_text": f"[Patrón cacheado · zona={zone} segmento={segment}] Asignación basada en routing exitoso reciente.",
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
    }


# ─── Layer 3: heuristic ───────────────────────────────────────────────────────
async def _layer_heuristic(db, org_id: str, lead: Dict[str, Any],
                           exclude_ids: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Ranking simple: capacity_score × conversion_30d × zone_match_pct."""
    excluded = set(exclude_ids or [])
    zone = _zone_of_lead(lead)
    segment = _segment_of_lead(lead)
    metrics = await _tool_asesores_metrics(db, org_id)
    asesores = metrics.get("asesores") or []
    if not asesores:
        return None

    best = None
    best_score = -1.0
    best_breakdown: Dict[str, int] = {}

    for a in asesores:
        if a.get("asesor_id") in excluded:
            continue
        active = a.get("active_load", 0)
        if active >= MAX_ASESOR_CAPACITY:
            continue
        capacity_pct = max(0, 100 - round(active / MAX_ASESOR_CAPACITY * 100))
        conversion = a.get("conversion_pct", 0)
        zone_match = 100 if (zone and zone in (a.get("preferred_zones") or [])) else 50
        segment_match = 100 if segment in (a.get("preferred_segments") or []) else 50
        # Combined score (normalized to 0-100)
        score = (
            capacity_pct * 0.20 +
            conversion * 0.35 +
            zone_match * 0.30 +
            segment_match * 0.15
        )
        if score > best_score:
            best_score = score
            best = a
            best_breakdown = {
                "zone": int(zone_match * 0.25),
                "segment": int(segment_match * 0.20),
                "capacity": int(capacity_pct * 0.20),
                "conversion": int(conversion * 0.25),
                "schedule": 10,  # default neutral
            }

    if not best:
        return None
    return {
        "suggested_asesor_id": best["asesor_id"],
        "fit_score": int(best_score),
        "fit_breakdown": best_breakdown,
        "rationale_text": (
            f"Heurística: conv {best.get('conversion_pct', 0)}% · "
            f"carga {best.get('active_load', 0)}/{MAX_ASESOR_CAPACITY} · "
            f"zona {'match' if best_breakdown.get('zone', 0) > 15 else 'sin pref'}."
        )[:280],
        "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
    }


# ─── Engine ───────────────────────────────────────────────────────────────────
class SmartRoutingEngine:
    """Reglas y orchestración de routing automático para una org."""

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    # ─── Phase Y guard ────────────────────────────────────────────────────────
    async def _validate_phase_y(self, simulation_override: bool = False) -> Tuple[str, bool]:
        from routes_phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise SmartRoutingDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("smart_routing_lead", "off")
        if tier == "off":
            raise SmartRoutingDisabledError("Smart Routing requiere tier T1 o superior")
        sim = simulation_override or settings.get("simulation_mode", False)
        return tier, sim

    # ─── Lead lookup ──────────────────────────────────────────────────────────
    async def _get_lead(self, lead_id: str) -> Dict[str, Any]:
        doc = await self.db.leads.find_one({"id": lead_id})
        if not doc:
            doc = await self.db.leads.find_one({"_id": lead_id})
        if not doc:
            raise SmartRoutingNotFoundError(f"Lead {lead_id} no encontrado")
        if doc.get("dev_org_id") and doc["dev_org_id"] != self.org_id:
            raise SmartRoutingForbiddenError(f"Lead {lead_id} no pertenece a {self.org_id}")
        return doc

    # ─── route_lead ───────────────────────────────────────────────────────────
    async def route_lead(self, lead_id: str, simulation_override: bool = False,
                         exclude_asesor_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        tier, sim_mode = await self._validate_phase_y(simulation_override)

        if not _check_concurrency(self.org_id, tier):
            raise SmartRoutingRateLimitError(
                f"Cap excedido (50/min o cap diario tier {tier}). Intenta más tarde."
            )
        _record_run(self.org_id)

        t0 = time.monotonic()
        lead = await self._get_lead(lead_id)

        # Filtra asesores excluidos del input → en lead doc
        excluded = set(exclude_asesor_ids or [])

        async def _run_layer_llm(_data):
            res = await _layer_llm(self.db, self.org_id, lead)
            if res and res.get("suggested_asesor_id") in excluded:
                return None  # forzar fallback
            return res

        async def _run_layer_cached(_data):
            res = await _layer_cached(self.db, self.org_id, lead)
            if res and res.get("suggested_asesor_id") in excluded:
                return None
            return res

        async def _run_layer_heuristic(_data):
            res = await _layer_heuristic(self.db, self.org_id, lead, exclude_ids=list(excluded) if excluded else None)
            if res and res.get("suggested_asesor_id") in excluded:
                return None
            return res

        if sim_mode:
            chain_result = {"result": await _run_layer_heuristic(None), "layer_used": "heuristic"}
        else:
            chain = FallbackChain(layers=[_run_layer_llm, _run_layer_cached, _run_layer_heuristic])
            chain_result = await chain.execute(input_data={"lead_id": lead_id})

        out = chain_result.get("result")
        layer_used = chain_result.get("layer_used", "none")
        latency_ms = int((time.monotonic() - t0) * 1000)

        if not out:
            log.warning(f"[smart_routing] no asesor pudo asignarse · lead={lead_id}")
            out = {
                "suggested_asesor_id": None, "fit_score": 0, "fit_breakdown": {},
                "rationale_text": "Sin asesor disponible (todos al límite o sin asesores activos).",
                "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0,
            }
            layer_used = layer_used if layer_used != "none" else "heuristic"

        # Lookup asesor name
        asesor_name = None
        if out.get("suggested_asesor_id"):
            ad = await self.db.users.find_one(
                {"user_id": out["suggested_asesor_id"]}, {"_id": 0, "name": 1, "email": 1},
            )
            if ad:
                asesor_name = ad.get("name") or ad.get("email")

        routing_id = f"sr_{uuid.uuid4().hex[:14]}"
        now = _now()
        expires_at = now + timedelta(days=ROUTING_TTL_DAYS)
        zone = _zone_of_lead(lead)
        segment = _segment_of_lead(lead)

        doc = {
            "_id": routing_id,
            "org_id": self.org_id,
            "lead_id": lead_id,
            "lead_zone": zone,
            "lead_segment": segment,
            "suggested_asesor_id": out.get("suggested_asesor_id"),
            "suggested_asesor_name": asesor_name,
            "fit_score": int(out.get("fit_score") or 0),
            "fit_breakdown": out.get("fit_breakdown") or {},
            "rationale_text": out.get("rationale_text") or "",
            "routed_at": now,
            "expires_at": expires_at,
            "routing_layer": layer_used,
            "status": "pending",
            "accepted_at": None,
            "rejected_at": None,
            "reassigned_to": None,
            "data_quality": "simulated" if sim_mode else (
                "high" if out.get("fit_score", 0) >= 75 else "medium" if out.get("fit_score", 0) >= 50 else "low"
            ),
            "tokens_in": out.get("tokens_in", 0),
            "tokens_out": out.get("tokens_out", 0),
            "cost_usd": out.get("cost_usd", 0.0),
            "latency_ms": latency_ms,
        }
        try:
            await self.db.lead_routings.insert_one(doc)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[smart_routing] insert routing failed: {e}")

        # Track AI cost (best-effort)
        if layer_used == "llm" and out.get("cost_usd", 0) > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    self.db, self.org_id, ROUTING_MODEL,
                    out.get("tokens_in", 0) + out.get("tokens_out", 0),
                    call_type="smart_routing", feature_key="smart_routing_lead",
                )
            except Exception:
                pass

        # Activity log
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "smart_routing.created",
                "org_id": self.org_id,
                "lead_id": lead_id,
                "routing_id": routing_id,
                "asesor_id": out.get("suggested_asesor_id"),
                "fit_score": doc["fit_score"],
                "layer": layer_used,
                "simulation_mode": sim_mode,
                "created_at": now,
            })
        except Exception:
            pass

        return {
            "routing_id": routing_id,
            "lead_id": lead_id,
            "suggested_asesor_id": doc["suggested_asesor_id"],
            "suggested_asesor_name": asesor_name,
            "fit_score": doc["fit_score"],
            "fit_breakdown": doc["fit_breakdown"],
            "rationale_text": doc["rationale_text"],
            "routing_layer": layer_used,
            "status": "pending",
            "latency_ms": latency_ms,
            "cost_usd": out.get("cost_usd", 0.0),
            "simulation_mode": sim_mode,
            "data_quality": doc["data_quality"],
            "routed_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }

    # ─── accept_routing ───────────────────────────────────────────────────────
    async def accept_routing(self, routing_id: str, asesor_id: Optional[str] = None) -> Dict[str, Any]:
        doc = await self.db.lead_routings.find_one({"_id": routing_id})
        if not doc:
            raise SmartRoutingNotFoundError(f"Routing {routing_id} no encontrado")
        if doc.get("org_id") != self.org_id:
            raise SmartRoutingForbiddenError("Routing pertenece a otra org")
        if doc.get("status") != "pending":
            raise ValueError(f"Routing en estado {doc.get('status')}, no se puede aceptar")

        target_asesor = asesor_id or doc.get("suggested_asesor_id")
        if not target_asesor:
            raise ValueError("Routing sin asesor sugerido y sin asesor_id explícito")

        now = _now()
        # Si simulation_mode → NO afecta lead.assigned_to real
        sim = (doc.get("data_quality") == "simulated")
        if not sim:
            await self.db.leads.update_one(
                {"id": doc["lead_id"]},
                {"$set": {"assigned_to": target_asesor, "assigned_at": now,
                          "last_activity_at": now, "updated_at": now.isoformat()}},
            )
        await self.db.lead_routings.update_one(
            {"_id": routing_id},
            {"$set": {"status": "accepted", "accepted_at": now,
                      "suggested_asesor_id": target_asesor}},
        )
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "smart_routing.accepted",
                "org_id": self.org_id, "routing_id": routing_id, "lead_id": doc["lead_id"],
                "asesor_id": target_asesor, "simulation": sim, "created_at": now,
            })
        except Exception:
            pass
        return {"routing_id": routing_id, "status": "accepted",
                "asesor_id": target_asesor, "simulation": sim}

    # ─── reject_routing ───────────────────────────────────────────────────────
    async def reject_routing(self, routing_id: str, reason: str) -> Dict[str, Any]:
        doc = await self.db.lead_routings.find_one({"_id": routing_id})
        if not doc:
            raise SmartRoutingNotFoundError(f"Routing {routing_id} no encontrado")
        if doc.get("org_id") != self.org_id:
            raise SmartRoutingForbiddenError("Routing pertenece a otra org")
        if doc.get("status") != "pending":
            raise ValueError(f"Routing en estado {doc.get('status')}, no se puede rechazar")

        now = _now()
        rejected_asesor = doc.get("suggested_asesor_id")
        await self.db.lead_routings.update_one(
            {"_id": routing_id},
            {"$set": {"status": "rejected", "rejected_at": now,
                      "reject_reason": (reason or "")[:280]}},
        )
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "smart_routing.rejected", "org_id": self.org_id,
                "routing_id": routing_id, "lead_id": doc["lead_id"],
                "asesor_id": rejected_asesor, "reason": reason, "created_at": now,
            })
        except Exception:
            pass
        # Re-route con exclusión
        try:
            new_routing = await self.route_lead(
                doc["lead_id"], exclude_asesor_ids=[rejected_asesor] if rejected_asesor else None,
            )
            return {"routing_id": routing_id, "status": "rejected",
                    "rerouted": True, "new_routing": new_routing}
        except Exception as e:  # noqa: BLE001
            log.warning(f"[smart_routing] re-route failed: {e}")
            return {"routing_id": routing_id, "status": "rejected", "rerouted": False,
                    "rerouted_error": str(e)}

    # ─── reassign ─────────────────────────────────────────────────────────────
    async def reassign(self, routing_id: str, new_asesor_id: str, reason: str) -> Dict[str, Any]:
        if not new_asesor_id:
            raise ValueError("new_asesor_id requerido")
        doc = await self.db.lead_routings.find_one({"_id": routing_id})
        if not doc:
            raise SmartRoutingNotFoundError(f"Routing {routing_id} no encontrado")
        if doc.get("org_id") != self.org_id:
            raise SmartRoutingForbiddenError("Routing pertenece a otra org")

        now = _now()
        sim = (doc.get("data_quality") == "simulated")
        if not sim:
            await self.db.leads.update_one(
                {"id": doc["lead_id"]},
                {"$set": {"assigned_to": new_asesor_id, "assigned_at": now,
                          "last_activity_at": now, "updated_at": now.isoformat()}},
            )
        await self.db.lead_routings.update_one(
            {"_id": routing_id},
            {"$set": {"status": "reassigned",
                      "reassigned_to": new_asesor_id,
                      "reassigned_at": now,
                      "reassign_reason": (reason or "")[:280]}},
        )
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "smart_routing.reassigned", "org_id": self.org_id,
                "routing_id": routing_id, "lead_id": doc["lead_id"],
                "from_asesor_id": doc.get("suggested_asesor_id"),
                "to_asesor_id": new_asesor_id,
                "reason": reason, "simulation": sim, "created_at": now,
            })
        except Exception:
            pass
        return {"routing_id": routing_id, "status": "reassigned",
                "new_asesor_id": new_asesor_id, "simulation": sim}

    # ─── update_routing_metrics (cron) ────────────────────────────────────────
    async def update_routing_metrics(self, asesor_id: Optional[str] = None,
                                     period_days: int = 30) -> Dict[str, Any]:
        period_end = _now()
        period_start = period_end - timedelta(days=period_days)
        match: Dict[str, Any] = {"org_id": self.org_id, "routed_at": {"$gte": period_start}}
        if asesor_id:
            match["suggested_asesor_id"] = asesor_id

        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": "$suggested_asesor_id",
                "leads_routed":   {"$sum": 1},
                "leads_accepted": {"$sum": {"$cond": [{"$eq": ["$status", "accepted"]}, 1, 0]}},
                "leads_rejected": {"$sum": {"$cond": [{"$eq": ["$status", "rejected"]}, 1, 0]}},
            }},
        ]
        rows = await self.db.lead_routings.aggregate(pipeline).to_list(length=200)

        updated = 0
        for r in rows:
            aid = r["_id"]
            if not aid:
                continue
            # conversion of accepted leads (deals closed) — best-effort
            since = period_start
            total_acc = await self.db.leads.count_documents({
                "dev_org_id": self.org_id, "assigned_to": aid,
                "assigned_at": {"$gte": since},
            })
            closed = await self.db.leads.count_documents({
                "dev_org_id": self.org_id, "assigned_to": aid,
                "assigned_at": {"$gte": since}, "status": "closed",
            })
            conv_pct = round((closed / total_acc * 100) if total_acc > 0 else 0, 1)

            # Avg response time: assigned_at - lead.created_at (mins)
            cur = self.db.leads.find(
                {"dev_org_id": self.org_id, "assigned_to": aid,
                 "assigned_at": {"$gte": since}, "created_at": {"$exists": True}},
                {"_id": 0, "created_at": 1, "assigned_at": 1},
            ).limit(200)
            mins: List[float] = []
            async for ld in cur:
                ca = ld.get("created_at")
                aa = ld.get("assigned_at")
                if isinstance(ca, str):
                    try:
                        ca = datetime.fromisoformat(ca.replace("Z", "+00:00"))
                    except Exception:
                        ca = None
                ca = _ensure_utc(ca)
                aa = _ensure_utc(aa)
                if ca and aa and aa > ca:
                    mins.append((aa - ca).total_seconds() / 60.0)
            avg_resp = round(sum(mins) / len(mins), 1) if mins else None

            await self.db.routing_metrics.update_one(
                {"org_id": self.org_id, "asesor_id": aid, "period_start": period_start},
                {"$set": {
                    "org_id": self.org_id, "asesor_id": aid,
                    "period_start": period_start, "period_end": period_end,
                    "leads_routed": r["leads_routed"],
                    "leads_accepted": r["leads_accepted"],
                    "leads_rejected": r["leads_rejected"],
                    "conversion_rate_routed_leads_pct": conv_pct,
                    "avg_response_time_minutes": avg_resp,
                    "updated_at": _now(),
                }},
                upsert=True,
            )
            updated += 1

        return {"org_id": self.org_id, "period_days": period_days, "asesores_updated": updated}


# ─── Cron entry: update metrics for all orgs ──────────────────────────────────
async def run_routing_metrics_cron(db) -> Dict[str, Any]:
    """Cron diario · actualiza routing_metrics para todas las orgs con routings recientes."""
    since = _now() - timedelta(days=30)
    org_ids = await db.lead_routings.distinct("org_id", {"routed_at": {"$gte": since}})
    total = 0
    for org_id in org_ids:
        try:
            res = await SmartRoutingEngine(db, org_id).update_routing_metrics(period_days=30)
            total += res.get("asesores_updated", 0)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[smart_routing] metrics cron failed org={org_id}: {e}")
    log.info(f"[smart_routing] metrics cron · orgs={len(org_ids)} · asesores_updated={total}")
    return {"orgs": len(org_ids), "asesores_updated": total, "ts": _now().isoformat()}


# ─── Auto-route hook desde lead_nurture_engine ────────────────────────────────
async def auto_route_fresh_leads(db, hours_window: int = 2) -> Dict[str, Any]:
    """Para cada lead nuevo (created_at <hours_window) sin assigned_to, ejecuta routing.
    Si fit_score >60 → auto-accept · si 30-60 → pending · si <30 → flag superadmin."""
    cutoff = _now() - timedelta(hours=hours_window)
    cur = db.leads.find(
        {"created_at": {"$gte": cutoff},
         "$or": [{"assigned_to": None}, {"assigned_to": {"$exists": False}}]},
        {"_id": 0, "id": 1, "dev_org_id": 1},
    ).limit(500)

    routed = 0
    auto_accepted = 0
    pending = 0
    flagged = 0
    failed = 0

    async for ld in cur:
        org_id = ld.get("dev_org_id")
        lead_id = ld.get("id")
        if not org_id or not lead_id:
            continue
        # Skip si ya hay routing pending para este lead
        existing = await db.lead_routings.find_one(
            {"org_id": org_id, "lead_id": lead_id, "status": "pending"},
            {"_id": 1},
        )
        if existing:
            continue
        try:
            engine = SmartRoutingEngine(db, org_id)
            result = await engine.route_lead(lead_id)
            routed += 1
            score = result.get("fit_score") or 0
            if score > 60 and result.get("suggested_asesor_id"):
                try:
                    await engine.accept_routing(result["routing_id"])
                    auto_accepted += 1
                except Exception as e:  # noqa: BLE001
                    log.warning(f"[smart_routing] auto-accept failed: {e}")
            elif score >= 30:
                pending += 1
            else:
                flagged += 1
                try:
                    await db.activity_log.insert_one({
                        "id": f"act_{uuid.uuid4().hex[:12]}",
                        "type": "smart_routing.flagged_low_fit",
                        "org_id": org_id, "lead_id": lead_id,
                        "routing_id": result.get("routing_id"),
                        "fit_score": score, "created_at": _now(),
                    })
                except Exception:
                    pass
        except SmartRoutingDisabledError:
            continue  # org sin Phase Y · skip silencioso
        except Exception as e:  # noqa: BLE001
            log.warning(f"[smart_routing] auto-route failed lead={lead_id}: {e}")
            failed += 1

    summary = {
        "routed": routed, "auto_accepted": auto_accepted,
        "pending": pending, "flagged": flagged, "failed": failed,
        "ts": _now().isoformat(),
    }
    log.info(f"[smart_routing] auto_route_fresh_leads · {summary}")
    return summary


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_routing_indexes(db) -> None:
    try:
        await db.lead_routings.create_index(
            [("org_id", 1), ("lead_id", 1)], name="idx_routings_org_lead", background=True,
        )
        await db.lead_routings.create_index(
            [("suggested_asesor_id", 1), ("status", 1)], name="idx_routings_asesor_status", background=True,
        )
        await db.lead_routings.create_index(
            [("routed_at", -1)], name="idx_routings_routed_at", background=True,
        )
        await db.lead_routings.create_index(
            [("org_id", 1), ("lead_zone", 1), ("lead_segment", 1), ("status", 1)],
            name="idx_routings_similar", background=True,
        )
        await db.lead_routings.create_index(
            "expires_at", expireAfterSeconds=0, name="idx_routings_ttl", background=True,
        )
        await db.routing_metrics.create_index(
            [("org_id", 1), ("asesor_id", 1), ("period_start", -1)],
            name="idx_routing_metrics_org_asesor", background=True,
        )
        log.info("[smart_routing] indexes OK")
    except Exception as exc:
        log.warning(f"[smart_routing] ensure_indexes failed: {exc}")
