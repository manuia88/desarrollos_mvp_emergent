"""
DMX · "1 número" — Full Project Score (upgrade Inteligencia · catálogo E01)
═══════════════════════════════════════════════════════════════════════════════
El "PageRank del proyecto": UN solo número 0-100 para comparar cualquier proyecto con
cualquier otro. NO inventa data — FUSIONA las señales que ya existen en cada proyecto
(salud comercial + margen semáforo + absorción + ritmo de venta + demanda/leads),
ponderadas, con desglose honesto. Cierra ciclo: combina lo que los otros motores ya saben.

Pure-ish: recibe el dict de proyecto (el de list-with-stats, que ya trae health/margin/
units_by_status/weekly_sales/leads/conversion) y devuelve {score, grade, breakdown}.
fail-open: si falta una señal, esa dimensión cae a un neutral y el resto pondera.
"""
from __future__ import annotations

from typing import Any, Dict, List


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


# Dimensión → (peso). Suman 1.0.
_WEIGHTS = {
    "Salud comercial": 0.28,
    "Absorción": 0.22,
    "Margen": 0.20,
    "Ritmo de venta": 0.15,
    "Demanda y leads": 0.15,
}

_MARGIN_SCORE = {"verde": 90.0, "amarillo": 65.0, "rojo": 35.0, "gris": 60.0}


def _grade(score: float) -> str:
    if score >= 85:
        return "AAA"
    if score >= 75:
        return "AA"
    if score >= 65:
        return "A"
    if score >= 55:
        return "B"
    if score >= 45:
        return "C"
    return "D"


def compute(p: Dict[str, Any]) -> Dict[str, Any]:
    """Funde las señales del proyecto en un score 0-100 + grado + desglose."""
    by = p.get("units_by_status") or {}
    total = p.get("units_total") or (sum(by.values()) if by else 0) or 1
    sold = (by.get("vendido", 0) or 0) + (by.get("reservado", 0) or 0)
    sold_pct = (sold / total * 100) if total else 0.0

    health = float(p.get("health_score") or 0)
    margin = p.get("margin") or {}
    margin_score = _MARGIN_SCORE.get(margin.get("color"), 60.0)

    ws = p.get("weekly_sales") or []
    tail = ws[-4:] if ws else []
    ritmo = (sum(tail) / len(tail)) if tail else 0.0
    velocity_score = _clamp(ritmo * 25)  # ~4 ventas/sem ≈ 100

    leads = int(p.get("leads_active", 0) or 0)
    conv = float(p.get("conversion_pct", 0) or 0)
    demand_score = _clamp(min(leads * 10, 60) + min(conv, 40))

    dims = {
        "Salud comercial": _clamp(health),
        "Absorción": _clamp(sold_pct),
        "Margen": margin_score,
        "Ritmo de venta": velocity_score,
        "Demanda y leads": demand_score,
    }
    score = round(sum(dims[k] * _WEIGHTS[k] for k in _WEIGHTS))
    breakdown: List[Dict[str, Any]] = [
        {"dim": k, "value": round(dims[k]), "weight": _WEIGHTS[k]} for k in _WEIGHTS
    ]
    return {"score": score, "grade": _grade(score), "breakdown": breakdown}
