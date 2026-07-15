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
    # ── cohorte (edad del inventario: mes en que la unidad entró a la bitácora) ──
    "cohorte":    lambda u, d, m, p: (u.get("_primera_foto") or "")[:7] or None,
    # ── elemento (lo que la lista del dev declara por unidad) ──
    "amueblado":  lambda u, d, m, p: {"si": "amueblado", "no": "sin amueblar"}.get(
        str(u.get("amueblado") or "").strip().lower()[:2], None),
    "cuarto_servicio": lambda u, d, m, p: ("con cuarto de servicio" if str(
        u.get("cuarto_servicio") or "").strip().lower() in ("si", "sí", "1", "true")
        else ("sin cuarto de servicio" if u.get("cuarto_servicio") is not None else None)),
}


# ─── el espejo de DEMANDA: ¿cuántas búsquedas reales le quedan a este corte? ──
def _busca_compatible(b: Dict[str, Any], u: Dict[str, Any], colonia_u: str) -> bool:
    """Una búsqueda del marketplace 'le queda' a una unidad si cumple TODOS sus criterios."""
    cols = [c for c in (b.get("colonias") or ([b["colonia_id"]] if b.get("colonia_id") else []))]
    if cols and colonia_u not in cols:
        return False
    precio = u.get("price_mxn") or u.get("price")
    if b.get("precio_max") and precio and precio > b["precio_max"]:
        return False
    if b.get("recamaras_min") is not None and (u.get("bedrooms") or 0) < b["recamaras_min"]:
        return False
    if b.get("banos_min") is not None and (u.get("bathrooms") or 0) < b["banos_min"]:
        return False
    if b.get("m2_min") and (u.get("size_m2") or u.get("m2_total") or 0) < b["m2_min"]:
        return False
    return True


# ─── medidas (idénticas en cualquier corte; ctx = demanda/leads/bitácora) ─────
def _medidas(unidades: List[Dict[str, Any]],
             ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
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
    pm2s_ord = sorted(pm2s)
    out = {"unidades": n, "vendidas": len(vend), "disponibles": n - len(vend),
           "colocacion_pct": round(len(vend) * 100 / n, 1) if n else None,
           "precio_prom": round(sum(precios) / len(precios)) if precios else None,
           "precio_min": round(min(precios)) if precios else None,
           "pm2_prom": round(sum(pm2s) / len(pm2s)) if pm2s else None,
           "pm2_mediana": round(pm2s_ord[len(pm2s_ord) // 2]) if pm2s_ord else None,
           "pm2_min": round(min(pm2s)) if pm2s else None,
           "pm2_max": round(max(pm2s)) if pm2s else None,
           "m2_prom": round(sum(m2s) / len(m2s), 1) if m2s else None}
    if ctx:
        # DEMANDA REAL: búsquedas del marketplace que le quedan a ≥1 unidad del corte
        compat = set()
        for b in ctx.get("busquedas") or []:
            for u in unidades:
                if _busca_compatible(b, u, u.get("_colonia_id") or ""):
                    compat.add(b.get("id") or b.get("dedup_key"))
                    break
        disp = out["disponibles"] or 0
        out["demanda_busquedas"] = len(compat)
        out["tension"] = round(len(compat) / disp, 2) if disp else None
        # señales e leads: atribución a nivel DESARROLLO (honesto: no bajan más fino)
        devs_fila = {u.get("development_id") for u in unidades}
        spd = ctx.get("senales_por_dev") or {}
        out["demanda_interacciones"] = sum(spd.get(dv, {}).get("n", 0) for dv in devs_fila)
        out["demanda_visitantes"] = len(set().union(*[spd.get(dv, {}).get("visitantes", set())
                                                      for dv in devs_fila]) if devs_fila else set())
        lpd = ctx.get("leads_por_dev") or {}
        out["leads"] = sum(lpd.get(dv, 0) for dv in devs_fila)
        # EDAD del inventario (días desde su primera foto en la bitácora)
        edades = [u.get("_edad_dias") for u in unidades if u.get("_edad_dias") is not None]
        out["dias_en_mercado_prom"] = round(sum(edades) / len(edades)) if edades else None
    return out


def _atomo_humano(u: Dict[str, Any], m: Dict[str, Any], d: Dict[str, Any]) -> Dict[str, Any]:
    """La unidad tal cual, lista para el drill (y para saltar a su Expediente)."""
    precio = u.get("price_mxn") or u.get("price")
    m2 = u.get("size_m2") or u.get("m2_total")
    return {"unidad": u.get("unit_number"), "piso": u.get("level"),
            "m2": m2, "precio": precio,
            "pm2": round(precio / m2) if precio and m2 else None,
            "estatus": (u.get("status") or "disponible").lower(),
            "molde": m.get("nombre"), "desarrollo": d.get("name"),
            "development_id": u.get("development_id"),
            "edad_dias": u.get("_edad_dias")}


def cortar(atomos: List[Dict[str, Any]], por: List[str],
           incluir_sin_dato: bool = False,
           ctx: Optional[Dict[str, Any]] = None,
           filtros: Optional[Dict[str, str]] = None,
           con_atomos: bool = False) -> List[Dict[str, Any]]:
    """El corte n-dimensional puro. `por` = dimensiones a cruzar; `filtros` = segmentos
    ANCLADOS (hipersegmentación sin límite: anclas un valor y sigues cortando por otra
    dimensión); `con_atomos` = cada fila trae sus UNIDADES (hipergranularidad: el drill
    llega al átomo, no se queda en el promedio)."""
    for dim in list(por) + list((filtros or {}).keys()):
        if dim not in DIMENSIONES:
            raise ValueError(f"dimensión desconocida '{dim}'; usa una de {sorted(DIMENSIONES)}")
    if filtros:
        atomos = [a for a in atomos
                  if all(str(DIMENSIONES[k](a["u"], a["d"], a["m"], a["p"])) == str(v)
                         for k, v in filtros.items())]
    grupos: Dict[tuple, List[Dict[str, Any]]] = {}
    for a in atomos:
        llave = tuple(DIMENSIONES[dim](a["u"], a["d"], a["m"], a["p"]) for dim in por)
        if not incluir_sin_dato and any(v is None for v in llave):
            continue
        grupos.setdefault(llave, []).append(a)
    filas = []
    for k, grupo in grupos.items():
        fila = {**dict(zip(por, k)), **_medidas([a["u"] for a in grupo], ctx)}
        if con_atomos:
            orden = sorted(grupo, key=lambda a: ((a["u"].get("level") or 0),
                                                 str(a["u"].get("unit_number") or "")))
            fila["atomos"] = [_atomo_humano(a["u"], a["m"], a["d"]) for a in orden[:60]]
            if len(orden) > 60:
                fila["atomos_truncados"] = len(orden) - 60
        filas.append(fila)
    return sorted(filas, key=lambda f: -(f["unidades"] or 0))


# ─── acceso a datos (única función con Mongo) ─────────────────────────────────
async def corte(db, por: List[str], development_id: Optional[str] = None,
                incluir_sin_dato: bool = False,
                filtros: Optional[Dict[str, str]] = None,
                con_atomos: bool = False) -> Dict[str, Any]:
    q: Dict[str, Any] = {"development_id": development_id} if development_id else {}
    units = await db.units.find(q, {"_id": 0}).to_list(20000)
    dev_ids = {u.get("development_id") for u in units}
    devs = {d["id"]: d for d in await db.developments.find(
        {"id": {"$in": list(dev_ids)}}, {"_id": 0}).to_list(1000)}
    moldes = {m["prototype_id"]: m for m in await db.dmx_prototypes.find(
        {}, {"_id": 0}).to_list(2000)}
    programas = {p["prototype_id"]: p for p in await db.molde_programa.find(
        {}, {"_id": 0}).to_list(2000)}
    # EL ESPEJO: demanda real (búsquedas con criterios), señales, leads y bitácora
    busquedas = await db.marketplace_searches.find({}, {"_id": 0}).to_list(5000)
    senales_por_dev: Dict[str, Dict[str, Any]] = {}
    async for sg in db.buyer_signals.find({}, {"_id": 0, "entity_id": 1, "visitor_id": 1}):
        e = senales_por_dev.setdefault(sg.get("entity_id") or "", {"n": 0, "visitantes": set()})
        e["n"] += 1
        if sg.get("visitor_id"):
            e["visitantes"].add(sg["visitor_id"])
    leads_por_dev: Dict[str, int] = {}
    async for ld in db.leads.find({}, {"_id": 0, "development_id": 1, "project_id": 1}):
        k = ld.get("development_id") or ld.get("project_id") or ""
        leads_por_dev[k] = leads_por_dev.get(k, 0) + 1
    primera: Dict[str, str] = {}
    async for r in db.oferta_timeline.aggregate([
            {"$group": {"_id": "$unit_id", "primera": {"$min": "$ts"}}}]):
        primera[r["_id"]] = str(r["primera"])
    from datetime import datetime, timezone
    hoy = datetime.now(timezone.utc)

    def _edad(ts: Optional[str]) -> Optional[int]:
        if not ts:
            return None
        try:
            return max(0, (hoy - datetime.fromisoformat(ts[:19]).replace(
                tzinfo=timezone.utc)).days)
        except ValueError:
            return None

    atomos = []
    for u in units:
        d = devs.get(u.get("development_id")) or {}
        pf = primera.get(u.get("id") or "")
        u = {**u, "_primera_foto": pf, "_edad_dias": _edad(pf),
             "_colonia_id": u.get("colonia_id") or d.get("colonia_id") or ""}
        atomos.append({"u": u, "d": d, "m": moldes.get(u.get("prototype_id")) or {},
                       "p": programas.get(u.get("prototype_id")) or {}})
    ctx = {"busquedas": busquedas, "senales_por_dev": senales_por_dev,
           "leads_por_dev": leads_por_dev}
    return {"por": por, "n_atomos": len(atomos), "filtros": filtros or {},
            "filas": cortar(atomos, por, incluir_sin_dato, ctx, filtros, con_atomos),
            "dimensiones_disponibles": sorted(DIMENSIONES)}
