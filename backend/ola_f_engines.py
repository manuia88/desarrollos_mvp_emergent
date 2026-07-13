"""
ola_f_engines.py — OLA F del genoma: SIMULACIÓN + LA CAPA QUE APRENDE (blueprint).

  F1 bayes_formal()       — el Bayes de verdad: prior 4S (distribuciones medidas) + observado
                            (átomos) → POSTERIOR por estudio × dimensión con credibilidad.
                            El estudio de 500k se ACTUALIZA solo con cada búsqueda.
  F2 gemelo_demanda_v2()  — proyecto HIPOTÉTICO (colonia, precio, rec, m², features) →
                            cuántos buscadores VIVOS lo comprarían hoy, con temperatura y etapa.
  F3 simulador_mercado()  — agentes muestreados de vectores REALES × inventario → absorción
                            simulada + sensibilidad al precio (¿y si bajo 5%?).
  F4 predicciones+drift   — cada corrida del índice adelantado deja su PREDICCIÓN escrita;
                            evaluar_drift() la compara después contra el pm2 real (la báscula
                            del Cerebro — registro pasivo, CEREBRO_ENABLED sigue OFF).
  F5 valor_informacion()  — qué dato capturar SIGUIENTE: ausencia × demanda que lo pide ×
                            motores que lo usan → ranking del retorno de capturar.

REGLAS: universalidad (pares 4S↔genoma y dependencias en REGISTROS), FAIL-OPEN, es_estimado
honesto, superadmin-only en superficie.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

log = logging.getLogger("dmx.ola_f")


def _med(vals):
    s = sorted(v for v in vals if v is not None)
    return s[len(s) // 2] if s else None


# ═══ F1 · BAYES FORMAL (prior 4S + observado → posterior) ═════════════════════
# REGISTRO de pares: pregunta 4S ↔ dimensión del genoma + cómo se comparan las opciones.
# Un par nuevo = una entrada. `banda`: rangos numéricos que se tocan; `exacto`: igualdad.
_PARES_BAYES: List[Dict[str, str]] = [
    {"pregunta": "presupuesto_pct", "dimension": "finanzas.presupuesto_banda_mdp", "match": "banda"},
    {"pregunta": "dormitorios_pct", "dimension": "producto.recamaras", "match": "exacto"},
    {"pregunta": "banos_pct", "dimension": "producto.banos", "match": "exacto"},
]
_PESO_PRIOR = 20.0   # pseudo-conteos del prior: con ~20 visitantes lo observado pesa 50/50


def _rango(txt: str) -> Optional[Tuple[float, float]]:
    import re
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(txt))]
    return (nums[0], nums[1]) if len(nums) >= 2 else ((nums[0], nums[0]) if nums else None)


def _opciones_se_tocan(a: str, b: str, modo: str) -> bool:
    if modo == "exacto":
        try:
            return int(float(str(a).replace("+", ""))) == int(float(str(b).replace("+", "")))
        except (TypeError, ValueError):
            return str(a).strip().lower() == str(b).strip().lower()
    ra, rb = _rango(a), _rango(b)
    return bool(ra and rb and ra[0] <= rb[1] and rb[0] <= ra[1])


async def bayes_formal(db, estudio: Optional[str] = None,
                       colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    # PRIORS: distribuciones 4S por estudio × pregunta
    priors: Dict[Tuple[str, str], Dict[str, float]] = {}
    try:
        preguntas = {p["pregunta"] for p in _PARES_BAYES}
        async for f in db.facts_4s.find({"unidad": "pct"}, {"_id": 0}):
            if f.get("pregunta") in preguntas and not f.get("corte_key"):
                k = (f.get("estudio"), f["pregunta"])
                priors.setdefault(k, {})[str(f.get("opcion"))] = float(f.get("valor") or 0)
    except Exception as e:
        log.warning("[bayes] priors fail-open: %s", e)

    # OBSERVADO: visitantes únicos por dimensión × valor
    obs: Dict[str, Dict[str, Set[str]]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "colonia": 1,
                                                 "dimension": 1, "valor": 1}):
            if colonias and a.get("colonia") not in colonias:
                continue
            d = a.get("dimension")
            if d in {p["dimension"] for p in _PARES_BAYES}:
                obs.setdefault(d, {}).setdefault(str(a.get("valor")), set()).add(
                    a.get("visitor_id") or "?")
    except Exception as e:
        log.warning("[bayes] atoms fail-open: %s", e)

    tablas = []
    for par in _PARES_BAYES:
        for (est, preg), dist in sorted(priors.items()):
            if preg != par["pregunta"] or (estudio and est != estudio):
                continue
            observado = obs.get(par["dimension"], {})
            filas = []
            for opcion, prior_pct in sorted(dist.items(), key=lambda x: -x[1]):
                n_obs = sum(len(v) for val, v in observado.items()
                            if _opciones_se_tocan(opcion, val, par["match"]))
                pseudo = _PESO_PRIOR * prior_pct / 100.0
                filas.append({"opcion": opcion, "prior_4s_pct": prior_pct,
                              "visitantes_observados": n_obs, "_post": pseudo + n_obs})
            total_post = sum(f["_post"] for f in filas) or 1.0
            n_total_obs = sum(f["visitantes_observados"] for f in filas)
            for f in filas:
                f["posterior_pct"] = round(f.pop("_post") / total_post * 100, 1)
                f["movimiento"] = round(f["posterior_pct"] - f["prior_4s_pct"], 1)
            tablas.append({"estudio": est, "dimension": par["dimension"],
                           "credibilidad_observado_pct": round(
                               n_total_obs / (n_total_obs + _PESO_PRIOR) * 100, 1),
                           "filas": filas[:12]})
    return {"n_tablas": len(tablas), "peso_prior": _PESO_PRIOR, "tablas": tablas,
            "es_estimado": not tablas,
            "lectura": (f"{len(tablas)} posteriors calculados: el estudio 4S se ACTUALIZA con cada "
                        f"búsqueda real — donde el posterior se mueve del prior, el mercado cambió "
                        f"desde que 4S midió.") if tablas else
                       "Sin priors 4S cargados para los pares registrados."}


# ═══ F2 · GEMELO DE DEMANDA v2 (proyecto hipotético → compradores vivos) ═══════
async def gemelo_demanda_v2(db, colonias: Optional[Set[str]] = None,
                            proyecto: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """proyecto: {colonia?, precio_mdp?, recamaras?, m2?, features?[]} — sin proyecto usa la
    MEDIANA del mercado (el bloque corre solo; el spec completo va por la ruta)."""
    from demand_mirror import _oferta_vectores
    if not proyecto:
        unidades = [u for u in await _oferta_vectores(db, colonias)
                    if u.get("disponible") and (u.get("precio") or 0) >= 100000 and u.get("m2")]
        proyecto = {"colonia": None,
                    "precio_mdp": round((_med([u["precio"] for u in unidades]) or 0) / 1e6, 1),
                    "recamaras": int(_med([u["recamaras"] for u in unidades if u.get("recamaras")]) or 2),
                    "m2": round(_med([u["m2"] for u in unidades]) or 70),
                    "features": [], "_origen": "mediana del mercado (hipotético default)"}

    # el vector de cada visitante (sus peticiones) contra el proyecto
    vis: Dict[str, Dict[str, Any]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0}):
            if colonias and a.get("colonia") not in colonias:
                continue
            v = a.get("visitor_id")
            if not v:
                continue
            d = vis.setdefault(v, {"dims": {}, "colonias": set(), "features": set()})
            d["dims"].setdefault(a.get("dimension"), set()).add(str(a.get("valor")))
            if a.get("colonia"):
                d["colonias"].add(a["colonia"])
            if a.get("dimension") == "producto.feature":
                d["features"].add(str(a.get("valor")))
    except Exception as e:
        log.warning("[gemelo_v2] fail-open: %s", e)

    def _compat(d: Dict[str, Any]) -> Tuple[float, List[str]]:
        """0-100: cuánto le queda el proyecto a este buscador + qué NO le queda (honesto)."""
        puntos, contras, criterios = 0.0, [], 0
        if proyecto.get("colonia"):
            criterios += 1
            if proyecto["colonia"] in d["colonias"]:
                puntos += 1
            else:
                contras.append("busca otra colonia")
        if proyecto.get("precio_mdp"):
            pedidos = d["dims"].get("finanzas.presupuesto_banda_mdp", set())
            if pedidos:
                criterios += 1
                if any(_rango(p) and _rango(p)[1] >= proyecto["precio_mdp"] for p in pedidos):
                    puntos += 1
                else:
                    contras.append("su presupuesto no alcanza")
        if proyecto.get("recamaras") is not None:
            pedidas = d["dims"].get("producto.recamaras", set())
            if pedidas:
                criterios += 1
                try:
                    if any(int(float(p)) <= int(proyecto["recamaras"]) for p in pedidas):
                        puntos += 1
                    else:
                        contras.append("pide más recámaras")
                except (TypeError, ValueError):
                    pass
        feats = set(proyecto.get("features") or [])
        if d["features"]:
            criterios += 1
            cubre = len(d["features"] & feats) / len(d["features"])
            puntos += cubre
            if cubre < 1:
                contras.append(f"le faltan features ({', '.join(sorted(d['features'] - feats)[:3])})")
        return (puntos / criterios * 100 if criterios else 0.0, contras)

    filas = []
    for v, d in vis.items():
        score, contras = _compat(d)
        if score > 0:
            filas.append({"visitor_id": v, "compatibilidad_pct": round(score, 1),
                          "objeciones": contras[:3]})
    filas.sort(key=lambda x: -x["compatibilidad_pct"])
    compran = [f for f in filas if f["compatibilidad_pct"] >= 75]

    # objeción dominante = el brief de ajuste del proyecto
    objeciones: Dict[str, int] = {}
    for f in filas:
        for o in f["objeciones"]:
            objeciones[o.split("(")[0].strip()] = objeciones.get(o.split("(")[0].strip(), 0) + 1
    return {"proyecto": proyecto, "n_buscadores_vivos": len(vis),
            "compradores_probables": len(compran),
            "matcheo": filas[:20],
            "objecion_dominante": max(objeciones, key=objeciones.get) if objeciones else None,
            "objeciones": [{"objecion": o, "buscadores": n}
                           for o, n in sorted(objeciones.items(), key=lambda x: -x[1])],
            "es_estimado": len(vis) < 5,
            "lectura": (f"De {len(vis)} buscadores vivos, {len(compran)} comprarían este proyecto "
                        f"(compatibilidad ≥75%)."
                        + (f" La objeción #1: {max(objeciones, key=objeciones.get)}."
                           if objeciones else "")) if vis else "Sin buscadores vivos."}


# ═══ F3 · SIMULADOR DEL MERCADO (agentes reales × inventario) ══════════════════
async def simulador_mercado(db, colonias: Optional[Set[str]] = None,
                            delta_precio_pct: float = 0.0, rondas: int = 200,
                            semilla: int = 42) -> Dict[str, Any]:
    """Monte-Carlo honesto: agentes = vectores REALES de visitantes (muestreados con reemplazo);
    cada agente compra la unidad más barata que lo satisface, con probabilidad = su afinidad.
    delta_precio_pct simula '¿y si TODO el corte baja/sube X%?' → curva de absorción."""
    from demand_mirror import _oferta_vectores, _satisface
    rng = random.Random(semilla)   # reproducible: misma semilla = misma simulación
    unidades = [u for u in await _oferta_vectores(db, colonias)
                if u.get("disponible") and (u.get("precio") or 0) >= 100000]
    agentes: Dict[str, List[Tuple[str, str]]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "colonia": 1,
                                                 "dimension": 1, "valor": 1}):
            if colonias and a.get("colonia") not in colonias:
                continue
            if a.get("visitor_id") and not str(a.get("dimension", "")).startswith(("busqueda.texto", "lexico.")):
                agentes.setdefault(a["visitor_id"], []).append((a["dimension"], str(a.get("valor"))))
    except Exception as e:
        log.warning("[simulador] fail-open: %s", e)
    pool = list(agentes.values())
    if not pool or not unidades:
        return {"es_estimado": True, "n_agentes_reales": len(pool), "n_unidades": len(unidades),
                "lectura": "El simulador necesita buscadores vivos e inventario disponible."}

    factor = 1 + delta_precio_pct / 100.0
    ventas_por_ronda = []
    for _ in range(rondas):
        vivos = [dict(u, precio=(u["precio"] or 0) * factor) for u in unidades]
        vendidas = set()
        ventas = 0
        for senales in rng.sample(pool, k=min(len(pool), 50)) * 1:
            candidatas = []
            for i, u in enumerate(vivos):
                if i in vendidas:
                    continue
                oks = [s for s in (_satisface(u, d, v) for d, v in senales) if s is not None]
                if oks and all(oks):
                    candidatas.append((u["precio"], i, len(oks)))
            if not candidatas:
                continue
            precio, i, n_criterios = min(candidatas)
            # afinidad: más criterios satisfechos = más probabilidad de cerrar
            if rng.random() < min(0.9, 0.3 + 0.15 * n_criterios):
                vendidas.add(i)
                ventas += 1
        ventas_por_ronda.append(ventas)
    ventas_por_ronda.sort()
    n = len(ventas_por_ronda)
    return {"n_agentes_reales": len(pool), "n_unidades": len(unidades),
            "delta_precio_pct": delta_precio_pct, "rondas": rondas, "semilla": semilla,
            "ventas_simuladas": {"p5": ventas_por_ronda[max(0, n // 20)],
                                 "mediana": ventas_por_ronda[n // 2],
                                 "p95": ventas_por_ronda[min(n - 1, n * 19 // 20)]},
            "es_estimado": len(pool) < 10,
            "lectura": (f"Con {len(pool)} compradores-agente REALES sobre {len(unidades)} unidades"
                        + (f" y precio {delta_precio_pct:+.0f}%" if delta_precio_pct else "")
                        + f": mediana {ventas_por_ronda[n // 2]} ventas por ciclo "
                        f"(p5 {ventas_por_ronda[max(0, n // 20)]} · p95 {ventas_por_ronda[min(n - 1, n * 19 // 20)]}).")}


# ═══ F4 · PREDICCIONES + DRIFT (la báscula del Cerebro — registro pasivo) ══════
async def registrar_predicciones(db) -> Dict[str, Any]:
    """Cada corrida deja escrita la PREDICCIÓN del índice adelantado (colonia, índice, pm2 de
    hoy) — upsert por (colonia, fecha), idempotente. CEREBRO_ENABLED sigue OFF: esto solo MIDE."""
    from ola_d_engines import indice_adelantado
    from demand_mirror import _oferta_vectores
    fecha = datetime.now(timezone.utc).isoformat()[:10]
    idx = await indice_adelantado(db)
    pm2_col: Dict[str, List[float]] = {}
    for u in await _oferta_vectores(db):
        if (u.get("precio") or 0) >= 100000 and u.get("m2"):
            pm2_col.setdefault(u["colonia"], []).append(u["precio"] / u["m2"])
    n = 0
    for f in idx.get("filas", []):
        pm2 = _med(pm2_col.get(f["colonia"], []))
        if pm2 is None:
            continue
        await db.genoma_predicciones.update_one(
            {"colonia": f["colonia"], "fecha": fecha},
            {"$set": {"colonia": f["colonia"], "fecha": fecha, "indice": f["indice"],
                      "pm2_al_predecir": round(pm2),
                      "prediccion": "sube" if f["indice"] > 55 else ("baja" if f["indice"] < 45 else "lateral")}},
            upsert=True)
        n += 1
    return {"ok": True, "fecha": fecha, "predicciones_registradas": n}


async def evaluar_drift(db, dias_madurez: int = 30) -> Dict[str, Any]:
    """La báscula: predicciones con ≥N días de edad vs el pm2 REAL de hoy → aciertos por colonia.
    Sin maquillaje: si el índice no le pega, aquí se ve."""
    from demand_mirror import _oferta_vectores
    pm2_hoy: Dict[str, List[float]] = {}
    for u in await _oferta_vectores(db):
        if (u.get("precio") or 0) >= 100000 and u.get("m2"):
            pm2_hoy.setdefault(u["colonia"], []).append(u["precio"] / u["m2"])
    corte = datetime.now(timezone.utc).isoformat()[:10]
    evaluadas, aciertos, pendientes = [], 0, 0
    try:
        async for p in db.genoma_predicciones.find({}, {"_id": 0}):
            edad = (datetime.fromisoformat(corte) - datetime.fromisoformat(p["fecha"])).days
            if edad < dias_madurez:
                pendientes += 1
                continue
            pm2 = _med(pm2_hoy.get(p["colonia"], []))
            if pm2 is None or not p.get("pm2_al_predecir"):
                continue
            delta = (pm2 - p["pm2_al_predecir"]) / p["pm2_al_predecir"] * 100
            real = "sube" if delta > 1 else ("baja" if delta < -1 else "lateral")
            ok = real == p.get("prediccion")
            aciertos += 1 if ok else 0
            evaluadas.append({"colonia": p["colonia"], "fecha": p["fecha"],
                              "prediccion": p.get("prediccion"), "real": real,
                              "delta_pm2_pct": round(delta, 1), "acierto": ok})
    except Exception as e:
        log.warning("[drift] fail-open: %s", e)
    return {"dias_madurez": dias_madurez, "n_evaluadas": len(evaluadas),
            "n_pendientes_de_madurar": pendientes,
            "precision_pct": round(aciertos / len(evaluadas) * 100, 1) if evaluadas else None,
            "evaluadas": sorted(evaluadas, key=lambda x: x["fecha"])[:25],
            "es_estimado": not evaluadas,
            "lectura": (f"Precisión del índice adelantado: {round(aciertos / len(evaluadas) * 100, 1)}% "
                        f"sobre {len(evaluadas)} predicciones maduras.") if evaluadas else
                       (f"{pendientes} predicciones registradas madurando (se evalúan a los "
                        f"{dias_madurez} días) — la báscula del Cerebro ya está puesta.")}


# ═══ F5 · VALOR DE LA INFORMACIÓN (qué capturar siguiente) ═════════════════════
# REGISTRO: campo ausente → qué motores lo usan (dependencias declaradas, no adivinadas).
_DEPENDENCIAS_CAMPO = {
    "precio": ["espejo", "screener", "accesibilidad", "cap_rate", "instantanea", "indice_adelantado"],
    "m2": ["espejo", "precio_sombra", "cap_rate", "curva_vertical", "accesibilidad"],
    "recamaras": ["espejo", "etapa_vida", "precio_sombra", "evolucion"],
    "piso": ["curva_vertical", "espejo"],
    "status": ["absorcion_viva", "transiciones", "screener"],
}
_DIMENSIONES_SIN_LADO_OFERTA = {
    "intencion.meses_entrega_max": "fecha de entrega por unidad",
    "finanzas.mensualidad_max": "esquema de pago por unidad",
    "producto.orientacion": "orientación por unidad",
}


async def valor_informacion(db, colonias: Optional[Set[str]] = None) -> Dict[str, Any]:
    from demand_mirror import salud_oferta, _demanda_conteos
    salud = await salud_oferta(db)
    dem = await _demanda_conteos(db, colonias, dias=90)
    demanda_por_dim: Dict[str, int] = {}
    for (dim, _), c in dem.items():
        demanda_por_dim[dim] = demanda_por_dim.get(dim, 0) + int(c.get("visitantes", 0))

    ranking = []
    # 1) campos AUSENTES del inventario × motores que los usan
    for campo, estados in (salud.get("por_campo") or {}).items():
        ausentes = estados.get("ausente", 0) + estados.get("perdido", 0)
        if not ausentes:
            continue
        motores = _DEPENDENCIAS_CAMPO.get(campo, [])
        ranking.append({"que_capturar": f"{campo} en el inventario",
                        "tipo": "oferta", "faltan": ausentes,
                        "motores_beneficiados": len(motores), "motores": motores,
                        "valor": ausentes * max(1, len(motores))})
    # 2) dimensiones que la DEMANDA pide y la oferta no declara (sin espejo)
    for dim, descripcion in _DIMENSIONES_SIN_LADO_OFERTA.items():
        visitantes = demanda_por_dim.get(dim, 0)
        if visitantes:
            ranking.append({"que_capturar": descripcion, "tipo": "espejo",
                            "faltan": visitantes, "motores_beneficiados": 2,
                            "motores": ["espejo", "escasez"],
                            "valor": visitantes * 30})
    ranking.sort(key=lambda x: -x["valor"])
    return {"n_oportunidades": len(ranking), "ranking": ranking[:15],
            "es_estimado": not ranking,
            "lectura": (f"El dato que más pagaría capturar: {ranking[0]['que_capturar']} "
                        f"(desbloquea {ranking[0]['motores_beneficiados']} motores sobre "
                        f"{ranking[0]['faltan']} casos).") if ranking else
                       "Sin huecos de captura detectados — todo lo pedido tiene su dato."}
