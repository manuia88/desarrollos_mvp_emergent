"""PRECIO ÓPTIMO v1 — la recomendación accionable por unidad: el producto para el dev.

Cruza dos señales que ya fabricamos:
  · el MODELO (ml_residual_pct: qué tan barata/cara está vs lo que el mercado paga
    por sus atributos), y
  · la DEMANDA OBSERVADA (colocación del molde: qué tan rápido vuela ese producto).

Reglas honestas y legibles (v1, sin IA — cuando haya elasticidad aprendida con más
fotos, el delta sugerido saldrá de la curva real):
  barata + molde volando   → SUBIR (dinero dejado en la mesa)
  barata + molde lento     → GANCHO (ancla de demanda consciente, o subir gradual)
  cara   + molde lento     → REVISAR (precio o esquema: el mercado no la valida)
  lo demás                 → MANTENER
El delta sugerido jamás excede el residual del modelo (no se inventa mercado).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

UMBRAL_RESIDUAL = 5.0        # ±5%: dentro de esto el precio está "en modelo"
MOLDE_VOLANDO = 60.0         # colocación ≥60% = el producto se mueve solo
MOLDE_LENTO = 40.0           # colocación <40% = el mercado duda


def recomendar(residual_pct: Optional[float],
               colocacion_pct: Optional[float]) -> Optional[Dict[str, Any]]:
    """residual_pct = (precio real − valor modelo) / valor modelo × 100.
    Negativo = subpreciada. Sin modelo o sin unidad → None (no se inventa)."""
    if residual_pct is None:
        return None
    barata = residual_pct < -UMBRAL_RESIDUAL
    cara = residual_pct > UMBRAL_RESIDUAL
    if not barata and not cara:
        return {"recomendacion": "mantener", "delta_sugerido_pct": 0.0,
                "porque": f"está a {residual_pct:+.1f}% del modelo — dentro de la banda normal"}
    if barata and colocacion_pct is not None and colocacion_pct >= MOLDE_VOLANDO:
        delta = round(min(abs(residual_pct), 8.0), 1)     # subir con prudencia
        return {"recomendacion": "subir",
                "delta_sugerido_pct": delta,
                "porque": f"está {abs(residual_pct):.1f}% bajo el modelo y su molde ya "
                          f"colocó {colocacion_pct:.0f}% — dinero en la mesa"}
    if barata:
        return {"recomendacion": "gancho",
                "delta_sugerido_pct": 0.0,
                "porque": f"está {abs(residual_pct):.1f}% bajo el modelo pero su molde "
                          f"va lento ({(colocacion_pct or 0):.0f}% colocado) — sirve de "
                          f"ancla de demanda o subir gradual"}
    if cara and colocacion_pct is not None and colocacion_pct < MOLDE_LENTO:
        return {"recomendacion": "revisar",
                "delta_sugerido_pct": -round(min(abs(residual_pct), 8.0), 1),
                "porque": f"está {residual_pct:+.1f}% sobre el modelo y su molde solo "
                          f"colocó {colocacion_pct:.0f}% — el mercado no valida el premium"}
    return {"recomendacion": "mantener", "delta_sugerido_pct": 0.0,
            "porque": f"está {residual_pct:+.1f}% sobre el modelo pero su molde se "
                      f"mueve — el premium se está pagando"}
