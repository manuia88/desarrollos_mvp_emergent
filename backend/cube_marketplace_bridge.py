"""CUBO TOTAL F4.1 — puente marketplace → corte del cubo.

El marketplace habla en filtros planos (colonia, beds, max_price, unit_feature…) y el cubo
en cortes [{campo, op, valor}]. Este puente traduce SIN inventar: todo filtro que no tenga
campo en el cubo se declara en `no_mapeados` (regla: cubrir TODO el vocabulario de la fuente
o declarar qué queda fuera — nunca el subconjunto del ejemplo).

Vocabulario fuente = el whitelist `allowed` del buscador (routes/public.py ai_search):
colonia, alcaldia, tipo, min/max_price, min/max_sqm, beds, baths, parking, stage, plazo,
amenity, unit_feature, orientacion, piso_min, enganche_max, mensualidad_max, apartado_max,
credito, descuento_min, esquema_pago.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

# unit_feature del marketplace → campo bool del cubo
_FEATURE_A_CAMPO = {"balcon": "has_balcon", "terraza": "has_terraza", "roof": "has_roof",
                    "roof_garden": "has_roof", "bodega": "has_bodega"}

# filtros del buscador SIN cara en el cubo hoy (se declaran, no se fingen)
_SIN_CARA = {"plazo", "apartado_max", "credito", "descuento_min", "esquema_pago", "tipo"}


def _num(v: Any) -> Any:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def filtros_marketplace_a_corte(filters: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """→ (corte, no_mapeados). Valores no coercibles se van a no_mapeados (nunca revientan)."""
    corte: List[Dict[str, Any]] = []
    fuera: List[str] = []
    f = filters or {}

    def _add(campo: str, op: str, valor: Any) -> None:
        corte.append({"campo": campo, "op": op, "valor": valor})

    for k, v in f.items():
        if v in (None, "", [], {}):
            continue
        if k == "colonia":
            vals = v if isinstance(v, list) else [v]
            _add("colonia", "in" if len(vals) > 1 else "eq", vals if len(vals) > 1 else vals[0])
        elif k == "alcaldia":
            _add("alcaldia", "eq", v)
        elif k == "beds" and _num(v) is not None:
            _add("recamaras", "gte", int(_num(v)))
        elif k == "baths" and _num(v) is not None:
            _add("banos", "gte", int(_num(v)))
        elif k == "parking" and _num(v) is not None:
            _add("n_parking", "gte", int(_num(v)))
        elif k == "max_price" and _num(v):
            _add("precio", "lte", _num(v))
        elif k == "min_price" and _num(v):
            _add("precio", "gte", _num(v))
        elif k == "max_sqm" and _num(v):
            _add("m2", "lte", _num(v))
        elif k == "min_sqm" and _num(v):
            _add("m2", "gte", _num(v))
        elif k == "mensualidad_max" and _num(v):
            _add("mens_80_20", "lte", _num(v))
        elif k == "enganche_max" and _num(v):
            # el cubo filtra por % mínimo; el buscador da pesos — sin precio no se traduce
            fuera.append(k)
        elif k == "stage":
            _add("etapa", "eq", v)
        elif k == "orientacion":
            _add("orientacion", "eq", v)
        elif k == "piso_min" and _num(v) is not None:
            _add("piso", "gte", int(_num(v)))
        elif k == "amenity":
            for a in (v if isinstance(v, list) else [v]):
                _add("amenidades_edificio", "eq", a)
        elif k == "unit_feature":
            for uf in (v if isinstance(v, list) else [v]):
                campo = _FEATURE_A_CAMPO.get(str(uf).lower().strip())
                if campo:
                    _add(campo, "eq", True)
                else:
                    fuera.append(f"unit_feature:{uf}")
        elif k in _SIN_CARA:
            fuera.append(k)
        else:
            fuera.append(k)
    return corte, fuera
