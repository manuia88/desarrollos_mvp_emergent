"""
absorcion_engine — F2.7 · Curva de absorción por cohorte + censo de comparables.
═══════════════════════════════════════════════════════════════════════════════
Convierte el "ritmo de venta" de un promedio plano a una CURVA real con saturación, por
cohorte de antigüedad (preventa → en construcción → entrega), y arma el censo vivo de los
proyectos competidores de una colonia o microzona (radio). Por cohorte: % vendido, velocidad
mensual y meses para agotar inventario. Reusa DEVELOPMENTS (la oferta real). Build-for-endstate
+ Doctrina: con pocos proyectos lo dice. FAIL-OPEN. Mata los reportes trimestrales TINSA/Softec.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("dmx.absorcion")

# Meses estimados que un proyecto lleva vendiendo según su etapa (proxy de antigüedad/cohorte).
_MESES_STAGE = {"preventa": 6, "exclusiva": 6, "en_construccion": 18,
                "entrega_inmediata": 36, "entregado": 42}
_COHORTE = {"preventa": "Preventa (Nuevo)", "exclusiva": "Preventa (Nuevo)",
            "en_construccion": "En Construcción (2-3 años)",
            "entrega_inmediata": "Entrega / Maduro", "entregado": "Entrega / Maduro"}
_ORDEN = ["Preventa (Nuevo)", "En Construcción (2-3 años)", "Entrega / Maduro"]


def _dev_units(d: dict):
    units = d.get("units") or []
    total = d.get("units_total") or len(units)
    sold = d.get("units_sold")
    avail = d.get("units_available")
    # Reusa la definición CANÓNICA de "vendido" (misma que dmx_dev_benchmark) — no reinventar.
    try:
        from data_developments import is_sold
    except Exception:
        def is_sold(s):
            return (s or "").strip().lower() in ("vendido", "sold", "cerrado", "closed")
    if sold is None:
        sold = sum(1 for u in units if is_sold(u.get("status")))
    if avail is None:
        avail = sum(1 for u in units if (u.get("status") or "").strip().lower() == "disponible")
    return int(total or 0), int(sold or 0), int(avail or 0)


def _cohorte_por_meses(meses: float) -> str:
    """Cohorte de un comparable 4S por su tiempo REAL en mercado (no proxy de etapa)."""
    if meses < 12:
        return "Preventa (Nuevo)"
    if meses < 30:
        return "En Construcción (2-3 años)"
    return "Entrega / Maduro"


async def curva_absorcion(db, *, colonia_id: Optional[str] = None,
                          col_names: Optional[Set[str]] = None,
                          col_ids: Optional[Set[str]] = None,
                          incluir_4s: bool = True,
                          nombres_4s: bool = False) -> Dict[str, Any]:
    """Curva de absorción por cohorte + comparables de una colonia o set (radio). FAIL-OPEN.

    incluir_4s: enriquece el censo con proyectos competidores REALES de estudios 4S usando su
      VELOCIDAD real (tiempo real en mercado, no el proxy _MESES_STAGE) — agregado anonimizado.
    nombres_4s: solo superadmin ve el nombre del competidor 4S; para dev/público van sin nombre."""
    names = set(col_names or set())
    ids = set(col_ids or set())
    if colonia_id:
        ids.add(colonia_id)
        try:
            from data_seed import COLONIAS_BY_ID
            c = COLONIAS_BY_ID.get(colonia_id)
            if c:
                names.add((c.get("name") or "").strip().lower())
        except Exception:
            pass

    cohortes: Dict[str, dict] = defaultdict(lambda: {"n": 0, "total": 0, "sold": 0, "avail": 0, "stage_key": None, "meses_acc": 0.0})
    comparables: List[Dict[str, Any]] = []
    try:
        from data_developments import DEVELOPMENTS
        for d in DEVELOPMENTS:
            cn = str(d.get("colonia") or "").strip().lower()
            if not (cn in names or d.get("colonia_id") in ids):
                continue
            stage = (d.get("stage") or "preventa").lower()
            coh = _COHORTE.get(stage, "En Construcción (2-3 años)")
            total, sold, avail = _dev_units(d)
            if total <= 0:
                continue
            b = cohortes[coh]
            meses = _MESES_STAGE.get(stage, 12)
            b["n"] += 1; b["total"] += total; b["sold"] += sold; b["avail"] += avail; b["stage_key"] = stage
            b["meses_acc"] += meses * total   # acumula meses ponderados por unidades (determinista, no depende del último stage escrito)
            absor = round(100 * sold / total) if total else 0
            vel = round(sold / meses, 1) if meses else 0
            comparables.append({
                "nombre": d.get("nombre") or d.get("name") or d.get("id"),
                "stage": stage, "cohorte": coh,
                "unidades": total, "vendidas": sold, "disponibles": avail,
                "absorcion_pct": absor, "velocidad_mensual": vel,
                "precio_desde": d.get("price_from"),
            })
    except Exception as e:
        log.warning(f"[absorcion] fail-open: {e}")

    # LEDGER REAL (Palanca 2, auditoría 07-20): ventas reales de unit_status_events — el vigía y
    # las ingestas ahora las escriben ahí. Antes NINGÚN motor de absorción lo leía (solo un panel).
    # Da días-para-vender REALES por dev (desde listed_at), no el proxy _MESES_STAGE.
    ventas_ledger: Dict[str, dict] = {}
    try:
        async for r in db.unit_status_events.aggregate([
            # Palanca 6: excluye eventos revertidos (deshacer_lote) → absorción sin ventas fantasma.
            {"$match": {"new_status": "vendido", "days_to_sell": {"$ne": None}, "revertido": {"$ne": True}}},
            {"$group": {"_id": "$dev_id", "n": {"$sum": 1}, "dias": {"$avg": "$days_to_sell"}}}]):
            if r.get("_id"):
                ventas_ledger[r["_id"]] = {"n": r["n"],
                                           "dias_prom": round(r["dias"]) if r.get("dias") is not None else None}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[absorcion] ledger fail-open: {e}")

    # INGESTA / WIZARD: además de la semilla, la oferta REAL vive en db.developments (+ db.projects) con unidades en
    # db.units. Sin esto la absorción de una zona ignoraba los proyectos ingeridos → curva incompleta (auditoría 07-07).
    try:
        from ingested_reader import units_for_dev
        _seen_names = {c["nombre"] for c in comparables}
        async for d in db.developments.find({"colonia_id": {"$nin": [None, ""]}}, {"_id": 0}):
            cn = str(d.get("colonia") or "").strip().lower()
            if not (cn in names or d.get("colonia_id") in ids):
                continue
            _nom = d.get("name") or d.get("nombre") or d.get("id")
            if _nom in _seen_names:
                continue
            units = await units_for_dev(db, d.get("id"))
            total = len(units)
            if total <= 0:
                continue
            sold = sum(1 for u in units if u.get("status") == "vendido")
            avail = sum(1 for u in units if u.get("status") == "disponible")
            stage = (d.get("stage") or "preventa").lower()
            coh = _COHORTE.get(stage, "En Construcción (2-3 años)")
            meses = _MESES_STAGE.get(stage, 12)
            b = cohortes[coh]
            b["n"] += 1; b["total"] += total; b["sold"] += sold; b["avail"] += avail; b["stage_key"] = stage
            b["meses_acc"] += meses * total
            lg = ventas_ledger.get(d.get("id"))          # ventas REALES del ledger (Palanca 2)
            comparables.append({
                "nombre": _nom, "stage": stage, "cohorte": coh,
                "unidades": total, "vendidas": sold, "disponibles": avail,
                "absorcion_pct": round(100 * sold / total) if total else 0,
                "velocidad_mensual": round(sold / meses, 1) if meses else 0,
                "precio_desde": d.get("price_from") or (min((u.get("price") for u in units if u.get("price")), default=None)),
                "ventas_reales": (lg or {}).get("n"),                  # None si aún no hay dato real
                "dias_venta_prom": (lg or {}).get("dias_prom"),        # días-para-vender REALES (listed_at)
                "fuente_velocidad": "ledger" if lg else "proxy_stage",
            })
            _seen_names.add(_nom)
    except Exception as e:
        log.warning(f"[absorcion] ingeridos fail-open: {e}")

    # DATO REAL 4S: proyectos competidores de estudios de mercado con VELOCIDAD real (tiempo real en
    # mercado). Enriquece el censo como AGREGADO anonimizado; el nombre solo viaja a superadmin.
    n_4s = 0
    if incluir_4s:
        try:
            from market_4s_bridge import comps_4s_para_colonia
            comps4s = await comps_4s_para_colonia(db, names)
            for c in comps4s:
                total = int(c.get("unidades_totales") or 0)
                sold = int(c.get("unidades_vendidas") or 0)
                avail = int(c.get("unidades_inventario") or max(0, total - sold))
                meses = float(c.get("tiempo_en_mercado_meses") or 0)
                if total <= 0 or meses <= 0:
                    continue
                coh = _cohorte_por_meses(meses)
                b = cohortes[coh]
                b["n"] += 1; b["total"] += total; b["sold"] += sold; b["avail"] += avail
                b["meses_acc"] += meses * total   # meses REALES (no proxy)
                n_4s += 1
                comparables.append({
                    "nombre": (c.get("proyecto") if nombres_4s else "Competidor de mercado (4S)"),
                    "stage": "mercado", "cohorte": coh,
                    "unidades": total, "vendidas": sold, "disponibles": avail,
                    "absorcion_pct": c.get("absorcion_pct") or (round(100 * sold / total) if total else 0),
                    "velocidad_mensual": c.get("velocidad_mensual_real") or (round(sold / meses, 1) if meses else 0),
                    "precio_desde": c.get("precio_promedio"),
                    "fuente": "4s",
                })
        except Exception as e:
            log.warning(f"[absorcion] 4s fail-open: {e}")

    curva = []
    for coh in _ORDEN:
        b = cohortes.get(coh)
        if not b or b["total"] == 0:
            continue
        meses = (b["meses_acc"] / b["total"]) if b["total"] else 12   # meses efectivos ponderados de la cohorte (determinista)
        vel = round(b["sold"] / meses, 1) if meses else 0
        meses_agotar = round(b["avail"] / vel) if vel > 0 else None
        curva.append({
            "cohorte": coh, "proyectos": b["n"],
            "unidades_total": b["total"], "vendidas": b["sold"], "disponibles": b["avail"],
            "absorcion_pct": round(100 * b["sold"] / b["total"]) if b["total"] else 0,
            "velocidad_mensual": vel,
            "meses_para_agotar": meses_agotar,
        })

    comparables.sort(key=lambda x: -x["absorcion_pct"])
    n_proy = sum(c["proyectos"] for c in curva)
    es_estimado = n_proy < 3
    from data_doctrine import has_real_sales
    real = await has_real_sales(db)
    if not curva:
        lectura = "Aún sin proyectos comparables en la zona — la curva se llena conforme entra oferta."
    elif es_estimado:
        lectura = f"Curva preliminar ({n_proy} proyectos): se afina con más oferta."
    elif real:
        lectura = f"Curva de absorción con {n_proy} proyectos comparables (ventas reales)."
    else:
        lectura = f"Curva de absorción del catálogo de ejemplo ({n_proy} proyectos · DEMO, aún sin ventas reales)."
    real_o_4s = real or n_4s > 0   # comparables 4S SON ventas reales de mercado
    if n_4s > 0 and not es_estimado:
        lectura = f"Curva de absorción con {n_proy} proyectos comparables ({n_4s} de estudios de mercado reales)."
    return {
        "curva": curva,
        "comparables": comparables[:12],
        "n_proyectos": n_proy,
        "n_proyectos_4s": n_4s,
        "es_estimado": es_estimado,
        "data_basis": "real" if real_o_4s else "demo",
        "lectura": lectura,
        "fuente": ("Absorción por cohorte DMX · oferta real + estudios de mercado" if real_o_4s
                   else "Absorción por cohorte DMX · catálogo de ejemplo (DEMO · aún sin ventas reales)"),
    }
