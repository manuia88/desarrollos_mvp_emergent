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


async def atributos_indicadores(db, geo: Optional[tuple] = None) -> Dict[str, Any]:
    """Cada atributo como INDICADOR: demanda vs oferta + comparativo vs ciudad + uso + fuente + granularidad + dimensión."""
    import facet_engine as fe
    indicadores: List[Dict[str, Any]] = []
    bool_attrs = [("terraza", "Terraza"), ("balcon", "Balcón"), ("roof_garden", "Roof garden"),
                  ("bodega", "Bodega"), ("pet_friendly", "Pet friendly")]
    for fid, nombre in bool_attrs:
        loc = await fe.facet_query(db, "unidades", group_by=fid, geo=geo)
        rel = {r["valor"]: r for r in loc["relacional"]["por_valor"]}
        con = rel.get(f"con {fid}", {})
        of, dm = con.get("oferta", 0), con.get("demanda", 0)
        # comparativo: % de demanda que pide este atributo, local vs ciudad
        dem_tot_local = loc["independiente"]["demanda"]["total"] or 1
        share_local = round(100 * dm / dem_tot_local, 1) if dm else 0.0
        share_ciudad = share_local
        if geo:
            cit = await fe.facet_query(db, "unidades", group_by=fid)
            relc = {r["valor"]: r for r in cit["relacional"]["por_valor"]}
            dmc = relc.get(f"con {fid}", {}).get("demanda", 0)
            share_ciudad = round(100 * dmc / (cit["independiente"]["demanda"]["total"] or 1), 1) if dmc else 0.0
        indicadores.append({
            "nombre": nombre, "valor": dm, "unidad": "buscan", "oferta": of, "demanda": dm, "gap": dm - of,
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
    return {"indicadores": indicadores, "granularidad": _granularidad(geo), "geo": list(geo) if geo else None,
            "lectura": "cada atributo como demanda vs oferta — el gap es la oportunidad; comparado contra la ciudad"}


async def financiero_indicadores(db, geo: Optional[tuple] = None, since_days: int = 365) -> Dict[str, Any]:
    """Cada métrica financiera como INDICADOR con uso + fuente + estado honesto (latente donde el cotizador no se usa)."""
    import demand_intelligence as di
    fin = await di.financial_demand(db, since_days=since_days)
    ind: List[Dict[str, Any]] = []

    def add(nombre, valor, unidad, uso_key, n, fuente="buyer_signals (cotizador/perfilador)", latente=None, extra=None):
        latente = (valor is None) if latente is None else latente
        ind.append({"nombre": nombre, "valor": valor, "unidad": unidad, "comparativo": {"vs_ciudad": None, "señal": "—", "texto": extra or ""},
                    "granularidad": _granularidad(geo), "dimension": "financiero", "uso": _USO_FIN.get(uso_key, ""),
                    "fuente": fuente, "n": n or 0, "confianza": _conf(n or 0),
                    "latente": latente, "razon_latente": ("esperando uso del cotizador/perfilador — captura cableada" if latente else None)})

    intent = fin.get("intent") or {}
    add("Intención vivir vs invertir", f"{intent.get('vivir',0)} vivir / {intent.get('invertir',0)} invertir", "señales", "intent",
        (intent.get("vivir", 0) + intent.get("invertir", 0)), latente=False)
    add("Enganche mediano", fin.get("enganche_mediano"), "MXN", "enganche", fin.get("enganche_n") or fin.get("mensualidad_n"))
    add("Crédito mediano", fin.get("credito_mediano"), "MXN", "credito", fin.get("credito_n") or 0)
    add("Mensualidad mediana", fin.get("mensualidad_mediana"), "MXN", "mensualidad", fin.get("mensualidad_n") or 0)
    add("TIR objetivo (mediana)", fin.get("tir_mediana"), "%", "tir", fin.get("tir_n") or 0)
    add("Cap rate objetivo (mediana)", fin.get("cap_rate_mediano"), "%", "cap_rate", fin.get("cap_rate_n") or 0)
    # rentabilidad por zona (sí hay dato — del score de inversión)
    rz = fin.get("rentabilidad_por_zona") or []
    if rz:
        top = rz[0]
        add(f"Mejor zona por rentabilidad: {top.get('colonia')}", top.get("score"), f"({top.get('tier')})", "rentabilidad_zona",
            len(rz), fuente="score_inversion_engine", latente=False, extra=f"{len(rz)} colonias evaluadas")
    return {"indicadores": ind, "granularidad": _granularidad(geo), "geo": list(geo) if geo else None,
            "lectura": "perfil financiero del comprador — qué trae, qué puede pagar, qué busca de retorno; latente donde el cotizador aún no se usa"}
