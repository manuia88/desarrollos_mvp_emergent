"""
market_4s_facts.py — COMPILADOR DE ÁTOMOS del dato 4S (macro→nano, sin resúmenes).

Doctrina (decisión founder 2026-07-12): cada número de los 4 estudios se guarda como un HECHO
atómico con TODAS sus dimensiones pegadas — estudio · subzona · tema · pregunta · opción ·
corte (etapa de vida / intención / subzona / mención) · valor · unidad · página fuente.
Así el mismo dato responde en macro (comparar zonas), micro (una pregunta en una zona) y
nano (una opción para una etapa de vida específica). Es la filosofía del Cubo aplicada al 4S:
átomo → cubo → lentes. Superadmin-only (los endpoints viven bajo /api/superadmin).

Fuente: data_sources/market_4s_granular_2026.json (compacto) → colección db.facts_4s (explotado).
FAIL-OPEN e idempotente. Cero costo de API.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.market_4s_facts")

FUENTE = "4s_granular_2026"
_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data_sources", "market_4s_granular_2026.json")

# temas cuyo primer nivel es una SUBZONA (no una pregunta)
_TEMAS_SUBZONA = {"oferta_subzonas", "zonas_influencia_detalle"}
# temas cuyo primer nivel es una OPCIÓN (segmento) y el segundo la métrica
_TEMAS_OPCION_METRICA = {"reventa_por_segmento", "avaluos_por_segmento"}
# sufijos que indican la dimensión del corte anidado
_CORTE_POR_SUFIJO = (("_x_etapa_vida", "etapa_vida"), ("_x_intencion", "intencion"),
                     ("_por_intencion", "intencion"), ("_x_presupuesto", "presupuesto"),
                     ("_por_subzona", "subzona_encuesta"))


def _unidad(pregunta: str, opcion: str = "") -> str:
    p = f"{pregunta} {opcion}"
    if "pct" in p or "split" in p:
        return "pct"
    if any(k in p for k in ("precio", "mxn", "presupuesto", "avaluo")):
        return "mxn"
    if "m2" in p:
        return "m2"
    return "num"


def _es_escalar(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _es_rango(v: Any) -> bool:
    return isinstance(v, list) and len(v) == 2 and all(_es_escalar(x) for x in v)


def _fact(estudio: str, tema: str, pregunta: str, opcion: str, valor=None, rango=None,
          corte: Optional[Dict[str, str]] = None, subzona: Optional[str] = None,
          pagina: Optional[int] = None, nota: Optional[str] = None) -> Dict[str, Any]:
    return {
        "fuente": FUENTE, "es_estimado": False,
        "estudio": estudio, "subzona": subzona,
        "tema": tema, "pregunta": pregunta, "opcion": str(opcion),
        "corte": corte or {},
        "valor": valor, "rango": rango,
        "unidad": _unidad(pregunta, str(opcion)),
        "pagina": pagina, "nota": nota,
    }


def _corte_dim(pregunta: str) -> Optional[str]:
    for suf, dim in _CORTE_POR_SUFIJO:
        if suf in pregunta:
            return dim
    return None


def compilar_facts(data: Optional[Dict[str, Any]] = None, path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Explota el JSON granular en hechos atómicos. Puro (sin DB) → testeable."""
    if data is None:
        with open(path or _DEFAULT_PATH) as f:
            data = json.load(f)
    facts: List[Dict[str, Any]] = []
    for estudio, temas in data.items():
        if estudio.startswith("_") or not isinstance(temas, dict):
            continue
        for tema, cuerpo in temas.items():
            if tema.startswith("_"):
                continue
            _compila_tema(facts, estudio, tema, cuerpo)
    return facts


def _compila_tema(facts: List, estudio: str, tema: str, cuerpo: Any, subzona: Optional[str] = None) -> None:
    if _es_escalar(cuerpo):
        facts.append(_fact(estudio, tema, tema, "total", valor=cuerpo, subzona=subzona))
        return
    if not isinstance(cuerpo, dict):
        return
    pagina = cuerpo.get("_pagina")
    nota = cuerpo.get("_nota")

    # tema con subzonas como primer nivel (oferta por subzona, etc.)
    if tema in _TEMAS_SUBZONA:
        for sz, metricas in cuerpo.items():
            if sz.startswith("_") or not isinstance(metricas, dict):
                continue
            for m, v in metricas.items():
                if m.startswith("_"):
                    continue
                if isinstance(v, dict):   # p.ej. tenencia: {propia, renta, otra}
                    for op, vv in v.items():
                        if _es_escalar(vv):
                            facts.append(_fact(estudio, tema, m, op, valor=vv, subzona=sz, pagina=pagina))
                elif _es_escalar(v):
                    facts.append(_fact(estudio, tema, m, "total", valor=v, subzona=sz, pagina=pagina))
        return

    # tema con opción (segmento) → métricas
    if tema in _TEMAS_OPCION_METRICA:
        for seg, metricas in cuerpo.items():
            if seg.startswith("_") or not isinstance(metricas, dict):
                continue
            for m, v in metricas.items():
                if _es_escalar(v):
                    facts.append(_fact(estudio, tema, m, seg, valor=v, pagina=pagina))
        return

    for pregunta, v in cuerpo.items():
        if pregunta.startswith("_"):
            continue
        if _es_escalar(v):
            facts.append(_fact(estudio, tema, pregunta, "total", valor=v, pagina=pagina, nota=nota))
        elif _es_rango(v):
            facts.append(_fact(estudio, tema, pregunta, "total", rango=v, pagina=pagina))
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):   # p.ej. eprav.segmentos
                    op = item.get("segmento") or item.get("nse") or "item"
                    for m, vv in item.items():
                        if _es_escalar(vv):
                            facts.append(_fact(estudio, tema, f"{pregunta}.{m}", op, valor=vv, pagina=pagina))
                elif isinstance(item, str):
                    facts.append(_fact(estudio, tema, pregunta, item, valor=None, pagina=pagina, nota="recomendacion"))
        elif isinstance(v, dict):
            dim = _corte_dim(pregunta)
            por_subzona = v.pop("_por_subzona", False) if isinstance(v, dict) else False
            pag2 = v.get("_pagina") or pagina
            for opcion, vv in v.items():
                if str(opcion).startswith("_"):
                    continue
                if _es_escalar(vv):
                    facts.append(_fact(estudio, tema, pregunta, opcion, valor=vv, pagina=pag2))
                elif _es_rango(vv):
                    facts.append(_fact(estudio, tema, pregunta, opcion, rango=vv, pagina=pag2))
                elif isinstance(vv, dict):
                    # nivel nano: {opcion: {corte: valor}} — dim del corte por sufijo,
                    # subzona de encuesta, o dimensión genérica
                    for k2, v2 in vv.items():
                        if str(k2).startswith("_") or not (_es_escalar(v2) or _es_rango(v2)):
                            continue
                        if por_subzona or dim == "subzona_encuesta":
                            corte = {"subzona_encuesta": str(opcion)}
                            f = _fact(estudio, tema, pregunta, k2, corte=corte, pagina=pag2,
                                      valor=v2 if _es_escalar(v2) else None,
                                      rango=v2 if _es_rango(v2) else None)
                        else:
                            corte = {dim or "dimension": str(k2)}
                            f = _fact(estudio, tema, pregunta, opcion, corte=corte, pagina=pag2,
                                      valor=v2 if _es_escalar(v2) else None,
                                      rango=v2 if _es_rango(v2) else None)
                        facts.append(f)


def _clave(f: Dict[str, Any]) -> Dict[str, Any]:
    """Clave natural del hecho (idempotencia del upsert)."""
    return {"fuente": f["fuente"], "estudio": f["estudio"], "subzona": f["subzona"],
            "tema": f["tema"], "pregunta": f["pregunta"], "opcion": f["opcion"],
            "corte_key": "|".join(f"{k}={v}" for k, v in sorted((f.get("corte") or {}).items()))}


async def load_facts_4s(db, path: Optional[str] = None) -> Dict[str, Any]:
    """Compila y carga los átomos a db.facts_4s (idempotente, fail-open en índices)."""
    facts = compilar_facts(path=path)
    n = 0
    for f in facts:
        key = _clave(f)
        await db.facts_4s.update_one(key, {"$set": {**f, **key}}, upsert=True)
        n += 1
    try:
        await db.facts_4s.create_index("estudio")
        await db.facts_4s.create_index("tema")
        await db.facts_4s.create_index("pregunta")
    except Exception as e:
        log.warning("[facts_4s] index fail-open: %s", e)
    resumen = {"facts": n, "estudios": len({f['estudio'] for f in facts}),
               "temas": len({f['tema'] for f in facts}),
               "preguntas": len({(f['estudio'], f['tema'], f['pregunta']) for f in facts}),
               "fuente": FUENTE}
    log.info("[facts_4s] cargado: %s", resumen)
    return resumen
