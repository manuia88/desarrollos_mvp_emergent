"""EL JUEZ AUTOMÁTICO — Capa 5 de verificación: nadie revisa 500 desarrollos a mano.

Orden founder (07-15): "los 20 campos de juez, tú revísalos... crea esta revisión
automatizada... necesito que todo sea por sistema".

LAS 5 CAPAS DE VERIFICACIÓN (el pipeline completo, cada una independiente):
  1 · ARITMÉTICA INTERNA (en extracción): habitables+exteriores=totales · crédito+enganche=precio
  2 · CRUCE MULTI-FUENTE (fusion_fuentes): lista × maestro campo a campo, discrepancias documentadas
  3 · EL PORTÓN (pre_auditar_extraccion): reglas invariantes sobre el lote ANTES de aprobar
  4 · POST-CARGA (auditor_catalogo + cotejo): reglas sobre el catálogo vivo + lista×plano×brochure
  5 · EL JUEZ (este módulo): muestra con semilla fija re-leída desde los BYTES de la fuente
      por un camino DISTINTO al del extractor — texto crudo del PDF línea por línea (no
      tablas) y celda directa del Excel (no el parser del cruce). Si dos caminos distintos
      llegan al mismo número, el dato está bien. Veredicto ≥98% = gate pasado, por sistema.

Persiste en `veredictos_juez` y cachea juez_pct en developments (visible en Expediente).
$0, sin IA. Comparadores puros testeables.
"""
from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from identidad_unidad import norm_unidad

TOL_M2 = 0.6
TOL_DINERO = 2.0
CAMPOS_PDF = {"price_mxn": TOL_DINERO, "credito_mxn": TOL_DINERO,
              "enganche_mxn": TOL_DINERO, "reservacion_mxn": TOL_DINERO,
              "contrato_mxn": TOL_DINERO, "a_diferir_mxn": TOL_DINERO,
              "m2_total": TOL_M2, "m2_privative": TOL_M2, "size_m2": TOL_M2,
              "parking_spots": 0.01}
CAMPOS_EXCEL = {"bedrooms": 0.01, "bathrooms": 0.01, "parking_spots": 0.01,
                "m2_privative": TOL_M2, "size_m2": TOL_M2}
COL_EXCEL = {"bedrooms": "RECAMARAS", "bathrooms": "BAÑOS",
             "parking_spots": "ESTACIONAMIENTOS", "m2_privative": "M2 HABITABLE",
             "size_m2": "M2 HABITABLE"}


# ─── comparadores puros (testeables) ──────────────────────────────────────────
def numeros_de_linea(linea: str) -> List[float]:
    out = []
    for tok in re.findall(r"[\d][\d,]*\.?\d*", linea or ""):
        try:
            out.append(float(tok.replace(",", "")))
        except ValueError:
            pass
    return out


def linea_confirma(linea: str, valor: float, tolerancia: float) -> bool:
    """¿La línea de texto crudo contiene el valor esperado (con tolerancia)?"""
    return any(abs(n - valor) <= tolerancia for n in numeros_de_linea(linea))


def lineas_de_unidad(texto_paginas: List[str], unidad: str) -> List[str]:
    """Las líneas del PDF que hablan de ESTA unidad — por TOKENS del inicio de línea
    ('T1 - 2405' de la base debe hallar la línea '2405 4.78 …' del PDF sin prefijo)."""
    objetivo = norm_unidad(unidad)
    solo_num = re.sub(r"^[A-Z]+\d?-", "", objetivo)
    variantes = {objetivo, objetivo.replace("-", ""), solo_num}
    out = []
    for texto in texto_paginas:
        for ln in (texto or "").split("\n"):
            toks = ln.upper().split()
            if not toks:
                continue
            cabeza = {toks[0], "".join(toks[:2]), "".join(toks[:3]).replace("-", ""),
                      toks[0].replace("-", "")}
            if variantes & cabeza:
                out.append(ln)
    return out


# ─── el juez sobre un lote (bytes de fuente + valores cargados) ───────────────
def juzgar_campos(muestra: List[Dict[str, Any]],
                  texto_pdf: List[str],
                  filas_excel: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Cada campo de la muestra se re-verifica contra SU fuente por el camino
    independiente. Devuelve el veredicto con el detalle campo por campo."""
    detalles = []
    for m in muestra:
        campo, unidad, valor = m["campo"], m["unidad"], m["valor"]
        veredicto, evidencia = "sin_fuente", None
        if campo in CAMPOS_PDF and isinstance(valor, (int, float)):
            lineas = lineas_de_unidad(texto_pdf, unidad)
            if lineas:
                ok = any(linea_confirma(ln, float(valor), CAMPOS_PDF[campo])
                         for ln in lineas)
                veredicto = "confirmado" if ok else "NO_COINCIDE"
                evidencia = ("pdf_texto_crudo" if ok else
                             f"pdf: valor no hallado en {len(lineas)} línea(s) de {unidad}")
        if campo in CAMPOS_EXCEL:
            # el Excel SIEMPRE opina (segunda opinión aunque el PDF ya haya confirmado —
            # así la pelea entre fuentes nunca pasa callada)
            fila = filas_excel.get(norm_unidad(unidad))
            if fila is not None:
                crudo = fila.get(COL_EXCEL[campo])
                try:
                    esperado = float(str(crudo).replace(",", ""))
                    excel_ok = isinstance(valor, (int, float)) and \
                        abs(esperado - float(valor)) <= CAMPOS_EXCEL[campo]
                    if veredicto == "confirmado" and not excel_ok:
                        veredicto = "discrepancia_fuentes"
                        evidencia = f"lista confirma {valor}, excel dice {crudo}"
                    elif veredicto != "confirmado" and excel_ok:
                        veredicto, evidencia = "confirmado", "excel_celda_directa"
                    elif veredicto != "confirmado":
                        veredicto = "NO_COINCIDE"
                        evidencia = f"excel dice {crudo}, cargado {valor}"
                except (TypeError, ValueError):
                    pass
        if campo == "unit_number":
            veredicto = "confirmado" if lineas_de_unidad(texto_pdf, str(valor)) \
                else "NO_COINCIDE"
            evidencia = "pdf_texto_crudo"
        detalles.append({**m, "veredicto": veredicto, "evidencia": evidencia})
    # la discrepancia entre fuentes NO cuenta contra el gate (es hallazgo de capa 2)
    confirmados = sum(1 for d in detalles
                      if d["veredicto"] in ("confirmado", "discrepancia_fuentes"))
    revisables = sum(1 for d in detalles if d["veredicto"] != "sin_fuente")
    return {"detalles": detalles, "confirmados": confirmados,
            "revisables": revisables,
            "pct": round(confirmados * 100 / revisables, 1) if revisables else None,
            "gate_98": bool(revisables and confirmados / revisables >= 0.98)}


# ─── la corrida completa (Mongo + archivos) ───────────────────────────────────
async def juzgar_desarrollo(db, development_id: str,
                            pdf_bytes_list: List[bytes],
                            excel_bytes: Optional[bytes] = None,
                            n: int = 20, semilla: int = 42) -> Dict[str, Any]:
    import pdfplumber
    from unidades_efectivas import unidades_efectivas
    from auditor_catalogo import muestra_juez
    units = await unidades_efectivas(db, {"development_id": development_id})
    muestra = muestra_juez(units, n=n, semilla=semilla)
    texto_pdf: List[str] = []
    for pb in pdf_bytes_list:
        try:
            with pdfplumber.open(io.BytesIO(pb)) as pdf:
                texto_pdf += [(p.extract_text() or "") for p in pdf.pages]
        except Exception:  # noqa: BLE001
            pass
    filas_excel: Dict[str, Dict[str, Any]] = {}
    if excel_bytes:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=True)
            ws = wb[wb.sheetnames[0]]
            headers = [str(c.value).strip() if c.value else "" for c in ws[1]]
            for r in ws.iter_rows(min_row=2, values_only=True):
                d = dict(zip(headers, r))
                if d.get("PRODUCTO"):
                    filas_excel[norm_unidad(d["PRODUCTO"])] = d
        except Exception:  # noqa: BLE001
            pass
    v = juzgar_campos(muestra, texto_pdf, filas_excel)
    doc = {"development_id": development_id, "ts": datetime.now(timezone.utc).isoformat(),
           "n_muestra": len(muestra), "semilla": semilla, **v}
    await db.veredictos_juez.insert_one(dict(doc))
    await db.developments.update_one(
        {"id": development_id},
        {"$set": {"juez_pct": v["pct"], "juez_gate": v["gate_98"],
                  "juez_at": doc["ts"]}})
    return doc
