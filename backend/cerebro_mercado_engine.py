"""
cerebro_mercado_engine — F2.5 · El Cerebro del Mercado (loop causal a nivel mercado).
═══════════════════════════════════════════════════════════════════════════════
Extiende el Cerebro E4 (cerebro/coach.py, hoy por-asesor) al MODELO DE MERCADO cross-portal:
  • Registra las predicciones del lado demanda (prob_venta v2, precio, días) bajo un actor
    "mercado" anónimo (tenant __market__) — reusa coach.log_prediction (cero duplicación).
  • Cuando llega la realidad (una unidad se vende) compara predicho ↔ real, mide el error
    y dispara reentreno — reusa coach.resolve_predictions + coach.retrain_signal.
  • Aprende PALANCAS: qué feature mueve la venta (% vendido por nº de recámaras, etc.).
  • Expone el panel "Cómo Aprende El Mercado" (calibración + palancas + lecciones).
Doctrina de Datos: build-for-endstate (con pocas ventas dice "aún aprendiendo"), bandas
honestas. FAIL-OPEN: nunca rompe el flujo que lo invoca.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

from cerebro import coach

log = logging.getLogger("dmx.cerebro_mercado")

# Actor sintético "mercado": agrega las predicciones de todos los portales, anónimo.
_MARKET = {"tenant_id": "__market__", "user_id": "__market__", "role": "superadmin"}
_TENANT = "__market__"


async def registrar_prediccion(db, *, kind: str, predicted, ref: str,
                               meta: Optional[dict] = None, dedup: bool = True) -> Dict[str, Any]:
    """Registra una predicción de mercado. dedup: 1 predicción abierta por (ref, kind). FAIL-OPEN."""
    try:
        if dedup:
            ex = await db[coach.CEREBRO_PREDICTIONS].find_one(
                {"tenant_id": _TENANT, "ref": ref, "kind": kind, "resolved": False},
                {"_id": 0, "id": 1})
            if ex:
                return {"ok": True, "dedup": True}
        return await coach.log_prediction(db, _MARKET, kind=kind, predicted=predicted, ref=ref, meta=meta)
    except Exception as e:
        log.warning(f"[cerebro_mercado] registrar fail-open: {e}")
        return {"ok": False}


async def on_unit_sold(db, ref: str, *, sold: bool = True,
                       price_real=None, days_real=None) -> Dict[str, Any]:
    """La realidad de una unidad (ref = devId__unitId) → resuelve predicciones + reentreno. FAIL-OPEN."""
    try:
        actuals: Dict[str, Any] = {"close_prob": bool(sold)}
        if price_real:
            actuals["price"] = price_real
        if days_real is not None:
            actuals["days_on_market"] = days_real
        n = await coach.resolve_predictions(db, _MARKET, ref, actuals)
        if sold and n:
            await coach.retrain_signal(db, _MARKET, trigger="unit_sold", level="market")
        return {"resueltas": n}
    except Exception as e:
        log.warning(f"[cerebro_mercado] on_unit_sold fail-open: {e}")
        return {"resueltas": 0}


async def resolver_estudio(db, ref: str, demanda_real) -> Dict[str, Any]:
    """Resuelve la predicción de demanda de un estudio (ref) vs la demanda REAL de hoy → cierra el loop.
    Reusa coach.resolve_predictions + dispara reentreno si resolvió algo. FAIL-OPEN."""
    try:
        n = await coach.resolve_predictions(db, _MARKET, ref, {"days_on_market": float(demanda_real)})
        if n:
            await coach.retrain_signal(db, _MARKET, trigger="estudio_regenerado", level="market")
        return {"resueltas": n}
    except Exception as e:
        log.warning(f"[cerebro_mercado] resolver_estudio fail-open: {e}")
        return {"resueltas": 0}


# ── F4.2 · Factores que el Cerebro puede aprender (campos REALES del átomo de unidad) ──
def _piso_band(level):
    if level is None:
        return None
    try:
        lv = int(level)
    except (TypeError, ValueError):
        return None
    if lv <= 0:
        return "Planta baja"
    if lv <= 3:
        return "Pisos bajos (1-3)"
    if lv <= 7:
        return "Pisos medios (4-7)"
    return "Pisos altos (8+)"


def _precio_band(p):
    if not p:
        return None
    if p < 4_000_000:
        return "Económico (<$4M)"
    if p < 9_000_000:
        return "Medio ($4-9M)"
    return "Premium ($9M+)"


_FACTOR_EXTRACTORS = {
    "recamaras":      lambda u: (f"{u.get('bedrooms')} recámaras" if u.get("bedrooms") is not None else None),
    "terraza":        lambda u: ("Con terraza" if (u.get("m2_terrace") or 0) > 0 else "Sin terraza"),
    "bodega":         lambda u: ("Con bodega" if u.get("bodega") else "Sin bodega"),
    "estacionamiento": lambda u: ("2+ cajones" if (u.get("parking_spots") or 0) >= 2 else "1 o 0 cajones"),
    "piso":           lambda u: _piso_band(u.get("level")),
    "precio":         lambda u: _precio_band(u.get("price")),
}
_FACTOR_NOMBRE = {"recamaras": "recámaras", "terraza": "terraza", "bodega": "bodega",
                  "estacionamiento": "estacionamiento", "piso": "piso", "precio": "banda de precio"}


def factores_disponibles() -> List[Dict[str, str]]:
    """Lista de factores que el Cerebro sabe leer (para el selector del simulador)."""
    return [{"key": k, "nombre": _FACTOR_NOMBRE.get(k, k)} for k in _FACTOR_EXTRACTORS]


async def lifts_por_factor(db, factor: str) -> Dict[str, Any]:
    """% vendido (lift vs base) por cada opción de un factor, sobre ventas REALES. Honesto. FAIL-OPEN.
    Usa el is_sold canónico (cero duplicación de la definición de 'vendido')."""
    factor = str(factor or "").lower()  # P3.2 · coerción defensiva (dict/no-str → str)
    ext = _FACTOR_EXTRACTORS.get(factor)
    if not ext:
        return {"factor": factor, "opciones": [], "suficiente_dato": False,
                "lectura": f"Factor '{factor}' no soportado."}
    try:
        from data_developments import DEVELOPMENTS, is_sold
        buckets = defaultdict(lambda: {"sold": 0, "total": 0})
        for d in DEVELOPMENTS:
            for u in (d.get("units") or []):
                label = ext(u)
                if label is None:
                    continue
                buckets[label]["total"] += 1
                if is_sold(u.get("status")):
                    buckets[label]["sold"] += 1
        tot_all = sum(b["total"] for b in buckets.values()) or 1
        sold_all = sum(b["sold"] for b in buckets.values())
        base = sold_all / tot_all
        opciones = []
        for k, b in buckets.items():
            if b["total"] < 3:
                continue
            rate = b["sold"] / b["total"]
            opciones.append({"valor": k, "vendido_pct": round(rate * 100),
                             "lift_pp": round((rate - base) * 100), "n": b["total"]})
        opciones.sort(key=lambda x: -x["vendido_pct"])
        suficiente = tot_all >= 12 and sold_all >= 4 and len(opciones) >= 2
        from data_doctrine import has_real_sales
        real = await has_real_sales(db)
        if not suficiente:
            lectura = "Aprendiendo: aún con pocas ventas para confirmar este factor."
        elif real:
            lectura = "Lifts detectados por % de venta real."
        else:
            lectura = "Lifts del catálogo de ejemplo (DEMO · aún sin ventas reales en la plataforma)."
        return {
            "factor": factor, "nombre": _FACTOR_NOMBRE.get(factor, factor),
            "opciones": opciones, "base_pct": round(base * 100), "n_total": tot_all,
            "suficiente_dato": suficiente, "data_basis": "real" if real else "demo",
            "lectura": lectura,
        }
    except Exception as e:
        log.warning(f"[cerebro_mercado] lifts_por_factor fail-open: {e}")
        return {"factor": factor, "opciones": [], "suficiente_dato": False, "lectura": "Aún aprendiendo."}


async def aprender_palancas(db) -> Dict[str, Any]:
    """Palancas por nº de recámaras (panel 'Cómo Aprende'). Delega en lifts_por_factor (cero duplicación)."""
    r = await lifts_por_factor(db, "recamaras")
    palancas = [{"factor": o["valor"], "vendido_pct": o["vendido_pct"], "lift_pp": o["lift_pp"], "n": o["n"]}
                for o in (r.get("opciones") or [])]
    palancas.sort(key=lambda x: -x["lift_pp"])
    return {
        "palancas": palancas[:6],
        "base_pct": r.get("base_pct"),
        "n_total": r.get("n_total"),
        "suficiente_dato": r.get("suficiente_dato", False),
        "lectura": r.get("lectura", "Aún aprendiendo."),
    }


async def detectar_drift(db, window: int = 10) -> Dict[str, Any]:
    """El Cerebro se vigila a sí mismo: ¿su acierto RECIENTE empeoró vs el histórico? (F4.4).
    Mismo patrón que drift_detector (reciente vs baseline + umbral). Honesto si falta historial. FAIL-OPEN."""
    MIN = 5            # mínimo por ventana para que el aviso sea creíble
    señales: List[Dict[str, Any]] = []
    try:
        for kind, spec in coach.PRED_KINDS.items():
            metric = spec.get("metric")
            cur = db[coach.CEREBRO_PREDICTIONS].find(
                {"tenant_id": _TENANT, "kind": kind, "resolved": True, "is_example": {"$ne": True}},
                {"_id": 0, "hit": 1, "error": 1, "resolved_at": 1}).sort("resolved_at", -1)
            rows = await cur.to_list(500)
            if len(rows) < MIN * 2:
                continue
            recientes, viejas = rows[:window], rows[window:]
            if len(recientes) < MIN or len(viejas) < MIN:
                continue

            def _hr(rs):
                h = [r for r in rs if r.get("hit") is not None]
                return (sum(1 for r in h if r["hit"]) / len(h)) if h else None

            def _err(rs):
                e = [r["error"] for r in rs if r.get("error") is not None]
                return (sum(e) / len(e)) if e else None

            empeoro = False
            detalle = ""
            if metric in ("hit", "match"):
                r_hr, b_hr = _hr(recientes), _hr(viejas)
                if r_hr is not None and b_hr is not None and r_hr <= b_hr - 0.15:
                    empeoro = True
                    detalle = f"acierto bajó de {round(b_hr*100)}% a {round(r_hr*100)}%"
            else:  # error_days / error_pct → más error = peor
                r_e, b_e = _err(recientes), _err(viejas)
                if r_e is not None and b_e is not None and b_e > 0 and r_e >= b_e * 1.3:
                    unidad = "%" if metric == "error_pct" else " días"
                    fmt = (lambda v: round(v*100)) if metric == "error_pct" else round
                    empeoro = True
                    detalle = f"error subió de {fmt(b_e)}{unidad} a {fmt(r_e)}{unidad}"
            if empeoro:
                señales.append({"kind": kind, "label": spec["label"], "detalle": detalle,
                                "n_reciente": len(recientes), "n_baseline": len(viejas)})
    except Exception as e:
        log.warning(f"[cerebro_mercado] detectar_drift fail-open: {e}")

    hay = len(señales) > 0
    return {
        "drift": hay,
        "señales": señales,
        "lectura": ("⚠️ El Cerebro está fallando más que antes en: "
                    + "; ".join(f"{s['label']} ({s['detalle']})" for s in señales)
                    + ". Conviene revisar/recalibrar."
                    if hay else "El Cerebro mantiene su precisión — sin deterioro detectado."),
    }


async def aprendizaje_mercado(db) -> Dict[str, Any]:
    """Panel 'Cómo Aprende El Mercado': calibración + palancas + lecciones + conteos. FAIL-OPEN."""
    try:
        await coach.ensure_learning_indexes(db)
    except Exception:
        pass
    try:
        cal = await coach.calibration(db, _MARKET)
    except Exception:
        cal = []
    pal = await aprender_palancas(db)
    try:
        lecciones = await coach.recent_lessons(db, _MARKET, limit=6)
    except Exception:
        lecciones = []
    abiertas = resueltas = 0
    try:
        abiertas = await db[coach.CEREBRO_PREDICTIONS].count_documents({"tenant_id": _TENANT, "resolved": False})
        resueltas = await db[coach.CEREBRO_PREDICTIONS].count_documents({"tenant_id": _TENANT, "resolved": True})
    except Exception:
        pass
    drift = await detectar_drift(db)   # F4.4 · el modelo que vigila al modelo
    return {
        "calibracion": cal,
        "palancas": pal,
        "lecciones": lecciones,
        "predicciones": {"abiertas": abiertas, "resueltas": resueltas},
        "drift": drift,
        "lectura": "El Cerebro se califica solo: guarda lo que predice y lo compara con lo que pasa de verdad.",
    }
