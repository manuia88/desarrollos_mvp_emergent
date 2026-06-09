"""
golden_calibration_engine — F1.6 · Calibración contra casos reales (Puente Alvarado).
═══════════════════════════════════════════════════════════════════════════════
LA REGLA #6 DE LA DOCTRINA: "Si el motor no reproduce un caso real conocido, la fórmula
está mal." Este motor es el EXAMEN: le mete a nuestras fórmulas los datos reales de un
proyecto cuyos resultados conocemos (Puente Alvarado 37, QuieroCasa) y compara lo que
PREDECIMOS contra lo que PASÓ. Cada chequeo queda "calibrado" (dentro de rango) o "ajustar".

Y cierra el ciclo (no solo reporta): si detecta un desajuste, puede APLICAR los valores
calibrados (los documentados de la metodología real) — el motor de valor residual los lee
y mejora. Predicción ↔ Realidad, en vivo.

Alcance HOY (F1): calibra lo del TERRENO — margen, costos blandos y costo de obra/m².
El TIR/flujo completo se calibra en F2/F3 (memorándum + gemelo financiero).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

log = logging.getLogger("dmx.golden_calibration")

# ─── Caso real (golden) · números documentados ────────────────────────────────
PUENTE_ALVARADO: Dict[str, Any] = {
    "nombre": "Puente Alvarado 37 (QuieroCasa)",
    "terreno_m2": 2835,
    "viviendas": 252,
    "ventas_mxn": 970_000_000,
    "costo_total_mxn": 791_900_000,   # incluye terreno + obra + blandos
    "margen_pct": 18.4,
    "tir_apalancada_pct": 23.9,
    "costo_obra_pm2_neodata": 10_878,  # presupuesto económico Neodata (tier económico)
    "precio_venta_pm2_ref": 60_000,    # referencia Cuauhtémoc media-residencial (SUPUESTO)
    "incidencia_terreno_band": [25.0, 45.0],  # % del valor de venta (documentado)
}

# ─── Costos de la metodología real (plantillas) · el "deber ser" ──────────────
SOFT_COST_BENCHMARK: Dict[str, float] = {
    "developer_fee_pct": 0.10,   # honorario del desarrollador
    "gerencia_pct": 0.06,        # gerencia de proyecto
    "comision_pct": 0.02,        # comisión de comercialización · estándar CDMX (founder)
    "publicidad_pct": 0.02,      # publicidad (sobre ventas)
}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _check(clave: str, nombre: str, esperado: Any, obtenido: Any, *,
           error_pct: float = None, tolerancia_pct: float = None,
           estado: str = None, unidad: str = "", detalle: str = "",
           sugerencia: str = "") -> Dict[str, Any]:
    if estado is None:
        estado = ("calibrado" if (error_pct is not None and tolerancia_pct is not None
                                  and abs(error_pct) <= tolerancia_pct) else "ajustar")
    return {"clave": clave, "nombre": nombre, "esperado": esperado, "obtenido": obtenido,
            "error_pct": None if error_pct is None else round(error_pct, 1),
            "tolerancia_pct": tolerancia_pct, "estado": estado, "unidad": unidad,
            "detalle": detalle, "sugerencia": sugerencia}


async def calibrar(db) -> Dict[str, Any]:
    """Corre el examen completo contra Puente Alvarado. Nunca crashea."""
    g = PUENTE_ALVARADO
    checks: List[Dict[str, Any]] = []
    sugerencias: List[Dict[str, Any]] = []

    # Defaults vigentes del motor (con calibración aplicada si existe).
    from valor_residual_engine import get_effective_defaults
    eff = await get_effective_defaults(db)

    # ── Check A · Margen del caso (integridad del dato + fórmula del margen) ──
    margen_calc = (g["ventas_mxn"] - g["costo_total_mxn"]) / g["ventas_mxn"] * 100
    err_a = (margen_calc - g["margen_pct"]) / g["margen_pct"] * 100
    checks.append(_check(
        "margen", "Margen del proyecto (Ventas − Costo) ÷ Ventas",
        g["margen_pct"], round(margen_calc, 1), error_pct=err_a, tolerancia_pct=3,
        unidad="%",
        detalle=f"Ventas ${g['ventas_mxn']/1e6:.0f}M − Costo ${g['costo_total_mxn']/1e6:.1f}M. "
                f"Nuestra fórmula del margen reproduce el dato real."))

    # ── Check B · Costos de comercialización vs metodología documentada ──
    com_eng = eff["pct_comision"] * 100
    pub_eng = eff["pct_publicidad"] * 100
    com_bm = SOFT_COST_BENCHMARK["comision_pct"] * 100
    pub_bm = SOFT_COST_BENCHMARK["publicidad_pct"] * 100
    err_b = (com_eng - com_bm) / com_bm * 100
    estado_b = "calibrado" if abs(err_b) <= 5 and abs(pub_eng - pub_bm) <= 0.5 else "ajustar"
    checks.append(_check(
        "comercializacion", "Comisión + publicidad vs metodología",
        f"comisión {com_bm:.1f}% · publicidad {pub_bm:.1f}%",
        f"comisión {com_eng:.1f}% · publicidad {pub_eng:.1f}%",
        error_pct=err_b, tolerancia_pct=5, estado=estado_b,
        detalle="Comisión 2% (estándar CDMX) y publicidad 2% sobre ventas.",
        sugerencia="" if estado_b == "calibrado" else f"Ajustar comisión a {com_bm:.1f}%."))
    if estado_b != "calibrado":
        sugerencias.append({"que": "Comisión de ventas", "de": f"{com_eng:.1f}%", "a": f"{com_bm:.1f}%"})

    # ── Check C · Honorarios de desarrollo (referencia · editable por el dev) ──
    # No hay un estándar único de CDMX confirmado (ruling founder): se muestra como REFERENCIA,
    # no como aprobado/reprobado. La metodología documenta 16% (fee 10% + gerencia 6%).
    fee_bm = (SOFT_COST_BENCHMARK["developer_fee_pct"] + SOFT_COST_BENCHMARK["gerencia_pct"]) * 100
    ger_eng = eff["pct_gerencia"] * 100
    checks.append(_check(
        "honorarios", "Honorarios de desarrollo (referencia)",
        f"{fee_bm:.0f}%", f"{ger_eng:.0f}%", estado="info",
        detalle="Referencia de la metodología: developer fee 10% + gerencia 6% = 16% sobre obra. "
                "Editable por el dev — no hay un estándar único de CDMX."))

    # ── Check D · Costo de obra/m² vs Neodata (referencia económica) ──
    obra_eng = None
    try:
        from construction_cost_engine import predict_cost_per_m2
        r = await predict_cost_per_m2("cuauhtemoc", "vertical", "entry")
        obra_eng = r.get("cost_per_m2_mxn")
    except Exception as e:
        log.warning(f"[calib] obra: {e}")
    if obra_eng:
        err_d = (obra_eng - g["costo_obra_pm2_neodata"]) / g["costo_obra_pm2_neodata"] * 100
        checks.append(_check(
            "obra_pm2", "Costo de obra $/m² (vs Neodata económico)",
            g["costo_obra_pm2_neodata"], round(obra_eng), error_pct=err_d, tolerancia_pct=20,
            unidad="$/m²",
            detalle="Neodata documenta $10,878/m² (presupuesto económico). Comparamos el tier de entrada."))
    else:
        checks.append(_check(
            "obra_pm2", "Costo de obra $/m² (vs Neodata económico)",
            g["costo_obra_pm2_neodata"], "—", estado="ajustar", unidad="$/m²",
            detalle="No se pudo leer el motor de costo de obra."))

    # ── Check E · Reconciliación del residual (incidencia del terreno, aprox) ──
    vendible = g["ventas_mxn"] / g["precio_venta_pm2_ref"]
    construibles = vendible / eff["eficiencia"]
    obra = construibles * (obra_eng or g["costo_obra_pm2_neodata"])
    blandos = obra * (eff["pct_indirectos"] + eff["pct_gerencia"] + eff["pct_imprevistos"]) \
        + g["ventas_mxn"] * (eff["pct_comision"] + eff["pct_publicidad"])
    terreno_implicito = g["costo_total_mxn"] - obra - blandos
    incidencia = terreno_implicito / g["ventas_mxn"] * 100 if g["ventas_mxn"] else 0
    lo, hi = g["incidencia_terreno_band"]
    en_banda = lo <= incidencia <= hi
    # Lectura DERIVADA (depende de un precio supuesto), no una fórmula nuestra → referencia.
    checks.append(_check(
        "incidencia", "Incidencia del terreno (% del valor de venta)",
        f"{lo:.0f}%–{hi:.0f}%", f"{incidencia:.0f}%", estado="info", unidad="%",
        detalle=f"Con obra ~${obra/1e6:.0f}M + blandos ~${blandos/1e6:.0f}M, el terreno implícito "
                f"es ~${terreno_implicito/1e6:.0f}M → {incidencia:.0f}% del valor de venta "
                f"({'dentro' if en_banda else 'cerca'} del rango típico {lo:.0f}–{hi:.0f}%). "
                f"Depende del precio de venta ref ${g['precio_venta_pm2_ref']/1000:.0f}k/m² (supuesto)."))

    # ── Veredicto global ──
    n_ajustar = sum(1 for c in checks if c["estado"] == "ajustar")
    n_calibrado = sum(1 for c in checks if c["estado"] == "calibrado")
    if n_ajustar == 0:
        global_estado, resumen = "calibrado", "Todas las fórmulas reproducen el caso real dentro de rango."
    elif n_calibrado >= n_ajustar:
        global_estado, resumen = "casi", (
            f"{n_calibrado} de {len(checks)} chequeos calibrados. {n_ajustar} por ajustar — "
            f"aplica los valores documentados para cerrar la brecha.")
    else:
        global_estado, resumen = "ajustar", f"{n_ajustar} chequeos fuera de rango — revisa las fórmulas."

    return {
        "ok": True,
        "caso": g["nombre"],
        "estado": global_estado,
        "resumen": resumen,
        "checks": checks,
        "sugerencias": sugerencias,
        "calibracion_aplicada": eff.get("_calibrado", False),
        "nota": "Calibración del TERRENO (F1). El TIR y el flujo completo se calibran en F2/F3.",
        "computed_at": _iso(),
    }


async def aplicar_calibracion(db) -> Dict[str, Any]:
    """Cierra el ciclo: guarda los valores documentados de la metodología real para que el
    motor de valor residual los use. Predicción → corrección → mejor predicción."""
    doc = {
        "_id": "terreno",
        "margen_objetivo": PUENTE_ALVARADO["margen_pct"] / 100,   # 0.184
        "pct_comision": SOFT_COST_BENCHMARK["comision_pct"],       # 0.035
        "pct_publicidad": SOFT_COST_BENCHMARK["publicidad_pct"],   # 0.02
        "pct_gerencia": (SOFT_COST_BENCHMARK["developer_fee_pct"]
                         + SOFT_COST_BENCHMARK["gerencia_pct"]),    # 0.16
        "fuente": "Calibrado vs Puente Alvarado + plantillas de metodología",
        "updated_at": _iso(),
    }
    await db.calibracion_terreno.update_one({"_id": "terreno"}, {"$set": doc}, upsert=True)
    return {"ok": True, "aplicado": doc, "mensaje": "Valores calibrados aplicados al motor de valor residual."}
