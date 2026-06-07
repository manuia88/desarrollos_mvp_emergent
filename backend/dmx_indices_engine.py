"""
DMX · Los 5 Índices DMX licenciables (I04) — composites 0-100 sobre dato existente.
═══════════════════════════════════════════════════════════════════════════════
DRPI (precios hedónicos, base 100) ya existe en drpi_engine. Aquí se construyen los
otros 5 índices como COMPOSITES sobre motores que ya viven en el repo — sin inventar
fuentes nuevas. Motor REUSABLE (dev · comprador · superadmin · licenciamiento):

  · IPV — Índice de Plusvalía:   qué tan rápido se revaloriza la zona (gentrificación).
  · IAB — Índice de Absorción:   qué tan rápido se vende lo que sale a la venta.
  · IDS — Índice de Demanda:     cuánta gente busca aquí vs cuánto hay disponible.
  · IRE — Índice de Renta:       qué tan atractivo es rentar (tradicional o Airbnb).
  · ICO — Índice de Calidad:     qué tan bien calificada está la zona para vivir.
  · IDM — Índice DMX (maestro):  el "1 número" de la zona (promedio ponderado de los 5).

Cada índice: valor 0-100, letra A-F, banda (alto/medio/bajo), lectura en lenguaje
normal y `fuente` (real | estimado). Lo que aún no tiene fuente fina (absorción real,
demanda viva) entra por `ctx` cuando el caller la tiene; si no, se estima honestamente
y se marca 'estimado' → se autollena al pasar el dato real (cero deuda).

Reusa zone_cycle_engine (gentrificación + renta) — NO duplica esa lógica.
"""
from typing import Any, Dict, List, Optional

import zone_cycle_engine as _zce

# ── Metadatos en lenguaje normal (lo que mide cada índice) ──
INDICES_META: Dict[str, Dict[str, str]] = {
    "IPV": {"nombre": "Plusvalía",      "que_mide": "Qué tan rápido sube de valor la zona."},
    "IAB": {"nombre": "Absorción",      "que_mide": "Qué tan rápido se vende lo que sale a la venta."},
    "IDS": {"nombre": "Demanda",        "que_mide": "Cuánta gente busca aquí frente a cuánto hay disponible."},
    "IRE": {"nombre": "Renta",          "que_mide": "Qué tan atractivo es rentar (tradicional o Airbnb)."},
    "ICO": {"nombre": "Calidad de Zona","que_mide": "Qué tan bien calificada está la zona para vivir."},
}
IDM_META = {"nombre": "Índice DMX", "que_mide": "El número único de la zona: combina los 5 índices."}

# Peso de cada índice en el maestro IDM.
IDM_WEIGHTS = {"IPV": 0.20, "IAB": 0.20, "IDS": 0.20, "IRE": 0.15, "ICO": 0.25}

# Lecturas por banda (alto / medio / bajo) en lenguaje accionable.
_READS = {
    "IPV": ("Se revaloriza rápido — entra o construye temprano.",
            "Se revaloriza a ritmo medio.",
            "Plusvalía lenta — el gancho no es esperar valor, es el producto."),
    "IAB": ("Lo que sale se vende rápido — bajo riesgo de quedarte con inventario.",
            "Se vende a ritmo normal — cuida el precio.",
            "Se vende lento — no infles precio ni inventario."),
    "IDS": ("Más gente buscando que oferta — demanda a tu favor.",
            "Demanda equilibrada con la oferta.",
            "Poca demanda relativa — refuerza marketing y diferénciate."),
    "IRE": ("Renta muy atractiva — buen gancho para inversionistas.",
            "Renta razonable — argumento secundario.",
            "Renta floja — vende patrimonio/uso, no rendimiento."),
    "ICO": ("Zona muy bien calificada para vivir — vende calidad de vida.",
            "Zona sólida con áreas de mejora.",
            "Zona en desarrollo — apuesta a la transformación."),
}


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _letter(v: float) -> str:
    if v >= 80: return "A"
    if v >= 65: return "B"
    if v >= 50: return "C"
    if v >= 35: return "D"
    if v >= 20: return "E"
    return "F"


def _band(v: float) -> Dict[str, str]:
    if v >= 67:
        return {"banda": "alto", "color": "verde", "i": 0}
    if v >= 45:
        return {"banda": "medio", "color": "ambar", "i": 1}
    return {"banda": "bajo", "color": "rojo", "i": 2}


def _yield_to_score(pct: float) -> float:
    """ROI de renta anual → 0-100 (8%→100 · 5%→60 · 2%→20)."""
    if pct >= 8: return 100.0
    if pct >= 5: return _clamp(60 + (pct - 5) / 3.0 * 40)
    if pct >= 2: return _clamp(20 + (pct - 2) / 3.0 * 40)
    return _clamp(pct * 10)


def _idx(key: str, valor: float, fuente: str) -> Dict[str, Any]:
    valor = round(_clamp(valor), 1)
    b = _band(valor)
    return {
        "key": key, "nombre": INDICES_META[key]["nombre"],
        "que_mide": INDICES_META[key]["que_mide"],
        "valor": valor, "letra": _letter(valor),
        "banda": b["banda"], "color": b["color"], "fuente": fuente,
        "lectura": _READS[key][b["i"]],
    }


def compute_indices(colonia: Dict[str, Any], ctx: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Los 5 índices + el maestro IDM para una colonia.

    ctx opcional con dato fino real (lo pasa el caller cuando lo tiene):
      · absorcion_pct  → IAB real (si no, se estima de momentum + inventario).
      · demanda_score  → IDS real 0-100 (heat de demand_engine; si no, se estima).
    """
    ctx = ctx or {}
    scores = colonia.get("scores") or {}
    inv = colonia.get("inventory") or 100
    mom = _zce._momentum_pct(colonia)
    z = _zce.compute_zone_cycle(colonia)  # reusa gentrificación + renta (no duplica)

    # ── IPV · Plusvalía = velocidad de gentrificación (momentum + tendencia real) ──
    ipv = _idx("IPV", z["gentrificacion"]["score"], "real")

    # ── IAB · Absorción ──
    if ctx.get("absorcion_pct") is not None:
        iab = _idx("IAB", float(ctx["absorcion_pct"]), "real")
    else:
        scarcity = _clamp((140 - inv) / 140.0 * 25, -12, 25)
        iab = _idx("IAB", 50 + mom * 4 + scarcity, "estimado")

    # ── IDS · Demanda ──
    if ctx.get("demanda_score") is not None:
        ids = _idx("IDS", float(ctx["demanda_score"]), "real")
    else:
        desir = (scores.get("comercio", 60) + scores.get("vida", 60) + scores.get("plusvalia", 60)) / 3.0
        scarcity = _clamp((140 - inv) / 140.0 * 20, -10, 20)
        ids = _idx("IDS", 0.55 * desir + mom * 4 + scarcity, "estimado")

    # ── IRE · Renta = ROI mezclado (55% tradicional + 45% Airbnb) normalizado ──
    blend_yield = 0.55 * z["renta"]["larga_pct"] + 0.45 * z["renta"]["corta_pct"]
    ire = _idx("IRE", _yield_to_score(blend_yield), z["renta"]["fuente"])
    ire["detalle"] = {"larga_pct": z["renta"]["larga_pct"], "corta_pct": z["renta"]["corta_pct"], "mejor": z["renta"]["mejor"]}

    # ── ICO · Calidad de zona = promedio ponderado de las 7 dimensiones (mayor=mejor) ──
    ico_val = (0.20 * scores.get("vida", 60) + 0.18 * scores.get("seguridad", 60)
               + 0.16 * scores.get("movilidad", 60) + 0.14 * scores.get("comercio", 60)
               + 0.12 * scores.get("educacion", 60) + 0.12 * scores.get("plusvalia", 60)
               + 0.08 * scores.get("riesgo", 60))
    ico = _idx("ICO", ico_val, "real")

    indices = [ipv, iab, ids, ire, ico]
    by_key = {i["key"]: i for i in indices}

    # ── IDM · maestro = promedio ponderado de los 5 ──
    idm_val = round(_clamp(sum(by_key[k]["valor"] * w for k, w in IDM_WEIGHTS.items())), 1)
    idm_band = _band(idm_val)
    any_est = any(i["fuente"] == "estimado" for i in indices)
    idm = {
        "key": "IDM", "nombre": IDM_META["nombre"], "que_mide": IDM_META["que_mide"],
        "valor": idm_val, "letra": _letter(idm_val), "banda": idm_band["banda"], "color": idm_band["color"],
        "fuente": "mixto" if any_est else "real",
    }

    return {
        "zona": colonia.get("name"), "tier": colonia.get("tier"),
        "price_m2": colonia.get("price_m2_num") or 0, "momentum_pct": mom,
        "idm": idm, "indices": indices,
    }


def indices_play(result: Dict[str, Any]) -> str:
    """Una jugada en lenguaje normal que cruza los índices (accionable para el dev)."""
    by = {i["key"]: i for i in result["indices"]}
    zona = result.get("zona") or "esta zona"
    ipv, iab, ids, ire = by["IPV"]["valor"], by["IAB"]["valor"], by["IDS"]["valor"], by["IRE"]["valor"]
    if ipv >= 67 and ids >= 60:
        return f"{zona}: plusvalía y demanda altas — momento de subir precio o lanzar fase nueva."
    if iab < 45:
        return f"{zona}: se vende lento (absorción {iab}) — no infles precio; refuerza marketing y diferenciación."
    if ire >= 67:
        return f"{zona}: la renta es el gancho (índice {ire}) — atrae inversionistas con el argumento de rendimiento."
    if ipv < 45:
        return f"{zona}: plusvalía lenta — vende el producto y la calidad de vida, no la espera de valor."
    return f"{zona}: zona equilibrada — mantén precio en línea con el mercado y cuida el ritmo de venta."
