"""LOS CRUCES DE MERCADO — el catálogo propio contra el mercado real (4S + bitácora).

  · GAP DE PRODUCTO: segmentos que el mercado AGOTÓ (4S, colocación ≥80%) y que el
    catálogo actual NO ofrece en esa zona → qué construir/traer (feed del Gap Radar).
  · DEMANDA REVELADA: sin visitantes — lo que se vendió rápido ES la demanda observada,
    por colonia y por banda de precio.
  · ARBITRAJE: el $/m² de cada segmento del catálogo vs la referencia del mercado
    minado en su misma geografía (colonia → alcaldía → ciudad, el nivel más fino con dato).
  · ÍNDICE DEL DEV v1: $/m² ponderado del portafolio (un punto por foto de la bitácora;
    la serie crece sola con cada lista nueva).

Puro/testeable; Mongo solo en los lectores. $0.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from corte_engine import _banda

UMBRAL_AGOTADO_PCT = 80.0


def _pm2(u) -> Optional[float]:
    p, m = u.get("price_mxn") or u.get("price"), u.get("size_m2") or u.get("m2_total")
    return p / m if p and m else None


# ─── DEMANDA REVELADA (pura) ──────────────────────────────────────────────────
def demanda_revelada(snapshots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Por colonia: % colocado observado en el mercado minado = demanda que SÍ compró."""
    por_colonia: Dict[str, Dict[str, int]] = {}
    for sn in snapshots:
        col = sn.get("colonia_geo") or sn.get("colonia_id") or "sin colonia"
        e = por_colonia.setdefault(col, {"total": 0, "vendidas": 0})
        for u in (sn.get("units") or []):
            e["total"] += 1
            if (u.get("status") or "").lower() in ("vendido", "vendida", "sold"):
                e["vendidas"] += 1
    out = [{"colonia": c, "unidades": e["total"], "vendidas": e["vendidas"],
            "colocacion_pct": round(e["vendidas"] * 100 / e["total"], 1)}
           for c, e in por_colonia.items() if e["total"] >= 5]
    return sorted(out, key=lambda x: -x["colocacion_pct"])


# ─── GAP DE PRODUCTO (pura) ───────────────────────────────────────────────────
def gap_producto(snapshots: List[Dict[str, Any]],
                 oferta_actual: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Segmentos (colonia × banda de precio) que el mercado AGOTÓ y el catálogo actual
    no cubre → la lista de 'qué falta construir/traer'."""
    oferta_llaves = set()
    for u in oferta_actual:
        precio = u.get("price_mxn") or u.get("price")
        col = u.get("_colonia_geo") or u.get("colonia_id") or ""
        if precio and col:
            oferta_llaves.add((col.lower(), _banda(precio / 1e6, [3, 5, 7, 9, 12], "M")))
    agotados: Dict[tuple, Dict[str, Any]] = {}
    for sn in snapshots:
        col = (sn.get("colonia_geo") or sn.get("colonia_id") or "").lower()
        for u in (sn.get("units") or []):
            precio = u.get("price")
            if not precio or not col:
                continue
            k = (col, _banda(precio / 1e6, [3, 5, 7, 9, 12], "M"))
            e = agotados.setdefault(k, {"total": 0, "vendidas": 0})
            e["total"] += 1
            if (u.get("status") or "").lower() in ("vendido", "vendida", "sold"):
                e["vendidas"] += 1
    out = []
    for (col, banda), e in agotados.items():
        if e["total"] < 5:
            continue
        pct = e["vendidas"] * 100 / e["total"]
        if pct >= UMBRAL_AGOTADO_PCT and (col, banda) not in oferta_llaves:
            out.append({"colonia": col, "banda_precio": banda,
                        "colocacion_observada_pct": round(pct, 1),
                        "unidades_observadas": e["total"],
                        "lectura": f"el mercado agotó {banda} en {col} "
                                   f"({pct:.0f}% colocado) y el catálogo no lo ofrece"})
    return sorted(out, key=lambda x: -x["colocacion_observada_pct"])[:12]


# ─── ARBITRAJE vs mercado (pura) ──────────────────────────────────────────────
def referencia_mercado(snapshots: List[Dict[str, Any]]) -> Dict[str, float]:
    """$/precio mediano del mercado minado por colonia (el 4S no trae m² → mediana de
    PRECIO por colonia; el arbitraje se lee como posición del ticket, no del $/m²)."""
    por_col: Dict[str, List[float]] = {}
    for sn in snapshots:
        col = (sn.get("colonia_geo") or sn.get("colonia_id") or "").lower()
        for u in (sn.get("units") or []):
            if u.get("price") and col:
                por_col.setdefault(col, []).append(float(u["price"]))
    return {c: sorted(v)[len(v) // 2] for c, v in por_col.items() if len(v) >= 5}


# ─── ÍNDICE DEL DEV v1 (pura) ─────────────────────────────────────────────────
def indice_dev(eventos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """$/m² ponderado del portafolio por FECHA de foto — la serie del dev. Con 1 foto
    es 1 punto; crece sola con cada lista nueva de la bitácora."""
    por_fecha: Dict[str, List[float]] = {}
    for e in eventos:
        if e.get("pm2"):
            por_fecha.setdefault(str(e.get("ts"))[:10], []).append(float(e["pm2"]))
    return [{"fecha": f, "pm2_indice": round(sum(v) / len(v)), "unidades": len(v)}
            for f, v in sorted(por_fecha.items())]


# ─── el agregado para la UI (Mongo solo aquí) ─────────────────────────────────
async def cruces_mercado(db) -> Dict[str, Any]:
    snapshots = await db.lista_snapshots.find({}, {"_id": 0}).to_list(500)
    from unidades_efectivas import unidades_efectivas
    units = await unidades_efectivas(db, {})
    devs = {d["id"]: d for d in await db.developments.find(
        {}, {"_id": 0, "id": 1, "colonia": 1, "colonia_id": 1}).to_list(500)}
    for u in units:
        d = devs.get(u.get("development_id")) or {}
        u["_colonia_geo"] = d.get("colonia") or d.get("colonia_id") or ""
    return {"demanda_revelada": demanda_revelada(snapshots)[:10],
            "gaps": gap_producto(snapshots, units),
            "nota": "fuente: mercado minado 4S (histórico real) vs catálogo vivo"}
