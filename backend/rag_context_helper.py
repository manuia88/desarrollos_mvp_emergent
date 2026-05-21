"""W5.x F2 · Helper unificado para que cualquier engine LLM jale contexto del RAG.

Patrón de uso:

    from rag_context_helper import get_rag_context, get_lead_context
    ctx = await get_rag_context(db, query="lead María Polanco interesada en luxury",
                                scope="lead", tenant_id=..., user_id=..., top_k=5)
    prompt = f"{base_prompt}\\n\\nCONTEXTO RELEVANTE:\\n{ctx}\\n\\nQUERY: {user_query}"

Cero invasión · NO toca prompts existentes · solo provee texto pre-formateado.
Fail-soft: si embeddings/corpus no disponibles → retorna "".

Reconciliación con rag_engine actual:
- Los chunks usan 'scope' (no 'kind'). SCOPE_TO_KINDS mapea conceptos lógicos
  ('lead', 'property', 'external', etc.) → lista de scopes reales en el corpus.
- tenant_id/user_id_owner viven en metadata.* del chunk · semantic_search ya
  acepta filters={'tenant_id': ...} desde F2 Sub-A (match top-level OR metadata).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.rag_context_helper")

# Map concepto lógico → lista de scopes reales del corpus rag_engine.
# 'all' = sin filtro de scope.
SCOPE_TO_KINDS: Dict[str, Optional[List[str]]] = {
    "lead": ["lead", "activity", "conversation"],
    "property": ["development", "property_intake", "resale", "colonia"],
    "external": [
        "external_banxico", "external_inegi",
        "external_atlas", "external_osm", "external_gtfs",
    ],
    "conversation": ["conversation"],
    "doc": ["doc", "extraction"],
    "all": None,
}


async def get_rag_context(
    db,
    query: str,
    scope: str = "all",
    tenant_id: Optional[str] = None,
    user_id_owner: Optional[str] = None,
    entity_id: Optional[str] = None,
    top_k: int = 5,
    max_chars: int = 2000,
) -> str:
    """Retorna top-K chunks como texto pre-formateado para inyectar en prompts.

    Args:
        scope: clave en SCOPE_TO_KINDS · 'all' = sin filtro de scope.
        tenant_id: filtra por tenant (multi-tenant isolation · None = global).
        user_id_owner: filtra por dueño (asesor solo ve sus leads · None = shared).
        entity_id: limita a chunks de una entidad específica.
        top_k: cuántos resultados.
        max_chars: presupuesto de chars del resultado pre-formateado.

    Returns:
        Texto con "- [scope] snippet" por línea, o "" si no hay matches/error.
    """
    if not query or not query.strip():
        return ""
    try:
        from rag_engine import semantic_search
        kinds = SCOPE_TO_KINDS.get(scope)
        filters: Dict[str, Any] = {}
        if tenant_id:
            filters["tenant_id"] = tenant_id
        if user_id_owner:
            filters["user_id_owner"] = user_id_owner

        res = await semantic_search(
            db,
            query,
            top_k=top_k,
            entity_id=entity_id,
            scopes_in=kinds,
            filters=filters or None,
        )
        results = (res or {}).get("results") or []
        if not results:
            return ""

        lines: List[str] = []
        chars_used = 0
        for r in results:
            snippet = (r.get("snippet") or r.get("text") or "")[:200]
            line = f"- [{r.get('scope', 'na')}] {snippet}"
            if chars_used + len(line) + 1 > max_chars:
                break
            lines.append(line)
            chars_used += len(line) + 1
        return "\n".join(lines)
    except Exception as exc:
        log.warning(f"[get_rag_context] failed silent · scope={scope}: {exc}")
        return ""


async def get_lead_context(db, lead_id: str, tenant_id: Optional[str] = None) -> str:
    """Shortcut · todo lo conocido sobre un lead (info, activity, conversaciones)."""
    if not lead_id:
        return ""
    return await get_rag_context(
        db,
        query=f"lead {lead_id} historial actividad",
        scope="lead",
        tenant_id=tenant_id,
        entity_id=lead_id,
        top_k=10,
    )


async def get_property_context(
    db, property_id: str, tenant_id: Optional[str] = None
) -> str:
    """Shortcut · info sobre desarrollo/intake/reventa específico + su colonia."""
    if not property_id:
        return ""
    # Primero busca chunks de la entidad exacta
    res = await get_rag_context(
        db,
        query=f"propiedad {property_id}",
        scope="property",
        tenant_id=tenant_id,
        entity_id=property_id,
        top_k=8,
    )
    return res


async def get_external_context(
    db, zone: Optional[str] = None, topics: Optional[List[str]] = None
) -> str:
    """Shortcut · data macro/zonal externa (Banxico · INEGI · Atlas · OSM · GTFS)."""
    parts: List[str] = []
    if zone:
        parts.append(f"zona {zone}")
    if topics:
        parts.extend([str(t) for t in topics])
    query = " · ".join(parts) if parts else "indicadores económicos zonales"
    return await get_rag_context(db, query=query, scope="external", top_k=8)
