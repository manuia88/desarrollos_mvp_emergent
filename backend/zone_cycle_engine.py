"""
DMX · Ciclo de Mercado + Gentrificación + Renta por zona (B05 · D05 · D07).
═══════════════════════════════════════════════════════════════════════════════
Motor REUSABLE (dev · comprador · superadmin): toma una colonia (data_seed.COLONIAS) y
opcionalmente la absorción del dev, y devuelve, en lenguaje normal:
  · ciclo (B05):  en qué fase del ciclo inmobiliario está la zona (recuperación/expansión/
                  maduro/contracción) — derivado de momentum + tendencia + inventario.
  · gentrificacion (D05): qué tan rápido se revaloriza la zona (velocidad).
  · renta (D07):  ROI estimado de renta LARGA (tradicional) vs CORTA (Airbnb). Estimación
                  honesta por tier + vitalidad; se afina con AirROI/AirDNA o el campo del átomo.

Sin datos finos NO inventa: marca la renta como 'estimada' y se autollenará al prender el conector.
"""
from typing import Any, Dict, Optional

# Yield bruto anual estimado de renta LARGA por tier (CDMX, conservador).
_TIER_YIELD = {
    "Luxury": 4.0, "Premium": 4.2, "Corporate": 4.5, "Central": 4.8, "Colonial": 5.0,
    "Mid-up": 5.0, "Family": 5.2, "Revival": 5.5, "Trendy": 5.5, "Mid": 5.8,
    "Emerging": 6.5, "Up-and-coming": 6.8,
}

_FASE = {
    "recuperacion": {"label": "Recuperación", "color": "azul",
                     "lectura": "Arranca a subir desde abajo — entrada temprana, mayor potencial de plusvalía."},
    "expansion": {"label": "Expansión", "color": "verde",
                  "lectura": "Creciendo fuerte — buen momento para vender con plusvalía o subir precio."},
    "maduro": {"label": "Maduro / Pico", "color": "ambar",
               "lectura": "Precios altos y crecimiento lento — el margen ya está; cuida el sobreprecio."},
    "contraccion": {"label": "Contracción", "color": "rojo",
                    "lectura": "Precios a la baja — sostén precio o espera; no es momento de exigir más."},
}


def _momentum_pct(colonia) -> float:
    try:
        return float(str(colonia.get("momentum", "0")).replace("%", "").replace("+", ""))
    except Exception:
        return 0.0


def _trend_slope(colonia) -> float:
    tr = colonia.get("trend") or []
    return (tr[-1] - tr[0]) if len(tr) >= 2 else 0.0


def compute_zone_cycle(colonia: Dict[str, Any], absorcion_pct: Optional[float] = None) -> Dict[str, Any]:
    mom = _momentum_pct(colonia)
    slope = _trend_slope(colonia)
    tier = colonia.get("tier") or "Mid"
    price_m2 = colonia.get("price_m2_num") or 0
    scores = colonia.get("scores") or {}
    comercio = scores.get("comercio", 60)
    premium = tier in ("Luxury", "Premium", "Corporate", "Central")
    emergente = tier in ("Emerging", "Up-and-coming", "Trendy", "Revival")

    # ── B05 · Ciclo ──
    if mom < 0:
        fase = "contraccion"
    elif mom >= 7 or (slope >= 12 and emergente):
        fase = "expansion"
    elif emergente and mom >= 3:
        fase = "recuperacion"
    elif premium and mom <= 4:
        fase = "maduro"
    else:
        fase = "expansion" if mom >= 5 else "recuperacion" if emergente else "maduro"
    ciclo = {"fase_key": fase, **_FASE[fase], "momentum_pct": mom}

    # ── D05 · Gentrificación (velocidad de revalorización 0-100) ──
    gent = min(100, round(mom * 6 + max(0, slope) * 1.5 + (15 if emergente else 0)))
    nivel = "alta" if gent >= 65 else "media" if gent >= 35 else "baja"
    gentrificacion = {
        "score": gent, "nivel": nivel,
        "lectura": ("Se revaloriza rápido — la zona está cambiando a tu favor." if nivel == "alta"
                    else "Se revaloriza a ritmo medio." if nivel == "media"
                    else "Zona estable, poca revalorización."),
    }

    # ── D07 · Renta larga vs corta (estimación honesta) ──
    larga = colonia.get("roi_renta_larga_pct") or _TIER_YIELD.get(tier, 5.5)
    factor_corta = round(1.4 + (comercio / 100.0) * 0.55, 2)   # más vida/comercio → mejor Airbnb
    corta = colonia.get("roi_renta_corta_pct") or round(larga * factor_corta, 1)
    fuente_renta = "dato" if colonia.get("roi_renta_larga_pct") else "estimado"
    mejor = "corta" if corta - larga >= 1.5 else "larga"
    renta = {
        "larga_pct": round(larga, 1), "corta_pct": round(corta, 1), "mejor": mejor, "fuente": fuente_renta,
        "lectura": (f"Renta corta (Airbnb) rinde ~{round(corta,1)}% vs ~{round(larga,1)}% la tradicional — "
                    + ("la zona pide Airbnb." if mejor == "corta" else "mejor renta tradicional aquí.")),
    }

    return {
        "zona": colonia.get("name"), "tier": tier, "price_m2": price_m2,
        "ciclo": ciclo, "gentrificacion": gentrificacion, "renta": renta,
    }


def zone_recommendation(z: Dict[str, Any]) -> str:
    """Una jugada en lenguaje normal que cruza ciclo + gentrificación + renta."""
    fase = z["ciclo"]["fase_key"]
    gent = z["gentrificacion"]["nivel"]
    renta = z["renta"]
    base = z["zona"]
    if fase == "expansion":
        return f"{base}: está en expansión{' y gentrificando rápido' if gent == 'alta' else ''} — buen momento para subir precio o vender con plusvalía."
    if fase == "recuperacion":
        return f"{base}: apenas arranca a subir — entra/construye temprano; atrae inversionistas con la renta {renta['mejor']} (~{renta['corta_pct'] if renta['mejor']=='corta' else renta['larga_pct']}%)."
    if fase == "maduro":
        return f"{base}: mercado maduro, crecimiento lento — no te sobrepases en precio; el gancho es el producto y la renta {renta['mejor']}."
    return f"{base}: precios a la baja — sostén precio y refuerza marketing; la renta {renta['mejor']} (~{renta['corta_pct'] if renta['mejor']=='corta' else renta['larga_pct']}%) sigue siendo un argumento."
