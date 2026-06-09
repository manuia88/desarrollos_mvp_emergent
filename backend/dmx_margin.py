"""
DMX · Margen semáforo (upgrade Mis Proyectos · catálogo B02)
═══════════════════════════════════════════════════════════════════════════════
Responde "¿este proyecto tiene margen sano o se está comprimiendo?" cruzando:
  · precio/m² real del proyecto (de sus unidades)
  · costo/m² de construcción (construction_cost_engine · INPP/INCC real, fallback honesto)
  · ritmo de venta (capacidad de mover precio)
→ margen bruto % + semáforo VERDE/AMARILLO/ROJO + veredicto en lenguaje humano.

fail-open: si falta dato, devuelve color gris con motivo (no rompe la lista de proyectos).
El costo/m² se cachea por (colonia, tier) dentro de la request → 1 fetch por zona, no por proyecto.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import construction_cost_engine as cce


def _tier_by_pm2(price_m2: Optional[float]) -> str:
    """Banda de producto por precio/m² (CDMX residencial)."""
    if not price_m2:
        return "mid"
    if price_m2 >= 70000:
        return "luxury"
    if price_m2 >= 40000:
        return "mid"
    return "entry"


def _semaforo(margin_pct: Optional[float], absorption_rate: float,
              cost_meta: Dict[str, Any]) -> Dict[str, Any]:
    """Traduce margen + ritmo de venta a color + veredicto humano."""
    if margin_pct is None:
        return {"color": "gris", "margin_pct": None,
                "verdict": "Faltan precios o m² para calcular el margen."}
    slow = absorption_rate < 1.0  # < ~1 venta/sem ≈ poca capacidad de mover precio
    pct = round(margin_pct * 100, 1)
    stub = bool(cost_meta.get("stub_reason"))
    nota_costo = " (costo estimado)" if stub else ""
    if margin_pct >= 0.30 and not slow:
        return {"color": "verde", "margin_pct": pct,
                "verdict": f"Margen sano ({pct}%) y ventas con ritmo: hay espacio para mover precio.{nota_costo}"}
    if margin_pct >= 0.30 and slow:
        return {"color": "amarillo", "margin_pct": pct,
                "verdict": f"Margen sano ({pct}%) pero ventas lentas: empuja marketing antes que subir precio.{nota_costo}"}
    if margin_pct >= 0.15:
        return {"color": "amarillo", "margin_pct": pct,
                "verdict": f"Margen ajustándose ({pct}%): cuida costos, poco espacio para descuentos.{nota_costo}"}
    if slow:
        return {"color": "rojo", "margin_pct": pct,
                "verdict": f"Margen comprimido ({pct}%) y ventas lentas: poco margen de maniobra.{nota_costo}"}
    return {"color": "rojo", "margin_pct": pct,
            "verdict": f"Margen muy bajo ({pct}%): revisa costos o reposiciona precio.{nota_costo}"}


async def compute_margins(projects: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """projects: [{id, colonia_id, price_m2, absorption_rate}] → {id: {color, margin_pct, verdict, ...}}.
    Cachea costo/m² por (colonia, tier) → 1 llamada por zona."""
    cost_cache: Dict[tuple, Dict[str, Any]] = {}
    out: Dict[str, Dict[str, Any]] = {}
    for p in projects:
        pid = p.get("id")
        price_m2 = p.get("price_m2")
        tier = _tier_by_pm2(price_m2)
        zone = (p.get("colonia_id") or "cdmx")
        ck = (zone, tier)
        if ck not in cost_cache:
            try:
                cost_cache[ck] = await cce.predict_cost_per_m2(zone, "vertical", tier)
            except Exception as e:
                cost_cache[ck] = {"cost_per_m2_mxn": None, "stub_reason": str(e)[:80]}
        cost_meta = cost_cache[ck]
        cost_m2 = cost_meta.get("cost_per_m2_mxn")
        margin_pct = None
        if price_m2 and cost_m2 and price_m2 > 0:
            margin_pct = (price_m2 - cost_m2) / price_m2
        res = _semaforo(margin_pct, float(p.get("absorption_rate") or 0), cost_meta)
        res["price_m2"] = round(price_m2) if price_m2 else None
        res["cost_m2"] = round(cost_m2) if cost_m2 else None
        out[pid] = res
    return out


def project_price_m2(units_list: List[Dict[str, Any]]) -> Optional[float]:
    """Precio/m² promedio del proyecto. Delega al helper CANÓNICO (fuente única para los 4
    portales · antes cada lado tenía su propia fórmula y las cifras no cuadraban)."""
    from data_developments import units_price_m2
    return units_price_m2(units_list)
