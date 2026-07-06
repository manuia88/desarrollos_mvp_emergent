"""
CUBO TOTAL F2 — MOTOR DE CONSULTA LIBRE
═══════════════════════════════════════════════════════════════════════════════
Cualquier pregunta = un corte: combina FILTROS arbitrarios (con operadores y rangos)
sobre cualquier campo del átomo (físico, financiero, geo, mercado) + AGRUPA por la
dimensión que sea + devuelve medidas con n y bandera k-anon por celda.

Ejemplo (la pregunta del founder):
  filtros = [
    {"campo": "alcaldia", "op": "eq", "valor": "benito-juarez"},
    {"campo": "has_balcon", "op": "eq", "valor": True},
    {"campo": "m2", "op": "lt", "valor": 65},
    {"campo": "n_parking", "op": "gte", "valor": 1},
    {"campo": "enganche_min_pct", "op": "lte", "valor": 10},
    {"campo": "mens_80_20", "op": "lt", "valor": 20000},
  ]
  agrupar_por = ["colonia"]

Seguridad/honestidad: los campos consultables viven en un REGISTRO cerrado (nada de
paths arbitrarios); toda respuesta declara n; celdas n<K se marcan (el superadmin las
ve — god view — pero etiquetadas para no re-publicarse sin supresión). Los overrides
del dev (precio/estado) SÍ aplican. Escala actual: in-memory sobre el átomo (~500-5k
unidades); el registro está diseñado para compilarse a aggregation cuando crezca.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Any, Callable, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS

log = logging.getLogger("dmx.query_libre")

UNITS = COLLECTIONS["units"]
K_ANON = 3
OPS = ("eq", "ne", "lt", "lte", "gt", "gte", "in", "between", "exists")
MAX_FILTROS = 12
MAX_GRUPOS = 3
MAX_UNIDADES_MUESTRA = 50


def _slug(s: Any) -> str:
    t = unicodedata.normalize("NFD", str(s or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.strip().lower().replace(" ", "-")


# ─── REGISTRO DE CAMPOS (el diccionario consultable) ─────────────────────────
# key → (label humano, tipo, accessor(row_normalizada) — la row ya trae overrides aplicados)
def _campo(label: str, tipo: str, fn: Callable[[Dict[str, Any]], Any],
           agrupable: bool = False) -> Dict[str, Any]:
    return {"label": label, "tipo": tipo, "fn": fn, "agrupable": agrupable}


CAMPOS: Dict[str, Dict[str, Any]] = {
    # geo
    "alcaldia": _campo("Alcaldía", "str", lambda r: r["alcaldia"], agrupable=True),
    "colonia": _campo("Colonia", "str", lambda r: r["colonia"], agrupable=True),
    "development_id": _campo("Desarrollo", "str", lambda r: r["development_id"], agrupable=True),
    # físicas
    "tipologia": _campo("Tipología", "str", lambda r: r["tipologia"], agrupable=True),
    "recamaras": _campo("Recámaras", "num", lambda r: r["recamaras"], agrupable=True),
    "banos": _campo("Baños", "num", lambda r: r["banos"]),
    "m2": _campo("Metros cuadrados", "num", lambda r: r["m2"]),
    "piso": _campo("Piso", "num", lambda r: r["piso"]),
    "orientacion": _campo("Orientación", "str", lambda r: r["orientacion"], agrupable=True),
    "has_balcon": _campo("Con balcón", "bool", lambda r: r["has_balcon"], agrupable=True),
    "has_terraza": _campo("Con terraza", "bool", lambda r: r["has_terraza"], agrupable=True),
    "has_roof": _campo("Con roof garden", "bool", lambda r: r["has_roof"], agrupable=True),
    "has_bodega": _campo("Con bodega", "bool", lambda r: r["has_bodega"], agrupable=True),
    "n_parking": _campo("Cajones", "num", lambda r: r["n_parking"], agrupable=True),
    # comerciales (con override del dev aplicado)
    "precio": _campo("Precio", "num", lambda r: r["precio"]),
    "precio_m2": _campo("Precio por m²", "num", lambda r: r["precio_m2"]),
    "status": _campo("Estado", "str", lambda r: r["status"], agrupable=True),
    "dias_en_mercado": _campo("Días en mercado", "num", lambda r: r["dias_en_mercado"]),
    # financieras (CUBO TOTAL F1 · dmx_finance_atom)
    "mens_80_20": _campo("Mensualidad hipoteca (80% · 20a)", "num", lambda r: r["mens_80_20"]),
    "mens_90_20": _campo("Mensualidad hipoteca (90% · 20a)", "num", lambda r: r["mens_90_20"]),
    "enganche_min_pct": _campo("Enganche mínimo %", "num", lambda r: r["enganche_min_pct"]),
    "ticket_entrada_min": _campo("Ticket de entrada", "num", lambda r: r["ticket_entrada_min"]),
    "banda_mensualidad": _campo("Banda de mensualidad", "str", lambda r: r["banda_mensualidad"], agrupable=True),
    "banda_enganche": _campo("Banda de enganche", "str", lambda r: r["banda_enganche"], agrupable=True),
    # mercado/IA
    "prob_venta": _campo("Prob. de venta", "num", lambda r: r["prob_venta"]),
    # ── nivel DESARROLLO (join a data_developments) ──
    "etapa": _campo("Etapa del proyecto", "str", lambda r: r["etapa"], agrupable=True),
    "entrega": _campo("Entrega estimada", "str", lambda r: r["entrega"], agrupable=True),
    "desarrolladora": _campo("Desarrolladora", "str", lambda r: r["desarrolladora"], agrupable=True),
    # ── nivel EDIFICIO ──
    "amenidades_edificio": _campo("Amenidad del edificio", "list", lambda r: r["amenidades_edificio"]),
    # ── nivel ZONA (los índices de la colonia, unidos a cada unidad del corte) ──
    "walkability": _campo("Caminabilidad de la zona", "num", lambda r: r["_z"].get("walkability")),
    "seguridad_zona": _campo("Trayectoria de seguridad de la zona", "num", lambda r: r["_z"].get("seguridad")),
    "escuelas_zona": _campo("Escuelas de la zona", "num", lambda r: r["_z"].get("escuelas")),
    "agua_zona": _campo("Seguridad hídrica de la zona", "num", lambda r: r["_z"].get("agua")),
    "vida_nocturna_zona": _campo("Vida nocturna de la zona", "num", lambda r: r["_z"].get("nocturna")),
    "adulto_mayor_zona": _campo("Habitabilidad adulto mayor", "num", lambda r: r["_z"].get("senior")),
    "gentrificacion_zona": _campo("Gentrificación de la zona", "num", lambda r: r["_z"].get("gentrificacion")),
    "zone_score": _campo("Calidad de zona (0-100)", "num", lambda r: r["_z"].get("zone_score")),
    "riesgo_zona": _campo("Seguridad física de la zona (0-100)", "num", lambda r: r["_z"].get("riesgo_zona")),
}

# códigos IE reales → campo de zona (cobertura 700-1,500 colonias c/u)
_IE_ZONA = {
    "IE_COL_N08_WALKABILITY_MX": "walkability",
    "IE_COL_N04_CRIME_TRAJECTORY": "seguridad",
    "IE_COL_N06_SCHOOL_PREMIUM": "escuelas",
    "IE_COL_N07_WATER_SECURITY": "agua",
    "IE_COL_N09_NIGHTLIFE_ECONOMY": "nocturna",
    "IE_COL_N10_SENIOR_LIVABILITY": "senior",
}
_CAMPOS_ZONA = {"walkability", "seguridad_zona", "escuelas_zona", "agua_zona",
                "vida_nocturna_zona", "adulto_mayor_zona", "gentrificacion_zona", "zone_score"}


async def _zone_context(db, necesita: bool) -> Dict[str, Dict[str, Any]]:
    """Mapa colonia → índices de zona (IE reales + gentrificación + zone score). Solo si la consulta
    los usa. Honesto: colonia sin score → el campo queda None → nunca matchea."""
    if not necesita:
        return {}
    ctx: Dict[str, Dict[str, Any]] = {}
    try:
        async for r in db.ie_scores.find({"code": {"$in": list(_IE_ZONA)}, "is_stub": {"$ne": True}},
                                         {"_id": 0, "zone_id": 1, "code": 1, "value": 1}):
            z = _slug(r.get("zone_id"))
            if z and r.get("value") is not None:
                ctx.setdefault(z, {})[_IE_ZONA[r["code"]]] = r["value"]
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] ie zona: {e}")
    try:
        async for r in db.colonia_valoracion.find({"gentrification.score": {"$exists": True}},
                                                  {"_id": 0, "colonia_id": 1, "gentrification.score": 1}):
            z = _slug(r.get("colonia_id"))
            if z:
                ctx.setdefault(z, {})["gentrificacion"] = (r.get("gentrification") or {}).get("score")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] gentrif: {e}")
    try:
        async for r in db.zone_scores.aggregate([
                {"$match": {"score_numeric": {"$ne": None}}},
                {"$sort": {"computed_at_dt": -1}},
                {"$group": {"_id": "$zone_id", "score": {"$first": "$score_numeric"}}}]):
            z = _slug(r.get("_id"))
            if z:
                ctx.setdefault(z, {})["zone_score"] = r.get("score")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] zone_score: {e}")
    try:   # riesgo compuesto (invertido a "seguridad física" 0-100 · más alto = menos riesgo)
        async for r in db.risk_scores_zone.aggregate([
                {"$match": {"available": True, "score_numeric": {"$ne": None}}},
                {"$sort": {"computed_at_dt": -1}},
                {"$group": {"_id": "$zone_id", "s": {"$first": "$score_numeric"}}}]):
            z = _slug(r.get("_id"))
            if z:
                ctx.setdefault(z, {})["riesgo_zona"] = r.get("s")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] risk zona: {e}")
    return ctx


# ─── MODO ZONA: el universo son las COLONIAS (2,400+), no las unidades ────────
_CAMPOS_ZONA_ALL = _CAMPOS_ZONA | {"riesgo_zona"}


async def _zonas_rows(db) -> List[Dict[str, Any]]:
    """Una fila por COLONIA con sus índices + alcaldía. El Modelo del Mundo a escala ciudad
    (independiente del inventario). Alcaldía desde db.colonias (fallback: sufijo del slug largo)."""
    ctx = await _zone_context(db, True)
    # alcaldía por colonia (catálogo)
    alc: Dict[str, str] = {}
    try:
        async for c in db.colonias.find({}, {"_id": 0, "id": 1, "alcaldia": 1, "name": 1}):
            for kk in (c.get("id"), c.get("name")):
                if kk:
                    alc[_slug(kk)] = _slug(c.get("alcaldia"))
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] alcaldias: {e}")
    def _alc_de(colonia: str) -> str:
        # exacto → prefijo (slug corto 'condesa' resuelve a 'condesa-cuauhtemoc' del catálogo largo)
        if alc.get(colonia):
            return alc[colonia]
        pref = f"{colonia}-"
        for k, v in alc.items():
            if k.startswith(pref) and v:
                return v
        return "sin_dato"

    rows = []
    for colonia, z in ctx.items():
        rows.append({"colonia": colonia, "alcaldia": _alc_de(colonia), "_z": z,
                     # campos de unidad → None (en modo zona no aplican; nunca matchean filtros de unidad)
                     **{k: None for k in ("m2", "precio", "precio_m2", "mens_80_20", "enganche_min_pct",
                                          "n_parking", "recamaras", "banos", "piso", "status", "tipologia",
                                          "development_id", "dias_en_mercado", "prob_venta", "ticket_entrada_min",
                                          "mens_90_20", "orientacion", "etapa", "entrega", "desarrolladora",
                                          "banda_mensualidad", "banda_enganche")},
                     "has_balcon": None, "has_terraza": None, "has_roof": None, "has_bodega": None,
                     "amenidades_edificio": [], "unit_id": None})
    return rows


def _kpis_zonas(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Medidas a nivel colonia: conteo + promedios de los índices presentes."""
    n = len(rows)
    out: Dict[str, Any] = {"colonias": n}
    for campo in ("zone_score", "walkability", "seguridad", "escuelas", "gentrificacion", "riesgo_zona", "nocturna"):
        vals = [r["_z"].get(campo) for r in rows if r["_z"].get(campo) is not None]
        if vals:
            out[f"{campo}_prom"] = round(sum(vals) / len(vals), 1)
    return out


def _normalize_row(a: Dict[str, Any], ov: Optional[Dict[str, Any]],
                   dev: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Aplana UN átomo con overrides del dev aplicados + contexto del desarrollo (etapa/entrega)."""
    ov = ov or {}
    com = a.get("commercial") or {}
    areas = a.get("areas") or {}
    interior = a.get("interior") or {}
    geo = a.get("geo") or {}
    fin = a.get("finance") or {}
    pos = a.get("position") or {}
    precio = ov.get("price") or com.get("precio_cierre_mxn") or com.get("precio_lista_mxn")
    m2 = ov.get("m2_privative") or areas.get("m2_privativo") or areas.get("m2_construido")
    n_park = len(a.get("parking") or [])
    return {
        "unit_id": a.get("unit_id"),
        "development_id": a.get("development_id"),
        "alcaldia": _slug(geo.get("alcaldia")),
        "colonia": _slug(geo.get("colonia_id")),
        "tipologia": a.get("tipologia") or "sin_dato",
        "recamaras": interior.get("recamaras"),
        "banos": interior.get("banos_completos"),
        "m2": m2,
        "piso": pos.get("piso"),
        "orientacion": (pos.get("orientacion") or "sin_dato"),
        "has_balcon": (areas.get("m2_balcon") or 0) > 0,
        "has_terraza": (areas.get("m2_terraza") or 0) > 0,
        "has_roof": (areas.get("m2_roof_garden_privado") or 0) > 0,
        "has_bodega": bool(a.get("storage")),
        "n_parking": n_park,
        "precio": precio,
        "precio_m2": (precio / m2) if (precio and m2) else None,
        "status": _slug(ov.get("status") or com.get("status")),
        "dias_en_mercado": com.get("dias_en_mercado"),
        "mens_80_20": fin.get("mens_80_20"),
        "mens_90_20": fin.get("mens_90_20"),
        "enganche_min_pct": fin.get("enganche_min_pct"),
        "ticket_entrada_min": fin.get("ticket_entrada_min"),
        "banda_mensualidad": fin.get("banda_mensualidad") or "sin_dato",
        "banda_enganche": fin.get("banda_enganche") or "sin_dato",
        "prob_venta": (a.get("demand") or {}).get("prob_venta"),
        "etapa": _slug(dev.get("stage")) if dev else "sin_dato",
        "entrega": str(dev.get("delivery_estimate") or "sin_dato") if dev else "sin_dato",
        "desarrolladora": _slug(dev.get("developer_id")) if dev else "sin_dato",
        "amenidades_edificio": a.get("amenity_keys") or (dev.get("amenities") if dev else None) or [],
        "_z": {},   # índices de zona (se inyectan en consulta() solo si se usan)
    }


def _match(valor_row: Any, op: str, valor: Any) -> bool:
    """Un predicado. None en la row NUNCA matchea comparaciones (honesto: sin dato ≠ cumple)."""
    if op == "exists":
        return (valor_row is not None) == bool(valor)
    if valor_row is None:
        return False
    if op == "eq":
        if isinstance(valor_row, list):        # campos-lista (amenidades): eq = "contiene"
            return _slug(valor) in {_slug(x) for x in valor_row}
        if isinstance(valor_row, str):
            return _slug(valor_row) == _slug(valor)
        return valor_row == valor
    if op == "ne":
        return not _match(valor_row, "eq", valor)
    if op == "in":
        vals = valor if isinstance(valor, list) else [valor]
        return any(_match(valor_row, "eq", v) for v in vals)
    try:
        x = float(valor_row)
        if op == "lt":
            return x < float(valor)
        if op == "lte":
            return x <= float(valor)
        if op == "gt":
            return x > float(valor)
        if op == "gte":
            return x >= float(valor)
        if op == "between":
            lo, hi = valor
            return float(lo) <= x <= float(hi)
    except (TypeError, ValueError):
        return False
    return False


# en modo zona, solo estos campos tienen sentido (los de unidad no aplican)
_ZONA_OK = _CAMPOS_ZONA | {"riesgo_zona", "colonia", "alcaldia"}


def validar(filtros: List[Dict[str, Any]], agrupar_por: List[str], universo: str = "unidades") -> List[str]:
    errs: List[str] = []
    if len(filtros) > MAX_FILTROS:
        errs.append(f"Máximo {MAX_FILTROS} filtros")
    for f in filtros:
        if f.get("campo") not in CAMPOS:
            errs.append(f"Campo desconocido: {f.get('campo')}")
        elif universo == "zonas" and f.get("campo") not in _ZONA_OK:
            errs.append(f"En modo zona no aplica: {f.get('campo')}")
        if f.get("op") not in OPS:
            errs.append(f"Operador desconocido: {f.get('op')}")
    if len(agrupar_por) > MAX_GRUPOS:
        errs.append(f"Máximo {MAX_GRUPOS} agrupaciones")
    for g in agrupar_por:
        if g not in CAMPOS or not CAMPOS[g]["agrupable"]:
            errs.append(f"No agrupable: {g}")
    return errs


def _kpis(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = len(rows)
    vend = sum(1 for r in rows if r["status"] in ("vendido", "sold"))
    disp = sum(1 for r in rows if r["status"] in ("disponible", "available"))
    precios = [r["precio"] for r in rows if r["precio"]]
    pm2 = [r["precio_m2"] for r in rows if r["precio_m2"]]
    mens = [r["mens_80_20"] for r in rows if r["mens_80_20"]]
    return {
        "unidades": n,
        "vendidas": vend,
        "disponibles": disp,
        "absorcion_pct": round(100 * vend / n, 1) if n else None,
        "precio_prom": round(sum(precios) / len(precios)) if precios else None,
        "precio_m2_prom": round(sum(pm2) / len(pm2)) if pm2 else None,
        "mens_80_20_prom": round(sum(mens) / len(mens)) if mens else None,
    }


async def consulta(db, filtros: List[Dict[str, Any]],
                   agrupar_por: Optional[List[str]] = None,
                   universo: str = "unidades") -> Dict[str, Any]:
    """El corte. universo='unidades' (oferta real, ~15 colonias con inventario) o 'zonas' (el Modelo del
    Mundo: 2,400+ colonias con sus índices). Con n y k-anon SIEMPRE; overrides del dev en modo unidades."""
    agrupar_por = agrupar_por or []
    errs = validar(filtros, agrupar_por, universo)
    if errs:
        return {"ok": False, "errores": errs}

    # ── MODO ZONA: universo = las colonias con índices (no las unidades) ──
    if universo == "zonas":
        rows = await _zonas_rows(db)
        for r in rows:
            for c in list(CAMPOS):    # accessor de zona lee r["_z"]; los de unidad quedan None
                pass
        sel = [r for r in rows
               if all(_match(CAMPOS[f["campo"]]["fn"](r), f["op"], f.get("valor")) for f in filtros)]
        out: Dict[str, Any] = {
            "ok": True, "universo": "zonas", "n": len(sel), "kanon_ok": len(sel) >= K_ANON,
            "kpis": _kpis_zonas(sel),
            "colonias": [{"colonia": r["colonia"], "alcaldia": r["alcaldia"], **r["_z"]} for r in sel[:MAX_UNIDADES_MUESTRA]],
            "colonias_truncadas": max(0, len(sel) - MAX_UNIDADES_MUESTRA),
        }
        if agrupar_por:
            gr: Dict[tuple, List[Dict[str, Any]]] = {}
            for r in sel:
                gr.setdefault(tuple(str(CAMPOS[g]["fn"](r)) for g in agrupar_por), []).append(r)
            out["grupos"] = sorted(
                [{"valores": dict(zip(agrupar_por, k)), "n": len(v),
                  "kanon_ok": len(v) >= K_ANON, "kpis": _kpis_zonas(v)} for k, v in gr.items()],
                key=lambda g: -g["n"])
        return out

    # overrides del dev (precio/estado mandan sobre el seed) — mismo criterio que el cubo
    ov_map: Dict[str, Dict[str, Any]] = {}
    try:
        async for ov in db.developer_unit_overrides.find({}, {"_id": 0}):
            if ov.get("unit_id"):
                ov_map[ov["unit_id"]] = ov
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] overrides: {e}")

    # contexto de zona SOLO si algún filtro/agrupación lo pide (join barato, 1 vez por consulta)
    usa_zona = any(f["campo"] in _CAMPOS_ZONA for f in filtros) or any(g in _CAMPOS_ZONA for g in agrupar_por)
    zctx = await _zone_context(db, usa_zona)
    try:
        from data_developments import DEVELOPMENTS_BY_ID
    except Exception:  # noqa: BLE001
        DEVELOPMENTS_BY_ID = {}

    # Resolución de zona: los stores usan slug LARGO (colonia-alcaldía); el átomo, corto.
    # exacto → colonia-alcaldía → prefijo (memoizado por (colonia, alcaldía)).
    _zmemo: Dict[tuple, Dict[str, Any]] = {}
    def _z_de(colonia: str, alcaldia: str) -> Dict[str, Any]:
        k = (colonia, alcaldia)
        if k in _zmemo:
            return _zmemo[k]
        # Resolución de slug: el átomo usa slug corto (roma-norte); los stores, largo (roma-norte-cuauhtemoc,
        # roma-norte-i-cuauhtemoc). Juntamos TODAS las fuentes que matchean (exact + combinada + sub-colonias)
        # promediando por campo — antes tomaba la 1ª y perdía campos (zone_score sin gentrif, etc).
        fuentes = []
        if colonia in zctx:
            fuentes.append(zctx[colonia])
        if alcaldia and f"{colonia}-{alcaldia}" in zctx:
            fuentes.append(zctx[f"{colonia}-{alcaldia}"])
        pref = f"{colonia}-"
        fuentes += [v for kk, v in zctx.items() if kk.startswith(pref)]
        z: Dict[str, Any] = {}
        if fuentes:
            for campo in set().union(*(f.keys() for f in fuentes)):
                vals = [f[campo] for f in fuentes if f.get(campo) is not None]
                if vals:
                    z[campo] = round(sum(vals) / len(vals), 1)
        _zmemo[k] = z
        return z

    rows: List[Dict[str, Any]] = []
    async for a in db[UNITS].find({}, {"_id": 0}):
        dev = DEVELOPMENTS_BY_ID.get(a.get("development_id"))
        r = _normalize_row(a, ov_map.get(a.get("unit_id")), dev)
        if usa_zona:
            r["_z"] = _z_de(r["colonia"], r["alcaldia"])
        if all(_match(CAMPOS[f["campo"]]["fn"](r), f["op"], f.get("valor")) for f in filtros):
            rows.append(r)

    out: Dict[str, Any] = {
        "ok": True,
        "n": len(rows),
        "kanon_ok": len(rows) >= K_ANON,   # el superadmin lo ve igual (god-view) pero etiquetado
        "kpis": _kpis(rows),
        "unidades": [{"unit_id": r["unit_id"], "development_id": r["development_id"],
                      "colonia": r["colonia"], "precio": r["precio"], "m2": r["m2"],
                      "mens_80_20": r["mens_80_20"], "status": r["status"]}
                     for r in rows[:MAX_UNIDADES_MUESTRA]],
        "unidades_truncadas": max(0, len(rows) - MAX_UNIDADES_MUESTRA),
    }

    if agrupar_por:
        grupos: Dict[tuple, List[Dict[str, Any]]] = {}
        for r in rows:
            key = tuple(str(CAMPOS[g]["fn"](r)) for g in agrupar_por)
            grupos.setdefault(key, []).append(r)
        out["grupos"] = sorted(
            [{"valores": dict(zip(agrupar_por, k)), "n": len(v),
              "kanon_ok": len(v) >= K_ANON, "kpis": _kpis(v)}
             for k, v in grupos.items()],
            key=lambda g: -g["n"])
    return out


def campos_disponibles() -> Dict[str, Any]:
    """El registro para que la UI (y Atlax en F3) rendericen las opciones."""
    return {
        "campos": [{"key": k, "label": c["label"], "tipo": c["tipo"], "agrupable": c["agrupable"],
                    "zona": (k in _ZONA_OK)}
                   for k, c in CAMPOS.items()],
        "operadores": list(OPS),
        "max_filtros": MAX_FILTROS, "max_grupos": MAX_GRUPOS, "k_anon": K_ANON,
        "universos": ["unidades", "zonas"],
    }
