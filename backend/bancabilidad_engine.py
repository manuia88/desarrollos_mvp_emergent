"""
bancabilidad_engine — F5.1 · Score de Bancabilidad (qué tan financiable es un proyecto).
═══════════════════════════════════════════════════════════════════════════════
El diferenciador de F5 (Data Utility): una calificación A–F por proyecto que un banco/fondo
puede usar para decidir financiamiento. Cruza, sin inventar dato:
  • Absorción real (cuánto se ha vendido) — data_developments + is_sold canónico.
  • Posición de zona (zone_score del baseline · o 100−riesgo) — investment_simulator / risk_score_engine.
  • Probabilidad de venta aprendida (lifts del Cerebro por nº de recámaras, ponderada por el
    inventario del proyecto) — cerebro_mercado_engine.lifts_por_factor (F4) · IA-first.
REUSA (grep-antes-de-construir): is_sold · get_colonia_baseline · risk_score_engine · lifts_por_factor.
FAIL-OPEN. Bandas honestas. Cierra ciclo: consume los índices/lifts que el resto de F2–F4 produce.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.bancabilidad")

_PESOS = {"absorcion": 0.45, "zona": 0.30, "prob_venta": 0.25}


def _letra(v: float) -> str:
    if v >= 85: return "A+"
    if v >= 75: return "A"
    if v >= 65: return "B+"
    if v >= 55: return "B"
    if v >= 45: return "C+"
    if v >= 35: return "C"
    return "D"


def _banda(v: float):
    if v >= 75: return ("muy_alta", "Muy Financiable", "verde")
    if v >= 60: return ("alta", "Financiable", "verde")
    if v >= 45: return ("media", "Financiable con Condiciones", "ambar")
    return ("baja", "Difícil de Financiar", "rojo")


async def _prob_venta_esperada(db, dev: dict) -> Optional[float]:
    """Prob. de venta esperada del inventario, ponderada por su mezcla de recámaras (lifts del Cerebro)."""
    try:
        from cerebro_mercado_engine import lifts_por_factor
        from data_developments import is_sold  # noqa
        lf = await lifts_por_factor(db, "recamaras")
        if not lf.get("suficiente_dato"):
            return None
        rate = {}
        for o in (lf.get("opciones") or []):
            try:
                rate[int(str(o["valor"]).split()[0])] = o["vendido_pct"]
            except (ValueError, IndexError, KeyError):
                pass
        units = dev.get("units") or []
        vals = [rate.get(u.get("bedrooms")) for u in units if rate.get(u.get("bedrooms")) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None
    except Exception as e:
        log.warning(f"[bancabilidad] prob_venta fail-open: {e}")
        return None


async def _zona_score(db, colonia_id: Optional[str]) -> Optional[float]:
    if not colonia_id:
        return None
    try:
        from investment_simulator_engine import get_colonia_baseline
        base = await get_colonia_baseline(db, colonia_id)
        zs = base.get("zone_score")
        if isinstance(zs, (int, float)) and zs > 0:   # 0 = sin computar → no penalizar (honesto)
            return float(zs)
    except Exception:
        pass
    try:
        from risk_score_engine import compute_risk_score_v2
        r = await compute_risk_score_v2(db, colonia_id)
        if r.get("available") and isinstance(r.get("score_numeric"), (int, float)):
            return float(max(0.0, 100.0 - r["score_numeric"]))   # menos riesgo = más bancable
    except Exception:
        pass
    return None


async def score_bancabilidad(db, dev: dict) -> Dict[str, Any]:
    """Score A–F de bancabilidad de UN proyecto. FAIL-OPEN, honesto si falta dato."""
    from data_developments import is_sold
    units = dev.get("units") or []
    total = len(units)
    sold = sum(1 for u in units if is_sold(u.get("status")))
    colonia_id = dev.get("colonia_id") or dev.get("colonia_slug") or (dev.get("colonia") or "")

    absorcion = round(sold / total * 100, 1) if total else None
    zona = await _zona_score(db, colonia_id)
    prob = await _prob_venta_esperada(db, dev)

    comp = {"absorcion": absorcion, "zona": zona, "prob_venta": prob}
    disponibles = {k: v for k, v in comp.items() if v is not None}
    if not disponibles:
        return {"dev_id": dev.get("id"), "nombre": dev.get("name"), "colonia": dev.get("colonia"),
                "disponible": False, "lectura": "Aún sin dato suficiente para calificar bancabilidad."}

    peso_disp = sum(_PESOS[k] for k in disponibles)
    score = round(sum(disponibles[k] * _PESOS[k] for k in disponibles) / peso_disp, 1)
    nivel, etiqueta, color = _banda(score)

    # Qué sube tu bancabilidad (la palanca más floja).
    recos: List[str] = []
    if absorcion is not None and absorcion < 50:
        recos.append("Acelera la absorción: la velocidad de venta es lo que más pesa para un banco.")
    if zona is not None and zona < 55:
        recos.append("Refuerza el argumento de zona (plusvalía/servicios) — pesa en el riesgo percibido.")
    if prob is not None and prob < 50:
        recos.append("Ajusta la mezcla a lo que más se vende (ver 'Qué Construir Aquí') para subir la venta esperada.")
    if not recos:
        recos.append("Perfil sólido — mantén el ritmo de venta y documenta la zona para el banco.")

    # P0.11 · honestidad: hoy el catálogo es seed (md5), no ventas reales → etiqueta honesta y data-driven.
    from data_doctrine import has_real_sales
    real = await has_real_sales(db)
    fuente = ("Score de Bancabilidad DMX · absorción real + posición de zona + venta esperada aprendida"
              if real else
              "Score de Bancabilidad DMX (DEMO · catálogo de ejemplo, aún sin ventas reales) · "
              "absorción del catálogo + zona + venta esperada")
    return {
        "dev_id": dev.get("id"), "nombre": dev.get("name"), "colonia": dev.get("colonia"),
        "disponible": True,
        "bancabilidad": score, "letra": _letra(score),
        "nivel": nivel, "etiqueta": etiqueta, "color": color,
        "componentes": {
            "absorcion_pct": absorcion, "posicion_zona": round(zona, 1) if zona is not None else None,
            "prob_venta_esperada_pct": prob,
        },
        "unidades": {"total": total, "vendidas": sold},
        "pesos": {k: round(v * 100) for k, v in _PESOS.items()},
        "recomendaciones": recos,
        "es_estimado": prob is None or zona is None,
        "data_basis": "real" if real else "demo",   # la UI muestra badge "datos de ejemplo" si demo
        "fuente": fuente,
    }


async def portfolio_bancabilidad(db, dev_ids: List[str]) -> Dict[str, Any]:
    """Bancabilidad de los proyectos del dev logueado. FAIL-OPEN."""
    from data_developments import DEVELOPMENTS
    out = []
    for d in DEVELOPMENTS:
        if d.get("id") in dev_ids:
            out.append(await score_bancabilidad(db, d))
    out = [o for o in out if o.get("disponible")]
    out.sort(key=lambda x: -x.get("bancabilidad", 0))
    prom = round(sum(o["bancabilidad"] for o in out) / len(out), 1) if out else None
    return {"proyectos": out, "promedio": prom, "n": len(out)}


async def bancabilidad_por_zona(db, colonia_id: str) -> Dict[str, Any]:
    """Bancabilidad AGREGADA de una colonia (promedio de proyectos, sin nombres) — para la API de datos.
    Producto anónimo: no expone proyectos individuales. FAIL-OPEN."""
    from data_developments import DEVELOPMENTS
    s = str(colonia_id).strip().lower()
    scores = []
    for d in DEVELOPMENTS:
        cid = str(d.get("colonia_id") or d.get("colonia") or "").strip().lower()
        cname = str(d.get("colonia") or "").strip().lower()
        if s in (cid, cname):
            r = await score_bancabilidad(db, d)
            if r.get("disponible"):
                scores.append(r["bancabilidad"])
    if not scores:
        return {"colonia_id": colonia_id, "disponible": False,
                "lectura": "Sin proyectos con dato suficiente en esta zona."}
    prom = round(sum(scores) / len(scores), 1)
    return {"colonia_id": colonia_id, "disponible": True,
            "n_proyectos": len(scores), "bancabilidad_promedio": prom, "letra": _letra(prom)}


async def ranking_bancabilidad(db, top: int = 50) -> Dict[str, Any]:
    """Ranking de bancabilidad de TODOS los proyectos (superadmin · producto de datos). FAIL-OPEN."""
    from data_developments import DEVELOPMENTS
    out = []
    for d in DEVELOPMENTS:
        s = await score_bancabilidad(db, d)
        if s.get("disponible"):
            out.append(s)
    out.sort(key=lambda x: -x.get("bancabilidad", 0))
    from data_doctrine import has_real_sales
    real = await has_real_sales(db)
    return {"ranking": out[:top], "total": len(out),
            "data_basis": "real" if real else "demo",
            "fuente": ("Ranking de Bancabilidad DMX · score A–F por proyecto" if real
                       else "Ranking de Bancabilidad DMX · DEMO (catálogo de ejemplo, aún sin ventas reales)")}
