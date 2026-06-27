"""W4.2A — MCP Tools definitions.
W4.4C — Phase Y.1C · Director Agent tools (3 nuevas).

5 tools W4.2A expuestas:
  1. get_zone_score, 2. get_dev_diagnostic, 3. search_developments,
  4. get_unit_scores, 5. get_methodology

3 tools W4.4C Director:
  6. director_chat, 7. director_retrieve_memory, 8. director_session_summary

Total: 8 tools.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.mcp_tools")

# ─── Error class para Phase Y gating ─────────────────────────────────────────
class McpToolError(Exception):
    """Raised by tool handlers for JSON-RPC -32603 internal errors."""
    def __init__(self, message: str, code: int = -32603):
        super().__init__(message)
        self.code = code
        self.message = message


# Tier comparison helpers
_TIER_ORDER = {"off": 0, "T1": 1, "T2": 2, "T3": 3, "T4": 4}


def _tier_gte(tier: str, minimum: str) -> bool:
    return _TIER_ORDER.get(tier, 0) >= _TIER_ORDER.get(minimum, 99)


async def _get_director_tier(db, tenant_id: str, key_doc: Optional[Dict]) -> str:
    """Resolve director tier: key_doc.tier_director → fallback Phase Y settings."""
    if key_doc and key_doc.get("tier_director"):
        return key_doc["tier_director"]
    # Fallback: lee diagnostic_engine tier de Phase Y settings
    try:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(db, tenant_id)
        if not settings.get("agentic_enabled", False):
            return "off"
        return (settings.get("feature_tiers") or {}).get("diagnostic_engine", "off")
    except Exception:
        return "off"


async def _check_phase_y(db, tenant_id: str, min_tier: str, key_doc: Optional[Dict]) -> str:
    """Check Phase Y master switch + tier gate. Returns effective tier. Raises McpToolError."""
    # Master switch check via phase_y_settings
    try:
        from routes.phase_y_controls import get_phase_y_settings
        settings = await get_phase_y_settings(db, tenant_id)
        if not settings.get("agentic_enabled", False):
            raise McpToolError("Phase Y disabled by superadmin")
    except McpToolError:
        raise
    except Exception as e:
        raise McpToolError(f"No se pudo verificar Phase Y settings: {e}")

    tier = await _get_director_tier(db, tenant_id, key_doc)
    if not _tier_gte(tier, min_tier):
        if min_tier == "T1":
            raise McpToolError("Phase Y Director not enabled for this API key tier")
        else:
            raise McpToolError(f"Memory layer requires T2+ (current tier: {tier})")
    return tier


# ─── MCP JSON-schema definitions ─────────────────────────────────────────────

MCP_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "get_zone_score",
        "description": (
            "Retrieves DMX Intelligence Engine scores for a LATAM real estate zone. "
            "Returns IE scores (0-100) for colonia, proyecto, or unidad scope. "
            "Example: get_zone_score(zone_id='polanco') returns 20+ market indicators "
            "for Polanco, CDMX — absorption velocity, price rank percentile, risk index."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "zone_id": {
                    "type": "string",
                    "description": (
                        "Zone or development slug. Colonia examples: 'polanco', 'condesa', 'roma-norte'. "
                        "Development examples: 'altavista-polanco', 'polanco-moderno'."
                    ),
                },
            },
            "required": ["zone_id"],
        },
    },
    {
        "name": "get_dev_diagnostic",
        "description": (
            "Runs or retrieves the W4.1A diagnostic analysis for a specific real estate development. "
            "Returns up to 3 high-impact findings (pricing, funnel conversion, inventory depth) "
            "with recommended actions and cost/impact estimates in MXN. "
            "Example: get_dev_diagnostic(dev_id='altavista-polanco') → findings with summary_score."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "dev_id": {
                    "type": "string",
                    "description": "Development slug (e.g. 'altavista-polanco', 'polanco-moderno').",
                },
            },
            "required": ["dev_id"],
        },
    },
    {
        "name": "search_developments",
        "description": (
            "Search and filter LATAM real estate developments in the DMX database. "
            "Returns compact list (id, name, colonia, price range, stage) matching filters. "
            "All filters are optional — omit to list all developments. "
            "Example: search_developments(colonia_id='polanco', price_max_mxn=15000000)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "colonia_id": {
                    "type": "string",
                    "description": "Filter by colonia slug (e.g. 'polanco', 'condesa', 'santa-fe').",
                },
                "price_max_mxn": {
                    "type": "integer",
                    "description": "Maximum price_from in MXN (e.g. 5000000 for $5M MXN).",
                },
                "stage": {
                    "type": "string",
                    "enum": ["preventa", "en_construccion", "entrega_inmediata"],
                    "description": "Development stage filter.",
                },
                "bedrooms_min": {
                    "type": "integer",
                    "description": "Mínimo de recámaras (e.g. 2).",
                },
                "bedrooms_max": {
                    "type": "integer",
                    "description": "Máximo de recámaras.",
                },
                "m2_min": {
                    "type": "integer",
                    "description": "Superficie mínima en m² (e.g. 80).",
                },
                "m2_max": {
                    "type": "integer",
                    "description": "Superficie máxima en m².",
                },
                "parking_min": {
                    "type": "integer",
                    "description": "Mínimo cajones de estacionamiento.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_unit_scores",
        "description": (
            "Retrieves DMX Intelligence Engine scores for a specific apartment/unit within a development. "
            "Returns IE_UNIT_* scores: absorption velocity, m2 value, floor premium, etc. "
            "Example: get_unit_scores(unit_id='altavista-polanco-101')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "unit_id": {
                    "type": "string",
                    "description": "Unit ID in format '{dev_id}-{unit_number}' (e.g. 'altavista-polanco-101').",
                },
            },
            "required": ["unit_id"],
        },
    },
    {
        "name": "get_methodology",
        "description": (
            "Returns the DMX scoring methodology documentation for DRPI (Desarrollo Real Property Index), "
            "Zone Score, and Risk Score. Use this to understand how scores are computed before "
            "interpreting results from other DMX MCP tools. No parameters required."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    # ── W4.4C · Director Agent tools (Phase Y.1C) ──────────────────────────
    {
        "name": "director_chat",
        "description": (
            "Conversa con el DMX Director AI Agent para esta organización. Phase Y must be ENABLED "
            "for the tenant. Tier ≥ T1 required. Acepta una pregunta en español sobre el portafolio, "
            "comparables, leads, KPIs operativos o IE scores; el Director responde con datos reales "
            "de la organización (multi-tenant safe). Si omites session_id, se crea una nueva sesión "
            "y se retorna en la respuesta para mensajes posteriores. "
            "Ejemplo: director_chat(message='¿Cuál es la conversión de leads de los últimos 30 días?')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Pregunta o instrucción del usuario en español (es-MX).",
                },
                "session_id": {
                    "type": "string",
                    "description": (
                        "Opcional. ID de sesión existente para mantener contexto multi-turn. "
                        "Si se omite o es inválido, se crea una sesión nueva y se devuelve session_id."
                    ),
                },
            },
            "required": ["message"],
        },
    },
    {
        "name": "director_retrieve_memory",
        "description": (
            "Recupera memorias RAG indexadas del Director Agent (diagnósticos previos, cambios "
            "significativos de IE score, sesiones behavioral y resúmenes de sesiones del director). "
            "Multi-tenant: solo retorna memorias del org del API key. Tier ≥ T2 requerido. "
            "Búsqueda híbrida: 70% text-score (índice $text en español) + 30% recency. "
            "Ejemplo: director_retrieve_memory(query='pricing Polanco', top_k=5)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Texto de búsqueda en español (palabras clave o frase corta).",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Número máximo de memorias a retornar (1-10, default 5).",
                },
                "source_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["diagnostic", "ie_score", "behavioral", "director_summary"],
                    },
                    "description": (
                        "Filtra por tipo de fuente. Omite para incluir todas."
                    ),
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "director_session_summary",
        "description": (
            "Devuelve metadatos y resumen de mensajes recientes de una sesión del Director Agent. "
            "Útil para consultar uso de tokens, costo acumulado, tier al inicio, status, y los "
            "últimos N mensajes (user/assistant) ordenados cronológicamente. Tier ≥ T1 requerido. "
            "Multi-tenant: solo se permite consultar sesiones del org del API key. "
            "Ejemplo: director_session_summary(session_id='dses_abc123', limit=10)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "ID de la sesión a consultar (formato dses_*).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Número de mensajes recientes a incluir (1-50, default 10).",
                },
            },
            "required": ["session_id"],
        },
    },
    # ── W4.4D · What-if Simulator (Phase Y.1D) ─────────────────────────────
    {
        "name": "whatif_simulate",
        "description": (
            "Ejecuta el DMX What-if Simulator del proyecto: cambio de precio, promo/descuento, "
            "retraso de entrega, o mix combinado. Retorna forecast + confidence band + comparables_used "
            "+ recommendation_text. Phase Y must be ENABLED y tier ≥ T1. Multi-tenant: usa el org del API key. "
            "Caps diarios: T1=100 · T2=500 · T3+=ilimitado. "
            "Ejemplo: whatif_simulate(project_id='altavista-polanco', scenario_type='price_change', "
            "inputs={'proposed_delta_pct': 5, 'horizon_months': 6})."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "Slug del desarrollo (e.g. 'altavista-polanco').",
                },
                "scenario_type": {
                    "type": "string",
                    "enum": ["price_change", "promo", "delay", "mix"],
                    "description": (
                        "Tipo de escenario. price_change requiere proposed_delta_pct + horizon_months. "
                        "promo requiere promo_type + promo_value + duration_weeks. "
                        "delay requiere delay_months. "
                        "mix requiere scenarios:[{type,params},...]."
                    ),
                },
                "inputs": {
                    "type": "object",
                    "description": "Parámetros específicos del scenario_type. Ver descripción.",
                },
            },
            "required": ["project_id", "scenario_type"],
        },
    },
]


# ─── Tool handlers ────────────────────────────────────────────────────────────

async def handle_get_zone_score(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch ie_scores for zone_id."""
    zone_id = params.get("zone_id", "").strip()
    if not zone_id:
        return {"error": "zone_id es requerido"}
    docs = await db.ie_scores.find(
        {"zone_id": zone_id},
        {"_id": 0, "code": 1, "value": 1, "tier": 1, "confidence": 1, "is_stub": 1},
    ).to_list(100)
    return {
        "zone_id": zone_id,
        "scores": docs,
        "count": len(docs),
        "source": "DMX Intelligence Engine v4.1",
    }


async def handle_get_dev_diagnostic(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Run analyze_dev and return report dict."""
    dev_id = params.get("dev_id", "").strip()
    if not dev_id:
        return {"error": "dev_id es requerido"}
    from diagnostic_engine import analyze_dev
    try:
        report = await analyze_dev(db, dev_id)
        out = report.to_dict()
        # SEGURIDAD (pentest 2026-06-27): el embudo PRIVADO del dev (R4 view→lead = comportamiento de SUS compradores)
        # NO sale por la API a otros tenants. El diagnóstico por scores públicos sí; el funnel privado del dev, no.
        if isinstance(out.get("findings"), list):
            out["findings"] = [f for f in out["findings"] if not str(f.get("rule_id", "")).startswith("R4")]
        return out
    except Exception as e:
        log.warning(f"[mcp] get_dev_diagnostic({dev_id}): {e}")
        return {"error": str(e), "dev_id": dev_id}


async def handle_search_developments(_db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Filter DEVELOPMENTS in-memory and return compact list."""
    from data_developments import DEVELOPMENTS
    colonia_id = params.get("colonia_id")
    price_max = params.get("price_max_mxn")
    stage = params.get("stage")
    b_min = params.get("bedrooms_min")
    b_max = params.get("bedrooms_max")
    m_min = params.get("m2_min")
    m_max = params.get("m2_max")
    p_min = params.get("parking_min")

    results = []
    for d in DEVELOPMENTS:
        if colonia_id and d.get("colonia_id") != colonia_id:
            continue
        if price_max and (d.get("price_from") or 0) > price_max:
            continue
        if stage and d.get("stage") != stage:
            continue

        # bedrooms_range filter
        if b_min is not None or b_max is not None:
            rng = d.get("bedrooms_range")
            if rng and len(rng) == 2:
                if b_min is not None and rng[1] < b_min:
                    continue
                if b_max is not None and rng[0] > b_max:
                    continue

        # m2_range filter
        if m_min is not None or m_max is not None:
            rng = d.get("m2_range")
            if rng and len(rng) == 2:
                if m_min is not None and rng[1] < m_min:
                    continue
                if m_max is not None and rng[0] > m_max:
                    continue

        # parking_range filter
        if p_min is not None:
            rng = d.get("parking_range")
            if rng and len(rng) == 2 and rng[1] < p_min:
                continue

        results.append({
            "id": d["id"],
            "name": d.get("name"),
            "colonia": d.get("colonia"),
            "colonia_id": d.get("colonia_id"),
            "stage": d.get("stage"),
            "price_from": d.get("price_from"),
            "price_to": d.get("price_to"),
            "developer_id": d.get("developer_id"),
            "bedrooms_range": d.get("bedrooms_range"),
            "m2_range": d.get("m2_range"),
            "parking_range": d.get("parking_range"),
        })

    return {"developments": results, "count": len(results)}


async def handle_get_unit_scores(db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch IE_UNIT_* scores for a unit_id."""
    unit_id = params.get("unit_id", "").strip()
    if not unit_id:
        return {"error": "unit_id es requerido"}
    docs = await db.ie_scores.find(
        {"zone_id": unit_id, "code": {"$regex": "^IE_UNIT_"}},
        {"_id": 0, "code": 1, "value": 1, "tier": 1, "confidence": 1, "is_stub": 1},
    ).to_list(50)
    return {
        "unit_id": unit_id,
        "scores": docs,
        "count": len(docs),
    }


async def handle_get_methodology(_db, _params: Dict[str, Any]) -> Dict[str, Any]:
    """Return static DMX methodology overview."""
    return {
        "drpi": {
            "name": "Desarrollo Real Property Index",
            "description": (
                "Índice compuesto que mide el valor relativo de un desarrollo inmobiliario "
                "vs. el universo de comparables en su colonia. Score 0-100; >70 = prime."
            ),
            "inputs": ["precio_m2", "absorcion_historica", "amenidades", "ubicacion_score"],
            "update_frequency": "monthly",
        },
        "zone_score": {
            "name": "DMX Zone Score (IE Engine)",
            "description": (
                "18+ indicadores calculados por recipe engine para colonias, proyectos y unidades. "
                "Recetas: precio_rank_percentil, recency_launch, amenidades, developer_concentration, "
                "inventory_depth_relative, absorcion_velocidad."
            ),
            "scopes": ["colonia", "proyecto", "unidad"],
            "update_frequency": "daily (02:00 MX)",
        },
        "risk_score": {
            "name": "DMX Risk Score",
            "description": (
                "Evaluación de riesgo por zona basada en datos SESNSP, CENAPRED Atlas, "
                "índices de acceso y calidad de infraestructura. Score 0-100; >70 = bajo riesgo."
            ),
            "inputs": ["crime_data_sesnsp", "seismic_atlas_cdmx", "flood_risk", "infra_quality"],
            "update_frequency": "monthly",
        },
        "source": "DMX Intelligence Engine v4.1 — LATAM Real Estate Intelligence Platform",
    }


# ─── W4.4C · Director Agent handlers ─────────────────────────────────────────

def _resolve_org_user(key_doc: Optional[Dict]) -> Tuple[str, str]:
    """Extract (org_id, user_id) from MCP api_key document."""
    if not key_doc:
        raise McpToolError("API key context requerido para tools de Director")
    org_id = key_doc.get("tenant_id") or ""
    if not org_id:
        raise McpToolError("API key sin tenant_id asociado")
    user_id = key_doc.get("created_by") or f"mcp_{key_doc.get('id', 'anon')}"
    return org_id, user_id


async def handle_director_chat(db, params: Dict[str, Any], key_doc: Optional[Dict] = None) -> Dict[str, Any]:
    """W4.4C — Conversa con el Director Agent. Crea sesión si no se provee session_id."""
    message = (params.get("message") or "").strip()
    if not message:
        return {"error": "message es requerido"}

    org_id, user_id = _resolve_org_user(key_doc)
    await _check_phase_y(db, org_id, "T1", key_doc)

    from director_agent_engine import DirectorAgent, PhaseYDisabledError, SessionEndedError, TierCapExceededError

    agent = DirectorAgent(db, org_id=org_id, user_id=user_id, role="mcp_client")
    session_id = (params.get("session_id") or "").strip()

    # Verifica que la sesión existente pertenezca al mismo org (multi-tenant safety)
    if session_id:
        sess = await db.director_sessions.find_one(
            {"_id": session_id}, {"_id": 0, "org_id": 1, "status": 1}
        )
        if not sess or sess.get("org_id") != org_id or sess.get("status") == "ended":
            session_id = ""  # invalid → crear nueva

    created_new = False
    if not session_id:
        try:
            session_id = await agent.start_session()
            created_new = True
        except PhaseYDisabledError as e:
            raise McpToolError(str(e))

    try:
        result = await agent.chat(session_id, message)
    except (SessionEndedError, TierCapExceededError) as e:
        raise McpToolError(str(e))
    except ValueError as e:
        raise McpToolError(str(e))
    except Exception as e:
        log.warning(f"[mcp] director_chat error: {e}")
        raise McpToolError(f"Director chat falló: {e}")

    return {
        "session_id": session_id,
        "session_created": created_new,
        "assistant_message": result.get("assistant_message"),
        "tool_calls": [tc.get("tool_name") for tc in (result.get("tool_calls") or [])],
        "tokens_in": result.get("tokens_in", 0),
        "tokens_out": result.get("tokens_out", 0),
        "cost_usd": result.get("cost_usd", 0.0),
        "simulated": result.get("simulated", False),
        "memory_hits_count": len(result.get("memory_hits") or []),
    }


async def handle_director_retrieve_memory(db, params: Dict[str, Any], key_doc: Optional[Dict] = None) -> Dict[str, Any]:
    """W4.4C — Recupera memorias RAG del org. Tier ≥ T2 requerido."""
    query = (params.get("query") or "").strip()
    if not query:
        return {"error": "query es requerido"}

    org_id, _ = _resolve_org_user(key_doc)
    await _check_phase_y(db, org_id, "T2", key_doc)

    top_k = int(params.get("top_k") or 5)
    if top_k < 1:
        top_k = 1
    if top_k > 10:
        top_k = 10
    source_types = params.get("source_types") or None

    from director_memory_engine import DirectorMemoryEngine
    engine = DirectorMemoryEngine(db, org_id)
    hits = await engine.retrieve(
        query_text=query, top_k=top_k,
        source_types=source_types, recency_weight=0.3,
    )
    return {
        "org_id": org_id,
        "query": query,
        "hits_count": len(hits),
        "memories": [
            {
                "memory_id": h.get("memory_id"),
                "source_type": h.get("source_type"),
                "summary": (h.get("content_summary") or "")[:300],
                "created_at": h.get("created_at"),
                "score": round(h.get("final_score", 0), 3),
                "metadata": h.get("metadata") or {},
            }
            for h in hits
        ],
    }


async def handle_director_session_summary(db, params: Dict[str, Any], key_doc: Optional[Dict] = None) -> Dict[str, Any]:
    """W4.4C — Resumen de sesión del Director: metadata + últimos N mensajes."""
    session_id = (params.get("session_id") or "").strip()
    if not session_id:
        return {"error": "session_id es requerido"}

    org_id, _ = _resolve_org_user(key_doc)
    await _check_phase_y(db, org_id, "T1", key_doc)

    limit = int(params.get("limit") or 10)
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50

    sess = await db.director_sessions.find_one(
        {"_id": session_id},
        {
            "_id": 0, "org_id": 1, "user_id": 1, "role": 1, "status": 1,
            "created_at": 1, "last_message_at": 1, "tier_at_start": 1,
            "simulation_mode": 1, "total_tokens_in": 1, "total_tokens_out": 1,
            "total_cost_usd": 1, "initial_memory_ids": 1,
        },
    )
    if not sess:
        return {"error": f"Sesión '{session_id}' no existe"}
    if sess.get("org_id") != org_id:
        raise McpToolError("Sesión no pertenece a esta organización")

    messages = await db.director_messages.find(
        {"session_id": session_id, "role": {"$in": ["user", "assistant"]}},
        {
            "_id": 0, "role": 1, "content": 1, "tokens_in": 1, "tokens_out": 1,
            "tool_calls": 1, "simulated": 1, "created_at": 1,
        },
    ).sort("created_at", -1).limit(limit).to_list(length=limit)
    messages.reverse()  # cronológico ascendente
    for m in messages:
        ts = m.get("created_at")
        if hasattr(ts, "isoformat"):
            m["created_at"] = ts.isoformat()

    msg_count = await db.director_messages.count_documents({"session_id": session_id})

    created_at = sess.get("created_at")
    last_msg_at = sess.get("last_message_at")
    return {
        "session_id": session_id,
        "org_id": sess.get("org_id"),
        "user_id": sess.get("user_id"),
        "role": sess.get("role"),
        "status": sess.get("status"),
        "tier_at_start": sess.get("tier_at_start"),
        "simulation_mode": sess.get("simulation_mode", False),
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at or ""),
        "last_message_at": last_msg_at.isoformat() if hasattr(last_msg_at, "isoformat") else str(last_msg_at or ""),
        "total_tokens_in": sess.get("total_tokens_in", 0),
        "total_tokens_out": sess.get("total_tokens_out", 0),
        "total_cost_usd": sess.get("total_cost_usd", 0.0),
        "initial_memory_ids": sess.get("initial_memory_ids") or [],
        "messages_total": msg_count,
        "messages_returned": len(messages),
        "messages": messages,
    }


# ─── W4.4D · What-if Simulator handler ───────────────────────────────────────

async def handle_whatif_simulate(db, params: Dict[str, Any], key_doc: Optional[Dict] = None) -> Dict[str, Any]:
    """W4.4D — Ejecuta WhatIfEngine via MCP. Tier ≥ T1 + Phase Y enabled."""
    project_id = (params.get("project_id") or "").strip()
    scenario_type = (params.get("scenario_type") or "").strip()
    inputs = params.get("inputs") or {}
    if not project_id:
        return {"error": "project_id es requerido"}
    if not scenario_type:
        return {"error": "scenario_type es requerido"}

    org_id, user_id = _resolve_org_user(key_doc)
    # Phase Y master + tier T1 check (using existing helper before whatif's own gate)
    await _check_phase_y(db, org_id, "T1", key_doc)

    from whatif_engine import (
        run_simulation, PhaseYDisabledError, WhatIfCapExceededError, WhatIfInputError,
    )
    try:
        result = await run_simulation(
            db, org_id=org_id, user_id=user_id,
            project_id=project_id, scenario_type=scenario_type,
            inputs=inputs, persist=True,
        )
    except PhaseYDisabledError as e:
        raise McpToolError(str(e))
    except WhatIfCapExceededError as e:
        raise McpToolError(str(e))
    except WhatIfInputError as e:
        return {"error": str(e)}
    except Exception as e:
        log.warning(f"[mcp] whatif_simulate failed: {e}")
        return {"error": f"Simulador falló: {e}"}

    return {
        "scenario_id": result.get("scenario_id"),
        "scenario_type": result.get("scenario_type"),
        "tier": result.get("tier"),
        "simulation_mode": result.get("simulation_mode"),
        "inputs": result.get("inputs"),
        "outputs": result.get("outputs"),
        "base_metrics": result.get("base_metrics"),
    }


# ─── Dispatcher ───────────────────────────────────────────────────────────────

_HANDLERS = {
    "get_zone_score":             handle_get_zone_score,
    "get_dev_diagnostic":         handle_get_dev_diagnostic,
    "search_developments":        handle_search_developments,
    "get_unit_scores":            handle_get_unit_scores,
    "get_methodology":            handle_get_methodology,
    "director_chat":              handle_director_chat,
    "director_retrieve_memory":   handle_director_retrieve_memory,
    "director_session_summary":   handle_director_session_summary,
    "whatif_simulate":            handle_whatif_simulate,
}

# Tools que requieren key_doc (Phase Y gating + tenant resolution)
_KEY_DOC_TOOLS = {
    "director_chat", "director_retrieve_memory", "director_session_summary",
    "whatif_simulate",
}


async def dispatch_tool(
    db,
    name: str,
    params: Dict[str, Any],
    key_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Dispatch a tool call by name. Raises ValueError if unknown."""
    handler = _HANDLERS.get(name)
    if handler is None:
        raise ValueError(f"Tool desconocida: '{name}'. Disponibles: {list(_HANDLERS)}")
    # SEGURIDAD (pentest 2026-06-27): los tools del MOAT (scores/diagnóstico) requieren plan de pago.
    # Sin esto una key FREE extraía el moat crudo. El titular público vive en la web (Option A).
    if name in {"get_zone_score", "get_dev_diagnostic", "get_unit_scores"}:
        _t = (key_doc or {}).get("tier", "free")
        if not _tier_gte(_t, "pro"):
            raise McpToolError(f"'{name}' requiere plan pro o enterprise (tier actual: {_t})")
    if name in _KEY_DOC_TOOLS:
        return await handler(db, params, key_doc)
    return await handler(db, params)
