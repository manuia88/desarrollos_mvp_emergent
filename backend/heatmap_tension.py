"""HEATMAP DE TENSIÓN — la ciudad pintada por cualquier métrica, REPIVOTABLE. Eliges 'gap de terraza' o 'precio/m²' o
'absorción' y todas las colonias se recolorean. El mapa de calor de dónde la demanda rebasa la oferta (y viceversa).

Reusa screener (métricas de grid) + facet_engine (gaps por segmento) + DEVELOPMENTS (centro de cada colonia = promedio de
sus desarrollos). No inventa: la colonia sin dato sale en gris.
"""
from typing import Any, Dict, List, Optional


def _centros() -> Dict[str, Dict[str, Any]]:
    from data_developments import DEVELOPMENTS
    acc: Dict[str, Dict[str, Any]] = {}
    for d in DEVELOPMENTS:
        cid = d.get("colonia_id")
        c = d.get("center")
        if not cid or not c or len(c) < 2:
            continue
        a = acc.setdefault(cid, {"nombre": d.get("colonia") or cid, "alcaldia": d.get("alcaldia"), "lng": [], "lat": [], "n_devs": 0})
        a["lng"].append(c[0]); a["lat"].append(c[1]); a["n_devs"] += 1
    out = {}
    for cid, a in acc.items():
        out[cid] = {"nombre": a["nombre"], "alcaldia": a["alcaldia"], "n_devs": a["n_devs"],
                    "lng": round(sum(a["lng"]) / len(a["lng"]), 5), "lat": round(sum(a["lat"]) / len(a["lat"]), 5)}
    return out


def opciones() -> Dict[str, Any]:
    """Qué se puede pintar: métricas de mercado + gaps por segmento (dimensión × valor)."""
    import screener as sc
    metricas = [{"id": k, "label": v[1], "unidad": v[2]} for k, v in sc.GRID_METRICS.items()]
    dimensiones = [
        {"id": "recamaras", "label": "Tipología", "valores": ["studio", "1rec", "2rec", "3rec", "4+rec"]},
        {"id": "tier_precio", "label": "Rango de precio", "valores": ["0-3M", "3-5M", "5-8M", "8-12M", "12-20M", "20M+"]},
        {"id": "terraza", "label": "Terraza", "valores": ["con terraza"]},
        {"id": "balcon", "label": "Balcón", "valores": ["con balcon"]},
        {"id": "roof_garden", "label": "Roof garden", "valores": ["con roof_garden"]},
        {"id": "vista", "label": "Vista", "valores": ["exterior", "interior"]},
    ]
    return {"metricas": metricas, "dimensiones_segmento": dimensiones,
            "lectura": "elige una métrica (pinta su valor) o una dimensión+valor (pinta el gap demanda-oferta de ese segmento)"}


async def heatmap(db, metrica: Optional[str] = None, dimension: Optional[str] = None, valor: Optional[str] = None) -> Dict[str, Any]:
    """Devuelve, por colonia: coordenadas + el valor a pintar (+oferta/demanda si es un segmento)."""
    import screener as sc
    import facet_engine as fe
    centros = _centros()
    puntos: List[Dict[str, Any]] = []
    modo = "segmento" if (dimension and valor) else "metrica"
    etiqueta = ""
    for cid, c in centros.items():
        v = oferta = demanda = None
        if modo == "segmento":
            try:
                r = await fe.facet_query(db, "unidades", group_by=dimension, geo=("colonia", cid))
                m = next((x for x in r["relacional"]["por_valor"] if str(x["valor"]) == str(valor)), None)
                if m:
                    v, oferta, demanda = m["gap"], m["oferta"], m["demanda"]
            except Exception:
                pass
            etiqueta = f"gap de {valor}"
        else:
            try:
                v = await sc._valor(db, metrica, cid)
            except Exception:
                v = None
            etiqueta = (sc.GRID_METRICS.get(metrica, (None, metrica))[1])
        puntos.append({"colonia": cid, "nombre": c["nombre"], "alcaldia": c["alcaldia"], "lat": c["lat"], "lng": c["lng"],
                       "valor": v, "oferta": oferta, "demanda": demanda, "n_devs": c["n_devs"]})
    vals = [p["valor"] for p in puntos if isinstance(p["valor"], (int, float))]
    escala = {"min": min(vals) if vals else 0, "max": max(vals) if vals else 0,
              "con_dato": len(vals), "total": len(puntos)}
    # top/bottom para lectura rápida
    con_dato = sorted([p for p in puntos if isinstance(p["valor"], (int, float))], key=lambda p: -p["valor"])
    return {"modo": modo, "metrica": metrica, "dimension": dimension, "valor": valor, "etiqueta": etiqueta,
            "puntos": puntos, "escala": escala,
            "top": con_dato[:5], "bottom": con_dato[-5:][::-1] if len(con_dato) > 5 else [],
            "lectura": f"{escala['con_dato']} colonias con dato · pintando: {etiqueta}"}
