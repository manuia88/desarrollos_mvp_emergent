"""W4.18.2B Sub-D — AVM público + Colonia stats.

Heuristic AVM (no hedonic_engine.py disponible en codebase actual).
Modelo: precio_per_m2 base de COLONIAS × ajustes (recamaras, banos, antiguedad)
Confidence: ±12% rango por defecto (8% si dato verificable, 18% si fallback).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.avm_public_engine")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _colonia_record(slug: str) -> Optional[Dict[str, Any]]:
    from data_seed import COLONIAS_BY_ID
    return COLONIAS_BY_ID.get(slug)


def avm_quick(
    colonia_slug: str,
    m2: float,
    recamaras: int,
    banos: int,
    antiguedad_anos: int,
) -> Dict[str, Any]:
    col = _colonia_record(colonia_slug)
    if not col:
        return {"error": "colonia_not_found", "colonia_slug": colonia_slug}

    base_per_m2 = col.get("price_m2_num") or 50000
    # Ajustes
    rec_factor = 1.0 + (recamaras - 2) * 0.04  # base 2 rec
    ban_factor = 1.0 + (banos - 2) * 0.025     # base 2 baños
    age_factor = max(0.55, 1.0 - (antiguedad_anos * 0.012))  # 1.2% deprec/año, floor 55%
    adj_per_m2 = base_per_m2 * rec_factor * ban_factor * age_factor
    estimate = adj_per_m2 * m2

    # Confidence: rangos ±12%
    range_low = round(estimate * 0.88)
    range_high = round(estimate * 1.12)
    confidence = "media"

    # Comparables mock: top devs misma colonia
    from data_developments import DEVELOPMENTS
    comparables = []
    for d in DEVELOPMENTS:
        if d.get("colonia_id") != colonia_slug:
            continue
        d_m2 = (d.get("m2_range") or [60])[0]
        comparables.append({
            "dev_id": d["id"],
            "name": d["name"],
            "price_from": d.get("price_from"),
            "m2_min": d_m2,
            "price_per_m2": round((d.get("price_from", 0) / d_m2) if d_m2 else 0),
            "stage": d.get("stage"),
            "slug": d.get("slug"),
        })
    comparables = comparables[:3]

    return {
        "colonia_slug": colonia_slug,
        "colonia_name": col["name"],
        "input": {
            "m2": m2, "recamaras": recamaras, "banos": banos, "antiguedad_anos": antiguedad_anos,
        },
        "precio_estimado": round(estimate),
        "precio_per_m2": round(adj_per_m2),
        "range_low": range_low,
        "range_high": range_high,
        "confidence": confidence,
        "comparables": comparables,
        "disclaimer": "Estimación referencial · no constituye avalúo profesional.",
        "generated_at": _now().isoformat(),
    }


def colonia_stats(colonia_slug: str) -> Dict[str, Any]:
    col = _colonia_record(colonia_slug)
    if not col:
        return {"error": "colonia_not_found", "colonia_slug": colonia_slug}

    from data_developments import DEVELOPMENTS

    devs_in_col = [d for d in DEVELOPMENTS if d.get("colonia_id") == colonia_slug]
    devs_active = [d for d in devs_in_col if d.get("stage") in ("preventa", "en_construccion")]

    top_devs = sorted(devs_active, key=lambda d: d.get("price_from", 0), reverse=True)[:3]
    top_devs_lite = [{
        "dev_id": d["id"], "slug": d.get("slug"), "name": d.get("name"),
        "price_from": d.get("price_from"), "stage": d.get("stage"),
    } for d in top_devs]

    return {
        "slug": col["id"],
        "name": col["name"],
        "alcaldia": col.get("alcaldia"),
        "tier": col.get("tier"),
        "center": col.get("center"),
        "price_m2": col.get("price_m2_num"),
        "momentum": col.get("momentum"),
        "scores": col.get("scores"),
        "total_devs_active": len(devs_active),
        "total_listings_used": 0,  # placeholder hasta brokers ingest
        "demand_index": col.get("inventory", 50),
        "top_3_devs": top_devs_lite,
        "top_3_used_listings": [],
        "generated_at": _now().isoformat(),
    }


def list_top_colonias(limit: int = 30) -> List[Dict[str, str]]:
    """Top N colonias por price_m2 desc para sitemap dinámico."""
    from data_seed import COLONIAS
    sorted_cols = sorted(COLONIAS, key=lambda c: -(c.get("price_m2_num") or 0))
    return [{"slug": c["id"], "name": c["name"]} for c in sorted_cols[:limit]]
