"""
CUBO TOTAL — DICCIONARIO v2 (el registro formal de familias de hipersegmentación)
═══════════════════════════════════════════════════════════════════════════════
Fuente única de verdad de QUÉ dimensiones existen en el modelo del mundo DMX, a qué
átomo bajan y en qué estado están. Complementa cube_catalog.py (que registra MEDIDAS);
este módulo registra las FAMILIAS DE SEGMENTACIÓN (los filtros/cortes posibles).

Estados:
  vivo        — el dato existe y es filtrable hoy
  parcial     — el motor existe; falta materializar o cablear el filtro
  en_captura  — declarada en el modelo; la captura/conector aún no existe (la estructura la espera)

Spec canónica: memoria CUBO_TOTAL_SPEC.md (un cerebro, 4 lentes, 5 escaleras, espejo oferta↔demanda).
"""
from __future__ import annotations

from typing import Any, Dict, List

BLOQUES = ["producto", "comprador", "desarrollador", "asesor", "ciclo", "entorno", "plataforma"]


def F(key: str, nombre: str, bloque: str, atomo: str, estado: str, fuente: str) -> Dict[str, Any]:
    return {"key": key, "nombre": nombre, "bloque": bloque, "atomo": atomo,
            "estado": estado, "fuente": fuente}


FAMILIAS: List[Dict[str, Any]] = [
    # ── PRODUCTO ──
    F("fisicas", "Características físicas", "producto", "el elemento del espacio (ventana, clóset)", "vivo", "dmx_units (taxonomía 17 grupos)"),
    F("construccion", "Construcción y calidad", "producto", "hito de obra por partida, con foto y fecha", "parcial", "construction_quality + avance por capturar"),
    F("riesgo_fisico", "Riesgo físico", "producto", "PML por edificio (microzona × norma × pisos)", "vivo", "Atlas CDMX + catastro"),
    F("servicios", "Servicios y energía", "producto", "$ mensual estimado por unidad", "parcial", "SACMEX/OSM + captura ficha"),
    F("legal", "Legal / administrativo", "producto", "documento del expediente con estado y cláusula", "en_captura", "expediente por unidad (score de completitud)"),
    F("financiero", "Financiero + hipotecario", "producto", "el pago individual de la corrida (mes × banco)", "vivo", "dmx_finance_atom (F1) · payment_schemes · tasa Banxico"),
    F("fiscal", "Fiscal", "producto", "concepto × año × régimen del comprador", "vivo", "tax_projector_engine"),
    F("velocidad", "Velocidad de mercado", "producto", "evento de precio / oferta recibida", "vivo", "price_events + dias_en_mercado"),
    # ── COMPRADOR (cada familia tiene espejo) ──
    F("intencion", "Intención", "comprador", "motivo por feature (texto literal)", "vivo", "buyer_signals + intent split"),
    F("capacidad", "Capacidad financiera", "comprador", "estructura completa de UNA persona + evolución", "vivo", "marketplace_searches"),
    F("momento_vida", "Momento de vida", "comprador", "evento disparador + urgencia", "en_captura", "perfil + conversaciones"),
    F("comportamiento", "Comportamiento", "comprador", "dwell por foto, hora, device", "vivo", "behavioral + foto-dwell"),
    F("gusto", "Gusto y objeciones", "comprador", "frase textual + contra-argumento que funcionó", "vivo", "taste model + rechazo"),
    F("origen", "Origen geográfico", "comprador", "minutos de traslado actual vs futuro", "parcial", "Mapbox traffic + climate_migration"),
    # ── DESARROLLADOR ──
    F("track_record", "Track record", "desarrollador", "defecto por unidad + días de resolución", "parcial", "reviews_residents + entregas"),
    F("comercial_dev", "Política comercial", "desarrollador", "concesión por cierre", "en_captura", "negociación por capturar"),
    F("pipeline_dev", "Pipeline", "desarrollador", "hito con capital (tierra→entrega)", "vivo", "etapas + por cobrar"),
    F("competitivo", "Competitivo", "desarrollador", "movimiento de precio unidad-a-unidad del rival", "vivo", "battle_card + price_events"),
    # ── ASESOR ──
    F("desempeno_asesor", "Desempeño", "asesor", "mensaje individual (tiempo de respuesta)", "vivo", "leads + conversaciones"),
    F("especializacion", "Especialización", "asesor", "matriz zona×segmento donde SÍ cierra", "parcial", "derivable de cierres"),
    F("cartera", "Cartera", "asesor", "lead × etapa × edad × señal de enfriamiento", "vivo", "asesor_contactos + leads"),
    # ── CICLO ──
    F("embudo", "Embudo con tiempos", "ciclo", "salto etapa→etapa con timestamp", "parcial", "etapas sí; tiempos por materializar"),
    F("negociacion", "Negociación", "ciclo", "ronda de oferta: quién cedió, qué concesión", "en_captura", "captura al cierre"),
    F("postventa", "Post-venta", "ciclo", "defecto / reseña / referido (quién trajo a quién)", "en_captura", "backlog B5.7"),
    # ── ENTORNO ──
    F("asoleamiento", "Asoleamiento real", "entorno", "horas de sol por fachada × estación", "en_captura", "derivable de alturas catastro"),
    F("ruido", "Ruido estimado", "entorno", "dB por franja horaria y fuente", "en_captura", "derivable OSM + DENUE nocturno"),
    F("mezcla_edificio", "Mezcla del edificio", "entorno", "uso real por unidad (dueño/renta/Airbnb)", "parcial", "AirROI conectado"),
    F("mantenimiento", "Mantenimiento", "entorno", "partida de cuota + morosidad", "en_captura", "ficha dev"),
    F("renta", "Renta / Airbnb", "entorno", "contrato / ADR / ocupación por mes", "parcial", "AirROI + yields"),
    F("reventa", "Reventa", "entorno", "spread por unidad revendida", "en_captura", "mercado secundario futuro"),
    F("pipeline_urbano", "Pipeline urbano público", "entorno", "permiso SEDUVI individual (qué, m², cuándo)", "en_captura", "conector SEDUVI"),
    F("vitalidad", "Vitalidad comercial", "entorno", "apertura/cierre individual por cuadra", "parcial", "DENUE cargado; falta delta temporal"),
    F("narrativa", "Narrativa / buzz", "entorno", "mención con sentimiento", "parcial", "reputation_monitor"),
    # ── PLATAFORMA ──
    F("visual", "Visual como dato", "plataforma", "elemento IA por foto → conversión", "vivo", "hook_score + photo_tagger"),
    F("cac", "CAC / marketing", "plataforma", "creativo → lead → cierre por corte", "parcial", "social_ads + lead_sources"),
    F("conversaciones", "Minería de conversaciones", "plataforma", "tema/objeción por mensaje", "parcial", "conversation mining"),
    F("expediente", "Completitud de expediente", "plataforma", "documento con estado/vencimiento", "en_captura", "score de documentos"),
    F("metadato", "Meta-dato", "plataforma", "celda: frescura/fuente/confianza/n/historial", "vivo", "granularity_registry + catálogo"),
]


def serialize() -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    for f in FAMILIAS:
        counts[f["estado"]] = counts.get(f["estado"], 0) + 1
    return {"bloques": BLOQUES, "familias": FAMILIAS,
            "total": len(FAMILIAS), "por_estado": counts}
