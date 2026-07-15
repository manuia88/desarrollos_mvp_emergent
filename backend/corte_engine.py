"""EL MOTOR DE CORTES — hipersegmentación universal hasta el átomo.

Orden founder (07-15): "calcula TODAS las dimensiones, no solo las que yo dije".
La respuesta correcta no es otra escalera a mano: es un REGISTRO de dimensiones donde
agregar una nueva = 1 renglón (universalidad), y cualquier dimensión se CRUZA con
cualquier otra (hipersegmentación): colonia × tipología, piso × orientación,
torre × banda de precio × esquema...

Cada dimensión es un extractor puro sobre el átomo (unidad + su desarrollo + su molde
+ su programa). Las medidas son las mismas en cualquier corte: unidades, disponibles,
vendidas, colocación %, precio, $/m², m², enganche %.

La TEMPORALIDAD no vive aquí: cada evento de la bitácora ya corta hora→año en
market_timeline.evolucion(). Este motor es el CORTE ACTUAL, n-dimensional.
$0, sin IA. Lógica pura testeable; Mongo solo en corte().
"""
from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Optional

# ─── extractores: átomo → valor de la dimensión ───────────────────────────────
_TORRE_RE = re.compile(r"^([A-Za-z]{1,3})[-_ ]?\d")


def _banda(v: Optional[float], cortes: List[float], unidad: str) -> Optional[str]:
    if v is None:
        return None
    prev = 0.0
    for c in cortes:
        if v < c:
            return f"{prev:g}–{c:g}{unidad}"
        prev = c
    return f"{prev:g}+{unidad}"


def _torre(u, d, m, p):
    mm = _TORRE_RE.match(str(u.get("unit_number") or ""))
    return f"Torre {mm.group(1).upper()}" if mm else None


def _exterior(u, d, m, p):
    if (u.get("patio_m2") or 0) > 0:
        return "con patio"
    if (u.get("m2_roof_garden") or 0) > 0:
        return "con roof privado"
    if (u.get("m2_terrace") or 0) > 0:
        return "con terraza"
    if (u.get("m2_balcony") or 0) > 0:
        return "con balcón"
    return "interior"


# LA UNIVERSALIDAD: una dimensión nueva = un renglón aquí. Firma: (unidad, dev, molde,
# programa) → valor humano (None = sin dato, se agrupa como "sin dato" solo si se pide).
DIMENSIONES: Dict[str, Callable[..., Optional[str]]] = {
    # ── geográficas (la escalera) ──
    "ciudad":     lambda u, d, m, p: "CDMX",
    "alcaldia":   lambda u, d, m, p: d.get("alcaldia"),
    "colonia":    lambda u, d, m, p: d.get("colonia_name") or d.get("colonia"),
    "microzona":  lambda u, d, m, p: u.get("colonia_id") or d.get("colonia_id"),
    "desarrollo": lambda u, d, m, p: d.get("name"),
    # ── físicas (la vertical del edificio, hasta el átomo) ──
    "torre":      _torre,
    "piso":       lambda u, d, m, p: f"Piso {u['level']}" if u.get("level") is not None else None,
    "molde":      lambda u, d, m, p: m.get("nombre"),
    "espacios":   lambda u, d, m, p: f"{len(p.get('espacios_detalle') or p.get('espacios') or [])} espacios" if p else None,
    "flex":       lambda u, d, m, p: ("con FLEX" if p.get("flex_visual") else "sin FLEX") if p else None,
    "exterior":   _exterior,
    # ── producto ──
    "tipologia":  lambda u, d, m, p: (f"{int(u['bedrooms'])}R" if u.get("bedrooms") is not None else None),
    "banos":      lambda u, d, m, p: f"{u['bathrooms']:g} baños" if u.get("bathrooms") else None,
    "estacionamientos": lambda u, d, m, p: f"{int(u['parking_spots'])} cajones" if u.get("parking_spots") is not None else None,
    "banda_m2":   lambda u, d, m, p: _banda(u.get("size_m2") or u.get("m2_total"), [90, 110, 130, 160], "m²"),
    "etapa":      lambda u, d, m, p: d.get("stage"),
    "estatus":    lambda u, d, m, p: (u.get("status") or "disponible").lower(),
    "orientacion": lambda u, d, m, p: u.get("orientacion"),
    "vista":      lambda u, d, m, p: u.get("vista"),
    # ── financieras ──
    "banda_precio": lambda u, d, m, p: _banda((u.get("price_mxn") or u.get("price") or 0) / 1e6 or None, [5, 7, 9, 12], "M"),
    "banda_pm2":  lambda u, d, m, p: _banda(
        ((u.get("price_mxn") or u.get("price")) / (u.get("size_m2") or u.get("m2_total")) / 1000)
        if (u.get("price_mxn") or u.get("price")) and (u.get("size_m2") or u.get("m2_total")) else None,
        [45, 55, 65, 80], "k/m²"),
    "banda_enganche": lambda u, d, m, p: _banda(u.get("enganche_pct"), [10, 20, 30], "%"),
}


# ─── medidas (idénticas en cualquier corte) ───────────────────────────────────
def _medidas(unidades: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = len(unidades)
    vend = [u for u in unidades if (u.get("status") or "").lower() in
            ("vendida", "vendido", "sold", "no_disponible")]
    precios = [u.get("price_mxn") or u.get("price") for u in unidades
               if u.get("price_mxn") or u.get("price")]
    pm2s = [(u.get("price_mxn") or u.get("price")) / (u.get("size_m2") or u.get("m2_total"))
            for u in unidades
            if (u.get("price_mxn") or u.get("price")) and (u.get("size_m2") or u.get("m2_total"))]
    m2s = [u.get("size_m2") or u.get("m2_total") for u in unidades
           if u.get("size_m2") or u.get("m2_total")]
    return {"unidades": n, "vendidas": len(vend), "disponibles": n - len(vend),
            "colocacion_pct": round(len(vend) * 100 / n, 1) if n else None,
            "precio_prom": round(sum(precios) / len(precios)) if precios else None,
            "precio_min": round(min(precios)) if precios else None,
            "pm2_prom": round(sum(pm2s) / len(pm2s)) if pm2s else None,
            "m2_prom": round(sum(m2s) / len(m2s), 1) if m2s else None}


def cortar(atomos: List[Dict[str, Any]], por: List[str],
           incluir_sin_dato: bool = False) -> List[Dict[str, Any]]:
    """El corte n-dimensional puro. `atomos` = [{u, d, m, p}]; `por` = dimensiones a cruzar.
    Devuelve un renglón por combinación con las medidas estándar."""
    for dim in por:
        if dim not in DIMENSIONES:
            raise ValueError(f"dimensión desconocida '{dim}'; usa una de {sorted(DIMENSIONES)}")
    grupos: Dict[tuple, List[Dict[str, Any]]] = {}
    for a in atomos:
        llave = tuple(DIMENSIONES[dim](a["u"], a["d"], a["m"], a["p"]) for dim in por)
        if not incluir_sin_dato and any(v is None for v in llave):
            continue
        grupos.setdefault(llave, []).append(a["u"])
    filas = [{**dict(zip(por, k)), **_medidas(us)} for k, us in grupos.items()]
    return sorted(filas, key=lambda f: -(f["unidades"] or 0))


# ─── acceso a datos (única función con Mongo) ─────────────────────────────────
async def corte(db, por: List[str], development_id: Optional[str] = None,
                incluir_sin_dato: bool = False) -> Dict[str, Any]:
    q: Dict[str, Any] = {"development_id": development_id} if development_id else {}
    units = await db.units.find(q, {"_id": 0}).to_list(20000)
    dev_ids = {u.get("development_id") for u in units}
    devs = {d["id"]: d for d in await db.developments.find(
        {"id": {"$in": list(dev_ids)}}, {"_id": 0}).to_list(1000)}
    moldes = {m["prototype_id"]: m for m in await db.dmx_prototypes.find(
        {}, {"_id": 0}).to_list(2000)}
    programas = {p["prototype_id"]: p for p in await db.molde_programa.find(
        {}, {"_id": 0}).to_list(2000)}
    atomos = [{"u": u, "d": devs.get(u.get("development_id")) or {},
               "m": moldes.get(u.get("prototype_id")) or {},
               "p": programas.get(u.get("prototype_id")) or {}} for u in units]
    return {"por": por, "n_atomos": len(atomos),
            "filas": cortar(atomos, por, incluir_sin_dato),
            "dimensiones_disponibles": sorted(DIMENSIONES)}
