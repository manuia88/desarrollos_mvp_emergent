"""
generador_producto_engine — F2.2 · El Generador de Producto ("qué construir").
═══════════════════════════════════════════════════════════════════════════════
Dado un terreno (colonia + m²), recomienda la MEZCLA óptima de producto: tipologías
(estudio / 1·2·3 recámaras), cuántas unidades de cada una, tamaño, precio, cajones y
amenidades. CALIBRADO con la demanda real (Grafo del Comprador, F2.1) + el potencial
constructivo (CUS/eficiencia, reusa F1). Cierra el ciclo del underwriting: después de
"cuánto pago por el terreno" (F1) → "qué construyo aquí" (F2.2) → se mide contra la
absorción real (F2.5).

Build-for-endstate + Doctrina de Datos: si aún no hay demanda en la zona, usa una mezcla
por defecto del segmento y lo marca "estimado" (cero deuda). Pre-validación: dice cuántos
compradores reales de la zona encajan con el producto. FAIL-OPEN.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.generador_producto")

# Tamaño típico por nº de recámaras (m²) cuando la demanda no lo especifica.
_M2_DEFAULT = {0: 48, 1: 58, 2: 82, 3: 112, 4: 145}
# Cajones por tipología (norma práctica CDMX).
_CAJONES = {0: 1, 1: 1, 2: 1.5, 3: 2, 4: 2}
# Etapa de vida → recámaras objetivo (cuando el grafo no trae recámaras explícitas).
_SEG_REC = {
    "soltero_joven": 1, "adulto_independiente": 1, "pareja_sin_hijos": 2,
    "pareja_con_hijos": 3, "familia_consolidada": 3, "padre_madre_soltero": 2,
    "inversionista": 1, "indefinido": 2,
}
# Mezcla por defecto por categoría (sin señal de demanda) · proporción por nº de recámaras.
_MIX_DEFAULT = {
    "economica": {1: 0.45, 2: 0.45, 3: 0.10},
    "media":     {1: 0.25, 2: 0.50, 3: 0.25},
    "premium":   {1: 0.15, 2: 0.45, 3: 0.40},
}
_TIPO_LABEL = {0: "Estudio", 1: "1 Recámara", 2: "2 Recámaras", 3: "3 Recámaras", 4: "4 Recámaras"}


def _median(vals: Optional[List]) -> Optional[float]:
    v = sorted(x for x in (vals or []) if x is not None)
    return v[len(v) // 2] if v else None


def _top(vals: Optional[List], n: int) -> List:
    out, seen = [], set()
    for x in (vals or []):
        if x not in seen:
            seen.add(x); out.append(x)
        if len(out) >= n:
            break
    return out


async def _colonia_cus(db, colonia_id, cus_manual):
    if cus_manual:
        return float(cus_manual), "dato (manual)"
    try:
        c = await db.colonias.find_one({"id": colonia_id}, {"_id": 0, "cus": 1})
        if c and c.get("cus"):
            return float(c["cus"]), "dato (SIG catastral)"
    except Exception:
        pass
    return 3.0, "supuesto (sin SIG aún)"


async def generar_producto(db, colonia_id: Optional[str], terreno_m2: float,
                           categoria: str = "media", cus_manual=None) -> Dict[str, Any]:
    """Recomienda la mezcla de producto óptima para un terreno. FAIL-OPEN."""
    terreno_m2 = float(terreno_m2 or 0)
    cat = categoria if categoria in _MIX_DEFAULT else "media"
    cus, cus_origen = await _colonia_cus(db, colonia_id, cus_manual)

    # Potencial constructivo (reusa la eficiencia configurable de F1).
    try:
        from valor_residual_engine import get_effective_defaults
        defs = await get_effective_defaults(db)
        efic = float(defs.get("eficiencia", 0.82))
    except Exception:
        efic = 0.82
    m2_construible = terreno_m2 * cus
    m2_vendible = m2_construible * efic

    # Demanda real por etapa de vida (Grafo del Comprador).
    pesos: Dict[int, float] = {}
    precio_por_rec: Dict[int, List[float]] = {}
    m2_por_rec: Dict[int, List[float]] = {}
    amen_por_rec: Dict[int, List[str]] = {}
    seg_por_rec: Dict[int, List[str]] = {}
    demanda_total = 0
    es_estimado = True
    try:
        from grafo_comprador_engine import build_grafo, SEG_LABEL
        g = await build_grafo(db, colonia_id=colonia_id)
        cols = g.get("colonias") or []
        if cols:
            for s in (cols[0].get("segmentos") or []):
                n = s.get("demanda", 0)
                if n <= 0:
                    continue
                prod = s.get("producto") or {}
                rec = prod.get("recamaras")
                rec = int(rec if rec is not None else _SEG_REC.get(s["segmento"], 2))
                pesos[rec] = pesos.get(rec, 0) + n
                demanda_total += n
                if prod.get("precio_tipico"):
                    precio_por_rec.setdefault(rec, []).append(prod["precio_tipico"])
                if prod.get("m2_min_tipico"):
                    m2_por_rec.setdefault(rec, []).append(prod["m2_min_tipico"])
                for a in (prod.get("top_amenidades") or []):
                    amen_por_rec.setdefault(rec, []).append(a)
                seg_por_rec.setdefault(rec, []).append(SEG_LABEL.get(s["segmento"], s["segmento"]))
        if demanda_total > 0:
            es_estimado = False
    except Exception as e:
        log.warning(f"[generador] grafo fail-open: {e}")

    if not pesos:
        pesos = dict(_MIX_DEFAULT[cat])
    total_peso = sum(pesos.values()) or 1.0

    mezcla = []
    for rec in sorted(pesos.keys()):
        share = pesos[rec] / total_peso
        area = m2_vendible * share
        m2_unit = _median(m2_por_rec.get(rec)) or _M2_DEFAULT.get(rec, 80)
        unidades = int(area // m2_unit) if m2_unit else 0
        if unidades <= 0 and share > 0 and m2_vendible > 0:
            unidades = 1
        mezcla.append({
            "tipologia": _TIPO_LABEL.get(rec, f"{rec} Recámaras"),
            "recamaras": rec,
            "unidades": unidades,
            "pct": round(share * 100),
            "m2_promedio": round(m2_unit),
            "precio_tipico": _median(precio_por_rec.get(rec)),
            "cajones": round(unidades * _CAJONES.get(rec, 1.5)),
            "amenidades": _top(amen_por_rec.get(rec), 3),
            "segmento_objetivo": (seg_por_rec.get(rec) or [None])[0],
            "demanda_n": int(pesos[rec]) if not es_estimado else None,
        })

    total_unidades = sum(m["unidades"] for m in mezcla)
    ingreso_est = sum(m["unidades"] * (m["precio_tipico"] or 0) for m in mezcla) or None

    rationale = []
    if not es_estimado:
        dom = max(mezcla, key=lambda m: m["unidades"]) if mezcla else None
        if dom:
            rationale.append(f"La demanda de la zona pide sobre todo {dom['tipologia'].lower()} — son el {dom['pct']}% de la mezcla sugerida.")
        rationale.append(f"{demanda_total} compradores reales en esta colonia encajan con este producto (pre-validación de demanda).")
    else:
        rationale.append("Aún sin búsquedas suficientes en la zona: mezcla por defecto del segmento. Se afina sola conforme entra demanda real.")
    rationale.append(f"Potencial: {round(m2_vendible):,} m² vendibles (terreno {round(terreno_m2):,} m² × CUS {cus} × {int(efic*100)}% eficiencia).")

    return {
        "colonia_id": colonia_id, "terreno_m2": terreno_m2,
        "cus": cus, "cus_origen": cus_origen, "eficiencia": efic,
        "m2_construible": round(m2_construible), "m2_vendible": round(m2_vendible),
        "mezcla": mezcla,
        "total_unidades": total_unidades,
        "ingreso_estimado": ingreso_est,
        "demanda_total": demanda_total,
        "preventa_match": demanda_total if not es_estimado else 0,
        "es_estimado": es_estimado,
        "rationale": rationale,
        "data_source": "real" if not es_estimado else "default",
    }
