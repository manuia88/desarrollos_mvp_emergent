"""
equilibrium_engine.py — PRECIO DE EQUILIBRIO + ELASTICIDAD DE ABSORCIÓN + GAP POR RANGO DE PRECIO.

El motor keystone que cierra el círculo demanda↔oferta↔precio↔absorción. Fusiona:
  · market_comps_4s  — velocidad de absorción REAL (unidades/mes) vs precio/m² de proyectos comparables.
  · demanda_4s       — GAP (demanda − inventario) por zona×segmento×rango de precio (EPRAV 4S).

Responde la pregunta que ningún motor tuyo respondía: "¿a qué precio/m² se vende el inventario en N meses?"
y "¿cuánto cambia la velocidad por cada 1% de precio?" (elasticidad precio-absorción).

Doctrina de datos: si hay ≥3 comparables reales 4S → fuente='real', es_estimado=False. Si no → fallback
mediana marcado 'estimado'. Nunca inventa: sin datos devuelve estimado honesto. FAIL-OPEN.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.equilibrium")

FUENTE = "4s_2026-05"
MIN_COMPS_REAL = 3


def _ols(xs: List[float], ys: List[float]) -> Optional[Dict[str, float]]:
    """Regresión lineal simple y = a + b·x (OLS puro, sin dependencias). None si degenerada."""
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    syy = sum((y - my) ** 2 for y in ys)
    b = sxy / sxx
    a = my - b * mx
    r = sxy / ((sxx * syy) ** 0.5) if syy > 0 else 0.0
    return {"slope": b, "intercept": a, "r": r, "mx": mx, "my": my}


def _median(vals: List[float]) -> Optional[float]:
    s = sorted(v for v in vals if v is not None)
    if not s:
        return None
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


async def _comparables(db, *, zona: Optional[str] = None, estudio: Optional[str] = None,
                       clasificacion: Optional[str] = None) -> List[Dict[str, Any]]:
    q: Dict[str, Any] = {}
    if zona:
        q["zona_norm"] = zona.strip().lower()
    if estudio:
        q["estudio"] = estudio
    if clasificacion:
        q["clasificacion"] = clasificacion
    try:
        cur = db.market_comps_4s.find(q, {"_id": 0})
        return [d async for d in cur]
    except Exception as e:
        log.warning("[equilibrium] comparables fail-open: %s", e)
        return []


async def precio_equilibrio(db, *, zona: Optional[str] = None, estudio: Optional[str] = None,
                            clasificacion: Optional[str] = None, meses_objetivo: int = 12,
                            unidades_objetivo: Optional[int] = None) -> Dict[str, Any]:
    """Precio/m² al que un proyecto vende su inventario en `meses_objetivo`, según la curva
    velocidad↔precio de los comparables reales. + elasticidad precio-absorción. FAIL-OPEN."""
    comps = await _comparables(db, zona=zona, estudio=estudio, clasificacion=clasificacion)
    pts = [(c["precio_m2"], c["velocidad_mensual_real"]) for c in comps
           if c.get("precio_m2") and c.get("velocidad_mensual_real") is not None]
    inv_mediano = _median([c.get("unidades_inventario") for c in comps]) or 30
    objetivo_unidades = unidades_objetivo or inv_mediano
    vel_objetivo = round(objetivo_unidades / max(1, meses_objetivo), 2)

    base = {
        "zona": zona, "estudio": estudio, "clasificacion": clasificacion,
        "meses_objetivo": meses_objetivo, "unidades_objetivo": objetivo_unidades,
        "velocidad_objetivo_mensual": vel_objetivo,
        "n_comparables": len(pts),
        "precio_m2_rango": [round(min(x for x, _ in pts)), round(max(x for x, _ in pts))] if pts else None,
        "velocidad_mediana": _median([y for _, y in pts]),
        "comparables": [{"proyecto": c["proyecto"], "precio_m2": c["precio_m2"],
                         "velocidad_mensual_real": c["velocidad_mensual_real"],
                         "clasificacion": c.get("clasificacion")} for c in comps][:12],
    }

    fit = _ols([x for x, _ in pts], [y for _, y in pts]) if len(pts) >= MIN_COMPS_REAL else None
    if fit and fit["slope"] != 0:
        # precio al que la velocidad esperada iguala la objetivo: a + b·x = vel_obj → x = (vel_obj - a)/b
        precio_eq = (vel_objetivo - fit["intercept"]) / fit["slope"]
        # elasticidad en la mediana: %Δvelocidad por %Δprecio = slope · (precio_mediana / vel_mediana)
        px = fit["mx"]
        vy = fit["my"]
        elasticidad = round(fit["slope"] * (px / vy), 3) if vy else None
        base.update({
            "precio_equilibrio_m2": round(precio_eq) if precio_eq > 0 else None,
            "elasticidad_precio_absorcion": elasticidad,
            "correlacion_precio_velocidad": round(fit["r"], 2),
            "fuente": "real",
            "es_estimado": False,
            "interpretacion": _interpreta(precio_eq, base.get("precio_m2_rango"), elasticidad),
        })
    else:
        # sin comparables suficientes → estimado honesto (mediana), sin inventar el equilibrio
        base.update({
            "precio_equilibrio_m2": None,
            "elasticidad_precio_absorcion": None,
            "fuente": "estimado",
            "es_estimado": True,
            "interpretacion": ("Sin comparables 4S suficientes en el filtro; se muestra mediana de mercado. "
                               "Carga más estudios para calcular el precio de equilibrio real."),
        })
    return base


def _interpreta(precio_eq: float, rango: Optional[list], elasticidad: Optional[float]) -> str:
    if precio_eq <= 0 or not rango:
        return "El objetivo de venta es muy agresivo para la curva de la zona; baja el ritmo o el precio."
    if precio_eq < rango[0]:
        pos = "por DEBAJO del mercado (venta rápida, deja valor en la mesa)"
    elif precio_eq > rango[1]:
        pos = "por ENCIMA del mercado (difícil vender a ese ritmo)"
    else:
        pos = "dentro del rango de mercado"
    el = f" Elasticidad {elasticidad}: cada +1% de precio cambia la velocidad {round((elasticidad or 0) * 1, 2)}%." if elasticidad else ""
    return f"Para vender en el plazo objetivo, precio de equilibrio {pos}.{el}"


async def gap_por_rango(db, *, estudio: Optional[str] = None) -> Dict[str, Any]:
    """GAP de mercado (demanda − inventario) por segmento/rango de precio = la 'Mezcla de Producto'
    (dónde hay hueco). Dato EPRAV real de los estudios 4S. FAIL-OPEN."""
    q = {"estudio": estudio} if estudio else {}
    try:
        segs = [s async for s in db.demanda_4s.find(q, {"_id": 0})]
    except Exception as e:
        log.warning("[equilibrium] gap fail-open: %s", e)
        segs = []
    segs.sort(key=lambda s: -(s.get("gap_vertical_3anos") or 0))
    total_gap = sum(s.get("gap_vertical_3anos", 0) or 0 for s in segs)
    return {
        "estudio": estudio,
        "gap_total_3anos": total_gap,
        "fuente": "real" if segs else "sin_dato",
        "es_estimado": not bool(segs),
        "rangos": [{
            "nse": s.get("nse"), "segmento": s.get("segmento"),
            "precio_min": s.get("valor_min"), "precio_max": s.get("valor_max"),
            "demanda_3anos": s.get("demanda_3anos"), "inventario_formal": s.get("inventario_formal"),
            "gap_vertical_3anos": s.get("gap_vertical_3anos"), "venta_mensual": s.get("venta_mensual"),
        } for s in segs],
        "recomendacion": (f"Mayor hueco: {segs[0].get('segmento')} ${(segs[0].get('valor_min') or 0)/1e6:.1f}-"
                          f"{(segs[0].get('valor_max') or 0)/1e6:.1f}mdp con {segs[0].get('gap_vertical_3anos')} "
                          f"unidades sin oferta a 3 años.") if segs else "Sin estudio de demanda para esta zona.",
    }


async def market_intelligence(db, *, zona: Optional[str] = None, estudio: Optional[str] = None,
                              clasificacion: Optional[str] = None, meses_objetivo: int = 12) -> Dict[str, Any]:
    """Vista fusionada: precio de equilibrio + gap + confianza de dato. El input del Gap Radar."""
    eq = await precio_equilibrio(db, zona=zona, estudio=estudio, clasificacion=clasificacion,
                                 meses_objetivo=meses_objetivo)
    gap = await gap_por_rango(db, estudio=estudio)
    confianza = "alta" if (eq.get("fuente") == "real" and gap.get("fuente") == "real") else \
                "media" if (eq.get("fuente") == "real" or gap.get("fuente") == "real") else "baja"
    return {"precio_equilibrio": eq, "gap_mercado": gap, "confianza_dato": confianza, "fuente_4s": FUENTE}
