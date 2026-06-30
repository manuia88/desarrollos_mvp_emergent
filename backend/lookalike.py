"""LOOKALIKE — 'colonias parecidas a Condesa'. Construye un vector de características por colonia (precio, demanda,
absorción, mix de tipología, atributos, riesgo aproximado) y devuelve las más similares por distancia coseno, con el
PORQUÉ (en qué se parecen). Reusa facet_engine + grid_engine. Para pricing y forecast por comparables.
"""
import math
from typing import Any, Dict, List, Optional

_FEATS = [
    ("precio_m2", "of.precio_m2"), ("sell_through", "of.sell_through"), ("inventario", "of.inventario_activo"),
    ("absorcion", "of.absorcion_mensual"), ("vistas", "dm.vistas"), ("busquedas", "dm.busquedas"),
]
_LABELS = {"precio_m2": "precio/m²", "sell_through": "% vendido", "inventario": "inventario",
           "absorcion": "absorción", "vistas": "interés (vistas)", "busquedas": "búsquedas"}


async def _vector(db, col) -> Dict[str, float]:
    import grid_engine as ge
    out = {}
    for key, mid in _FEATS:
        try:
            c = await ge.compute(db, mid, {"geo": ("colonia", col)}, with_comparativo=False)
            out[key] = c.get("valor")
        except Exception:
            out[key] = None
    return out


def _norm(vectores: Dict[str, Dict], key) -> Dict[str, float]:
    vals = [v[key] for v in vectores.values() if isinstance(v.get(key), (int, float))]
    if not vals:
        return {}
    lo, hi = min(vals), max(vals)
    rng = (hi - lo) or 1
    return {c: ((v[key] - lo) / rng if isinstance(v.get(key), (int, float)) else None) for c, v in vectores.items()}


async def similares(db, col_objetivo: str, top: int = 6) -> Dict[str, Any]:
    from data_developments import DEVELOPMENTS
    colonias = sorted({d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")})
    nombres = {d.get("colonia_id"): (d.get("colonia") or d.get("colonia_id")) for d in DEVELOPMENTS}
    if col_objetivo not in colonias:
        return {"error": f"colonia desconocida: {col_objetivo}", "colonias": colonias}
    vectores = {c: await _vector(db, c) for c in colonias}
    # normaliza cada feature 0-1
    normas = {key: _norm(vectores, key) for key, _ in _FEATS}
    keys = [k for k, _ in _FEATS]

    def vec(c):
        return [normas[k].get(c) for k in keys]

    base = vec(col_objetivo)
    resultados = []
    for c in colonias:
        if c == col_objetivo:
            continue
        v = vec(c)
        pares = [(a, b) for a, b in zip(base, v) if a is not None and b is not None]
        if len(pares) < 3:
            continue
        # similitud coseno sobre los features compartidos
        dot = sum(a * b for a, b in pares)
        na = math.sqrt(sum(a * a for a, _ in pares)) or 1
        nb = math.sqrt(sum(b * b for _, b in pares)) or 1
        sim = dot / (na * nb)
        # en qué se parece (features más cercanos)
        cercanos = sorted([(k, abs((normas[k].get(col_objetivo) or 0) - (normas[k].get(c) or 0)))
                           for k in keys if normas[k].get(c) is not None and normas[k].get(col_objetivo) is not None],
                          key=lambda x: x[1])[:3]
        resultados.append({"colonia": c, "nombre": nombres.get(c, c), "similitud_pct": round(100 * sim),
                           "se_parece_en": [_LABELS.get(k, k) for k, _ in cercanos],
                           "precio_m2": vectores[c].get("precio_m2")})
    resultados.sort(key=lambda r: -r["similitud_pct"])
    return {"objetivo": nombres.get(col_objetivo, col_objetivo), "objetivo_id": col_objetivo,
            "similares": resultados[:top],
            "lectura": f"colonias con perfil de mercado parecido a {nombres.get(col_objetivo, col_objetivo)} (precio/demanda/absorción)",
            "fuente": "grid_engine (precio/demanda/absorción por colonia) · similitud coseno"}
