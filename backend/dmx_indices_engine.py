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
import metric_normalizer as _mn

# Distribución (percentiles) de cada índice POR CIUDAD: {ciudad: {clave_indice: dist}}.
# Se llena lazy con ensure_index_distributions(). Permite bandear cada zona por su PERCENTIL
# real dentro de SU mercado ("top 20% de su ciudad") en vez de un tope inventado o de mezclar
# ciudades. Cero deuda: si está vacío, _idx cae a banda absoluta honesta marcada "estimado".
_INDEX_DIST: Dict[str, Dict[str, Dict[str, Any]]] = {}

# ── Metadatos en lenguaje normal (lo que mide cada índice) ──
INDICES_META: Dict[str, Dict[str, str]] = {
    "IPV": {"nombre": "Plusvalía",      "que_mide": "Qué tan rápido sube de valor la zona."},
    "IAB": {"nombre": "Absorción",      "que_mide": "Qué tan rápido se vende lo que sale a la venta."},
    "IDS": {"nombre": "Demanda",        "que_mide": "Cuánta gente busca aquí frente a cuánto hay disponible."},
    "IRE": {"nombre": "Renta",          "que_mide": "Qué tan atractivo es rentar (tradicional o Airbnb)."},
    "ICO": {"nombre": "Calidad de Zona","que_mide": "Qué tan bien calificada está la zona para vivir."},
    "MOM": {"nombre": "Momentum",       "que_mide": "Qué tan caliente está la zona AHORA (búsquedas, vistas, leads, precio)."},
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
    "MOM": ("Zona caliente ahora — actúa rápido, hay tracción.",
            "Ritmo normal de actividad.",
            "Zona fría ahora — no es el momento de empujar precio."),
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


def _yield_to_score(pct: float) -> float:
    """ROI de renta anual → 0-100 (8%→100 · 5%→60 · 2%→20)."""
    if pct >= 8: return 100.0
    if pct >= 5: return _clamp(60 + (pct - 5) / 3.0 * 40)
    if pct >= 2: return _clamp(20 + (pct - 2) / 3.0 * 40)
    return _clamp(pct * 10)


# nivel honesto → banda legada (alto/medio/bajo) para no romper consumidores previos
_NIVEL_TO_LEGACY = {
    "muy_alta": ("alto", 0), "alta": ("alto", 0), "media": ("medio", 1),
    "baja": ("bajo", 2), "muy_baja": ("bajo", 2), None: ("medio", 1),
}


def _idx(key: str, valor: float, fuente: str, cdist: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    valor = round(_clamp(valor), 1)
    # Banda HONESTA por percentil real DE SU CIUDAD (los 5 índices: más alto = mejor).
    sig = _mn.band_from_dist((cdist or {}).get(key), valor)
    legacy, li = _NIVEL_TO_LEGACY.get(sig["nivel"], ("medio", 1))
    estimado = bool(sig["es_estimado"]) or (fuente == "estimado")
    return {
        "key": key, "nombre": INDICES_META[key]["nombre"],
        "que_mide": INDICES_META[key]["que_mide"],
        "valor": valor, "letra": _letter(valor),
        # ── Señal honesta (lenguaje normal) ──
        "nivel": sig["nivel"], "etiqueta": sig["etiqueta"],
        "percentil": sig["percentil"], "comparado_con": sig["comparado_con"],
        "es_estimado": estimado, "leyenda": sig["leyenda"],
        # ── Compatibilidad con UI previa ──
        "banda": legacy, "color": sig["color"], "fuente": fuente,
        "lectura": _READS[key][li],
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
    # Distribución de SU ciudad (percentiles por mercado, no se mezcla CDMX con GDL/MTY…).
    city = colonia.get("city") or "CDMX"
    cdist = _INDEX_DIST.get(city) or _INDEX_DIST.get("CDMX") or {}

    # ── IPV · Plusvalía = velocidad de gentrificación (momentum + tendencia real) ──
    ipv = _idx("IPV", z["gentrificacion"]["score"], "real", cdist)

    # ── IAB · Absorción ──
    if ctx.get("absorcion_pct") is not None:
        iab = _idx("IAB", float(ctx["absorcion_pct"]), "real", cdist)
    else:
        scarcity = _clamp((140 - inv) / 140.0 * 25, -12, 25)
        iab = _idx("IAB", 50 + mom * 4 + scarcity, "estimado", cdist)

    # ── IDS · Demanda ──
    if ctx.get("demanda_score") is not None:
        ids = _idx("IDS", float(ctx["demanda_score"]), "real", cdist)
    else:
        desir = (scores.get("comercio", 60) + scores.get("vida", 60) + scores.get("plusvalia", 60)) / 3.0
        scarcity = _clamp((140 - inv) / 140.0 * 20, -10, 20)
        ids = _idx("IDS", 0.55 * desir + mom * 4 + scarcity, "estimado", cdist)

    # ── IRE · Renta = ROI mezclado (55% tradicional + 45% Airbnb) normalizado ──
    blend_yield = 0.55 * z["renta"]["larga_pct"] + 0.45 * z["renta"]["corta_pct"]
    ire = _idx("IRE", _yield_to_score(blend_yield), z["renta"]["fuente"], cdist)
    ire["detalle"] = {"larga_pct": z["renta"]["larga_pct"], "corta_pct": z["renta"]["corta_pct"], "mejor": z["renta"]["mejor"]}

    # ── ICO · Calidad de zona = promedio ponderado de las 7 dimensiones (mayor=mejor) ──
    ico_val = (0.20 * scores.get("vida", 60) + 0.18 * scores.get("seguridad", 60)
               + 0.16 * scores.get("movilidad", 60) + 0.14 * scores.get("comercio", 60)
               + 0.12 * scores.get("educacion", 60) + 0.12 * scores.get("plusvalia", 60)
               + 0.08 * scores.get("riesgo", 60))
    ico = _idx("ICO", ico_val, "real", cdist)

    # ── MOM · Momentum = qué tan caliente está la zona AHORA (live_pulse, vía ctx) ──
    # Fuera del IDM maestro (es la señal más volátil); se muestra como índice independiente.
    if ctx.get("momentum_score") is not None:
        mom_ix = _idx("MOM", float(ctx["momentum_score"]),
                      "estimado" if ctx.get("momentum_estimado") else "real", cdist)
    else:
        mom_ix = _idx("MOM", 50.0, "estimado", cdist)  # neutral honesto sin pulso vivo

    indices = [ipv, iab, ids, ire, ico, mom_ix]
    by_key = {i["key"]: i for i in indices}

    # ── IDM · maestro = promedio ponderado de los 5 (MOM NO entra al maestro) ──
    idm_val = round(_clamp(sum(by_key[k]["valor"] * w for k, w in IDM_WEIGHTS.items())), 1)
    idm_sig = _mn.band_from_dist(cdist.get("IDM"), idm_val)
    idm_legacy, _li = _NIVEL_TO_LEGACY.get(idm_sig["nivel"], ("medio", 1))
    any_est = any(by_key[k]["fuente"] == "estimado" for k in IDM_WEIGHTS)
    idm = {
        "key": "IDM", "nombre": IDM_META["nombre"], "que_mide": IDM_META["que_mide"],
        "valor": idm_val, "letra": _letter(idm_val),
        "nivel": idm_sig["nivel"], "etiqueta": idm_sig["etiqueta"],
        "percentil": idm_sig["percentil"], "comparado_con": idm_sig["comparado_con"],
        "leyenda": idm_sig["leyenda"],
        "banda": idm_legacy, "color": idm_sig["color"],
        "fuente": "mixto" if any_est else "real",
    }

    return {
        "zona": colonia.get("name"), "tier": colonia.get("tier"), "city": city,
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


# ── Distribución de los 5 índices POR CIUDAD (banda por percentil real de su mercado) ──
def build_index_distributions(colonias: List[Dict[str, Any]], ctx_fn=None) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Distribución (percentiles) de cada índice, agrupada POR CIUDAD. Así "Alta" significa
    alta frente a su propia ciudad, sin mezclar CDMX con Guadalajara/Monterrey/etc.
    El `valor` de cada índice NO depende de la banda → es seguro llamar compute_indices
    aquí aunque _INDEX_DIST esté vacío (no hay recursión)."""
    grids: Dict[str, Dict[str, List[float]]] = {}
    for c in colonias:
        city = c.get("city") or "CDMX"
        g = grids.setdefault(city, {k: [] for k in ("IPV", "IAB", "IDS", "IRE", "ICO", "MOM", "IDM")})
        r = compute_indices(c, ctx_fn(c) if ctx_fn else None)
        for i in r["indices"]:
            g[i["key"]].append(i["valor"])
        g["IDM"].append(r["idm"]["valor"])
    global _INDEX_DIST
    _INDEX_DIST = {city: {k: _mn.dist_from_values(v) for k, v in g.items()} for city, g in grids.items()}
    return _INDEX_DIST


def ensure_index_distributions(colonias: List[Dict[str, Any]], ctx_fn=None, refresh: bool = False) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Garantiza que las distribuciones por ciudad estén listas (lazy · idempotente)."""
    if _INDEX_DIST and not refresh:
        return _INDEX_DIST
    return build_index_distributions(colonias, ctx_fn)


def signal_leyenda(city: str = "CDMX") -> str:
    """Leyenda del sello para la UI (de dónde sale la señal · por ciudad)."""
    n = ((_INDEX_DIST.get(city) or {}).get("IDM") or {}).get("n", 0)
    return _mn.leyenda(n, n < _mn.MIN_REAL)
