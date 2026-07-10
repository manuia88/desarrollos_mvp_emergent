"""DMX PICKS IA — el MOAT (founder 07-09, investing.com ProPicks).

Cada recomendación se CONGELA como una PREDICCIÓN datada con tesis y precio de referencia. El track record
se acumula con el tiempo → es lo único que nadie puede copiar (necesita el histórico propietario). Empezar
a loguear HOY es el punto: build-for-endstate. 5 estrategias, ranking sobre motores REALES (zone_scores +
colonia_valoracion: plusvalía, gentrificación, yield, risk, precio m²). Idempotente por (entidad, estrategia, mes).

Colección db.dmx_picks:
  {id, entity_type: colonia|dev, entity_id, entity_name, estrategia, tesis, señal(num), precio_ref_m2,
   fecha_pick, mes, horizonte_meses, fuente, estado: vivo|cerrado, resultado: {precio_final, delta_pct, acierto}}
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.picks")

ESTRATEGIAS = ["plusvalia", "renta", "preventa", "refugio", "emergentes"]
_LABEL = {"plusvalia": "Mejor plusvalía", "renta": "Mejor renta", "preventa": "Mejor preventa",
          "refugio": "Refugio seguro", "emergentes": "Zona emergente"}
HORIZONTE_MESES = 12


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mes() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _yoy_reciente(plusvalia: Dict[str, Any]) -> Optional[float]:
    """Plusvalía interanual más reciente (%) de la serie SHF."""
    series = (plusvalia or {}).get("series") or []
    ys = [s.get("yoy_pct") for s in series if s.get("yoy_pct") is not None]
    return ys[-1] if ys else None


def _cagr(plusvalia: Dict[str, Any]) -> Optional[float]:
    series = (plusvalia or {}).get("series") or []
    vals = [s.get("valor_m2") for s in series if s.get("valor_m2")]
    if len(vals) < 2 or vals[0] <= 0:
        return None
    n = len(vals) - 1
    return round(((vals[-1] / vals[0]) ** (1 / n) - 1) * 100, 1)


async def _cargar_colonias(db) -> List[Dict[str, Any]]:
    """Une colonia_valoracion + zone_scores por colonia_id → filas rankeables."""
    zs = {}
    async for z in db.zone_scores.find({}, {"_id": 0, "zone_id": 1, "score_numeric": 1, "score_letter": 1, "components": 1}):
        zs[z.get("zone_id")] = z
    filas = []
    async for cv in db.colonia_valoracion.find(
            {"market_m2.valor": {"$ne": None}},
            {"_id": 0, "colonia_id": 1, "name": 1, "alcaldia": 1, "market_m2": 1, "plusvalia": 1, "gentrification": 1}):
        cid = cv.get("colonia_id")
        z = zs.get(cid) or {}
        comp = z.get("components") or {}
        filas.append({
            "colonia_id": cid, "name": cv.get("name") or cid, "alcaldia": cv.get("alcaldia"),
            "precio_m2": (cv.get("market_m2") or {}).get("valor"),
            "yoy": _yoy_reciente(cv.get("plusvalia")), "cagr": _cagr(cv.get("plusvalia")),
            "gentrif": (cv.get("gentrification") or {}).get("score"),
            "zscore": z.get("score_numeric"), "zletter": z.get("score_letter"),
            "yield_score": comp.get("yield_score"), "risk": comp.get("risk"), "demand": comp.get("demand"),
        })
    return filas


def _senal_y_tesis(estrategia: str, f: Dict[str, Any]):
    """(señal numérica para rankear, tesis en español) por estrategia. None = no aplica a esta colonia."""
    n = f.get("name")
    if estrategia == "plusvalia":
        yoy = f.get("yoy") if f.get("yoy") is not None else f.get("cagr")
        if yoy is None:
            return None
        # Fix auditoría: el yoy SHF es grueso (muchos empates); desempata con CAGR y zscore para que el ranking
        # sea REAL, no orden arbitrario de Mongo. El yoy sigue dominando (peso 1000).
        s = yoy * 1000 + (f.get("cagr") or 0) * 10 + (f.get("zscore") or 0)
        return s, f"{n}: plusvalía {yoy:.1f}% anual (SHF), entre las de mayor apreciación de la ciudad."
    if estrategia == "renta":
        y = f.get("yield_score")
        if y is None or y <= 50:      # 50 = stub, no señal real
            return None
        s = y * 1000 + (f.get("zscore") or 0)   # desempata el yield (a menudo constante) por calidad de zona
        return s, f"{n}: de las mejores para rentar en su zona, con precio de entrada ${f.get('precio_m2') or 0:,.0f}/m²."
    if estrategia == "refugio":
        if f.get("zscore") is None or f.get("risk") is None:
            return None
        s = f["zscore"] - (f["risk"] - 50)      # score alto + riesgo bajo
        # Fix auditoría: no llamar "consolidada" a una zona calificada bajo (D/E) — contradice la letra.
        zl = (f.get("zletter") or "")[:1]
        marco = "zona consolidada" if zl in ("A", "B", "C") else "riesgo bajo medido"
        return s, f"{n}: {marco} (calif. {f.get('zletter') or '—'}) — de las más estables para proteger capital."
    if estrategia == "emergentes":
        s = f.get("gentrif")
        if s is None:
            return None
        return s, f"{n}: gentrificación en ascenso (score {s:.0f}) — entra antes de que suba."
    return None


async def benchmark_cdmx(db) -> Dict[str, Any]:
    """EL BENCHMARK CDMX (founder 07-09, investing.com "vs el mercado"): mediana de $/m² y de plusvalía
    interanual sobre TODAS las colonias con dato. Es el ancla de credibilidad — cada zona/pick se mide
    contra esto ('+X% vs el promedio de la ciudad'). Barato, lee lo que ya existe."""
    filas = await _cargar_colonias(db)
    precios = sorted(f["precio_m2"] for f in filas if f.get("precio_m2"))
    yoys = sorted(f["yoy"] for f in filas if f.get("yoy") is not None)
    return {
        "precio_m2_mediana": precios[len(precios) // 2] if precios else None,
        "plusvalia_mediana": yoys[len(yoys) // 2] if yoys else None,
        "n_colonias": len(filas),
    }


def _vs_cdmx(f: Dict[str, Any], bench: Dict[str, Any]) -> Dict[str, Any]:
    """Compara una colonia contra el benchmark CDMX → % vs el promedio de la ciudad."""
    out = {}
    bp = bench.get("precio_m2_mediana")
    if f.get("precio_m2") and bp:
        out["vs_cdmx_precio_pct"] = round((f["precio_m2"] / bp - 1) * 100)
    by = bench.get("plusvalia_mediana")
    if f.get("yoy") is not None and by is not None:
        out["vs_cdmx_plusvalia_pp"] = round(f["yoy"] - by, 1)   # puntos porcentuales sobre/bajo la ciudad
    return out


async def screener(db, filtros: Optional[Dict[str, Any]] = None, orden: str = "plusvalia",
                   limit: int = 40) -> List[Dict[str, Any]]:
    """SCREENER de colonias por métricas de INVERSIÓN (founder 07-09, inédito en el mercado): filtra las
    ~2788 colonias por plusvalía/yield/riesgo/precio/gentrificación y ordena. Reusa el mismo loader de picks.
    filtros: {plusvalia_min, yield_min, risk_max, precio_max, precio_min, gentrif_min, alcaldia}."""
    f = filtros or {}
    filas = await _cargar_colonias(db)
    out = []
    for r in filas:
        if f.get("plusvalia_min") is not None and (r.get("yoy") is None or r["yoy"] < f["plusvalia_min"]):
            continue
        if f.get("yield_min") is not None and (r.get("yield_score") is None or r["yield_score"] < f["yield_min"]):
            continue
        # Fix auditoría: si pides riesgo ≤X, una colonia SIN dato de riesgo NO pasa el filtro (antes se colaba).
        if f.get("risk_max") is not None and (r.get("risk") is None or r["risk"] > f["risk_max"]):
            continue
        if f.get("precio_max") is not None and (r.get("precio_m2") is None or r["precio_m2"] > f["precio_max"]):
            continue
        if f.get("precio_min") is not None and (r.get("precio_m2") is None or r["precio_m2"] < f["precio_min"]):
            continue
        if f.get("gentrif_min") is not None and (r.get("gentrif") is None or r["gentrif"] < f["gentrif_min"]):
            continue
        if f.get("alcaldia") and str(r.get("alcaldia") or "").lower() != str(f["alcaldia"]).lower():
            continue
        out.append(r)
    _key = {"plusvalia": lambda x: -(x.get("yoy") or -999), "yield": lambda x: -(x.get("yield_score") or -999),
            "riesgo": lambda x: (x.get("risk") if x.get("risk") is not None else 999),
            "precio": lambda x: (x.get("precio_m2") or 9e9), "emergentes": lambda x: -(x.get("gentrif") or -999),
            "calidad": lambda x: -(x.get("zscore") or -999)}.get(orden, lambda x: -(x.get("yoy") or -999))
    out.sort(key=_key)
    out = out[:limit]
    # ANCLA vs CDMX: cada fila muestra cómo se compara con el promedio de la ciudad (credibilidad)
    bench = await benchmark_cdmx(db)
    for r in out:
        r.update(_vs_cdmx(r, bench))
    return out


async def generar_picks(db, estrategia: str, n: int = 5) -> int:
    """Rankea y CONGELA los top-N picks de una estrategia como predicciones datadas. Idempotente por mes."""
    if estrategia not in ESTRATEGIAS:
        return 0
    mes = _mes()
    if estrategia == "preventa":
        return await _generar_preventa(db, n, mes)
    filas = await _cargar_colonias(db)
    rankeadas = []
    for f in filas:
        r = _senal_y_tesis(estrategia, f)
        if r is not None:
            rankeadas.append((r[0], r[1], f))
    rankeadas.sort(key=lambda x: -x[0])
    creados = 0
    for senal, tesis, f in rankeadas[:n]:
        ya = await db.dmx_picks.find_one({"entity_id": f["colonia_id"], "estrategia": estrategia, "mes": mes})
        if ya:
            continue
        await db.dmx_picks.insert_one({
            "id": f"pick_{secrets.token_urlsafe(9)}", "entity_type": "colonia", "entity_id": f["colonia_id"],
            "entity_name": f["name"], "alcaldia": f.get("alcaldia"), "estrategia": estrategia,
            "estrategia_label": _LABEL[estrategia], "tesis": tesis, "senal": round(float(senal), 2),
            "precio_ref_m2": f.get("precio_m2"), "fecha_pick": _iso(), "mes": mes,
            "horizonte_meses": HORIZONTE_MESES, "fuente": "zone_scores+colonia_valoracion",
            "estado": "vivo", "resultado": None})
        creados += 1
    return creados


async def _generar_preventa(db, n: int, mes: str) -> int:
    """Preventa: devs en etapa preventa, rankeados por la calidad de su colonia (zone_score + plusvalía)."""
    zs = {}
    async for z in db.zone_scores.find({}, {"_id": 0, "zone_id": 1, "score_numeric": 1}):
        zs[z.get("zone_id")] = z.get("score_numeric") or 0
    devs = []
    async for d in db.developments.find(
            {"stage": "preventa"}, {"_id": 0, "id": 1, "name": 1, "colonia_id": 1, "colonia": 1, "price_from": 1}):
        devs.append((zs.get(d.get("colonia_id"), 0), d))
    devs.sort(key=lambda x: -x[0])
    creados = 0
    for score, d in devs[:n]:
        ya = await db.dmx_picks.find_one({"entity_id": d["id"], "estrategia": "preventa", "mes": mes})
        if ya:
            continue
        await db.dmx_picks.insert_one({
            "id": f"pick_{secrets.token_urlsafe(9)}", "entity_type": "dev", "entity_id": d["id"],
            "entity_name": d.get("name"), "estrategia": "preventa", "estrategia_label": _LABEL["preventa"],
            "tesis": f"{d.get('name')}: preventa en {d.get('colonia') or 'zona'} de calificación alta — "
                     f"salto lanzamiento→entrega.", "senal": round(float(score), 2),
            "precio_ref_m2": None, "precio_ref_desde": d.get("price_from"), "fecha_pick": _iso(), "mes": mes,
            "horizonte_meses": HORIZONTE_MESES, "fuente": "developments+zone_scores",
            "estado": "vivo", "resultado": None})
        creados += 1
    return creados


async def generar_todos(db, n: int = 5) -> Dict[str, int]:
    """El CRON mensual: congela los picks de las 5 estrategias."""
    out = {}
    for e in ESTRATEGIAS:
        try:
            out[e] = await generar_picks(db, e, n)
        except Exception as ex:  # noqa: BLE001
            log.warning(f"[picks] generar {e}: {ex}")
            out[e] = 0
    return out


async def evaluar_picks(db) -> Dict[str, int]:
    """Cierra los picks cuyo horizonte venció: compara precio_ref vs precio ACTUAL de mercado → acierto/fallo.
    Esto CONSTRUYE el track record (transparencia radical: incluye los que fallaron)."""
    ahora = datetime.now(timezone.utc)
    cerrados = aciertos = 0
    async for p in db.dmx_picks.find({"estado": "vivo", "entity_type": "colonia", "precio_ref_m2": {"$gt": 0}}):
        try:
            fp = datetime.fromisoformat(p["fecha_pick"])
        except Exception:  # noqa: BLE001
            continue
        meses = (ahora - fp).days / 30.0
        if meses < p.get("horizonte_meses", HORIZONTE_MESES):
            continue
        cv = await db.colonia_valoracion.find_one({"colonia_id": p["entity_id"]}, {"_id": 0, "market_m2": 1})
        actual = ((cv or {}).get("market_m2") or {}).get("valor")
        if not actual:
            continue
        delta = round((actual / p["precio_ref_m2"] - 1) * 100, 1)
        acierto = delta > 0
        await db.dmx_picks.update_one({"id": p["id"]}, {"$set": {
            "estado": "cerrado", "cerrado_at": _iso(),
            "resultado": {"precio_final_m2": actual, "delta_pct": delta, "acierto": acierto}}})
        cerrados += 1
        aciertos += 1 if acierto else 0
    return {"cerrados": cerrados, "aciertos": aciertos}


_TIPICO_M2 = 70   # unidad típica para traducir presupuesto ↔ $/m² del pick (segmentación por presupuesto)


async def picks_vigentes(db, estrategia: Optional[str] = None, limit: int = 40,
                         alcaldia: Optional[str] = None, presupuesto: Optional[float] = None) -> List[Dict[str, Any]]:
    """Picks vigentes, SEGMENTABLES por alcaldía y presupuesto (founder 07-09): un pick 'cabe' en el presupuesto
    si una unidad típica (~70m²) a su $/m² de referencia entra en el monto. Ordena por señal."""
    q: Dict[str, Any] = {"estado": "vivo"}
    if estrategia:
        q["estrategia"] = estrategia
    if alcaldia:
        q["alcaldia"] = {"$regex": f"^{alcaldia}$", "$options": "i"}
    picks = [p async for p in db.dmx_picks.find(q, {"_id": 0}).sort("senal", -1).limit(200)]
    if presupuesto is not None:   # 0 = nada cabe (no 'sin límite'); vacío llega como None desde la UI
        tope = presupuesto * 1.05   # 5% de holgura
        def _cabe(p):
            if p.get("precio_ref_desde"):        # desarrollo: precio total de entrada
                return p["precio_ref_desde"] <= tope
            if p.get("precio_ref_m2"):           # colonia: unidad típica ~70 m² al $/m² de referencia
                return p["precio_ref_m2"] * _TIPICO_M2 <= tope
            return True                          # sin precio → no podemos juzgar, se muestra
        picks = [p for p in picks if _cabe(p)]
    picks = picks[:limit]
    # ANCLA vs CDMX en cada pick (credibilidad): precio de referencia vs la mediana de la ciudad
    bp = (await benchmark_cdmx(db)).get("precio_m2_mediana")
    if bp:
        for p in picks:
            if p.get("precio_ref_m2"):
                p["vs_cdmx_precio_pct"] = round((p["precio_ref_m2"] / bp - 1) * 100)
    return picks


async def _rank_en_estrategia(db, pick: Dict[str, Any]) -> Optional[int]:
    """Posición (1-based) de un pick dentro de los vivos de su estrategia, por señal desc."""
    vivos = [p async for p in db.dmx_picks.find(
        {"estrategia": pick.get("estrategia"), "estado": "vivo"}, {"_id": 0, "id": 1, "senal": 1}).sort("senal", -1)]
    for i, p in enumerate(vivos):
        if p.get("id") == pick.get("id"):
            return i + 1
    return None


async def pick_de_entidad(db, entity_id: Optional[str] = None, colonia_id: Optional[str] = None) -> Dict[str, Any]:
    """¿Esta entidad (dev) o su colonia es un DMX Pick vigente? Devuelve el pick directo (el propio activo)
    y/o el pick de su zona, cada uno con su rango dentro de la estrategia. Base de 'Dev: ¿soy pick?' y
    de 'munición del asesor'. Cero costo, solo lectura de db.dmx_picks."""
    out: Dict[str, Any] = {"es_pick": False, "directo": None, "por_zona": None}
    if entity_id:
        d = await db.dmx_picks.find_one({"entity_id": entity_id, "estado": "vivo"}, {"_id": 0})
        if d:
            d["rank"] = await _rank_en_estrategia(db, d)
            out["directo"] = d
            out["es_pick"] = True
    if colonia_id:
        z = await db.dmx_picks.find_one({"entity_id": colonia_id, "entity_type": "colonia", "estado": "vivo"}, {"_id": 0})
        if z:
            z["rank"] = await _rank_en_estrategia(db, z)
            out["por_zona"] = z
            out["es_pick"] = True
    return out


ESTRATEGIAS_UNIDAD = ["oportunidad", "economico", "amplio"]
_ULABEL = {"oportunidad": "Mejor oportunidad", "economico": "Más accesible", "amplio": "Más espacio por peso"}


async def picks_unidades(db, estrategia: str = "oportunidad", n: int = 12,
                         presupuesto: Optional[float] = None, alcaldia: Optional[str] = None,
                         recamaras: Optional[int] = None) -> List[Dict[str, Any]]:
    """HIPERGRANULARIDAD: picks a nivel UNIDAD (el átomo), no colonia. Rankea departamentos disponibles reales
    (db.units) por oportunidad (bajo el mercado de su colonia · AVM), precio o espacio. El moat = dato por unidad."""
    if estrategia not in ESTRATEGIAS_UNIDAD:
        estrategia = "oportunidad"
    # mapa AVM por colonia + mapa de desarrollos (nombre/colonia/alcaldía)
    market: Dict[str, float] = {}
    async for c in db.colonia_valoracion.find({}, {"_id": 0, "colonia_id": 1, "market_m2": 1}):
        v = (c.get("market_m2") or {}).get("valor")
        if v:
            market[c["colonia_id"]] = float(v)
    devs: Dict[str, Dict[str, Any]] = {}
    async for d in db.developments.find({}, {"_id": 0, "id": 1, "name": 1, "colonia": 1, "alcaldia": 1}):
        devs[d["id"]] = d
    # Piso de venta: <$500k es RENTA mensual, no compra (founder: solo venta residencial). Excluye también
    # desarrollos de renta por nombre.
    q: Dict[str, Any] = {"price": {"$gte": 500_000}, "m2_total": {"$gt": 0}}
    if recamaras is not None:
        q["bedrooms"] = recamaras
    filas = []
    async for u in db.units.find(q, {"_id": 0}):
        price, m2, cid = u.get("price"), u.get("m2_total"), u.get("colonia_id")
        dev = devs.get(u.get("development_id")) or {}
        if "renta" in (dev.get("name") or "").lower():
            continue
        if presupuesto is not None and price > presupuesto * 1.02:
            continue
        if alcaldia and (dev.get("alcaldia") or "").lower() != alcaldia.lower():
            continue
        ppm2 = price / m2
        ref = market.get(cid)
        sobre = round((ppm2 / ref - 1) * 100, 1) if ref else None
        if sobre is not None and abs(sobre) > 60:   # referencia dudosa → no la usamos como señal
            sobre = None
        filas.append({
            "development_id": u.get("development_id"), "dev_name": dev.get("name") or u.get("development_id"),
            "unit_number": u.get("unit_number"), "colonia": dev.get("colonia") or cid, "alcaldia": dev.get("alcaldia"),
            "precio": round(price), "precio_m2": round(ppm2), "m2": m2, "recamaras": u.get("bedrooms"),
            "sobre_mercado_pct": sobre,
        })
    if estrategia == "oportunidad":
        cand = [f for f in filas if f["sobre_mercado_pct"] is not None]
        cand.sort(key=lambda f: f["sobre_mercado_pct"])   # más bajo el mercado primero
    elif estrategia == "economico":
        cand = sorted(filas, key=lambda f: f["precio"])
    else:  # amplio: más m² por peso
        cand = sorted(filas, key=lambda f: -(f["m2"] / f["precio"]))
    return cand[:n]


async def backtest_1m(db, monto: float = 1_000_000, estrategia: Optional[str] = None) -> Dict[str, Any]:
    """Simulación '$1M invertido' (founder, investing.com): HISTÓRICO (picks cerrados → retorno real) y VIVO
    (cómo se reparte el $monto hoy entre los picks vigentes + qué compra). Traduce el track record a dinero.
    Todo lectura de db.dmx_picks, cero costo."""
    out: Dict[str, Any] = {"monto": round(monto)}
    qc: Dict[str, Any] = {"estado": "cerrado"}
    if estrategia:
        qc["estrategia"] = estrategia
    cerrados = [p async for p in db.dmx_picks.find(qc, {"_id": 0})]
    dcer = [(p, (p.get("resultado") or {}).get("delta_pct")) for p in cerrados]
    dcer = [(p, d) for p, d in dcer if d is not None]
    if dcer:
        w = monto / len(dcer)
        valor = sum(w * (1 + d / 100.0) for _, d in dcer)
        out["historico"] = {"n": len(dcer), "invertido": round(monto), "valor_actual": round(valor),
                            "ganancia_abs": round(valor - monto), "ganancia_pct": round((valor / monto - 1) * 100, 1)}
    else:
        out["historico"] = None   # honesto: aún no cierra ninguno
    # VIVO: rendimiento REAL de los picks abiertos desde que se congelaron — $monto a partes iguales, cada
    # colonia valorada a su $/m² de mercado ACTUAL vs el de referencia (mismo mecanismo que evaluar_picks).
    # Honesto: los recién congelados dan ~0% (aún no pasa tiempo); el número crece solo con el tiempo.
    qv: Dict[str, Any] = {"estado": "vivo", "entity_type": "colonia", "precio_ref_m2": {"$gt": 0}}
    if estrategia:
        qv["estrategia"] = estrategia
    abiertos = [p async for p in db.dmx_picks.find(qv, {"_id": 0})]
    deltas, desde = [], None
    for p in abiertos:
        cv = await db.colonia_valoracion.find_one({"colonia_id": p["entity_id"]}, {"_id": 0, "market_m2": 1})
        actual = ((cv or {}).get("market_m2") or {}).get("valor")
        if actual and p.get("precio_ref_m2"):
            deltas.append(actual / p["precio_ref_m2"] - 1)
            fp = p.get("fecha_pick")
            if fp and (desde is None or fp < desde):
                desde = fp
    if deltas:
        w = monto / len(deltas)
        valor = sum(w * (1 + d) for d in deltas)
        out["vivo"] = {"n": len(deltas), "invertido": round(monto), "valor_actual": round(valor),
                       "ganancia_abs": round(valor - monto), "ganancia_pct": round((valor / monto - 1) * 100, 1),
                       "desde": (desde or "")[:10]}
    else:
        out["vivo"] = None
    return out


async def track_record(db) -> Dict[str, Any]:
    """GANADORAS ANTERIORES con transparencia radical: cerrados con resultado, aciertos Y fallos, por estrategia."""
    cerrados = [p async for p in db.dmx_picks.find({"estado": "cerrado"}, {"_id": 0})]
    if not cerrados:
        return {"cerrados": 0, "nota": "aún ninguno cerró su horizonte — el track record se construye con el tiempo",
                "vigentes": await db.dmx_picks.count_documents({"estado": "vivo"})}
    aciertos = [p for p in cerrados if (p.get("resultado") or {}).get("acierto")]
    from collections import defaultdict
    por_est = defaultdict(lambda: {"n": 0, "aciertos": 0, "delta_prom": []})
    for p in cerrados:
        e = p["estrategia"]; r = p.get("resultado") or {}
        por_est[e]["n"] += 1
        por_est[e]["aciertos"] += 1 if r.get("acierto") else 0
        if r.get("delta_pct") is not None:
            por_est[e]["delta_prom"].append(r["delta_pct"])
    return {
        "cerrados": len(cerrados),
        "tasa_acierto_pct": round(100 * len(aciertos) / len(cerrados)),
        "por_estrategia": {e: {"n": v["n"], "aciertos": v["aciertos"],
                               "delta_prom_pct": round(sum(v["delta_prom"]) / len(v["delta_prom"]), 1) if v["delta_prom"] else None}
                           for e, v in por_est.items()},
        "mejores": sorted([{"entidad": p["entity_name"], "estrategia": p["estrategia"],
                            "delta_pct": (p.get("resultado") or {}).get("delta_pct")} for p in cerrados],
                          key=lambda x: -(x["delta_pct"] or -999))[:5],
        "peores": sorted([{"entidad": p["entity_name"], "estrategia": p["estrategia"],
                           "delta_pct": (p.get("resultado") or {}).get("delta_pct")} for p in cerrados],
                         key=lambda x: (x["delta_pct"] or 999))[:5],   # transparencia: también los que fallaron
    }
