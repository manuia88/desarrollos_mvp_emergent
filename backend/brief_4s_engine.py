"""
brief_4s_engine.py — BRIEF DE PRODUCTO auto-generado desde los átomos 4S (cubo → orden de trabajo).

El upgrade que convierte 2,951 átomos en una decisión: para una zona estudiada, junta en UNA hoja
lo que el mercado pide (modelo ganador + producto), dónde está el hueco (bins finos de gap), qué
aguanta pagar (cuota/enganche/descuento), cómo debe verse (arquitectura), qué lo vende (amenidades,
sustentabilidad) y qué lo mata (riesgos). Se despacha al dev por el BUZÓN existente (activacion →
cube_actions) — patrón cubo→brief ya construido, aquí solo se alimenta con dato real.

Superadmin-only. Fail-open: bloques sin átomos se omiten con nota honesta, nunca se inventa.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.brief_4s")

# estudio (facts_4s) → estudio en market_comps_4s (para precio de equilibrio); PA no tiene comps cargados
_COMPS_ALIAS = {"coyoacan": "coyoacan", "periferico": "periferico",
                "insurgentes_antonio_caso": "insurgentes"}

_ZONA_LABEL = {
    "coyoacan": "Av. Universidad / Río Churubusco (Coyoacán-BJ)",
    "insurgentes_antonio_caso": "Insurgentes Centro / Antonio Caso (Tabacalera-San Rafael)",
    "periferico": "Periférico Sur / Av. Del Imán",
    "puente_alvarado": "Puente de Alvarado / Monumento a la Revolución (Tabacalera-Guerrero)",
}


async def _facts_brief(db, estudio: str, tema: str, pregunta: str) -> List[Dict[str, Any]]:
    from market_4s_prior import _facts
    return await _facts(db, estudio, tema, pregunta)


def _top(facts: List[Dict[str, Any]], n: int = 1) -> List[Dict[str, Any]]:
    con_valor = [f for f in facts if isinstance(f.get("valor"), (int, float))]
    con_valor.sort(key=lambda f: -f["valor"])
    return [{"opcion": f["opcion"], "pct": f["valor"], "pagina": f.get("pagina")} for f in con_valor[:n]]


async def _dom(db, estudio: str, tema: str, pregunta: str) -> Optional[Dict[str, Any]]:
    t = _top(await _facts_brief(db, estudio, tema, pregunta), 1)
    return t[0] if t else None


async def _gap_fino_top(db, estudio: str, n: int = 3) -> List[Dict[str, Any]]:
    """Top-N bins de $200k con mayor hueco (por subzona si el estudio las trae)."""
    from market_4s_prior import _facts_estudio
    out: Dict[Optional[str], List[Dict[str, Any]]] = {}
    try:
        async for f in db.facts_4s.find({"estudio": _facts_estudio(estudio),
                                         "tema": "gap_rango_fino", "pregunta": "gap"}, {"_id": 0}):
            if isinstance(f.get("valor"), (int, float)):
                out.setdefault(f.get("subzona"), []).append(f)
    except Exception as e:
        log.warning("[brief_4s] gap fino fail-open: %s", e)
    bloques = []
    for sz, fs in out.items():
        fs.sort(key=lambda f: -f["valor"])
        bloques.append({"subzona": sz, "bins_top": [
            {"rango_mdp": f["opcion"], "hueco_unidades": f["valor"]} for f in fs[:n]]})
    return bloques


async def generar_brief(db, estudio: str) -> Dict[str, Any]:
    """El brief completo de una zona estudiada, armado 100% desde átomos (con página fuente)."""
    # comprador objetivo
    ciclo = await _dom(db, estudio, "perfil", "ciclo_vida_pct")
    hijos = await _dom(db, estudio, "perfil", "con_hijos_pct")
    intencion = _top(await _facts_brief(db, estudio, "perfil", "intencion_pct"), 2)
    vivienda = await _dom(db, estudio, "perfil", "vivienda_actual_pct")
    renta_fmt = await _dom(db, estudio, "busqueda", "renta_formato_pct")

    # producto ganador
    modelos = _top(await _facts_brief(db, estudio, "hipotesis_qc", "modelos_preferencia_pct"), 2)
    modelos = [m for m in modelos if m["opcion"] != "ninguno"]
    dormitorios = await _dom(db, estudio, "producto", "dormitorios_pct")
    banos = await _dom(db, estudio, "producto", "banos_pct")
    metraje = await _dom(db, estudio, "hipotesis_qc", "metraje_pct")
    cocina = await _dom(db, estudio, "producto", "cocina_pct")
    extra = await _dom(db, estudio, "producto", "espacio_adicional_pct")
    balcon = await _dom(db, estudio, "producto", "balcon_pct")

    # dónde está el hueco (bins de $200k)
    gap_fino = await _gap_fino_top(db, estudio)

    # lo que aguanta pagar
    cuota = await _dom(db, estudio, "amenidades", "cuota_dispuesta_pct")
    enganche = await _dom(db, estudio, "esquema_pago", "enganche_pct")
    credito = await _dom(db, estudio, "esquema_pago", "credito_pct")
    tipo_compra = await _dom(db, estudio, "esquema_pago", "tipo_compra_pct")
    descuento = await _dom(db, estudio, "esquema_pago", "descuento_atractivo_pct")
    tolerancia = _top(await _facts_brief(db, estudio, "hipotesis_qc", "tolerancia_mas_8pct_pct"), 3)

    # lo que vende y cómo debe verse
    amenidades = _top(await _facts_brief(db, estudio, "amenidades", "listado_top_pct"), 5)
    # sustentabilidad: tema plano {factor: pct} → la PREGUNTA es el factor (opcion='total')
    verde: List[Dict[str, Any]] = []
    try:
        from market_4s_prior import _facts_estudio
        _vs = []
        async for f in db.facts_4s.find({"estudio": _facts_estudio(estudio),
                                         "tema": "sustentabilidad_si_pct"}, {"_id": 0}):
            if isinstance(f.get("valor"), (int, float)):
                _vs.append(f)
        _vs.sort(key=lambda f: -f["valor"])
        verde = [{"opcion": f["pregunta"], "pct": f["valor"], "pagina": f.get("pagina")} for f in _vs[:3]]
    except Exception as e:
        log.warning("[brief_4s] verde fail-open: %s", e)
    fachada = await _dom(db, estudio, "arquitectura", "fachada_pct")
    estilo = await _dom(db, estudio, "arquitectura", "estilo_pct")

    # riesgos (lo que mata la venta)
    riesgos = _top(await _facts_brief(db, estudio, "percepcion", "desventajas_pct"), 3)
    elevautos_no = await _dom(db, estudio, "estacionamiento", "elevautos_compartido_no_compra_pct")
    advertencias = []
    if elevautos_no and elevautos_no["opcion"] == "si" and elevautos_no["pct"] >= 30:
        advertencias.append(f"Evitar elevautos compartido: {elevautos_no['pct']}% no compraría")
    lo_que_no_gusta = _top(await _facts_brief(db, estudio, "posicionamiento", "que_no_gusto_pct"), 3)

    # precio de equilibrio (si el estudio tiene comparables cargados)
    equilibrio = None
    comps_est = _COMPS_ALIAS.get(estudio)
    if comps_est:
        try:
            from equilibrium_engine import precio_equilibrio
            eq = await precio_equilibrio(db, estudio=comps_est, meses_objetivo=12)
            if eq.get("precio_equilibrio_m2"):
                equilibrio = {"precio_m2_12m": eq["precio_equilibrio_m2"],
                              "elasticidad": eq.get("elasticidad_precio_absorcion"),
                              "n_comparables": eq.get("n_comparables")}
        except Exception as e:
            log.warning("[brief_4s] equilibrio fail-open: %s", e)

    tiene = bool(modelos or dormitorios or gap_fino)
    modelo_txt = modelos[0]["opcion"].replace("_", " ") if modelos else "—"
    lectura = (f"{_ZONA_LABEL.get(estudio, estudio)}: construir {modelo_txt} "
               f"({(dormitorios or {}).get('opcion', '?')} rec dominante"
               f"{', ' + str((metraje or {}).get('opcion', '')).replace('_', '-') + ' m²' if metraje else ''}). "
               f"Hueco principal: {gap_fino[0]['bins_top'][0]['rango_mdp']} mdp "
               f"({gap_fino[0]['bins_top'][0]['hueco_unidades']} unidades)." if tiene and gap_fino else
               "Sin átomos suficientes para armar el brief de esta zona.")

    return {
        "estudio": estudio, "zona": _ZONA_LABEL.get(estudio, estudio),
        "es_estimado": not tiene, "fuente": "4s_granular_2026 (átomos con página fuente)",
        "comprador_objetivo": {"etapa_vida": ciclo, "con_hijos": hijos, "intencion": intencion,
                               "vivienda_actual": vivienda, "renta_formato": renta_fmt},
        "producto": {"modelos_ganadores": modelos, "dormitorios": dormitorios, "banos": banos,
                     "metraje": metraje, "cocina": cocina, "espacio_adicional": extra, "balcon": balcon},
        "hueco_precio": gap_fino,
        "pago": {"cuota_mantenimiento": cuota, "enganche": enganche, "credito": credito,
                 "tipo_compra": tipo_compra, "descuento_que_convierte": descuento,
                 "tolerancia_mas_8pct": tolerancia},
        "amenidades_top": amenidades,
        "sustentabilidad_top": verde,
        "arquitectura": {"fachada": fachada, "estilo": estilo},
        "riesgos": {"desventajas_zona": riesgos, "que_no_gusta_competencia": lo_que_no_gusta,
                    "advertencias": advertencias},
        "precio_equilibrio": equilibrio,
        "lectura": lectura,
    }


async def despachar_brief(db, estudio: str, actor: str = "superadmin") -> Dict[str, Any]:
    """Genera el brief y lo manda al BUZÓN del dev (cube_actions · patrón existente)."""
    brief = await generar_brief(db, estudio)
    if brief["es_estimado"]:
        return {"ok": False, "error": "Sin átomos suficientes para despachar un brief honesto."}
    from activacion import activar
    return await activar(
        db, destino="dev",
        titulo=f"Brief de producto 4S · {brief['zona']}",
        detalle=brief["lectura"],
        colonia=None,
        payload={"tipo": "brief_4s", "brief": brief},
        actor=actor,
    )
