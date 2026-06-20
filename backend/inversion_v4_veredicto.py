"""Veredicto en lenguaje natural (PROMPT v4 §1.1) — toma el resultado del motor y arma: semáforo (verde/amarillo/rojo),
nivel (FLOJA/SÓLIDA/EXCELENTE según TIR vs tasa libre de riesgo), y un párrafo simple para cliente sin conocimientos."""
from typing import Dict, Any, List


def _m(n) -> str:
    try:
        return f"${round(float(n)):,}".replace(",", ",")
    except (TypeError, ValueError):
        return "$0"


def veredicto(r: Dict[str, Any]) -> Dict[str, Any]:
    tir = r.get("tir_pct")
    cetes = r.get("cetes_1a_pct") or 7.0
    con_credito = r.get("con_credito")
    cred = r.get("credito") or {}
    al = r.get("alertas") or {}

    # nivel + semáforo (TIR vs tasa libre de riesgo)
    if tir is None:
        nivel, semaforo = "SIN DATOS", "gris"
    elif tir >= cetes + 5:
        nivel, semaforo = "EXCELENTE", "verde"
    elif tir >= cetes + 1:
        nivel, semaforo = "SÓLIDA", "verde"
    elif tir >= cetes:
        nivel, semaforo = "MODERADA", "amarillo"
    else:
        nivel, semaforo = "FLOJA", "rojo"

    p: List[str] = []
    # 1) vs CETES
    if tir is not None:
        if tir >= cetes:
            p.append(f"Esta inversión rinde ~{tir}% al año, por encima de CETES ({cetes}%) — tu dinero trabaja mejor que sin riesgo.")
        else:
            p.append(f"Esta inversión rinde ~{tir}% al año, por debajo de CETES ({cetes}%): la renta sola no le gana al dinero sin riesgo; se justifica por la plusvalía y por ser un activo real que controlas.")
    # 2) contado vs crédito
    if con_credito and r.get("apalancamiento"):
        if r["apalancamiento"] == "positivo":
            p.append("Con crédito CONVIENE: el inmueble rinde más que la tasa del banco, así que el préstamo amplifica tu ganancia.")
        else:
            p.append("OJO: con crédito el apalancamiento RESTA — el inmueble rinde menos que la tasa del banco. A esta tasa, conviene más al contado o esperar a que bajen las tasas.")
    # 3) ¿la renta cubre el crédito?
    if con_credito and cred.get("dscr") is not None:
        if cred["dscr"] >= 1:
            p.append(f"La renta cubre el crédito (cubre ~{cred.get('cobertura_renta_pct')}% de la mensualidad).")
        else:
            faltante = r.get("flujo_mensual_1")
            p.append(f"La renta NO cubre el crédito: sale de tu bolsa ~{_m(abs(faltante or 0))}/mes. Considera más enganche o mayor renta.")
    # 4) mejor año para vender
    if r.get("mejor_anio_venta"):
        p.append(f"El mejor momento para vender es alrededor del año {r['mejor_anio_venta']} (ahí tu rendimiento anual es máximo).")
    # 5) acciones concretas
    acciones: List[str] = []
    if al.get("dscr_bajo_1"):
        acciones.append("sube el enganche o busca una renta mayor para que la renta cubra el crédito")
    if al.get("cap_bajo_cetes"):
        acciones.append("negocia un mejor precio de entrada (el rendimiento de renta hoy es bajo)")
    if r.get("apalancamiento") == "negativo":
        acciones.append("evalúa comprar al contado o esperar tasas más bajas")
    if not acciones:
        acciones.append("aparta y avanza: los números respaldan la decisión")
    p.append("Qué hacer: " + "; ".join(acciones[:3]) + ".")

    return {"nivel": nivel, "semaforo": semaforo, "parrafo": " ".join(p),
            "resumen": f"INVERSIÓN: {nivel}", "acciones": acciones[:3]}
