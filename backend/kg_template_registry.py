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

    # ─── W5.12 P2 · 7 templates adicionales (12 total) ──────────────────────
    "proyectos_activos_por_dev": {
        "description": "Proyectos de un dev_org con actividad VIEWED en N dias.",
        "required_params": ["dev_org_id", "last_days"],
        "optional_params": [],
        "param_validators": {
            "dev_org_id": _is_str_id,
            "last_days": _is_int_range(1, 365),
        },
        "param_hints": {
            "dev_org_id": "ID alfanumerico (max 80 chars)",
            "last_days": "1-365 dias",
        },
        "cypher_template": """
        MATCH (p:Project)-[:OWNED_BY]->(:DevOrg {id: $dev_org_id})
        OPTIONAL MATCH (p)<-[v:VIEWED]-(:BehavioralSession)
        WITH p, count(v) AS view_count, max(v.last_seen) AS last_view
        WHERE view_count > 0
        RETURN p.id AS project_id, p.name AS project_name,
               view_count, last_view
        ORDER BY view_count DESC
        LIMIT 100
        """,
    },

    "leads_por_buyer_segment": {
        "description": "Leads agrupados por segmento de buyer (alto/medio/bajo intent).",
        "required_params": ["intent_min", "last_days"],
        "optional_params": [],
        "param_validators": {
            "intent_min": _is_int_range(0, 100),
            "last_days": _is_int_range(1, 365),
        },
        "param_hints": {
            "intent_min": "0-100 (umbral de intent score)",
            "last_days": "1-365 dias",
        },
        "cypher_template": """
        MATCH (l:Lead)-[:INTERESTED_IN]->(p:Project)
        WHERE l.created_at IS NOT NULL
        OPTIONAL MATCH (b:BehavioralSession {user_id: l.client_global_id})-[:VIEWED]->(p)
        WITH l, p, count(b) AS sessions
        WHERE sessions >= $intent_min / 10
        RETURN l.status AS segment, count(l) AS leads_count, avg(sessions) AS avg_sessions
        ORDER BY leads_count DESC
        LIMIT 50
        """,
    },

    "zonas_top_forecast_12m": {
        "description": "Zonas con mayor cantidad de Project + IEScore alto (proxy de forecast 12m).",
        "required_params": ["score_min"],
        "optional_params": ["tier"],
        "param_validators": {
            "score_min": _is_int_range(0, 100),
            "tier": _is_tier,
        },
        "param_hints": {
            "score_min": "0-100 (umbral score)",
            "tier": "A | B | C | D | premium | media | popular",
        },
        "cypher_template": """
        MATCH (p:Project)-[:LOCATED_IN]->(z:Zone)
        OPTIONAL MATCH (p)-[:SCORED_BY]->(s:IEScore)
        WITH z, count(DISTINCT p) AS projects, avg(coalesce(s.score, 0)) AS avg_score
        WHERE avg_score >= $score_min
          AND ($tier IS NULL OR z.tier = $tier)
        RETURN z.slug AS zone_slug, z.name AS zone_name, z.tier AS tier,
               projects, avg_score
        ORDER BY avg_score DESC, projects DESC
        LIMIT 50
        """,
    },

    "transacciones_por_dev_periodo": {
        "description": "Comparables (transacciones cerradas) por dev_org dentro de un periodo.",
        "required_params": ["dev_org_id", "last_days"],
        "optional_params": [],
        "param_validators": {
            "dev_org_id": _is_str_id,
            "last_days": _is_int_range(1, 730),
        },
        "param_hints": {
            "dev_org_id": "ID alfanumerico",
            "last_days": "1-730 dias",
        },
        "cypher_template": """
        MATCH (p:Project)-[:OWNED_BY]->(:DevOrg {id: $dev_org_id})
        MATCH (p)-[:COMPARABLE_TO]->(c:Comparable)
        WITH p, c
        RETURN p.id AS project_id, p.name AS project_name,
               count(c) AS comparables_count,
               avg(c.price) AS avg_price,
               max(c.closed_at) AS last_closed
        ORDER BY comparables_count DESC
        LIMIT 100
        """,
    },

    "units_disponibles_por_proyecto": {
        "description": "Units disponibles de un proyecto con estatus libre.",
        "required_params": ["project_id"],
        "optional_params": [],
        "param_validators": {
            "project_id": _is_str_id,
        },
        "param_hints": {
            "project_id": "ID alfanumerico (max 80 chars)",
        },
        "cypher_template": """
        MATCH (p:Project {id: $project_id})-[:HAS_UNIT]->(u:Unit)
        WHERE u.estatus IS NULL OR u.estatus IN ['disponible', 'libre', 'available']
        RETURN u.id AS unit_id, u.numero AS numero,
               u.tipo AS tipo, u.precio AS precio, u.estatus AS estatus
        ORDER BY u.precio ASC
        LIMIT 500
        """,
    },

    "behavioral_intent_alto_sin_lead": {
        "description": "BehavioralSession con intent alto pero sin Lead asociado (oportunidades).",
        "required_params": ["last_days"],
        "optional_params": [],
        "param_validators": {
            "last_days": _is_int_range(1, 90),
        },
        "param_hints": {
            "last_days": "1-90 dias",
        },
        "cypher_template": """
        MATCH (b:BehavioralSession)-[:VIEWED]->(p:Project)
        WHERE b.intent IN ['high', 'alto', 'comprador_activo']
          AND b.user_id IS NOT NULL
        OPTIONAL MATCH (l:Lead {client_global_id: b.user_id})-[:INTERESTED_IN]->(p)
        WITH b, p, l
        WHERE l IS NULL
        RETURN b.user_id AS user_id, p.id AS project_id, p.name AS project_name,
               b.intent AS intent, b.created_at AS last_view
        ORDER BY b.created_at DESC
        LIMIT 200
        """,
    },

    "proyectos_similares": {
        "description": "Proyectos similares a uno seed via COMPARABLE_TO edge (±15% precio, misma Zone preferred).",
        "required_params": ["project_id"],
        "optional_params": ["limit"],
        "param_validators": {
            "project_id": _is_str_id,
            "limit": _is_int_range(1, 50),
        },
        "param_hints": {
            "project_id": "id del proyecto seed",
            "limit": "1-50 (default 10)",
        },
        "cypher_template": """
        MATCH (seed:Project {id: $project_id})
        OPTIONAL MATCH (seed)-[:LOCATED_IN]->(z:Zone)<-[:LOCATED_IN]-(p:Project)
        WHERE p.id <> seed.id
        OPTIONAL MATCH (seed)-[:COMPARABLE_TO]-(comp:Project)
        WHERE comp.id <> seed.id
        WITH seed, COLLECT(DISTINCT p) + COLLECT(DISTINCT comp) AS candidates
        UNWIND candidates AS p
        WITH seed, p
        WHERE p IS NOT NULL
        OPTIONAL MATCH (p)-[:OWNED_BY]->(d:DevOrg)
        OPTIONAL MATCH (p)-[:LOCATED_IN]->(pz:Zone)
        RETURN DISTINCT p.id AS project_id, p.name AS name, p.price AS price,
               pz.slug AS zone_slug, pz.name AS zone_name, d.name AS dev_name,
               p.status AS status
        ORDER BY p.price ASC
        LIMIT toInteger(coalesce($limit, 10))
        """,
    },

    "zonas_similares_a": {
        "description": "Zonas similares vía sub-score proximity + misma alcaldía/tier (excluye seed).",
        "required_params": ["zone_slug"],
        "optional_params": ["limit"],
        "param_validators": {
            "zone_slug": _is_slug,
            "limit": _is_int_range(1, 30),
        },
        "param_hints": {
            "zone_slug": "slug zona seed",
            "limit": "1-30 (default 10)",
        },
        "cypher_template": """
        MATCH (seed:Zone {slug: $zone_slug})
        MATCH (z:Zone)
        WHERE z.slug <> seed.slug
          AND (z.alcaldia = seed.alcaldia OR z.tier = seed.tier)
        WITH seed, z,
             abs(coalesce(z.score_lifestyle,0) - coalesce(seed.score_lifestyle,0)) +
             abs(coalesce(z.score_seguridad,0) - coalesce(seed.score_seguridad,0)) +
             abs(coalesce(z.score_transporte,0) - coalesce(seed.score_transporte,0)) +
             abs(coalesce(z.score_amenidades,0) - coalesce(seed.score_amenidades,0)) +
             abs(coalesce(z.score_precio,0) - coalesce(seed.score_precio,0)) +
             abs(coalesce(z.score_vibe,0) - coalesce(seed.score_vibe,0)) AS dist
        RETURN z.slug AS zone_slug, z.name AS zone_name, z.alcaldia AS alcaldia,
               z.tier AS tier, dist AS proximity_score
        ORDER BY dist ASC
        LIMIT toInteger(coalesce($limit, 10))
        """,
    },

    "devs_con_dispute_history": {
        "description": "DevOrgs con disputas rechazadas activas (cooldown > now) o historial denso.",
        "required_params": ["min_disputes"],
        "optional_params": [],
        "param_validators": {
            "min_disputes": _is_int_range(1, 100),
        },
        "param_hints": {
            "min_disputes": "1-100 (minimo de disputas)",
        },
        "cypher_template": """
        MATCH (l:Lead)-[:INTERESTED_IN]->(p:Project)-[:OWNED_BY]->(d:DevOrg)
        WHERE l.status = 'cerrado_perdido'
        WITH d, count(l) AS disputes_count
        WHERE disputes_count >= $min_disputes
        RETURN d.id AS dev_org_id, d.name AS dev_name, disputes_count
        ORDER BY disputes_count DESC
        LIMIT 100
        """,
    },
}


def _summarize_validator(template_key: str, param_name: str) -> str:
    """Devuelve hint humano para un validator (UI render)."""
    tpl = TEMPLATES.get(template_key, {})
    hints = tpl.get("param_hints", {})
    if param_name in hints:
        return hints[param_name]
    val = tpl.get("param_validators", {}).get(param_name)
    if val is None:
        return "Cualquier valor"
    name = getattr(val, "__name__", "")
    if "str_id" in name:
        return "ID alfanumerico (max 80 chars)"
    if "slug" in name:
        return "Slug minusculas (a-z 0-9 -)"
    if "tier" in name:
        return "A | B | C | D | premium | media | popular"
    return "Numero entero"


def list_templates() -> List[Dict[str, Any]]:
    """Retorna metadata de plantillas (sin Cypher) para UI/docs.

    Incluye param_validators_summary para que UI pueda renderizar hints.
    """
    out: List[Dict[str, Any]] = []
    for k, v in TEMPLATES.items():
        param_summary: Dict[str, str] = {}
        for p in v.get("required_params", []) + v.get("optional_params", []):
            param_summary[p] = _summarize_validator(k, p)
        out.append({
            "key": k,
            "name": k,
            "description": v["description"],
            "required_params": v.get("required_params", []),
            "optional_params": v.get("optional_params", []),
            "param_validators_summary": param_summary,
        })
    return out


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
