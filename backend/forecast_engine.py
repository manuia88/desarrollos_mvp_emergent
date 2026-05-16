"""W5.3 Parte 1 Sub-A — Forecast engine multi-horizonte (ARIMA).

Lee serie histórica DRPI (drpi_snapshots · mensual) por zona, ajusta ARIMA
auto-orden minimizando AIC, proyecta 6m/12m/24m con CI95 y persiste en
`zone_forecasts`.

Combina con `hedonic_regression_engine.predict_price` para forecast a nivel
propiedad (multiplicador de crecimiento × baseline AVM).

DECISIÓN CONSERVADORA:
- DRPI es MENSUAL en este repo (campo `period: YYYY-MM`), no daily. El umbral
  de 180 días se reinterpreta como 6 períodos mensuales mínimos para fit.
- Loop ARIMA: p∈0..3, d∈0..2, q∈0..3 → 48 combos. Si todas fallan → unavailable.
- Sample <180 días = <6 períodos mensuales → skip + return `unavailable`.
"""
from __future__ import annotations

import logging
import math
import secrets
import warnings
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.forecast_engine")

MIN_PERIODS = 6              # 6 meses ≈ 180 días (conservador)
TRAINING_WINDOW_MONTHS = 24  # 730 días ≈ 24 meses
HORIZONS_MONTHS = [6, 12, 24]
DEFAULT_HORIZON = 12


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "fc") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


async def _load_history(db, zone_slug: str) -> List[Dict[str, Any]]:
    """Cargar últimos `TRAINING_WINDOW_MONTHS` snapshots DRPI por zona (asc)."""
    cursor = db.drpi_snapshots.find(
        {"zone_id": zone_slug, "available": True},
        {"_id": 0, "period": 1, "index_value": 1},
    ).sort("period", -1).limit(TRAINING_WINDOW_MONTHS)
    rows = [r async for r in cursor]
    rows.reverse()
    return rows


def _fit_arima_auto(values: List[float]) -> Tuple[Optional[Any], Optional[Tuple[int, int, int]], Optional[float]]:
    """Auto-order ARIMA buscando mínimo AIC sobre p∈0..3, d∈0..2, q∈0..3.

    Devuelve (fitted_model, order, aic). None si todas las combinaciones fallan.

    DECISIÓN CONSERVADORA: descarta órdenes que generen forecasts con |delta_pct|
    > 80% a 12 meses (random walks de 2da diferenciación tipo (0,2,0) suelen
    explotar). Fallback a (1,1,1) si todos los mejores AIC son inestables.
    """
    try:
        import numpy as np
        from statsmodels.tsa.arima.model import ARIMA
    except Exception as e:
        log.warning(f"[forecast] statsmodels not available: {e}")
        return None, None, None

    series = np.array(values, dtype=float)
    baseline = float(values[-1]) if values else 0.0
    candidates: List[Tuple[float, Tuple[int, int, int], Any]] = []

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for p in range(0, 4):
            for d in range(0, 3):
                for q in range(0, 4):
                    if p == 0 and d == 0 and q == 0:
                        continue
                    try:
                        m = ARIMA(series, order=(p, d, q)).fit()
                        aic = float(m.aic)
                        if not math.isfinite(aic):
                            continue
                        # Sanity: pronóstico 12m razonable
                        try:
                            f12 = float(m.forecast(steps=12)[-1])
                            if baseline > 0:
                                delta_pct = abs((f12 - baseline) / baseline * 100)
                                if delta_pct > 80.0:
                                    continue
                        except Exception:
                            continue
                        candidates.append((aic, (p, d, q), m))
                    except Exception:
                        continue

    if not candidates:
        return None, None, None

    candidates.sort(key=lambda x: x[0])
    best_aic, best_order, best_model = candidates[0]
    return best_model, best_order, best_aic


def _compute_mape_test(values: List[float], holdout: int = 3) -> Optional[float]:
    """MAPE simple sobre los últimos `holdout` puntos usando fit en train."""
    try:
        import numpy as np
        from statsmodels.tsa.arima.model import ARIMA
        if len(values) < holdout + MIN_PERIODS:
            return None
        train = np.array(values[:-holdout], dtype=float)
        test = np.array(values[-holdout:], dtype=float)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                m = ARIMA(train, order=(1, 1, 1)).fit()
                pred = m.forecast(steps=holdout)
            except Exception:
                return None
        errs = [abs(p - t) / t * 100.0 for p, t in zip(pred, test) if t]
        if not errs:
            return None
        return round(float(sum(errs) / len(errs)), 2)
    except Exception:
        return None


async def fit_zone_forecast(db, zone_slug: str) -> Dict[str, Any]:
    """Ajustar ARIMA y producir forecast multi-horizonte para una zona.

    Devuelve dict con keys: available, zone_slug, horizons, arima_order,
    training_window_days, mape_test, fitted_at.
    """
    history = await _load_history(db, zone_slug)
    n = len(history)
    if n < MIN_PERIODS:
        return {
            "available": False,
            "zone_slug": zone_slug,
            "reason": "insufficient_history",
            "n_periods": n,
        }

    values = [float(r.get("index_value") or 0) for r in history]
    if any(v <= 0 for v in values):
        return {
            "available": False,
            "zone_slug": zone_slug,
            "reason": "invalid_values",
            "n_periods": n,
        }

    fitted, order, aic = _fit_arima_auto(values)
    if fitted is None:
        return {
            "available": False,
            "zone_slug": zone_slug,
            "reason": "arima_fit_failed",
            "n_periods": n,
        }

    horizons: Dict[str, Dict[str, float]] = {}
    try:
        max_h = max(HORIZONS_MONTHS)
        forecast_result = fitted.get_forecast(steps=max_h)
        pred_mean = forecast_result.predicted_mean
        conf = forecast_result.conf_int(alpha=0.05)
        baseline = values[-1]
        for h in HORIZONS_MONTHS:
            idx = h - 1  # 0-indexed
            val = float(pred_mean[idx])
            try:
                low = float(conf[idx][0])
                high = float(conf[idx][1])
            except Exception:
                # conf puede ser DataFrame
                low = float(conf.iloc[idx, 0])
                high = float(conf.iloc[idx, 1])
            delta_pct = round((val - baseline) / baseline * 100, 2) if baseline else 0.0
            horizons[f"{h}m"] = {
                "value": round(val, 2),
                "low95": round(low, 2),
                "high95": round(high, 2),
                "delta_pct": delta_pct,
            }
    except Exception as e:
        log.warning(f"[forecast] forecast generation failed {zone_slug}: {e}")
        return {
            "available": False,
            "zone_slug": zone_slug,
            "reason": "forecast_generation_failed",
            "n_periods": n,
        }

    mape = _compute_mape_test(values)
    now = datetime.now(timezone.utc)

    doc = {
        "id": _new_id("fc"),
        "zone_slug": zone_slug,
        "model_type": "arima",
        "arima_order": list(order) if order else None,
        "aic": round(float(aic), 2) if aic is not None else None,
        "baseline_index": round(values[-1], 2),
        "horizons": horizons,
        "n_periods": n,
        "training_window_days": n * 30,
        "mape_test": mape,
        "available": True,
        "fitted_at": now.isoformat(),
        "fitted_at_dt": now,
    }

    try:
        await db.zone_forecasts.update_one(
            {"zone_slug": zone_slug},
            {"$set": doc},
            upsert=True,
        )
    except Exception as e:
        log.warning(f"[forecast] upsert failed {zone_slug}: {e}")

    out = dict(doc)
    out.pop("_id", None)
    out.pop("fitted_at_dt", None)
    return out


async def get_zone_forecast(db, zone_slug: str) -> Optional[Dict[str, Any]]:
    """Lectura del último forecast persistido."""
    doc = await db.zone_forecasts.find_one(
        {"zone_slug": zone_slug, "available": True},
        {"_id": 0, "fitted_at_dt": 0},
    )
    return doc


async def predict_property_forecast(
    db,
    colonia: str,
    m2: float,
    recamaras: int,
    banos: int,
    antiguedad_anos: int,
    horizon_months=DEFAULT_HORIZON,
) -> Dict[str, Any]:
    """Forecast a nivel propiedad: AVM (T=0) × factor de crecimiento del zone_forecast.

    `horizon_months` puede ser int, lista o string CSV. Filtra el output a esos horizontes.
    Si no hay forecast para la zona → devuelve solo `avm_now` con horizons vacíos.
    """
    from avm_public_engine import avm_quick_async

    avm = await avm_quick_async(db, colonia, m2, recamaras, banos, antiguedad_anos)
    if "error" in avm:
        return {"available": False, "reason": "colonia_not_found"}

    avm_now = float(avm.get("precio_estimado") or 0)
    avm_low = float(avm.get("range_low") or 0)
    avm_high = float(avm.get("range_high") or 0)

    zf = await get_zone_forecast(db, colonia)
    horizons_out: List[Dict[str, Any]] = []

    requested = _parse_horizons_list(horizon_months)

    if zf and zf.get("horizons"):
        baseline = float(zf.get("baseline_index") or 0)
        for h in HORIZONS_MONTHS:
            if h not in requested:
                continue
            band = zf["horizons"].get(f"{h}m")
            if not band or baseline <= 0:
                continue
            factor = band["value"] / baseline
            factor_low = band["low95"] / baseline
            factor_high = band["high95"] / baseline
            horizons_out.append({
                "months": h,
                "value": round(avm_now * factor, 0),
                "low95": round(avm_low * factor_low, 0),
                "high95": round(avm_high * factor_high, 0),
                "delta_pct": band.get("delta_pct"),
            })

    return {
        "available": True,
        "avm_now": round(avm_now, 0),
        "avm_low": round(avm_low, 0),
        "avm_high": round(avm_high, 0),
        "pricing_model": avm.get("pricing_model"),
        "horizons": horizons_out,
        "zone_forecast_fitted_at": (zf or {}).get("fitted_at"),
    }


def _parse_horizons_list(horizon_param) -> List[int]:
    """Util: convertir '6,12' / 12 / [6,12] a lista de ints válidos."""
    if isinstance(horizon_param, list):
        items = horizon_param
    elif isinstance(horizon_param, (int, float)):
        items = [int(horizon_param)]
    else:
        items = [p.strip() for p in str(horizon_param).split(",") if p.strip()]
    out: List[int] = []
    for x in items:
        try:
            n = int(x)
            if n in HORIZONS_MONTHS:
                out.append(n)
        except (TypeError, ValueError):
            continue
    return out or list(HORIZONS_MONTHS)


# ─── Narrative auto-generation ────────────────────────────────────────────────

def build_narrative(horizons: Dict[str, Dict[str, float]]) -> str:
    """Generar narrative es-MX usando el horizonte 12m si existe."""
    h12 = horizons.get("12m") if isinstance(horizons, dict) else None
    if not h12:
        return "Sin proyección disponible para 12 meses."
    delta = float(h12.get("delta_pct") or 0)
    if delta >= 5:
        return f"Tendencia alcista +{delta:.1f}% en 12 meses."
    if delta <= -5:
        return f"Tendencia bajista {delta:.1f}% en 12 meses."
    return "Tendencia estable a 12 meses."


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.zone_forecasts.create_index("zone_slug", name="forecast_zone", unique=True)
        await db.zone_forecasts.create_index(
            "fitted_at_dt", expireAfterSeconds=730 * 86400, name="forecast_ttl_2y",
        )
        await db.forecast_retrain_runs.create_index("finished_at", name="forecast_run_ts")
    except Exception as e:
        log.warning(f"[forecast] ensure_indexes failed: {e}")
