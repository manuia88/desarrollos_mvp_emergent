"""
Estimación de PRECIO DE VENTA (mercado) por colonia — el "mix + upgrade" honesto.

propiedades.com tiene precio de venta porque es PORTAL de anuncios (mediana de listings publicados).
Nosotros no scrapeamos. Este motor da una estimación HONESTA y ETIQUETADA combinando 3 capas, en prioridad:

  1. REAL (alta confianza): precio de venta que el founder cargó (las ~16 semilla) o cierres reales (DRPI).
  2. ESTIMADO (media): mini-AVM calibrado con esas anclas → venta = A·valor_suelo_catastral + B·calidad + C.
  3. APROXIMADO (baja): mismo modelo fuera del rango de las anclas (periferia sin ancla) → se marca baja confianza.

Cada respuesta trae `source` y `confianza` → el front muestra el sello honesto (nunca como precio cerrado).
Coeficientes calibrados 2026-06-17 con 9 anclas (error medio ~17%): venta = 1.16·suelo + 425·calidad + 38640.
Cuando entren cierres reales (db.transactions→DRPI, ya cableado) más colonias pasan a capa 1 automáticamente.
"""
from __future__ import annotations
import re
from typing import Any, Dict, Optional

# Modelo calibrado por lstsq sobre ANCLAS REALES de mercado (muestra Monopolio 2026-06, 20 colonias centrales).
# venta_$/m² = 0.900·valor_suelo_catastral + 105.5·calidad + 53541 · error medio ~14% (antes 9 anclas: 17%).
# Reentrenable: correr el refit cuando lleguen más comps a db.market_comps.
_COEF = {"suelo": 0.900, "calidad": 105.5, "intercepto": 53541.0}
_ANCHOR_LO, _ANCHOR_HI = 3500.0, 20000.0   # rango de valor_suelo de las anclas → fuera = baja confianza
_FLOOR, _CEIL = 12000.0, 220000.0          # cota sana de $/m² de venta en CDMX

_seed_cache: Optional[Dict[str, float]] = None   # colonia_id → precio_venta_m2 REAL (semilla)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


async def _seed_prices(db) -> Dict[str, float]:
    """Mapea las colonias semilla (con precio de venta real) a su id de colonia IECM (por nombre)."""
    global _seed_cache
    if _seed_cache is not None:
        return _seed_cache
    out: Dict[str, float] = {}
    try:
        from data_seed import COLONIAS as SEED
        for c in SEED:
            pm2 = c.get("price_m2_num")
            nm = c.get("name")
            if not pm2 or not nm:
                continue
            best_id, best_cat = None, -1.0
            async for col in db.colonias.find(
                    {"name": {"$regex": re.escape(nm), "$options": "i"}, "geometry": {"$exists": True}},
                    {"_id": 0, "id": 1}):
                v = await db.colonia_catastro_byid.find_one({"colonia_id": col["id"]}, {"_id": 0, "valor_suelo_m2": 1})
                cat = (v or {}).get("valor_suelo_m2") or 0
                if cat > best_cat:
                    best_cat, best_id = cat, col["id"]
            if best_id:
                out[best_id] = float(pm2)
    except Exception:
        pass
    _seed_cache = out
    return out


def estimate_m2(valor_suelo_m2: Optional[float], calidad: Optional[float]) -> Optional[float]:
    """Mini-AVM: precio de venta $/m² estimado desde el valor del suelo catastral + la calidad de zona."""
    if not valor_suelo_m2:
        return None
    cal = calidad if isinstance(calidad, (int, float)) else 45.0
    est = _COEF["suelo"] * valor_suelo_m2 + _COEF["calidad"] * cal + _COEF["intercepto"]
    return round(max(_FLOOR, min(_CEIL, est)))


async def market_for_colonia(db, colonia_id: str, valor_suelo_m2: Optional[float] = None,
                             calidad: Optional[float] = None) -> Dict[str, Any]:
    """Precio de venta de la colonia con la mejor capa disponible + sello de fuente/confianza."""
    # Capa 0 — MUESTRA REAL DE MERCADO (comps Monopolio en db.market_comps · $/m² observado de anuncios reales).
    try:
        mc = await db.market_comps.find_one(
            {"colonia_id": colonia_id},
            {"_id": 0, "market_m2": 1, "n": 1, "premium_zona": 1, "avm_base": 1, "median_m2": 1})
        if mc and mc.get("market_m2"):
            return {"precio_venta_m2": round(mc["market_m2"]), "source": "mercado", "confianza": "alta",
                    "es_estimado": False, "muestra_n": mc.get("n"), "premium_zona": mc.get("premium_zona"),
                    "avm_base": mc.get("avm_base"), "median_m2": mc.get("median_m2")}
    except Exception:
        pass
    # Capa 1 — precio REAL (semilla / cierres). DRPI real se enchufa aquí cuando db.transactions tenga datos.
    seed = await _seed_prices(db)
    if colonia_id in seed:
        return {"precio_venta_m2": round(seed[colonia_id]), "source": "mercado",
                "confianza": "alta", "es_estimado": False}
    # Capa 2/3 — ESTIMADO con el mini-AVM (confianza según el rango de las anclas)
    est = estimate_m2(valor_suelo_m2, calidad)
    if est is None:
        return {"precio_venta_m2": None, "source": None, "confianza": None, "es_estimado": True}
    en_rango = valor_suelo_m2 is not None and _ANCHOR_LO <= valor_suelo_m2 <= _ANCHOR_HI
    return {"precio_venta_m2": est, "source": "estimado", "es_estimado": True,
            "confianza": "media" if en_rango else "baja",
            "rango": [round(est * 0.78), round(est * 1.25)]}   # banda honesta de incertidumbre


# Prima de obra NUEVA vs usada. CALIBRADA con la muestra real Monopolio (16,643 anuncios · 264 colonias):
# la prima por zona resultó mediana x1.04 (rango x0.48–1.28) — mucho menor y más ruidosa que el ~1.18 que se
# asumía. Default conservador 1.05; market_comps.premium_zona da el valor REAL por colonia donde hay muestra.
NEW_PREMIUM = 1.05


# AVM HEDÓNICO propio (calibrado sobre 16,643 anuncios reales Monopolio · regresión log-precio).
# log(precio) = avm_base[colonia] + 0.860·log(m2) − 0.0295·rec + 0.0429·ban − 0.0051·edad.
# Estima el precio de UNA propiedad (ajustado por tamaño/recámaras/baños/edad) — no el promedio de colonia.
# Precisión a la par de Monopolio (~16% error mediano vs su 14.6%). avm_base por colonia vive en market_comps.
_HEDONIC = {"log_m2": 0.8603, "rec": -0.0295, "ban": 0.0429, "edad": -0.0051}


def avm_property(avm_base: float, m2: float, rec: Optional[int], ban: Optional[int],
                 anio: Optional[int]) -> Optional[float]:
    """Valor de mercado estimado de UNA propiedad (nuestro AVM hedónico). None si faltan datos clave."""
    import math
    if avm_base is None or not m2 or m2 < 15:
        return None
    edad = min((2026 - anio) if anio else 25, 80)
    lp = (avm_base + _HEDONIC["log_m2"] * math.log(m2)
          + _HEDONIC["rec"] * (rec or 2) + _HEDONIC["ban"] * (ban or 1) + _HEDONIC["edad"] * edad)
    return round(math.exp(lp))


def price_position(precio_total: float, m2: float, mercado_m2: Optional[float],
                   es_nueva: bool = False, premium: Optional[float] = None, banda: float = 0.05,
                   avm_base: Optional[float] = None, rec: Optional[int] = None,
                   ban: Optional[int] = None, anio: Optional[int] = None) -> Dict[str, Any]:
    """¿El precio está BAJO / JUSTO / ALTO vs el mercado de su zona? (método Monopolio: precio vs estimado,
    cubetas ±banda). `mercado_m2` = $/m² de la zona (≈ usada). Si `es_nueva` (desarrollo/preventa) el benchmark
    sube por la prima de obra nueva: usa la prima REAL de la zona (`premium` de market_comps) si existe, si no
    el default NEW_PREMIUM. Así el veredicto de un desarrollo se mide contra obra nueva, no contra usada."""
    if not precio_total or not m2 or not mercado_m2:
        return {"disponible": False}
    factor = (premium or NEW_PREMIUM) if es_nueva else 1.0
    # Estimado por PROPIEDAD: AVM hedónico (ajusta por tamaño/recámaras/baños/edad) si hay avm_base de la zona;
    # si no, mediana de zona × m². Ambos × prima de obra nueva cuando es desarrollo.
    hed = avm_property(avm_base, m2, rec, ban, anio) if avm_base is not None else None
    metodo = "hedonico" if hed else "zona"
    estimado = round((hed if hed else mercado_m2 * m2) * factor)
    bench_m2 = estimado / m2 if m2 else mercado_m2
    if estimado <= 0:
        return {"disponible": False}
    diff = (precio_total - estimado) / estimado
    if diff < -banda:
        etiqueta, color = "bajo", "verde"      # buen punto de entrada
    elif diff > banda:
        etiqueta, color = "alto", "rojo"
    else:
        etiqueta, color = "justo", "ambar"
    return {
        "disponible": True,
        "etiqueta": etiqueta, "color": color,
        "diff_pct": round(diff * 100, 1),
        "precio_m2": round(precio_total / m2),
        "estimado": estimado,
        "estimado_m2": round(bench_m2),
        "metodo": metodo,                                    # hedonico (por propiedad) | zona (mediana)
        "base": "obra nueva" if es_nueva else "mercado",     # contra qué se compara
        "prima_obra_nueva_pct": round((NEW_PREMIUM - 1) * 100) if es_nueva else 0,
        "mercado_usada_m2": round(mercado_m2),               # referencia de usada (transparencia)
        "rango": [round(estimado * 0.88), round(estimado * 1.12)],   # ~±12% IC del AVM
    }
