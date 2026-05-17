"""W5.12 Parte 1 — KG Template Registry (5 plantillas seguras).

Cada template define:
  - cypher_template: string Cypher con $params
  - required_params: lista de nombres
  - param_validators: dict name → callable(value)→bool
  - description

NUNCA se ejecuta Cypher libre desde rutas — solo plantillas registradas.
"""
from __future__ import annotations

import re
from typing import Any, Callable, Dict, List


def _is_str_id(v: Any) -> bool:
    return isinstance(v, str) and bool(re.match(r"^[A-Za-z0-9_\-]{1,80}$", v))


def _is_int_range(lo: int, hi: int) -> Callable[[Any], bool]:
    def _check(v: Any) -> bool:
        try:
            iv = int(v)
            return lo <= iv <= hi
        except Exception:
            return False
    return _check


def _is_slug(v: Any) -> bool:
    return isinstance(v, str) and bool(re.match(r"^[a-z0-9\-]{1,80}$", v))


def _is_tier(v: Any) -> bool:
    return isinstance(v, str) and v in {"A", "B", "C", "D", "premium", "media", "popular", "alta", "baja"}


TEMPLATES: Dict[str, Dict[str, Any]] = {
    "compradores_por_proyecto_zona": {
        "description": "Lista buyers con BehavioralSession sobre la zona de un proyecto en los ultimos N dias.",
        "required_params": ["project_id", "last_days"],
        "optional_params": ["zone_subscore_min"],
        "param_validators": {
            "project_id": _is_str_id,
            "last_days": _is_int_range(1, 365),
            "zone_subscore_min": _is_int_range(0, 100),
        },
        "cypher_template": """
        MATCH (p:Project {id: $project_id})-[:LOCATED_IN]->(z:Zone)
        MATCH (b:BehavioralSession)-[v:VIEWED]->(p2:Project)-[:LOCATED_IN]->(z)
        WHERE b.created_at IS NOT NULL AND b.user_id IS NOT NULL
        WITH b, count(DISTINCT p2) AS projects_viewed, max(b.created_at) AS last_view
        RETURN b.user_id AS user_id, projects_viewed, last_view
        ORDER BY projects_viewed DESC, last_view DESC
        LIMIT 200
        """,
    },

    "proyectos_dev_por_zona_tier": {
        "description": "Proyectos de un dev_org agrupados por tier de zona.",
        "required_params": ["dev_org_id"],
        "optional_params": ["zone_tier"],
        "param_validators": {
            "dev_org_id": _is_str_id,
            "zone_tier": _is_tier,
        },
        "cypher_template": """
        MATCH (p:Project)-[:OWNED_BY]->(:DevOrg {id: $dev_org_id})
        MATCH (p)-[:LOCATED_IN]->(z:Zone)
        WHERE ($zone_tier IS NULL OR z.tier = $zone_tier)
        RETURN p.id AS project_id, p.name AS project_name,
               z.slug AS zone_slug, z.tier AS zone_tier,
               p.precio_min AS precio_min, p.precio_max AS precio_max
        ORDER BY z.tier ASC, p.name ASC
        LIMIT 500
        """,
    },

    "leads_cross_project_cliente": {
        "description": "Leads del mismo client_global_id en proyectos diferentes.",
        "required_params": ["client_global_id"],
        "optional_params": [],
        "param_validators": {
            "client_global_id": _is_str_id,
        },
        "cypher_template": """
        MATCH (l:Lead {client_global_id: $client_global_id})-[:INTERESTED_IN]->(p:Project)
        OPTIONAL MATCH (p)-[:OWNED_BY]->(d:DevOrg)
        RETURN l.id AS lead_id, l.status AS status,
               l.assigned_to AS asesor_id,
               p.id AS project_id, p.name AS project_name,
               d.id AS dev_org_id
        ORDER BY l.created_at DESC
        LIMIT 200
        """,
    },

    "asesores_leads_compartidos": {
        "description": "Pares de asesores que comparten un mismo client_global_id en ultimos N dias.",
        "required_params": ["min_shared", "last_days"],
        "optional_params": [],
        "param_validators": {
            "min_shared": _is_int_range(2, 50),
            "last_days": _is_int_range(1, 365),
        },
        "cypher_template": """
        MATCH (l1:Lead), (l2:Lead)
        WHERE l1.client_global_id = l2.client_global_id
          AND l1.client_global_id IS NOT NULL
          AND l1.assigned_to IS NOT NULL
          AND l2.assigned_to IS NOT NULL
          AND l1.assigned_to < l2.assigned_to
        WITH l1.assigned_to AS asesor_a, l2.assigned_to AS asesor_b,
             count(DISTINCT l1.client_global_id) AS shared_clients
        WHERE shared_clients >= $min_shared
        RETURN asesor_a, asesor_b, shared_clients
        ORDER BY shared_clients DESC
        LIMIT 100
        """,
    },

    "proyectos_huerfanos": {
        "description": "Proyectos sin VIEWED en N dias y sin INTERESTED_IN en M dias.",
        "required_params": ["no_views_days", "no_leads_days"],
        "optional_params": [],
        "param_validators": {
            "no_views_days": _is_int_range(1, 365),
            "no_leads_days": _is_int_range(1, 365),
        },
        "cypher_template": """
        MATCH (p:Project)
        OPTIONAL MATCH (p)<-[v:VIEWED]-(:BehavioralSession)
        WITH p, max(v.last_seen) AS last_view
        OPTIONAL MATCH (p)<-[i:INTERESTED_IN]-(:Lead)
        WITH p, last_view, max(i.last_seen) AS last_lead
        OPTIONAL MATCH (p)-[:OWNED_BY]->(d:DevOrg)
        WITH p, d, last_view, last_lead
        WHERE last_view IS NULL OR last_lead IS NULL
        RETURN p.id AS project_id, p.name AS name,
               d.id AS dev_org_id,
               last_view, last_lead
        ORDER BY p.name ASC
        LIMIT 200
        """,
    },
}


def list_templates() -> List[Dict[str, Any]]:
    """Retorna metadata de plantillas (sin Cypher) para UI/docs."""
    return [
        {
            "key": k,
            "description": v["description"],
            "required_params": v["required_params"],
            "optional_params": v.get("optional_params", []),
        }
        for k, v in TEMPLATES.items()
    ]


def validate_params(template_key: str, params: Dict[str, Any]):
    """Valida que required params esten presentes y pasen validators.

    Retorna (ok: bool, errors: List[str], normalized_params: Dict).
    """
    if template_key not in TEMPLATES:
        return False, [f"Template no encontrado: {template_key}"], {}

    tpl = TEMPLATES[template_key]
    required = tpl["required_params"]
    optional = tpl.get("optional_params", [])
    validators = tpl.get("param_validators", {})

    errors: List[str] = []
    normalized: Dict[str, Any] = {}

    for name in required:
        if name not in params or params[name] in (None, ""):
            errors.append(f"Falta param requerido: {name}")
            continue
        val = params[name]
        chk = validators.get(name)
        if chk and not chk(val):
            errors.append(f"Param invalido: {name}={val!r}")
            continue
        normalized[name] = val

    for name in optional:
        val = params.get(name)
        if val in (None, ""):
            normalized[name] = None
            continue
        chk = validators.get(name)
        if chk and not chk(val):
            errors.append(f"Param opcional invalido: {name}={val!r}")
            continue
        normalized[name] = val

    return (len(errors) == 0, errors, normalized)


def get_cypher(template_key: str) -> str:
    if template_key not in TEMPLATES:
        raise KeyError(template_key)
    return TEMPLATES[template_key]["cypher_template"]
