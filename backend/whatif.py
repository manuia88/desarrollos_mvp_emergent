"""WHAT-IF — simulador de elasticidad por segmento. '¿Si a 2rec en Polanco le agrego terraza?' → estima el cambio en
precio (premium real de la zona), en demanda capturada (búsquedas que hoy no encuentran ese atributo) y en el gap.
Es una ESTIMACIÓN etiquetada, de dato real (no inventa): usa el premium con/sin atributo medido en la colonia + la
demanda revelada del atributo. Reusa facet_engine.
"""
import statistics
from typing import Any, Dict, Optional

_ATTRS = {"terraza": "Terraza", "balcon": "Balcón", "roof_garden": "Roof garden", "bodega": "Bodega", "pet_friendly": "Pet friendly"}


def _pm2(u):
    return (u["price"] / u["m2_total"]) if u.get("price") and u.get("m2_total") else None


async def whatif(db, geo: tuple, tipologia: Optional[str] = None, agregar: Optional[str] = None) -> Dict[str, Any]:
    """Simula agregar un atributo a un segmento. geo=('colonia','polanco'), tipologia='2rec', agregar='terraza'."""
    from data_developments import DEVELOPMENTS
    import facet_engine as fe
    if not geo or geo[0] != "colonia":
        return {"error": "elige una colonia"}
    col = geo[1]
    if agregar not in _ATTRS:
        return {"error": f"atributo desconocido: {agregar}", "opciones": list(_ATTRS)}
    # unidades de la colonia (+ tipología)
    units = []
    for d in DEVELOPMENTS:
        if d.get("colonia_id") != col:
            continue
        for u in (d.get("units") or []):
            if tipologia and fe._band_recamaras(u.get("bedrooms")) != tipologia:
                continue
            units.append(u)
    base_pm2_vals = [_pm2(u) for u in units if _pm2(u)]
    base_pm2 = round(statistics.median(base_pm2_vals)) if base_pm2_vals else None
    # PREMIUM del atributo — apples-to-apples: misma tipología primero; si hay poco dato, cae a toda la colonia (con nota)
    col_units = [u for d in DEVELOPMENTS if d.get("colonia_id") == col for u in (d.get("units") or [])]
    def _con_sin(pool):
        return ([_pm2(u) for u in pool if u.get(agregar) and _pm2(u)], [_pm2(u) for u in pool if not u.get(agregar) and _pm2(u)])
    base_pool = [u for u in col_units if not tipologia or fe._band_recamaras(u.get("bedrooms")) == tipologia]
    con, sin = _con_sin(base_pool)
    cohorte = f"misma tipología ({tipologia})" if tipologia else "toda la colonia"
    if len(con) < 3 or len(sin) < 3:                       # poco dato → cae a colonia completa
        con, sin = _con_sin(col_units); cohorte = "toda la colonia (poca muestra en la tipología)"
    lift = round(100 * (statistics.median(con) - statistics.median(sin)) / statistics.median(sin)) if (con and sin) else None
    nuevo_pm2 = round(base_pm2 * (1 + lift / 100)) if (base_pm2 and lift is not None) else None
    # DEMANDA del atributo (búsquedas que lo piden) + oferta actual
    fq = await fe.facet_query(db, "unidades", group_by=agregar, geo=geo)
    m = next((x for x in fq["relacional"]["por_valor"] if str(x["valor"]).startswith("con")), None)
    dem_attr = m["demanda"] if m else 0
    of_attr = m["oferta"] if m else 0
    gap_attr = m["gap"] if m else 0
    # lectura (signo correcto: el atributo puede subir o bajar el precio según el dato de la zona)
    signo = f"{'+' if (lift or 0) > 0 else ''}{lift}%" if lift is not None else "—"
    partes = []
    if base_pm2 and nuevo_pm2:
        verbo = "subiría" if (lift or 0) > 0 else "bajaría" if (lift or 0) < 0 else "no cambiaría"
        partes.append(f"el precio/m² {verbo} de ${base_pm2:,} a ${nuevo_pm2:,} ({signo}, premium medido en {cohorte})")
    if gap_attr > 0:
        partes.append(f"capturarías hasta ~{gap_attr} búsquedas que hoy no encuentran {_ATTRS[agregar].lower()}")
    lectura = (f"Si a {tipologia or 'las unidades'} en {col.replace('-', ' ').title()} les agregas {_ATTRS[agregar].lower()}: "
               + " · ".join(partes) + ".") if partes else "Sin dato suficiente para estimar el cambio."
    return {
        "geo": list(geo), "tipologia": tipologia, "atributo": _ATTRS[agregar], "cohorte_premium": cohorte,
        "base": {"precio_m2": base_pm2, "n_unidades": len(units)},
        "estimado": {"precio_m2": nuevo_pm2, "lift_pct": lift, "demanda_atributo": dem_attr, "oferta_atributo": of_attr, "gap_atributo": gap_attr},
        "lectura": lectura,
        "cautela": "estimación basada en el premium con/sin atributo medido en la zona + demanda revelada — correlación, no garantía",
        "fuente": "DEVELOPMENTS.units (premium hedónico) + buyer_signals/marketplace_searches (demanda)",
    }


def opciones() -> Dict[str, Any]:
    return {"atributos": [{"id": k, "label": v} for k, v in _ATTRS.items()],
            "tipologias": ["studio", "1rec", "2rec", "3rec", "4+rec"]}
