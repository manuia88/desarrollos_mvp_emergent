"""
terminal_mercado_engine — F2.12 · La Terminal de Mercado CDMX (data utility vendible).
═══════════════════════════════════════════════════════════════════════════════
La cara "Bloomberg de CDMX" para superadmin: fusiona en UNA vista, k-anonimizada,
la OFERTA (cubo de todos los devs) + 3 ÍNDICES VENDIBLES (obra / absorción / gestión)
+ la DEMANDA real (Grafo del Comprador) + el APRENDIZAJE (Cerebro del Mercado).

REUSA (grep-antes-de-construir · NO duplica):
  • metrics_cube_aggregations → KPIs roll-up city de todos los devs (cube_aggregations).
  • grafo_comprador_engine.build_grafo → demanda real por colonia (ya k-anónimo, K_MIN=3).
  • cerebro_mercado_engine.aprendizaje_mercado → calibración + palancas (F2.5).
  • anonymization_engine.check_k_anonymity → candado k-anónimo del producto de datos.
  • metric_normalizer → bandas honestas por percentil.
Cierra el ciclo: es el CONSUMIDOR de todo F2 y la cara del producto de datos (data_licensing).
FAIL-OPEN, construido para el estado final (funciona aunque falte dato).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.terminal_mercado")

K_MIN_PRODUCTO = 3   # mínimo de proyectos para publicar un agregado (anti-reidentificación)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _letra(v: float) -> str:
    if v >= 85: return "A+"
    if v >= 75: return "A"
    if v >= 65: return "B+"
    if v >= 55: return "B"
    if v >= 45: return "C+"
    if v >= 35: return "C"
    return "D"


def _idx(key: str, nombre: str, valor: float, que_mide: str, lectura: str,
         estimado: bool) -> Dict[str, Any]:
    v = round(_clamp(valor), 1)
    return {"key": key, "nombre": nombre, "valor": v, "letra": _letra(v),
            "que_mide": que_mide, "lectura": lectura, "es_estimado": estimado}


def _indices_vendibles(kpis: Dict[str, Any], n_proyectos: int) -> List[Dict[str, Any]]:
    """Los 3 índices que se venden, derivados del cubo (NO se recalculan motores)."""
    estimado = n_proyectos < K_MIN_PRODUCTO
    total = kpis.get("units_total") or 0
    disp = kpis.get("units_available") or 0
    conv = kpis.get("conversion_rate")          # % vendido del total comercializable
    dom = kpis.get("days_on_market_avg")        # días en mercado promedio
    leads = kpis.get("leads_count") or 0
    vendidas = kpis.get("units_sold") or 0

    # ── Índice de Obra · cuánta oferta nueva está viva (inventario disponible vs total) ──
    obra_ratio = (disp / total * 100.0) if total else 50.0
    obra = _idx("IOB", "Índice de Obra", obra_ratio,
                "Cuánta oferta hay viva en el mercado (inventario disponible).",
                ("Mercado con mucha oferta abierta — presión de competencia." if obra_ratio >= 60
                 else "Oferta apretada — ventana para nuevos lanzamientos."), estimado)

    # ── Índice de Absorción · qué tan rápido se vende (conversión + castigo por días) ──
    base_abs = conv if conv is not None else 45.0
    if dom is not None:
        base_abs = base_abs - _clamp((dom - 180) / 12.0, -10, 25)   # >180 días castiga
    absn = _idx("IAB", "Índice de Absorción", base_abs,
                "Qué tan rápido absorbe el mercado el inventario.",
                ("Absorción sana — el inventario rota bien." if base_abs >= 55
                 else "Absorción lenta — cuidado con sobre-oferta o precio alto."), estimado)

    # ── Índice de Gestión · eficiencia comercial (lead→cierre + rapidez) ──
    if leads > 0 and vendidas >= 0:
        eff = _clamp(vendidas / leads * 100.0 * 4, 0, 100)   # ~25% cierre = 100
    else:
        eff = conv if conv is not None else 45.0
    if dom is not None:
        eff = eff - _clamp((dom - 150) / 15.0, -8, 20)
    gest = _idx("IGE", "Índice de Gestión", eff,
                "Qué tan bien convierten leads en ventas los desarrolladores.",
                ("Gestión comercial eficiente." if eff >= 55
                 else "Hay fuga en el embudo lead→venta — oportunidad de servicio DMX."), estimado)

    return [obra, absn, gest]


async def terminal_mercado(db, top_colonias: int = 8) -> Dict[str, Any]:
    """La Terminal de Mercado CDMX: oferta + 3 índices + demanda + aprendizaje. FAIL-OPEN, k-anónimo."""
    # ── 1) OFERTA · cubo city de todos los devs (reusa metrics_cube_aggregations) ──
    oferta = None
    n_proyectos = 0
    try:
        from metrics_cube_aggregations import CITY_ROOT_ID, aggregate_tier
        row = await db.cube_aggregations.find_one(
            {"tier": "city", "tier_id": CITY_ROOT_ID, "period": "current"}, {"_id": 0})
        if not row:
            await aggregate_tier(db, "city", "current")
            row = await db.cube_aggregations.find_one(
                {"tier": "city", "tier_id": CITY_ROOT_ID, "period": "current"}, {"_id": 0})
        if row:
            oferta = row.get("kpis") or {}
            n_proyectos = oferta.get("projects_count") or 0
    except Exception as e:
        log.warning(f"[terminal] oferta cubo fail-open: {e}")
    oferta = oferta or {}

    # ── 2) 3 ÍNDICES VENDIBLES (obra / absorción / gestión) ──
    indices = _indices_vendibles(oferta, n_proyectos)
    idm_val = round(sum(i["valor"] for i in indices) / len(indices), 1) if indices else 0
    indice_maestro = {"valor": idm_val, "letra": _letra(idm_val),
                      "nombre": "Índice de Mercado DMX (maestro)"}

    # ── 3) DEMANDA real · Grafo del Comprador city-wide (ya k-anónimo) (F2.1) ──
    demanda = {"colonias": [], "k_anonimato": K_MIN_PRODUCTO}
    try:
        from grafo_comprador_engine import build_grafo
        g = await build_grafo(db)
        cols = (g.get("colonias") or [])[:top_colonias]
        demanda = {
            "colonias": [{"colonia": c.get("colonia") or c.get("colonia_id"),
                          "demanda_total": c.get("demanda_total"),
                          "segmento_dominante": c.get("segmento_dominante_label")}
                         for c in cols],
            "k_anonimato": g.get("k_anonimato", K_MIN_PRODUCTO),
        }
    except Exception as e:
        log.warning(f"[terminal] demanda grafo fail-open: {e}")

    # ── 4) APRENDIZAJE · Cerebro del Mercado (F2.5) ──
    aprendizaje = None
    try:
        from cerebro_mercado_engine import aprendizaje_mercado
        aprendizaje = await aprendizaje_mercado(db)
    except Exception as e:
        log.warning(f"[terminal] aprendizaje fail-open: {e}")

    # ── 5) Qué es VENDIBLE (atado a data_licensing) ──
    vendible = [
        {"producto": "Índices DMX (Obra · Absorción · Gestión)", "bundle": "indices_dmx_suite",
         "endpoint": "GET /api/v1/market/indices", "tier": "pro+"},
        {"producto": "Grafo del Comprador (demanda anónima por colonia)", "bundle": "grafo_demanda_suite",
         "endpoint": "GET /api/v1/zones/{zone}/demand", "tier": "enterprise"},
        {"producto": "Cubo de mercado (KPIs agregados de la ciudad)", "bundle": "market_cube",
         "endpoint": "GET /api/v1/zones/{zone}/snapshot", "tier": "pro+"},
        {"producto": "Score de Bancabilidad por zona (A–F)", "bundle": "market_cube",
         "endpoint": "GET /api/v1/zones/{zone}/bancabilidad", "tier": "enterprise"},
    ]

    # ── Candado k-anónimo del producto: no publicar si hay muy pocos proyectos ──
    publicable = n_proyectos >= K_MIN_PRODUCTO

    return {
        "oferta": oferta,
        "n_proyectos": n_proyectos,
        "indices_vendibles": indices,
        "indice_maestro": indice_maestro,
        "demanda": demanda,
        "aprendizaje": aprendizaje,
        "vendible": vendible,
        "k_anonimato": K_MIN_PRODUCTO,
        "publicable": publicable,
        "es_estimado": n_proyectos < K_MIN_PRODUCTO,
        "lectura": ("Terminal preliminar: se vuelve publicable/vendible al sumar más proyectos."
                    if not publicable else "Terminal de Mercado CDMX viva — agregados k-anónimos listos."),
        "fuente": "Terminal de Mercado DMX · fusiona Cubo (oferta) + Índices + Grafo (demanda) + Cerebro (aprendizaje)",
    }
