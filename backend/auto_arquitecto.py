"""AUTO-ARQUITECTO — 'el cubo DISEÑA'. Dada una colonia, propone la FICHA TÉCNICA óptima a construir: cruza la demanda
insatisfecha (whitespace) × el precio/absorción de la zona × el premium de los atributos × la competencia. No inventa:
ensambla lo que ya midió el cubo (explorador.oportunidades + grid_engine + facet). El salto de 'encontrar' a 'diseñar'.
"""
import statistics
from typing import Any, Dict

_ATTR_KEYS = ("terraza", "balcon", "roof_garden", "bodega", "pet_friendly")
_ATTR_LBL = {"terraza": "terraza", "balcon": "balcón", "roof_garden": "roof garden", "bodega": "bodega", "pet_friendly": "pet friendly"}


def _pm2(u):
    return (u["price"] / u["m2_total"]) if u.get("price") and u.get("m2_total") else None


async def disenar(db, colonia: str, top: int = 3) -> Dict[str, Any]:
    import explorador as ex
    import grid_engine as ge
    from data_developments import DEVELOPMENTS
    geo = ("colonia", colonia)
    nombre = colonia.replace("-", " ").title()
    oport = await ex.oportunidades(db, geo=geo, top=40)
    ops = [o for o in oport.get("oportunidades", []) if o.get("colonia_id") == colonia and o["gap"] > 0]
    if not ops:
        return {"colonia": colonia, "nombre": nombre, "fichas": [],
                "lectura": f"En {nombre} no hay huecos de demanda claros hoy — competir por precio/absorción."}

    # separar por tipo de hueco
    tip = [o for o in ops if "rec" in str(o["segmento"]) or o["segmento"] == "studio"]
    attrs = [o for o in ops if any(k in (o.get("filtro") or {}) for k in _ATTR_KEYS)]
    tiers = [o for o in ops if "M" in str(o["segmento"])]

    # precio/m² y absorción de la zona (contexto)
    pm2_cell = await ge.compute(db, "of.precio_m2", {"geo": geo}, with_comparativo=False)
    pm2_zona = pm2_cell.get("valor")
    st_cell = await ge.compute(db, "of.sell_through", {"geo": geo}, with_comparativo=False)
    sell_through = st_cell.get("valor")
    col_units = [u for d in DEVELOPMENTS if d.get("colonia_id") == colonia for u in (d.get("units") or [])]

    fichas = []
    top_tip = tip[0] if tip else None
    top_tier = tiers[0] if tiers else None
    for a in (attrs[:top] or [None]):
        # premium del atributo en la colonia (hedónico)
        prem = None
        attr_key = next((k for k in _ATTR_KEYS if a and k in (a.get("filtro") or {})), None) if a else None
        if attr_key:
            con = [_pm2(u) for u in col_units if u.get(attr_key) and _pm2(u)]
            sin = [_pm2(u) for u in col_units if not u.get(attr_key) and _pm2(u)]
            if con and sin:
                prem = round(100 * (statistics.median(con) - statistics.median(sin)) / statistics.median(sin))
        tipo_lbl = top_tip["segmento"] if top_tip else "2rec"
        tier_lbl = top_tier["segmento"] if top_tier else None
        atributo_lbl = _ATTR_LBL.get(attr_key) if attr_key else None
        # competencia: cuántas unidades de esa tipología ya existen
        competencia = top_tip["oferta"] if top_tip else None
        demanda = (a or top_tip or {}).get("demanda")
        gap = (a or top_tip or {}).get("gap")
        partes = [f"{tipo_lbl}"]
        if atributo_lbl:
            partes.append(f"con {atributo_lbl}")
        if tier_lbl:
            partes.append(f"en {tier_lbl}")
        ficha_txt = " · ".join(partes)
        razon = []
        if gap:
            razon.append(f"{demanda} lo buscan, {(a or top_tip).get('oferta')} existe (faltan {gap})")
        if prem is not None and prem > 0:
            razon.append(f"la {atributo_lbl} paga +{prem}% en la zona")
        if sell_through is not None:
            razon.append(f"absorción de la colonia {sell_through}% vendido")
        fichas.append({
            "ficha": ficha_txt, "tipologia": tipo_lbl, "atributo": atributo_lbl, "tier": tier_lbl,
            "demanda": demanda, "oferta_actual": (a or top_tip).get("oferta"), "gap": gap,
            "premium_atributo_pct": prem, "precio_m2_zona": pm2_zona, "sell_through_zona": sell_through, "competencia": competencia,
            "recomendacion": f"Construye {ficha_txt} en {nombre}: " + " · ".join(razon) + ".",
        })
    fichas.sort(key=lambda f: -(f.get("gap") or 0))
    return {"colonia": colonia, "nombre": nombre, "fichas": fichas[:top],
            "contexto": {"precio_m2_zona": pm2_zona, "sell_through_zona": sell_through},
            "lectura": f"Producto óptimo a construir en {nombre}, derivado del whitespace × precio × premium × absorción",
            "fuente": "explorador.oportunidades (whitespace) + grid_engine (precio/absorción) + premium hedónico",
            "nota": "diseño basado en demanda revelada; el margen final depende de costo de suelo/obra (no incluido aquí)"}
