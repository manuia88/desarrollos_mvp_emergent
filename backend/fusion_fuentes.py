"""EL FUSION SPEC — la doctrina del founder (D2/D3) hecha código, por campo.

Cuando 2+ fuentes del mismo dev hablan del mismo átomo (lista VP, Excel maestro, plano,
brochure), cada campo se resuelve por SU política — y toda pelea queda documentada:
  · mas_granular  → gana el valor con medición por-unidad (más variedad/decimales)
  · mas_fresco    → gana la fuente con fecha más reciente (precio/estatus)
  · primero_no_nulo → el primero que lo traiga (campos que solo una fuente tiene)
  · moda_proyecto → valores de proyecto repetidos por renglón: la MODA, jamás la suma
    (la regla del 516→258 de la prueba NUA).
REGLA DE PRIORIDAD (founder 07-15): cuando las fuentes PELEAN, el PLANO y la LISTA
DE PRECIOS mandan sobre el Maestro/Excel — el catálogo se queda con ellas y la pelea
solo se anota. Si una lista futura empata con el Maestro, la pelea desaparece sola
(nada es pegajoso: cada corrida recalcula). Los callers deben pasar los candidatos
en ese orden: (plano, lista, maestro).

Puro y testeable. El masivo lo usa vía fusionar_unidad().
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

PRIORIDAD_FUENTES = ("plano", "lista", "maestro")   # la doctrina, consultable

POLITICAS: Dict[str, str] = {
    "price_mxn": "mas_fresco", "status": "mas_fresco",
    "m2_privative": "mas_granular", "size_m2": "mas_granular", "m2_total": "mas_granular",
    "bedrooms": "primero_no_nulo", "bathrooms": "primero_no_nulo",
    "parking_spots": "primero_no_nulo", "parking_type": "primero_no_nulo",
    "cuarto_servicio": "primero_no_nulo", "amueblado": "primero_no_nulo",
    "acabados": "primero_no_nulo", "notas": "primero_no_nulo",
    "m2_balcony": "primero_no_nulo", "patio_m2": "primero_no_nulo",
    "m2_roof_garden": "primero_no_nulo",
    "enganche_mxn": "mas_fresco", "credito_mxn": "mas_fresco",
    "reservacion_mxn": "mas_fresco", "contrato_mxn": "mas_fresco",
    "a_diferir_mxn": "mas_fresco",
}


def conciliar_m2(valor_a: Optional[float], valor_b: Optional[float],
                 exteriores: Dict[str, Any],
                 tolerancia: float = 0.06) -> Optional[str]:
    """CONCILIADOR DE DEFINICIONES (lección Dessea 102, founder 07-15): cuando dos
    fuentes 'pelean' en un m², probar las identidades aritméticas conocidas ANTES de
    declararla pelea — muchas veces ambas dicen lo mismo con definición distinta
    (el Maestro decía 'habitable 205.09' = 186.95 hab + 18.14 terraza de la lista).
    Devuelve la explicación humana si alguna identidad cuadra; None = pelea real."""
    if not valor_a or not valor_b:
        return None
    ext = {k: float(v) for k, v in (exteriores or {}).items() if v}
    combos = [(v, k) for k, v in ext.items()]
    if len(ext) > 1:
        combos.append((sum(ext.values()), " + ".join(ext)))
    chico, grande = sorted([float(valor_a), float(valor_b)])
    for suma, etiqueta in combos:
        if abs(chico + suma - grande) <= tolerancia:
            return (f"no es pelea: {grande} = {chico} + {etiqueta} ({round(suma, 2)}) — "
                    f"una fuente incluye ese exterior en su 'habitable'")
    return None


def moda_proyecto(valores: List[Any]) -> Optional[Any]:
    """Total del edificio y similares: se repiten por renglón → la moda, JAMÁS la suma."""
    limpios = [v for v in valores if v not in (None, "", 0)]
    return Counter(limpios).most_common(1)[0][0] if limpios else None


def _granularidad(valores_de_fuente: List[Any]) -> int:
    """Más valores DISTINTOS = medición por unidad (vs valor de tipo repetido)."""
    return len({str(v) for v in valores_de_fuente if v is not None})


def fusionar_unidad(campo: str,
                    candidatos: List[Tuple[Any, Dict[str, Any]]]) -> Dict[str, Any]:
    """candidatos = [(valor, {fuente, fecha, valores_del_campo_en_su_fuente})].
    Devuelve {valor, fuente, discrepancia?} — la pelea nunca se esconde."""
    con_dato = [(v, m) for v, m in candidatos if v not in (None, "")]
    if not con_dato:
        return {"valor": None, "fuente": None}
    if len(con_dato) == 1:
        v, m = con_dato[0]
        return {"valor": v, "fuente": m.get("fuente")}
    politica = POLITICAS.get(campo, "primero_no_nulo")
    if politica == "mas_fresco":
        v, m = max(con_dato, key=lambda x: str(x[1].get("fecha") or ""))
    elif politica == "mas_granular":
        v, m = max(con_dato, key=lambda x: _granularidad(
            x[1].get("valores_del_campo") or [x[0]]))
    else:
        v, m = con_dato[0]
    out = {"valor": v, "fuente": m.get("fuente"), "politica": politica}
    distintos = {str(x[0]) for x, in zip(con_dato)} if False else {str(x[0]) for x in con_dato}
    if len(distintos) > 1:
        out["discrepancia"] = [{"fuente": mm.get("fuente"), "valor": vv}
                               for vv, mm in con_dato]
    return out
