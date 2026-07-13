"""
market_4s_bridge.py — PUENTE del dato REAL 4S hacia los motores VIVOS.

El dato 4S (market_comps_4s + demanda_4s) es real pero vive en su propio vocabulario
(estudio × zona_influencia × segmento). Este puente lo traduce a lo que consumen los
motores existentes — absorción de mercado por colonia — para que pasen de 'estimado' a
'real' SIN duplicar lógica ni inventar números.

Doctrina de privacidad (reusa cube_lens / anonymization_engine): la absorción 4S es un
AGREGADO de ≥3 proyectos competidores por estudio (k-anon en la fuente), así que es
publicable como dato de ZONA — nunca revela el ritmo de un desarrollador identificable.
Los estudios con <MIN_CONTRIBUYENTES proyectos se suprimen (no re-identificables).

FAIL-OPEN: sin dato 4S devuelve vacío → los motores siguen en 'estimado' honesto.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Any, Dict, Set

log = logging.getLogger("dmx.market_4s_bridge")

MIN_CONTRIBUYENTES = 3   # mismo umbral k-anon del licensable (cube_lens.MIN_CONTRIBUYENTES)


_STOPWORDS = {"de", "del", "la", "las", "los", "el", "y"}


def norm_colonia(s: str) -> str:
    """Normaliza nombre de colonia para cruzar 4S con el universo, robusto a acentos y
    conectores ('Jardines de Pedregal' ≡ 'Jardines del Pedregal', 'Juárez' ≡ 'Juarez')."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode("ascii").lower()
    toks = [t for t in s.replace(",", " ").split() if t and t not in _STOPWORDS]
    return " ".join(toks)


async def _estudio_colonias(db) -> Dict[str, Set[str]]:
    """{estudio: {colonias de influencia normalizadas}} desde demanda_4s."""
    out: Dict[str, Set[str]] = {}
    try:
        async for z in db.demanda_4s.find({}, {"_id": 0, "estudio": 1, "zona_influencia": 1}):
            est = z.get("estudio")
            cols = {norm_colonia(x) for x in (z.get("zona_influencia") or []) if x}
            if est and cols:
                out.setdefault(est, set()).update(cols)
    except Exception as e:
        log.warning("[4s_bridge] estudio_colonias fail-open: %s", e)
    return out


async def absorcion_4s_by_colonia(db) -> Dict[str, Dict[str, Any]]:
    """colonia_normalizada → {sold, total, fuente:'4s', n_proyectos, estudio}.

    Puentea por GEOGRAFÍA (no por etiqueta de estudio, que puede diferir): agrega los
    proyectos 4S cuya `zona` cae dentro de la zona_influencia de cada estudio de demanda,
    y reparte ese agregado REAL a cada colonia de influencia. Solo estudios con
    ≥MIN_CONTRIBUYENTES proyectos (k-anon en la fuente). FAIL-OPEN."""
    est_cols = await _estudio_colonias(db)
    if not est_cols:
        return {}

    # 1) agrega ventas/inventario reales por la zona (colonia) del proyecto
    por_zona: Dict[str, Dict[str, int]] = {}
    try:
        async for c in db.market_comps_4s.find(
                {}, {"_id": 0, "zona": 1, "unidades_vendidas": 1, "unidades_totales": 1}):
            z = norm_colonia(c.get("zona") or "")
            if not z:
                continue
            a = por_zona.setdefault(z, {"sold": 0, "total": 0, "n": 0})
            a["sold"] += int(c.get("unidades_vendidas") or 0)
            a["total"] += int(c.get("unidades_totales") or 0)
            a["n"] += 1
    except Exception as e:
        log.warning("[4s_bridge] absorcion fail-open: %s", e)
        return {}

    # 2) por estudio: junta los proyectos cuya zona ∈ zona_influencia → pool real de mercado
    out: Dict[str, Dict[str, Any]] = {}
    for est, cols in est_cols.items():
        pool = {"sold": 0, "total": 0, "n": 0}
        for z in cols:
            a = por_zona.get(z)
            if a:
                pool["sold"] += a["sold"]; pool["total"] += a["total"]; pool["n"] += a["n"]
        if pool["total"] <= 0 or pool["n"] < MIN_CONTRIBUYENTES:
            continue   # sin ventas o pocos contribuyentes → se suprime (no re-identificable)
        for col in cols:
            prev = out.get(col)
            if prev and prev["n_proyectos"] >= pool["n"]:
                continue   # si dos estudios tocan la colonia, gana el de mayor muestra
            out[col] = {"sold": pool["sold"], "total": pool["total"], "fuente": "4s",
                        "n_proyectos": pool["n"], "estudio": est}
    return out
