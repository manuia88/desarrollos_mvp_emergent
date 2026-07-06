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
}


def _normalize_row(a: Dict[str, Any], ov: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Aplana UN átomo con los overrides del dev aplicados (precio/estado/m2 mandan)."""
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
    }


def _match(valor_row: Any, op: str, valor: Any) -> bool:
    """Un predicado. None en la row NUNCA matchea comparaciones (honesto: sin dato ≠ cumple)."""
    if op == "exists":
        return (valor_row is not None) == bool(valor)
    if valor_row is None:
        return False
    if op == "eq":
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


def validar(filtros: List[Dict[str, Any]], agrupar_por: List[str]) -> List[str]:
    errs: List[str] = []
    if len(filtros) > MAX_FILTROS:
        errs.append(f"Máximo {MAX_FILTROS} filtros")
    for f in filtros:
        if f.get("campo") not in CAMPOS:
            errs.append(f"Campo desconocido: {f.get('campo')}")
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
                   agrupar_por: Optional[List[str]] = None) -> Dict[str, Any]:
    """El corte: filtra el átomo (overrides aplicados), agrega y agrupa. Con n y k-anon SIEMPRE."""
    agrupar_por = agrupar_por or []
    errs = validar(filtros, agrupar_por)
    if errs:
        return {"ok": False, "errores": errs}

    # overrides del dev (precio/estado mandan sobre el seed) — mismo criterio que el cubo
    ov_map: Dict[str, Dict[str, Any]] = {}
    try:
        async for ov in db.developer_unit_overrides.find({}, {"_id": 0}):
            if ov.get("unit_id"):
                ov_map[ov["unit_id"]] = ov
    except Exception as e:  # noqa: BLE001
        log.warning(f"[query_libre] overrides: {e}")

    rows: List[Dict[str, Any]] = []
    async for a in db[UNITS].find({}, {"_id": 0}):
        r = _normalize_row(a, ov_map.get(a.get("unit_id")))
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
        "campos": [{"key": k, "label": c["label"], "tipo": c["tipo"], "agrupable": c["agrupable"]}
                   for k, c in CAMPOS.items()],
        "operadores": list(OPS),
        "max_filtros": MAX_FILTROS, "max_grupos": MAX_GRUPOS, "k_anon": K_ANON,
    }
