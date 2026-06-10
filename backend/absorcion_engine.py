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


async def curva_absorcion(db, *, colonia_id: Optional[str] = None,
                          col_names: Optional[Set[str]] = None,
                          col_ids: Optional[Set[str]] = None) -> Dict[str, Any]:
    """Curva de absorción por cohorte + comparables de una colonia o set (radio). FAIL-OPEN."""
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

    cohortes: Dict[str, dict] = defaultdict(lambda: {"n": 0, "total": 0, "sold": 0, "avail": 0, "stage_key": None})
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
            b["n"] += 1; b["total"] += total; b["sold"] += sold; b["avail"] += avail; b["stage_key"] = stage
            absor = round(100 * sold / total) if total else 0
            meses = _MESES_STAGE.get(stage, 12)
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

    curva = []
    for coh in _ORDEN:
        b = cohortes.get(coh)
        if not b or b["total"] == 0:
            continue
        meses = _MESES_STAGE.get(b["stage_key"], 12)
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
    if not curva:
        lectura = "Aún sin proyectos comparables en la zona — la curva se llena conforme entra oferta."
    elif es_estimado:
        lectura = f"Curva preliminar ({n_proy} proyectos): se afina con más oferta."
    else:
        lectura = f"Curva real de absorción con {n_proy} proyectos comparables."
    return {
        "curva": curva,
        "comparables": comparables[:12],
        "n_proyectos": n_proy,
        "es_estimado": es_estimado,
        "lectura": lectura,
        "fuente": "Absorción por cohorte DMX · oferta real (vs reporte trimestral estático)",
    }
