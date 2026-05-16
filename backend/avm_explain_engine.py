"""W5.1 Sub-Chunk D — Explainability engine para AVM hedónico.

Calcula la contribución (signed) de cada feature a la predicción `log(pm2)`
y la convierte en porcentajes interpretables. Devuelve breakdown stacked.

DECISIÓN CONSERVADORA:
- Para el modelo hedónico: contribución = coef × feature_value (log-space).
- Se separa intercept como "Base colonia" para que el desglose tenga sentido.
- Para fallback heurístico: se reconstruye la atribución desde el baseline
  `price_m2_num` y los multiplicadores (recamaras/banos/antiguedad).
- Si no hay modelo o falla el cálculo, devolvemos shape vacío con flag
  `available=false`.

Las features se mapean a labels human-readable en `es-MX`.
"""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.avm_explain_engine")

FEATURE_LABELS_ES = {
    "intercept": "Base colonia",
    "m2": "Metros cuadrados",
    "recamaras": "Recámaras",
    "baños": "Baños",
    "banos": "Baños",
    "year_built": "Año construcción",
    "antiguedad_anos": "Antigüedad",
    "floor": "Piso",
    "proximity_metro_m": "Cercanía a Metro",
    "denue_density": "Densidad comercial (DENUE)",
    "construction_cost_index": "Costo de construcción",
    "colonia_score": "Score colonia",
}


def _label(feature: str) -> str:
    return FEATURE_LABELS_ES.get(feature, feature.replace("_", " ").title())


async def explain_hedonic(
    db,
    model_id: str,
    property_features: Dict[str, Any],
) -> Dict[str, Any]:
    """Devolver contribución por feature para un modelo hedónico fitted.

    Output:
      {
        available: bool,
        model_id, predicted_pm2, contributions: [
            {feature, label, raw_value, log_contribution, pct}
        ],
        pricing_model: 'hedonic_regression'
      }
    """
    model_doc = await db.hedonic_models.find_one(
        {"id": model_id}, {"_id": 0},
    )
    if not model_doc or not model_doc.get("available"):
        return {"available": False, "reason": "model_not_found"}

    coefs = model_doc.get("coefficients") or {}
    feat_names = model_doc.get("feature_names") or []

    intercept = float((coefs.get("intercept") or {}).get("coef") or 0.0)
    log_pred = intercept

    raw_contribs: List[Dict[str, Any]] = []
    raw_contribs.append({
        "feature": "intercept",
        "label": _label("intercept"),
        "raw_value": None,
        "log_contribution": intercept,
    })

    for f in feat_names:
        v = float(property_features.get(f) or 0)
        c = float((coefs.get(f) or {}).get("coef") or 0.0)
        contrib = c * v
        log_pred += contrib
        raw_contribs.append({
            "feature": f,
            "label": _label(f),
            "raw_value": v,
            "log_contribution": contrib,
        })

    # Convertir a porcentajes en magnitud (sumando |contrib|)
    total_abs = sum(abs(c["log_contribution"]) for c in raw_contribs) or 1.0
    for c in raw_contribs:
        c["pct"] = round(abs(c["log_contribution"]) / total_abs * 100.0, 2)
        c["sign"] = "positive" if c["log_contribution"] >= 0 else "negative"
        c["log_contribution"] = round(c["log_contribution"], 4)

    # Ordenar por pct desc para visualización stacked
    raw_contribs.sort(key=lambda x: x["pct"], reverse=True)

    return {
        "available": True,
        "model_id": model_id,
        "predicted_log_pm2": round(log_pred, 4),
        "predicted_pm2": round(math.exp(log_pred), 0),
        "contributions": raw_contribs,
        "pricing_model": "hedonic_regression",
    }


def explain_heuristic(
    base_pm2: float,
    m2: float,
    recamaras: int,
    banos: int,
    antiguedad_anos: int,
) -> Dict[str, Any]:
    """Atribución del modelo heurístico (fallback).

    Multiplicadores duros del engine:
      rec_factor = 1.0 + (recamaras - 2) * 0.04
      ban_factor = 1.0 + (banos - 2) * 0.025
      age_factor = max(0.55, 1.0 - antiguedad_anos * 0.012)
      precio = base_pm2 × rec × ban × age × m2

    Convertimos a contribuciones en monto (MXN).
    """
    rec_factor = 1.0 + (recamaras - 2) * 0.04
    ban_factor = 1.0 + (banos - 2) * 0.025
    age_factor = max(0.55, 1.0 - (antiguedad_anos * 0.012))
    adj_pm2 = base_pm2 * rec_factor * ban_factor * age_factor
    total = adj_pm2 * m2

    # Contribuciones absolutas: tomamos delta vs base.
    base_total = base_pm2 * m2
    delta_rec = base_total * (rec_factor - 1.0) * ban_factor * age_factor
    delta_ban = base_total * rec_factor * (ban_factor - 1.0) * age_factor
    delta_age = base_total * rec_factor * ban_factor * (age_factor - 1.0)

    contribs = [
        {"feature": "intercept", "label": _label("intercept"), "raw_value": base_pm2, "amount_mxn": round(base_total)},
        {"feature": "recamaras", "label": _label("recamaras"), "raw_value": recamaras, "amount_mxn": round(delta_rec)},
        {"feature": "banos", "label": _label("banos"), "raw_value": banos, "amount_mxn": round(delta_ban)},
        {"feature": "antiguedad_anos", "label": _label("antiguedad_anos"), "raw_value": antiguedad_anos, "amount_mxn": round(delta_age)},
    ]
    total_abs = sum(abs(c["amount_mxn"]) for c in contribs) or 1.0
    for c in contribs:
        c["pct"] = round(abs(c["amount_mxn"]) / total_abs * 100.0, 2)
        c["sign"] = "positive" if c["amount_mxn"] >= 0 else "negative"

    contribs.sort(key=lambda x: x["pct"], reverse=True)

    return {
        "available": True,
        "model_id": None,
        "predicted_pm2": round(adj_pm2, 0),
        "predicted_total": round(total),
        "contributions": contribs,
        "pricing_model": "heuristic",
    }


async def explain_for_avm_response(
    db,
    avm_response: Dict[str, Any],
    inputs: Dict[str, Any],
    base_pm2: Optional[float] = None,
) -> Dict[str, Any]:
    """Wrapper: decide entre hedónico o heurístico según `pricing_model`.

    `inputs` debe contener al menos {m2, recamaras, banos, antiguedad_anos}.
    `base_pm2` es opcional; si falta se usa precio_per_m2 del response.
    """
    pricing = avm_response.get("pricing_model")
    if pricing == "hedonic_regression" and avm_response.get("model_id"):
        property_features = {
            "m2": float(inputs.get("m2") or 0),
            "recamaras": float(inputs.get("recamaras") or 0),
            "banos": float(inputs.get("banos") or 0),
            "baños": float(inputs.get("banos") or 0),
            "antiguedad_anos": float(inputs.get("antiguedad_anos") or 0),
            "year_built": float(2026 - int(inputs.get("antiguedad_anos") or 0)),
        }
        try:
            return await explain_hedonic(db, avm_response["model_id"], property_features)
        except Exception as exc:
            log.warning(f"[explain] hedonic fallback: {exc}")

    # Fallback heurístico
    pm2 = float(base_pm2 or avm_response.get("precio_per_m2") or 0)
    return explain_heuristic(
        pm2,
        float(inputs.get("m2") or 0),
        int(inputs.get("recamaras") or 0),
        int(inputs.get("banos") or 0),
        int(inputs.get("antiguedad_anos") or 0),
    )
