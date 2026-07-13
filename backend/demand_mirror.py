"""
demand_mirror.py — EL ESPEJO demanda↔oferta del genoma (Ola B: B1+B2+B5+B6).

Demanda (átomos de demand_atoms) y oferta (vector_unidad sobre el inventario) hablan el mismo
idioma de dimensiones → este motor los pone frente a frente, en CUALQUIER escala (el territorio
es un parámetro: un set de colonias = colonia, alcaldía, corredor o ciudad — universal).

  · espejo()        — B1: por dimensión×valor: cuántos lo PIDEN vs cuántas unidades lo TIENEN.
  · escasez()       — B2: índice de tensión (demanda/oferta) rankeado + LO INEXISTENTE
                      (demanda con cero oferta → el producto que nadie ofrece → auto-brief) +
                      INVENTARIO CIEGO (oferta que nadie pide).
  · data_negativa() — B5: zonas nunca buscadas pese a tener inventario · unidades invisibles
                      (0 vistas en N días) · fichas vistas sin like.
  · radar_lexico()  — B6: términos emergentes del corpus de búsquedas por mes (la tendencia
                      antes de que exista en catálogos).

UNIVERSALIDAD (regla founder): opera sobre TODAS las dimensiones presentes en los átomos — sin
lista fija. FAIL-OPEN: sin datos devuelve vacío honesto. Superadmin-only en superficie.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.demand_mirror")

_MAX_UNITS = 20000
_MAX_ATOMS = 50000


# ── lado OFERTA: vectores de todas las unidades (semilla + ingeridas) ─────────
async def _oferta_vectores(db, colonias: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    """[{colonia, disponible, vector}] de todo el inventario. Reusa el patrón de absorcion_engine
    (semilla DEVELOPMENTS + db.developments/units vía ingested_reader). FAIL-OPEN por fuente."""
    from demand_genome import vector_unidad
    from market_4s_bridge import norm_colonia
    out: List[Dict[str, Any]] = []

    def _quiere(col: str) -> bool:
        return not colonias or col in colonias

    # 1) semilla (units embebidas)
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            col = norm_colonia(str(d.get("colonia") or ""))
            if not col or not _quiere(col):
                continue
            for u in d.get("units") or []:
                out.append({"colonia": col,
                            "disponible": (u.get("status") == "disponible"),
                            "unit_id": u.get("id"),
                            "vector": vector_unidad(u)})
                if len(out) >= _MAX_UNITS:
                    return out
    except Exception as e:
        log.warning("[mirror] seed fail-open: %s", e)

    # 2) inventario ingerido (db.developments + units normalizadas)
    try:
        from ingested_reader import units_for_dev
        async for d in db.developments.find({}, {"_id": 0, "id": 1, "colonia": 1}):
            col = norm_colonia(str(d.get("colonia") or ""))
            if not col or not _quiere(col):
                continue
            for u in await units_for_dev(db, d.get("id")):
                out.append({"colonia": col,
                            "disponible": (u.get("status") == "disponible"),
                            "unit_id": u.get("id"),
                            "vector": vector_unidad(u)})
                if len(out) >= _MAX_UNITS:
                    return out
    except Exception as e:
        log.warning("[mirror] ingeridos fail-open: %s", e)
    return out


def _llaves_oferta(vector: Dict[str, str]) -> Set[tuple]:
    """Vector de unidad → llaves comparables con la demanda. features 'producto.feature.X=si'
    se traducen a ('producto.feature', 'X') — el MISMO formato del átomo de demanda."""
    llaves = set()
    for k, v in vector.items():
        if k.startswith("producto.feature."):
            llaves.add(("producto.feature", k.rsplit(".", 1)[1]))
        elif k.startswith(("producto.", "finanzas.")):
            llaves.add((k, v))
    return llaves


async def _demanda_conteos(db, colonias: Optional[Set[str]] = None) -> Dict[tuple, int]:
    """{(dimension, valor): n_señales} de demand_atoms — TODAS las dimensiones, sin lista fija."""
    conteos: Dict[tuple, int] = {}
    n = 0
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            k = (a["dimension"], a["valor"])
            conteos[k] = conteos.get(k, 0) + 1
            n += 1
            if n >= _MAX_ATOMS:
                break
    except Exception as e:
        log.warning("[mirror] demanda fail-open: %s", e)
    return conteos


# ── B1 · el espejo ────────────────────────────────────────────────────────────
async def espejo(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    """Por dimensión×valor: demanda (señales) vs oferta disponible (unidades que la tienen)."""
    dem = await _demanda_conteos(db, colonias)
    unidades = await _oferta_vectores(db, colonias)
    ofe: Dict[tuple, int] = {}
    for u in unidades:
        if not u["disponible"]:
            continue
        for k in _llaves_oferta(u["vector"]):
            ofe[k] = ofe.get(k, 0) + 1

    filas = []
    for k in set(dem) | set(ofe):
        dim, val = k
        if dim.startswith(("lexico.", "exclusion.", "busqueda.")):
            continue   # léxico/negativa tienen su propia lente; busqueda.* aún sin espejo de oferta
        d, o = dem.get(k, 0), ofe.get(k, 0)
        filas.append({"dimension": dim, "valor": val, "demanda": d, "oferta_disponible": o,
                      "tension": round(d / o, 2) if o else None,
                      "estado": ("inexistente" if d > 0 and o == 0 else
                                 "ciego" if o > 0 and d == 0 else "espejo")})
    filas.sort(key=lambda f: (-(f["demanda"]), f["dimension"]))
    return {"n_unidades_oferta": len(unidades), "n_llaves": len(filas),
            "es_estimado": not bool(filas), "filas": filas,
            "colonias": sorted(colonias) if colonias else "todas"}


# ── B2 · escasez / lo inexistente / inventario ciego ─────────────────────────
async def escasez(db, colonias: Optional[Set[str]] = None, top: int = 15) -> Dict[str, Any]:
    esp = await espejo(db, colonias)
    filas = esp["filas"]
    con_tension = [f for f in filas if f["tension"] is not None and f["demanda"] > 0]
    con_tension.sort(key=lambda f: -f["tension"])
    inexistente = [f for f in filas if f["estado"] == "inexistente"]
    inexistente.sort(key=lambda f: -f["demanda"])
    ciego = [f for f in filas if f["estado"] == "ciego"]
    ciego.sort(key=lambda f: -f["oferta_disponible"])
    top_t = con_tension[0] if con_tension else None
    return {
        "es_estimado": esp["es_estimado"],
        "tension_top": con_tension[:top],
        "lo_inexistente": inexistente[:top],   # → auto-brief (Ola C4)
        "inventario_ciego": ciego[:top],
        "lectura": (f"Mayor tensión: {top_t['dimension']}={top_t['valor']} "
                    f"({top_t['demanda']} piden / {top_t['oferta_disponible']} disponibles = "
                    f"{top_t['tension']}x). {len(inexistente)} llaves con demanda y CERO oferta.")
                   if top_t else "Sin señal suficiente para medir escasez.",
    }


# ── B5 · data negativa ────────────────────────────────────────────────────────
async def data_negativa(db, dias: int = 30) -> Dict[str, Any]:
    """Lo que NO pasa: zonas con inventario y cero búsquedas · unidades sin una sola vista ·
    devs con vistas pero sin likes (interés que muere)."""
    from market_4s_bridge import norm_colonia
    cutoff = datetime.now(timezone.utc) - timedelta(days=dias)

    # colonias con oferta
    cols_oferta: Dict[str, int] = {}
    for u in await _oferta_vectores(db):
        cols_oferta[u["colonia"]] = cols_oferta.get(u["colonia"], 0) + 1

    # colonias con demanda (átomos)
    cols_demanda: Set[str] = set()
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "colonia": 1}):
            cols_demanda.add(a["colonia"])
    except Exception as e:
        log.warning("[negativa] atoms fail-open: %s", e)

    zonas_ciegas = sorted(
        [{"colonia": c, "unidades": n} for c, n in cols_oferta.items() if c not in cols_demanda],
        key=lambda x: -x["unidades"])

    # vistas y likes por entidad (buyer_signals)
    vistas_unidad: Set[str] = set()
    vistas_dev: Dict[str, int] = {}
    likes_dev: Dict[str, int] = {}
    try:
        async for s in db.buyer_signals.find({}, {"_id": 0, "type": 1, "entity_id": 1, "created_at_dt": 1}):
            dt = s.get("created_at_dt")
            if dt is not None and hasattr(dt, "tzinfo"):
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < cutoff:
                    continue
            t, eid = s.get("type"), s.get("entity_id")
            if not eid:
                continue
            if t in ("unit_view", "unit_save"):
                vistas_unidad.add(str(eid))
            elif t == "ficha_view":
                vistas_dev[str(eid)] = vistas_dev.get(str(eid), 0) + 1
            elif t == "like":
                likes_dev[str(eid)] = likes_dev.get(str(eid), 0) + 1
    except Exception as e:
        log.warning("[negativa] signals fail-open: %s", e)

    unidades = await _oferta_vectores(db)
    invisibles = [u["unit_id"] for u in unidades
                  if u["disponible"] and u.get("unit_id") and str(u["unit_id"]) not in vistas_unidad]

    interes_sin_amor = sorted(
        [{"dev_id": d, "vistas": v, "likes": likes_dev.get(d, 0)}
         for d, v in vistas_dev.items() if v >= 5 and likes_dev.get(d, 0) == 0],
        key=lambda x: -x["vistas"])

    return {
        "dias": dias,
        "zonas_ciegas": zonas_ciegas[:20],
        "n_zonas_ciegas": len(zonas_ciegas),
        "unidades_invisibles": {"n": len(invisibles), "muestra": invisibles[:20]},
        "interes_sin_amor": interes_sin_amor[:15],
        "es_estimado": not (cols_oferta or vistas_dev),
        "lectura": (f"{len(zonas_ciegas)} colonias tienen inventario y NADIE las busca · "
                    f"{len(invisibles)} unidades disponibles sin una sola vista en {dias} días · "
                    f"{len(interes_sin_amor)} desarrollos con vistas pero cero likes."),
    }


# ── B6 · radar léxico ─────────────────────────────────────────────────────────
async def radar_lexico(db, top: int = 20) -> Dict[str, Any]:
    """Términos emergentes del corpus (átomos lexico.termino_emergente) agrupados por mes —
    el vocabulario del deseo ANTES de que exista en catálogos."""
    por_termino: Dict[str, int] = {}
    por_mes: Dict[str, Dict[str, int]] = {}
    try:
        async for a in db.demand_atoms.find({"dimension": "lexico.termino_emergente"}, {"_id": 0}):
            t = a["valor"]
            por_termino[t] = por_termino.get(t, 0) + 1
            ts = a.get("ts")
            mes = str(ts)[:7] if ts else "s/f"
            por_mes.setdefault(mes, {})
            por_mes[mes][t] = por_mes[mes].get(t, 0) + 1
    except Exception as e:
        log.warning("[lexico] fail-open: %s", e)
    ranking = sorted(por_termino.items(), key=lambda x: -x[1])[:top]
    return {
        "terminos_top": [{"termino": t, "menciones": n} for t, n in ranking],
        "por_mes": {m: dict(sorted(v.items(), key=lambda x: -x[1])[:10]) for m, v in sorted(por_mes.items())},
        "es_estimado": not bool(ranking),
        "lectura": (f"Término emergente #1: '{ranking[0][0]}' ({ranking[0][1]} menciones) — "
                    f"candidato a entrar a la taxonomía.") if ranking else
                   "Sin términos emergentes aún — todo lo pedido ya está en la taxonomía.",
    }
