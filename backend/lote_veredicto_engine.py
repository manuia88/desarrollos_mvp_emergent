"""
lote_veredicto_engine — F1.5 · El veredicto único del lote (una sola lectura agéntica).
═══════════════════════════════════════════════════════════════════════════════
QUÉ HACE: en una sola acción, el asistente "lee" el lote completo — corre las 3
herramientas del terreno (Valor Residual F1.2 + Due Diligence F1.3 + Norma 3 F1.4),
las sintetiza en un VEREDICTO claro ("paga hasta $X · margen sano · 2 cosas que
revisar · +$7.2M si fusionas") y devuelve TODO en un solo paquete.

Así la pantalla muestra primero la RESPUESTA (principio UX/UI inviolable) y el detalle
queda bajo demanda. El frontend hace UNA llamada en vez de tres.

REUTILIZA los 3 motores ya construidos (cero lógica nueva de cálculo). Solo orquesta +
sintetiza en lenguaje simple, con la Doctrina de Datos intacta. Cero deuda, fail-open:
si una herramienta falla, el veredicto se arma con las demás.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.lote_veredicto")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fmt_mxn(n: Optional[float]) -> str:
    if n is None:
        return "—"
    return "$" + format(int(round(n)), ",d")


def _semaforo_global(residual_sem: Optional[str], dd_alertas: int) -> str:
    """Combina el semáforo del precio con las alertas de la revisión del predio."""
    if residual_sem == "rojo":
        return "rojo"
    if residual_sem == "amarillo" or dd_alertas > 0:
        return "amarillo"
    return "verde"


async def analizar_lote(
    db,
    terreno_m2: float,
    categoria: str = "media",
    colonia_id: Optional[str] = None,
    cus_manual: Optional[float] = None,
    precio_venta_pm2_manual: Optional[float] = None,
    costo_obra_pm2_manual: Optional[float] = None,
    margen_objetivo: Optional[float] = None,
    eficiencia: Optional[float] = None,
    comision_pct_manual: Optional[float] = None,
    honorarios_pct_manual: Optional[float] = None,
    city: str = "CDMX",
) -> Dict[str, Any]:
    """Corre las 3 herramientas y arma el veredicto único. Nunca crashea."""
    # 1) Valor Residual (el número) — núcleo; si esto falla, no hay veredicto.
    from valor_residual_engine import calcular_residual
    residual = await calcular_residual(
        db, terreno_m2=terreno_m2, categoria=categoria, colonia_id=colonia_id,
        cus_manual=cus_manual, precio_venta_pm2_manual=precio_venta_pm2_manual,
        costo_obra_pm2_manual=costo_obra_pm2_manual, margen_objetivo=margen_objetivo,
        eficiencia=eficiencia, comision_pct_manual=comision_pct_manual,
        honorarios_pct_manual=honorarios_pct_manual, city=city)

    # 2) Due Diligence (qué revisar) — fail-open.
    dd = None
    try:
        from predio_due_diligence_engine import generar_due_diligence
        dd = await generar_due_diligence(db, colonia_id=colonia_id, superficie_m2=terreno_m2, city=city)
    except Exception as e:
        log.warning(f"[veredicto] due-diligence: {e}")

    # 3) Norma 3 (oportunidad de fusión) — solo con colonia; fail-open.
    n3 = None
    if colonia_id:
        try:
            from norma3_engine import detectar_fusiones
            n3 = await detectar_fusiones(db, colonia_id=colonia_id, terreno_m2=terreno_m2,
                                         categoria=categoria, city=city)
        except Exception as e:
            log.warning(f"[veredicto] norma3: {e}")

    # ── Síntesis (la lectura agéntica, en lenguaje simple) ──
    resp = residual.get("respuesta", {})
    oferta = resp.get("oferta_maxima_terreno")
    oferta_pm2 = resp.get("oferta_pm2_terreno")
    residual_sem = resp.get("semaforo")

    dd_conteo = (dd or {}).get("conteo", {}) if dd else {}
    dd_alertas = dd_conteo.get("alertas", 0)
    dd_pend = dd_conteo.get("pendientes", 0)

    ops = (n3 or {}).get("oportunidades", []) if n3 else []
    mejor_op = ops[0] if ops else None

    semaforo = _semaforo_global(residual_sem, dd_alertas)

    lo_que_vi: List[Dict[str, str]] = []
    # Precio
    lo_que_vi.append({
        "icono": "money", "tema": "Precio",
        "texto": f"Tu oferta máxima es {_fmt_mxn(oferta)} ({_fmt_mxn(oferta_pm2)}/m²). "
                 f"{resp.get('lectura', '')}"})
    # Revisión del predio
    if dd:
        primera_alerta = ""
        for s in dd.get("secciones", []):
            for it in s.get("items", []):
                if it.get("estado") == "alerta":
                    primera_alerta = it.get("titulo", "")
                    break
            if primera_alerta:
                break
        if dd_alertas > 0:
            txt = (f"Revisé el predio: {dd_alertas} punto(s) requieren tu atención "
                   f"(empieza por «{primera_alerta}») y {dd_pend} por verificar antes de cerrar.")
        else:
            txt = f"Revisé el predio: sin focos rojos; {dd_pend} verificaciones estándar por confirmar."
        lo_que_vi.append({"icono": "check", "tema": "Revisión", "texto": txt})
    # Oportunidad Norma 3
    if mejor_op:
        lo_que_vi.append({
            "icono": "spark", "tema": "Oportunidad",
            "texto": f"Hay una jugada: fusionar con {mejor_op['colonia_vecina']} "
                     f"(CUS {mejor_op['cus_actual']}→{mejor_op['cus_potencial']}) podría sumar "
                     f"+{_fmt_mxn(mejor_op['uplift_mxn'])} (+{mejor_op['uplift_pct']}%) al valor del terreno."})
    # Confianza
    lo_que_vi.append({
        "icono": "info", "tema": "Confianza",
        "texto": f"Confianza del cálculo: {residual.get('confianza', 'baja')}. "
                 + ("Usa tus datos de mercado en «Ajustes finos» para afinarlo."
                    if residual.get("confianza") != "alta"
                    else "Basada en datos reales de la zona.")})

    titular = (f"Paga hasta {_fmt_mxn(oferta)} por este lote"
               if oferta and oferta > 0 else "Con estos números el lote no deja utilidad")

    return {
        "ok": True,
        "veredicto": {
            "titular": titular,
            "semaforo": semaforo,
            "lo_que_vi": lo_que_vi,
            "resumen_corto": _resumen_corto(oferta, semaforo, dd_alertas, dd_pend, mejor_op),
        },
        "residual": residual,
        "due_diligence": dd,
        "norma3": n3,
        "computed_at": _iso(),
    }


def _resumen_corto(oferta, semaforo: str, dd_alertas: int, dd_pend: int,
                   mejor_op: Optional[Dict[str, Any]]) -> str:
    """Una línea que ata todo (para el encabezado del veredicto)."""
    partes = [f"Paga hasta {_fmt_mxn(oferta)}"]
    partes.append({"verde": "margen sano", "amarillo": "margen ajustado",
                   "rojo": "no cierra"}.get(semaforo, ""))
    if dd_alertas > 0:
        partes.append(f"{dd_alertas} cosa(s) que revisar")
    elif dd_pend > 0:
        partes.append(f"{dd_pend} verificaciones")
    if mejor_op:
        partes.append(f"+{_fmt_mxn(mejor_op['uplift_mxn'])} si fusionas")
    return " · ".join(p for p in partes if p)
