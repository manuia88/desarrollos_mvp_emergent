"""
catalogo_maestro.py — EL CATÁLOGO VIVO del portal superadmin (Fase A del rebuild UX).

Problema (auditado): ~24 entradas de sidebar → ~300 tabs → 105 páginas, 141 motores, 44 bloques.
El founder no puede encontrar ni contar lo que tiene. Este módulo es el ÍNDICE ÚNICO que
describe cada pieza en LENGUAJE HUMANO (qué es · qué me dice · para qué me sirve · qué hago con
esto), la agrupa en 6 DOMINIOS, y declara dónde vive y qué necesita.

DISEÑO (reglas founder):
  · UNIVERSALIDAD — es un REGISTRO: una pieza nueva = una entrada. Nada hardcodeado en el front.
  · CERO PÉRDIDA — agrega lo que YA se auto-describe (los 44 bloques de report_builder + las
    features del feature_registry) y lo enriquece; ninguna capacidad existente desaparece.
  · CERO DUPLICACIÓN — no reimplementa motores; los INDEXA. Reusa las fuentes vivas.

El front pinta un buscador + filtros (dominio · tema · qué necesita) sobre este catálogo, así el
founder navega por PREGUNTA, no por dónde-quedó-el-tab. Servido por /api/superadmin/catalogo.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.catalogo_maestro")

# ── LOS 6 DOMINIOS (la nueva taxonomía del sidebar; una card cae en exactamente uno) ─────────
DOMINIOS: Dict[str, Dict[str, str]] = {
    "mercado": {"titulo": "Mercado", "icono": "🏙️",
                "resumen": "Todo el mercado: qué hay, cuánto cuesta, cómo se mueve — de la ciudad a cada unidad."},
    "demanda": {"titulo": "Demanda y personas", "icono": "👤",
                "resumen": "Quién busca, qué quiere, qué tan caliente está y cómo se parece a otros compradores."},
    "inventario": {"titulo": "Inventario y desarrolladores", "icono": "🏗️",
                   "resumen": "Los proyectos y unidades, cómo entran (ingesta), su calidad y sus desarrolladores."},
    "dinero": {"titulo": "Dinero e ingresos", "icono": "💰",
               "resumen": "Rentabilidad, financiamiento, monetización de la API y costos de la IA."},
    "operacion": {"titulo": "Operación y seguridad", "icono": "⚙️",
                  "resumen": "Salud del sistema, auditoría, cumplimiento, fraude y alertas."},
    "productos": {"titulo": "Productos del moat", "icono": "📦",
                  "resumen": "Lo que vendes: el Estudio DMX, el índice DMX-30 y el CARFAX del depa."},
}

# ── EL REGISTRO DE PIEZAS ─────────────────────────────────────────────────────────────────────
# Cada entrada:
#   id · dominio · tipo (vista|reporte|motor|score|producto|indice) · titulo (humano)
#   que_es · que_dice · beneficio · que_hago · necesita[] · ruta_ui · api[] · temas[]
def _p(id, dominio, tipo, titulo, que_es, que_dice, beneficio, que_hago,
       ruta_ui="", api=None, necesita=None, temas=None) -> Dict[str, Any]:
    return {"id": id, "dominio": dominio, "tipo": tipo, "titulo": titulo,
            "que_es": que_es, "que_dice": que_dice, "beneficio": beneficio, "que_hago": que_hago,
            "ruta_ui": ruta_ui, "api": api or [], "necesita": necesita or [], "temas": temas or []}


# Las vistas mayores del portal (las 24 rutas del sidebar → reubicadas en 6 dominios).
_PIEZAS: List[Dict[str, Any]] = [
    # ── MERCADO ──
    _p("hub_mercado", "mercado", "vista", "Hub de Mercado",
       "El tablero central del mercado — precios, oferta, demanda y absorción de toda la CDMX.",
       "Cuántas unidades hay, a qué precio, quién las busca y qué tan rápido se venden.",
       "Ves el mercado completo en un lugar sin abrir 10 pantallas.",
       "Filtra por zona/precio/tipo y genera reportes o estudios de esa vista.",
       "/superadmin/mercado", ["/api/superadmin/genoma/resumen"], temas=["precio", "oferta", "demanda"]),
    _p("cubo_metricas", "mercado", "vista", "Cubo de métricas",
       "El explorador a fondo: cualquier corte de la ciudad hasta la unidad individual.",
       "El número exacto de cualquier combinación (zona × tipo × precio × feature).",
       "Respondes preguntas muy específicas con datos, no con intuición.",
       "Arma un corte, agrúpalo, compáralo entre zonas o baja al átomo de una unidad.",
       "/superadmin/metrics-cube", temas=["granularidad", "precio", "oferta"]),
    _p("terminal_zona", "mercado", "vista", "Terminal de Zona",
       "Ficha profunda por colonia: ciclo, riesgo, habitabilidad, precios y tensión.",
       "Cómo está y hacia dónde va una zona específica, con fuentes citadas.",
       "Decides dónde construir o invertir con la verdad de la colonia.",
       "Elige una alcaldía → colonia → mira su ficha y compárala con otras.",
       "/superadmin/terminal-zona", temas=["zona", "riesgo", "plusvalia"]),
    _p("live_pulse", "mercado", "vista", "Live Pulse CDMX",
       "El mapa de calor en vivo del mercado: dónde está pasando algo ahora.",
       "Qué zonas se están moviendo hoy (demanda, precio, alertas).",
       "Reaccionas a movimientos del mercado el mismo día.",
       "Mira el heatmap, la línea de tiempo y las alertas activas.",
       "/superadmin/live-pulse", temas=["tiempo", "zona", "alertas"]),
    _p("terminal_mercado", "mercado", "vista", "Terminal de Mercado CDMX",
       "La foto diaria del mercado completo para comparar contra el pasado.",
       "El estado del mercado hoy vs cualquier día anterior.",
       "Ves la evolución real sin depender de memoria.",
       "Guarda la foto de hoy; en el futuro comparas fotos.",
       "/superadmin/terminal-mercado", temas=["tiempo"]),

    # ── DEMANDA Y PERSONAS ──
    _p("gemelo_demanda", "demanda", "vista", "Gemelo de Demanda",
       "El espejo entre lo que la gente busca y lo que hay disponible.",
       "Dónde hay demanda sin oferta (oportunidad) y oferta sin demanda (riesgo).",
       "Sabes qué construir porque ves el hueco antes de que nadie lo llene.",
       "Explora por oportunidad, demanda u oferta y despacha el hueco al dev (tú autorizas).",
       "/superadmin/gemelo-demanda", temas=["demanda", "oferta", "escasez"]),
    _p("grafo_comprador", "demanda", "vista", "Grafo del comprador",
       "El mapa de cómo se conectan los compradores por lo que buscan.",
       "Qué colonias y features compiten por el mismo comprador.",
       "Entiendes al comprador como red, no como filas sueltas.",
       "Explora los corredores de demanda y los rivales reales de cada unidad.",
       "/superadmin/inteligencia", temas=["demanda", "personas"]),
    _p("inteligencia_demanda", "demanda", "vista", "Demanda de mercado",
       "El tablero de la señal viva: quién busca qué, por temporalidad.",
       "El pulso de la demanda por día/semana/mes y por zona.",
       "Distingues una moda pasajera de una tendencia real.",
       "Cambia la temporalidad y observa cómo se mueve la demanda.",
       "/superadmin/inteligencia", temas=["demanda", "tiempo"]),

    # ── INVENTARIO Y DESARROLLADORES ──
    _p("desarrollos", "inventario", "vista", "Desarrollos",
       "El catálogo de todos los proyectos: panorama, inteligencia y aprobación.",
       "Qué proyectos hay, su estado y su desempeño.",
       "Controlas el inventario que alimenta todo el sistema.",
       "Revisa el panorama, aprueba lo que entra al marketplace, mira la inteligencia por proyecto.",
       "/superadmin/desarrollos", temas=["oferta", "inventario"]),
    _p("alta_devs", "inventario", "vista", "Desarrolladores y carga",
       "Donde das de alta desarrolladores y subes sus inventarios (manual o por IA).",
       "Quiénes son los devs y qué han cargado.",
       "Sumas inventario nuevo sin fricción, con la IA leyendo las listas.",
       "Da de alta un dev, sube su lista de precios (carga masiva IA) y copia su link.",
       "/superadmin/alta", temas=["inventario", "ingesta"]),
    _p("ingesta_datos", "inventario", "vista", "Ingesta masiva",
       "La cocina de datos: conectores, Drive, Data Lake, cobertura y cola de revisión.",
       "Qué datos están entrando, de dónde, y qué falta revisar.",
       "Sabes la calidad y cobertura de tus datos de un vistazo.",
       "Inicia una ingesta, revisa la cola pendiente, checa la cobertura de datos.",
       "/superadmin/datos", temas=["ingesta", "calidad"]),
    _p("modelo_aprendizaje", "inventario", "vista", "Aprendizaje del modelo",
       "Qué tan bien predice el sistema y cómo mejora con el tiempo.",
       "La precisión del AVM, del pronóstico y la confiabilidad de los scores.",
       "Confías (o no) en los números según su precisión medida.",
       "Revisa precisión AVM, calibración, scores e índices DMX.",
       "/superadmin/modelo", temas=["calidad", "scores", "certeza"]),

    # ── DINERO ──
    _p("monetizacion", "dinero", "vista", "Monetización & API",
       "Las llaves de la API pública, bundles B2B y todo lo que genera ingreso.",
       "Quién consume tu API, cuánto, y qué productos se venden.",
       "Cobras por el moat de datos que construiste.",
       "Crea/revoca llaves, arma bundles, revisa cross-sell y el costo de IA.",
       "/superadmin/monetizacion", temas=["dinero", "api"]),
    _p("intelligence_hub", "dinero", "vista", "Inteligencia ejecutiva",
       "El resumen para decisiones: precio, demanda, riesgo y oferta en una vista.",
       "El estado ejecutivo del negocio con insights regenerables.",
       "Tomas decisiones de alto nivel sin bucear en el detalle.",
       "Filtra por periodo, exporta el PDF, regenera los insights.",
       "/superadmin/intelligence-hub", temas=["dinero", "riesgo", "precio"]),

    # ── OPERACIÓN Y SEGURIDAD ──
    _p("operacion_salud", "operacion", "vista", "Salud del sistema",
       "El centro de operación: salud, observabilidad, auditoría, fraude y compliance.",
       "Si el sistema está sano, qué se auditó y si hay fraude o riesgo.",
       "Duermes tranquilo sabiendo que todo está monitoreado.",
       "Revisa salud, el audit log inmutable (SHA-256), patrones de fraude y alertas.",
       "/superadmin/operacion", temas=["seguridad", "compliance", "fraude"]),
    _p("crecimiento", "operacion", "vista", "Crecimiento & Distribución",
       "Los canales de salida: WhatsApp, newsletter, tarjetas sociales, leads de landing.",
       "Cómo se distribuye el contenido y de dónde vienen los leads.",
       "Escalas el alcance con los canales que ya tienes conectados.",
       "Manda newsletters, revisa el embudo de auditoría y las fuentes de leads.",
       "/superadmin/crecimiento", temas=["crecimiento", "leads"]),
    _p("devtools", "operacion", "vista", "Dev Tools",
       "Herramientas técnicas: mapa del sistema, diagnóstico de usuarios, primitivas UI.",
       "El estado interno para depurar y entender el sistema.",
       "Diagnosticas problemas sin salir del portal.",
       "Abre el mapa del sistema o el diagnóstico de usuarios.",
       "/superadmin/devtools", temas=["operacion"]),
]


# ── AGREGACIÓN DE FUENTES VIVAS (cero pérdida, cero duplicación) ────────────────────────────
# El menú de Reportes YA se auto-describe (44 bloques con qué-es/desc/necesita). Lo indexamos
# como piezas del catálogo, mapeando cada bloque a su dominio por tema — sin reimplementarlo.
_BLOQUE_A_DOMINIO = {
    "demanda_viva": "demanda", "genoma_kpi": "demanda", "espejo": "demanda", "escasez": "demanda",
    "data_negativa": "demanda", "radar_lexico": "demanda", "corredores": "demanda",
    "set_competitivo": "demanda", "etapa_vida": "demanda", "saliencia_visual": "demanda",
    "cohortes_gemelas": "demanda", "termometro_leads": "demanda", "gemelo_v2": "demanda",
    "oferta_absorcion": "mercado", "precio_sombra": "mercado", "liquidez": "mercado",
    "screener": "mercado", "curva_vertical": "mercado", "land_bank": "mercado",
    "evolucion": "mercado", "instantanea": "mercado", "transiciones": "mercado",
    "absorcion_viva": "mercado", "indice_adelantado": "mercado", "reloj_ciclo": "mercado",
    "curva_obra": "mercado", "prior_4s": "mercado", "contraste_4s": "mercado",
    "equilibrio_4s": "mercado", "gap_radar": "mercado", "consumidor_4s": "demanda",
    "brief_4s": "demanda", "prima_marca": "inventario", "salud_dato": "inventario",
    "accesibilidad": "dinero", "cap_rate_renta": "dinero", "elasticidad_impuestos": "dinero",
    "cronobiologia": "demanda", "bayes_formal": "demanda", "simulador": "mercado",
    "cerebro_drift": "operacion", "valor_informacion": "operacion",
    "dmx30": "productos", "carfax": "productos",
}
# los 3 productos del moat, descritos como piezas de primera clase
_PIEZAS += [
    _p("estudio_dmx", "productos", "producto", "Estudio DMX de Zona",
       "El estudio de mercado de una zona, auto-generado en segundos (reemplaza al 4S de 500k).",
       "16 secciones: demanda, quién busca, precios, absorción, plusvalía y más — de cualquier zona.",
       "Vendes el estudio, o decides con él, sin pagar ni esperar meses.",
       "En Reportes: escribe la colonia y pulsa 'Generar Estudio DMX' → sale con folio y se guarda.",
       "/superadmin/mercado", ["/api/superadmin/genoma/estudio-dmx"], ["colonias"],
       temas=["producto", "zona", "licenciable"]),
    _p("dmx30_producto", "productos", "indice", "DMX-30 · el índice de la vivienda CDMX",
       "El índice de las 30 colonias con más mercado, tipo bolsa de valores.",
       "El nivel del mercado (base 100) y qué colonia se mueve más que el promedio (beta).",
       "Publicas un índice trimestral que nadie más tiene — autoridad de marca.",
       "Ábrelo como bloque de reporte; madura solo con la bitácora diaria.",
       "/superadmin/mercado", ["/api/superadmin/genoma/dmx30"], temas=["producto", "indice", "plusvalia"]),
    _p("carfax_producto", "productos", "producto", "CARFAX del depa",
       "El historial completo de UNA unidad: precios, días en mercado, rival y veredicto.",
       "Todo lo que le pasó a un departamento y si su precio es justo.",
       "Le das al comprador (o al asesor) un informe de confianza por unidad.",
       "En Reportes marca 'CARFAX' y escribe el id de la unidad.",
       "/superadmin/mercado", ["/api/superadmin/genoma/carfax/{unit_id}"], ["unit_id"],
       temas=["producto", "unidad"]),
]


def _piezas_de_reportes() -> List[Dict[str, Any]]:
    """Indexa los 44 bloques auto-descritos como piezas del catálogo (sin reimplementarlos)."""
    try:
        from report_builder import catalogo as reportes_catalogo
    except Exception as e:
        log.warning("[catalogo] reportes fail-open: %s", e)
        return []
    out = []
    for b in reportes_catalogo().get("bloques", []):
        out.append(_p(
            f"reporte_{b['id']}", _BLOQUE_A_DOMINIO.get(b["id"], "mercado"), "reporte",
            b["titulo"],
            b["desc"],
            b["desc"],
            "Es un bloque del generador de reportes: combínalo con otros y expórtalo o guárdalo.",
            "Está en el Hub de Mercado → Reportes; márcalo y pulsa Generar.",
            "/superadmin/mercado", ["/api/superadmin/reportes/generar"], b.get("necesita", []),
            temas=["reporte"] + ([b["id"]] if b["id"] in _BLOQUE_A_DOMINIO else []),
        ))
    return out


def _piezas_de_features() -> List[Dict[str, Any]]:
    """Indexa las features del feature_registry (pricing) que aún no están descritas como pieza."""
    try:
        from feature_registry import get_all_features
    except Exception as e:
        log.warning("[catalogo] features fail-open: %s", e)
        return []
    ya = {p["id"] for p in _PIEZAS}
    out = []
    for f in get_all_features():
        pid = f"feature_{f['key']}"
        if pid in ya or f["key"] in {p["id"] for p in _PIEZAS}:
            continue
        cat = str(f.get("category", "")).lower()
        dominio = ("dinero" if cat in ("monetization", "pricing", "billing")
                   else "demanda" if "demand" in cat or "intelligence" in cat
                   else "operacion")
        out.append(_p(
            pid, dominio, "motor", f.get("name", f["key"]),
            f"Capacidad del sistema ({cat or 'general'}), del plan {f.get('plan_tier', 'free')}.",
            "Una función licenciable registrada en el catálogo de producto.",
            ("Genera ingreso: es una feature de pago." if f.get("monthly_price_mxn")
             else "Amplía lo que el sistema puede hacer."),
            "Se activa/gestiona desde Monetización según su plan.",
            "/superadmin/monetizacion", temas=["feature", cat or "general"],
        ))
    return out


def construir_catalogo() -> Dict[str, Any]:
    """El catálogo COMPLETO: piezas propias + reportes auto-descritos + features de pricing.
    Idempotente y puro (sin I/O) salvo la lectura de los registros vivos."""
    piezas = list(_PIEZAS) + _piezas_de_reportes() + _piezas_de_features()
    # dedup por id (last-write-wins), estable
    vistos: Dict[str, Dict[str, Any]] = {}
    for p in piezas:
        vistos[p["id"]] = p
    piezas = sorted(vistos.values(), key=lambda x: (x["dominio"], x["tipo"], x["titulo"]))

    por_dominio: Dict[str, int] = {}
    por_tipo: Dict[str, int] = {}
    temas: Dict[str, int] = {}
    for p in piezas:
        por_dominio[p["dominio"]] = por_dominio.get(p["dominio"], 0) + 1
        por_tipo[p["tipo"]] = por_tipo.get(p["tipo"], 0) + 1
        for t in p["temas"]:
            temas[t] = temas.get(t, 0) + 1
    return {
        "dominios": [{"id": k, **v, "n_piezas": por_dominio.get(k, 0)} for k, v in DOMINIOS.items()],
        "n_piezas": len(piezas), "por_tipo": por_tipo,
        "temas": sorted(temas, key=lambda t: -temas[t]),
        "necesita_valores": sorted({n for p in piezas for n in p["necesita"]}),
        "piezas": piezas,
    }


def buscar(catalogo: Dict[str, Any], *, texto: str = "", dominio: str = "",
           tipo: str = "", tema: str = "", necesita: str = "") -> Dict[str, Any]:
    """Filtro server-side (el mismo motor que el front usa, testeable): texto libre sobre
    título/qué-es/qué-hago + filtros exactos por dominio/tipo/tema/necesita."""
    t = (texto or "").strip().lower()
    out = []
    for p in catalogo["piezas"]:
        if dominio and p["dominio"] != dominio:
            continue
        if tipo and p["tipo"] != tipo:
            continue
        if tema and tema not in p["temas"]:
            continue
        if necesita and necesita not in p["necesita"]:
            continue
        if t:
            heno = " ".join([p["titulo"], p["que_es"], p["que_dice"], p["beneficio"],
                             p["que_hago"], " ".join(p["temas"])]).lower()
            if t not in heno:
                continue
        out.append(p)
    return {"n": len(out), "piezas": out}
