"""SCREENER — buscar por CRITERIOS, no por ubicación. El killer del analista: pones condiciones sobre cualquier métrica
('demanda de terraza > oferta' AND 'precio/m² por debajo de la ciudad' AND 'absorción > 1.5') y devuelve la LISTA de
zonas que cumplen, ordenada. Convierte el portal de 'explorar' a 'encontrar la oportunidad'.

Reusa grid_engine.compute (métricas con procedencia) + facet_engine (gaps oferta/demanda por atributo). Universo = colonias
con oferta. No inventa: la condición sobre una métrica latente simplemente no encuentra match.
"""
from typing import Any, Dict, List, Optional

# métricas screenables del grid (id corto → medida del registro)
GRID_METRICS = {
    "precio_m2": ("of.precio_m2", "Precio por m²", "$/m²"),
    "precio_unidad": ("of.precio_absoluto", "Precio de unidad", "MXN"),
    "inventario": ("of.inventario_activo", "Inventario disponible", "unidades"),
    "sell_through": ("of.sell_through", "% vendido", "%"),
    "absorcion": ("of.absorcion_mensual", "Absorción mensual", "u/mes"),
    "vistas": ("dm.vistas", "Vistas", "señales"),
    "busquedas": ("dm.busquedas", "Búsquedas", "señales"),
    "gap_demanda": ("x.gap_oferta_demanda", "Brecha demanda-oferta", "búsquedas"),
    "ratio_dem_inv": ("x.ratio_demanda_inventario", "Demanda por unidad", "x"),
    "indice_revelada": ("x.indice_demanda_revelada", "Índice de demanda revelada", "idx"),
}
ATTR_GAPS = [("terraza", "Terraza"), ("balcon", "Balcón"), ("roof_garden", "Roof garden"),
             ("bodega", "Bodega"), ("pet_friendly", "Pet friendly")]
_OPS = {"gt": lambda a, b: a > b, "lt": lambda a, b: a < b, "gte": lambda a, b: a >= b,
        "lte": lambda a, b: a <= b, "eq": lambda a, b: a == b}
_OP_TXT = {"gt": ">", "lt": "<", "gte": "≥", "lte": "≤", "eq": "="}


def metricas_disponibles() -> Dict[str, Any]:
    grid = [{"id": k, "label": v[1], "unidad": v[2], "tipo": "mercado"} for k, v in GRID_METRICS.items()]
    gaps = [{"id": f"gap_{a}", "label": f"Brecha demanda-oferta · {lbl}", "unidad": "unidades", "tipo": "atributo"} for a, lbl in ATTR_GAPS]
    return {"metricas": grid + gaps, "operadores": [{"id": k, "txt": v} for k, v in _OP_TXT.items()],
            "ejemplo": [{"metrica": "gap_terraza", "op": "gt", "valor": 0}, {"metrica": "precio_m2", "op": "lt", "valor": 90000}]}


async def _valor(db, metrica: str, colonia: str) -> Optional[float]:
    geo = ("colonia", colonia)
    if metrica in GRID_METRICS:
        import grid_engine as ge
        c = await ge.compute(db, GRID_METRICS[metrica][0], {"geo": geo}, with_comparativo=False)
        return c.get("valor")
    if metrica.startswith("gap_"):
        import facet_engine as fe
        attr = metrica[4:]
        r = await fe.facet_query(db, "unidades", group_by=attr, geo=geo)
        con = next((v for v in r["relacional"]["por_valor"] if str(v["valor"]).startswith("con")), None)
        return con["gap"] if con else None
    return None


def _label(metrica: str) -> str:
    if metrica in GRID_METRICS:
        return GRID_METRICS[metrica][1]
    if metrica.startswith("gap_"):
        return f"Brecha {metrica[4:]}"
    return metrica


async def screen(db, criterios: List[Dict[str, Any]], ordenar_por: Optional[str] = None, desc: bool = True,
                 top: int = 40) -> Dict[str, Any]:
    """Devuelve las colonias que cumplen TODOS los criterios (AND), con sus valores, ordenadas."""
    from data_developments import DEVELOPMENTS
    criterios = criterios or []
    colonias = sorted({d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")})
    nombres = {d.get("colonia_id"): (d.get("colonia") or d.get("colonia_id")) for d in DEVELOPMENTS}
    alcaldias = {d.get("colonia_id"): d.get("alcaldia") for d in DEVELOPMENTS}
    necesarias = {c["metrica"] for c in criterios}
    if ordenar_por:
        necesarias.add(ordenar_por)
    resultados = []
    for col in colonias:
        vals = {}
        for mid in necesarias:
            try:
                vals[mid] = await _valor(db, mid, col)
            except Exception:
                vals[mid] = None
        ok = True
        for c in criterios:
            v = vals.get(c["metrica"])
            op = _OPS.get(c["op"])
            if v is None or op is None or not op(v, c["valor"]):
                ok = False
                break
        if ok:
            resultados.append({"colonia": col, "nombre": nombres.get(col, col), "alcaldia": alcaldias.get(col),
                               "valores": {k: vals.get(k) for k in necesarias}})
    if ordenar_por:
        resultados.sort(key=lambda r: (r["valores"].get(ordenar_por) is None,
                                       -(r["valores"].get(ordenar_por) or 0) if desc else (r["valores"].get(ordenar_por) or 0)))
    frase = " Y ".join(f"{_label(c['metrica'])} {_OP_TXT.get(c['op'],'')} {c['valor']}" for c in criterios) or "sin criterios"
    return {"criterios": criterios, "ordenar_por": ordenar_por, "universo": len(colonias), "total": len(resultados),
            "resultados": resultados[:top], "metricas_usadas": sorted(necesarias),
            "lectura": f"{len(resultados)} de {len(colonias)} colonias cumplen: {frase}"}
