"""
comercial_value_model — Del valor catastral OFICIAL del suelo al valor COMERCIAL estimado (ING.2).
═══════════════════════════════════════════════════════════════════════════════
PROBLEMA: el valor catastral del suelo ($/m², SIG · ING.1) es oficial y granular, pero es un PISO
(el suelo catastral vale ~40-65% del precio comercial construido, y la relación NO es un múltiplo
fijo entre colonias). Multiplicar por un factor inventado sería deuda.

SOLUCIÓN honesta + que aprende (flywheel): donde tenemos AMBOS — valor catastral del suelo Y
ventas reales (cierres del asesor) — la relación es OBSERVABLE. Ajustamos un modelo lineal
`comercial = a + b·catastral` por mínimos cuadrados y medimos su fiabilidad (R²).
  · Si el modelo es fiable (suficientes ventas + buen ajuste) → estima el valor comercial de las
    colonias que tienen catastral pero AÚN no tienen ventas (rellena la cola larga).
  · Si NO es fiable todavía → NO inventa: el catastral se queda solo como piso oficial.

Cada venta nueva recalibra el modelo (lo dispara `registrar_cierre`/Cerebro on_deal_closed) → las
estimaciones mejoran solas. Hoy, con 0 cierres, el modelo queda EN STUB (confianza baja, no estima)
y se enciende solo al acumular ventas. Cero deuda.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.comercial_value")

# Umbrales de fiabilidad del modelo (cuándo SÍ estima vs cuándo solo es piso).
_MIN_ALTA, _R2_ALTA = 8, 0.50
_MIN_MEDIA, _R2_MEDIA = 4, 0.30


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ols(xs: List[float], ys: List[float]) -> Optional[Dict[str, float]]:
    """Ajuste lineal y = a + b·x por mínimos cuadrados + R². None si no hay varianza."""
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx <= 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx
    a = my - b * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    return {"a": a, "b": b, "r2": max(0.0, min(1.0, r2))}


def _median(xs: List[float]) -> Optional[float]:
    xs = sorted(x for x in xs if x and x > 0)
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


async def _comercial_real_pm2(db, colonia_id: str) -> Optional[Tuple[float, str]]:
    """$/m² comercial REAL de una colonia (cierres preferido · reventa de respaldo) → (pm2, fuente).
    None si no hay ancla real."""
    from resale_data import _pm2s_cierres, _pm2s_captaciones, _robust_median
    cierres = await _pm2s_cierres(db, colonia_id)
    m = _robust_median(cierres)
    if m:
        return (m, "cierres")
    capt = await _pm2s_captaciones(db, colonia_id)
    m = _robust_median(capt)
    if m:
        return (m, "reventa")
    return None


async def recalibrate(db, city: str = "CDMX") -> Dict[str, Any]:
    """Aprende la relación suelo→comercial con las colonias que tienen AMBOS datos y guarda el
    modelo + su fiabilidad. Honesto: con pocas muestras o mal ajuste, marca confianza baja
    (no estimará). Lo dispara cada venta nueva (flywheel)."""
    xs: List[float] = []   # catastral $/m²
    ys: List[float] = []   # comercial $/m²
    muestras: List[Dict[str, Any]] = []
    cur = db.colonias.find(
        {"city": city, "vsuelo_pm2_catastral": {"$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "vsuelo_pm2_catastral": 1},
    )
    async for c in cur:
        cat = c.get("vsuelo_pm2_catastral")
        if not cat or cat <= 0:
            continue
        real = await _comercial_real_pm2(db, c["id"])
        if not real:
            continue
        com, fuente = real
        xs.append(float(cat))
        ys.append(float(com))
        muestras.append({"colonia": c.get("name") or c["id"], "catastral": round(cat),
                         "comercial": round(com), "fuente": fuente})

    n = len(xs)
    fit = _ols(xs, ys) if n >= 2 else None
    ratios = [y / x for x, y in zip(xs, ys) if x > 0]
    ratio_med = _median(ratios)

    if n >= _MIN_ALTA and fit and fit["r2"] >= _R2_ALTA:
        confianza = "alta"
    elif n >= _MIN_MEDIA and fit and fit["r2"] >= _R2_MEDIA:
        confianza = "media"
    else:
        confianza = "baja"

    doc = {
        "city": city,
        "a": round(fit["a"], 2) if fit else None,
        "b": round(fit["b"], 4) if fit else None,
        "r2": round(fit["r2"], 3) if fit else None,
        "ratio_mediana": round(ratio_med, 2) if ratio_med else None,
        "n": n,
        "confianza": confianza,
        "estima": confianza in ("alta", "media"),
        "muestras": muestras[:50],
        "updated_at": _iso(),
        "leyenda": _leyenda(confianza, n),
    }
    try:
        await db.valuation_calibration.update_one(
            {"city": city}, {"$set": doc}, upsert=True)
    except Exception as e:
        log.warning(f"[comercial] guardar calibración: {e}")
    return doc


def _leyenda(confianza: str, n: int) -> str:
    if confianza == "alta":
        return f"Modelo del suelo al precio comercial calibrado con {n} zonas con ventas reales."
    if confianza == "media":
        return f"Estimación inicial del suelo al precio comercial ({n} zonas con ventas) — se afina con más ventas."
    return "Aún no hay suficientes ventas para estimar el precio comercial desde el suelo — el valor del suelo se muestra solo como piso oficial."


async def get_calibration(db, city: str = "CDMX") -> Dict[str, Any]:
    """Lee el modelo guardado (o lo recalibra si no existe). Nunca inventa: si no estima, lo dice."""
    doc = await db.valuation_calibration.find_one({"city": city}, {"_id": 0})
    if not doc:
        doc = await recalibrate(db, city=city)
    return doc


async def estimate_commercial_pm2(db, colonia_id: str, city: str = "CDMX") -> Optional[Dict[str, Any]]:
    """Estima el $/m² COMERCIAL de una colonia a partir de su valor catastral del suelo, SOLO si el
    modelo es fiable. None si: no hay catastral, o el modelo aún no es confiable (no inventa)."""
    rec = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "vsuelo_pm2_catastral": 1})
    cat = rec.get("vsuelo_pm2_catastral") if rec else None
    if not cat or cat <= 0:
        return None
    cal = await get_calibration(db, city=city)
    if not cal.get("estima"):
        return None
    a, b = cal.get("a"), cal.get("b")
    if a is None or b is None:
        return None
    est = a + b * float(cat)
    # el comercial nunca puede ser menor que el piso oficial del suelo
    est = max(est, float(cat))
    if est <= 0:
        return None
    return {
        "pm2": round(est), "catastral": round(float(cat)),
        "confianza": cal.get("confianza"), "r2": cal.get("r2"), "n": cal.get("n"),
        "base": "valor_oficial_suelo", "es_estimado": True,
        "leyenda": cal.get("leyenda"),
    }
