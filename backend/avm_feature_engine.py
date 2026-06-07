"""
AVM rico — qué mueve el precio de una propiedad (más allá del tamaño).
═══════════════════════════════════════════════════════════════════════════════
Fuente ÚNICA de cómo los atributos finos (vista · estado · condición · antigüedad ·
amenidades · orientación · piso · recámaras/baños) ajustan el valor por m². La usan el
AVM público, la valuación de captación del asesor y la unidad del dev — sin duplicar.

Devuelve el multiplicador + los "drivers" en LENGUAJE NORMAL ("Vista a área verde — sube
el valor"), nunca scores crudos. Lo que no se conoce no penaliza (neutral).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


_COND = {"a_estrenar": (1.08, "A estrenar"), "seminueva": (1.03, "Seminueva"), "usada": (1.0, None)}
_ESTADO = {"excelente": (1.04, "Excelente estado"), "bueno": (1.0, None), "a_remodelar": (0.90, "Para remodelar")}
_VISTA = {
    "parque": (1.05, "Vista al parque"), "area_verde": (1.04, "Vista a área verde"),
    "ciudad": (1.03, "Vista a la ciudad"), "calle": (1.0, None), "interior": (0.97, "Vista interior"),
}
_ORIENT_SOL = {"S": 1.02, "SE": 1.02, "SO": 1.02, "E": 1.01, "O": 1.0, "N": 0.99, "NE": 1.0, "NO": 0.99}


def feature_adjustments(attrs: Dict[str, Any]) -> Dict[str, Any]:
    """factor total + drivers en lenguaje normal. Todo opcional (lo desconocido = neutral)."""
    factor = 1.0
    drivers: List[Dict[str, Any]] = []

    def add(mult: float, plain: Optional[str]):
        nonlocal factor
        factor *= mult
        if plain and abs(mult - 1.0) >= 0.015:
            drivers.append({"plain": plain, "dir": "up" if mult >= 1.0 else "down",
                            "pct": round((mult - 1.0) * 100, 1)})

    m, lbl = _COND.get(attrs.get("condicion") or "usada", (1.0, None)); add(m, lbl)
    m, lbl = _ESTADO.get(attrs.get("estado_conservacion") or "bueno", (1.0, None)); add(m, lbl)
    m, lbl = _VISTA.get(attrs.get("vista") or "calle", (1.0, None)); add(m, lbl)

    ant = attrs.get("antiguedad_anos")
    if ant is not None:
        am = _clamp(1.0 - float(ant) * 0.008, 0.78, 1.0)
        add(am, "Algunos años de antigüedad" if am <= 0.95 else None)

    n_amen = int(attrs.get("n_amenidades") or 0)
    if n_amen >= 3:
        add(1.0 + _clamp(n_amen * 0.01, 0.0, 0.08), f"{n_amen} amenidades")

    rec = attrs.get("recamaras")
    if rec is not None and int(rec) != 2:
        rm = 1.0 + (int(rec) - 2) * 0.03
        add(rm, "Una recámara extra" if int(rec) > 2 else "Una recámara menos")

    ban = attrs.get("banos")
    if ban is not None and int(ban) != 2:
        add(1.0 + (int(ban) - 2) * 0.025, None)

    orient = attrs.get("orientacion")
    if orient:
        om = _ORIENT_SOL.get(orient, 1.0)
        add(om, "Buena orientación (más sol)" if om >= 1.02 else None)

    nivel = attrs.get("nivel")
    if nivel is not None:
        nm = 1.0 + _clamp((int(nivel) - 1) * 0.004, -0.02, 0.06)
        add(nm, "Piso alto" if nm >= 1.02 else None)

    drivers.sort(key=lambda d: -abs(d["pct"]))
    return {"factor": round(factor, 4), "drivers": drivers[:6]}


def drivers_headline(drivers: List[Dict[str, Any]]) -> Optional[str]:
    """Una frase resumen en lenguaje normal de lo que más mueve el precio."""
    if not drivers:
        return None
    ups = [d["plain"] for d in drivers if d["dir"] == "up"][:2]
    downs = [d["plain"] for d in drivers if d["dir"] == "down"][:1]
    parts = []
    if ups:
        parts.append("Suma valor: " + " y ".join(ups).lower())
    if downs:
        parts.append("resta: " + downs[0].lower())
    return " · ".join(parts) if parts else None
