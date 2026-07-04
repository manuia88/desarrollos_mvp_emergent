"""
DMX · Fase 2.1 — HEDÓNICO sobre el ÁTOMO + AMENITY VALUE RANKER
═══════════════════════════════════════════════════════════════════════════════
Responde la pregunta estrella del founder: "¿cuánto suma al precio/m² un roof / un
2º cajón / una bodega?". Corre una regresión hedónica (OLS, statsmodels) sobre el
átomo (dmx_units) con dep = log(precio/m²) y features = atributos de la unidad,
CONTROLANDO por colonia (one-hot). El coeficiente de cada atributo binario se traduce
a % de impacto = (e^coef − 1)·100.

Reusa el patrón de hedonic_regression_engine pero alimentado por el ÁTOMO (no por
transaction_network, que está vacío en demo) → da respuesta HOY con precio de lista,
y se recalibra solo con precios de cierre cuando lleguen (self-improving · Fase 2.3).
Persiste el modelo en dmx_hedonic_models para reuso (AVM/Cerebro) e histórico.
"""
from __future__ import annotations

import math
import time
import json as _json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dmx_unit_schema import COLLECTIONS

UNITS = COLLECTIONS["units"]
MODELS = "dmx_hedonic_models"
MIN_SAMPLE = 30

# Caché TTL del ajuste OLS (caro) — se invalida al cerrar una venta (self-improving).
_RANK_CACHE: Dict[str, tuple] = {}
_RANK_TTL = 300.0


def _ckey(scope: Optional[Dict[str, Any]]) -> str:
    return _json.dumps(scope or {}, sort_keys=True)


def invalidate_cache() -> None:
    _RANK_CACHE.clear()

# atributos cuyo impacto reportamos en el ranker (binarios → % sobre precio/m²)
AMENITY_ATTRS = ["has_roof", "has_terraza", "has_balcon", "has_bodega", "parking_2plus"]
CONT_ATTRS = ["m2", "recamaras", "banos", "n_parking"]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atom_row(a: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Construye el vector de features de una unidad del átomo. None si falta precio/m²."""
    com = a.get("commercial") or {}
    areas = a.get("areas") or {}
    interior = a.get("interior") or {}
    geo = a.get("geo") or {}
    precio = com.get("precio_cierre_mxn") or com.get("precio_lista_mxn")
    m2 = areas.get("m2_privativo") or areas.get("m2_construido")
    if not precio or not m2 or m2 <= 0 or precio <= 0:
        return None
    pm2 = precio / m2
    if pm2 <= 0:
        return None
    n_park = len(a.get("parking") or [])
    return {
        "log_pm2": math.log(pm2),
        "m2": float(m2),
        "recamaras": float(interior.get("recamaras") or 0),
        "banos": float(interior.get("banos_completos") or 0),
        "n_parking": float(n_park),
        "parking_2plus": 1.0 if n_park >= 2 else 0.0,
        "has_roof": 1.0 if (areas.get("m2_roof_garden_privado") or 0) > 0 else 0.0,
        "has_terraza": 1.0 if (areas.get("m2_terraza") or 0) > 0 else 0.0,
        "has_balcon": 1.0 if (areas.get("m2_balcon") or 0) > 0 else 0.0,
        "has_bodega": 1.0 if (a.get("storage") or []) else 0.0,
        "colonia": geo.get("colonia_id") or "sin_zona",
    }


async def _load_rows(db, scope: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    q = scope or {}
    rows: List[Dict[str, Any]] = []
    async for a in db[UNITS].find(q, {"_id": 0}):
        r = _atom_row(a)
        if r:
            rows.append(r)
    return rows


def _fit(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """OLS log(precio/m²) ~ atributos + colonia one-hot. Devuelve coefs + % impacto."""
    if len(rows) < MIN_SAMPLE:
        return {"available": False, "reason": "insufficient_data", "sample_size": len(rows)}
    import numpy as np
    import statsmodels.api as sm

    # one-hot de colonia (drop baseline = la más frecuente)
    colonias = sorted({r["colonia"] for r in rows})
    from collections import Counter
    base = Counter(r["colonia"] for r in rows).most_common(1)[0][0]
    col_dummies = [c for c in colonias if c != base]

    cont = [f for f in CONT_ATTRS if any(r[f] for r in rows)]
    amen = [f for f in AMENITY_ATTRS if any(r[f] for r in rows) and not all(r[f] for r in rows)]
    feat_names = cont + amen + [f"col::{c}" for c in col_dummies]

    y = np.array([r["log_pm2"] for r in rows], dtype=float)
    X = np.array([
        [r[f] for f in cont] + [r[f] for f in amen] + [1.0 if r["colonia"] == c else 0.0 for c in col_dummies]
        for r in rows
    ], dtype=float)
    X = sm.add_constant(X, has_constant="add")
    try:
        model = sm.OLS(y, X).fit()
    except Exception as e:
        return {"available": False, "reason": f"fit_error: {e}", "sample_size": len(rows)}

    names = ["intercept"] + feat_names
    coefs: Dict[str, Dict[str, float]] = {}
    for i, name in enumerate(names):
        coefs[name] = {"coef": float(model.params[i]), "p_value": float(model.pvalues[i])}

    return {
        "available": True, "sample_size": len(rows),
        "r_squared": round(float(model.rsquared), 4),
        "coefficients": coefs, "feature_names": feat_names,
        "baseline_colonia": base,
    }


def _to_ranker(fit: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Traduce coeficientes de atributos binarios a % de impacto sobre precio/m²."""
    if not fit.get("available"):
        return []
    LABEL = {
        "has_roof": "Roof garden privado", "has_terraza": "Terraza", "has_balcon": "Balcón",
        "has_bodega": "Bodega", "parking_2plus": "2+ estacionamientos",
    }
    out = []
    for attr in AMENITY_ATTRS:
        c = (fit["coefficients"] or {}).get(attr)
        if not c:
            continue
        pct = (math.exp(c["coef"]) - 1) * 100
        out.append({
            "atributo": LABEL.get(attr, attr),
            "impacto_pct_precio_m2": round(pct, 1),
            "p_value": round(c["p_value"], 4),
            "significativo": c["p_value"] < 0.05,
        })
    out.sort(key=lambda x: abs(x["impacto_pct_precio_m2"]), reverse=True)
    return out


async def fit_and_rank(db, scope: Optional[Dict[str, Any]] = None,
                       persist: bool = True, fresh: bool = False) -> Dict[str, Any]:
    """Ajusta el hedónico sobre el átomo y devuelve el amenity value ranker.
    Cacheado (TTL) salvo fresh=True (self-improving tras un cierre real)."""
    key = _ckey(scope)
    if not fresh:
        e = _RANK_CACHE.get(key)
        if e and (time.time() - e[0]) < _RANK_TTL:
            return {**e[1], "cache": "hit"}
    rows = await _load_rows(db, scope)
    fit = _fit(rows)
    ranker = _to_ranker(fit)
    result = {
        "available": fit.get("available", False),
        "reason": fit.get("reason"),
        "sample_size": fit.get("sample_size", len(rows)),
        "r_squared": fit.get("r_squared"),
        "amenity_ranker": ranker,
        # coeficientes crudos (binarios + continuos) para consumo hipergranular (átomo del cubo).
        # Aditivo: los callers existentes leen amenity_ranker; esto no rompe a nadie.
        "coefficients": fit.get("coefficients"),
        "feature_names": fit.get("feature_names"),
        "baseline_colonia": fit.get("baseline_colonia"),
        "computed_at": _iso(),
        "cache": "miss",
    }
    if fit.get("available"):
        _RANK_CACHE[key] = (time.time(), {k: v for k, v in result.items() if k != "cache"})
        if persist:
            try:
                await db[MODELS].insert_one({**result, "coefficients": fit.get("coefficients"),
                                             "scope": scope or {}})
            except Exception:
                pass
    return result
