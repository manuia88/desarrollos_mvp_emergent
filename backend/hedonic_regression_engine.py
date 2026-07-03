"""W3.3 ZZ.3 — Hedonic Regression Engine (DRPI Foundation).

Trains OLS hedonic models per zone × tier on Transaction Network W3.2
verified data. Uses statsmodels for confidence intervals and full diagnostics.

Dep variable : log(closing_price_per_m2)
Indep vars   : m2 · recamaras · baños · year_built · floor · proximity_metro_m ·
               denue_density · construction_cost_index + categorical (view, orientation)

Schema db.hedonic_models:
  { id, zone_id, tier, fit_at, fit_at_dt, period_days, sample_size,
    coefficients:{var:{coef,std_err,p_value,ci_low,ci_high}},
    r_squared, adj_r_squared, f_statistic, rmse,
    formula_version, available:bool, reason? }
  index (zone_id, tier, fit_at_dt desc) · TTL 365d
"""
from __future__ import annotations

import logging
import math
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.hedonic_regression_engine")

FORMULA_VERSION = "1.0.0"
MIN_SAMPLE_SIZE = 30
DEFAULT_PERIOD_DAYS = 180

NUMERIC_FEATURES = [
    "m2", "recamaras", "baños", "year_built", "floor",
    "proximity_metro_m", "denue_density", "construction_cost_index",
]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str = "hm") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


# ─── Feature extraction ────────────────────────────────────────────────────────

async def _enrich_with_zone_context(db, doc: Dict[str, Any]) -> Dict[str, Any]:
    """Attach zone-level features (DENUE density, construction cost index) to a transaction."""
    zone_id = doc.get("zone_id") or ""
    if not zone_id:
        return doc
    try:
        denue = await db.denue_zone_density.find_one(
            {"zone_id": zone_id}, {"_id": 0, "businesses_per_km2": 1},
        )
        doc["denue_density"] = (denue or {}).get("businesses_per_km2") or 0.0
    except Exception:
        doc["denue_density"] = 0.0
    try:
        cost = await db.construction_costs.find_one(
            {"zone_id": zone_id}, {"_id": 0, "cost_per_m2_mxn": 1},
            sort=[("computed_at", -1)],
        )
        doc["construction_cost_index"] = (cost or {}).get("cost_per_m2_mxn") or 0.0
    except Exception:
        doc["construction_cost_index"] = 0.0
    return doc


def _row_features(doc: Dict[str, Any]) -> Optional[Dict[str, float]]:
    """Build feature vector. Returns None if essential fields missing."""
    closing = doc.get("closing_price_mxn") or 0.0
    m2 = doc.get("m2") or 0.0
    if closing <= 0 or m2 <= 0:
        return None
    pm2 = closing / m2
    if pm2 <= 0:
        return None

    out: Dict[str, float] = {
        "log_pm2": math.log(pm2),
        "m2": float(m2),
        "recamaras": float(doc.get("recamaras") or 0),
        "baños": float(doc.get("baños") or 0),
        "year_built": float(doc.get("year_built") or 2010),
        "floor": float(doc.get("floor") or 0),
        "proximity_metro_m": float(doc.get("proximity_metro_m") or 1000),
        "denue_density": float(doc.get("denue_density") or 0),
        "construction_cost_index": float(doc.get("construction_cost_index") or 0),
    }
    return out


# ─── Fit OLS via statsmodels ───────────────────────────────────────────────────

def _fit_ols_pure(rows: List[Dict[str, float]]) -> Dict[str, Any]:
    """Run OLS fit via statsmodels and return diagnostics dict."""
    import numpy as np
    import statsmodels.api as sm

    if not rows or len(rows) < MIN_SAMPLE_SIZE:
        return {"available": False, "reason": "insufficient_data", "sample_size": len(rows)}

    y = np.array([r["log_pm2"] for r in rows], dtype=float)
    feat_names = [f for f in NUMERIC_FEATURES if any(r[f] for r in rows)]
    if not feat_names:
        return {"available": False, "reason": "no_variance", "sample_size": len(rows)}

    X = np.array([[r[f] for f in feat_names] for r in rows], dtype=float)
    X = sm.add_constant(X, has_constant="add")

    try:
        model = sm.OLS(y, X).fit()
    except Exception as e:
        log.warning(f"[hedonic] fit failure: {e}")
        return {"available": False, "reason": "fit_error", "sample_size": len(rows)}

    coefs: Dict[str, Dict[str, float]] = {}
    cols = ["intercept"] + feat_names
    ci = model.conf_int(0.05)
    for i, name in enumerate(cols):
        coefs[name] = {
            "coef": float(model.params[i]),
            "std_err": float(model.bse[i]),
            "p_value": float(model.pvalues[i]),
            "ci_low": float(ci[i][0]),
            "ci_high": float(ci[i][1]),
        }

    rmse = float(np.sqrt(np.mean(model.resid ** 2)))
    return {
        "available": True,
        "sample_size": int(len(rows)),
        "feature_names": feat_names,
        "coefficients": coefs,
        "r_squared": float(model.rsquared),
        "adj_r_squared": float(model.rsquared_adj),
        "f_statistic": float(model.fvalue) if not (model.fvalue is None or math.isnan(model.fvalue)) else 0.0,
        "rmse": rmse,
    }


async def fit_hedonic_model(
    db, zone_id: str, tier: str = "colonia", period_days: int = DEFAULT_PERIOD_DAYS,
) -> Dict[str, Any]:
    """Train hedonic model for zone × tier on last N days of transactions."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    q = {"zone_id": zone_id, "closed_at": {"$gte": cutoff}}
    if tier:
        q["tier"] = tier

    # P2.5 · sort por closed_at desc → entrena con las 2000 transacciones MÁS RECIENTES
    # (antes sin orden = las 2000 más viejas por inserción → modelo hedónico sesgado/añejo).
    docs = await db.transactions.find(q, {"_id": 0}).sort("closed_at", -1).to_list(2000)
    if len(docs) >= 2000:
        log.warning(f"[hedonic] zone={zone_id} tier={tier} truncado a 2000 tx (sample reciente)")

    rows: List[Dict[str, float]] = []
    for d in docs:
        await _enrich_with_zone_context(db, d)
        feat = _row_features(d)
        if feat is not None:
            rows.append(feat)

    fit = _fit_ols_pure(rows)
    now = datetime.now(timezone.utc)
    base = {
        "id": _new_id("hm"),
        "zone_id": zone_id,
        "tier": tier or "colonia",
        "fit_at": now.isoformat(),
        "fit_at_dt": now,
        "period_days": period_days,
        "formula_version": FORMULA_VERSION,
    }
    doc = {**base, **fit}

    try:
        await db.hedonic_models.insert_one(dict(doc))
    except Exception as e:
        log.warning(f"[hedonic] insert failed {zone_id}: {e}")

    out = dict(doc)
    out.pop("_id", None)
    out.pop("fit_at_dt", None)
    return out


# ─── Predict ──────────────────────────────────────────────────────────────────

async def predict_price(
    db, hedonic_model_id: str, property_features: Dict[str, Any],
) -> Dict[str, Any]:
    """Predict log price/m² given fitted model + feature vector."""
    model_doc = await db.hedonic_models.find_one(
        {"id": hedonic_model_id}, {"_id": 0},
    )
    if not model_doc or not model_doc.get("available"):
        return {"available": False, "reason": "model_not_found_or_unfit"}

    coefs = model_doc.get("coefficients") or {}
    feat_names = model_doc.get("feature_names") or []

    log_pred = coefs.get("intercept", {}).get("coef", 0.0)
    se_sum = coefs.get("intercept", {}).get("std_err", 0.0) ** 2
    for f in feat_names:
        v = float(property_features.get(f) or 0)
        c = coefs.get(f) or {}
        log_pred += c.get("coef", 0.0) * v
        se_sum += (c.get("std_err", 0.0) * v) ** 2

    # Intervalo de PREDICCIÓN (no solo de la media): además del error de estimación de los coeficientes
    # (se_sum), suma la varianza residual del modelo (rmse², ya persistida en el fit). Antes se omitía →
    # el rango salía irrealmente angosto (±2-4%) en vez del error real del hedónico (~±13-16%).
    rmse = float(model_doc.get("rmse") or 0.0)
    pm2 = math.exp(log_pred)
    se = math.sqrt(se_sum + rmse ** 2)
    pm2_low = math.exp(log_pred - 1.96 * se)
    pm2_high = math.exp(log_pred + 1.96 * se)

    m2 = float(property_features.get("m2") or 0)
    return {
        "available": True,
        "predicted_price_per_m2": round(pm2, 0),
        "ci95_low_per_m2": round(pm2_low, 0),
        "ci95_high_per_m2": round(pm2_high, 0),
        "predicted_total": round(pm2 * m2, 0) if m2 > 0 else None,
        "model_id": hedonic_model_id,
        "r_squared": model_doc.get("r_squared"),
    }


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.hedonic_models.create_index(
            [("zone_id", 1), ("tier", 1), ("fit_at_dt", -1)],
            name="hedonic_zone_tier_ts",
        )
        await db.hedonic_models.create_index(
            "fit_at_dt", expireAfterSeconds=365 * 86400,
            name="hedonic_ttl_1y",
        )
    except Exception as e:
        log.warning(f"[hedonic] ensure_indexes failed: {e}")
