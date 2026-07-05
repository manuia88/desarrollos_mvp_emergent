"""W5.15 Parte 1 Sub-A — FSD per-property engine.

FSD = Full-spectrum Diagnostic. Calcula valor puntual + intervalo de confianza
80% + feature_breakdown, reutilizando el motor hedonico W5.1 (OLS) y persistiendo
en `avm_predictions` los campos fsd_value/low_estimate/high_estimate/fsd_pct/
confidence_lvl/feature_breakdown (forward-only, sin migrar historico).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.fsd")

# Z-score para intervalo 80% (normal approx)
Z_80 = 1.28

CONFIDENCE_THRESHOLDS = {
    "ALTA":  10.0,   # fsd_pct < 10
    "MEDIA": 20.0,   # fsd_pct < 20
    # else BAJA
}


def _confidence_label(fsd_pct: float) -> str:
    if fsd_pct < CONFIDENCE_THRESHOLDS["ALTA"]:
        return "ALTA"
    if fsd_pct < CONFIDENCE_THRESHOLDS["MEDIA"]:
        return "MEDIA"
    return "BAJA"


def _feature_breakdown(
    property_features: Dict[str, Any],
    coefs: Dict[str, Dict[str, float]],
    feat_names: list,
    log_pred: float,
) -> Dict[str, Dict[str, Any]]:
    """Por cada feature: contribution_pct relativo a la prediccion log + confidence
    per feature (1 - p_value) + missing_data_flag (true si el feature es 0/None
    pero el modelo lo espera).
    """
    breakdown: Dict[str, Dict[str, Any]] = {}
    intercept = coefs.get("intercept", {}).get("coef", 0.0)
    total_abs_contrib = abs(intercept)
    contribs: Dict[str, float] = {}
    for f in feat_names:
        v_raw = property_features.get(f)
        v = float(v_raw) if isinstance(v_raw, (int, float)) else 0.0
        coef = coefs.get(f, {}).get("coef", 0.0)
        contrib = coef * v
        contribs[f] = contrib
        total_abs_contrib += abs(contrib)

    for f in feat_names:
        v_raw = property_features.get(f)
        present = v_raw is not None and (isinstance(v_raw, (int, float)) and v_raw != 0)
        coef_doc = coefs.get(f, {})
        p_val = float(coef_doc.get("p_value") or 1.0)
        contrib = contribs[f]
        pct = (abs(contrib) / total_abs_contrib * 100.0) if total_abs_contrib > 0 else 0.0
        breakdown[f] = {
            "contribution_pct": round(pct, 2),
            "confidence_per_feature": round(max(0.0, min(1.0, 1.0 - p_val)), 3),
            "missing_data_flag": not present,
            "value": v_raw,
            "coef": round(coef_doc.get("coef", 0.0), 4),
        }
    return breakdown


async def compute_fsd(
    db,
    property_features: Dict[str, Any],
    zone_slug: str,
    model_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute FSD para un property dado un zone_slug.

    Devuelve shape:
        {
          available, value, low_estimate, high_estimate, fsd_pct,
          confidence_lvl, feature_breakdown, model_id, sample_size, rmse_log,
          zone_slug
        }

    Si no hay modelo hedonico promoted para la zona → available=False con razon.
    """
    # 1. Resolver modelo: si no se pasa explicito, buscar el promoted mas reciente
    model_doc = None
    if model_id:
        model_doc = await db.hedonic_models.find_one({"id": model_id}, {"_id": 0})
    if not model_doc:
        # buscar el ultimo modelo disponible de la zona
        model_doc = await db.hedonic_models.find_one(
            {"zone_id": zone_slug, "available": True},
            {"_id": 0},
            sort=[("fit_at_dt", -1)],
        )
    if not model_doc:
        # Censo 2026-07-05: hedonic_models tiene 0 modelos vivos, pero dmx_hedonic_atom (el hedónico del
        # átomo, ciudad-wide con one-hot por colonia) tiene 142 fits available con r²≈0.95. Sin este
        # fallback, FSD/avm_predictions/accuracy jamás arrancaban (cuello de botella de todo el loop).
        try:
            import dmx_hedonic_atom
            fit = await dmx_hedonic_atom.fit_and_rank(db, None, persist=False)
            if fit.get("available") and fit.get("coefficients"):
                model_doc = {
                    "coefficients": fit["coefficients"],
                    "feature_names": fit.get("feature_names") or [],
                    "rmse": fit.get("rmse_log") or 0.0,
                    "sample_size": fit.get("sample_size") or 0,
                    "source": "dmx_hedonic_atom_citywide",
                }
                # activar la dummy de ESTA colonia si el modelo la conoce (sin mutar el dict del caller)
                colf = f"col::{zone_slug}"
                if colf in model_doc["feature_names"]:
                    property_features = {**property_features, colf: 1.0}
        except Exception as e:  # noqa: BLE001
            log.warning(f"[fsd] fallback dmx hedonic: {e}")
    if not model_doc:
        return {"available": False, "reason": "no_model_for_zone", "zone_slug": zone_slug}

    coefs = model_doc.get("coefficients") or {}
    feat_names = model_doc.get("feature_names") or []
    rmse_log = float(model_doc.get("rmse") or 0.0)
    sample_size = int(model_doc.get("sample_size") or 0)

    # 2. Prediccion log
    log_pred = coefs.get("intercept", {}).get("coef", 0.0)
    for f in feat_names:
        v = float(property_features.get(f) or 0)
        log_pred += coefs.get(f, {}).get("coef", 0.0) * v

    pm2 = math.exp(log_pred)
    m2 = float(property_features.get("m2") or 0)
    value_total = pm2 * m2 if m2 > 0 else pm2

    # 3. Sigma sobre el precio (delta method aprox: sigma_price ≈ price * sigma_log)
    sigma_log = rmse_log if rmse_log > 0 else 0.10  # fallback 10% si no hay RMSE
    sigma_price = value_total * sigma_log

    low = max(0.0, value_total - Z_80 * sigma_price)
    high = value_total + Z_80 * sigma_price
    fsd_pct = (sigma_price / value_total * 100.0) if value_total > 0 else 100.0

    # Si hay features faltantes criticos (m2 falta o varios features con value=0),
    # inflamos fsd_pct para reflejar la incertidumbre.
    missing_critical = (m2 <= 0)
    missing_features = sum(
        1 for f in feat_names
        if not str(f).startswith("col::") and property_features.get(f) in (None, 0)
    )
    if missing_critical:
        fsd_pct = max(fsd_pct, 30.0)
    elif missing_features >= max(2, len(feat_names) // 2):
        fsd_pct = max(fsd_pct, 22.0)

    confidence_lvl = _confidence_label(fsd_pct)
    breakdown = _feature_breakdown(property_features, coefs, feat_names, log_pred)

    return {
        "available": True,
        "value": round(value_total, 2),
        "predicted_price_per_m2": round(pm2, 2),
        "low_estimate": round(low, 2),
        "high_estimate": round(high, 2),
        "fsd_pct": round(fsd_pct, 2),
        "confidence_lvl": confidence_lvl,
        "feature_breakdown": breakdown,
        "model_id": model_doc.get("id"),
        "sample_size": sample_size,
        "rmse_log": round(rmse_log, 4),
        "r_squared": model_doc.get("r_squared"),
        "zone_slug": zone_slug,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


async def persist_avm_prediction(
    db,
    property_id: str,
    zone_slug: str,
    fsd: Dict[str, Any],
    property_features: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Persiste FSD en avm_predictions (forward-only) y retorna prediction_id."""
    from uuid import uuid4
    if not fsd.get("available"):
        return None
    pid = f"avmp_{uuid4().hex[:14]}"
    now = datetime.now(timezone.utc)
    doc = {
        "id": pid,
        "property_id": property_id,
        "zone_slug": zone_slug,
        "model_id": fsd.get("model_id"),
        # legacy compat fields
        "predicted_value": fsd["value"],
        "predicted_price_per_m2": fsd.get("predicted_price_per_m2"),
        # FSD W5.15
        "fsd_value": fsd["value"],
        "low_estimate": fsd["low_estimate"],
        "high_estimate": fsd["high_estimate"],
        "fsd_pct": fsd["fsd_pct"],
        "confidence_lvl": fsd["confidence_lvl"],
        "feature_breakdown": fsd.get("feature_breakdown") or {},
        "rmse_log": fsd.get("rmse_log"),
        "r_squared": fsd.get("r_squared"),
        "property_features": property_features or {},
        "prediction_date": now.isoformat(),
        "prediction_date_dt": now,
    }
    try:
        await db.avm_predictions.insert_one(dict(doc))
        return pid
    except Exception as exc:
        log.warning(f"[fsd] persist avm_prediction failed: {exc}")
        return None


async def ensure_fsd_indexes(db) -> None:
    try:
        from pymongo import ASCENDING, DESCENDING
        await db.avm_predictions.create_index(
            [("property_id", ASCENDING), ("prediction_date_dt", DESCENDING)],
            name="property_pred_desc",
        )
        await db.avm_predictions.create_index(
            [("zone_slug", ASCENDING), ("prediction_date_dt", DESCENDING)],
            name="zone_pred_desc",
        )
        await db.avm_predictions.create_index("id", unique=True, sparse=True)
        log.info("[fsd] indexes OK")
    except Exception as exc:
        log.warning(f"[fsd] index creation warning: {exc}")
