"""
simulador_palancas_engine — F4.1 · "Qué Pasaría Si" (aplica las palancas APRENDIDAS hacia adelante).
═══════════════════════════════════════════════════════════════════════════════
Cierra el lado que faltaba del loop del Cerebro: lo que el Cerebro aprende (qué hace vender,
aprender_palancas) deja de ser un dato que solo se muestra y GUÍA la decisión de producto del dev.
  • Toma los lifts causales reales (% vendido por nº de recámaras hoy) y proyecta el impacto
    de un cambio de producto (ej. 3 → 2 recámaras): cuánto sube/baja la venta esperada.
  • Honesto (build-for-endstate): si aún no hay suficiente venta real, lo dice y no inventa.
REUSA (grep-antes-de-construir): cerebro_mercado_engine.aprender_palancas (NO recalcula nada).
FAIL-OPEN. Cero deuda. IA-first: usa dato causal aprendido, no supuestos.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.simulador_palancas")

# Factores soportados hoy → cómo se etiquetan en las palancas aprendidas.
_FACTOR_LABEL = {"recamaras": lambda v: f"{v} recámaras"}


def _lift_de(palancas, etiqueta):
    """% vendido y lift_pp de una etiqueta concreta dentro de las palancas. None si no hay dato."""
    for p in palancas:
        if p.get("factor") == etiqueta:
            return p
    return None


async def simular(db, factor: str, de, a, colonia_id: Optional[str] = None) -> Dict[str, Any]:
    """Proyecta el impacto de cambiar `factor` de `de` a `a`, usando lo que el Cerebro aprendió. FAIL-OPEN."""
    factor = (factor or "recamaras").lower()
    if factor not in _FACTOR_LABEL:
        return {"disponible": False, "lectura": f"Aún no simulo el factor '{factor}'."}

    try:
        from cerebro_mercado_engine import aprender_palancas
        pal = await aprender_palancas(db)
    except Exception as e:
        log.warning(f"[simulador] palancas fail-open: {e}")
        return {"disponible": False, "lectura": "El Cerebro aún no tiene datos para simular."}

    palancas = pal.get("palancas") or []
    base = pal.get("base_pct")
    lbl = _FACTOR_LABEL[factor]
    p_de = _lift_de(palancas, lbl(de)) if de is not None else None
    p_a = _lift_de(palancas, lbl(a)) if a is not None else None

    if not pal.get("suficiente_dato") or p_a is None:
        return {
            "disponible": False,
            "factor": factor, "de": de, "a": a,
            "base_pct": base,
            "opciones": [{"valor": p["factor"], "vendido_pct": p["vendido_pct"], "lift_pp": p["lift_pp"], "n": p["n"]} for p in palancas],
            "lectura": ("Aún aprendiendo: faltan ventas reales para proyectar con confianza este cambio. "
                        "Las opciones de abajo son lo observado hasta hoy."),
            "suficiente_dato": False,
        }

    vendido_a = p_a["vendido_pct"]
    vendido_de = p_de["vendido_pct"] if p_de else base
    delta = round((vendido_a or 0) - (vendido_de or 0))
    signo = "sube" if delta > 0 else ("baja" if delta < 0 else "no cambia")
    return {
        "disponible": True,
        "factor": factor, "de": de, "a": a,
        "base_pct": base,
        "vendido_de_pct": vendido_de,
        "vendido_a_pct": vendido_a,
        "delta_pp": delta,
        "mejor_opcion": max(palancas, key=lambda p: p.get("vendido_pct", 0)).get("factor") if palancas else None,
        "opciones": [{"valor": p["factor"], "vendido_pct": p["vendido_pct"], "lift_pp": p["lift_pp"], "n": p["n"]} for p in palancas],
        "lectura": (f"Cambiar de {lbl(de)} a {lbl(a)}: la venta esperada {signo} "
                    f"{abs(delta)} puntos ({vendido_de}% → {vendido_a}%), según lo aprendido de ventas reales."),
        "suficiente_dato": True,
        "fuente": "Simulador de Palancas DMX · aplica los lifts causales aprendidos por el Cerebro del Mercado",
    }
