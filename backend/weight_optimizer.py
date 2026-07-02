"""W5.15 Parte 1 Sub-D — Self-tuning weights per-zone via Ridge regression.

optimize_zone_weights(zone_slug, min_closes=50): si la zona acumula >=50 cierres
en prediction_accuracy_log + properties con features completos, entrena un Ridge
sobre log(actual_value) ~ NUMERIC_FEATURES y persiste coeficientes en
`zone_weights`. Si no alcanza el minimo, retorna None y se mantiene fallback
global (W5.1 hedonic).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

log = logging.getLogger("dmx.weight_optimizer")

MIN_CLOSES = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def optimize_zone_weights(
    db, zone_slug: str, min_closes: int = MIN_CLOSES,
) -> Optional[Dict[str, Any]]:
    """Entrena Ridge regression sobre log(actual_value) ~ features y persiste.

    Devuelve dict con weights + r2_score o None si insuficiente.
    """
    cutoff = _now() - timedelta(days=365)
    cursor = db.prediction_accuracy_log.find(
        {"zone_slug": zone_slug, "close_date_dt": {"$gte": cutoff}},
        {"_id": 0},
    )
    rows = [r async for r in cursor]
    if len(rows) < min_closes:
        return None

    # Recuperar features del property para cada row
    feature_pool: List[Dict[str, Any]] = []
    targets: List[float] = []
    for r in rows:
        pred = await db.avm_predictions.find_one(
            {"property_id": r["property_id"]},
            {"_id": 0, "property_features": 1},
            sort=[("prediction_date_dt", -1)],
        )
        feats = (pred or {}).get("property_features") or {}
        actual = float(r.get("actual_value") or 0)
        if actual <= 0 or not feats:
            continue
        feature_pool.append(feats)
        targets.append(math.log(actual))

    if len(feature_pool) < min_closes:
        return None

    # Determinar set comun de features numericas
    from hedonic_regression_engine import NUMERIC_FEATURES
    feat_names = list(NUMERIC_FEATURES)

    try:
        import numpy as np
        from sklearn.linear_model import Ridge
        from sklearn.metrics import r2_score
    except Exception as exc:
        log.warning(f"[weight_opt] sklearn not available: {exc}")
        return None

    X = np.array(
        [[float(feat.get(f) or 0.0) for f in feat_names] for feat in feature_pool],
        dtype=float,
    )
    y = np.array(targets, dtype=float)
    if X.shape[0] < min_closes:
        return None

    try:
        model = Ridge(alpha=1.0, fit_intercept=True)
        model.fit(X, y)
        y_pred = model.predict(X)
        r2 = float(r2_score(y, y_pred))
    except Exception as exc:
        log.warning(f"[weight_opt] Ridge fit failed for {zone_slug}: {exc}")
        return None

    weights = {f: float(c) for f, c in zip(feat_names, model.coef_)}
    intercept = float(model.intercept_)
    now = _now()
    doc = {
        "id": f"zw_{uuid4().hex[:14]}",
        "zone_slug": zone_slug,
        "weights": weights,
        "intercept": intercept,
        "feature_names": feat_names,
        "r2_score": round(r2, 4),
        "sample_size": int(X.shape[0]),
        "optimized_at": _iso(now),
        "optimized_at_dt": now,
        "version": int(now.timestamp()),
        "alpha": 1.0,
    }
    try:
        # Upsert por zone (mantenemos versionado por id pero usamos zone_slug como key activo)
        await db.zone_weights.update_one(
            {"zone_slug": zone_slug},
            {"$set": doc},
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[weight_opt] persist failed for {zone_slug}: {exc}")
        return None

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="zone_weights_optimized",
            entity_type="zone_weights",
            entity_id=zone_slug,
            before=None,
            after={"r2_score": doc["r2_score"], "sample_size": doc["sample_size"]},
        )
    except Exception as exc:
        log.warning(f"[weight_opt] audit failed: {exc}")

    log.info(
        f"[weight_opt] {zone_slug} optimized · r2={r2:.4f} sample={X.shape[0]}"
    )
    return doc


async def get_zone_weights(db, zone_slug: str) -> Optional[Dict[str, Any]]:
    try:
        return await db.zone_weights.find_one({"zone_slug": zone_slug}, {"_id": 0})
    except Exception:
        return None


async def predict_with_zone_weights(
    db, zone_slug: str, property_features: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Si existen zone_weights, retorna {value, r2_score, source='zone_weights'}.

    Caller decide si combinar con global hedonic.
    """
    zw = await get_zone_weights(db, zone_slug)
    if not zw or not zw.get("weights"):
        return None
    feat_names = zw.get("feature_names") or []
    weights = zw["weights"]
    intercept = float(zw.get("intercept") or 0.0)
    log_pred = intercept
    for f in feat_names:
        v = float(property_features.get(f) or 0.0)
        log_pred += float(weights.get(f, 0.0)) * v
    pm2 = math.exp(log_pred)
    m2 = float(property_features.get("m2") or 0.0)
    value_total = pm2 * m2 if m2 > 0 else pm2
    return {
        "available": True,
        "value": round(value_total, 2),
        "predicted_price_per_m2": round(pm2, 2),
        "r2_score": zw.get("r2_score"),
        "sample_size": zw.get("sample_size"),
        "source": "zone_weights",
        "zone_slug": zone_slug,
        "optimized_at": zw.get("optimized_at"),
    }


async def ensure_zone_weights_indexes(db) -> None:
    try:
        from pymongo import DESCENDING
        await db.zone_weights.create_index(
            "zone_slug", unique=True, name="zw_zone_unique",
        )
        await db.zone_weights.create_index(
            [("optimized_at_dt", DESCENDING)], name="zw_optimized_desc",
        )
        log.info("[weight_opt] indexes OK")
    except Exception as exc:
        log.warning(f"[weight_opt] index creation warning: {exc}")


async def list_top_zones_for_optimization(db, limit: int = 50) -> List[str]:
    """Top zonas por count de cierres en prediction_accuracy_log."""
    try:
        pipeline = [
            {"$match": {"zone_slug": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$zone_slug", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": limit},
        ]
        rows = await db.prediction_accuracy_log.aggregate(pipeline).to_list(limit)
        return [r["_id"] for r in rows if r.get("_id")]
    except Exception as exc:
        log.warning(f"[weight_opt] list zones failed: {exc}")
        return []
