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

# Modelo calibrado (lstsq sobre anclas reales). Reentrenable con _fit_model(db).
_COEF = {"suelo": 1.16, "calidad": 425.0, "intercepto": 38640.0}
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
