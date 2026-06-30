"""MEMORÁNDUM — el reporte grado-institucional auto-generado para una colonia: resumen, oferta, demanda, tensión,
comparables y recomendación, en lenguaje simple y CON FUENTES. No es un motor nuevo: ENSAMBLA lo que ya existe
(entity_atlas, explorador.oportunidades, lookalike) en una historia lista para comité. No inventa: cada sección cita su origen.
"""
from typing import Any, Dict, List, Optional


def _num(v, suf=""):
    if v is None:
        return "s/d"
    if isinstance(v, (int, float)):
        return f"{round(v):,}{suf}"
    return str(v)


async def _narrativa_llm(nombre: str, secciones: list) -> Optional[str]:
    """Narrativa ejecutiva del memorándum redactada por LLM, GROUNDED en las secciones (cero invención: los datos
    van en el prompt). Cierra el lente generative del superadmin (antes texto-por-regla). Fail-soft: sin
    ANTHROPIC_API_KEY o error → None (queda la redacción por reglas, honesta)."""
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        from llm_client import LlmChat, UserMessage
        datos = "\n".join(
            f"- {s['titulo']}: {s.get('texto', '')}"
            + (f" [{'; '.join(s['lista'])}]" if s.get("lista") else "")
            for s in secciones
        )
        system = ("Eres analista inmobiliario institucional. Redacta el memorándum ejecutivo de la colonia usando "
                  "SOLO los datos dados — NO inventes cifras ni hechos. 4-5 frases, tono de comité de inversión, en "
                  "español, y cierra con la jugada recomendada. Si un dato dice 's/d' (sin dato), no lo menciones.")
        chat = LlmChat(api_key=os.environ["ANTHROPIC_API_KEY"], session_id=f"memo_{nombre}",
                       system_message=system).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(UserMessage(text=f"Colonia: {nombre}\nDatos del cubo:\n{datos}"))
        return (resp or "").strip() or None
    except Exception:
        return None


async def generar(db, colonia: str) -> Dict[str, Any]:
    import entity_atlas as ea
    import explorador as ex
    import lookalike as lk
    geo = ("colonia", colonia)
    panel = await ea.entity_panel(db, "colonia", colonia)
    oport = await ex.oportunidades(db, geo=geo, top=5)
    comps = await lk.similares(db, colonia, top=4)
    nombre = panel.get("entidad", {}).get("id", colonia).replace("-", " ").title()

    def _m(lado, mid):
        return next((x for x in panel["temas"].get(lado, []) if x["id"] == mid and not x.get("latente")), None)

    pm2 = _m("oferta", "of.precio_m2"); inv = _m("oferta", "of.inventario_activo"); st = _m("oferta", "of.sell_through")
    vis = _m("demanda", "dm.vistas"); bus = _m("demanda", "dm.busquedas")
    fusion = panel.get("fusion") or {}

    secciones = []
    # 1 · Resumen
    resumen = f"{nombre}: precio/m² ${_num(pm2['valor']) if pm2 else 's/d'}, {_num(inv['valor']) if inv else 's/d'} unidades disponibles, " \
              f"{_num(st['valor']) if st else 's/d'}% vendido. " \
              f"{len(oport.get('oportunidades', []))} oportunidades detectadas."
    secciones.append({"titulo": "Resumen ejecutivo", "texto": resumen, "fuente": "entity_atlas + explorador"})
    # 2 · Oferta
    secciones.append({"titulo": "Oferta", "fuente": "DEVELOPMENTS.units",
                      "datos": [m for m in [pm2, inv, st] if m],
                      "texto": f"Precio/m² ${_num(pm2['valor']) if pm2 else 's/d'}, inventario {_num(inv['valor']) if inv else 's/d'} unidades, {_num(st['valor']) if st else 's/d'}% colocado."})
    # 3 · Demanda
    cond = panel.get("conductual", {})
    perfil = cond.get("perfil_cliente", {})
    secciones.append({"titulo": "Demanda", "fuente": "buyer_signals + marketplace_searches",
                      "datos": [m for m in [vis, bus] if m],
                      "texto": f"{_num(vis['valor']) if vis else 's/d'} vistas, {_num(bus['valor']) if bus else 's/d'} búsquedas. "
                               f"Intención: {perfil.get('intencion', {})}."})
    # 4 · Tensión / oportunidades
    secciones.append({"titulo": "Tensión y oportunidades", "fuente": "explorador.oportunidades",
                      "lista": [o["lectura"] for o in oport.get("oportunidades", [])[:5]],
                      "texto": "Dónde la demanda rebasa la oferta (whitespace = qué construir)."})
    # 5 · Inversión / riesgo (de la fusión institucional)
    inv_score = fusion.get("inversion") or {}
    riesgo = fusion.get("riesgo") or {}
    secciones.append({"titulo": "Inversión y riesgo", "fuente": "zone_intelligence (fusión de motores)",
                      "texto": f"Score de inversión: {inv_score.get('score', 's/d')} ({inv_score.get('tier', '')}). "
                               f"Riesgo: {riesgo.get('letra', 's/d')}. Cap rate Airbnb: {fusion.get('cap_rate_str', 's/d')}%."})
    # 6 · Comparables
    secciones.append({"titulo": "Colonias comparables", "fuente": "lookalike (similitud de perfil de mercado)",
                      "lista": [f"{s['nombre']} ({s['similitud_pct']}% parecido — {', '.join(s['se_parece_en'])})" for s in comps.get("similares", [])[:4]],
                      "texto": "Para pricing y forecast por comparables."})
    # 7 · Recomendación (so-what derivado de la tensión)
    top_op = (oport.get("oportunidades") or [None])[0]
    reco = (f"Prioriza producto que cierre el mayor hueco: {top_op['lectura']}" if top_op
            else "Sin huecos de demanda claros; competir por precio/absorción.")
    secciones.append({"titulo": "Recomendación", "texto": reco, "fuente": "síntesis"})

    narrativa = await _narrativa_llm(nombre, secciones)
    out = {"colonia": colonia, "nombre": nombre, "secciones": secciones,
           "lectura": f"Memorándum de {nombre} — listo para comité, cada sección con su fuente",
           "generado_de": ["entity_atlas", "explorador.oportunidades", "lookalike"],
           "nota": "ensamblado de dato real; las cifras 's/d' (sin dato) se llenan conforme entre volumen"}
    if narrativa:
        out["narrativa_llm"] = narrativa
        out["generado_de"].append("LLM (Claude, grounded en el dato)")
    return out
