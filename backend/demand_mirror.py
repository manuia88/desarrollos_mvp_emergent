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
# HARDENING perf: caché TTL en proceso (60s) del inventario COMPLETO por db; el filtro por
# colonias se aplica en memoria. Los motores (espejo/escasez/scores/señales) dejan de re-iterar
# la colección en cada llamada del mismo minuto.
_OFERTA_TTL = 60.0
_OFERTA_CACHE: Dict[int, tuple] = {}


def invalidar_cache_oferta() -> None:
    """Bitácora unificada: cuando alguien ESCRIBE un cambio (edición, Drive, ingesta), el disparo
    inmediato del snapshot necesita leer el estado FRESCO, no el de hace 59 segundos."""
    _OFERTA_CACHE.clear()


async def _oferta_vectores(db, colonias: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    import time as _t
    key = id(db)
    hit = _OFERTA_CACHE.get(key)
    if hit and (_t.time() - hit[0]) < _OFERTA_TTL:
        full = hit[1]
    else:
        full = await _oferta_vectores_raw(db)
        _OFERTA_CACHE[key] = (_t.time(), full)
        if len(_OFERTA_CACHE) > 8:   # no crecer sin límite (tests crean muchos db fakes)
            _OFERTA_CACHE.pop(next(iter(_OFERTA_CACHE)))
    if not colonias:
        return full
    return [u for u in full if u["colonia"] in colonias]


async def _oferta_vectores_raw(db) -> List[Dict[str, Any]]:
    """[{colonia, disponible, vector}] de todo el inventario. Reusa el patrón de absorcion_engine
    (semilla DEVELOPMENTS + db.developments/units vía ingested_reader). FAIL-OPEN por fuente."""
    from demand_genome import vector_unidad
    from market_4s_bridge import norm_colonia
    out: List[Dict[str, Any]] = []
    colonias = None   # el raw siempre trae TODO; el filtro vive en el wrapper cacheado

    def _quiere(col: str) -> bool:
        return not colonias or col in colonias

    def _fila(col: str, u: Dict[str, Any], dev_id=None) -> Dict[str, Any]:
        from demand_genome import _get, _entero
        m2 = _get(u, "m2_construido", "m2", "m2_total", "sqm", "superficie")
        precio = _get(u, "precio_lista", "precio", "price", "price_mxn")
        # GARANTÍA UNIVERSAL lado-oferta: TODO campo numérico de la unidad se conserva como crudo
        # (m2_balcon=10, m2_terraza, precio_cierre…) — las MAGNITUDES no se pierden, solo el flag.
        crudos = {}
        for k, v in u.items():
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                continue
            try:
                crudos[k] = float(v)
            except (TypeError, ValueError):
                continue
        return {"colonia": col, "dev_id": dev_id,
                "disponible": (u.get("status") == "disponible"),
                "status": u.get("status"),
                "unit_id": u.get("id"),
                # crudos para scores (C1/C3/C5): $/m², m², piso — el vector trae las bandas
                "precio": float(precio) if precio else None,
                "m2": float(m2) if m2 else None,
                # BUG cazado en el gate vivo: estos crudos se leían SIN alias ni parse tolerante
                # (bedrooms/'10+1') → el espejo daba 'recámaras=2 → 0 satisfacen' con 597 disponibles.
                # Misma disciplina que el vector: alias + _entero.
                "piso": _entero(_get(u, "piso", "nivel", "level", "floor")),
                "recamaras": _entero(_get(u, "recamaras", "bedrooms")),
                "crudos": crudos,
                "vector": vector_unidad(u)}

    # 1) semilla (units embebidas)
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            col = norm_colonia(str(d.get("colonia") or ""))
            if not col or not _quiere(col):
                continue
            for u in d.get("units") or []:
                try:   # aislamiento: UNA unidad sucia pierde su fila, no tira el inventario
                    out.append(_fila(col, u, d.get("id")))
                except Exception as e:
                    log.warning("[mirror] unidad %s fail-open: %s", u.get("id"), e)
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
                try:   # aislamiento: UNA unidad sucia pierde su fila, no tira el inventario
                    out.append(_fila(col, u, d.get("id")))
                except Exception as e:
                    log.warning("[mirror] unidad %s fail-open: %s", u.get("id"), e)
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


def _ts_ok(ts, cutoff) -> bool:
    """¿El átomo cae dentro de la ventana? Fail-open True (mejor contar de más que perder)."""
    if ts is None or cutoff is None:
        return True
    try:
        if isinstance(ts, str):
            from datetime import datetime
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts >= cutoff
    except Exception:
        return True


async def _demanda_conteos(db, colonias: Optional[Set[str]] = None,
                           dias: Optional[int] = 90) -> Dict[tuple, Dict[str, Any]]:
    """{(dimension, valor): {visitantes, senales}} — HARDENING: visitantes ÚNICOS (un obsesivo
    buscando 10 veces = 1) + ventana temporal (default 90d) + señales ponderadas por peso."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=dias)) if dias else None
    visitantes: Dict[tuple, Set[str]] = {}
    senales: Dict[tuple, float] = {}
    n = 0
    try:
        async for a in db.demand_atoms.find(({'colonia': {'$in': sorted(colonias)}} if colonias else {}), {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            if not _ts_ok(a.get("ts"), cutoff):
                continue
            k = (a["dimension"], a["valor"])
            v = a.get("visitor_id") or f"anon:{a.get('search_id')}"
            visitantes.setdefault(k, set()).add(v)
            senales[k] = senales.get(k, 0.0) + float(a.get("peso", 1.0))
            n += 1
            if n >= _MAX_ATOMS:
                break
    except Exception as e:
        log.warning("[mirror] demanda fail-open: %s", e)
    return {k: {"visitantes": len(vs), "senales": round(senales.get(k, 0), 1)}
            for k, vs in visitantes.items()}


# ── B1 · el espejo (HARDENING: semántica de SATISFACCIÓN, no llave exacta) ────
# "2 recámaras" en la demanda significa 2 O MÁS; "presupuesto 4.4-4.6" significa que una unidad
# MÁS BARATA también satisface. Registro de semántica por dimensión (universalidad: 1 línea = 1 dim).
_SEMANTICA = {
    "producto.recamaras": ("min", "recamaras"),
    "producto.banos": ("min", "vector:producto.banos"),
    "producto.estacionamientos": ("min", "vector:producto.estacionamientos"),
    "producto.nivel_min": ("min", "piso"),
    "producto.m2_banda": ("min_banda", "m2"),
    "producto.m2_max_banda": ("max_banda", "m2"),
    "finanzas.presupuesto_banda_mdp": ("max_banda", "precio"),
    "finanzas.presupuesto_min_banda_mdp": ("min_banda", "precio"),
    "producto.feature": ("feature", None),
}


def _valor_unidad(u: Dict[str, Any], campo: str) -> Optional[float]:
    try:
        if campo.startswith("vector:"):
            v = u["vector"].get(campo.split(":", 1)[1])
        else:
            v = u.get(campo)
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _rango_de_banda(banda: str) -> Optional[tuple]:
    import re
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(banda))]
    return (nums[0], nums[1]) if len(nums) >= 2 else None


def _satisface(u: Dict[str, Any], dim: str, val: str) -> Optional[bool]:
    """¿Esta unidad satisface la demanda (dim, val)? None = dimensión sin espejo de oferta."""
    sem = _SEMANTICA.get(dim)
    if not sem:
        return None
    op, campo = sem
    if op == "feature":
        return f"producto.feature.{val}" in u["vector"]
    uv = _valor_unidad(u, campo)
    if uv is None:
        return False
    if op == "min":
        try:
            return uv >= float(val)
        except (TypeError, ValueError):
            return False
    r = _rango_de_banda(val)
    if not r:
        return False
    lo, hi = r
    escala = 1_000_000 if "mdp" in dim else 1   # bandas de precio vienen en mdp; la unidad en pesos
    return uv >= lo * escala if op == "min_banda" else uv <= hi * escala


async def espejo(db, colonias: Optional[Set[str]] = None, dias: Optional[int] = 90) -> Dict[str, Any]:
    """Por demanda (dim×valor): VISITANTES únicos que lo piden vs unidades disponibles que lo
    SATISFACEN (semántica min/max, no llave exacta). + inventario ciego en features."""
    dem = await _demanda_conteos(db, colonias, dias=dias)
    unidades = await _oferta_vectores(db, colonias)
    disponibles = [u for u in unidades if u["disponible"]]

    filas = []
    features_demandadas: Set[str] = set()
    for (dim, val), cnt in dem.items():
        if dim.startswith(("lexico.", "exclusion.", "busqueda.")):
            continue
        if dim == "producto.feature":
            features_demandadas.add(val)
        sats = [_satisface(u, dim, val) for u in disponibles]
        if all(s is None for s in sats) and disponibles:
            estado, oferta = "sin_espejo", None      # dimensión aún sin lado-oferta (honesto)
        else:
            oferta = sum(1 for s in sats if s)
            estado = "inexistente" if oferta == 0 else "espejo"
        filas.append({"dimension": dim, "valor": val,
                      "demanda": cnt["visitantes"], "senales": cnt["senales"],
                      "oferta_satisface": oferta,
                      "tension": round(cnt["visitantes"] / oferta, 2) if oferta else None,
                      "estado": estado})

    # inventario CIEGO (features que la oferta tiene y NADIE pide — semántica exacta aplica)
    ofe_feats: Dict[str, int] = {}
    for u in disponibles:
        for k in u["vector"]:
            if k.startswith("producto.feature."):
                f = k.rsplit(".", 1)[1]
                ofe_feats[f] = ofe_feats.get(f, 0) + 1
    for f, n in ofe_feats.items():
        if f not in features_demandadas:
            filas.append({"dimension": "producto.feature", "valor": f, "demanda": 0, "senales": 0,
                          "oferta_satisface": n, "tension": None, "estado": "ciego"})

    filas.sort(key=lambda x: (-(x["demanda"]), x["dimension"]))
    return {"n_unidades_oferta": len(unidades), "n_llaves": len(filas),
            "dias_ventana": dias,
            "es_estimado": not bool(filas), "filas": filas,
            "colonias": sorted(colonias) if colonias else "todas"}


# ── B2 · escasez / lo inexistente / inventario ciego ─────────────────────────
async def escasez(db, colonias: Optional[Set[str]] = None, top: int = 15,
                  dias: Optional[int] = 90) -> Dict[str, Any]:
    esp = await espejo(db, colonias, dias=dias)
    filas = esp["filas"]
    con_tension = [f for f in filas if f["tension"] is not None and f["demanda"] > 0]
    con_tension.sort(key=lambda f: -f["tension"])
    inexistente = [f for f in filas if f["estado"] == "inexistente"]
    inexistente.sort(key=lambda f: -f["demanda"])
    ciego = [f for f in filas if f["estado"] == "ciego"]
    ciego.sort(key=lambda f: -f["oferta_satisface"])
    top_t = con_tension[0] if con_tension else None
    return {
        "es_estimado": esp["es_estimado"], "dias_ventana": dias,
        "tension_top": con_tension[:top],
        "lo_inexistente": inexistente[:top],   # → auto-brief (Ola C4)
        "inventario_ciego": ciego[:top],
        "lectura": (f"Mayor tensión: {top_t['dimension']}={top_t['valor']} "
                    f"({top_t['demanda']} visitantes únicos / {top_t['oferta_satisface']} unidades que "
                    f"lo satisfacen = {top_t['tension']}x en {dias}d). "
                    f"{len(inexistente)} llaves con demanda y CERO oferta.")
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

    # EDAD en bitácora: invisible desde hace 3 días ≠ invisible desde hace 3 meses. El primer
    # evento de cada unidad en oferta_timeline es su 'alta' — la edad sale de nuestra propia
    # bitácora, sin depender de que la fuente traiga fecha de publicación.
    primer_ts: Dict[str, Any] = {}
    try:
        async for e in db.oferta_timeline.find({}, {"_id": 0, "unit_id": 1, "ts": 1}):
            uid = str(e.get("unit_id"))
            if uid not in primer_ts or str(e.get("ts", "")) < str(primer_ts[uid]):
                primer_ts[uid] = e.get("ts")
    except Exception as e:
        log.warning("[negativa] bitacora fail-open: %s", e)

    def _edad_dias(uid) -> Optional[int]:
        ts = primer_ts.get(str(uid))
        if ts is None:
            return None
        try:
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            return max(0, (datetime.now(timezone.utc) - ts).days)
        except Exception:
            return None

    invisibles_con_edad = sorted(
        [{"unit_id": u, "dias_invisible": _edad_dias(u)} for u in invisibles],
        key=lambda x: -(x["dias_invisible"] if x["dias_invisible"] is not None else -1))
    edades = [x["dias_invisible"] for x in invisibles_con_edad if x["dias_invisible"] is not None]
    edad_mediana = sorted(edades)[len(edades) // 2] if edades else None

    interes_sin_amor = sorted(
        [{"dev_id": d, "vistas": v, "likes": likes_dev.get(d, 0)}
         for d, v in vistas_dev.items() if v >= 5 and likes_dev.get(d, 0) == 0],
        key=lambda x: -x["vistas"])

    return {
        "dias": dias,
        "zonas_ciegas": zonas_ciegas[:20],
        "n_zonas_ciegas": len(zonas_ciegas),
        "unidades_invisibles": {"n": len(invisibles), "edad_mediana_dias": edad_mediana,
                                "muestra": invisibles_con_edad[:20]},
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


# ── SALUD DEL DATO: la calidad del inventario, visible (no solo en logs) ──────
# Bug real que motivó esto: un piso '10+1' tiraba el inventario y solo un log lo sabía. Ahora
# el founder VE qué campos llegan completos, cuáles se RESCATAN (sucios pero salvables) y cuáles
# se PIERDEN — por campo y por colonia. Universal: mide los campos clave del genoma, y cualquier
# campo nuevo del esquema entra al conteo de 'crudos' automáticamente.
_CAMPOS_SALUD = {
    "precio": ("precio_lista", "precio", "price", "price_mxn"),
    "m2": ("m2_construido", "m2", "m2_total", "sqm", "superficie"),
    "recamaras": ("recamaras", "bedrooms"),
    "piso": ("piso", "nivel", "level", "floor"),
    "status": ("status",),
}


def _diagnostico_campo(u: Dict[str, Any], alias: tuple) -> str:
    """'presente' (numérico limpio) · 'rescatado' (sucio pero _entero lo salva) · 'perdido'
    (presente pero inservible) · 'ausente' (la fuente no lo trae)."""
    from demand_genome import _get, _entero
    v = _get(u, *alias)
    if v is None:
        return "ausente"
    if alias == ("status",):
        return "presente"
    try:
        float(v)
        return "presente"
    except (TypeError, ValueError):
        return "rescatado" if _entero(v) is not None else "perdido"


async def salud_oferta(db) -> Dict[str, Any]:
    """Recorre las MISMAS fuentes que el espejo (semilla + ingeridas) midiendo cada unidad."""
    from market_4s_bridge import norm_colonia
    por_campo: Dict[str, Dict[str, int]] = {c: {} for c in _CAMPOS_SALUD}
    ejemplos: Dict[str, List[Dict[str, Any]]] = {}
    por_colonia: Dict[str, Dict[str, int]] = {}
    total = 0

    def _medir(col: str, u: Dict[str, Any]):
        nonlocal total
        total += 1
        cc = por_colonia.setdefault(col, {"unidades": 0, "con_problema": 0})
        cc["unidades"] += 1
        problema = False
        for campo, alias in _CAMPOS_SALUD.items():
            d = _diagnostico_campo(u, alias)
            por_campo[campo][d] = por_campo[campo].get(d, 0) + 1
            if d in ("rescatado", "perdido"):
                problema = True
                if len(ejemplos.setdefault(campo, [])) < 8:
                    from demand_genome import _get
                    ejemplos[campo].append({"unit_id": u.get("id"), "colonia": col,
                                            "valor_crudo": str(_get(u, *alias))[:40],
                                            "diagnostico": d})
        if problema:
            cc["con_problema"] += 1

    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            col = norm_colonia(str(d.get("colonia") or ""))
            for u in d.get("units") or []:
                _medir(col, u)
    except Exception as e:
        log.warning("[salud] seed fail-open: %s", e)
    try:
        from ingested_reader import units_for_dev
        async for d in db.developments.find({}, {"_id": 0, "id": 1, "colonia": 1}):
            col = norm_colonia(str(d.get("colonia") or ""))
            for u in await units_for_dev(db, d.get("id")):
                _medir(col, u)
    except Exception as e:
        log.warning("[salud] ingeridos fail-open: %s", e)

    rescatados = sum(v.get("rescatado", 0) for v in por_campo.values())
    perdidos = sum(v.get("perdido", 0) for v in por_campo.values())
    peores = sorted([{"colonia": c, **v} for c, v in por_colonia.items() if v["con_problema"]],
                    key=lambda x: -x["con_problema"])[:15]
    return {
        "n_unidades": total,
        "por_campo": por_campo,
        "ejemplos": ejemplos,
        "colonias_con_problemas": peores,
        "es_estimado": not total,
        "lectura": (f"{total} unidades medidas: {rescatados} valores sucios RESCATADOS "
                    f"(ej. piso '10+1'→10) y {perdidos} perdidos. "
                    + (f"Peor colonia: {peores[0]['colonia']} ({peores[0]['con_problema']} unidades con problema)."
                       if peores else "Inventario limpio.")) if total else
                   "Sin inventario que medir.",
    }
