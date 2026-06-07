"""
Homologación de atributos — ajuste de valor estilo perito valuador (acotado).
═══════════════════════════════════════════════════════════════════════════════
Fundamento (metodología real del perito · NMX-459 enfoque comparativo de mercado):
el valor se ancla a COMPARABLES y se "homologa" con factores que se MULTIPLICAN, pero
cada uno cercano a 1 y el neto ACOTADO. Los avalúos reales NO saltan 20% por la vista
o las amenidades.

Pesos (grounded, conservadores):
  · Conservación (Heidecke): el factor físico que sí mueve — "para remodelar" demerita
    fuerte (~-15%); "excelente" suma poco (~+2%).
  · Edad (Ross, suave): demérito leve por antigüedad (~-0.4%/año, tope -20%).
  · Calidad/ubicación (vista · amenidades · orientación · piso): BUNDLE muy acotado
    (±5% en total), no un porcentaje por cada uno. La vista vale ~1-2%, no 5%.
Neto total acotado a [-28%, +8%]. Devuelve el multiplicador + "drivers" en lenguaje
normal (↑/↓ con una frase), nunca scores crudos.

NOTA: la edad/condición se usa SOLO si el caller no la metió ya en su base (el AVM
público ya aplica antigüedad en su heurística → ahí no se vuelve a contar).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


# Conservación (Heidecke acotado): bueno = base
_ESTADO = {"excelente": (1.02, "Excelente estado"), "bueno": (1.0, None),
           "regular": (0.94, "Estado regular"), "a_remodelar": (0.85, "Para remodelar")}
# Condición como proxy de edad (solo si no se dio antigüedad)
_COND_AGE = {"a_estrenar": (1.0, None), "seminueva": (0.985, None), "usada": (0.97, "Ya tiene uso")}
# Vista (parte del factor ubicación · acotado)
_VISTA = {"parque": (1.02, "Vista al parque"), "area_verde": (1.015, "Vista a área verde"),
          "ciudad": (1.01, "Vista a la ciudad"), "calle": (1.0, None), "interior": (0.985, "Vista interior")}
_ORIENT = {"S": 1.01, "SE": 1.01, "SO": 1.01, "E": 1.005, "O": 1.0, "N": 0.995, "NE": 1.0, "NO": 0.995}


def feature_adjustments(attrs: Dict[str, Any]) -> Dict[str, Any]:
    """Factor de homologación acotado + drivers en lenguaje normal."""
    factor = 1.0
    drivers: List[Dict[str, Any]] = []

    def add_driver(plain: Optional[str], mult: float):
        if plain and abs(mult - 1.0) >= 0.012:
            drivers.append({"plain": plain, "dir": "up" if mult >= 1.0 else "down",
                            "pct": round((mult - 1.0) * 100, 1)})

    # ── Conservación (el factor físico que sí pesa) ──
    estado = attrs.get("estado_conservacion")
    if estado in _ESTADO:
        m, lbl = _ESTADO[estado]; factor *= m; add_driver(lbl, m)

    # ── Edad (Ross suave) o condición como proxy si no hay antigüedad ──
    ant = attrs.get("antiguedad_anos")
    if ant is not None:
        age_f = _clamp(1.0 - float(ant) * 0.004, 0.80, 1.0)   # -0.4%/año, tope -20%
        factor *= age_f
        if age_f <= 0.96:
            add_driver("Algunos años de antigüedad", age_f)
    else:
        cond = attrs.get("condicion")
        if cond in _COND_AGE:
            m, lbl = _COND_AGE[cond]; factor *= m; add_driver(lbl, m)

    # ── Calidad / ubicación (vista · amenidades · orientación · piso) — BUNDLE acotado ±5% ──
    cal = 1.0
    vista = attrs.get("vista")
    vista_lbl = None
    if vista in _VISTA:
        vm, vista_lbl = _VISTA[vista]; cal *= vm
    n_amen = int(attrs.get("n_amenidades") or 0)
    amen_up = False
    if n_amen >= 6:
        cal *= 1.0 + min((n_amen - 5) * 0.004, 0.025)   # tope ~+2.5%, NO 1%/amenidad
        amen_up = True
    orient = attrs.get("orientacion")
    if orient in _ORIENT:
        cal *= _ORIENT[orient]
    nivel = attrs.get("nivel")
    if nivel is not None and int(nivel) >= 5:
        cal *= 1.0 + min((int(nivel) - 4) * 0.002, 0.012)
    cal = _clamp(cal, 0.96, 1.05)   # la calidad NUNCA mueve más de ±5%
    factor *= cal

    # drivers de calidad (frases, sin porcentaje por-amenidad)
    if vista_lbl:
        add_driver(vista_lbl, _VISTA[vista][0])
    if amen_up and cal > 1.005:
        drivers.append({"plain": "Buen equipamiento (amenidades)", "dir": "up", "pct": None})
    o = _ORIENT.get(orient or "", 1.0)
    if o >= 1.01:
        drivers.append({"plain": "Buena orientación (más sol)", "dir": "up", "pct": None})

    factor = _clamp(factor, 0.72, 1.08)   # neto total acotado, como un avalúo real
    # ordenar por magnitud (los None al final)
    drivers.sort(key=lambda d: -abs(d.get("pct") or 0.5))
    return {"factor": round(factor, 4), "drivers": drivers[:5]}


def drivers_headline(drivers: List[Dict[str, Any]]) -> Optional[str]:
    """Frase resumen en lenguaje normal de lo que más mueve el precio."""
    if not drivers:
        return None
    ups = [d["plain"] for d in drivers if d["dir"] == "up"][:2]
    downs = [d["plain"] for d in drivers if d["dir"] == "down"][:1]
    parts = []
    if ups:
        parts.append("Suma: " + " y ".join(p.lower() for p in ups))
    if downs:
        parts.append("resta: " + downs[0].lower())
    return " · ".join(parts) if parts else None
