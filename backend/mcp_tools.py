"""W4.2A — MCP Tools definitions.

5 tools expuestos por el servidor MCP de DMX:
  1. get_zone_score      — scores de colonia/proyecto/unidad
  2. get_dev_diagnostic  — diagnóstico W4.1A para un desarrollo
  3. search_developments — búsqueda de desarrollos con filtros opcionales
  4. get_unit_scores     — scores de una unidad específica
  5. get_methodology     — metodología DRPI + Zone Score + Risk Score
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.mcp_tools")


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
        return report.to_dict()
    except Exception as e:
        log.warning(f"[mcp] get_dev_diagnostic({dev_id}): {e}")
        return {"error": str(e), "dev_id": dev_id}


async def handle_search_developments(_db, params: Dict[str, Any]) -> Dict[str, Any]:
    """Filter DEVELOPMENTS in-memory and return compact list."""
    from data_developments import DEVELOPMENTS
    colonia_id = params.get("colonia_id")
    price_max = params.get("price_max_mxn")
    stage = params.get("stage")

    results = []
    for d in DEVELOPMENTS:
        if colonia_id and d.get("colonia_id") != colonia_id:
            continue
        if price_max and (d.get("price_from") or 0) > price_max:
            continue
        if stage and d.get("stage") != stage:
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


# ─── Dispatcher ───────────────────────────────────────────────────────────────

_HANDLERS = {
    "get_zone_score":      handle_get_zone_score,
    "get_dev_diagnostic":  handle_get_dev_diagnostic,
    "search_developments": handle_search_developments,
    "get_unit_scores":     handle_get_unit_scores,
    "get_methodology":     handle_get_methodology,
}


async def dispatch_tool(db, name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch a tool call by name. Raises ValueError if unknown."""
    handler = _HANDLERS.get(name)
    if handler is None:
        raise ValueError(f"Tool desconocida: '{name}'. Disponibles: {list(_HANDLERS)}")
    return await handler(db, params)
