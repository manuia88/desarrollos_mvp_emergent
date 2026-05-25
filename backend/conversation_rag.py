"""W7.AS.3.B — Conversation RAG sobre W5.12 Knowledge Graph.

Módulo puro importable por conversation_engine.py. NO crea endpoints · NO UI.

Provee:
  - get_context(question, lead_id, tenant_id) -> str (async)
        Recupera contexto relevante del Knowledge Graph (W5.12) para inyectar
        en el system prompt del broker IA. Parte del nodo Lead, recorre sus
        relaciones (INTERESTED_IN / VIEWED / REPRESENTS / LOCATED_IN ...) y
        rankea los top-5 nodos por solapamiento de keywords con la `question`.

FAIL-OPEN (regla núcleo): si el KG está vacío, no disponible, o cualquier
excepción ocurre → retorna "" sin crashear. Nunca propaga errores al engine.

Convención KG (knowledge_graph_engine): Cypher hardcodeado/parametrizado para
operaciones internas (este módulo NO es ruta superadmin → no requiere template
registry). Driver async via KGDriver singleton.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.conversation_rag")

# Top-N nodos a inyectar en el contexto
_TOP_N = 5

# Etiquetas legibles ES-MX por tipo de nodo KG
_NODE_LABELS_ES: Dict[str, str] = {
    "Project": "Proyecto",
    "Unit": "Unidad",
    "DevOrg": "Desarrolladora",
    "Zone": "Zona",
    "Comparable": "Comparable",
    "Lead": "Prospecto",
    "BehavioralSession": "Sesión",
    "IEScore": "Score IE",
}

# Campos preferidos para describir un nodo (orden de prioridad)
_NAME_FIELDS = ("name", "title", "project_name", "zone_name", "org_name",
                "label", "slug", "unit_code", "lead_name")

# Stopwords es-MX mínimas para tokenizar la pregunta
_STOPWORDS = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
    "y", "o", "que", "en", "con", "por", "para", "es", "son", "me", "te", "se",
    "mi", "tu", "su", "lo", "le", "como", "cuanto", "cuánto", "cual", "cuál",
    "donde", "dónde", "hay", "tiene", "tienes", "quiero", "busco", "sobre",
}


def _tokenize(text: str) -> List[str]:
    """Tokeniza a palabras minúsculas ≥3 chars sin stopwords."""
    if not text:
        return []
    words = re.findall(r"[a-záéíóúñü0-9]+", text.lower())
    return [w for w in words if len(w) >= 3 and w not in _STOPWORDS]


def _node_name(props: Dict[str, Any], labels: List[str]) -> str:
    """Mejor nombre legible para un nodo."""
    for f in _NAME_FIELDS:
        v = props.get(f)
        if v:
            return str(v)
    # Fallback: primer id-like field
    for k in ("project_id", "unit_id", "zone_id", "org_id", "lead_id", "id"):
        if props.get(k):
            return str(props[k])
    return labels[0] if labels else "nodo"


def _node_blob(props: Dict[str, Any]) -> str:
    """Concatena valores string del nodo para matching de keywords."""
    parts: List[str] = []
    for v in props.values():
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, (int, float)):
            parts.append(str(v))
    return " ".join(parts)


def _score_node(q_tokens: List[str], props: Dict[str, Any]) -> int:
    """Solapamiento de keywords entre pregunta y blob del nodo."""
    if not q_tokens:
        return 0
    blob = _node_blob(props).lower()
    return sum(1 for t in q_tokens if t in blob)


def _summarize_node(labels: List[str], props: Dict[str, Any], rel: Optional[str]) -> str:
    """Una línea: '- Proyecto «X» (INTERESTED_IN) · price=..., zone=...'."""
    label = labels[0] if labels else "Nodo"
    label_es = _NODE_LABELS_ES.get(label, label)
    name = _node_name(props, labels)
    facts: List[str] = []
    for k in ("price", "price_mxn", "rooms", "m2", "zone_name", "tier",
              "score", "status", "absorption", "delta_pct"):
        if k in props and props[k] not in (None, ""):
            facts.append(f"{k}={props[k]}")
    fact_str = (" · " + ", ".join(facts[:4])) if facts else ""
    rel_str = f" ({rel})" if rel else ""
    return f"- {label_es} «{name}»{rel_str}{fact_str}"


# Cypher hardcodeado parametrizado: parte del Lead y trae nodos vecinos a 1 salto.
# Scoping por tenant via lead (los nodos del grafo cuelgan del lead del tenant).
_CYPHER_LEAD_CONTEXT = """
MATCH (l:Lead {lead_id: $lead_id})
OPTIONAL MATCH (l)-[r]-(n)
WHERE n IS NOT NULL
RETURN labels(n) AS labels, properties(n) AS props, type(r) AS rel
LIMIT 40
"""

# Fallback cuando no hay lead_id: nodos de proyectos/zonas del tenant.
_CYPHER_TENANT_CONTEXT = """
MATCH (n)
WHERE (n:Project OR n:Zone OR n:Unit) AND n.tenant_id = $tenant_id
RETURN labels(n) AS labels, properties(n) AS props, NULL AS rel
LIMIT 40
"""


async def get_context(question: str, lead_id: Optional[str], tenant_id: Optional[str]) -> str:
    """Recupera contexto del Knowledge Graph para el prospecto / pregunta dada.

    Args:
        question: pregunta/mensaje del usuario (para rankear relevancia).
        lead_id: id del prospecto (raíz del subgrafo). Si None/"" usa tenant.
        tenant_id: org/tenant para scoping.

    Returns:
        Bloque de contexto en texto plano (≤ top-5 nodos), o "" si KG vacío /
        no disponible / cualquier error (FAIL-OPEN).
    """
    try:
        # Import perezoso: mantiene este módulo importable aunque el KG falle.
        from knowledge_graph_engine import KGDriver, KG_AVAILABLE

        if not KG_AVAILABLE:
            return ""

        drv = await KGDriver.get()
        if getattr(drv, "_driver", None) is None:
            return ""

        rows: List[Dict[str, Any]] = []
        if lead_id:
            rows = await drv.run(_CYPHER_LEAD_CONTEXT, {"lead_id": lead_id}, retries=1)
        if not rows and tenant_id:
            rows = await drv.run(_CYPHER_TENANT_CONTEXT, {"tenant_id": tenant_id}, retries=1)

        if not rows:
            return ""

        q_tokens = _tokenize(question)

        # Rankear por relevancia (keyword overlap), desempate por orden de llegada.
        ranked: List[Tuple[int, int, Dict[str, Any]]] = []
        for idx, row in enumerate(rows):
            props = row.get("props") or {}
            if not isinstance(props, dict) or not props:
                continue
            labels = row.get("labels") or []
            score = _score_node(q_tokens, props)
            ranked.append((score, -idx, {"labels": labels, "props": props,
                                         "rel": row.get("rel")}))

        if not ranked:
            return ""

        ranked.sort(key=lambda x: (x[0], x[1]), reverse=True)
        top = ranked[:_TOP_N]

        lines = [_summarize_node(item["labels"], item["props"], item["rel"])
                 for _, _, item in top]
        header = "Contexto del Knowledge Graph (datos verificados del prospecto):"
        return header + "\n" + "\n".join(lines)

    except Exception as exc:  # FAIL-OPEN total
        log.debug(f"[conversation_rag] get_context fail-open: {exc}")
        return ""
