"""
DMX · Fase 3.2 — LENTE DEL DEV sobre el cubo (su slice + mercado anónimo)
Prefix /api/dev/market · auth developer/superadmin. Expone la inteligencia del cubo
al dev SIN dato crudo ajeno: benchmark (tú vs mercado), amenity ranker, demand-gap.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/dev/market", tags=["dev_market"])
log = logging.getLogger("dmx.routes_dev_market")


def _db(request: Request):
    return request.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


@router.get("/benchmark")
async def benchmark(request: Request):
    """Tu absorción y $/m² vs el mercado anónimo, por (colonia × tipología). El moat:
    'tu 2-rec vende 14% vs el mercado 18%'. Solo celdas donde tienes unidades."""
    user = await _auth(request)
    import dmx_dev_benchmark
    return await dmx_dev_benchmark.benchmark(_db(request), user)


@router.get("/amenity-ranker")
async def amenity_ranker(request: Request, colonia: Optional[str] = Query(None)):
    """¿Qué atributo sube el precio/m²? (hedónico · inteligencia de mercado anónima)."""
    await _auth(request)
    import dmx_hedonic_atom
    scope = {"geo.colonia_id": colonia} if colonia else None
    return await dmx_hedonic_atom.fit_and_rank(_db(request), scope)


@router.get("/demand-gap")
async def demand_gap(request: Request, top: int = Query(15, ge=1, le=100)):
    """Dónde hay demanda y poco/cero inventario de una tipología = dónde construir."""
    await _auth(request)
    import dmx_demand
    return await dmx_demand.demand_gap(_db(request), top=top)


async def _dev_colonias(db, user) -> list:
    """Las colonias de los desarrollos del dev (multi-tenant) — su 'zona' para acotar la demanda."""
    from tenant_scope import user_dev_ids
    dev_ids = list(user_dev_ids(user) or [])
    cols = set()
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        for did in dev_ids:
            d = DEVELOPMENTS_BY_ID.get(did)
            if d and d.get("colonia_id"):
                cols.add(d["colonia_id"])
    except Exception:
        pass
    try:
        async for d in db.developments.find({"id": {"$in": dev_ids}}, {"_id": 0, "colonia_id": 1}):
            if d.get("colonia_id"):
                cols.add(d["colonia_id"])
    except Exception:
        pass
    return sorted(c for c in cols if c)


# Cache TTL corto por (colonias, ventana) del payload COMPLETO de /demand-features —
# el endpoint re-escanea la misma ventana en 10+ agregados; 120s de frescura es suficiente.
_DEMAND_FEATURES_CACHE: dict = {}
_DEMAND_FEATURES_TTL = 120  # segundos
_DEMAND_FEATURES_CACHE_MAX = 128


@router.get("/demand-features")
async def demand_features(request: Request, dias: int = Query(90, ge=7, le=365)):
    """QUÉ QUIERE EL MERCADO EN TUS ZONAS, A NIVEL FEATURE — cierra el loop demanda→dev. No solo recámaras/precio (eso es
    /demand-intel) sino qué FEATURES busca la gente (terraza/gym/vista), qué construir (demanda vs tu oferta), qué SUBE,
    y lo que se busca y NO existe. La misma inteligencia del superadmin, scopeada a TUS colonias."""
    user = await _auth(request)
    db = _db(request)
    cols = await _dev_colonias(db, user)
    if not cols:
        return {"ok": True, "vacio": True, "lectura": "Publica un desarrollo y verás la demanda real por feature de tu colonia."}
    cache_key = (tuple(cols), dias)
    hit = _DEMAND_FEATURES_CACHE.get(cache_key)
    if hit and (time.time() - hit[0]) < _DEMAND_FEATURES_TTL:
        return hit[1]
    import demand_intelligence as di
    # Llamadas independientes en PARALELO (antes: 10 awaits en cadena sobre la misma ventana)
    (alertas, por_feature, que_construir, no_satisfecha, tendencias,
     intencion_financiera, avanzado, atributos, financiero, compuestas) = await asyncio.gather(
        di.demand_alerts(db, colonias=cols, since_days=dias),      # jugadas proactivas: qué construir YA
        di.demand_by_feature(db, colonias=cols, since_days=dias),
        di.what_to_build(db, colonias=cols, since_days=dias),
        di.unmet_demand(db, colonias=cols, since_days=dias),
        di.trend_alerts(db, colonias=cols),
        di.financial_intent(db, colonias=cols, since_days=dias),
        # Granularidad avanzada scopeada a TUS colonias (balance oferta-demanda, absorción, elasticidad de precio,
        # estacionalidad, co-ocurrencia de features, willingness-to-pay, sustitución, criterios de decisión):
        _mg_dev(db, cols, dias),
        # Ejes nuevos del cubo, scopeados a TUS colonias:
        di.attribute_demand(db, since_days=dias, colonias=cols),   # balcón/vista/altura…
        di.financial_demand(db, since_days=dias, colonias=cols),   # presupuesto/enganche/ROI
        _cm_dev(db, cols, dias),                                   # Pricing/Absorption/Underwriting/Competitive
    )
    payload = {
        "ok": True, "colonias": cols,
        "alertas": alertas,
        "por_feature": por_feature,
        "que_construir": que_construir,
        "no_satisfecha": no_satisfecha,
        "tendencias": tendencias,
        "intencion_financiera": intencion_financiera,
        "avanzado": avanzado,
        "atributos": atributos,
        "financiero": financiero,
        "compuestas": compuestas,
    }
    if len(_DEMAND_FEATURES_CACHE) >= _DEMAND_FEATURES_CACHE_MAX:
        _DEMAND_FEATURES_CACHE.clear()  # cache chico: reset simple, sin LRU
    _DEMAND_FEATURES_CACHE[cache_key] = (time.time(), payload)
    return payload


async def _mg_dev(db, cols, dias):
    import marketplace_granularity as mg
    return await mg.run_all(db, keys=mg.DEV_KEYS, colonias=cols, since_days=dias)


async def _cm_dev(db, cols, dias):
    import composite_metrics as cm
    return await cm.for_dev(db, cols, since_days=dias)


@router.get("/demand-intel")
async def demand_intel(request: Request, dias: int = Query(60, ge=7, le=365)):
    """DEMANDA INSATISFECHA EN TUS ZONAS (el moat para el dev): qué busca la gente y NO encuentra, a dónde se va, la brecha
    de presupuesto, y qué esquema de pago pide. Señal REAL y anónima de db.marketplace_searches (lo que el buscador IA loguea).
    Le dice al dev DÓNDE construir, A QUÉ PRECIO y CON QUÉ PLAN. Sin dato crudo ajeno: solo agregados de SUS colonias."""
    import datetime as _dt
    user = await _auth(request)
    db = _db(request)
    cols = await _dev_colonias(db, user)
    if not cols:
        return {"ok": True, "vacio": True, "colonias": [],
                "lectura": "Aún no identificamos tus zonas. Publica un desarrollo y verás aquí la demanda real de tu colonia."}
    since = _dt.datetime.utcnow() - _dt.timedelta(days=dias)
    base = {"colonia_id": {"$in": cols}, "created_at_dt": {"$gte": since}}

    async def _agg(pipeline):
        try:
            return await db.marketplace_searches.aggregate(pipeline).to_list(100)
        except Exception:
            return []

    async def _count(q):
        try:
            return await db.marketplace_searches.count_documents(q)
        except Exception:
            return 0

    total = await _count(base)
    insatisfechas = await _count({**base, "unmet": True, "satisfecha": {"$ne": True}})
    # Sustitución: de MI zona, ¿a qué zonas se va la demanda que no pude cumplir?
    sust = await _agg([
        {"$match": {**base, "sustitucion": True}}, {"$unwind": "$zonas_sustitutas"},
        {"$group": {"_id": "$zonas_sustitutas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    # Brecha: cuántos quieren MI zona pero su mensualidad no alcanza ni lo más barato + cuánto les falta.
    brecha = await _agg([
        {"$match": {**base, "gap_mensualidad": {"$gt": 0}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "gap_prom": {"$avg": "$gap_mensualidad"},
                    "mens_pedida_prom": {"$avg": "$mensualidad_max"}}},
    ])
    # Esquema de pago que pide la gente en MI zona (crédito vs preventa) → cómo estructurar precio/plan.
    esquema = await _agg([
        {"$match": {**base, "esquema_pedido": {"$ne": None}}},
        {"$group": {"_id": "$esquema_pedido", "n": {"$sum": 1}}}, {"$sort": {"n": -1}},
    ])
    # Qué piden (amenidades) que quizá no ofreces → qué construir.
    amen = await _agg([
        {"$match": base}, {"$unwind": "$amenidades_pedidas"},
        {"$group": {"_id": "$amenidades_pedidas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8},
    ])
    # Recámaras y presupuesto promedio que busca la gente en MI zona.
    perfil = await _agg([
        {"$match": base},
        {"$group": {"_id": None, "rec_prom": {"$avg": "$recamaras_min"}, "precio_prom": {"$avg": "$precio_max"},
                    "mens_prom": {"$avg": "$mensualidad_max"}}},
    ])
    b0 = (brecha or [{}])[0]
    p0 = (perfil or [{}])[0]
    # K-ANON (auditoría N4 · mismo umbral ≥3 del cubo): con n<3, un "promedio" ES el dato de una persona —
    # el dev podría inferir el presupuesto/mensualidad de un buscador individual. Se suprimen los agregados
    # finos hasta juntar masa; los conteos gruesos (total/insatisfechas) sí se muestran.
    _KANON = 3
    return {
        "ok": True, "vacio": total == 0, "colonias": cols, "ventana_dias": dias,
        "total_busquedas": total,
        "insatisfechas": insatisfechas,
        "insatisfechas_pct": round(insatisfechas / total * 100) if total else 0,
        "sustitucion": [{"zona": s["_id"], "veces": s["n"]} for s in sust if s.get("_id")],
        "brecha": ({"personas": b0.get("n", 0),
                    "gap_prom": round(b0["gap_prom"]) if b0.get("gap_prom") else None,
                    "mens_pedida_prom": round(b0["mens_pedida_prom"]) if b0.get("mens_pedida_prom") else None}
                   if (b0.get("n") or 0) >= _KANON else None),
        "esquema": [{"esquema": e["_id"], "veces": e["n"]} for e in esquema if e.get("_id")],
        "amenidades_pedidas": [{"amenidad": a["_id"], "veces": a["n"]} for a in amen if a.get("_id")],
        "perfil_buscado": ({
            "recamaras_prom": round(p0["rec_prom"], 1) if p0.get("rec_prom") else None,
            "precio_prom": round(p0["precio_prom"]) if p0.get("precio_prom") else None,
            "mensualidad_prom": round(p0["mens_prom"]) if p0.get("mens_prom") else None,
        } if total >= _KANON else None),
        "lectura": "Lo que la gente busca en tus zonas y no siempre encuentra. Úsalo para decidir dónde construir, a qué precio y con qué esquema de pago.",
    }


def _delta_pct(reciente, previo):
    """% de cambio reciente vs previo (None si no hay base previa)."""
    if not previo or previo == 0:
        return None
    return round((reciente - previo) / previo * 100, 1)


@router.get("/zona-cambios")
async def zona_cambios(request: Request, dias: int = Query(30, ge=7, le=90)):
    """TU ZONA CAMBIÓ (conciencia ambiental · proactivo · L63): no el NIVEL de demanda (eso es /demand-intel) sino el
    MOVIMIENTO. Compara la ventana reciente [hoy-dias, hoy] vs la anterior [hoy-2·dias, hoy-dias] sobre
    db.marketplace_searches (lo que el buscador IA loguea, anónimo y agregado de SUS colonias). Le avisa al dev que su
    demanda subió/bajó, que los presupuestos se movieron, que la insatisfacción creció o que apareció una amenidad nueva
    pedida → la TENDENCIA que dispara acción/timing. Construible hoy: las búsquedas ya traen created_at_dt."""
    import datetime as _dt
    user = await _auth(request)
    db = _db(request)
    cols = await _dev_colonias(db, user)
    if not cols:
        return {"ok": True, "vacio": True, "cambios": [],
                "lectura": "Publica un desarrollo y aquí verás cómo se MUEVE la demanda de tu zona mes a mes."}
    now = _dt.datetime.utcnow()

    async def _win(t0, t1):
        m = {"colonia_id": {"$in": cols}, "created_at_dt": {"$gte": t0, "$lt": t1}}
        try:
            n = await db.marketplace_searches.count_documents(m)
            unmet = await db.marketplace_searches.count_documents({**m, "unmet": True, "satisfecha": {"$ne": True}})
            precios, recs = [], []   # MEDIANA, no media → resiste outliers (1 búsqueda de $100M no mueve la señal)
            async for s in db.marketplace_searches.find(m, {"_id": 0, "precio_max": 1, "recamaras_min": 1}):
                if isinstance(s.get("precio_max"), (int, float)) and s["precio_max"] > 0:
                    precios.append(s["precio_max"])
                if isinstance(s.get("recamaras_min"), (int, float)) and s["recamaras_min"]:
                    recs.append(s["recamaras_min"])
            amen = await db.marketplace_searches.aggregate([
                {"$match": m}, {"$unwind": "$amenidades_pedidas"},
                {"$group": {"_id": "$amenidades_pedidas", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 1},
            ]).to_list(1)
        except Exception:
            return {"n": 0}

        def _med(xs):
            if not xs:
                return None
            xs = sorted(xs)
            k = len(xs) // 2
            return xs[k] if len(xs) % 2 else (xs[k - 1] + xs[k]) / 2

        return {"n": n, "unmet_pct": round(unmet / n * 100) if n else 0,
                "precio": _med(precios), "rec": (sum(recs) / len(recs) if recs else None),
                "top_amen": (amen[0]["_id"] if amen else None)}

    # Ventana ADAPTATIVA: probamos la pedida (mes a mes); si aún no hay historial para la mitad previa, encogemos hasta
    # que ambas mitades tengan señal → la lente se enciende HOY con poco historial y escala a mensual al acumular datos.
    eff = dias
    A, B = {"n": 0}, {"n": 0}
    for cand in (dias, 21, 14, 10, 7, 5):
        if cand > dias:
            continue
        a = await _win(now - _dt.timedelta(days=cand), now)
        b = await _win(now - _dt.timedelta(days=2 * cand), now - _dt.timedelta(days=cand))
        eff, A, B = cand, a, b
        if a["n"] >= 3 and b.get("n", 0) >= 3:
            break

    if A["n"] < 3 and B.get("n", 0) < 3:
        return {"ok": True, "vacio": True, "cambios": [], "ventana_dias": eff, "ventana_pedida": dias,
                "lectura": "Aún acumulando señal de tu zona — vuelve cuando haya más búsquedas para detectar el movimiento."}

    cambios = []
    # 1 · Volumen de demanda (la señal madre)
    dv = _delta_pct(A["n"], B.get("n"))
    if dv is not None and abs(dv) >= 10:
        sube = dv > 0
        cambios.append({"señal": "Demanda", "direccion": "sube" if sube else "baja", "delta_pct": dv,
                        "valor": f"{A['n']} búsquedas", "antes": f"{B['n']}",
                        "lectura": (f"La búsqueda en tu zona subió {abs(dv):.0f}% — ventana para acelerar lanzamiento o subir precio."
                                    if sube else f"La búsqueda bajó {abs(dv):.0f}% — cuida el ritmo de precio y refuerza la captación.")})
    # 2 · Presupuesto (poder de compra) — mediana + n≥8 en ambas ventanas (anti-ruido de muestra chica)
    dp = _delta_pct(A.get("precio"), B.get("precio"))
    if dp is not None and abs(dp) >= 8 and A.get("precio") and A["n"] >= 15 and B.get("n", 0) >= 15:
        nota = " — señal preliminar (poca historia)" if abs(dp) > 40 else ""
        cambios.append({"señal": "Presupuesto", "direccion": "sube" if dp > 0 else "baja", "delta_pct": dp, "preliminar": abs(dp) > 40,
                        "valor": f"${round(A['precio']):,}", "antes": f"${round(B['precio']):,}" if B.get("precio") else None,
                        "lectura": f"El presupuesto típico buscado {'subió' if dp > 0 else 'bajó'} a ${round(A['precio']):,} (antes ${round(B['precio']):,}){nota}."})
    # 3 · Insatisfacción (demanda que no encuentra)
    du = (A.get("unmet_pct", 0) - B.get("unmet_pct", 0))
    if abs(du) >= 8:
        cambios.append({"señal": "Demanda insatisfecha", "direccion": "sube" if du > 0 else "baja", "delta_pp": round(du),
                        "valor": f"{A['unmet_pct']}%", "antes": f"{B.get('unmet_pct', 0)}%",
                        "lectura": (f"Subió {abs(du):.0f} puntos la demanda que NO encuentra match — oportunidad de producto." if du > 0
                                    else f"Bajó {abs(du):.0f} puntos la insatisfacción — el mercado se está cubriendo.")})
    # 4 · Recámaras (qué tipología pide ahora)
    if A.get("rec") and B.get("rec") and abs(A["rec"] - B["rec"]) >= 0.3:
        sube = A["rec"] > B["rec"]
        cambios.append({"señal": "Tipología", "direccion": "sube" if sube else "baja",
                        "valor": f"{A['rec']:.1f} rec", "antes": f"{B['rec']:.1f} rec",
                        "lectura": f"Ahora piden {'más' if sube else 'menos'} recámaras ({A['rec']:.1f} vs {B['rec']:.1f}) — revisa tu mezcla."})
    # 5 · Amenidad nueva en el top (qué quieren ahora)
    if A.get("top_amen") and A["top_amen"] != B.get("top_amen"):
        _antes = f" (antes '{B['top_amen']}')" if B.get("top_amen") else ""
        cambios.append({"señal": "Amenidad", "direccion": "nueva",
                        "valor": A["top_amen"], "antes": B.get("top_amen"),
                        "lectura": f"La amenidad más pedida cambió a '{A['top_amen']}'{_antes} — qué construir."})

    conf = "alta" if A["n"] >= 20 else ("media" if A["n"] >= 8 else "baja")
    if not cambios:
        lectura = "Tu zona está estable: ni la demanda ni los presupuestos se movieron de forma relevante este periodo."
    else:
        top = cambios[0]
        lectura = f"Tu zona se movió: {top['señal'].lower()} {top.get('direccion','')}. {top['lectura']}"
    return {"ok": True, "vacio": False, "ventana_dias": eff, "ventana_pedida": dias, "colonias": cols,
            "n_reciente": A["n"], "n_previo": B.get("n", 0), "confianza": conf,
            "cambios": cambios, "lectura": lectura}


# ── L68 · Generative — "¿Y si un competidor construye en TU zona?" (what-if DEFENSIVO) ────────────────────────────────
def _norm_col(s):
    import unicodedata
    s = str(s or "").strip().lower()
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


class CompetidorWhatIf(BaseModel):
    colonia: Optional[str] = None
    unidades_nuevas: int = Field(40, ge=1, le=2000)
    precio_m2: Optional[float] = None       # del competidor; default = precio mediano de la zona
    segmento: str = "NSE_C+"


@router.post("/competidor-whatif")
async def competidor_whatif(b: CompetidorWhatIf, request: Request):
    """L68 · Generative — el what-if DEFENSIVO que ninguna herramienta cubre (whatif_engine = TUS palancas; site-selection
    = TU expansión). Estima cómo te pega que un COMPETIDOR lance oferta en tu zona. Aterrizado en dato real: inventario
    disponible de la zona (units_available), tus unidades, demanda real (marketplace_searches) + absorción/elasticidad
    benchmark MX. Devuelve impacto en tiempo de venta + poder de precio + la respuesta recomendada. Fail-open."""
    import datetime as _dt
    from data_developments import DEVELOPMENTS
    from routes.dev_batch7 import BASELINE_ABSORPTION_BY_STATE, ELASTICITY_BY_SEGMENT  # constantes benchmark MX (reusa)
    user = await _auth(request)
    db = _db(request)
    mis_cols = await _dev_colonias(db, user)
    col = (b.colonia or (mis_cols[0] if mis_cols else "")).strip().lower()
    if not col:
        raise HTTPException(400, "Indica una colonia (o publica un desarrollo para autodetectarla).")
    coln = _norm_col(col)

    mis_dev_ids = set()
    try:
        from tenant_scope import user_dev_ids
        mis_dev_ids = set(user_dev_ids(user) or [])
    except Exception:  # noqa: BLE001
        pass

    def _pm2(d):   # precio/m² derivado (DEVELOPMENTS no trae price_m2; se calcula price_from / m2 mínimo, como el resto del código)
        try:
            mr = d.get("m2_range") or []
            pf = d.get("price_from")
            return (pf / mr[0]) if (pf and mr and mr[0]) else None
        except Exception:  # noqa: BLE001
            return None

    zona_devs = [d for d in DEVELOPMENTS if _norm_col(d.get("colonia_id") or d.get("colonia")) == coln]
    S = sum(int(d.get("units_available") or 0) for d in zona_devs)
    mias = sum(int(d.get("units_available") or 0) for d in zona_devs if d.get("id") in mis_dev_ids)
    precios = sorted([p for d in zona_devs if (p := _pm2(d))])
    precio_zona = precios[len(precios) // 2] if precios else None
    if S <= 0:
        return {"ok": True, "vacio": True, "colonia": col,
                "lectura": "No hay inventario disponible registrado en esta zona para simular el impacto."}

    N = b.unidades_nuevas
    since = _dt.datetime.utcnow() - _dt.timedelta(days=90)
    try:
        d90 = await db.marketplace_searches.count_documents({"colonia_id": col, "created_at_dt": {"$gte": since}})
    except Exception:  # noqa: BLE001
        d90 = 0
    d_month = round(d90 / 3, 1)

    # Absorción benchmark MX (anual → mensual) → meses para vaciar inventario; la nueva oferta lo alarga proporcional N/S.
    r_month = BASELINE_ABSORPTION_BY_STATE.get("CDMX", 0.40) / 12.0
    meses_antes = round(1 / r_month, 1)
    meses_despues = round((1 + N / S) / r_month, 1)
    supply_up_pct = round(N / S * 100, 1)

    # Presión de precio (elasticidad por NSE): si el competidor lista bajo el precio de zona, demanda sensible voltea.
    e = ELASTICITY_BY_SEGMENT.get(b.segmento, -0.9)
    P = b.precio_m2 or precio_zona
    gap_pct = share_riesgo = None
    if P and precio_zona and P < precio_zona:
        gap_pct = round((precio_zona - P) / precio_zona * 100, 1)
        share_riesgo = round(min(45.0, abs(e) * gap_pct), 1)   # cap 45% — sensible al precio, no toda la demanda

    score = supply_up_pct + (share_riesgo or 0)
    veredicto = "alto" if score >= 50 else ("medio" if score >= 20 else "bajo")

    recs = []
    if supply_up_pct >= 25:
        recs.append("Acelera la venta de tus unidades disponibles ANTES del lanzamiento del competidor — asegura tus leads calientes ya.")
    if share_riesgo and share_riesgo >= 15:
        recs.append("No bajes precio de lista: diferénciate (amenidad / fecha de entrega / esquema). Recortar regala margen sin frenarlo.")
    if d_month >= 5:
        recs.append(f"La demanda viva de tu zona (~{d_month:.0f} búsquedas/mes) ayuda a absorber la nueva oferta — el golpe es manejable con ritmo comercial.")
    if not recs:
        recs.append("Impacto bajo: mantén el plan. Vigila el precio del competidor por si recorta y re-simula.")

    lectura = (f"Si un competidor lanza {N} unidades en {col.title()}: el inventario de la zona sube {supply_up_pct:.0f}% y "
               f"el tiempo de venta pasaría de ~{meses_antes:.0f} a ~{meses_despues:.0f} meses. "
               + (f"A {gap_pct:.0f}% bajo el precio de zona, ~{share_riesgo:.0f}% de la demanda sensible al precio voltearía a verlos. " if share_riesgo else "")
               + f"Impacto {veredicto}.")

    return {
        "ok": True, "vacio": False, "colonia": col, "veredicto": veredicto,
        "supuestos": {"unidades_nuevas": N, "precio_m2_competidor": round(P) if P else None, "segmento": b.segmento},
        "zona": {"inventario_disponible": S, "tus_unidades": mias, "precio_m2_zona": round(precio_zona) if precio_zona else None,
                 "demanda_mensual": d_month},
        "impacto": {
            "inventario_sube_pct": supply_up_pct,
            "meses_venta_antes": meses_antes, "meses_venta_despues": meses_despues,
            "meses_extra": round(meses_despues - meses_antes, 1),
            "competencia_directa_antes": max(0, S - mias), "competencia_directa_despues": max(0, S - mias) + N,
            "demanda_en_riesgo_pct": share_riesgo, "gap_precio_pct": gap_pct,
        },
        "recomendaciones": recs, "lectura": lectura,
        "disclaimer": "Estimación: absorción base CDMX 0.40/año + elasticidad por NSE. Se afina con tu histórico de cierres.",
    }


# ─── Cubo unificado · Inbox de RECOMENDACIONES del superadmin (F3 · cierra el loop) ──
# El superadmin genera briefs ("qué construir aquí") desde el Hub de Mercado y los ENVÍA a la zona.
# El dev los recibe aquí y responde (aceptar/rechazar+nota) → la respuesta vuelve al Hub. Owner-scoped:
# el dev solo ve briefs de SUS colonias; su respuesta se guarda por tenant (no pisa la de otro dev).
class BriefRespuesta(BaseModel):
    status: str            # aceptado | rechazado | en_revision
    nota: Optional[str] = None


def _dev_tenant(user):
    return getattr(user, "tenant_id", None) or getattr(user, "user_id", None)


@router.get("/recomendaciones")
async def dev_recomendaciones(request: Request):
    """Briefs de producto que el superadmin envió a las colonias del dev. Cada uno con la respuesta del
    propio dev (si ya respondió). No filtra respuestas de otros devs."""
    user = await _auth(request)
    db = _db(request)
    cols = await _dev_colonias(db, user)
    if not cols:
        return {"ok": True, "vacio": True, "recomendaciones": [],
                "lectura": "Publica un desarrollo y aquí verás las recomendaciones de producto para tus zonas."}
    tenant = _dev_tenant(user)
    out = []
    try:
        cursor = db.product_briefs.find(
            {"status": "enviado", "colonia": {"$in": [c.lower() for c in cols]}}, {"_id": 0},
        ).sort("created_at", -1).limit(50)
        async for b in cursor:
            b["mi_respuesta"] = (b.get("respuestas") or {}).get(tenant)
            b.pop("respuestas", None)        # privacidad: no exponer respuestas de otros devs
            b.pop("created_by", None)
            out.append(b)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[dev recomendaciones] {e}")
    return {"ok": True, "vacio": len(out) == 0, "recomendaciones": out}


@router.post("/recomendaciones/{brief_id}/respond")
async def dev_responder_recomendacion(brief_id: str, body: BriefRespuesta, request: Request):
    user = await _auth(request)
    db = _db(request)
    if body.status not in ("aceptado", "rechazado", "en_revision"):
        raise HTTPException(400, "status inválido")
    cols = [c.lower() for c in (await _dev_colonias(db, user))]
    # Solo se responde a briefs ENVIADOS a las colonias del dev — antes solo validaba la colonia, así que un
    # dev podía responder un brief en 'borrador' (aún no despachado) de su zona enumerando ids.
    b = await db.product_briefs.find_one({"id": brief_id, "status": "enviado"}, {"_id": 0, "colonia": 1})
    if not b or (b.get("colonia") or "").lower() not in cols:
        raise HTTPException(404, "Recomendación no encontrada en tus zonas")
    import datetime as _dt
    tenant = _dev_tenant(user)
    resp = {"status": body.status, "nota": (body.nota or "")[:500], "at": _dt.datetime.utcnow().isoformat(),
            "by": user.user_id}
    await db.product_briefs.update_one({"id": brief_id}, {"$set": {f"respuestas.{tenant}": resp}})
    try:
        from audit_log import log_mutation
        await log_mutation(db, user, "update", "product_brief_respuesta", brief_id,
                           before=None, after={"status": body.status}, request=request)
    except Exception:
        pass
    return {"ok": True, "respuesta": resp}
