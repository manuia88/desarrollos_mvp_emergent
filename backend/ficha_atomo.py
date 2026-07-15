"""LA FICHA DEL ÁTOMO — todo lo que se sabe (y lo que FALTA) de UNA unidad, más su análisis.

Orden founder (07-15): "cada depa abre su ficha completa; incluye datos que yo no he
puesto; universalidad; ¿qué motor analiza esta data?".

UNIVERSALIDAD: la ficha se arma desde el REGISTRO `SECCIONES` — un campo nuevo = un
renglón (label + de dónde sale + quién lo llena si falta). El front solo pinta lo que
el registro dicta; los campos sin dato salen como FALTA honesta, jamás se inventan.

EL MOTOR (analisis_atomo): posición de la unidad contra su contexto —
  · vs su MOLDE: ¿paga premium o está barata contra sus gemelas? (plano idéntico)
  · vs su PISO: ¿cara o barata para su altura?
  · percentil de $/m² dentro del desarrollo
  · GEMELAS disponibles (mismo molde) y cuál es la más barata
  · demanda: búsquedas reales del marketplace que le quedan a ESTA unidad
  · eficiencia de exteriores (m² afuera ÷ m² totales)
  · su historia en la bitácora (edad, cambios de precio, estatus)

Lógica pura testeable; Mongo solo en ficha_unidad(). $0, sin IA.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from corte_engine import _busca_compatible


def _fmt_m2(v):
    return f"{v:g} m²" if v else None


def _fmt_mxn(v):
    return f"${v:,.0f}" if v else None


def _fmt_pct(v):
    return f"{v:g}%" if v is not None else None


# ─── EL REGISTRO (universalidad: campo nuevo = renglón nuevo) ─────────────────
# (label, extractor(u, molde, programa), quien_llena_si_falta)
SECCIONES: List[Dict[str, Any]] = [
    {"titulo": "Medidas", "campos": [
        ("m² habitables", lambda u, m, p: _fmt_m2(u.get("m2_privative") or u.get("size_m2")), "lista de precios"),
        ("m² balcón", lambda u, m, p: _fmt_m2(u.get("m2_balcony")), "lista de precios"),
        ("m² terraza", lambda u, m, p: _fmt_m2(u.get("m2_terrace")), "lista de precios"),
        ("m² roof garden", lambda u, m, p: _fmt_m2(u.get("m2_roof_garden")), "lista de precios"),
        ("m² patio", lambda u, m, p: _fmt_m2(u.get("patio_m2")), "lista de precios"),
        ("m² totales", lambda u, m, p: _fmt_m2(u.get("m2_total") or u.get("size_m2_total")), "lista de precios"),
    ]},
    {"titulo": "Programa", "campos": [
        ("Recámaras", lambda u, m, p: u.get("bedrooms"), "lista de precios"),
        ("Recámara FLEX", lambda u, m, p: ("sí — el plano dibuja la conversión" if (p or {}).get("flex_visual") else None), "plano del arquitecto"),
        ("Baños", lambda u, m, p: u.get("bathrooms"), "lista de precios"),
        ("Cuarto de servicio", lambda u, m, p: {"si": "sí", "": None}.get(str(u.get("cuarto_servicio") or "").lower(), u.get("cuarto_servicio")), "lista de precios"),
        ("Amueblado", lambda u, m, p: {"si": "sí", "no": "no"}.get(str(u.get("amueblado") or "").lower()), "lista de precios"),
        ("Espacios (del plano)", lambda u, m, p: " · ".join((p or {}).get("espacios_detalle") or []) or None, "plano / planta tipo"),
    ]},
    {"titulo": "Estacionamiento y bodega", "campos": [
        ("Cajones", lambda u, m, p: u.get("parking_spots"), "lista de precios"),
        ("Tipo de cajón", lambda u, m, p: u.get("parking_type"), "el desarrollador"),
        ("Bodega", lambda u, m, p: u.get("bodega") or u.get("storage"), "lista de precios"),
    ]},
    {"titulo": "Posición en el edificio", "campos": [
        ("Torre", lambda u, m, p: (u.get("unit_number") or "")[:1] if (u.get("unit_number") or "")[:1].isalpha() else None, "número de unidad"),
        ("Piso", lambda u, m, p: u.get("level"), "lista de precios"),
        ("Orientación", lambda u, m, p: u.get("orientacion"), "tú, desde el plano de conjunto (editable en la torre)"),
        ("Vista", lambda u, m, p: u.get("vista"), "tú o el desarrollador (editable en la torre)"),
        ("Molde", lambda u, m, p: (m or {}).get("nombre"), "el conciliador"),
        ("Plano propio", lambda u, m, p: ("sí — " + str(u.get("plano_fuente") or "")) if u.get("plano_url") else None, "carpeta de planos del dev"),
    ]},
    {"titulo": "Dinero", "campos": [
        ("Precio", lambda u, m, p: _fmt_mxn(u.get("price_mxn") or u.get("price")), "lista de precios"),
        ("$/m²", lambda u, m, p: _fmt_mxn(round((u.get("price_mxn") or u.get("price")) / (u.get("size_m2") or u.get("m2_total")))) if (u.get("price_mxn") or u.get("price")) and (u.get("size_m2") or u.get("m2_total")) else None, "cálculo"),
        ("Enganche", lambda u, m, p: (_fmt_mxn(u.get("enganche_mxn")) or "") + (f" ({_fmt_pct(u.get('enganche_pct'))})" if u.get("enganche_pct") else "") or None, "lista de precios"),
        ("Crédito", lambda u, m, p: (_fmt_mxn(u.get("credito_mxn")) or "") + (f" ({_fmt_pct(u.get('credito_pct'))})" if u.get("credito_pct") else "") or None, "lista de precios"),
        ("Reservación", lambda u, m, p: _fmt_mxn(u.get("reservacion_mxn"))
         or _del_esquema(u, "apartado_mxn", _fmt_mxn), "esquema del dev"),
        ("A la firma / contrato", lambda u, m, p: _fmt_mxn(u.get("contrato_mxn"))
         or _del_esquema(u, "firma_pct", _fmt_pct), "esquema del dev"),
        ("A diferir (mensualidades)", lambda u, m, p: _fmt_mxn(u.get("a_diferir_mxn"))
         or _del_esquema(u, "mensualidades_pct", _fmt_pct), "esquema del dev"),
        ("Escritura", lambda u, m, p: _fmt_mxn(u.get("escritura_mxn"))
         or _del_esquema(u, "escritura_pct", _fmt_pct), "esquema del dev"),
        ("Mantenimiento", lambda u, m, p: _fmt_mxn(u.get("mantenimiento_mxn")), "el desarrollador"),
    ]},
    {"titulo": "Acabados y extras", "campos": [
        ("Nivel de acabados", lambda u, m, p: u.get("acabados"), "el desarrollador"),
        ("Altura de techo", lambda u, m, p: u.get("altura_techo_m"), "el desarrollador / plano"),
        ("Balcón orientado a", lambda u, m, p: u.get("balcon_orientacion"), "plano de conjunto"),
        ("Notas de la lista", lambda u, m, p: u.get("notas"), "lista de precios"),
    ]},
]


def _del_esquema(u, campo, fmt):
    """Si la unidad no trae el dato, hereda del ESQUEMA DE PAGO del desarrollo — etiquetado."""
    v = (u.get("_pago_dev") or {}).get(campo)
    return f"{fmt(v)} (esquema del desarrollo)" if v else None


def armar_ficha(u: Dict[str, Any], molde: Optional[Dict[str, Any]],
                programa: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Registro → secciones pintables. Lo que no hay sale como FALTA con quién lo llena."""
    out = []
    for sec in SECCIONES:
        campos = []
        for label, fn, quien in sec["campos"]:
            try:
                v = fn(u, molde, programa)
            except Exception:  # noqa: BLE001 — un extractor roto no tira la ficha
                v = None
            campos.append({"label": label, "valor": v if v not in (None, "") else None,
                           "quien_llena": quien if v in (None, "") else None})
        out.append({"titulo": sec["titulo"], "campos": campos})
    return out


# ─── EL MOTOR: la posición del átomo contra su contexto ───────────────────────
def analisis_atomo(u: Dict[str, Any], gemelas: List[Dict[str, Any]],
                   mismo_piso: List[Dict[str, Any]], todas: List[Dict[str, Any]],
                   busquedas: List[Dict[str, Any]],
                   eventos: List[Dict[str, Any]]) -> Dict[str, Any]:
    precio = u.get("price_mxn") or u.get("price")
    m2 = u.get("size_m2") or u.get("m2_total")
    pm2 = precio / m2 if precio and m2 else None

    def _pm2(x):
        px, mx = x.get("price_mxn") or x.get("price"), x.get("size_m2") or x.get("m2_total")
        return px / mx if px and mx else None

    out: Dict[str, Any] = {"pm2": round(pm2) if pm2 else None}

    # vs sus GEMELAS (mismo molde = plano idéntico): ¿premium o ganga?
    pm2_gem = sorted([_pm2(g) for g in gemelas if _pm2(g)])
    if pm2 and pm2_gem:
        med = pm2_gem[len(pm2_gem) // 2]
        out["vs_molde_pct"] = round((pm2 - med) * 100 / med, 1)
    disp_gem = [g for g in gemelas if (g.get("status") or "").lower() in
                ("disponible", "available", "")]
    if disp_gem:
        barata = min(disp_gem, key=lambda g: g.get("price_mxn") or g.get("price") or 9e12)
        out["gemelas_disponibles"] = len(disp_gem)
        out["gemela_mas_barata"] = {"unidad": barata.get("unit_number"),
                                    "precio": barata.get("price_mxn") or barata.get("price"),
                                    "piso": barata.get("level")}

    # vs su PISO (misma altura, otros planos)
    pm2_piso = [_pm2(x) for x in mismo_piso if _pm2(x) and x.get("id") != u.get("id")]
    if pm2 and pm2_piso:
        prom = sum(pm2_piso) / len(pm2_piso)
        out["vs_piso_pct"] = round((pm2 - prom) * 100 / prom, 1)

    # percentil de $/m² en el desarrollo (0 = la más barata)
    pm2_todas = sorted([_pm2(x) for x in todas if _pm2(x)])
    if pm2 and pm2_todas:
        out["percentil_pm2"] = round(sum(1 for x in pm2_todas if x <= pm2) * 100
                                     / len(pm2_todas))

    # demanda REAL que le queda a ESTA unidad
    colonia_u = u.get("_colonia_id") or u.get("colonia_id") or ""
    out["busquedas_compatibles"] = sum(
        1 for b in busquedas if _busca_compatible(b, u, colonia_u))

    # eficiencia de exteriores
    ext = sum(u.get(k) or 0 for k in ("m2_balcony", "m2_terrace", "m2_roof_garden",
                                      "patio_m2"))
    tot = u.get("m2_total") or u.get("size_m2_total")
    if ext and tot:
        out["exterior_pct"] = round(ext * 100 / tot, 1)

    # su historia en la bitácora
    evs = sorted(eventos, key=lambda e: str(e.get("ts")))
    if evs:
        out["primera_foto"] = str(evs[0].get("ts"))[:10]
        precios_hist = [e.get("precio") for e in evs if e.get("precio")]
        out["cambios_de_precio"] = max(0, len(set(precios_hist)) - 1)
        out["fotos_en_bitacora"] = len(evs)
    return out


# ─── acceso a datos ───────────────────────────────────────────────────────────
async def ficha_unidad(db, unit_id: str) -> Optional[Dict[str, Any]]:
    u = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not u:
        return None
    dev = await db.developments.find_one({"id": u.get("development_id")}, {"_id": 0}) or {}
    molde = await db.dmx_prototypes.find_one({"prototype_id": u.get("prototype_id")},
                                             {"_id": 0}) if u.get("prototype_id") else None
    programa = await db.molde_programa.find_one({"prototype_id": u.get("prototype_id")},
                                                {"_id": 0}) if u.get("prototype_id") else None
    from unidades_efectivas import unidades_efectivas
    todas = await unidades_efectivas(db, {"development_id": u.get("development_id")})
    u = next((x for x in todas if x.get("id") == unit_id), u)   # la unidad, ya fusionada
    gemelas = [x for x in todas if x.get("prototype_id") == u.get("prototype_id")
               and x.get("id") != unit_id]
    mismo_piso = [x for x in todas if x.get("level") == u.get("level")]
    busquedas = await db.marketplace_searches.find({}, {"_id": 0}).to_list(5000)
    eventos = await db.oferta_timeline.find({"unit_id": unit_id}, {"_id": 0}).to_list(500)
    posicion = posiciones_por_molde(todas).get(unit_id)   # la MISMA lectura que la Torre
    pagos = await db.dev_payment_schemes.find_one({"project_id": u.get("development_id")},
                                                  {"_id": 0}) or {}
    u["_pago_dev"] = (pagos.get("schemes") or [{}])[0]
    u["_colonia_id"] = u.get("colonia_id") or dev.get("colonia_id") or ""
    return {
        "unidad": {"id": unit_id, "numero": u.get("unit_number"),
                   "estatus": (u.get("status") or "disponible").lower(),
                   "recamaras": u.get("bedrooms"), "banos": u.get("bathrooms"),
                   "m2": u.get("size_m2") or u.get("m2_total"), "piso": u.get("level"),
                   "desarrollo": dev.get("name"), "development_id": u.get("development_id"),
                   "plano_url": u.get("plano_url"),
                   "plano_amueblado_url": (molde or {}).get("plano_amueblado_url")},
        "secciones": armar_ficha(u, molde, programa),
        "analisis": {**analisis_atomo(u, gemelas, mismo_piso, todas, busquedas, eventos),
                     **({"vs_molde_ajustado_pct": posicion["vs_molde_pct"],
                         "banda": posicion["banda"], "metodo_posicion": posicion["metodo"]}
                        if posicion else {})},
        "molde": {"nombre": (molde or {}).get("nombre"),
                  "estado": (molde or {}).get("estado"),
                  "unidades_total": (molde or {}).get("unidades_total")} if molde else None,
    }


# ─── EL SEMÁFORO DEL CATÁLOGO: posición de CADA unidad vs sus gemelas, en bulk ─
UMBRAL_GANGA_PCT = -3.0     # ≤ −3% vs la mediana de su molde = ganga (verde)
UMBRAL_PREMIUM_PCT = 3.0    # ≥ +3% = premium (ámbar) — mismos umbrales que la ficha


def _pm2_de(x) -> Optional[float]:
    px, mx = x.get("price_mxn") or x.get("price"), x.get("size_m2") or x.get("m2_total")
    return px / mx if px and mx else None


def posiciones_por_molde(units: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """{unit_id: {vs_molde_pct, banda, metodo}} — v2 (07-15): AJUSTADO POR PISO.
    Dentro del molde el plano es idéntico pero subir de piso cuesta más: comparar contra
    la mediana cruda hacía ver 'ganga' a un piso 3 que solo tenía su descuento natural.
    v2 ajusta una recta $/m² ~ piso (mínimos cuadrados) y clasifica por el RESIDUO:
    lo que la unidad cuesta vs lo que DEBERÍA costar en SU piso. Honesto: con <4 gemelas
    o sin variación de pisos cae al método anterior (mediana), etiquetado en `metodo`."""
    por_molde: Dict[str, List[Dict[str, Any]]] = {}
    for u in units:
        if u.get("prototype_id"):
            por_molde.setdefault(u["prototype_id"], []).append(u)
    out: Dict[str, Dict[str, Any]] = {}
    for us in por_molde.values():
        con_dato = [(u, _pm2_de(u)) for u in us if _pm2_de(u)]
        if len(con_dato) < 2:
            continue                      # sin gemelas no hay comparación honesta
        con_piso = [(u, v) for u, v in con_dato if u.get("level") is not None]
        pisos = {u.get("level") for u, _ in con_piso}
        ajustar = len(con_piso) >= 4 and len(pisos) >= 3

        def _recta_sin(uid):
            """Recta $/m² ~ piso ajustada SIN la unidad juzgada (leave-one-out):
            si la propia unidad entra al ajuste, su outlier se auto-diluye."""
            pts = [(float(u["level"]), v) for u, v in con_piso if u.get("id") != uid]
            if len(pts) < 3 or len({x for x, _ in pts}) < 2:
                return None
            n = len(pts)
            mx = sum(x for x, _ in pts) / n
            my = sum(y for _, y in pts) / n
            sxx = sum((x - mx) ** 2 for x, _ in pts)
            if sxx <= 0:
                return None
            b = sum((x - mx) * (y - my) for x, y in pts) / sxx
            return lambda piso: (my - b * mx) + b * piso

        pm2s = sorted(v for _, v in con_dato)
        med = pm2s[len(pm2s) // 2]
        for u, v in con_dato:
            recta = _recta_sin(u.get("id")) if ajustar and u.get("level") is not None else None
            if recta is not None:
                ref = recta(float(u["level"]))
                metodo = "ajustado_piso"
            else:
                ref, metodo = med, "mediana"
            if not ref or ref <= 0:
                continue
            pct = round((v - ref) * 100 / ref, 1)
            banda = ("ganga" if pct <= UMBRAL_GANGA_PCT
                     else "premium" if pct >= UMBRAL_PREMIUM_PCT else "normal")
            out[u["id"]] = {"vs_molde_pct": pct, "banda": banda, "metodo": metodo}
    return out


async def gangas_catalogo(db, solo_disponibles: bool = True,
                          limite: int = 10) -> List[Dict[str, Any]]:
    """Las mejores gangas del catálogo completo (para El Parte y el radar)."""
    from unidades_efectivas import unidades_efectivas
    units = await unidades_efectivas(db, {})
    pos = posiciones_por_molde(units)
    devs = {d["id"]: d.get("name") for d in await db.developments.find(
        {}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    filas = []
    for u in units:
        p = pos.get(u.get("id"))
        if not p or p["banda"] != "ganga":
            continue
        if solo_disponibles and (u.get("status") or "disponible").lower() not in (
                "disponible", "available"):
            continue
        filas.append({"unidad": u.get("unit_number"), "unit_id": u.get("id"),
                      "desarrollo": devs.get(u.get("development_id")),
                      "development_id": u.get("development_id"),
                      "piso": u.get("level"), "vs_molde_pct": p["vs_molde_pct"],
                      "precio": u.get("price_mxn") or u.get("price")})
    return sorted(filas, key=lambda f: f["vs_molde_pct"])[:limite]
