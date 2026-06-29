"""EXPLORADOR — el árbol navegable que recorre el dimension_registry × las entidades. Abres un nodo (ciudad ▸ alcaldía ▸
colonia ▸ desarrollo ▸ unidad) y ves TODOS sus datos, CADA SEGMENTO INDEPENDIENTE (2rec es un dato, 3rec es otro, con
terraza es otro), nunca un blob. En el fondo: las COMBINACIONES (fichas técnicas) como datos sueltos. Cada segmento lleva
su oferta/demanda/gap + el estado del dato (real/derivado/latente) desde el registro canónico.

Reusa facet_engine (conteo oferta/demanda por valor = cada uno independiente) + dimension_registry (qué dimensiones, su
estado) + data_developments. No inventa: el segmento sin dato queda con n=0 y se llena solo.
"""
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import dimension_registry as dr

# qué dimensiones se segmentan en un nodo geográfico → (dimension_id del registro, group_by de facet, etiqueta)
GRUPOS_GEO: List[Tuple[str, str, str]] = [
    ("prod.recamaras", "recamaras", "Tipología (recámaras)"),
    ("px.tier", "tier_precio", "Rango de precio"),
    ("prod.banos", "banos", "Baños"),
    ("prod.cajones", "cajones", "Estacionamientos"),
    ("prod.piso", "piso", "Piso / altura"),
    ("prod.vista", "vista", "Vista"),
    ("prod.orientacion", "orientacion", "Orientación"),
    ("prod.m2_total", "m2", "Superficie (m²)"),
    ("prod.tipo", "prototipo", "Prototipo"),
    ("prod.etapa", "status", "Estado de la unidad"),
]
ATRIBUTOS = [("attr.terraza", "terraza", "Terraza"), ("attr.balcon", "balcon", "Balcón"),
             ("attr.roof_garden", "roof_garden", "Roof garden"), ("attr.bodega", "bodega", "Bodega"),
             ("attr.pet_friendly", "pet_friendly", "Pet friendly"), ("attr.estacion_indep", "estacionamiento_independiente", "Estac. independiente")]


def _node_geo(tipo: str, eid: str) -> Optional[Tuple[str, str]]:
    if tipo == "ciudad":
        return None
    if tipo in ("alcaldia", "colonia", "corredor", "desarrollo"):
        return (tipo, eid)
    if tipo in ("unidad", "prototipo"):
        return ("desarrollo", eid.split("::")[0])
    return None


def _hijos(tipo: str, eid: str) -> List[Dict[str, Any]]:
    from data_developments import DEVELOPMENTS, DEVELOPMENTS_BY_ID
    out = []
    if tipo == "ciudad":
        agg: Dict[str, Dict] = {}
        for d in DEVELOPMENTS:
            a = d.get("alcaldia")
            if not a:
                continue
            x = agg.setdefault(a, {"tipo": "alcaldia", "id": a, "nombre": a, "n_devs": 0, "n_unidades": 0})
            x["n_devs"] += 1
            x["n_unidades"] += len(d.get("units") or [])
        out = sorted(agg.values(), key=lambda z: -z["n_unidades"])
    elif tipo == "alcaldia":
        agg = {}
        for d in DEVELOPMENTS:
            if d.get("alcaldia") != eid:
                continue
            cid = d.get("colonia_id")
            x = agg.setdefault(cid, {"tipo": "colonia", "id": cid, "nombre": d.get("colonia") or cid, "n_devs": 0, "n_unidades": 0})
            x["n_devs"] += 1
            x["n_unidades"] += len(d.get("units") or [])
        out = sorted(agg.values(), key=lambda z: -z["n_unidades"])
    elif tipo == "colonia":
        for d in DEVELOPMENTS:
            if d.get("colonia_id") == eid:
                out.append({"tipo": "desarrollo", "id": d["id"], "nombre": d.get("name") or d["id"],
                            "n_unidades": len(d.get("units") or []), "desarrollador": d.get("developer_id")})
        out.sort(key=lambda z: -z["n_unidades"])
    elif tipo == "desarrollo":
        d = DEVELOPMENTS_BY_ID.get(eid)
        for u in (d.get("units") if d else []):
            out.append({"tipo": "unidad", "id": f"{eid}::{u.get('unit_number')}", "nombre": f"Unidad {u.get('unit_number')}",
                        "precio": u.get("price"), "m2": u.get("m2_total"), "recamaras": u.get("bedrooms"), "status": u.get("status")})
        out.sort(key=lambda z: (z.get("precio") or 9e15))
    return out[:200]


def _ruta(tipo: str, eid: str) -> List[Dict[str, str]]:
    from data_developments import DEVELOPMENTS_BY_ID
    crumbs = [{"tipo": "ciudad", "id": "CDMX", "nombre": "CDMX"}]
    dev = None
    if tipo in ("unidad", "prototipo"):
        dev = DEVELOPMENTS_BY_ID.get(eid.split("::")[0])
    elif tipo == "desarrollo":
        dev = DEVELOPMENTS_BY_ID.get(eid)
    if dev:
        if dev.get("alcaldia"):
            crumbs.append({"tipo": "alcaldia", "id": dev["alcaldia"], "nombre": dev["alcaldia"]})
        crumbs.append({"tipo": "colonia", "id": dev.get("colonia_id"), "nombre": dev.get("colonia")})
        crumbs.append({"tipo": "desarrollo", "id": dev["id"], "nombre": dev.get("name")})
        if tipo == "unidad":
            crumbs.append({"tipo": "unidad", "id": eid, "nombre": f"Unidad {eid.split('::')[-1]}"})
    elif tipo == "alcaldia":
        crumbs.append({"tipo": "alcaldia", "id": eid, "nombre": eid})
    elif tipo == "colonia":
        crumbs.append({"tipo": "colonia", "id": eid, "nombre": eid})
    return crumbs


def _estado(dim_id: str) -> str:
    return (dr.BY_ID.get(dim_id) or {}).get("estado", "derivado")


async def _segmentos_geo(db, geo) -> List[Dict[str, Any]]:
    """Cada dimensión → sus valores como datos INDEPENDIENTES (oferta/demanda/gap por valor)."""
    import facet_engine as fe
    segmentos = []
    for dim_id, gb, label in GRUPOS_GEO:
        try:
            r = await fe.facet_query(db, "unidades", group_by=gb, geo=geo)
        except Exception:
            continue
        items = []
        for v in r["relacional"]["por_valor"]:
            if v["oferta"] == 0 and v["demanda"] == 0:
                continue
            items.append({"segmento": v["valor"], "oferta": v["oferta"], "demanda": v["demanda"], "gap": v["gap"], "tension": v["tension"]})
        if items:
            segmentos.append({"dimension": dim_id, "eje": (dr.BY_ID.get(dim_id) or {}).get("eje", "QUE"),
                              "label": label, "estado": _estado(dim_id), "items": items})
    # atributos: cada uno un dato independiente ("con X")
    atr = []
    for dim_id, fid, label in ATRIBUTOS:
        try:
            r = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
        except Exception:
            continue
        con = next((v for v in r["relacional"]["por_valor"] if str(v["valor"]).startswith("con")), None)
        if con and (con["oferta"] or con["demanda"]):
            atr.append({"segmento": label, "oferta": con["oferta"], "demanda": con["demanda"], "gap": con["gap"], "tension": con["tension"]})
    if atr:
        segmentos.append({"dimension": "attr.*", "eje": "QUE", "label": "Atributos (cada uno independiente)", "estado": "real", "items": atr})
    return segmentos


def _combinaciones(geo) -> List[Dict[str, Any]]:
    """Las FICHAS TÉCNICAS: cada combinación distinta (rec·baños·cajones·m²·atributos) = un dato suelto."""
    from data_developments import DEVELOPMENTS
    import facet_engine as fe
    combos: Counter = Counter()
    for d in DEVELOPMENTS:
        if geo and not fe._geo_match(d, geo):
            continue
        for u in (d.get("units") or []):
            rec = fe._band_recamaras(u.get("bedrooms"))
            ba = u.get("bathrooms")
            caj = fe._band_cajones(u.get("parking_spots"))
            m2 = fe._band_m2(u.get("m2_total"))
            atrs = "+".join(a for a in ("terraza", "balcon", "roof_garden", "bodega") if u.get(a)) or "sin extras"
            if rec is None:
                continue
            ficha = f"{rec} · {ba} baños · {caj} cajón · {m2}m² · {atrs}"
            combos[ficha] += 1
    return [{"ficha": k, "n": v} for k, v in combos.most_common(40)]


def _caracteristicas_unidad(eid: str) -> List[Dict[str, Any]]:
    """Las características de UNA unidad, cada una como dato independiente."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev, _, un = eid.partition("::")
    d = DEVELOPMENTS_BY_ID.get(dev)
    u = next((x for x in (d.get("units") if d else []) if str(x.get("unit_number")) == un), None)
    if not u:
        return []
    campos = [("Recámaras", u.get("bedrooms")), ("Baños", u.get("bathrooms")), ("Estacionamientos", u.get("parking_spots")),
              ("Tipo de cajón", u.get("parking_type")), ("m² total", u.get("m2_total")), ("m² privativo", u.get("m2_privative")),
              ("m² terraza", u.get("m2_terrace")), ("Piso", u.get("level")), ("Orientación", u.get("orientation")),
              ("Vista", u.get("vista")), ("Prototipo", u.get("prototype")), ("Precio", u.get("price")), ("Estado", u.get("status")),
              ("Terraza", "sí" if u.get("terraza") else "no"), ("Balcón", "sí" if u.get("balcon") else "no"),
              ("Roof garden", "sí" if u.get("roof_garden") else "no"), ("Bodega", "sí" if u.get("bodega") else "no"),
              ("Pet friendly", "sí" if u.get("pet_friendly") else "no")]
    return [{"caracteristica": k, "valor": v} for k, v in campos if v is not None]


async def explorar_nodo(db, tipo: str = "ciudad", eid: str = "CDMX", con_combinaciones: bool = True) -> Dict[str, Any]:
    """Un nodo del árbol: sus hijos (siguiente nivel) + sus datos (cada segmento INDEPENDIENTE) + combinaciones."""
    nombre = eid
    if tipo == "unidad":
        nombre = f"Unidad {eid.split('::')[-1]}"
    elif tipo in ("colonia", "alcaldia"):
        nombre = eid.replace("-", " ").title()
    nodo = {"tipo": tipo, "id": eid, "nombre": nombre}
    hijos = _hijos(tipo, eid)
    ruta = _ruta(tipo, eid)
    geo = _node_geo(tipo, eid)
    segmentos: List[Dict[str, Any]] = []
    combinaciones: List[Dict[str, Any]] = []
    caracteristicas: List[Dict[str, Any]] = []
    if tipo == "unidad":
        caracteristicas = _caracteristicas_unidad(eid)
    else:
        segmentos = await _segmentos_geo(db, geo)
        if con_combinaciones and tipo in ("colonia", "desarrollo", "alcaldia"):
            combinaciones = _combinaciones(geo)
    n_seg = sum(len(s["items"]) for s in segmentos)
    return {
        "nodo": nodo, "ruta": ruta, "hijos": hijos, "segmentos": segmentos,
        "combinaciones": combinaciones, "caracteristicas": caracteristicas,
        "resumen": {"hijos": len(hijos), "dimensiones": len(segmentos), "datos_independientes": n_seg, "fichas_tecnicas": len(combinaciones)},
        "lectura": "cada segmento es un dato independiente (no se juntan valores); el fondo del árbol son las fichas técnicas",
    }
