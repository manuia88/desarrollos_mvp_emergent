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


def _median(vals):
    s = sorted(v for v in vals if v is not None)
    if not s:
        return None
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


async def _comps_raw(db):
    try:
        return [c async for c in db.market_comps_4s.find({}, {"_id": 0})]
    except Exception as e:
        log.warning("[4s_bridge] comps_raw fail-open: %s", e)
        return []


async def comps_4s_para_colonia(db, col_names) -> list:
    """Proyectos 4S REALES cuya zona (colonia) cae en el set dado. Para enriquecer el censo de
    absorción con velocidad real. Nombres solo se muestran a superadmin (lo decide el caller)."""
    want = {norm_colonia(n) for n in (col_names or []) if n}
    if not want:
        return []
    return [c for c in await _comps_raw(db) if norm_colonia(c.get("zona") or "") in want]


async def demanda_4s_by_colonia(db) -> Dict[str, Dict[str, Any]]:
    """colonia_norm → demanda REAL agregada del estudio {demanda_3anos, venta_mensual,
    gap_vertical_3anos, inventario_formal, fuente:'4s', estudio}. Reparte el total del estudio
    (suma de segmentos) a cada colonia de influencia. FAIL-OPEN."""
    out: Dict[str, Dict[str, Any]] = {}
    est_seg: Dict[str, Dict[str, Any]] = {}
    try:
        async for z in db.demanda_4s.find({}, {"_id": 0}):
            est = z.get("estudio")
            if not est:
                continue
            e = est_seg.setdefault(est, {"demanda_3anos": 0, "venta_mensual": 0, "gap": 0,
                                         "inventario": 0, "cols": set(), "n_seg": 0})
            e["demanda_3anos"] += int(z.get("demanda_3anos") or 0)
            e["venta_mensual"] += int(z.get("venta_mensual") or 0)
            e["gap"] += int(z.get("gap_vertical_3anos") or 0)
            e["inventario"] += int(z.get("inventario_formal") or 0)
            e["n_seg"] += 1
            e["cols"].update(norm_colonia(x) for x in (z.get("zona_influencia") or []) if x)
    except Exception as e:
        log.warning("[4s_bridge] demanda fail-open: %s", e)
        return {}
    for est, e in est_seg.items():
        for col in e["cols"]:
            prev = out.get(col)
            if prev and prev["n_segmentos"] >= e["n_seg"]:
                continue
            out[col] = {"demanda_3anos": e["demanda_3anos"], "venta_mensual": e["venta_mensual"],
                        "gap_vertical_3anos": e["gap"], "inventario_formal": e["inventario"],
                        "n_segmentos": e["n_seg"], "fuente": "4s", "estudio": est}
    return out


async def precio_m2_4s_by_colonia(db) -> Dict[str, Dict[str, Any]]:
    """colonia_norm → precio/m² REAL de mercado del estudio {precio_m2, n_proyectos, fuente:'4s'}.
    Mediana de los comparables 4S del estudio (precio de LISTA, público por doctrina cube_lens).
    Gate k-anon ≥MIN_CONTRIBUYENTES. FAIL-OPEN."""
    est_cols = await _estudio_colonias(db)
    if not est_cols:
        return {}
    # precios por zona del proyecto
    precios_zona: Dict[str, list] = {}
    for c in await _comps_raw(db):
        z = norm_colonia(c.get("zona") or "")
        p = c.get("precio_m2")
        if z and p:
            precios_zona.setdefault(z, []).append(float(p))
    out: Dict[str, Dict[str, Any]] = {}
    for est, cols in est_cols.items():
        vals = [p for z in cols for p in precios_zona.get(z, [])]
        if len(vals) < MIN_CONTRIBUYENTES:
            continue
        med = _median(vals)
        if not med:
            continue
        for col in cols:
            prev = out.get(col)
            if prev and prev["n_proyectos"] >= len(vals):
                continue
            out[col] = {"precio_m2": round(med), "n_proyectos": len(vals), "fuente": "4s", "estudio": est}
    return out
