"""
DMX — Motor de Esquemas de Pago (lógica sesión R3 + upgrades).

Un esquema = 4 conceptos:
  · Apartado        → monto fijo (lo define el dev, aparte; se acredita a la firma)
  · Firma %         → enganche al firmar contrato
  · Mensualidades % → ÷ N meses (auto de fechas obra→entrega, con override)
  · Escrituración % → resto, con crédito y/o recursos propios

Regla: firma% + mensualidades% + escritura% = 100.
A MAYOR enganche (firma), MENOR precio (descuento implícito por pronto pago).
  precio_aplicado = precio_base × (1 − descuento%/100)

Funciones puras (sin DB). Las consume el portal dev, el cotizador y (a futuro)
asesor/comprador/marketplace.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

TOL = 0.5  # tolerancia en la suma de porcentajes (puntos)
MAX_SCHEMES = 5

PCT_FIELDS = ("firma_pct", "mensualidades_pct", "escritura_pct")


def _f(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def _i(v, default=0):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


# ─── Validación ───────────────────────────────────────────────────────────────
def validate_scheme(scheme: Dict[str, Any]) -> List[str]:
    """Devuelve lista de errores (vacía = válido)."""
    errs: List[str] = []
    nombre = (scheme.get("nombre") or "").strip()
    if not nombre:
        errs.append("Falta el nombre del esquema")

    firma = _f(scheme.get("firma_pct"))
    mens = _f(scheme.get("mensualidades_pct"))
    escr = _f(scheme.get("escritura_pct"))
    desc = _f(scheme.get("descuento_pct"))

    for label, val in (("Firma", firma), ("Mensualidades", mens), ("Escrituración", escr)):
        if val < 0 or val > 100:
            errs.append(f"{label} debe estar entre 0 y 100")
    if desc < 0 or desc > 100:
        errs.append("Descuento debe estar entre 0 y 100")

    total = firma + mens + escr
    if abs(total - 100.0) > TOL:
        errs.append(f"Firma + Mensualidades + Escrituración debe sumar 100 (suma {total:.0f})")

    apartado = _f(scheme.get("apartado_mxn"))
    if apartado < 0:
        errs.append("El apartado no puede ser negativo")

    meses_ov = scheme.get("meses_override")
    if meses_ov not in (None, "") and _i(meses_ov) < 1:
        errs.append("Los meses deben ser 1 o más")

    return errs


def validate_schemes(schemes: List[Dict[str, Any]]) -> List[str]:
    errs: List[str] = []
    if len(schemes) > MAX_SCHEMES:
        errs.append(f"Máximo {MAX_SCHEMES} formas de pago")
    names = set()
    for i, s in enumerate(schemes):
        for e in validate_scheme(s):
            errs.append(f"Forma {i + 1}: {e}")
        nm = (s.get("nombre") or "").strip().lower()
        if nm and nm in names:
            errs.append(f"Forma {i + 1}: nombre repetido")
        names.add(nm)
    return errs


# ─── Meses atados a fechas ──────────────────────────────────────────────────────
def auto_months(fecha_inicio: Optional[str], fecha_entrega: Optional[str]) -> Optional[int]:
    """Meses entre inicio de obra y entrega (mín 1). None si faltan fechas."""
    a = _parse_date(fecha_inicio)
    b = _parse_date(fecha_entrega)
    if not a or not b:
        return None
    months = (b[0] - a[0]) * 12 + (b[1] - a[1])
    return max(1, months)


def _parse_date(v) -> Optional[tuple]:
    """Devuelve (year, month) de un ISO/yyyy-mm-dd. None si no parsea."""
    if not v:
        return None
    s = str(v)[:10]
    parts = s.replace("/", "-").split("-")
    try:
        if len(parts[0]) == 4:          # yyyy-mm-dd
            return (int(parts[0]), int(parts[1]))
        if len(parts) >= 3:              # dd-mm-yyyy
            return (int(parts[2]), int(parts[1]))
    except (ValueError, IndexError):
        return None
    return None


def resolve_months(scheme: Dict[str, Any], fecha_inicio=None, fecha_entrega=None) -> Optional[int]:
    """Override manual del dev tiene prioridad; si no, se calcula de fechas."""
    ov = scheme.get("meses_override")
    if ov not in (None, ""):
        m = _i(ov)
        if m >= 1:
            return m
    return auto_months(fecha_inicio, fecha_entrega)


# ─── Desglose ───────────────────────────────────────────────────────────────────
def compute_breakdown(precio_base: float, scheme: Dict[str, Any],
                      fecha_inicio=None, fecha_entrega=None) -> Dict[str, Any]:
    """Desglosa el precio de una unidad bajo un esquema."""
    base = _f(precio_base)
    desc = _f(scheme.get("descuento_pct"))
    firma_pct = _f(scheme.get("firma_pct"))
    mens_pct = _f(scheme.get("mensualidades_pct"))
    escr_pct = _f(scheme.get("escritura_pct"))
    apartado = round(_f(scheme.get("apartado_mxn")))

    precio_aplicado = round(base * (1 - desc / 100.0))
    firma = round(precio_aplicado * firma_pct / 100.0)
    mens_total = round(precio_aplicado * mens_pct / 100.0)
    # La escrituración absorbe el redondeo para que las 3 partes sumen exacto.
    escrituracion = precio_aplicado - firma - mens_total

    meses = resolve_months(scheme, fecha_inicio, fecha_entrega)
    mensualidad = round(mens_total / meses) if (meses and mens_total) else 0

    # En vivo: conforme pasan los meses desde el inicio de obra, las mensualidades
    # ya pagadas suben y las restantes bajan (se recalcula con la fecha de hoy).
    transcurridos, restantes = None, meses
    if meses and fecha_inicio:
        a = _parse_date(fecha_inicio)
        if a:
            now = datetime.now(timezone.utc)
            elapsed = (now.year - a[0]) * 12 + (now.month - a[1])
            transcurridos = max(0, min(meses, elapsed))
            restantes = max(0, meses - transcurridos)

    # Mensualidad para quien entra HOY: total de mensualidades ÷ meses restantes a la entrega.
    mensualidad_restante = round(mens_total / restantes) if (restantes and mens_total) else mensualidad

    return {
        "precio_base": round(base),
        "descuento_pct": desc,
        "precio_aplicado": precio_aplicado,
        "ahorro": round(base) - precio_aplicado,
        "apartado": apartado,
        "firma_pct": firma_pct,
        "firma": firma,
        "mensualidades_pct": mens_pct,
        "mensualidades_total": mens_total,
        "meses": meses,
        "mensualidad": mensualidad,
        "mensualidad_restante": mensualidad_restante,
        "meses_transcurridos": transcurridos,
        "meses_restantes": restantes,
        "mensualidades_pagadas": (transcurridos * mensualidad) if transcurridos else 0,
        "mensualidades_restantes_monto": (restantes * mensualidad) if (restantes and mensualidad) else 0,
        "escritura_pct": escr_pct,
        "escrituracion": escrituracion,
    }


# ─── Cotizador no-fijo: descuento interpolado por enganche ──────────────────────
def discount_for_enganche(schemes: List[Dict[str, Any]], enganche_pct: float) -> float:
    """Interpola el descuento para un enganche libre, usando los esquemas
    configurados como curva (puntos firma%→descuento%). Es el upgrade del founder
    ('cotizador no fijo'): cualquier enganche obtiene un descuento justo."""
    pts = sorted(
        {(_f(s.get("firma_pct")), _f(s.get("descuento_pct"))) for s in schemes if s},
        key=lambda p: p[0],
    )
    if not pts:
        return 0.0
    e = max(0.0, min(100.0, _f(enganche_pct)))
    if len(pts) == 1 or e <= pts[0][0]:
        return pts[0][1] if e <= pts[0][0] else _interp(pts, e)
    if e >= pts[-1][0]:
        return pts[-1][1]
    return _interp(pts, e)


def _interp(pts: List[tuple], x: float) -> float:
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        if x0 <= x <= x1:
            if x1 == x0:
                return y0
            t = (x - x0) / (x1 - x0)
            return round(y0 + t * (y1 - y0), 2)
    return pts[-1][1]


def compute_custom(precio_base: float, enganche_pct: float, schemes: List[Dict[str, Any]],
                   escritura_pct: Optional[float] = None, meses: Optional[int] = None,
                   fecha_inicio=None, fecha_entrega=None) -> Dict[str, Any]:
    """Cotizador flexible: el usuario mueve el enganche y todo se recalcula.
    El descuento sale de la curva; mensualidades = 100 − enganche − escritura."""
    eng = max(0.0, min(100.0, _f(enganche_pct)))
    # Escrituración por defecto: la más común entre los esquemas, o 70.
    if escritura_pct is None:
        escr_vals = [_f(s.get("escritura_pct")) for s in schemes if s]
        escritura_pct = max(set(escr_vals), key=escr_vals.count) if escr_vals else 70.0
    escritura_pct = max(0.0, min(100.0 - eng, _f(escritura_pct)))
    mens_pct = max(0.0, 100.0 - eng - escritura_pct)
    desc = discount_for_enganche(schemes, eng)

    scheme = {
        "nombre": "Cotización",
        "firma_pct": eng,
        "mensualidades_pct": mens_pct,
        "escritura_pct": escritura_pct,
        "descuento_pct": desc,
        "apartado_mxn": 0,
        "meses_override": meses,
    }
    out = compute_breakdown(precio_base, scheme, fecha_inicio, fecha_entrega)
    out["custom"] = True
    return out


# ─── Esquema por defecto (semilla para onboarding) ──────────────────────────────
def default_schemes() -> List[Dict[str, Any]]:
    """3 esquemas base (nombres persuasivos · el dev los edita)."""
    return [
        {"id": "esq_lista", "nombre": "Precio de lista", "firma_pct": 10, "mensualidades_pct": 20,
         "escritura_pct": 70, "descuento_pct": 0, "apartado_mxn": 50000, "meses_override": None},
        {"id": "esq_pref", "nombre": "Plan Preferente", "firma_pct": 20, "mensualidades_pct": 10,
         "escritura_pct": 70, "descuento_pct": 3, "apartado_mxn": 50000, "meses_override": None},
        {"id": "esq_patrim", "nombre": "Plan Patrimonio", "firma_pct": 30, "mensualidades_pct": 0,
         "escritura_pct": 70, "descuento_pct": 5, "apartado_mxn": 50000, "meses_override": None},
    ]
