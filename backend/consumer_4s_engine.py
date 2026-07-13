"""
consumer_4s_engine.py — INTELIGENCIA DEL CONSUMIDOR desde los estudios 4S (superadmin-only).

Los 4 upgrades que faltaban del dato 4S (decisión founder 2026-07-12: superficie EXCLUSIVA superadmin):
  1. wtp_snapshot        — cuánto PAGA la gente: tope de mantenimiento por zona (vs benchmark DMX),
                           elevautos/cajón/bodega, tolerancia a +8% de precio, enganche y descuento típicos.
  2. producto_ideal      — QUÉ producto quiere el mercado: recámaras/baños/cocina/espacio dominantes,
                           habitar vs inversión. El spec para el generador de producto.
  3. score_verde         — qué factor de sustentabilidad MUEVE la decisión de compra (ranking real).
  4. validar_plusvalia   — avalúos vs reventa vs obra nueva: prima de mercado sobre avalúo y premium
                           de lo nuevo, por estudio. Valida el IPV con dato real.

Doctrina: todo agregado de zona (sin identidad); sin dato → es_estimado honesto, no inventa. FAIL-OPEN.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.consumer_4s")

FUENTE = "4s_2026-05"

# benchmark de mantenimiento $/m²/mes DMX (mismo default que amenidades/ownership_economics)
_BASE_MANT_M2 = 40.0


async def _wtp_doc(db) -> Optional[Dict[str, Any]]:
    try:
        return await db.wtp_4s.find_one({"fuente": FUENTE})
    except Exception as e:
        log.warning("[consumer_4s] wtp_doc fail-open: %s", e)
        return None


def _mid(v) -> Optional[float]:
    """Punto medio de un rango [lo, hi], o el valor si es escalar."""
    if v is None:
        return None
    if isinstance(v, (list, tuple)):
        vals = [float(x) for x in v if x is not None]
        return sum(vals) / len(vals) if vals else None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _rng(v) -> Optional[Dict[str, Any]]:
    if v is None:
        return None
    if isinstance(v, (list, tuple)) and len(v) >= 2:
        return {"min": v[0], "max": v[1]}
    return {"min": v, "max": v}


async def _m2_prom_por_estudio(db) -> Dict[str, float]:
    """m² promedio de los comparables por estudio (para volver $/mes → $/m²)."""
    acc: Dict[str, List[float]] = {}
    try:
        async for c in db.market_comps_4s.find({}, {"_id": 0, "estudio": 1, "m2_promedio": 1}):
            if c.get("estudio") and c.get("m2_promedio"):
                acc.setdefault(c["estudio"], []).append(float(c["m2_promedio"]))
    except Exception as e:
        log.warning("[consumer_4s] m2_prom fail-open: %s", e)
    return {k: sum(v) / len(v) for k, v in acc.items() if v}


# ── 1 · WTP: cuánto paga la gente ─────────────────────────────────────────────
async def wtp_snapshot(db) -> Dict[str, Any]:
    doc = await _wtp_doc(db)
    w = (doc or {}).get("willingness_to_pay") or {}
    if not w:
        return {"es_estimado": True, "zonas": [], "lectura": "Sin dato WTP 4S cargado."}

    m2_prom = await _m2_prom_por_estudio(db)
    topes = w.get("mantenimiento_tope_mensual_mxn") or {}
    eleva = w.get("elevautos_400k_decisivo_pct") or {}
    cajon = w.get("cajon_extra_400k_interesado_pct") or {}
    tol = w.get("tolerancia_precio_mas_8pct_si_pct") or {}

    zonas = []
    for z, tope in topes.items():
        tope_mid = _mid(tope)
        m2 = m2_prom.get(z)
        tarifa_tope = round(tope_mid / m2, 1) if (tope_mid and m2) else None
        # tolerancia: puede venir por sub-zona (insurgentes_zona1/2) → toma la mayor que empiece igual
        tol_z = max((v for k, v in tol.items() if str(k).startswith(z)), default=None)
        zonas.append({
            "zona": z,
            "mantenimiento_tope_mxn": _rng(tope),
            "tarifa_tope_m2": tarifa_tope,                    # $/m²/mes que el mercado tolera
            "vs_benchmark_dmx": (round(tarifa_tope - _BASE_MANT_M2, 1) if tarifa_tope else None),
            "elevautos_decisivo_pct": eleva.get(z),
            "cajon_extra_interesado_pct": cajon.get(z),
            "tolerancia_precio_mas_8pct_si_pct": tol_z,
        })
    zonas.sort(key=lambda x: -(x.get("tolerancia_precio_mas_8pct_si_pct") or 0))

    top = zonas[0] if zonas else {}
    return {
        "es_estimado": False, "fuente": FUENTE,
        "zonas": zonas,
        "cajon_extra_precio_alternativo_mxn": _rng(w.get("cajon_extra_precio_alternativo_mxn")),
        "bodega_compra_mxn": _rng(w.get("bodega_compra_mxn")),
        "bodega_renta_mensual_mxn": _rng(w.get("bodega_renta_mensual_mxn")),
        "enganche_mas_comun_pct": w.get("enganche_mas_comun_pct"),
        "descuento_mas_atractivo_pct": w.get("descuento_mas_atractivo_pct"),
        "lectura": (f"El mercado que más aguanta precio: {top.get('zona')} "
                    f"({top.get('tolerancia_precio_mas_8pct_si_pct')}% acepta +8%). "
                    f"Enganche típico {w.get('enganche_mas_comun_pct')}% · "
                    f"descuento que más convierte {w.get('descuento_mas_atractivo_pct')}%.") if zonas else "",
    }


# ── 2 · Producto ideal: qué quiere el mercado ─────────────────────────────────
def _dominante(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Opción con mayor techo de preferencia ({opcion: pct|[lo,hi]}) → {opcion, pct}."""
    if not d:
        return None
    best, best_hi = None, -1.0
    for k, v in d.items():
        hi = (max(v) if isinstance(v, (list, tuple)) and v else _mid(v)) or 0
        if hi > best_hi:
            best, best_hi = k, hi
    return {"opcion": best, "pct": _rng(d.get(best))} if best is not None else None


async def producto_ideal(db) -> Dict[str, Any]:
    doc = await _wtp_doc(db)
    p = (doc or {}).get("preferencias_producto") or {}
    if not p:
        return {"es_estimado": True, "spec": {}, "lectura": "Sin preferencias 4S cargadas."}

    spec = {
        "recamaras": _dominante(p.get("recamaras_pct")),
        "banos": _dominante(p.get("banos_pct")),
        "cocina": _dominante(p.get("cocina_pct")),
        "area_a_maximizar": _dominante(p.get("area_maximizar_pct")),
        "espacio_adicional": _dominante(p.get("espacio_adicional_pct")),
    }
    habitar = _rng(p.get("intencion_habitar_pct"))
    inversion = _rng(p.get("intencion_inversion_pct"))
    rec = (spec.get("recamaras") or {}).get("opcion")
    coc = str((spec.get("cocina") or {}).get("opcion") or "").replace("_", " ")
    extra = str((spec.get("espacio_adicional") or {}).get("opcion") or "").replace("_", " ")
    return {
        "es_estimado": False, "fuente": FUENTE,
        "spec": spec,
        "intencion_habitar_pct": habitar,
        "intencion_inversion_pct": inversion,
        "renta_airbnb_pct": _rng(p.get("renta_airbnb_pct")),
        "distribucion_completa": p,                    # hipergranular: todas las opciones con su %
        "lectura": (f"El producto que el mercado pide: {rec} recámaras · cocina {coc} · {extra}. "
                    f"Comprador mayormente para HABITAR ({(habitar or {}).get('min')}–{(habitar or {}).get('max')}%)."),
    }


# ── 3 · Score verde: sustentabilidad que vende ────────────────────────────────
async def score_verde(db) -> Dict[str, Any]:
    doc = await _wtp_doc(db)
    s = (doc or {}).get("sustentabilidad_factor_decision_si_pct") or {}
    if not s:
        return {"es_estimado": True, "ranking": [], "lectura": "Sin dato de sustentabilidad 4S."}

    ranking = []
    for k, v in s.items():
        mid = _mid(v)
        if mid is None:
            continue
        ranking.append({"factor": k, "decide_compra_pct": _rng(v), "pct_mid": round(mid, 1)})
    ranking.sort(key=lambda x: -x["pct_mid"])
    imprescindibles = [r["factor"] for r in ranking if r["pct_mid"] >= 60]
    top = ranking[0] if ranking else {}
    return {
        "es_estimado": False, "fuente": FUENTE,
        "ranking": ranking,
        "imprescindibles": imprescindibles,           # ≥60% del mercado decide por esto
        "lectura": (f"Lo verde SÍ vende: {str(top.get('factor', '')).replace('_', ' ')} decide la compra del "
                    f"{top.get('pct_mid')}% del mercado. {len(imprescindibles)} factores son imprescindibles (≥60%).")
                   if ranking else "",
    }


# ── 4 · Plusvalía validada: avalúo vs reventa vs obra nueva ──────────────────
async def validar_plusvalia(db) -> Dict[str, Any]:
    doc = await _wtp_doc(db)
    avs = (doc or {}).get("avaluos_reventa") or []
    if not avs:
        return {"es_estimado": True, "estudios": [], "lectura": "Sin avalúos 4S cargados."}

    # precio m² mediano de OBRA NUEVA por estudio (comparables 4S)
    nuevos: Dict[str, List[float]] = {}
    try:
        async for c in db.market_comps_4s.find({}, {"_id": 0, "estudio": 1, "precio_m2": 1}):
            if c.get("estudio") and c.get("precio_m2"):
                nuevos.setdefault(c["estudio"], []).append(float(c["precio_m2"]))
    except Exception as e:
        log.warning("[consumer_4s] nuevos fail-open: %s", e)

    def _mediana(vals: List[float]) -> Optional[float]:
        srt = sorted(vals)
        if not srt:
            return None
        m = len(srt) // 2
        return srt[m] if len(srt) % 2 else (srt[m - 1] + srt[m]) / 2

    por_estudio: Dict[str, Dict[str, Any]] = {}
    for a in avs:
        est = a.get("estudio")
        if not est:
            continue
        por_estudio.setdefault(est, {})[a.get("tipo")] = a

    estudios = []
    for est, tipos in por_estudio.items():
        rev = (tipos.get("reventa") or {}).get("precio_m2_prom")
        ava = (tipos.get("avaluo") or {}).get("precio_m2_prom")
        nuevo = _mediana(nuevos.get(est, []))
        prima_avaluo = round(100 * (rev - ava) / ava, 1) if (rev and ava) else None
        premium_nuevo = round(100 * (nuevo - rev) / rev, 1) if (nuevo and rev) else None
        if prima_avaluo is None:
            veredicto = "Dato incompleto"
        elif prima_avaluo >= 20:
            veredicto = "Zona caliente: el mercado paga muy por encima del avalúo (plusvalía real)"
        elif prima_avaluo >= 8:
            veredicto = "Plusvalía sana: mercado por encima del avalúo"
        else:
            veredicto = "Mercado pegado al avalúo: plusvalía moderada"
        estudios.append({
            "estudio": est,
            "reventa_m2": rev, "avaluo_m2": ava, "obra_nueva_m2": (round(nuevo) if nuevo else None),
            "n_reventas": (tipos.get("reventa") or {}).get("total"),
            "n_avaluos": (tipos.get("avaluo") or {}).get("total"),
            "prima_mercado_vs_avaluo_pct": prima_avaluo,   # cuánto paga el mercado sobre el avalúo
            "premium_obra_nueva_pct": premium_nuevo,       # cuánto más vale lo nuevo vs reventa
            "veredicto": veredicto,
        })
    estudios.sort(key=lambda x: -(x.get("prima_mercado_vs_avaluo_pct") or 0))

    top = estudios[0] if estudios else {}
    return {
        "es_estimado": False, "fuente": FUENTE,
        "estudios": estudios,
        "lectura": (f"Mayor prima de mercado: {top.get('estudio')} paga {top.get('prima_mercado_vs_avaluo_pct')}% "
                    f"sobre avalúo — contraste esto con el IPV de la zona en el terminal de índices.")
                   if estudios else "",
    }


# ── Master: los 4 en una llamada (para el god-view) ───────────────────────────
async def inteligencia_consumidor(db) -> Dict[str, Any]:
    wtp = await wtp_snapshot(db)
    prod = await producto_ideal(db)
    verde = await score_verde(db)
    plus = await validar_plusvalia(db)
    return {
        "wtp": wtp, "producto_ideal": prod, "score_verde": verde, "plusvalia": plus,
        "fuente": FUENTE,
        "es_estimado": all(x.get("es_estimado") for x in (wtp, prod, verde, plus)),
    }
