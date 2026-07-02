"""SIMETRÍA OFERTA↔DEMANDA — el cubo simétrico. Por cada dimensión, muestra el balance oferta vs demanda y dónde está la
mayor tensión (oportunidad = demanda>oferta) y la mayor sobreoferta. La 'foto' de dónde el mercado está alineado vs
desbalanceado, en todas las dimensiones a la vez. Reusa facet_engine (cada lado, cada valor independiente).
"""
from typing import Any, Dict, Optional

_DIMS = [("recamaras", "Tipología"), ("tier_precio", "Rango de precio"), ("vista", "Vista"),
         ("piso", "Piso"), ("terraza", "Terraza"), ("balcon", "Balcón"), ("roof_garden", "Roof garden"),
         ("bodega", "Bodega"), ("pet_friendly", "Pet friendly")]


async def cubo_simetrico(db, geo: Optional[tuple] = None) -> Dict[str, Any]:
    import facet_engine as fe
    filas = []
    for gb, label in _DIMS:
        try:
            r = await fe.facet_query(db, "unidades", group_by=gb, geo=geo)
        except Exception:
            continue
        pv = r["relacional"]["por_valor"]
        if not pv:
            continue
        oferta_tot = sum(v["oferta"] for v in pv)
        demanda_tot = sum(v["demanda"] for v in pv)
        op = max(pv, key=lambda v: v["gap"])           # mayor oportunidad (demanda-oferta)
        so = min(pv, key=lambda v: v["gap"])           # mayor sobreoferta
        filas.append({
            "dimension": gb, "label": label,
            "oferta_total": oferta_tot, "demanda_total": demanda_tot,
            "balance": "demanda>oferta" if demanda_tot > oferta_tot else "oferta>demanda" if oferta_tot > demanda_tot else "parejo",
            "mayor_oportunidad": ({"segmento": op["valor"], "gap": op["gap"]} if op["gap"] > 0 else None),
            "mayor_sobreoferta": ({"segmento": so["valor"], "gap": so["gap"]} if so["gap"] < 0 else None),
            "valores": [{"segmento": v["valor"], "oferta": v["oferta"], "demanda": v["demanda"], "gap": v["gap"]} for v in pv],
        })
    return {"geo": list(geo) if geo else None, "dimensiones": filas,
            "lectura": "balance oferta↔demanda en cada dimensión — verde donde se busca más de lo que hay (oportunidad)",
            "fuente": "facet_engine (oferta: DEVELOPMENTS.units · demanda: buyer_signals/marketplace_searches)"}
