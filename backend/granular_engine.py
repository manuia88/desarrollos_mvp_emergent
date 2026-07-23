"""
GRANULAR ENGINE · hipersegmentación desde el desglose por cuarto de los planos CAD (Quiero Casa 07-22).

Cada unidad trae `desglose` = m² por cuarto (sala_comedor, recamara_1/2/3, bano_1/2, closet_lavado,
pasillo, muros_ductos, habitable, terraza, balcon_1/2, azotea, vendible). De ahí salen métricas que
NADIE en el mercado publica: cuánto pagas de MUROS, tus metros REALMENTE vivibles, el $/m² vivible
(no el vendible inflado), aire libre, ratio social/privado, y un score de calidad de producto.

Todo es puro cómputo (0 API). `metricas_unidad` es la fuente única; el resto agrega y ranking-ea.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from statistics import median


def _f(v) -> Optional[float]:
    try:
        return float(v) if v not in (None, "", "N/A") else None
    except (TypeError, ValueError):
        return None


def _s(*vals) -> float:
    return sum(x for x in (_f(v) for v in vals) if x)


def metricas_unidad(u: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Métricas hipergranulares de UNA unidad desde su desglose. None si no hay desglose CAD."""
    d = u.get("desglose") or {}
    hab = _f(d.get("habitable")) or _f(u.get("m2_privative"))
    vend = _f(d.get("vendible")) or _f(u.get("m2_total"))
    if not hab or not vend:
        return None
    muros = _f(d.get("muros_ductos")) or 0.0
    pasillo = _f(d.get("pasillo")) or 0.0
    recs = [_f(d.get(f"recamara_{i}")) for i in (1, 2, 3)]
    recs = [r for r in recs if r]
    banos = [_f(d.get(f"bano_{i}")) for i in (1, 2)]
    n_banos = sum(1 for b in banos if b) or (int(u.get("bathrooms")) if u.get("bathrooms") else 0)
    social = _f(d.get("sala_comedor")) or 0.0
    outdoor = _s(d.get("terraza"), d.get("balcon_1"), d.get("balcon_2"), d.get("azotea"))
    vivible = max(0.0, hab - muros - pasillo)     # metros donde REALMENTE vives
    precio = _f(u.get("price"))
    n_rec = len(recs) or (int(u.get("bedrooms")) if u.get("bedrooms") else 0)

    rec_ppal = max(recs) if recs else None
    tier = None
    if rec_ppal is not None:
        tier = ("compacta" if rec_ppal < 9 else "cómoda" if rec_ppal < 11
                else "amplia" if rec_ppal < 14 else "master")

    m = {
        "habitable": round(hab, 2), "vendible": round(vend, 2), "vivible": round(vivible, 2),
        "muros_m2": round(muros, 2), "muros_pct": round(100 * muros / hab, 1) if hab else None,
        "circulacion_pct": round(100 * pasillo / hab, 1) if hab else None,
        "metros_muertos_pct": round(100 * (muros + pasillo) / vend, 1) if vend else None,  # pared+pasillo que pagas
        "eficiencia_pct": round(100 * vivible / vend, 1) if vend else None,                 # IEE: vivible / vendible
        "aire_libre_m2": round(outdoor, 2), "aire_libre_pct": round(100 * outdoor / vend, 1) if vend else None,
        "recamara_principal_m2": round(rec_ppal, 2) if rec_ppal else None, "recamara_principal_tier": tier,
        "recamaras_m2": [round(r, 2) for r in recs], "n_recamaras": n_rec,
        "sala_comedor_m2": round(social, 2) if social else None,
        "ratio_social_privado": round(social / sum(recs), 2) if recs and social else None,
        "banos_por_recamara": round(n_banos / n_rec, 2) if n_rec else None,
    }
    if precio:
        m["precio_m2_vendible"] = round(precio / vend)
        m["precio_m2_habitable"] = round(precio / hab)
        m["precio_m2_vivible"] = round(precio / vivible) if vivible else None   # el costo REAL del metro que usas
    m["score_calidad"] = _score_calidad(m)
    return m


def _score_calidad(m: Dict[str, Any]) -> Optional[int]:
    """0-100 · mezcla eficiencia + poco muro + aire libre + recámara + baños. Producto, no precio."""
    parts, w = [], []
    if m.get("eficiencia_pct") is not None:
        parts.append(min(100, max(0, (m["eficiencia_pct"] - 55) / (85 - 55) * 100))); w.append(0.35)
    if m.get("muros_pct") is not None:
        parts.append(min(100, max(0, (22 - m["muros_pct"]) / (22 - 10) * 100))); w.append(0.20)
    if m.get("aire_libre_pct") is not None:
        parts.append(min(100, m["aire_libre_pct"] / 25 * 100)); w.append(0.15)
    if m.get("recamara_principal_m2") is not None:
        parts.append(min(100, max(0, (m["recamara_principal_m2"] - 8) / (16 - 8) * 100))); w.append(0.20)
    if m.get("banos_por_recamara") is not None:
        parts.append(min(100, m["banos_por_recamara"] / 1.0 * 100)); w.append(0.10)
    if not parts:
        return None
    tot = sum(wi for wi in w)
    return round(sum(p * wi for p, wi in zip(parts, w)) / tot)


def agregado_dev(units: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Perfil de PRODUCTO del desarrollo: promedios de las métricas granulares de sus unidades con CAD."""
    ms = [metricas_unidad(u) for u in units]
    ms = [m for m in ms if m]
    if not ms:
        return None
    def med(k):
        vals = [m[k] for m in ms if m.get(k) is not None]
        return round(median(vals), 1) if vals else None
    return {
        "n_unidades_cad": len(ms),
        "eficiencia_pct": med("eficiencia_pct"), "muros_pct": med("muros_pct"),
        "metros_muertos_pct": med("metros_muertos_pct"), "aire_libre_pct": med("aire_libre_pct"),
        "recamara_principal_m2": med("recamara_principal_m2"), "score_calidad": med("score_calidad"),
        "precio_m2_vivible": med("precio_m2_vivible"), "precio_m2_vendible": med("precio_m2_vendible"),
    }


def percentil(valor: float, universo: List[float], menor_mejor: bool = False) -> Optional[int]:
    """En qué percentil cae `valor` contra el universo (0-100). menor_mejor invierte (muros: menos=mejor)."""
    vals = [v for v in universo if v is not None]
    if not vals or valor is None:
        return None
    p = 100 * sum(1 for v in vals if v <= valor) / len(vals)
    return round(100 - p if menor_mejor else p)
