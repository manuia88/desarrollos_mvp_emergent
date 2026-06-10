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


async def aprender_palancas(db) -> Dict[str, Any]:
    """Qué feature mueve la venta: % vendido por nº de recámaras (vs base). Honesto si hay poco dato."""
    try:
        from data_developments import DEVELOPMENTS
        buckets = defaultdict(lambda: {"sold": 0, "total": 0})
        for d in DEVELOPMENTS:
            for u in (d.get("units") or []):
                rec = u.get("bedrooms")
                if rec is None:
                    continue
                sold = bool(u.get("vendido")) or u.get("status") == "vendido"
                key = f"{rec} recámaras"
                buckets[key]["total"] += 1
                if sold:
                    buckets[key]["sold"] += 1
        tot_all = sum(b["total"] for b in buckets.values()) or 1
        sold_all = sum(b["sold"] for b in buckets.values())
        base = sold_all / tot_all
        palancas = []
        for k, b in buckets.items():
            if b["total"] < 3:
                continue
            rate = b["sold"] / b["total"]
            palancas.append({"factor": k, "vendido_pct": round(rate * 100),
                             "lift_pp": round((rate - base) * 100), "n": b["total"]})
        palancas.sort(key=lambda x: -x["lift_pp"])
        suficiente = tot_all >= 12 and sold_all >= 4
        return {
            "palancas": palancas[:6],
            "suficiente_dato": suficiente,
            "lectura": ("Palancas detectadas por % de venta real."
                        if suficiente else
                        "Aprendiendo: aún con pocas ventas reales para confirmar palancas causales."),
        }
    except Exception as e:
        log.warning(f"[cerebro_mercado] palancas fail-open: {e}")
        return {"palancas": [], "suficiente_dato": False, "lectura": "Aún aprendiendo."}


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
    return {
        "calibracion": cal,
        "palancas": pal,
        "lecciones": lecciones,
        "predicciones": {"abiertas": abiertas, "resueltas": resueltas},
        "lectura": "El Cerebro se califica solo: guarda lo que predice y lo compara con lo que pasa de verdad.",
    }
