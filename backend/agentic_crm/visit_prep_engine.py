"""W4.6 Y.3B — Visit Prep Automation.

Genera dossier preparatorio AI para visitas asesor-comprador, 24h antes (vía
email + dashboard). Reusa el patrón 3-layer resilience de Y.2A/Y.3A.

3-layer resilience:
  Layer 1 (LLM primary):       Claude Sonnet 4.5 + 3 tools internos
  Layer 2 (cached similar):    dossiers <14d con leads de mismo segment+zone+budget+project
  Layer 3 (heuristic):         template estático rellenado de DB queries (sin LLM)

Phase Y guards:
  master_switch + tier `visit_prep_dossier` ≥ T1
  simulation_mode → solo layer 3 + data_quality="simulated" + NO envía email real

Caps: 1 dossier/visita · 50/día tier T1 · 100 T2 · 200 T3+ · ∞ T4
SLA: <60s end-to-end (LLM ~10-25s típico, fallbacks <2s)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sub_agents.resilience import CircuitBreaker, CircuitOpenError, FallbackChain

log = logging.getLogger("dmx.agentic_crm.visit_prep")

VISIT_PREP_MODEL    = os.environ.get("DIRECTOR_MODEL", "claude-sonnet-4-5-20250929")
PRICE_IN_PER_TOK    = 3.0 / 1_000_000
PRICE_OUT_PER_TOK   = 15.0 / 1_000_000

DOSSIER_TTL_DAYS    = 90
DAY_CAPS  = {"T1": 50, "T2": 100, "T3": 200, "T4": 10**9}

_org_day_buckets: Dict[str, List[float]] = {}
_circuit_breakers: Dict[str, CircuitBreaker] = {}
_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


# ─── Errors ───────────────────────────────────────────────────────────────────
class VisitPrepDisabledError(Exception):
    """Phase Y master switch off o tier='off'."""


class VisitPrepRateLimitError(Exception):
    """Rate limit excedido (cap diario por tier)."""


class VisitPrepNotFoundError(Exception):
    """Lead, asesor, project o dossier no encontrado."""


class VisitPrepForbiddenError(Exception):
    """Cross-org o asesor sin permiso."""


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: Any) -> Optional[datetime]:
    if not isinstance(dt, datetime):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _parse_visit_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return _ensure_utc(value)
    if isinstance(value, str):
        try:
            v = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
            return _ensure_utc(dt)
        except Exception:
            return None
    return None


def _get_cb(org_id: str) -> CircuitBreaker:
    key = f"visit_prep_{org_id}"
    if key not in _circuit_breakers:
        _circuit_breakers[key] = CircuitBreaker(agent_type=key, failure_threshold=5, recovery_seconds=60)
    return _circuit_breakers[key]


def _check_concurrency(org_id: str, tier: str) -> bool:
    now = time.monotonic()
    bucket = _org_day_buckets.setdefault(org_id, [])
    _org_day_buckets[org_id] = [t for t in bucket if now - t < 86400]
    cap = DAY_CAPS.get(tier, DAY_CAPS["T1"])
    return len(_org_day_buckets[org_id]) < cap


def _record_run(org_id: str) -> None:
    _org_day_buckets.setdefault(org_id, []).append(time.monotonic())


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


def _segment_of_lead(lead: Dict[str, Any]) -> str:
    bb = (lead.get("budget_band") or "").lower()
    if bb in {"alto", "high", "premium", "inversionista"}:
        return bb
    intent = (lead.get("intent") or "").lower()
    if intent in {"inversion", "inversionista"}:
        return "inversionista"
    return bb or "medio"


def _zone_of_lead(lead: Dict[str, Any]) -> Optional[str]:
    return (
        lead.get("zone_interest") or lead.get("zone_id")
        or (lead.get("source_metadata") or {}).get("zone_interest")
    )


# ─── Tools internos ───────────────────────────────────────────────────────────
async def _exec_visit_tool(db, tool_name: str, params: Dict[str, Any], org_id: str) -> Dict[str, Any]:
    try:
        if tool_name == "get_lead_profile_full":
            return await _tool_lead_profile_full(db, params.get("lead_id"))
        if tool_name == "get_relevant_comparables_for_visit":
            return await _tool_relevant_comparables(db, params.get("project_id"), params.get("lead_id"))
        if tool_name == "get_likely_objections_segment":
            return await _tool_likely_objections(db, params.get("segment"), params.get("zone"))
        return {"error": f"Tool '{tool_name}' no reconocida"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


async def _tool_lead_profile_full(db, lead_id: Optional[str]) -> Dict[str, Any]:
    if not lead_id:
        return {"error": "lead_id requerido"}
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        return {"error": f"Lead {lead_id} no encontrado"}
    # Atlax intent_history (si existe)
    intent_history: List[Dict[str, Any]] = []
    cur = db.asistente_messages.find(
        {"lead_id": lead_id, "role": "user"}, {"_id": 0, "intent_detected": 1, "created_at": 1, "content": 1},
    ).sort("created_at", -1).limit(20)
    async for m in cur:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        intent_history.append(m)

    # Behavioral events últimos 30d
    since = _now() - timedelta(days=30)
    events_cur = db.behavioral_events.find(
        {"$or": [{"lead_id": lead_id}, {"actor_id": lead_id}], "timestamp": {"$gte": since}},
        {"_id": 0, "event": 1, "timestamp": 1, "metadata": 1},
    ).sort("timestamp", -1).limit(50)
    events: List[Dict[str, Any]] = []
    async for e in events_cur:
        if isinstance(e.get("timestamp"), datetime):
            e["timestamp"] = e["timestamp"].isoformat()
        events.append(e)

    # Comparables visited (units viewed)
    units_viewed = sorted({e.get("metadata", {}).get("unit_id") for e in events
                           if (e.get("event") or "").startswith("unit") and e.get("metadata", {}).get("unit_id")})

    return {
        "lead_id": lead_id,
        "name": (lead.get("contact") or {}).get("name") or lead.get("name") or "—",
        "email": (lead.get("contact") or {}).get("email") or lead.get("email"),
        "phone": (lead.get("contact") or {}).get("phone") or lead.get("phone"),
        "intent": lead.get("intent"),
        "budget_band": lead.get("budget_band"),
        "segment": _segment_of_lead(lead),
        "zone_interest": _zone_of_lead(lead),
        "heat_score": lead.get("heat_score"),
        "status": lead.get("status"),
        "created_at": lead.get("created_at").isoformat() if isinstance(lead.get("created_at"), datetime) else lead.get("created_at"),
        "intent_history": intent_history[:10],
        "behavioral_events_count_30d": len(events),
        "units_viewed_30d": units_viewed[:20],
        "message": (lead.get("message") or "")[:500],
    }


async def _tool_relevant_comparables(db, project_id: Optional[str], lead_id: Optional[str]) -> Dict[str, Any]:
    """Comparables que el lead probablemente preguntará: units que VIO pero NO el agendado."""
    if not project_id:
        return {"error": "project_id requerido"}
    # Try IE_PROY first for project context
    project = await db.developments.find_one({"id": project_id}, {"_id": 0}) or \
              await db.projects.find_one({"id": project_id}, {"_id": 0}) or {}
    zone = project.get("colonia_id") or project.get("zone_id") or project.get("colonia")
    tier = project.get("tier") or project.get("ie_tier")

    # Lead viewed units
    viewed_unit_ids: List[str] = []
    if lead_id:
        since = _now() - timedelta(days=30)
        cur = db.behavioral_events.find(
            {"$or": [{"lead_id": lead_id}, {"actor_id": lead_id}],
             "timestamp": {"$gte": since},
             "event": {"$regex": "unit"}},
            {"_id": 0, "metadata.unit_id": 1, "metadata.project_id": 1},
        ).limit(50)
        async for e in cur:
            uid = (e.get("metadata") or {}).get("unit_id")
            pid = (e.get("metadata") or {}).get("project_id")
            if uid and pid and pid != project_id:
                viewed_unit_ids.append(uid)
    viewed_unit_ids = list(dict.fromkeys(viewed_unit_ids))[:10]

    units_viewed: List[Dict[str, Any]] = []
    if viewed_unit_ids:
        cur = db.units.find(
            {"id": {"$in": viewed_unit_ids}},
            {"_id": 0, "id": 1, "project_id": 1, "name": 1, "price_total_mxn": 1,
             "price_m2_mxn": 1, "bedrooms": 1, "area_m2": 1, "stage": 1},
        ).limit(10)
        async for u in cur:
            units_viewed.append(u)

    # Same-zone competition (top 3 NEAR project, NOT same project)
    near_units: List[Dict[str, Any]] = []
    if zone:
        cur = db.units.find(
            {"colonia_id": zone, "project_id": {"$ne": project_id}},
            {"_id": 0, "id": 1, "project_id": 1, "name": 1, "price_total_mxn": 1,
             "price_m2_mxn": 1, "bedrooms": 1, "area_m2": 1},
        ).limit(5)
        async for u in cur:
            near_units.append(u)

    return {
        "project_id": project_id,
        "project_zone": zone, "project_tier": tier,
        "lead_viewed_units_other_projects": units_viewed,
        "near_units_same_zone": near_units,
    }


async def _tool_likely_objections(db, segment: Optional[str], zone: Optional[str]) -> Dict[str, Any]:
    """Objeciones típicas para segment+zone, vía argumentario_rag si existe."""
    objections: List[Dict[str, Any]] = []
    try:
        cur = db.argumentario_kb.find(
            {"$or": [{"segment": segment or "medio"}, {"zone": zone}, {"category": "common"}]},
            {"_id": 0, "objection": 1, "rebuttal": 1, "category": 1, "segment": 1, "zone": 1},
        ).limit(8)
        async for d in cur:
            objections.append(d)
    except Exception:
        pass

    if not objections:
        # Heurística baseline
        objections = [
            {"objection": "El precio por m² es alto vs comparables.",
             "rebuttal": "Destacar plusvalía histórica de la zona y amenidades únicas.",
             "category": "precio"},
            {"objection": "¿Y si no se entrega a tiempo?",
             "rebuttal": "Mostrar avance documentado, fecha contractual y penalizaciones.",
             "category": "tiempos"},
            {"objection": "Mi banco no me va a financiar tan rápido.",
             "rebuttal": "Ofrecer carta-poder de desarrollador con preferencia bancaria preautorizada.",
             "category": "financiamiento"},
        ]
    return {"segment": segment, "zone": zone, "objections": objections}


# ─── Layer 1: LLM ─────────────────────────────────────────────────────────────
async def _layer_llm(db, org_id: str, lead: Dict[str, Any], asesor: Dict[str, Any],
                     project: Dict[str, Any], visit_at: datetime) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    cb = _get_cb(org_id)
    if cb.is_open():
        raise CircuitOpenError(f"Circuit visit_prep abierto · org={org_id}")

    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg

    lead_id = lead.get("id") or ""
    project_id = project.get("id") or ""
    segment = _segment_of_lead(lead)
    zone = _zone_of_lead(lead) or project.get("colonia_id") or "—"
    project_name = project.get("name") or project.get("nombre") or project_id

    system_prompt = f"""Eres el copiloto AI de DesarrollosMX que prepara dossiers pre-visita para asesores inmobiliarios en México.

Visita programada:
  asesor={asesor.get('name') or asesor.get('asesor_id')} ({asesor.get('asesor_id')})
  comprador (lead)={lead.get('contact', {}).get('name') or lead.get('name') or lead_id} ({lead_id})
  proyecto={project_name} ({project_id}) · zona={zone}
  fecha visita={visit_at.isoformat()}

TOOLS DISPONIBLES:
<tool_call>{{"tool": "get_lead_profile_full", "params": {{"lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_relevant_comparables_for_visit", "params": {{"project_id": "{project_id}", "lead_id": "{lead_id}"}}}}</tool_call>
<tool_call>{{"tool": "get_likely_objections_segment", "params": {{"segment": "{segment}", "zone": "{zone}"}}}}</tool_call>

TAREA: genera dossier preparatorio. Output SOLO un JSON único (sin lista) con:
{{
  "buyer_profile": "3-4 oraciones · nombre, segmento, zona/tipo búsqueda, presupuesto, intención (alta/media/baja), nº comparables vistos, días desde 1er contacto",
  "top_3_comparables_likely_asked": [
    {{"unit_id": "...", "name": "...", "project_id": "...", "why_asked": "1 frase"}},
    ...
  ],
  "likely_objections": [
    {{"objection": "...", "rebuttal": "..."}},
    ...
  ],
  "talking_points": ["Punto diferenciador 1", "...", "...", "...", "..."],
  "key_project_data": {{
    "precio_m2_mxn": int|null, "amenidades": ["..."], "fecha_entrega": "...",
    "financiamiento_opciones": ["..."], "highlights": ["..."]
  }},
  "recommended_units": [
    {{"unit_id": "...", "name": "...", "rationale": "1 frase fit lead profile"}},
    ...
  ]
}}

Reglas: 
- es-MX, tono conciso y accionable (asesor lo lee en 2 min antes de visita)
- top_3_comparables_likely_asked: usa SOLO unit_ids reales de las tools
- recommended_units: top 3 unidades del proyecto que más fit el lead profile
- NO inventes datos; si una tool falla, omite la sección correspondiente

Si NO hay datos suficientes (lead vacío, project sin units), retorna:
{{ "buyer_profile": "Datos insuficientes", "top_3_comparables_likely_asked": [], "likely_objections": [], "talking_points": [], "key_project_data": {{}}, "recommended_units": [] }}"""

    user_msg = (
        f"Genera el dossier para visita de {asesor.get('name') or 'asesor'} con "
        f"{lead.get('contact', {}).get('name') or 'el comprador'} "
        f"sobre {project_name}, en {visit_at.strftime('%Y-%m-%d %H:%M')}. "
        "Usa las tools y retorna el JSON."
    )

    session_id = f"vp_{uuid.uuid4().hex[:12]}"
    chat = LlmChat(
        api_key=api_key, session_id=session_id, system_message=system_prompt,
    ).with_model("anthropic", VISIT_PREP_MODEL)

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
            res = await _exec_visit_tool(db, tname, p, org_id)
            res_str = json.dumps(res, ensure_ascii=False, default=str)
            results_parts.append(f'<tool_result tool="{tname}">{res_str}</tool_result>')
            tok_in += _estimate_tokens(res_str)

        current_message = ("RESULTADOS DE TOOLS:\n" + "\n".join(results_parts) +
                           "\n\nRetorna el JSON del dossier.")

    clean = _strip_tool_calls(raw_resp).strip()
    json_match = re.search(r"\{.*\}", clean, re.DOTALL)
    if not json_match:
        return None
    try:
        parsed = json.loads(json_match.group(0))
    except json.JSONDecodeError:
        return None

    cost = tok_in * PRICE_IN_PER_TOK + tok_out * PRICE_OUT_PER_TOK
    return {
        "content": _normalize_dossier_content(parsed),
        "tokens_in": tok_in, "tokens_out": tok_out, "cost_usd": round(cost, 8),
    }


def _normalize_dossier_content(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Asegura el shape estable del dossier (defaults seguros)."""
    return {
        "buyer_profile": str(raw.get("buyer_profile") or "—")[:1200],
        "top_3_comparables_likely_asked": (raw.get("top_3_comparables_likely_asked") or [])[:3],
        "likely_objections": (raw.get("likely_objections") or [])[:5],
        "talking_points": (raw.get("talking_points") or [])[:7],
        "key_project_data": raw.get("key_project_data") or {},
        "recommended_units": (raw.get("recommended_units") or [])[:3],
    }


# ─── Layer 2: cached similar ──────────────────────────────────────────────────
async def _layer_cached(db, org_id: str, lead: Dict[str, Any],
                        project: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    since_14d = _now() - timedelta(days=14)
    segment = _segment_of_lead(lead)
    zone = _zone_of_lead(lead)
    project_id = project.get("id")

    q = {
        "org_id": org_id,
        "dossier_generated_at": {"$gte": since_14d},
        "project_id": project_id,
        "lead_segment": segment,
    }
    if zone:
        q["lead_zone"] = zone
    doc = await db.visit_prep_dossiers.find_one(q, sort=[("dossier_generated_at", -1)])
    if not doc:
        return None
    content = dict(doc.get("dossier_content") or {})
    # Adaptar buyer_profile al nombre actual
    name = (lead.get("contact") or {}).get("name") or lead.get("name") or "comprador"
    bp = content.get("buyer_profile") or ""
    content["buyer_profile"] = (
        f"[Plantilla cacheada · segmento {segment} · {project.get('name', project_id)}] "
        f"{name}: " + bp
    )[:1200]
    return {"content": _normalize_dossier_content(content),
            "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Layer 3: heuristic ───────────────────────────────────────────────────────
async def _layer_heuristic(db, org_id: str, lead: Dict[str, Any],
                           project: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Template estático rellenado con DB queries simples."""
    name = (lead.get("contact") or {}).get("name") or lead.get("name") or "Comprador"
    segment = _segment_of_lead(lead)
    zone = _zone_of_lead(lead) or "—"
    bb = lead.get("budget_band") or "—"
    project_name = project.get("name") or project.get("nombre") or project.get("id") or "proyecto"

    behavioral_30d = await db.behavioral_events.count_documents({
        "$or": [{"lead_id": lead.get("id")}, {"actor_id": lead.get("id")}],
        "timestamp": {"$gte": _now() - timedelta(days=30)},
    })

    # 3 unidades del proyecto (primeras disponibles)
    project_id = project.get("id")
    rec_units: List[Dict[str, Any]] = []
    cur = db.units.find(
        {"project_id": project_id, "$or": [{"status": "available"}, {"status": {"$exists": False}}]},
        {"_id": 0, "id": 1, "name": 1, "price_total_mxn": 1, "bedrooms": 1, "area_m2": 1},
    ).limit(3)
    async for u in cur:
        rec_units.append({
            "unit_id": u.get("id"),
            "name": u.get("name") or u.get("id"),
            "rationale": (
                f"Disponible · {u.get('bedrooms') or '?'}BR · {u.get('area_m2') or '?'}m² · "
                f"${(u.get('price_total_mxn') or 0):,.0f} MXN"
            ),
        })

    objections_data = await _tool_likely_objections(db, segment, zone)
    objections = (objections_data.get("objections") or [])[:3]

    # Datos clave proyecto
    key_project_data = {
        "precio_m2_mxn": project.get("price_m2_mxn"),
        "amenidades": (project.get("amenidades") or project.get("amenities") or [])[:5],
        "fecha_entrega": project.get("fecha_entrega") or project.get("delivery_date") or "—",
        "financiamiento_opciones": (project.get("financiamiento_opciones") or
                                    project.get("financing_options") or
                                    ["Crédito hipotecario tradicional", "Crédito desarrollador"])[:3],
        "highlights": (project.get("highlights") or project.get("usp") or [])[:3],
    }

    content = {
        "buyer_profile": (
            f"{name} · segmento {segment} · zona de interés {zone} · "
            f"presupuesto {bb} · {behavioral_30d} interacciones rastreadas en últimos 30 días."
        ),
        "top_3_comparables_likely_asked": [],
        "likely_objections": objections,
        "talking_points": [
            f"Resaltar diferenciadores únicos de {project_name} vs zona.",
            "Compartir avance documentado y fecha contractual de entrega.",
            "Mostrar plusvalía histórica de la colonia.",
            "Ofrecer comparativos preautorizados de financiamiento.",
            "Cerrar con propuesta calendarizada de seguimiento <48h.",
        ],
        "key_project_data": key_project_data,
        "recommended_units": rec_units,
    }
    return {"content": _normalize_dossier_content(content),
            "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}


# ─── Engine ───────────────────────────────────────────────────────────────────
class VisitPrepEngine:
    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _validate_phase_y(self, sim_override: bool = False) -> Tuple[str, bool]:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(self.db, self.org_id)
        if not settings.get("agentic_enabled", False):
            raise VisitPrepDisabledError("Phase Y master switch desactivado")
        tier = (settings.get("feature_tiers") or {}).get("visit_prep_dossier", "off")
        if tier == "off":
            raise VisitPrepDisabledError("Visit Prep requiere tier T1 o superior")
        sim = sim_override or settings.get("simulation_mode", False)
        return tier, sim

    async def _resolve_entities(self, lead_id: str, asesor_id: str, project_id: str
                                ) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        lead = await self.db.leads.find_one({"id": lead_id})
        if not lead:
            raise VisitPrepNotFoundError(f"Lead {lead_id} no encontrado")
        if lead.get("dev_org_id") and lead["dev_org_id"] != self.org_id:
            raise VisitPrepForbiddenError(f"Lead {lead_id} no pertenece a {self.org_id}")

        asesor = await self.db.users.find_one(
            {"user_id": asesor_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "tenant_id": 1},
        )
        if not asesor:
            asesor = {"asesor_id": asesor_id, "name": asesor_id, "email": None}
        else:
            asesor["asesor_id"] = asesor.get("user_id")
            if asesor.get("tenant_id") and asesor["tenant_id"] != self.org_id:
                raise VisitPrepForbiddenError(f"Asesor {asesor_id} no pertenece a {self.org_id}")

        project = await self.db.developments.find_one({"id": project_id}) or \
                  await self.db.projects.find_one({"id": project_id}) or \
                  {"id": project_id, "name": project_id}
        if "_id" in project:
            project = {k: v for k, v in project.items() if k != "_id"}

        return lead, asesor, project

    async def generate_dossier(self, lead_id: str, asesor_id: str, project_id: str,
                               visit_scheduled_at: Any,
                               simulation_override: bool = False) -> Dict[str, Any]:
        tier, sim_mode = await self._validate_phase_y(simulation_override)

        if not _check_concurrency(self.org_id, tier):
            raise VisitPrepRateLimitError(
                f"Cap diario excedido (tier {tier}). Intenta mañana."
            )
        _record_run(self.org_id)

        visit_dt = _parse_visit_dt(visit_scheduled_at) or _now() + timedelta(hours=24)
        t0 = time.monotonic()

        lead, asesor, project = await self._resolve_entities(lead_id, asesor_id, project_id)

        # Idempotencia: si ya existe dossier no expirado para esta visita, devolver cache
        existing = await self.db.visit_prep_dossiers.find_one({
            "org_id": self.org_id, "lead_id": lead_id, "asesor_id": asesor_id,
            "project_id": project_id, "visit_scheduled_at": visit_dt,
            "status": {"$in": ["generated", "sent", "viewed"]},
        })
        if existing:
            out = self._serialize(existing)
            out["from_cache"] = True
            return out

        # Run 3-layer
        async def _run_llm(_data):
            return await _layer_llm(self.db, self.org_id, lead, asesor, project, visit_dt)

        async def _run_cached(_data):
            return await _layer_cached(self.db, self.org_id, lead, project)

        async def _run_heuristic(_data):
            return await _layer_heuristic(self.db, self.org_id, lead, project)

        if sim_mode:
            chain_result = {"result": await _run_heuristic(None), "layer_used": "heuristic"}
        else:
            chain = FallbackChain(layers=[_run_llm, _run_cached, _run_heuristic])
            chain_result = await chain.execute(input_data={"lead_id": lead_id})

        out = chain_result.get("result")
        layer_used = chain_result.get("layer_used", "none")
        latency_ms = int((time.monotonic() - t0) * 1000)

        if not out:
            # Último recurso: heurística vacía
            out = {"content": _normalize_dossier_content({}),
                   "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
            layer_used = "heuristic"

        dossier_id = f"vpd_{uuid.uuid4().hex[:14]}"
        now = _now()
        expires_at = now + timedelta(days=DOSSIER_TTL_DAYS)
        data_quality = "simulated" if sim_mode else (
            "high" if layer_used == "llm" else "medium" if layer_used == "cached" else "basic_template"
        )

        doc = {
            "_id": dossier_id,
            "org_id": self.org_id,
            "lead_id": lead_id,
            "asesor_id": asesor_id,
            "project_id": project_id,
            "lead_segment": _segment_of_lead(lead),
            "lead_zone": _zone_of_lead(lead),
            "visit_scheduled_at": visit_dt,
            "dossier_generated_at": now,
            "dossier_content": out["content"],
            "layer_used": layer_used,
            "tokens_in": out.get("tokens_in", 0),
            "tokens_out": out.get("tokens_out", 0),
            "cost_usd": out.get("cost_usd", 0.0),
            "latency_ms": latency_ms,
            "status": "generated",
            "sent_email_at": None,
            "viewed_at": None,
            "expires_at": expires_at,
            "data_quality": data_quality,
        }
        try:
            await self.db.visit_prep_dossiers.insert_one(doc)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[visit_prep] insert dossier failed: {e}")

        # AI cost tracking
        if layer_used == "llm" and doc["cost_usd"] > 0:
            try:
                from ai_budget import track_ai_call
                await track_ai_call(
                    self.db, self.org_id, VISIT_PREP_MODEL,
                    doc["tokens_in"] + doc["tokens_out"],
                    call_type="visit_prep", feature_key="visit_prep_dossier",
                )
            except Exception:
                pass

        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "visit_prep.generated",
                "org_id": self.org_id, "dossier_id": dossier_id,
                "lead_id": lead_id, "asesor_id": asesor_id, "project_id": project_id,
                "layer_used": layer_used, "simulation": sim_mode,
                "created_at": now,
            })
        except Exception:
            pass

        return self._serialize(doc)

    @staticmethod
    def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: v for k, v in doc.items() if k != "_id"}
        out["dossier_id"] = doc.get("_id") or doc.get("dossier_id")
        for k in ("visit_scheduled_at", "dossier_generated_at",
                  "sent_email_at", "viewed_at", "expires_at"):
            v = out.get(k)
            if isinstance(v, datetime):
                out[k] = v.isoformat()
        return out

    async def send_email(self, dossier_id: str) -> Dict[str, Any]:
        doc = await self.db.visit_prep_dossiers.find_one({"_id": dossier_id})
        if not doc:
            raise VisitPrepNotFoundError(f"Dossier {dossier_id} no encontrado")
        if doc.get("org_id") != self.org_id:
            raise VisitPrepForbiddenError("Cross-org acceso denegado")
        if doc.get("data_quality") == "simulated":
            return {"dossier_id": dossier_id, "sent": False, "reason": "simulation_mode"}

        asesor = await self.db.users.find_one(
            {"user_id": doc["asesor_id"]}, {"_id": 0, "name": 1, "email": 1},
        )
        if not asesor or not asesor.get("email"):
            return {"dossier_id": dossier_id, "sent": False, "reason": "asesor_sin_email"}

        api_key = os.environ.get("RESEND_API_KEY")
        html = _compose_email_html(doc, asesor)
        subject = f"Dossier de visita · {doc.get('project_id')} · listo para mañana"

        if not api_key:
            log.info(f"[visit_prep] email stub (no RESEND_API_KEY) → {asesor['email']}")
            return {"dossier_id": dossier_id, "sent": False, "reason": "no_resend_key"}

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
            ok = r.status_code in (200, 202)
        except Exception as e:  # noqa: BLE001
            log.warning(f"[visit_prep] email send failed: {e}")
            ok = False

        if ok:
            now = _now()
            await self.db.visit_prep_dossiers.update_one(
                {"_id": dossier_id},
                {"$set": {"status": "sent", "sent_email_at": now}},
            )
            try:
                await self.db.activity_log.insert_one({
                    "id": f"act_{uuid.uuid4().hex[:12]}",
                    "type": "visit_prep.sent", "org_id": self.org_id,
                    "dossier_id": dossier_id, "asesor_id": doc["asesor_id"],
                    "created_at": now,
                })
            except Exception:
                pass
        return {"dossier_id": dossier_id, "sent": ok}

    async def mark_viewed(self, dossier_id: str, asesor_id: Optional[str] = None) -> Dict[str, Any]:
        doc = await self.db.visit_prep_dossiers.find_one({"_id": dossier_id})
        if not doc:
            raise VisitPrepNotFoundError(f"Dossier {dossier_id} no encontrado")
        if doc.get("org_id") != self.org_id:
            raise VisitPrepForbiddenError("Cross-org acceso denegado")
        if asesor_id and doc.get("asesor_id") != asesor_id:
            raise VisitPrepForbiddenError("Dossier pertenece a otro asesor")

        now = _now()
        await self.db.visit_prep_dossiers.update_one(
            {"_id": dossier_id},
            {"$set": {"status": "viewed", "viewed_at": now}},
        )
        try:
            await self.db.activity_log.insert_one({
                "id": f"act_{uuid.uuid4().hex[:12]}",
                "type": "visit_prep.viewed", "org_id": self.org_id,
                "dossier_id": dossier_id, "asesor_id": doc.get("asesor_id"),
                "created_at": now,
            })
        except Exception:
            pass
        return {"dossier_id": dossier_id, "status": "viewed"}


# ─── Email render ─────────────────────────────────────────────────────────────
def _compose_email_html(doc: Dict[str, Any], asesor: Dict[str, Any]) -> str:
    c = doc.get("dossier_content") or {}
    visit_at = doc.get("visit_scheduled_at")
    if isinstance(visit_at, datetime):
        visit_str = visit_at.strftime("%Y-%m-%d %H:%M UTC")
    else:
        visit_str = str(visit_at or "—")

    def li(arr: List[Any], key: Optional[str] = None) -> str:
        items = []
        for x in (arr or [])[:5]:
            if isinstance(x, dict) and key:
                items.append(f"<li style='margin:6px 0;'>{x.get(key, '')}</li>")
            elif isinstance(x, dict):
                items.append(f"<li style='margin:6px 0;'>{x.get('objection') or x.get('name') or '—'}</li>")
            else:
                items.append(f"<li style='margin:6px 0;'>{str(x)}</li>")
        return "".join(items) or "<li style='color:#6b7280;'>—</li>"

    return f"""<!doctype html>
<html><body style="background:#F0EBE0; padding:20px; margin:0; font-family:Arial,sans-serif;">
  <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:14px; padding:28px;">
    <div style="font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#6366F1; margin-bottom:6px;">
      Dossier de visita · DesarrollosMX
    </div>
    <h1 style="font-size:22px; color:#06080F; margin:0 0 12px;">
      Visita {visit_str}
    </h1>
    <p style="font-size:13.5px; color:#374151; line-height:1.6; margin:0 0 18px;">
      Hola {asesor.get('name', 'asesor')}: aquí está tu preparación para esta visita.
    </p>

    <h3 style="font-size:13px; color:#06080F; margin:16px 0 6px;">Perfil del comprador</h3>
    <p style="font-size:13px; color:#374151; line-height:1.6; margin:0;">{c.get('buyer_profile') or '—'}</p>

    <h3 style="font-size:13px; color:#06080F; margin:18px 0 6px;">Talking points</h3>
    <ul style="padding-left:18px; margin:0; font-size:13px; color:#374151;">{li(c.get('talking_points'))}</ul>

    <h3 style="font-size:13px; color:#06080F; margin:18px 0 6px;">Objeciones probables</h3>
    <ul style="padding-left:18px; margin:0; font-size:13px; color:#374151;">{li(c.get('likely_objections'), 'objection')}</ul>

    <h3 style="font-size:13px; color:#06080F; margin:18px 0 6px;">Unidades recomendadas</h3>
    <ul style="padding-left:18px; margin:0; font-size:13px; color:#374151;">{li(c.get('recommended_units'), 'name')}</ul>

    <p style="font-size:11px; color:#9ca3af; margin:24px 0 0;">
      Generado automáticamente. Capa: {doc.get('layer_used','—')} · Calidad: {doc.get('data_quality','—')}.
    </p>
  </div>
</body></html>"""


# ─── Cron diario 06:00 MX ─────────────────────────────────────────────────────
async def run_visit_prep_daily(db) -> Dict[str, Any]:
    """Para visitas en próximas 24h sin dossier, generar + enviar email."""
    now = _now()
    in_24h = now + timedelta(hours=24)

    cur = db.appointments.find(
        {"$and": [
            {"$or": [{"slot_start": {"$gte": now.isoformat(), "$lte": in_24h.isoformat()}},
                      {"scheduled_at": {"$gte": now, "$lte": in_24h}}]},
            {"status": {"$nin": ["cancelled", "canceled", "expired"]}},
        ]},
        {"_id": 0, "appointment_id": 1, "id": 1, "lead_id": 1, "asesor_id": 1,
         "project_id": 1, "slot_start": 1, "scheduled_at": 1, "tenant_id": 1, "dev_org_id": 1},
    ).limit(500)

    generated = 0
    skipped = 0
    failed = 0
    sent = 0

    async for appt in cur:
        lead_id = appt.get("lead_id")
        asesor_id = appt.get("asesor_id")
        project_id = appt.get("project_id")
        org_id = appt.get("dev_org_id") or appt.get("tenant_id")
        if not (lead_id and asesor_id and project_id and org_id):
            skipped += 1
            continue
        visit_at = (_parse_visit_dt(appt.get("scheduled_at")) or
                    _parse_visit_dt(appt.get("slot_start")) or _now() + timedelta(hours=24))

        existing = await db.visit_prep_dossiers.find_one({
            "org_id": org_id, "lead_id": lead_id, "asesor_id": asesor_id,
            "project_id": project_id, "visit_scheduled_at": visit_at,
        })
        if existing:
            skipped += 1
            continue

        try:
            engine = VisitPrepEngine(db, org_id)
            res = await engine.generate_dossier(lead_id, asesor_id, project_id, visit_at)
            generated += 1
            send_res = await engine.send_email(res["dossier_id"])
            if send_res.get("sent"):
                sent += 1
        except VisitPrepDisabledError:
            skipped += 1
        except Exception as e:  # noqa: BLE001
            log.warning(f"[visit_prep] daily run failed for appt={appt.get('id')}: {e}")
            failed += 1

    summary = {"generated": generated, "skipped": skipped, "sent": sent,
               "failed": failed, "ts": _now().isoformat()}
    log.info(f"[visit_prep] daily run summary: {summary}")
    return summary


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_visit_prep_indexes(db) -> None:
    try:
        await db.visit_prep_dossiers.create_index(
            [("org_id", 1), ("asesor_id", 1), ("status", 1)],
            name="idx_vpd_org_asesor_status", background=True,
        )
        await db.visit_prep_dossiers.create_index(
            [("lead_id", 1), ("visit_scheduled_at", -1)],
            name="idx_vpd_lead_visit", background=True,
        )
        await db.visit_prep_dossiers.create_index(
            [("project_id", 1), ("lead_segment", 1), ("lead_zone", 1), ("dossier_generated_at", -1)],
            name="idx_vpd_similar_cache", background=True,
        )
        await db.visit_prep_dossiers.create_index(
            "expires_at", expireAfterSeconds=0, name="idx_vpd_ttl", background=True,
        )
        log.info("[visit_prep] indexes OK")
    except Exception as exc:
        log.warning(f"[visit_prep] ensure_indexes failed: {exc}")
