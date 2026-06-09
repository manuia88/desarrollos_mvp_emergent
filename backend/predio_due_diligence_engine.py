"""
predio_due_diligence_engine — F1.3 · Due Diligence del Predio.
═══════════════════════════════════════════════════════════════════════════════
PREGUNTA QUE RESPONDE (para el dev): "Antes de comprar este terreno, ¿qué tengo
que revisar para no llevarme una sorpresa?"

Arma una revisión COMPLETA y accionable del predio, en lenguaje simple:
  1. Zonificación y potencial   — qué te deja construir la norma (SIG · dato real)
  2. Riesgos del entorno        — seguridad/riesgo (FGJ) + natural (Atlas CDMX, fail-open)
  3. Verificaciones legales      — gravámenes, título, predial, alineamiento (checklist)
  4. Factibilidades técnicas     — agua/drenaje, energía, suelo, Impacto Urbano (dinámico)
  5. Oportunidad Norma 3         — ¿conviene fusionar con un vecino para subir el CUS?

DESPIERTA features dormidas (no inventa): colonia.scores_reales (FGJ),
natural_risk_engine (Atlas CENAPRED). Cada ítem trae ESTADO + ORIGEN (dato/
benchmark/pendiente/info) — Doctrina de Datos. Cero deuda: si falta el dato, lo
marca "pendiente de verificar" con dónde obtenerlo, nunca lo presenta como hecho.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.due_diligence")

# Umbral típico para Estudio de Impacto Urbano habitacional en CDMX (m² construibles).
_EIU_UMBRAL_M2 = 10_000


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item(clave: str, titulo: str, estado: str, origen: str,
          detalle: str = "", accion: str = "", fuente: str = "") -> Dict[str, Any]:
    """estado: ok | alerta | pendiente | info · origen: dato | benchmark | pendiente | info."""
    return {"clave": clave, "titulo": titulo, "estado": estado, "origen": origen,
            "detalle": detalle, "accion": accion, "fuente": fuente}


def _viv_por_densidad(densidad: Optional[str], superficie_m2: Optional[float]) -> Optional[int]:
    """Parsea '1 Viv c/50 m2 de terreno' → viviendas estimadas para la superficie dada."""
    if not densidad or not superficie_m2:
        return None
    m = re.search(r"(\d+)\s*viv.*?(\d+)\s*m", densidad, re.I)
    if not m:
        return None
    vivs, cada = int(m.group(1)), int(m.group(2))
    if cada <= 0:
        return None
    return max(1, int(superficie_m2 * vivs / cada))


async def _zonificacion(col: Dict[str, Any], superficie_m2: Optional[float]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    uso = col.get("zonif_uso")
    niveles = col.get("zonif_niveles")
    densidad = col.get("zonif_densidad")
    cos, cus = col.get("cos"), col.get("cus")
    area_libre = col.get("zonif_area_libre_pct")

    if uso:
        es_hab = "habitacional" in str(uso).lower()
        items.append(_item(
            "uso_suelo", "Uso de suelo permitido", "ok" if es_hab else "alerta", "dato",
            detalle=f"La norma marca uso «{uso}» para esta zona.",
            accion="" if es_hab else "Confirma que tu producto (vivienda) está permitido en este uso.",
            fuente="SIG CDMX · zonificación"))
    else:
        items.append(_item("uso_suelo", "Uso de suelo permitido", "pendiente", "pendiente",
            detalle="No tenemos el uso oficial de esta zona.",
            accion="Solicita el Certificado Único de Zonificación de Uso de Suelo del predio.",
            fuente="SEDUVI"))

    if cus:
        det = f"COS {cos} · CUS {cus}"
        if niveles:
            det += f" · hasta {niveles} niveles"
        if area_libre is not None:
            det += f" · {area_libre}% de área libre mínima"
        items.append(_item("potencial", "Cuánto te deja construir", "ok", "dato",
            detalle=det, fuente="SIG CDMX · zonificación"))

    if densidad:
        viv = _viv_por_densidad(densidad, superficie_m2)
        det = f"Densidad: {densidad}."
        if viv:
            det += f" En {int(superficie_m2):,} m² de terreno ≈ {viv} viviendas máximas."
        items.append(_item("densidad", "Cuántas viviendas caben", "info" if viv else "ok", "dato",
            detalle=det,
            accion="" if viv else "Verifica la densidad exacta en el certificado de uso de suelo.",
            fuente="SIG CDMX · zonificación"))
    return items


async def _riesgos(db, col: Dict[str, Any]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    scores = col.get("scores_reales") or {}

    seg = scores.get("seguridad")
    if seg is not None:
        estado = "ok" if seg >= 60 else ("alerta" if seg < 40 else "info")
        items.append(_item("seguridad", "Seguridad de la zona", estado, "dato",
            detalle=f"Índice de seguridad {int(seg)}/100 (a mayor, mejor), con datos de incidencia delictiva.",
            accion="" if seg >= 40 else "Zona con incidencia alta: valora impacto en la venta y el seguro de obra.",
            fuente="FGJ CDMX · carpetas de investigación"))

    rie = scores.get("riesgo")
    if rie is not None:
        estado = "ok" if rie >= 60 else ("alerta" if rie < 40 else "info")
        items.append(_item("riesgo_entorno", "Riesgo del entorno", estado, "dato",
            detalle=f"Índice {int(rie)}/100 (a mayor, mejor).",
            fuente="FGJ CDMX"))

    # Riesgo natural (sismo/inundación/hundimiento) — Atlas CENAPRED, fail-open.
    nat = None
    try:
        from natural_risk_engine import compute_natural_risk_zone
        nat = await compute_natural_risk_zone(db, col.get("id"))
    except Exception as e:
        log.warning(f"[dd] natural_risk: {e}")
    if nat and nat.get("available"):
        items.append(_item("riesgo_natural", "Riesgo natural (sismo/inundación)", "info", "dato",
            detalle=f"Zona sísmica {nat.get('sismic_zone')} · inundación {nat.get('flood_pct')}% · "
                    f"hundimiento {nat.get('subsidence_mm_year')} mm/año.",
            fuente="Atlas de Riesgos CENAPRED/CDMX"))
    else:
        items.append(_item("riesgo_natural", "Riesgo natural (sismo/inundación/hundimiento)", "pendiente", "pendiente",
            detalle="Aún no tenemos la capa del Atlas para esta zona.",
            accion="Consulta el Atlas de Riesgos de la CDMX por la dirección exacta del predio "
                   "(zona sísmica, encharcamiento, hundimiento regional).",
            fuente="Atlas de Riesgos CDMX (atlas.cdmx.gob.mx)"))
    return items


def _verificaciones_legales() -> List[Dict[str, Any]]:
    """Checklist legal estándar de adquisición de suelo (siempre por verificar antes de cerrar)."""
    base = [
        ("zoz_cert", "Certificado de Uso de Suelo vigente",
         "Pide el Certificado Único de Zonificación de Uso de Suelo: confirma usos, niveles y densidad oficiales del predio (no solo de la colonia).", "SEDUVI"),
        ("gravamen", "Libertad de gravamen",
         "Solicita el certificado de libertad de gravamen: revisa hipotecas, embargos o limitaciones sobre el predio.", "Registro Público de la Propiedad (RPPyC)"),
        ("titulo", "Título de propiedad y antecedentes",
         "Verifica la cadena de propiedad (mínimo últimos 20 años) y que el vendedor sea el titular legítimo.", "Notaría / RPPyC"),
        ("predial", "Predial y agua al corriente",
         "Confirma que no haya adeudos de predial ni de agua que pasen al comprador.", "Tesorería CDMX / SACMEX"),
        ("alineamiento", "Alineamiento y número oficial",
         "Solicita constancia de alineamiento y número oficial: marca restricciones de la vía pública y afectaciones.", "Alcaldía"),
    ]
    return [_item(k, t, "pendiente", "info", accion=a, fuente=f) for (k, t, a, f) in base]


def _factibilidades(cus: Optional[float], superficie_m2: Optional[float]) -> List[Dict[str, Any]]:
    """Checklist técnico + flag dinámico de Impacto Urbano según tamaño."""
    items = [
        _item("agua", "Factibilidad de agua y drenaje", "pendiente", "info",
              accion="Tramita el dictamen de factibilidad de servicios hidráulicos: sin agua/drenaje no hay licencia.",
              fuente="SACMEX"),
        _item("energia", "Factibilidad de energía", "pendiente", "info",
              accion="Confirma capacidad de suministro y costo de acometida con CFE.", fuente="CFE"),
        _item("suelo", "Mecánica de suelos", "pendiente", "info",
              accion="Encarga el estudio de mecánica de suelos: define la cimentación y su costo (clave en CDMX).",
              fuente="Estudio geotécnico"),
        _item("prot_civil", "Visto bueno de Protección Civil", "pendiente", "info",
              accion="Revisa requisitos de Protección Civil según el tipo y tamaño del proyecto.",
              fuente="Protección Civil CDMX"),
    ]
    # Impacto Urbano (EIU) — el cuello de botella; aplica por tamaño.
    construibles = (cus or 0) * (superficie_m2 or 0)
    if construibles >= _EIU_UMBRAL_M2:
        items.append(_item("eiu", "Estudio de Impacto Urbano (EIU)", "alerta", "benchmark",
            detalle=f"Con ~{int(construibles):,} m² construibles probablemente necesites EIU "
                    f"(integra SACMEX, SEMOVI y Protección Civil). Es el trámite que más alarga la obra (18–30 meses).",
            accion="Presupuesta tiempo y costo del EIU desde el inicio; es el principal riesgo de calendario.",
            fuente="SEDUVI · Norma de Impacto Urbano"))
    else:
        items.append(_item("eiu", "Estudio de Impacto Urbano (EIU)", "ok", "benchmark",
            detalle="Por el tamaño estimado probablemente NO requieras EIU completo.",
            accion="Confirma el umbral vigente para tu proyecto con la alcaldía.",
            fuente="SEDUVI"))
    return items


def _norma3_flag(col: Dict[str, Any]) -> Dict[str, Any]:
    """Oportunidad de upzoning por fusión de predios (Norma General N°3). Solo señala; el
    detector a fondo es F1.4."""
    return _item("norma3", "Oportunidad: fusión de predios (Norma 3)", "info", "info",
        detalle="La Norma 3 permite que, al fusionar predios con distinta zonificación, el conjunto "
                "tome la de MAYOR potencial. Si hay un lote vecino con más niveles/CUS, fusionarlo "
                "puede subir cuánto construyes — y con eso, cuánto vale tu suelo.",
        accion="Si hay vecinos disponibles, evalúa la fusión antes de cerrar el precio del terreno.",
        fuente="Norma General de Ordenación N°3 · CDMX")


async def generar_due_diligence(db, colonia_id: Optional[str], superficie_m2: Optional[float] = None,
                                city: str = "CDMX") -> Dict[str, Any]:
    """Arma la revisión completa del predio. Nunca crashea; si no hay colonia, devuelve el
    checklist legal/técnico genérico (igual sirve)."""
    col = {}
    if colonia_id:
        col = await db.colonias.find_one(
            {"id": colonia_id, "city": city},
            {"_id": 0, "id": 1, "name": 1, "alcaldia": 1, "cos": 1, "cus": 1,
             "zonif_uso": 1, "zonif_niveles": 1, "zonif_densidad": 1, "zonif_area_libre_pct": 1,
             "scores_reales": 1},
        ) or {}

    secciones = [
        {"clave": "zonificacion", "titulo": "Zonificación y potencial",
         "items": await _zonificacion(col, superficie_m2)},
        {"clave": "riesgos", "titulo": "Riesgos del entorno",
         "items": await _riesgos(db, col) if col else []},
        {"clave": "legal", "titulo": "Verificaciones legales", "items": _verificaciones_legales()},
        {"clave": "factibilidades", "titulo": "Factibilidades técnicas",
         "items": _factibilidades(col.get("cus"), superficie_m2)},
        {"clave": "oportunidades", "titulo": "Oportunidades", "items": [_norma3_flag(col)]},
    ]

    todos = [it for s in secciones for it in s["items"]]
    n_alertas = sum(1 for it in todos if it["estado"] == "alerta")
    n_pendientes = sum(1 for it in todos if it["estado"] == "pendiente")
    n_ok = sum(1 for it in todos if it["estado"] == "ok")

    if n_alertas > 0:
        semaforo, resumen = "amarillo", (
            f"Hay {n_alertas} punto(s) que requieren tu atención y {n_pendientes} por verificar "
            f"antes de cerrar. Revisa primero los marcados en alerta.")
    elif n_pendientes > 0:
        semaforo, resumen = "verde", (
            f"Sin focos rojos por ahora. Te quedan {n_pendientes} verificaciones estándar por confirmar "
            f"(documentos y factibilidades) antes de firmar.")
    else:
        semaforo, resumen = "verde", "Revisión base cubierta."

    return {
        "ok": True,
        "pregunta": "Antes de comprar este terreno, ¿qué tengo que revisar?",
        "colonia": col.get("name"),
        "alcaldia": col.get("alcaldia"),
        "superficie_m2": superficie_m2,
        "semaforo": semaforo,
        "resumen": resumen,
        "conteo": {"ok": n_ok, "alertas": n_alertas, "pendientes": n_pendientes, "total": len(todos)},
        "secciones": secciones,
        "nota": "Esto es una guía de revisión basada en datos públicos — no sustituye la asesoría "
                "legal/notarial. Cada dato dice su origen; los marcados «pendiente» los confirmas tú.",
        "computed_at": _iso(),
    }
