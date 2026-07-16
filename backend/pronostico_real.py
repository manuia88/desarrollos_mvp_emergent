"""PRONÓSTICO VS REAL — la única validación que importa: el modelo contra el FUTURO.

Cada vez que llega una lista nueva con precios movidos, se compara el precio NUEVO
contra lo que el modelo había dicho ANTES de conocerlo (ml_valor_modelo persistido
en la unidad). Tres preguntas por unidad movida:
  · ¿qué tan lejos quedó el valor del modelo del precio nuevo? (error real)
  · ¿el precio nuevo cayó dentro del rango 80% que el modelo había publicado?
  · ¿el modelo acertó la DIRECCIÓN? (decía subpreciada → ¿subió?)

Se acumula en `pronostico_vs_real` (un doc por unidad movida por carga) — la serie
del examen. Visible en la Fábrica. Puro/testeable; Mongo solo en registrar(). $0.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from identidad_unidad import norm_unidad


def comparar(previos: Dict[str, Dict[str, Any]],
             nuevos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """previos: unidad normalizada → {precio, valor_modelo, rango_bajo, rango_alto}
    (el estado ANTES de la carga). nuevos: unidades entrantes. Solo compara donde
    el precio CAMBIÓ y el modelo había opinado."""
    out = []
    for u in nuevos:
        num = u.get("unit_number")
        precio_nuevo = u.get("price_mxn") or u.get("price")
        if not num or not precio_nuevo:
            continue
        p = previos.get(norm_unidad(str(num)))
        if not p or not p.get("valor_modelo") or not p.get("precio"):
            continue
        if abs(float(precio_nuevo) - float(p["precio"])) < 1:
            continue                                   # sin movimiento: no hay examen
        vm = float(p["valor_modelo"])
        subio = float(precio_nuevo) > float(p["precio"])
        decia_subpreciada = vm > float(p["precio"])    # el modelo la veía barata
        out.append({
            "unidad": num,
            "precio_anterior": float(p["precio"]),
            "precio_nuevo": float(precio_nuevo),
            "valor_modelo_previo": vm,
            "error_pct": round((vm - float(precio_nuevo)) * 100 / float(precio_nuevo), 1),
            "dentro_rango": (bool(p.get("rango_bajo") and p.get("rango_alto") and
                                  p["rango_bajo"] <= float(precio_nuevo) <= p["rango_alto"])
                             if p.get("rango_bajo") and p.get("rango_alto") else None),
            "direccion_acertada": decia_subpreciada == subio})
    return out


def resumen(examenes: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not examenes:
        return {"n": 0, "nota": "aún sin listas con precios movidos — el examen "
                                "arranca con la 2ª foto de cualquier desarrollo"}
    con_rango = [e for e in examenes if e.get("dentro_rango") is not None]
    return {"n": len(examenes),
            "error_medio_pct": round(sum(abs(e["error_pct"]) for e in examenes)
                                     / len(examenes), 1),
            "direccion_acertada_pct": round(sum(1 for e in examenes
                                                if e["direccion_acertada"]) * 100
                                            / len(examenes), 1),
            "dentro_rango_pct": (round(sum(1 for e in con_rango if e["dentro_rango"])
                                       * 100 / len(con_rango), 1) if con_rango else None),
            "nota": None}


async def snapshot_previo(db, development_id: str) -> Dict[str, Dict[str, Any]]:
    """El estado del modelo ANTES de la carga (se toma antes del merge)."""
    out: Dict[str, Dict[str, Any]] = {}
    async for u in db.units.find({"development_id": development_id},
                                 {"_id": 0, "unit_number": 1, "price_mxn": 1,
                                  "price": 1, "ml_valor_modelo": 1,
                                  "ml_rango_bajo": 1, "ml_rango_alto": 1}):
        if u.get("unit_number"):
            out[norm_unidad(str(u["unit_number"]))] = {
                "precio": u.get("price_mxn") or u.get("price"),
                "valor_modelo": u.get("ml_valor_modelo"),
                "rango_bajo": u.get("ml_rango_bajo"),
                "rango_alto": u.get("ml_rango_alto")}
    return out


async def registrar(db, development_id: str,
                    previos: Dict[str, Dict[str, Any]],
                    nuevos: List[Dict[str, Any]], origen: str) -> Dict[str, Any]:
    examenes = comparar(previos, nuevos)
    ts = datetime.now(timezone.utc).isoformat()
    if examenes:
        await db.pronostico_vs_real.insert_many(
            [dict(e, development_id=development_id, origen=origen, ts=ts)
             for e in examenes])
    return resumen(examenes)
