"""
ola_d_engines.py — OLA D del genoma: TIEMPO + FINANZAS (GENOMA_DEMANDA_BLUEPRINT.md).

La bitácora unificada + la absorción viva son el cimiento; estos 8 motores los convierten en
lectura de futuro y de dinero:

  D1 indice_adelantado()   — señales que PRECEDEN al precio (momentum de demanda, tensión,
                             absorción, presión de precio) → índice 0-100 por colonia.
  D2 reloj_ciclo()         — fase del ciclo (recuperación/expansión/sobreoferta/contracción)
                             por dos ejes medidos + score de burbuja honesto.
  D3 accesibilidad()       — tasa BANXICO viva × precio mediano → mensualidad, ingreso
                             requerido y sensibilidad ±200pb, por colonia.
  D4 termometro_leads()    — temperatura 0-100 por visitante (recencia×frecuencia×profundidad×
                             especificidad×finanzas) + termómetro del mercado.
  D5 cap_rate_renta()      — cap rate / renta estimada / comprar-vs-rentar por colonia
                             (REUSA rentability_from_pm2 — no duplica).
  D6 cronobiologia()       — cuándo desea el mercado: hora × día × mes del deseo.
  D7 elasticidad_impuestos() — elasticidad promocional OBSERVADA (bajas de precio → Δinterés)
                             + neto post-impuestos del vendedor (REUSA _isr_art126_core).
  D8 curva_obra()          — la prima por etapa de obra: $/m² preventa → entrega, por dato.

REGLAS: universalidad (registros, no ifs; dimensiones descubiertas del dato), hipersegmentación
(colonias × cortes × granularidad donde aplica), FAIL-OPEN, es_estimado honesto cuando la
bitácora es joven. Superadmin-only en superficie (bloques del menú + rutas /genoma/*).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.ola_d")


def _ahora():
    return datetime.now(timezone.utc)


def _ts_dt(ts) -> Optional[datetime]:
    try:
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts
    except Exception:
        return None


def _med(vals: List[float]) -> Optional[float]:
    s = sorted(v for v in vals if v is not None)
    return s[len(s) // 2] if s else None


async def _atomos_ventanas(db, colonias: Optional[Set[str]], dias: int = 30):
    """Visitantes únicos por colonia en dos ventanas consecutivas (0-dias vs dias-2*dias) —
    el pulso de la demanda. Una pasada, fail-open."""
    ahora = _ahora()
    c1, c2 = ahora - timedelta(days=dias), ahora - timedelta(days=2 * dias)
    recientes: Dict[str, Set[str]] = {}
    previos: Dict[str, Set[str]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "colonia": 1, "visitor_id": 1, "ts": 1}):
            col = a.get("colonia")
            if not col or col.startswith("_") or (colonias and col not in colonias):
                continue   # '_sin_colonia' es demanda real pero NO una colonia rankeable
            dt = _ts_dt(a.get("ts"))
            v = a.get("visitor_id") or "?"
            if dt is None or dt >= c1:
                recientes.setdefault(col, set()).add(v)   # sin ts = fail-open a reciente
            elif dt >= c2:
                previos.setdefault(col, set()).add(v)
    except Exception as e:
        log.warning("[ola_d] atomos fail-open: %s", e)
    return recientes, previos


# ═══ D1 · ÍNDICE ADELANTADO DE PLUSVALÍA ═══════════════════════════════════════
# REGISTRO de componentes (universalidad: uno nuevo = una entrada, el índice lo absorbe solo).
# Cada componente devuelve 0-100 (50 = neutro) por colonia; el índice es el promedio ponderado.
def _score_ratio(actual: float, previo: float) -> float:
    """Crecimiento → score: sin cambio=50, +100%=100, -100%=0 (acotado)."""
    if previo <= 0:
        return 75.0 if actual > 0 else 50.0
    g = (actual - previo) / previo
    return max(0.0, min(100.0, 50.0 + g * 50.0))


async def indice_adelantado(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    from market_timeline import transiciones

    recientes, previos = await _atomos_ventanas(db, colonias)
    unidades = await _oferta_vectores(db, colonias)
    disp: Dict[str, int] = {}
    for u in unidades:
        if u.get("disponible"):
            disp[u["colonia"]] = disp.get(u["colonia"], 0) + 1

    tr = await transiciones(db, colonias=colonias, limite=100000)
    alzas: Dict[str, int] = {}
    bajas: Dict[str, int] = {}
    salidas: Dict[str, int] = {}
    for t in tr.get("transiciones", []):
        c = t.get("colonia")
        if t.get("campo") == "precio" and t.get("direccion") == "alza":
            alzas[c] = alzas.get(c, 0) + 1
        elif t.get("campo") == "precio" and t.get("direccion") == "baja":
            bajas[c] = bajas.get(c, 0) + 1
        elif t.get("tipo") == "salida":
            salidas[c] = salidas.get(c, 0) + 1

    cols = set(recientes) | set(disp)
    filas = []
    for c in sorted(cols):
        n_rec, n_prev = len(recientes.get(c, ())), len(previos.get(c, ()))
        d = disp.get(c, 0)
        componentes = {
            # cada uno 0-100; el REGISTRO es este dict — agregar componente = agregar llave
            "momentum_demanda": round(_score_ratio(n_rec, n_prev), 1),
            "tension": round(min(100.0, (n_rec / d) * 100.0), 1) if d else (75.0 if n_rec else 50.0),
            "absorcion": round(min(100.0, (salidas.get(c, 0) / d) * 400.0), 1) if d else 50.0,
            "presion_precio": round(50.0 + 50.0 * (
                (alzas.get(c, 0) - bajas.get(c, 0)) / max(1, alzas.get(c, 0) + bajas.get(c, 0)))
                , 1),
        }
        indice = round(sum(componentes.values()) / len(componentes), 1)
        filas.append({"colonia": c, "indice": indice, **componentes,
                      "visitantes_30d": n_rec, "disponibles": d,
                      "es_estimado": n_rec < 3})
    filas.sort(key=lambda x: -x["indice"])
    return {"n_colonias": len(filas), "filas": filas[:40],
            "es_estimado": not filas,
            "lectura": (f"Índice adelantado #1: {filas[0]['colonia']} ({filas[0]['indice']}/100) — "
                        f"las señales de demanda PRECEDEN al precio; esto es lo que 4S no puede medir.")
                       if filas else "Sin señal suficiente aún — el índice madura con la bitácora."}


# ═══ D2 · RELOJ DE CICLO + BURBUJA ═════════════════════════════════════════════
# Dos ejes MEDIDOS: presión de precio (alzas vs bajas) × presión de inventario (altas vs salidas).
# REGISTRO de fases (universal: el cuadrante decide, no un if por colonia).
_FASES = {
    (True, False): ("expansion", "9-12h: precios subiendo con inventario absorbiéndose — la fase dulce"),
    (True, True): ("sobreoferta_en_formacion", "12-3h: precios aún suben pero el inventario crece — cuidado"),
    (False, True): ("contraccion", "3-6h: precios cediendo con inventario creciendo — compradores mandan"),
    (False, False): ("recuperacion", "6-9h: precios abajo pero el inventario se seca — la ventana de entrada"),
}


async def reloj_ciclo(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    from market_timeline import transiciones, absorcion_viva
    tr = await transiciones(db, colonias=colonias, limite=100000)
    ag = tr.get("agregados") or {}
    precio = ag.get("precio") or {}
    alzas, bajas = precio.get("alzas", 0), precio.get("bajas", 0)

    ab = await absorcion_viva(db, colonias=colonias)
    serie = ab.get("serie") or []
    ult = serie[-1] if serie else {}
    altas, salidas = ult.get("altas", 0), ult.get("salidas", 0)

    precio_sube = alzas >= bajas
    inventario_crece = (altas - salidas) > 0
    fase, desc = _FASES[(precio_sube, inventario_crece)]

    recientes, previos = await _atomos_ventanas(db, colonias)
    dem_rec = len(set().union(*recientes.values())) if recientes else 0
    dem_prev = len(set().union(*previos.values())) if previos else 0
    demanda_crece = dem_rec >= dem_prev

    # burbuja: precios subiendo SIN demanda creciendo Y con inventario creciendo = aire
    burbuja = 0
    if precio_sube and not demanda_crece:
        burbuja += 50
    if precio_sube and inventario_crece:
        burbuja += 30
    if (ult.get("meses_inventario") or 0) > 12:
        burbuja += 20

    n_eventos = alzas + bajas + salidas   # las ALTAS de día-1 no son señal de ciclo
    return {"fase": fase, "descripcion": desc,
            "burbuja_score": min(100, burbuja),
            "ejes": {"alzas_precio": alzas, "bajas_precio": bajas,
                     "altas_inventario": altas, "salidas": salidas,
                     "demanda_reciente": dem_rec, "demanda_previa": dem_prev,
                     "meses_inventario": ult.get("meses_inventario")},
            "es_estimado": n_eventos < 10,
            "lectura": (f"Fase: {fase.replace('_', ' ')} · burbuja {min(100, burbuja)}/100. {desc}"
                        + (" (bitácora joven — la lectura madura con los días)" if n_eventos < 10 else ""))}


# ═══ D3 · ACCESIBILIDAD × BANXICO ══════════════════════════════════════════════
def _mensualidad(principal: float, tasa_anual: float, anos: int) -> float:
    r = tasa_anual / 12.0
    n = anos * 12
    if r <= 0:
        return principal / n
    return principal * r / (1 - (1 + r) ** -n)


def _tasa_hipotecaria() -> Dict[str, Any]:
    """Tasa hipotecaria de referencia — REUSA banxico_rates (CF303). FAIL-OPEN a default."""
    try:
        from banxico_rates import DEFAULT_RATES
        d = DEFAULT_RATES.get("hipoteca_fija_ref") or {}
        return {"tasa": float(d.get("valor", 0.1146)), "fuente": d.get("fuente", "default"),
                "as_of": d.get("as_of")}
    except Exception:
        return {"tasa": 0.1146, "fuente": "default documentado", "as_of": None}


async def accesibilidad(db, colonias: Optional[Set[str]] = None,
                        enganche_pct: float = 20.0, plazo_anos: int = 20,
                        ingreso_pct_vivienda: float = 30.0) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    t = _tasa_hipotecaria()
    unidades = await _oferta_vectores(db, colonias)
    precios: Dict[str, List[float]] = {}
    for u in unidades:
        if u.get("disponible") and (u.get("precio") or 0) >= 100000:   # precio basura fuera
            precios.setdefault(u["colonia"], []).append(u["precio"])

    filas = []
    for c, ps in sorted(precios.items()):
        p = _med(ps)
        credito = p * (1 - enganche_pct / 100.0)
        m = _mensualidad(credito, t["tasa"], plazo_anos)
        filas.append({"colonia": c, "n": len(ps), "precio_mediano": round(p),
                      "enganche": round(p * enganche_pct / 100.0),
                      "mensualidad": round(m),
                      "ingreso_requerido": round(m / (ingreso_pct_vivienda / 100.0))})
    filas.sort(key=lambda x: x["mensualidad"])

    # sensibilidad de la mediana de la ciudad a la tasa (±200pb) — el termostato BANXICO
    p_ciudad = _med([f["precio_mediano"] for f in filas]) or 0
    credito = p_ciudad * (1 - enganche_pct / 100.0)
    sensibilidad = [{"tasa_pct": round((t["tasa"] + pb / 10000.0) * 100, 2),
                     "delta_pb": pb,
                     "mensualidad": round(_mensualidad(credito, t["tasa"] + pb / 10000.0, plazo_anos))}
                    for pb in (-200, -100, 0, 100, 200)] if p_ciudad else []
    return {"tasa": {"anual_pct": round(t["tasa"] * 100, 2), "fuente": t["fuente"], "as_of": t["as_of"]},
            "supuestos": {"enganche_pct": enganche_pct, "plazo_anos": plazo_anos,
                          "ingreso_pct_vivienda": ingreso_pct_vivienda},
            "filas": filas[:40], "sensibilidad_ciudad": sensibilidad,
            "es_estimado": not filas,
            "lectura": (f"Con tasa {round(t['tasa']*100,2)}% ({t['fuente']}): la colonia más accesible es "
                        f"{filas[0]['colonia']} (mensualidad ${filas[0]['mensualidad']:,}, ingreso requerido "
                        f"${filas[0]['ingreso_requerido']:,}/mes).") if filas else "Sin inventario con precio."}


# ═══ D4 · TERMÓMETRO + TEMPERATURA DE LEAD ═════════════════════════════════════
# REGISTRO de factores (universalidad): cada uno devuelve 0-100; temperatura = promedio ponderado.
_PESOS_TEMPERATURA = {"recencia": 0.30, "frecuencia": 0.20, "profundidad": 0.25,
                      "especificidad": 0.15, "finanzas": 0.10}
_BANDAS_TEMPERATURA = [(75, "hirviendo"), (50, "caliente"), (25, "tibio"), (0, "frio")]


async def termometro_leads(db, colonias: Optional[Set[str]] = None, dias: int = 45) -> Dict[str, Any]:
    from demand_genome import PESO_SENAL
    ahora = _ahora()
    corte = ahora - timedelta(days=dias)

    vis: Dict[str, Dict[str, Any]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            v = a.get("visitor_id")
            dt = _ts_dt(a.get("ts"))
            if not v or (dt and dt < corte):
                continue
            d = vis.setdefault(v, {"n": 0, "dims": set(), "ultimo": None, "peso_max": 0.0,
                                   "finanzas": False, "colonias": set()})
            d["n"] += 1
            d["dims"].add(a.get("dimension"))
            d["peso_max"] = max(d["peso_max"], float(a.get("peso", 1.0)))
            if str(a.get("dimension", "")).startswith("finanzas."):
                d["finanzas"] = True
            if a.get("colonia"):
                d["colonias"].add(a["colonia"])
            if dt and (d["ultimo"] is None or dt > d["ultimo"]):
                d["ultimo"] = dt
    except Exception as e:
        log.warning("[termometro] fail-open: %s", e)

    peso_tope = max(PESO_SENAL.values()) if PESO_SENAL else 1.0
    filas = []
    for v, d in vis.items():
        dias_desde = (ahora - d["ultimo"]).days if d["ultimo"] else dias
        factores = {
            "recencia": max(0.0, 100.0 * (1 - dias_desde / dias)),
            "frecuencia": min(100.0, d["n"] * 5.0),
            "profundidad": min(100.0, d["peso_max"] / peso_tope * 100.0),
            "especificidad": min(100.0, len(d["dims"]) * 10.0),
            "finanzas": 100.0 if d["finanzas"] else 0.0,
        }
        temp = round(sum(factores[k] * _PESOS_TEMPERATURA[k] for k in factores), 1)
        banda = next(b for umbral, b in _BANDAS_TEMPERATURA if temp >= umbral)
        filas.append({"visitor_id": v, "temperatura": temp, "banda": banda,
                      "senales": d["n"], "dimensiones": len(d["dims"]),
                      "dio_finanzas": d["finanzas"],
                      "colonias": sorted(d["colonias"])[:4],
                      **{f"f_{k}": round(fv, 0) for k, fv in factores.items()}})
    filas.sort(key=lambda x: -x["temperatura"])
    dist: Dict[str, int] = {}
    for f in filas:
        dist[f["banda"]] = dist.get(f["banda"], 0) + 1
    return {"dias_ventana": dias, "n_visitantes": len(filas),
            "distribucion": dist, "leads": filas[:25],
            "temperatura_mediana": _med([f["temperatura"] for f in filas]),
            "es_estimado": not filas,
            "lectura": (f"{len(filas)} visitantes medidos: {dist.get('hirviendo', 0)} hirviendo, "
                        f"{dist.get('caliente', 0)} calientes. El más caliente: {filas[0]['temperatura']}/100 "
                        f"({filas[0]['senales']} señales).") if filas else
                       "Sin visitantes en la ventana — el termómetro vive del tráfico real."}


# ═══ D5 · CAP RATE + COMPRAR-VS-RENTAR ═════════════════════════════════════════
async def cap_rate_renta(db, colonias: Optional[Set[str]] = None,
                         enganche_pct: float = 20.0, plazo_anos: int = 20) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    t = _tasa_hipotecaria()
    unidades = await _oferta_vectores(db, colonias)
    por_col: Dict[str, Dict[str, List[float]]] = {}
    for u in unidades:
        if u.get("disponible") and (u.get("precio") or 0) >= 100000 and u.get("m2"):
            d = por_col.setdefault(u["colonia"], {"pm2": [], "precio": [], "m2": []})
            d["pm2"].append(u["precio"] / u["m2"])
            d["precio"].append(u["precio"])
            d["m2"].append(u["m2"])

    filas = []
    for c, d in sorted(por_col.items()):
        pm2, precio, m2 = _med(d["pm2"]), _med(d["precio"]), _med(d["m2"])
        renta = None
        try:   # REUSA el motor canónico de rentabilidad del cubo (no duplica supuestos)
            from dmx_cube_feed import rentability_from_pm2
            renta = rentability_from_pm2(pm2, "B", m2=m2 or 70.0)
        except Exception as e:
            log.warning("[cap_rate] rentabilidad fail-open: %s", e)
        if not renta:
            continue
        renta_mensual = (renta.get("renta_m2") or 0) * (m2 or 0)
        mens = _mensualidad(precio * (1 - enganche_pct / 100.0), t["tasa"], plazo_anos)
        filas.append({"colonia": c, "n": len(d["precio"]),
                      "precio_mediano": round(precio), "pm2_mediano": round(pm2),
                      "cap_rate_pct": renta.get("cap_rate_pct"),
                      "renta_mensual_est": round(renta_mensual),
                      "mensualidad_hipoteca": round(mens),
                      # >1: la hipoteca cuesta más que rentar (comprar es apuesta de plusvalía)
                      "comprar_entre_rentar": round(mens / renta_mensual, 2) if renta_mensual else None,
                      "price_to_rent": round(precio / (renta_mensual * 12), 1) if renta_mensual else None,
                      "es_estimado": bool(renta.get("es_estimado", True))})
    filas.sort(key=lambda x: -(x["cap_rate_pct"] or 0))
    return {"tasa_hipoteca_pct": round(t["tasa"] * 100, 2), "filas": filas[:40],
            "es_estimado": not filas,
            "lectura": (f"Mejor cap rate: {filas[0]['colonia']} ({filas[0]['cap_rate_pct']}%). "
                        f"Renta estimada por perfil de zona — se vuelve medida cuando ingestemos rentas.")
                       if filas else "Sin inventario con precio y m²."}


# ═══ D6 · CRONOBIOLOGÍA DEL DESEO ══════════════════════════════════════════════
_DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


async def cronobiologia(db, colonias: Optional[Set[str]] = None, dias: int = 90) -> Dict[str, Any]:
    from zoneinfo import ZoneInfo
    tz_mx = ZoneInfo("America/Mexico_City")   # el founder lee horas de CDMX, no UTC
    corte = _ahora() - timedelta(days=dias)
    por_hora: Dict[int, int] = {}
    por_dia: Dict[str, int] = {}
    por_mes: Dict[str, int] = {}
    n = 0
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "colonia": 1, "ts": 1}):
            if colonias and a.get("colonia") not in colonias:
                continue
            dt = _ts_dt(a.get("ts"))
            if dt is None or dt < corte:
                continue
            dt = dt.astimezone(tz_mx)
            n += 1
            por_hora[dt.hour] = por_hora.get(dt.hour, 0) + 1
            por_dia[_DIAS_SEMANA[dt.weekday()]] = por_dia.get(_DIAS_SEMANA[dt.weekday()], 0) + 1
            por_mes[dt.isoformat()[:7]] = por_mes.get(dt.isoformat()[:7], 0) + 1
    except Exception as e:
        log.warning("[cronobiologia] fail-open: %s", e)

    pico_h = max(por_hora, key=por_hora.get) if por_hora else None
    pico_d = max(por_dia, key=por_dia.get) if por_dia else None
    return {"dias_ventana": dias, "n_senales": n,
            "por_hora": [{"hora": f"{h:02d}:00", "senales": por_hora[h]} for h in sorted(por_hora)],
            "por_dia_semana": [{"dia": d, "senales": por_dia[d]} for d in _DIAS_SEMANA if d in por_dia],
            "por_mes": [{"mes": m, "senales": por_mes[m]} for m in sorted(por_mes)],
            "pico": {"hora": f"{pico_h:02d}:00" if pico_h is not None else None, "dia": pico_d},
            "es_estimado": n < 20,
            "lectura": (f"El deseo despierta los {pico_d} a las {pico_h:02d}:00 (hora CDMX) — "
                        f"ahí valen más las campañas y las respuestas rápidas.") if n else
                       "Sin señales en la ventana."}


# ═══ D7 · ELASTICIDAD PROMOCIONAL + POST-IMPUESTOS ═════════════════════════════
async def elasticidad_impuestos(db, colonias: Optional[Set[str]] = None,
                                dias_ventana: int = 14, anios_tenencia: int = 5,
                                plusvalia_anual_pct: float = 7.0,
                                inflacion_anual_pct: float = 4.0) -> Dict[str, Any]:
    from market_timeline import transiciones
    # 1) ELASTICIDAD OBSERVADA: bajas de precio → ¿el interés (unit_views) despertó?
    tr = await transiciones(db, colonias=colonias, tipo="cambio", campo="precio", limite=100000)
    bajas = [x for x in tr.get("transiciones", []) if x.get("direccion") == "baja"]
    vistas: Dict[str, List[datetime]] = {}
    try:
        async for s in db.buyer_signals.find({"type": "unit_view"}, {"_id": 0, "entity_id": 1, "created_at_dt": 1}):
            dt = _ts_dt(s.get("created_at_dt"))
            if dt and s.get("entity_id"):
                vistas.setdefault(str(s["entity_id"]), []).append(dt)
    except Exception as e:
        log.warning("[elasticidad] signals fail-open: %s", e)

    casos = []
    for b in bajas:
        dt = _ts_dt(b.get("ts"))
        if dt is None:
            continue
        vs = vistas.get(str(b.get("unit_id")), [])
        antes = sum(1 for v in vs if dt - timedelta(days=dias_ventana) <= v < dt)
        despues = sum(1 for v in vs if dt <= v < dt + timedelta(days=dias_ventana))
        casos.append({"unit_id": b.get("unit_id"), "colonia": b.get("colonia"),
                      "descuento_pct": b.get("delta_pct"),
                      "vistas_antes": antes, "vistas_despues": despues,
                      "despertar": round((despues - antes) / antes * 100, 1) if antes else
                                   (100.0 if despues else 0.0)})
    elasticidad = {"n_bajas_observadas": len(casos),
                   "despertar_mediano_pct": _med([c["despertar"] for c in casos]),
                   "casos": sorted(casos, key=lambda x: -(x["despertar"] or 0))[:15],
                   "es_estimado": len(casos) < 3,
                   "ventana_dias": dias_ventana}

    # 2) POST-IMPUESTOS: neto del vendedor por colonia (REUSA el núcleo canónico art. 126)
    from demand_mirror import _oferta_vectores
    unidades = await _oferta_vectores(db, colonias)
    precios: Dict[str, List[float]] = {}
    for u in unidades:
        if u.get("disponible") and (u.get("precio") or 0) >= 100000:
            precios.setdefault(u["colonia"], []).append(u["precio"])
    neto_filas = []
    try:
        from tax_projector_engine import _isr_art126_core
        factor = (1 + inflacion_anual_pct / 100.0) ** anios_tenencia
        for c, ps in sorted(precios.items()):
            venta = _med(ps)
            compra = venta / ((1 + plusvalia_anual_pct / 100.0) ** anios_tenencia)
            r = _isr_art126_core(compra, venta, 0.30, anios_tenencia, factor)
            isr = float(r.get("isr") or r.get("isr_total") or 0)
            neto_filas.append({"colonia": c, "precio_venta_mediano": round(venta),
                               "compra_implicita": round(compra),
                               "isr_estimado": round(isr),
                               "neto_vendedor": round(venta - isr),
                               "tasa_efectiva_pct": round(isr / max(1, venta - compra) * 100, 1)})
    except Exception as e:
        log.warning("[post_impuestos] fail-open: %s", e)
    return {"elasticidad": elasticidad,
            "post_impuestos": {"supuestos": {"anios_tenencia": anios_tenencia,
                                             "plusvalia_anual_pct": plusvalia_anual_pct,
                                             "inflacion_anual_pct": inflacion_anual_pct,
                                             "metodo": "art. 126 LISR (núcleo canónico)"},
                               "filas": neto_filas[:40]},
            "es_estimado": elasticidad["es_estimado"] and not neto_filas,
            "lectura": ((f"{len(casos)} bajas de precio observadas; el interés despierta "
                         f"{elasticidad['despertar_mediano_pct']}% (mediana) tras un descuento. ")
                        if casos else "Aún sin bajas de precio en la bitácora para medir elasticidad. ")
                       + (f"Neto post-ISR calculado para {len(neto_filas)} colonias." if neto_filas else "")}


# ═══ D8 · CURVA DE OBRA (la prima por etapa) ═══════════════════════════════════
_ORDEN_ETAPAS = ["preventa", "obra", "construccion", "entrega_inmediata", "inmediata", "terminado"]


async def curva_obra(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    from demand_mirror import _oferta_vectores
    stage_por_dev: Dict[str, str] = {}
    try:
        async for d in db.developments.find({}, {"_id": 0, "id": 1, "stage": 1}):
            if d.get("id"):
                stage_por_dev[str(d["id"])] = str(d.get("stage") or "preventa").lower()
    except Exception as e:
        log.warning("[curva_obra] devs fail-open: %s", e)
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            stage_por_dev.setdefault(str(d.get("id")), str(d.get("stage") or "preventa").lower())
    except Exception:
        pass

    unidades = await _oferta_vectores(db, colonias)
    pm2_por_etapa: Dict[str, List[float]] = {}
    for u in unidades:
        if not (u.get("disponible") and u.get("precio") and u.get("m2")):
            continue
        etapa = stage_por_dev.get(str(u.get("dev_id")), "preventa")
        pm2_por_etapa.setdefault(etapa, []).append(u["precio"] / u["m2"])

    # etapas DESCUBIERTAS del dato (universal); el orden conocido primero, lo nuevo al final
    etapas = sorted(pm2_por_etapa,
                    key=lambda e: _ORDEN_ETAPAS.index(e) if e in _ORDEN_ETAPAS else 99)
    base = _med(pm2_por_etapa.get("preventa", [])) or None
    filas = []
    for e in etapas:
        pm2 = _med(pm2_por_etapa[e])
        filas.append({"etapa": e, "n": len(pm2_por_etapa[e]), "pm2_mediano": round(pm2),
                      "prima_vs_preventa_pct": round((pm2 / base - 1) * 100, 1) if base and e != "preventa" else 0.0})
    return {"filas": filas, "n_etapas": len(filas),
            "es_estimado": len(filas) < 2,
            "nota": "Los TIEMPOS entre etapas se medirán solos cuando la bitácora registre cambios de etapa.",
            "lectura": ((lambda pr, et: f"La prima de esperar: {et} cuesta "
                         f"{abs(pr)}% {'más' if pr >= 0 else 'MENOS'} por m² que preventa"
                         + ("" if pr >= 0 else " (mezcla de colonias distinta — compara dentro de una colonia con el filtro)")
                         + " — ese diferencial es la lectura del comprador temprano.")
                        (filas[-1]['prima_vs_preventa_pct'], filas[-1]['etapa'])) if len(filas) > 1 else
                       "Se necesitan ≥2 etapas con inventario para dibujar la curva."}
