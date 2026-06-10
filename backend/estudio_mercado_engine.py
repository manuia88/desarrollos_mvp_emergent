"""
estudio_mercado_engine — F2.6 · El Estudio de Mercado Vivo (el entregable).
═══════════════════════════════════════════════════════════════════════════════
Auto-genera, en minutos y para cualquier colonia, el estudio de mercado completo que firmas
profesionales cobran carísimo — fusionando los motores F2 que ya construimos:
  • Demanda real  → Grafo del Comprador (F2.1)
  • Demanda potencial → modelo EPRAV (F2.4)
  • Producto recomendado → Generador de Producto (F2.2)
  • Oferta / competencia → inventario vertical de la colonia (DEVELOPMENTS)
  • Zona → atributos (tier, precio, scores) de data_seed
  • Veredicto → síntesis honesta
Reusa todo (cero reinvención), bandas honestas, FAIL-OPEN. Es la versión VIVA del estudio
4S: se regenera solo conforme entra dato. Lo consume dev + superadmin; exportable a PDF (print).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.estudio_mercado")


def _fmt_money(n):
    return f"${round(n/1e6,1)}M" if n else None


async def generar_estudio(db, colonia_id: Optional[str], categoria: str = "media") -> Dict[str, Any]:
    """Fusiona los motores F2 en un estudio de mercado estructurado. FAIL-OPEN."""
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    col = COLONIAS_BY_ID.get(colonia_id) or {}
    name = col.get("name") or (colonia_id or "")

    # 1 · Demanda real (Grafo del Comprador).
    grafo = None
    try:
        from grafo_comprador_engine import build_grafo
        g = await build_grafo(db, colonia_id=colonia_id)
        cols = g.get("colonias") or []
        grafo = cols[0] if cols else {"demanda_total": 0, "segmentos": [], "etiqueta": "Sin Búsquedas Aún"}
    except Exception as e:
        log.warning(f"[estudio] grafo fail-open: {e}")

    # 2 · Demanda potencial (EPRAV).
    demografica = None
    try:
        from demanda_demografica_engine import estimar_demanda
        demografica = await estimar_demanda(db, colonia_id, categoria)
    except Exception as e:
        log.warning(f"[estudio] demografica fail-open: {e}")

    # 3 · Producto recomendado (Generador · mezcla % independiente del tamaño del terreno).
    producto = None
    try:
        from generador_producto_engine import generar_producto
        producto = await generar_producto(db, colonia_id, 1000, categoria)
    except Exception as e:
        log.warning(f"[estudio] generador fail-open: {e}")

    # 4 · Oferta / competencia (inventario vertical de la colonia).
    oferta = {"proyectos": 0, "unidades_disponibles": 0, "precio_desde": None, "precio_hasta": None}
    try:
        from data_developments import DEVELOPMENTS
        nm = name.strip().lower()
        precios = []
        for d in DEVELOPMENTS:
            if str(d.get("colonia") or "").strip().lower() == nm or d.get("colonia_id") == colonia_id:
                oferta["proyectos"] += 1
                oferta["unidades_disponibles"] += int(d.get("units_available") or len(d.get("units") or []) or 0)
                if d.get("price_from"):
                    precios.append(d["price_from"])
                if d.get("price_to"):
                    precios.append(d["price_to"])
        if precios:
            oferta["precio_desde"] = min(precios)
            oferta["precio_hasta"] = max(precios)
    except Exception as e:
        log.warning(f"[estudio] oferta fail-open: {e}")

    # 5 · Zona (atributos).
    zona = {
        "tier": col.get("tier"),
        "precio_m2": col.get("price_m2_num") or col.get("price_m2"),
        "momentum": col.get("momentum"),
        "scores": col.get("scores") or {},
        "alcaldia": col.get("alcaldia"),
    }

    # 6 · Veredicto (síntesis honesta).
    veredicto = []
    dt = (grafo or {}).get("demanda_total", 0)
    gap = (demografica or {}).get("gap_vertical")
    if gap is not None and gap > 0:
        veredicto.append(f"Hay hueco de mercado: ~{gap} unidades verticales/año sin oferta en {name}.")
    elif gap is not None:
        veredicto.append(f"La oferta vertical cubre la demanda potencial de {name} — entrar con diferenciación.")
    if dt > 0 and (grafo or {}).get("segmento_dominante_label"):
        veredicto.append(f"La demanda activa la lidera: {grafo['segmento_dominante_label']}.")
    if producto and producto.get("mezcla"):
        dom = max(producto["mezcla"], key=lambda m: m.get("unidades", 0))
        veredicto.append(f"Producto sugerido: sobre todo {dom['tipologia'].lower()} ({dom['pct']}% de la mezcla).")
    if oferta["proyectos"]:
        veredicto.append(f"Competencia directa: {oferta['proyectos']} proyectos, {oferta['unidades_disponibles']} unidades disponibles.")
    if not veredicto:
        veredicto.append(f"Aún con poco dato en {name}: el estudio se completa solo conforme entra demanda y oferta.")

    es_estimado = (dt < 10)
    return {
        "colonia_id": colonia_id, "colonia": name, "categoria": categoria,
        "secciones": {
            "demanda_real": grafo,
            "demanda_potencial": demografica,
            "producto_recomendado": producto,
            "oferta": oferta,
            "zona": zona,
        },
        "veredicto": veredicto,
        "es_estimado": es_estimado,
        "lectura": ("Estudio preliminar: se afina solo conforme entra dato real."
                    if es_estimado else "Estudio vivo con demanda real en la zona."),
        "fuente": "Estudio de Mercado Vivo DMX · fusiona Grafo + EPRAV + Generador + oferta + zona",
    }
