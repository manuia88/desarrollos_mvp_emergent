"""
simulador_palancas_engine — F4.1/F4.2 · "Qué Pasaría Si" (aplica las palancas APRENDIDAS hacia adelante).
═══════════════════════════════════════════════════════════════════════════════
Cierra el lado que faltaba del loop del Cerebro: lo que aprende (qué hace vender) deja de ser un
dato que solo se muestra y GUÍA la decisión de producto del dev.
  • F4.1: nº de recámaras. F4.2: + terraza, bodega, estacionamiento, piso, banda de precio.
  • Toma los lifts causales reales (cerebro_mercado_engine.lifts_por_factor) y proyecta el impacto
    de un cambio (ej. Sin terraza → Con terraza): cuánto sube/baja la venta esperada.
  • Honesto (build-for-endstate): si aún no hay suficiente venta real, lo dice y no inventa.
REUSA (grep-antes-de-construir): cerebro_mercado_engine.lifts_por_factor + factores_disponibles.
FAIL-OPEN. Cero deuda. IA-first: usa dato causal aprendido, no supuestos.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.simulador_palancas")


def _norm(factor: str, val) -> Optional[str]:
    """Normaliza el valor de entrada a la etiqueta que usa el motor de lifts."""
    if val is None:
        return None
    if factor == "recamaras":
        try:
            return f"{int(val)} recámaras"
        except (TypeError, ValueError):
            return str(val)
    return str(val)   # otros factores: la etiqueta llega directa (ej. "Con terraza")


def _opt(opciones, label):
    return next((o for o in opciones if o.get("valor") == label), None)


async def factores(db) -> Dict[str, Any]:
    """Catálogo de factores simulables + sus opciones aprendidas (para construir el selector). FAIL-OPEN."""
    try:
        from cerebro_mercado_engine import factores_disponibles, lifts_por_factor
        out = []
        for f in factores_disponibles():
            r = await lifts_por_factor(db, f["key"])
            out.append({**f, "opciones": [o["valor"] for o in (r.get("opciones") or [])],
                        "suficiente_dato": r.get("suficiente_dato", False)})
        return {"factores": out}
    except Exception as e:
        log.warning(f"[simulador] factores fail-open: {e}")
        return {"factores": []}


async def simular(db, factor: str, de, a, colonia_id: Optional[str] = None) -> Dict[str, Any]:
    """Proyecta el impacto de cambiar `factor` de `de` a `a`, usando lo que el Cerebro aprendió. FAIL-OPEN."""
    factor = (factor or "recamaras").lower()
    try:
        from cerebro_mercado_engine import lifts_por_factor, _FACTOR_NOMBRE
    except Exception as e:
        log.warning(f"[simulador] import fail-open: {e}")
        return {"disponible": False, "lectura": "El Cerebro aún no tiene datos para simular."}

    r = await lifts_por_factor(db, factor)
    opciones = r.get("opciones") or []
    base = r.get("base_pct")
    nombre = _FACTOR_NOMBRE.get(factor, factor)
    lbl_de, lbl_a = _norm(factor, de), _norm(factor, a)
    p_de, p_a = _opt(opciones, lbl_de), _opt(opciones, lbl_a)

    payload = {
        "factor": factor, "nombre": nombre, "de": de, "a": a,
        "base_pct": base,
        "opciones": opciones,
    }
    if not r.get("suficiente_dato") or p_a is None:
        return {**payload, "disponible": False, "suficiente_dato": False,
                "lectura": ("Aún aprendiendo: faltan ventas reales para proyectar este cambio con confianza. "
                            "Abajo está lo observado hasta hoy.")}

    vendido_a = p_a["vendido_pct"]
    vendido_de = p_de["vendido_pct"] if p_de else base
    delta = round((vendido_a or 0) - (vendido_de or 0))
    signo = "sube" if delta > 0 else ("baja" if delta < 0 else "no cambia")
    return {
        **payload, "disponible": True, "suficiente_dato": True,
        "vendido_de_pct": vendido_de, "vendido_a_pct": vendido_a, "delta_pp": delta,
        "mejor_opcion": max(opciones, key=lambda p: p.get("vendido_pct", 0)).get("valor") if opciones else None,
        "lectura": (f"Cambiar de «{lbl_de}» a «{lbl_a}» ({nombre}): la venta esperada {signo} "
                    f"{abs(delta)} puntos ({vendido_de}% → {vendido_a}%), según lo aprendido de ventas reales."),
        "fuente": "Simulador de Palancas DMX · aplica los lifts causales aprendidos por el Cerebro del Mercado",
    }
