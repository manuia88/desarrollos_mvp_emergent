"""W5.x F6 Sub-A · Tax/Legal Projector CDMX engine.

Engine para calcular escenario fiscal de un inmueble en CDMX:
  - ISR vendedor (ART 126 LISR · cuota_fija + marginal)
  - ISAI comprador (CDMX brackets 2026)
  - Predial proyectado 10 anios (factor 1.06)
  - Closing cost total comprador

Constantes hardcoded (NO red live): LISR brackets · ISAI CDMX · INPC ancla.
Todas las funciones fail-soft: si error, retornan {"ok": False, "reason": ...}.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.tax_projector")

# ─── Constantes hardcoded ────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════
# TABLAS OFICIALES 2026 · verificadas contra fuentes públicas .gob.mx
# ═══════════════════════════════════════════════════════════════════════════
# Tarifa ART 126 LISR · pagos provisionales por enajenación de inmuebles 2026
# FUENTE: SAT · Anexo 8 RMF 2026 · publicado DOF 28-diciembre-2025
# URL: https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo-8-RMF-2026_DOF-28122025.pdf
# Sección A.I · pago 21/05/2026 13:22 · Ref: 212279 (PDF founder benchmark)
# Validación: utilidad anual $162,454.40 → ISR anual $13,944.64 → × 20 años = $278,892.80 (PDF: $278,893)
LISR_ART_126_BRACKETS_2026: List[Dict[str, float]] = [
    {"limite_inferior": 0.01,         "limite_superior": 10135.11,    "cuota_fija": 0.00,        "marginal_pct": 1.92},
    {"limite_inferior": 10135.12,     "limite_superior": 86022.11,    "cuota_fija": 194.59,      "marginal_pct": 6.40},
    {"limite_inferior": 86022.12,     "limite_superior": 151176.19,   "cuota_fija": 5051.37,     "marginal_pct": 10.88},
    {"limite_inferior": 151176.20,    "limite_superior": 175735.66,   "cuota_fija": 12140.13,    "marginal_pct": 16.00},
    {"limite_inferior": 175735.67,    "limite_superior": 210403.69,   "cuota_fija": 16069.64,    "marginal_pct": 17.92},
    {"limite_inferior": 210403.70,    "limite_superior": 424353.97,   "cuota_fija": 22282.14,    "marginal_pct": 21.36},
    {"limite_inferior": 424353.98,    "limite_superior": 668840.14,   "cuota_fija": 67981.92,    "marginal_pct": 23.52},
    {"limite_inferior": 668840.15,    "limite_superior": 1276925.98,  "cuota_fija": 125485.07,   "marginal_pct": 30.00},
    {"limite_inferior": 1276925.99,   "limite_superior": 1702567.97,  "cuota_fija": 307910.81,   "marginal_pct": 32.00},
    {"limite_inferior": 1702567.98,   "limite_superior": 5107703.92,  "cuota_fija": 444116.23,   "marginal_pct": 34.00},
    {"limite_inferior": 5107703.93,   "limite_superior": 1e18,        "cuota_fija": 1601862.46,  "marginal_pct": 35.00},
]

# Tarifa ART 113 CFCDMX · ISAI 2026 · post-reforma vigente 1-enero-2026
# FUENTE: Gaceta Oficial CDMX · No. 1762 Tomo II · publicada 19-diciembre-2025
# URL: https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/bbd22f0b2fab730aa4dc56e3e207b4c1.pdf
# Validación: precio $7,400,000 (rango H · cuota fija $324,325.98 · factor 0.06425) → ISAI $431,464.39 (PDF: $431,464)
# NOTA: tabla usa "factor" decimal (no porcentaje) · convertimos a pct multiplicando × 100
ISAI_CDMX_BRACKETS_2026: List[Dict[str, float]] = [
    {"limite_inferior": 0.12,           "limite_superior": 123988.81,    "cuota_fija": 327.29,        "marginal_pct": 1.446},
    {"limite_inferior": 123988.82,      "limite_superior": 198382.03,    "cuota_fija": 2120.18,       "marginal_pct": 3.083},
    {"limite_inferior": 198382.04,      "limite_superior": 297572.76,    "cuota_fija": 4413.73,       "marginal_pct": 4.028},
    {"limite_inferior": 297572.77,      "limite_superior": 595145.67,    "cuota_fija": 8409.14,       "marginal_pct": 4.699},
    {"limite_inferior": 595145.68,      "limite_superior": 1487864.15,   "cuota_fija": 22392.10,      "marginal_pct": 5.219},
    {"limite_inferior": 1487864.16,     "limite_superior": 2975728.34,   "cuota_fija": 68983.09,      "marginal_pct": 5.702},
    {"limite_inferior": 2975728.35,     "limite_superior": 5732476.11,   "cuota_fija": 153821.12,     "marginal_pct": 6.185},
    {"limite_inferior": 5732476.12,     "limite_superior": 14928323.92,  "cuota_fija": 324325.98,     "marginal_pct": 6.425},
    {"limite_inferior": 14928323.93,    "limite_superior": 27529938.63,  "cuota_fija": 915159.21,     "marginal_pct": 6.495},
    {"limite_inferior": 27529938.64,    "limite_superior": 55059877.21,  "cuota_fija": 1733634.09,    "marginal_pct": 6.546},
    {"limite_inferior": 55059877.22,    "limite_superior": 1e18,         "cuota_fija": 3535743.88,    "marginal_pct": 9.018},
]

# Tarifa ART 130 CFCDMX · IMPUESTO PREDIAL 2026 · bimestral
# FUENTE: Gaceta Oficial CDMX · No. 1762 Tomo II · publicada 19-diciembre-2025
# Bimestral · multiplicar × 6 para anual · base = valor catastral
# NOTA CRÍTICA: la Gaceta muestra "PORCENTAJE" con valores tipo 0.02080 → significa 0.02080% (no 2.08%)
# Para usar en _aplicar_tarifa (que divide / 100), guardamos el valor TAL CUAL aparece en la Gaceta
# Ejemplo: marginal_pct=0.02080 → calc final = excedente × 0.02080 / 100 = excedente × 0.000208
PREDIAL_CDMX_BRACKETS_2026: List[Dict[str, float]] = [
    {"limite_inferior": 0.12,           "limite_superior": 235095.02,    "cuota_fija": 231.00,        "marginal_pct": 0.02080},
    {"limite_inferior": 235095.03,      "limite_superior": 470189.36,    "cuota_fija": 279.91,        "marginal_pct": 0.03889},
    {"limite_inferior": 470189.37,      "limite_superior": 940380.47,    "cuota_fija": 371.35,        "marginal_pct": 0.12149},
    {"limite_inferior": 940380.48,      "limite_superior": 1410569.80,   "cuota_fija": 942.60,        "marginal_pct": 0.14625},
    {"limite_inferior": 1410569.81,     "limite_superior": 1880760.95,   "cuota_fija": 1630.26,       "marginal_pct": 0.14723},
    {"limite_inferior": 1880760.96,     "limite_superior": 2350950.27,   "cuota_fija": 2322.53,       "marginal_pct": 0.16801},
    {"limite_inferior": 2350950.28,     "limite_superior": 2821139.60,   "cuota_fija": 3112.51,       "marginal_pct": 0.17052},
    {"limite_inferior": 2821139.61,     "limite_superior": 3291330.76,   "cuota_fija": 3914.29,       "marginal_pct": 0.18305},
    {"limite_inferior": 3291330.77,     "limite_superior": 3761520.09,   "cuota_fija": 4774.98,       "marginal_pct": 0.18814},
    {"limite_inferior": 3761520.10,     "limite_superior": 4231711.25,   "cuota_fija": 5659.60,       "marginal_pct": 0.19034},
    {"limite_inferior": 4231711.26,     "limite_superior": 4701900.56,   "cuota_fija": 6554.57,       "marginal_pct": 0.19292},
    {"limite_inferior": 4701900.57,     "limite_superior": 5172089.90,   "cuota_fija": 7461.67,       "marginal_pct": 0.19490},
    {"limite_inferior": 5172089.91,     "limite_superior": 5642728.83,   "cuota_fija": 8378.08,       "marginal_pct": 0.20261},
    {"limite_inferior": 5642728.84,     "limite_superior": 16928184.61,  "cuota_fija": 9331.65,       "marginal_pct": 0.26334},
    {"limite_inferior": 16928184.62,    "limite_superior": 35629332.11,  "cuota_fija": 39050.78,      "marginal_pct": 0.26142},
    {"limite_inferior": 35629332.12,    "limite_superior": 1e18,         "cuota_fija": 87939.33,      "marginal_pct": 0.30909},
]

# INPC mensual histórico · FUENTE: INEGI/BANXICO · valores oficiales con 4 decimales
# Base 2da quincena julio 2018 = 100
# URL: https://www.inegi.org.mx/app/indicesdeprecios/Estructura.aspx
INPC_ANCHORS: List[Tuple[str, float]] = [
    ("2005-10", 59.4546),
    ("2010-12", 74.9310),
    ("2015-12", 89.0468),
    ("2020-12", 109.2710),
    ("2024-12", 137.9490),
    ("2025-12", 143.0420),
    ("2026-01", 143.5880),
    ("2026-02", 144.3070),
    ("2026-03", 145.5440),
    ("2026-04", 145.8310),
]

# Closing cost percentages (sobre precio_venta · servicios sujetos a IVA 16%)
NOTARIO_FEE_PCT = 1.0
AVALUO_FEE_PCT = 0.25
GESTORIAS_FEE_PCT = 0.25
REGISTRO_FEE_PCT = 0.30
IVA_PCT = 16.0

# Depreciacion construccion: 3% por anio · cap acumulado 80%
DEPRECIACION_ANUAL_PCT = 3.0
DEPRECIACION_CAP_PCT = 80.0

# Predial proyeccion: factor anual conservador 1.06 (inflacion + reajuste catastral)
PREDIAL_FACTOR_ANUAL = 1.06


# ─── Helpers internos ────────────────────────────────────────────────────────
def _parse_ymd(text: str) -> datetime:
    """Parse YYYY-MM-DD a datetime · acepta tambien ISO completo."""
    if isinstance(text, datetime):
        return text
    s = str(text)[:10]
    return datetime.strptime(s, "%Y-%m-%d")


def _inpc_for(date: datetime) -> float:
    """INPC para una fecha · reglas LISR Art. 7:
    - Para enajenación se usa el INPC del MES INMEDIATO ANTERIOR al de la operación
    - Si el INPC del mes anterior NO está publicado · usar el ÚLTIMO PUBLICADO
    - Entre meses publicados: interpolación lineal (no extrapolación)
    """
    # Tomar INPC del MES INMEDIATO ANTERIOR (regla LISR Art. 7-A)
    if date.month == 1:
        prior_month_str = f"{date.year - 1}-12"
    else:
        prior_month_str = f"{date.year}-{date.month - 1:02d}"
    prior_ts = datetime.strptime(prior_month_str, "%Y-%m").timestamp()
    anchors = [(datetime.strptime(d, "%Y-%m"), v) for d, v in INPC_ANCHORS]
    last_anchor = anchors[-1]
    # Si el mes prior está MÁS ALLÁ del último ancla publicado → usar último publicado
    if prior_ts >= last_anchor[0].timestamp():
        return last_anchor[1]
    # Antes del primer ancla · usar primero
    if prior_ts <= anchors[0][0].timestamp():
        return anchors[0][1]
    # Match exacto a un ancla
    for a in anchors:
        if a[0].timestamp() == prior_ts:
            return a[1]
    # Interpolar entre los dos ancla que rodean (escenario fallback)
    for i in range(len(anchors) - 1):
        a, b = anchors[i], anchors[i + 1]
        a_ts, b_ts = a[0].timestamp(), b[0].timestamp()
        if a_ts <= prior_ts <= b_ts:
            ratio = (prior_ts - a_ts) / (b_ts - a_ts)
            return a[1] + ratio * (b[1] - a[1])
    return last_anchor[1]


def _aplicar_tarifa(base: float, brackets: List[Dict[str, float]]) -> Dict[str, float]:
    """Aplica tarifa progresiva · retorna {impuesto, bracket_idx, excedente, marginal_pct}."""
    if base <= 0:
        return {"impuesto": 0.0, "bracket_idx": 0, "excedente": 0.0, "marginal_pct": 0.0}
    for i, b in enumerate(brackets):
        if b["limite_inferior"] <= base <= b["limite_superior"]:
            excedente = base - b["limite_inferior"]
            impuesto = b["cuota_fija"] + (excedente * b["marginal_pct"] / 100.0)
            return {"impuesto": round(impuesto, 2), "bracket_idx": i, "excedente": round(excedente, 2), "marginal_pct": b["marginal_pct"]}
    # Si no encaja (no deberia con limite 1e18), usar ultimo
    last = brackets[-1]
    excedente = base - last["limite_inferior"]
    impuesto = last["cuota_fija"] + (excedente * last["marginal_pct"] / 100.0)
    return {"impuesto": round(impuesto, 2), "bracket_idx": len(brackets) - 1, "excedente": round(excedente, 2), "marginal_pct": last["marginal_pct"]}


# ─── Funciones publicas ──────────────────────────────────────────────────────
def calculate_isr_vendedor(
    precio_compra: float,
    fecha_compra: str,
    precio_venta: float,
    fecha_venta: str,
    terreno_pct: float = 0.20,
    participacion_pct: float = 1.0,
) -> Dict[str, Any]:
    """ISR vendedor segun ART 126 LISR (CDMX · personas fisicas).

    Lectura del PDF real ref 212279:
      - Split 80% construccion / 20% terreno (override por avaluo si user provee terreno_pct)
      - Depreciar construccion 3%/anio (cap 80%)
      - Actualizar ambas partes con factor INPC (venta / compra)
      - Ganancia gravable = precio_venta - deducciones_actualizadas
      - Ganancia acumulable = gravable / anios (max 20)
      - Tarifa ART 126 → cuota_fija + (excedente * marginal_pct)
      - Multiplicar resultado por anios = ISR total
      - ISR entidad federativa = 5% sobre ganancia · ISR federacion = total - entidad
    """
    try:
        if precio_compra <= 0 or precio_venta <= 0:
            return {"ok": False, "reason": "Precios deben ser positivos"}
        if not (0.05 <= terreno_pct <= 0.5):
            return {"ok": False, "reason": "terreno_pct fuera de rango (0.05 - 0.5)"}
        d_compra = _parse_ymd(fecha_compra)
        d_venta = _parse_ymd(fecha_venta)
        if d_venta <= d_compra:
            return {"ok": False, "reason": "fecha_venta debe ser posterior a fecha_compra"}

        anios = max(1, min(20, int((d_venta - d_compra).days / 365.25)))
        inpc_compra = _inpc_for(d_compra)
        inpc_venta = _inpc_for(d_venta)
        factor_inpc = inpc_venta / inpc_compra if inpc_compra > 0 else 1.0

        construccion_pct = 1.0 - terreno_pct
        valor_terreno_original = precio_compra * terreno_pct
        valor_construccion_original = precio_compra * construccion_pct

        # Depreciacion construccion
        depreciacion_total_pct = min(DEPRECIACION_CAP_PCT, DEPRECIACION_ANUAL_PCT * anios) / 100.0
        valor_construccion_depreciado = valor_construccion_original * (1.0 - depreciacion_total_pct)

        # Actualizacion INPC
        terreno_actualizado = round(valor_terreno_original * factor_inpc, 2)
        construccion_actualizada = round(valor_construccion_depreciado * factor_inpc, 2)
        deducciones_actualizadas = round(terreno_actualizado + construccion_actualizada, 2)

        # Ganancia gravable (aplicar participacion para co-propietarios)
        ganancia_total = max(0.0, precio_venta - deducciones_actualizadas)
        ganancia_gravable = round(ganancia_total * participacion_pct, 2)
        ganancia_acumulable = round(ganancia_gravable / anios, 2)

        tarifa = _aplicar_tarifa(ganancia_acumulable, LISR_ART_126_BRACKETS_2026)
        isr_total = round(tarifa["impuesto"] * anios, 2)

        # Split entidad federativa (5% s/ganancia) vs federacion (resto)
        isr_entidad = round(ganancia_gravable * 0.05, 2)
        isr_federacion = round(max(0.0, isr_total - isr_entidad), 2)
        tasa_efectiva = round((isr_total / ganancia_gravable * 100.0) if ganancia_gravable > 0 else 0.0, 2)

        return {
            "ok": True,
            "deducciones_actualizadas": deducciones_actualizadas,
            "ganancia_gravable": ganancia_gravable,
            "ganancia_acumulable": ganancia_acumulable,
            "isr_federacion": isr_federacion,
            "isr_entidad": isr_entidad,
            "isr_total": isr_total,
            "breakdown": {
                "anios_tenencia": anios,
                "inpc_compra": round(inpc_compra, 4),
                "inpc_venta": round(inpc_venta, 4),
                "factor_inpc": round(factor_inpc, 4),
                "terreno_pct": terreno_pct,
                "construccion_pct": round(construccion_pct, 4),
                "valor_terreno_original": round(valor_terreno_original, 2),
                "valor_construccion_original": round(valor_construccion_original, 2),
                "depreciacion_total_pct": round(depreciacion_total_pct * 100.0, 2),
                "valor_construccion_depreciado": round(valor_construccion_depreciado, 2),
                "terreno_actualizado": terreno_actualizado,
                "construccion_actualizada": construccion_actualizada,
                "ganancia_total": round(ganancia_total, 2),
                "participacion_pct": participacion_pct,
                "tarifa_bracket_idx": tarifa["bracket_idx"],
                "tarifa_marginal_pct": tarifa["marginal_pct"],
                "tasa_efectiva_pct": tasa_efectiva,
            },
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax] calculate_isr_vendedor failed: {e}")
        return {"ok": False, "reason": str(e)}


def calculate_isai_comprador(
    precio_venta: float,
    valor_catastral: float,
    year: int = 2026,
) -> Dict[str, Any]:
    """ISAI CDMX · base = mayor(precio_venta, valor_catastral) · tarifa progresiva 2026."""
    try:
        if precio_venta <= 0 or valor_catastral < 0:
            return {"ok": False, "reason": "Montos deben ser positivos"}
        base = max(precio_venta, valor_catastral)
        tarifa = _aplicar_tarifa(base, ISAI_CDMX_BRACKETS_2026)
        isai = tarifa["impuesto"]
        tasa_efectiva = round((isai / base * 100.0) if base > 0 else 0.0, 2)
        return {
            "ok": True,
            "base": round(base, 2),
            "isai": isai,
            "breakdown": {
                "year": year,
                "precio_venta": round(precio_venta, 2),
                "valor_catastral": round(valor_catastral, 2),
                "base_usada": "precio_venta" if precio_venta >= valor_catastral else "valor_catastral",
                "bracket_idx": tarifa["bracket_idx"],
                "marginal_pct": tarifa["marginal_pct"],
                "excedente": tarifa["excedente"],
                "tasa_efectiva_pct": tasa_efectiva,
            },
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax] calculate_isai_comprador failed: {e}")
        return {"ok": False, "reason": str(e)}


def project_predial_10y(
    valor_catastral: float,
    year_base: int = 2026,
    tipo: str = "habitacional",
    predial_anual_actual: Optional[float] = None,
) -> Dict[str, Any]:
    """Proyección 10 años predial · 2 modos:

    MODO 1 (preferido · más preciso): si user pasa `predial_anual_actual` (lo conoce de su recibo),
    proyectamos hacia adelante con factor 1.06/año. Captura automáticamente todos los descuentos
    aplicables al caso real del usuario (vulnerable, pago anticipado, etc.).

    MODO 2 (fallback · cálculo teórico): si no pasa predial_anual_actual, usamos tabla oficial
    ART 130 CFCDMX 2026 sobre valor_catastral. Resultado es el catálogo BRUTO sin descuentos.

    FUENTE tabla: Gaceta Oficial CDMX 19-dic-2025 No. 1762 Tomo II.
    """
    try:
        if valor_catastral <= 0 and not predial_anual_actual:
            return {"ok": False, "reason": "valor_catastral o predial_anual_actual requeridos"}

        items: List[Dict[str, Any]] = []
        modo = "user_actual" if predial_anual_actual and predial_anual_actual > 0 else "tabla_oficial"

        if modo == "user_actual":
            # MODO 1: proyectar el predial actual con factor anual
            for i in range(10):
                year = year_base + i
                predial = round(predial_anual_actual * (PREDIAL_FACTOR_ANUAL ** i), 2)
                valor_proy = round(valor_catastral * (PREDIAL_FACTOR_ANUAL ** i), 2) if valor_catastral > 0 else 0
                items.append({
                    "year": year,
                    "valor_catastral_proyectado": valor_proy,
                    "predial_estimado": predial,
                    "modo": "user_actual",
                })
        else:
            # MODO 2: calcular desde valor catastral con tabla oficial
            tipo_multiplier = 1.5 if tipo == "no_habitacional" else 1.0
            for i in range(10):
                year = year_base + i
                valor_year = valor_catastral * (PREDIAL_FACTOR_ANUAL ** i)
                tarifa = _aplicar_tarifa(valor_year, PREDIAL_CDMX_BRACKETS_2026)
                predial_bimestral = tarifa["impuesto"]
                predial_anual = round(predial_bimestral * 6 * tipo_multiplier, 2)
                items.append({
                    "year": year,
                    "valor_catastral_proyectado": round(valor_year, 2),
                    "predial_estimado": predial_anual,
                    "bracket_idx": tarifa["bracket_idx"],
                    "modo": "tabla_oficial",
                })
        total_10y = round(sum(it["predial_estimado"] for it in items), 2)
        return {
            "ok": True,
            "items": items,
            "total_10y": total_10y,
            "breakdown": {
                "modo": modo,
                "tipo": tipo,
                "predial_y1": items[0]["predial_estimado"] if items else 0,
                "factor_anual_reajuste": PREDIAL_FACTOR_ANUAL,
                "valor_catastral_base": round(valor_catastral, 2) if valor_catastral > 0 else None,
                "predial_anual_actual_input": round(predial_anual_actual, 2) if predial_anual_actual else None,
                "tabla_oficial": "ART 130 CFCDMX 2026 (Gaceta 19-dic-2025)" if modo == "tabla_oficial" else None,
                "nota": (
                    "Proyección basada en tu predial actual ajustado por inflación catastral 6%/año. Captura los descuentos aplicables a tu caso."
                    if modo == "user_actual"
                    else "Cálculo bruto del catálogo Art 130. CDMX otorga descuentos: 8% pago anual enero, 5% febrero, hasta 30% para grupos vulnerables. Tu predial real puede ser menor."
                ),
            },
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax] project_predial_10y failed: {e}")
        return {"ok": False, "reason": str(e)}


def calculate_closing_cost_total(
    precio_venta: float,
    valor_catastral: float,
    year: int = 2026,
) -> Dict[str, Any]:
    """Costo total de cierre comprador · ISAI + notario + avaluo + gestorias + registro + IVA."""
    try:
        if precio_venta <= 0:
            return {"ok": False, "reason": "precio_venta debe ser positivo"}
        isai_res = calculate_isai_comprador(precio_venta, valor_catastral, year=year)
        isai = isai_res.get("isai", 0.0) if isai_res.get("ok") else 0.0

        notario_fees = round(precio_venta * NOTARIO_FEE_PCT / 100.0, 2)
        avaluo = round(precio_venta * AVALUO_FEE_PCT / 100.0, 2)
        gestorias = round(precio_venta * GESTORIAS_FEE_PCT / 100.0, 2)
        registro = round(precio_venta * REGISTRO_FEE_PCT / 100.0, 2)
        servicios_subtotal = notario_fees + avaluo + gestorias + registro
        iva = round(servicios_subtotal * IVA_PCT / 100.0, 2)
        total = round(isai + notario_fees + avaluo + gestorias + registro + iva, 2)

        return {
            "ok": True,
            "isai": isai,
            "notario_fees": notario_fees,
            "avaluo": avaluo,
            "gestorias": gestorias,
            "registro": registro,
            "iva": iva,
            "total": total,
            "breakdown": {
                "precio_venta": round(precio_venta, 2),
                "valor_catastral": round(valor_catastral, 2),
                "year": year,
                "servicios_subtotal": round(servicios_subtotal, 2),
                "isai_pct_of_total": round((isai / total * 100.0) if total > 0 else 0.0, 2),
                "rates": {
                    "notario_pct": NOTARIO_FEE_PCT,
                    "avaluo_pct": AVALUO_FEE_PCT,
                    "gestorias_pct": GESTORIAS_FEE_PCT,
                    "registro_pct": REGISTRO_FEE_PCT,
                    "iva_pct": IVA_PCT,
                },
            },
        }
    except Exception as e:  # noqa: BLE001
        log.warning(f"[tax] calculate_closing_cost_total failed: {e}")
        return {"ok": False, "reason": str(e)}


# ─── Self-test ───────────────────────────────────────────────────────────────
def _test_self() -> Dict[str, str]:
    """Corre 3 benchmarks reales contra PDF notario · TOLERANCIA ±$5 (tablas oficiales).

    Benchmarks verifican que las tablas oficiales (SAT DOF + Gaceta CDMX) reproducen
    al peso los cálculos del notario. Si falla → algún valor de la tabla está mal.
    """
    results: Dict[str, str] = {}

    # 1. PDF ref 212279 (Notario Luis Felipe Morales Viesca):
    #    compra 2005-10-21 $2M · venta 2026-05-18 $5.8M · 20 años · split 80/20 · INPC factor 2.4528
    #    → ISR vendedor EXACTO: $278,893 (con tabla SAT DOF 28-dic-2025)
    r1 = calculate_isr_vendedor(2_000_000, "2005-10-21", 5_800_000, "2026-05-18")
    if r1.get("ok"):
        isr = r1.get("isr_total", 0)
        ok = abs(isr - 278_893) <= 5  # tolerancia ±$5 con tablas oficiales
        results["isr_vendedor_pdf"] = f"{'OK' if ok else 'FAIL'} · isr_total={isr:,.2f} (esperado $278,893 ±$5)"
    else:
        results["isr_vendedor_pdf"] = f"FAIL · {r1.get('reason')}"

    # 2. ISAI PDF: precio $7,400,000 · catastral $3,444,453 → ISAI EXACTO: $431,464
    #    (Gaceta CDMX 19-dic-2025 · rango H · cuota fija $324,325.98 · factor 0.06425)
    r2 = calculate_isai_comprador(7_400_000, 3_444_453)
    if r2.get("ok"):
        isai = r2.get("isai", 0)
        ok = abs(isai - 431_464) <= 5  # tolerancia ±$5
        results["isai_comprador"] = f"{'OK' if ok else 'FAIL'} · isai={isai:,.2f} (esperado $431,464 ±$5)"
    else:
        results["isai_comprador"] = f"FAIL · {r2.get('reason')}"

    # 3. Closing total $7.4M (reporta · no falla)
    r3 = calculate_closing_cost_total(7_400_000, 3_444_453)
    if r3.get("ok"):
        total = r3.get("total", 0)
        results["closing_total"] = f"OK · total={total:,.2f}"
    else:
        results["closing_total"] = f"FAIL · {r3.get('reason')}"

    # 4. Predial $5M valor catastral · habitacional · primer año
    r4 = project_predial_10y(5_000_000, year_base=2026, tipo="habitacional")
    if r4.get("ok") and r4.get("items"):
        predial_y1 = r4["items"][0]["predial_estimado"]
        results["predial_y1"] = f"OK · año 2026 predial={predial_y1:,.2f}"
    else:
        results["predial_y1"] = f"FAIL · {r4.get('reason')}"

    for k, v in results.items():
        log.info(f"[tax_self_test] {k}: {v}")
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(_test_self())
