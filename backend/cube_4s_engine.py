"""
cube_4s_engine.py — LENTES sobre los átomos 4S (macro → micro → nano). Superadmin-only.

Cuatro lentes sobre db.facts_4s (2,200+ hechos atómicos de los 4 estudios):
  · catalogo    — el menú: temas y preguntas disponibles con conteos (para navegar el cubo).
  · corte       — micro: filtra por estudio/tema/pregunta/opcion/subzona/corte → los átomos exactos.
  · comparar    — macro: la MISMA pregunta pivoteada entre los 4 estudios (dónde difieren las zonas).
  · nano        — el drill al átomo: todo lo que sabemos de una etapa de vida (o cualquier corte) en una zona.

FAIL-OPEN: sin átomos cargados devuelve vacío honesto (es_estimado=True), nunca inventa.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.cube_4s")

_MAX = 500   # tope sano de átomos por respuesta


async def _fetch(db, q: Dict[str, Any], limit: int = _MAX) -> List[Dict[str, Any]]:
    try:
        out = []
        async for f in db.facts_4s.find(q, {"_id": 0}):
            out.append(f)
            if len(out) >= limit:
                break
        return out
    except Exception as e:
        log.warning("[cube_4s] fetch fail-open: %s", e)
        return []


async def catalogo(db) -> Dict[str, Any]:
    """El menú del cubo: por estudio → temas → preguntas con nº de átomos."""
    facts = await _fetch(db, {}, limit=10000)
    arbol: Dict[str, Dict[str, Dict[str, int]]] = {}
    for f in facts:
        arbol.setdefault(f["estudio"], {}).setdefault(f["tema"], {})
        arbol[f["estudio"]][f["tema"]][f["pregunta"]] = arbol[f["estudio"]][f["tema"]].get(f["pregunta"], 0) + 1
    return {
        "n_atomos": len(facts),
        "es_estimado": not bool(facts),
        "estudios": [{
            "estudio": est,
            "n_atomos": sum(sum(p.values()) for p in temas.values()),
            "temas": [{"tema": t, "preguntas": [{"pregunta": p, "n": n} for p, n in sorted(ps.items())]}
                      for t, ps in sorted(temas.items())],
        } for est, temas in sorted(arbol.items())],
    }


async def corte(db, *, estudio: Optional[str] = None, tema: Optional[str] = None,
                pregunta: Optional[str] = None, opcion: Optional[str] = None,
                subzona: Optional[str] = None, corte_dim: Optional[str] = None,
                corte_valor: Optional[str] = None) -> Dict[str, Any]:
    """Micro: los átomos exactos de un filtro. corte_dim/corte_valor filtran la dimensión nano."""
    q: Dict[str, Any] = {}
    if estudio:
        q["estudio"] = estudio
    if tema:
        q["tema"] = tema
    if pregunta:
        q["pregunta"] = pregunta
    if opcion:
        q["opcion"] = opcion
    if subzona:
        q["subzona"] = subzona
    facts = await _fetch(db, q)
    if corte_dim:
        facts = [f for f in facts if (f.get("corte") or {}).get(corte_dim) is not None
                 and (corte_valor is None or str((f.get("corte") or {}).get(corte_dim)) == str(corte_valor))]
    facts.sort(key=lambda f: -(f.get("valor") if isinstance(f.get("valor"), (int, float)) else -1))
    return {"n": len(facts), "es_estimado": not bool(facts), "atomos": facts}


async def comparar(db, *, tema: str, pregunta: str) -> Dict[str, Any]:
    """Macro: la misma pregunta pivoteada entre estudios → dónde difieren las zonas."""
    facts = await _fetch(db, {"tema": tema, "pregunta": pregunta}, limit=2000)
    base = [f for f in facts if not f.get("corte")]        # el pivote usa el total (sin corte nano)
    pivote: Dict[str, Dict[str, Any]] = {}
    estudios = sorted({f["estudio"] for f in base})
    for f in base:
        v = f.get("valor") if f.get("valor") is not None else f.get("rango")
        pivote.setdefault(f["opcion"], {})[f["estudio"]] = v
    filas = [{"opcion": op, **{e: vals.get(e) for e in estudios}} for op, vals in pivote.items()]
    # ordena por el máximo valor entre estudios (lo más relevante arriba)
    filas.sort(key=lambda r: -max((v for k, v in r.items() if k != "opcion" and isinstance(v, (int, float))), default=-1))

    # lectura: la opción dominante por estudio (dónde el mercado DIFIERE)
    top_por_estudio = {}
    for e in estudios:
        cand = [(r["opcion"], r.get(e)) for r in filas if isinstance(r.get(e), (int, float))]
        if cand:
            top_por_estudio[e] = max(cand, key=lambda x: x[1])
    difieren = len({v[0] for v in top_por_estudio.values()}) > 1
    return {
        "tema": tema, "pregunta": pregunta, "estudios": estudios, "filas": filas,
        "n_atomos": len(base), "es_estimado": not bool(base),
        "top_por_estudio": {e: {"opcion": o, "valor": v} for e, (o, v) in top_por_estudio.items()},
        "zonas_difieren": difieren,
        "lectura": ("Las zonas NO piden lo mismo: " +
                    " · ".join(f"{e}: {o} ({v})" for e, (o, v) in top_por_estudio.items())
                    if difieren else "Las 4 zonas coinciden en la opción dominante.") if base else "Sin átomos para esta pregunta.",
    }


async def nano(db, *, estudio: str, corte_dim: str = "etapa_vida",
               corte_valor: str = "") -> Dict[str, Any]:
    """Nano: TODO lo que el estudio sabe de un corte (p.ej. una etapa de vida) en una zona."""
    facts = await _fetch(db, {"estudio": estudio}, limit=5000)
    sel = [f for f in facts if str((f.get("corte") or {}).get(corte_dim, "")) == str(corte_valor)]
    sel.sort(key=lambda f: -(f.get("valor") if isinstance(f.get("valor"), (int, float)) else -1))
    por_pregunta: Dict[str, List[Dict[str, Any]]] = {}
    for f in sel:
        por_pregunta.setdefault(f"{f['tema']}.{f['pregunta']}", []).append(
            {"opcion": f["opcion"], "valor": f.get("valor"), "rango": f.get("rango"),
             "unidad": f["unidad"], "pagina": f.get("pagina")})
    top = sel[0] if sel else None
    return {
        "estudio": estudio, "corte": {corte_dim: corte_valor},
        "n_atomos": len(sel), "es_estimado": not bool(sel),
        "por_pregunta": por_pregunta,
        "lectura": (f"Para {corte_valor} en {estudio}: lo más fuerte es "
                    f"{top['pregunta']} → {top['opcion']} ({top.get('valor')}{'%' if top['unidad']=='pct' else ''})."
                    if top else f"Sin átomos con {corte_dim}={corte_valor} en {estudio}."),
    }


async def dimensiones_nano(db) -> Dict[str, Any]:
    """Qué cortes nano existen (para poblar los selectores del explorador)."""
    facts = await _fetch(db, {}, limit=10000)
    dims: Dict[str, set] = {}
    for f in facts:
        for k, v in (f.get("corte") or {}).items():
            dims.setdefault(k, set()).add(str(v))
    return {k: sorted(v) for k, v in dims.items()}
