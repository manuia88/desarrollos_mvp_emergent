"""TERMINAL · INDICADORES — convierte los volcados crudos (atributos, financiero) en INDICADORES con VALOR: cada número
trae uso (¿para qué?), fuente (procedencia), comparativo (vs ciudad — ¿alto o bajo?), granularidad (nano→macro) y
dimensión. Nada de jerga de motores. Reusa facet_engine (oferta/demanda) y financial_demand. No inventa: latente donde no
hay dato, con su razón.

Un INDICADOR = {nombre, valor, unidad, oferta?, demanda?, comparativo:{vs_ciudad, señal, texto}, granularidad, dimension,
uso, fuente, n, confianza, latente?}.
"""
from typing import Any, Dict, List, Optional


def _conf(n: int) -> str:
    return "alta" if n >= 30 else "media" if n >= 10 else "baja"


def _signal(local: Optional[float], ciudad: Optional[float]) -> Dict[str, Any]:
    if local is None or ciudad is None:
        return {"vs_ciudad": None, "señal": "—", "texto": "sin comparativo (selecciona una zona)"}
    diff = round(local - ciudad, 1)
    señal = "alta" if diff > 0 else "baja" if diff < 0 else "igual"
    txt = f"{'+' if diff > 0 else ''}{diff} vs ciudad" if diff else "igual que la ciudad"
    return {"vs_ciudad": diff, "señal": señal, "texto": txt}


# uso (qué te dice / para qué) por atributo — lenguaje humano, no motores
_USO_ATTR = {
    "terraza": "Cuánta gente busca terraza frente a cuánta oferta hay. Si la demanda supera la oferta, es palanca de precio.",
    "balcon": "Apetito por balcón vs disponibilidad. Gap positivo = atributo subofertado que justifica premium.",
    "roof_garden": "Demanda de roof garden. Alta demanda con poca oferta señala un diferenciador escaso.",
    "bodega": "Cuánto pesa la bodega en la decisión. Útil para definir mix y precio de extras.",
    "pet_friendly": "Demanda pet-friendly. Marca segmento (jóvenes/familias) y restricciones de reglamento.",
    "vista": "Preferencia interior vs exterior. La vista exterior suele sostener premium de m².",
    "recamaras": "Tipología más buscada vs la que hay. Define qué prototipo conviene construir.",
    "tier_precio": "En qué rango de precio se concentra la demanda vs la oferta. El gap marca dónde falta producto.",
}
_USO_FIN = {
    "presupuesto": "Dónde se concentra el poder de compra. Define el rango de precio que más colocas.",
    "enganche": "Cuánto recurso propio traen. Calibra esquemas de pago y enganche mínimo viable.",
    "credito": "Capacidad de crédito declarada. Marca el techo de precio financiable del segmento.",
    "plazo": "Años de crédito objetivo. Afecta mensualidad y a qué banco/esquema empujar.",
    "mensualidad": "Cuánto pueden pagar al mes. El límite real de accesibilidad del comprador.",
    "intent": "Vivir vs invertir. Cambia el argumento de venta y el tipo de producto.",
    "tir": "Retorno objetivo del inversionista. Filtra qué unidades le hacen sentido.",
    "cap_rate": "Rentabilidad de renta esperada. Compara contra la real de la zona (AirROI).",
    "rentabilidad_zona": "Qué colonias dan mejor retorno. Orienta dónde recomendar invertir.",
}


def _granularidad(geo: Optional[tuple]) -> str:
    if not geo:
        return "ciudad (CDMX)"
    nivel, val = geo
    return f"{nivel}: {val}"


async def _attr_contexto(db, fid: str, geo: Optional[tuple]) -> Dict[str, Any]:
    """CONTEXTO de un atributo: en qué ZONAS y qué PROYECTOS lo tienen, y QUIÉN lo busca (vivir/invertir)."""
    from data_developments import DEVELOPMENTS
    from collections import Counter
    import facet_engine as fe
    zonas, devs, dev_ids = Counter(), [], []
    for d in DEVELOPMENTS:
        if geo and not fe._geo_match(d, geo):
            continue
        if any(u.get(fid) for u in (d.get("units") or [])):
            zonas[d.get("colonia") or d.get("colonia_id")] += sum(1 for u in (d.get("units") or []) if u.get(fid))
            devs.append(d.get("name") or d.get("id")); dev_ids.append(d.get("id"))
    quien = {"vivir": 0, "invertir": 0}
    if dev_ids:
        async for s in db.buyer_signals.find({"entity_id": {"$in": dev_ids}}, {"_id": 0, "value": 1, "meta": 1, "type": 1}):
            v = (str(s.get("value") or "") + " " + str((s.get("meta") or {}).get("intent") or "")).lower()
            if "invert" in v:
                quien["invertir"] += 1
            elif "vivir" in v:
                quien["vivir"] += 1
    tot_q = quien["vivir"] + quien["invertir"]
    return {"donde": [z for z, _ in zonas.most_common(4)], "desarrollos": devs[:5],
            "quien": ({"invertir": round(100 * quien["invertir"] / tot_q), "vivir": round(100 * quien["vivir"] / tot_q)} if tot_q else None)}


async def atributos_indicadores(db, geo: Optional[tuple] = None) -> Dict[str, Any]:
    """Cada atributo como HALLAZGO legible: pregunta→respuesta + quién/dónde/proyectos + comparativo + fuente."""
    import facet_engine as fe
    zona_txt = f" en {geo[1].replace('-', ' ').title()}" if geo else " en la ciudad"
    indicadores: List[Dict[str, Any]] = []
    bool_attrs = [("terraza", "Terraza"), ("balcon", "Balcón"), ("roof_garden", "Roof garden"),
                  ("bodega", "Bodega"), ("pet_friendly", "Pet friendly")]
    for fid, nombre in bool_attrs:
        loc = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
        rel = {r["valor"]: r for r in loc["relacional"]["por_valor"]}
        con = rel.get(f"con {fid}", {})
        of, dm = con.get("oferta", 0), con.get("demanda", 0)
        dem_tot_local = loc["independiente"]["demanda"]["total"] or 1
        share_local = round(100 * dm / dem_tot_local, 1) if dm else 0.0
        share_ciudad = share_local
        if geo:
            cit = await fe.facet_query(db, "unidades", group_by=fid)
            relc = {r["valor"]: r for r in cit["relacional"]["por_valor"]}
            dmc = relc.get(f"con {fid}", {}).get("demanda", 0)
            share_ciudad = round(100 * dmc / (cit["independiente"]["demanda"]["total"] or 1), 1) if dmc else 0.0
        ctx = await _attr_contexto(db, fid, geo)
        gap = dm - of
        if gap > 0:
            respuesta = f"{dm} compradores buscan {nombre.lower()}, pero solo hay {of} departamentos con {nombre.lower()} — faltan {gap}."
            señal = "falta"
        elif gap < 0:
            respuesta = f"Hay {of} departamentos con {nombre.lower()}, pero solo {dm} la buscan — sobran {-gap}."
            señal = "sobra"
        else:
            respuesta = f"Hay {of} con {nombre.lower()} y {dm} que la buscan — están parejos." if (of or dm) else f"Aún no hay datos de {nombre.lower()}{zona_txt}."
            señal = "parejo"
        indicadores.append({
            "nombre": nombre, "pregunta": f"¿Cuánta gente busca {nombre.lower()}{zona_txt}?", "respuesta": respuesta, "señal": señal,
            "valor": dm, "unidad": "buscan", "oferta": of, "demanda": dm, "gap": gap,
            "donde": ctx["donde"], "desarrollos": ctx["desarrollos"], "quien": ctx["quien"],
            "comparativo": _signal(share_local, share_ciudad if geo else None),
            "granularidad": _granularidad(geo), "dimension": f"atributo · {fid}",
            "uso": _USO_ATTR.get(fid, "Demanda vs oferta del atributo."),
            "fuente": "buyer_signals + marketplace_searches + DEVELOPMENTS.units",
            "n": dm + of, "confianza": _conf(dm + of), "latente": (dm + of) == 0,
        })
    # tipología y tier como indicadores de distribución
    for fid, nombre, dim in [("recamaras", "Tipología más buscada", "tipología"), ("tier_precio", "Rango de precio", "tier")]:
        loc = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
        top = loc["relacional"]["por_valor"][:1]
        if top:
            t = top[0]
            indicadores.append({
                "nombre": nombre, "valor": t["valor"], "unidad": "(top)", "oferta": t["oferta"], "demanda": t["demanda"],
                "gap": t["demanda"] - t["oferta"], "comparativo": {"vs_ciudad": None, "señal": t["tension"], "texto": t["tension"]},
                "granularidad": _granularidad(geo), "dimension": f"{dim} · {fid}",
                "uso": _USO_ATTR.get(fid, "Distribución de demanda vs oferta."),
                "fuente": "marketplace_searches + DEVELOPMENTS.units",
                "n": t["oferta"] + t["demanda"], "confianza": _conf(t["oferta"] + t["demanda"]), "latente": False,
            })
    for it in indicadores:
        it["accion"] = _accion_attr(it)
    return {"indicadores": indicadores, "granularidad": _granularidad(geo), "geo": list(geo) if geo else None,
            "titulo": f"Qué buscan los compradores{zona_txt}", "resumen": _resumen(indicadores, "atributos"), "glosario": _GLOSARIO,
            "lectura": "cada atributo como demanda vs oferta — el gap es la oportunidad; comparado contra la ciudad"}


async def financiero_indicadores(db, geo: Optional[tuple] = None, since_days: int = 365) -> Dict[str, Any]:
    """Cada métrica financiera como HALLAZGO legible: pregunta→respuesta + benchmark (cuánto es mucho) + estado honesto."""
    import demand_intelligence as di
    import grid_engine as ge
    fin = await di.financial_demand(db, since_days=since_days)
    zona_txt = f" en {geo[1].replace('-', ' ').title()}" if geo else " en la ciudad"
    # precio típico de la zona — para responder '¿cuánto es un enganche?' como % del precio
    pc = await ge.compute(db, "of.precio_absoluto", {"geo": geo} if geo else {})
    precio_tipico = pc.get("valor")
    ind: List[Dict[str, Any]] = []

    def add(nombre, pregunta, valor, unidad, uso_key, n, respuesta=None, fuente="buyer_signals (cotizador/perfilador)", latente=None, comp_texto=""):
        latente = (valor is None) if latente is None else latente
        if respuesta is None:
            respuesta = (f"Aún pocos datos del cotizador (n={n or 0}). Cuando se use, dirá: {_USO_FIN.get(uso_key,'')}"
                         if latente else f"{nombre}: {valor}")
        ind.append({"nombre": nombre, "pregunta": pregunta, "respuesta": respuesta, "valor": valor, "unidad": unidad,
                    "comparativo": {"vs_ciudad": None, "señal": "—", "texto": comp_texto},
                    "granularidad": _granularidad(geo), "dimension": "financiero", "uso": _USO_FIN.get(uso_key, ""),
                    "fuente": fuente, "n": n or 0, "confianza": _conf(n or 0),
                    "latente": latente, "razon_latente": ("esperando uso del cotizador/perfilador — captura cableada" if latente else None)})

    intent = fin.get("intent") or {}
    iv, ii = intent.get("vivir", 0), intent.get("invertir", 0)
    add("¿Vivir o invertir?", f"¿Para qué compran{zona_txt}?", f"{iv} vivir / {ii} invertir", "señales", "intent",
        iv + ii, respuesta=(f"De {iv+ii} compradores, {round(100*ii/max(iv+ii,1))}% quiere invertir y {round(100*iv/max(iv+ii,1))}% vivir." if (iv+ii) else "Aún sin señales de intención."), latente=(iv + ii) == 0)
    eng = fin.get("enganche_mediano")
    eng_n = fin.get("enganche_n") or fin.get("mensualidad_n") or 0
    if eng and precio_tipico:
        pct = round(100 * eng / precio_tipico)
        resp = f"El comprador típico{zona_txt} aparta ${round(eng/1e6,1)}M de enganche — ≈{pct}% del precio de un depa (${round(precio_tipico/1e6,1)}M)."
        add("¿Cuánto enganche traen?", f"¿Con cuánto apartan{zona_txt}?", eng, "MXN", "enganche", eng_n, respuesta=resp, latente=False, comp_texto=f"≈{pct}% del precio")
    else:
        add("¿Cuánto enganche traen?", f"¿Con cuánto apartan{zona_txt}?", eng, "MXN", "enganche", eng_n)
    add("¿Cuánto crédito pueden tomar?", f"¿Cuánto financian{zona_txt}?", fin.get("credito_mediano"), "MXN", "credito", fin.get("credito_n") or 0)
    add("¿Cuánto pagan al mes?", f"¿Qué mensualidad aguantan{zona_txt}?", fin.get("mensualidad_mediana"), "MXN", "mensualidad", fin.get("mensualidad_n") or 0)
    add("¿Qué retorno buscan?", f"¿Qué TIR esperan los inversionistas{zona_txt}?", fin.get("tir_mediana"), "%", "tir", fin.get("tir_n") or 0)
    add("¿Qué renta esperan?", f"¿Qué cap rate buscan{zona_txt}?", fin.get("cap_rate_mediano"), "%", "cap_rate", fin.get("cap_rate_n") or 0)
    # honesto: banco y tipo de crédito NO se capturan aún — decirlo, no esconderlo
    ind.append({"nombre": "Banco y tipo de crédito", "pregunta": "¿Qué banco y crédito usan?", "valor": None, "unidad": "",
                "respuesta": "Aún no se captura. El comprador no declara banco ni tipo de crédito (Infonavit/bancario/contado) en el cotizador. Se activa cuando se agregue ese campo.",
                "comparativo": {"vs_ciudad": None, "señal": "—", "texto": ""}, "granularidad": _granularidad(geo),
                "dimension": "financiero", "uso": "Qué banco y producto de crédito usa el comprador — para dirigir la oferta de financiamiento.",
                "fuente": "no capturado", "n": 0, "confianza": "baja", "latente": True,
                "razon_latente": "falta el campo banco/tipo-de-crédito en el cotizador"})
    # rentabilidad por zona (sí hay dato — del score de inversión)
    rz = fin.get("rentabilidad_por_zona") or []
    if rz:
        top = rz[0]
        add(f"Mejor zona para invertir: {top.get('colonia')}", "¿Dónde rinde más la inversión?", top.get("score"), f"pts ({top.get('tier')})",
            "rentabilidad_zona", len(rz), respuesta=f"De {len(rz)} colonias, {top.get('colonia')} tiene la mejor calificación de rentabilidad ({top.get('score')} pts, {top.get('tier')}).",
            fuente="score_inversion_engine", latente=False)
    for it in ind:
        it["accion"] = _accion_fin(it)
    return {"indicadores": ind, "granularidad": _granularidad(geo), "geo": list(geo) if geo else None,
            "titulo": f"El dinero del comprador{zona_txt}", "resumen": _resumen(ind, "financiero"), "glosario": _GLOSARIO,
            "lectura": "qué trae el comprador, cuánto puede pagar y qué retorno busca — en lenguaje simple"}


# ── glosario (definiciones simples para quien no sabe del tema) ──────────────────
_GLOSARIO = {
    "enganche": "El dinero que pones de entrada al comprar (lo que no financia el banco).",
    "crédito": "El dinero que te presta el banco para pagar el resto.",
    "mensualidad": "Lo que pagas cada mes por el crédito.",
    "TIR": "Qué tan bueno es el retorno de una inversión, en % al año.",
    "cap rate": "La renta anual como % del precio del inmueble (qué tanto rinde rentarlo).",
    "absorción": "Qué tan rápido se vende: unidades vendidas por mes.",
    "sell-through": "Qué % del total de departamentos ya se vendió.",
    "premium": "Cuánto más caro se paga por una característica (ej. vista o terraza).",
    "gap": "La diferencia entre lo que se busca y lo que hay disponible.",
}


def _accion_attr(it: dict) -> str:
    g = it.get("gap", 0)
    n = it["nombre"].lower()
    if g > 0:
        return f"→ Incluye {n}: se busca más de lo que hay. Es palanca de precio."
    if g < 0:
        return f"→ Ya hay de sobra; {n} no diferencia aquí. No pagues de más por ofrecerla."
    return "→ Vigila: oferta y demanda están parejas."


def _accion_fin(it: dict) -> str:
    if it.get("latente"):
        return "→ Aún sin dato suficiente; impúlsalo capturando uso del cotizador."
    nom = (it.get("nombre") or "").lower()
    if "enganche" in nom:
        return "→ Calibra el enganche mínimo de tu esquema a este nivel."
    if "invertir" in nom or "vivir" in nom:
        return "→ Ajusta el argumento de venta a quién predomina (vivir vs invertir)."
    if "invierte" in nom or "rentab" in nom:
        return "→ Prioriza recomendar esta zona a inversionistas."
    return "→ Úsalo para fijar precio y esquema de pago."


def _resumen(indicadores: list, tema: str) -> list:
    """Lo más importante primero: 2-3 hallazgos ordenados por impacto, en una frase."""
    con_dato = [i for i in indicadores if not i.get("latente")]
    if tema == "atributos":
        con_dato.sort(key=lambda i: -abs(i.get("gap") or 0))
    out = []
    for i in con_dato[:3]:
        out.append({"titulo": i.get("nombre"), "frase": i.get("respuesta"), "señal": i.get("señal") or "info",
                    "accion": i.get("accion")})
    return out
