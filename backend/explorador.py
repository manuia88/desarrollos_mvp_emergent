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
            items.append({"segmento": v["valor"], "oferta": v["oferta"], "demanda": v["demanda"], "gap": v["gap"],
                          "tension": v["tension"], "filtro": {gb: v["valor"]}})   # filtro → drill / acumular
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
            atr.append({"segmento": label, "oferta": con["oferta"], "demanda": con["demanda"], "gap": con["gap"],
                        "tension": con["tension"], "filtro": {fid: con["valor"]}})
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


async def _demanda_perfil(db, filtros: Dict[str, str], geo) -> Dict[str, Any]:
    """PERFIL de quien busca este segmento: cuántos, intención, presupuesto, qué más buscan. La demanda, no anónima."""
    import facet_engine as fe
    import demand_intelligence as di
    cols = fe._geo_cols(geo)
    # 1) cuántos lo buscan (reusa el lado demanda del facet sobre el primer facet del filtro)
    fid, fval = next(iter(filtros.items()))
    try:
        fq = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
        match = next((v for v in fq["relacional"]["por_valor"] if str(v["valor"]) == str(fval)), None)
        n_buscan = match["demanda"] if match else 0
    except Exception:
        n_buscan = 0
    # 2) intención + presupuesto + qué más buscan (de las búsquedas/señales en la geo)
    q = {}
    if cols:
        q["colonias"] = {"$in": list(cols)}
    presu, coam = [], Counter()
    n_busq = 0
    async for s in db.marketplace_searches.find(q, {"_id": 0, "precio_max": 1}):
        n_busq += 1
        if s.get("precio_max"):
            presu.append(s["precio_max"])
    intent = {"vivir": 0, "invertir": 0}
    qsig = {"type": {"$in": ["zone_intent", "intent", "atlax_profile", "ficha_view", "like"]}}
    if cols:
        qsig["colonia"] = {"$in": list(cols)}
    async for s in db.buyer_signals.find(qsig, {"_id": 0, "value": 1, "meta": 1}):
        v = (str(s.get("value") or "") + " " + str((s.get("meta") or {}).get("intent") or "")).lower()
        if "invert" in v:
            intent["invertir"] += 1
        elif "vivir" in v:
            intent["vivir"] += 1
        for a in di._as_feature_list((s.get("meta") or {}).get("amenidades")):
            coam[str(a).lower()] += 1
    import statistics
    tot_i = intent["vivir"] + intent["invertir"]
    return {
        "n_buscan": n_buscan,
        "intencion": ({"invertir": round(100 * intent["invertir"] / tot_i), "vivir": round(100 * intent["vivir"] / tot_i)} if tot_i else None),
        "presupuesto_mediano": (round(statistics.median(presu)) if presu else None),
        "tambien_buscan": [a for a, _ in coam.most_common(5)],
        "nota": "perfil de demanda en la zona (la búsqueda es casi anónima; se reconstruye del comportamiento)",
    }


async def explorar_segmento(db, tipo: str, eid: str, filtros: Dict[str, str], extra: Optional[Dict] = None, top: int = 60) -> Dict[str, Any]:
    """DRILL de un segmento (clic en '2rec'): OFERTA (qué desarrollos/unidades lo cumplen) + DEMANDA (perfil de quién lo
    busca). filtros acumulables: {recamaras:'2rec', terraza:'con terraza', ...}. 'extra' = filtros previos acumulados."""
    import facet_engine as fe
    geo = _node_geo(tipo, eid)
    acumulado = {**(extra or {}), **(filtros or {})}
    # OFERTA — las entidades reales que cumplen el filtro acumulado
    oferta = await fe.facet_list(db, "unidades", filtros=acumulado, geo=geo, limit=top)
    # DEMANDA — el perfil de quién lo busca
    demanda = await _demanda_perfil(db, filtros, geo)
    return {
        "nodo": {"tipo": tipo, "id": eid}, "filtros_acumulados": acumulado,
        "oferta": {"total": oferta["total"], "entidades": oferta["entidades"]},
        "demanda": demanda,
        "tension": {"hay": oferta["total"], "buscan": demanda["n_buscan"], "gap": demanda["n_buscan"] - oferta["total"]},
        "lectura": f"{oferta['total']} unidades cumplen · {demanda['n_buscan']} lo buscan en la zona",
    }


async def oportunidades(db, geo=None, top: int = 15) -> Dict[str, Any]:
    """MODO AUTO — el cubo encuentra solo: barre segmentos clave × colonias y sube las mayores OPORTUNIDADES (más se busca
    de lo que hay) y SOBREOFERTAS. No esperas a buscar; el cubo te trae el hallazgo rankeado."""
    import facet_engine as fe
    from data_developments import DEVELOPMENTS
    colonias = sorted({d.get("colonia_id") for d in DEVELOPMENTS if d.get("colonia_id")}) if not geo else [geo[1]]
    nombres = {d.get("colonia_id"): (d.get("colonia") or d.get("colonia_id")) for d in DEVELOPMENTS}
    hallazgos = []
    for col in colonias:
        g = ("colonia", col)
        for gb, etiqueta in [("recamaras", "tipología"), ("tier_precio", "precio")] + [(a, lbl) for a, _l, lbl in [(x[1], None, x[2]) for x in ATRIBUTOS]]:
            try:
                r = await fe.facet_query(db, "unidades", group_by=gb, geo=g)
            except Exception:
                continue
            for v in r["relacional"]["por_valor"]:
                if str(v["valor"]).startswith("sin "):   # "sin terraza/pet" como oportunidad es ruido — saltar
                    continue
                gap = v["gap"]
                if abs(gap) < 5:
                    continue
                hallazgos.append({"colonia": nombres.get(col, col), "colonia_id": col, "segmento": v["valor"],
                                  "dimension": etiqueta, "oferta": v["oferta"], "demanda": v["demanda"], "gap": gap,
                                  "tipo": "oportunidad" if gap > 0 else "sobreoferta",
                                  "filtro": {gb: v["valor"]},
                                  "lectura": (f"En {nombres.get(col, col)} se busca {v['valor']} mucho más de lo que hay: faltan {gap}."
                                              if gap > 0 else f"En {nombres.get(col, col)} sobra {v['valor']}: {-gap} más de lo que se busca.")})
    hallazgos.sort(key=lambda h: -abs(h["gap"]))
    return {"oportunidades": [h for h in hallazgos if h["tipo"] == "oportunidad"][:top],
            "sobreofertas": [h for h in hallazgos if h["tipo"] == "sobreoferta"][:top],
            "lectura": "el cubo barrió los segmentos y subió dónde la demanda rebasa la oferta (y viceversa), por impacto"}


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
