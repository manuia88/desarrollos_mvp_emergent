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

    # ── FASE D: los 7 LENTES de Desarrollos → Inteligencia (ricos, antes solo descubribles
    # haciendo clic dentro de Desarrollos; ahora en el catálogo con deep-link a su lente). ──
    _p("lente_construir", "demanda", "reporte", "Dónde construir (demanda latente)",
       "Cruza la demanda real (leads: presupuesto + tipo + zona) contra la oferta — dónde hay hueco.",
       "Las zonas donde la gente quiere comprar y no hay suficiente oferta.",
       "Eliges el terreno donde el mercado ya te está pidiendo producto.",
       "Ábrelo: es el lente 'Dónde Construir' dentro de Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=construir", temas=["demanda", "oferta", "zona"]),
    _p("lente_gusto", "demanda", "reporte", "Gusto del mercado (modelo de gusto)",
       "El gusto visual agregado del mercado (modelo B5.4) — qué estética y features enamoran.",
       "Qué le gusta al comprador más allá de precio: estilo, amenidades, terminaciones.",
       "Diseñas producto que se ve como lo que la gente quiere, no como lo que tú crees.",
       "Ábrelo: lente 'Gusto del Mercado' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=gusto", temas=["demanda", "personas"]),
    _p("lente_comportamiento", "demanda", "reporte", "Comportamiento y objeciones",
       "Qué FRENA la compra: objeciones y comportamiento del comprador, a nivel mercado.",
       "Por qué la gente NO compra — la fricción real que pierde ventas.",
       "Quitas los frenos del embudo donde se cae la gente.",
       "Ábrelo: lente 'Comportamiento' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=comportamiento", temas=["demanda", "leads"]),
    _p("lente_stock", "mercado", "reporte", "Stock y Sold-Out",
       "Qué inventario se está agotando y qué se estanca — la velocidad por producto.",
       "Qué se vende volando (sube precio) y qué se atora (revisa).",
       "Ajustas precio y ritmo de lanzamiento con la realidad del stock.",
       "Ábrelo: lente 'Stock y Sold-Out' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=stock", temas=["oferta", "precio"]),
    _p("lente_macro", "mercado", "reporte", "Macro y Ciudad",
       "Qué de la CIUDAD mueve el valor: transporte, negocios, seguridad — señales urbanas.",
       "Cómo el entorno urbano empuja (o frena) la plusvalía de una zona.",
       "Anticipas qué zonas van a subir por obra pública o desarrollo urbano.",
       "Ábrelo: lente 'Macro y Ciudad' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=macro", temas=["zona", "plusvalia", "riesgo"]),
    _p("lente_competencia", "mercado", "reporte", "Competencia y Red",
       "El mapa de competidores y la red de proyectos — quién juega en cada zona.",
       "Contra quién compites en cada colonia y cómo se agrupan.",
       "Posicionas tu proyecto donde la competencia es débil.",
       "Ábrelo: lente 'Competencia y Red' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=competencia", temas=["oferta", "precio"]),
    _p("lente_ia", "inventario", "vista", "Cómo aprende la IA (sobre inventario)",
       "La transparencia del modelo: cómo aprende y mejora sobre el inventario.",
       "Por qué el sistema predice lo que predice — sin caja negra.",
       "Confías en los números porque ves cómo se forman.",
       "Ábrelo: lente 'Cómo Aprende la IA' en Desarrollos → Inteligencia.",
       "/superadmin/desarrollos?view=inteligencia&lente=ia", temas=["calidad", "certeza"]),

    # ── AUDITORÍA FASE A: las 7 vistas del sidebar que faltaban (cero pérdida real) ──
    _p("tenants", "operacion", "vista", "Clientes (tenants)",
       "Todos los clientes de la plataforma: devs, inmobiliarias, su estado y plan.",
       "Quién te paga, en qué plan está y si está activo, en trial o suspendido.",
       "Controlas tu base de clientes y su ciclo de vida comercial.",
       "Filtra por tipo (devs/inmobiliarias) y estado; entra a cada cliente.",
       "/superadmin/tenants", temas=["dinero", "operacion"]),
    _p("inmobiliaria_leads", "demanda", "vista", "Leads de inmobiliaria",
       "Los leads que llegan a tu propia inmobiliaria (no a terceros).",
       "Quién quiere comprar contigo directamente y en qué etapa está.",
       "No pierdes un solo comprador que tocó tu puerta.",
       "Revisa la lista y da seguimiento a cada lead.",
       "/superadmin/inmobiliaria-leads", temas=["leads", "demanda"]),
    _p("ia_conversacional", "demanda", "vista", "Conversaciones IA",
       "Todo lo que Atlax (el asistente) conversa: costos, huecos de conocimiento y calidad.",
       "Qué preguntan los usuarios, qué no supo responder la IA y cuánto cuesta.",
       "Mejoras al asistente donde falla y controlas su gasto.",
       "Revisa conversaciones, huecos de conocimiento, A/B de prompts y el RAG Inspector.",
       "/superadmin/ia-conversacional", temas=["ia", "calidad", "dinero"]),
    _p("phase5_foundation", "inventario", "vista", "Foundation Phase 5",
       "Los cimientos de datos: DENUE (comercios), costos de construcción, scores de zona.",
       "La base geográfica y económica sobre la que corren los motores.",
       "Aseguras que los datos-cimiento estén cargados y frescos.",
       "Sincroniza DENUE, carga costos de construcción y zone scores.",
       "/superadmin/phase5-foundation", temas=["calidad", "zona", "ingesta"]),
    _p("transactions_network", "mercado", "vista", "Transaction Network",
       "La red de transacciones reales: quién vendió qué, dónde y a qué precio.",
       "Las operaciones cerradas de verdad — el precio real, no el de lista.",
       "Calibras los AVM y precios con transacciones reales, no estimadas.",
       "Ingresa transacciones (CSV/notaría) y filtra por zona/tipo/fuente.",
       "/superadmin/transactions", temas=["precio", "transacciones", "certeza"]),
    _p("knowledge_graph", "operacion", "vista", "Knowledge Graph",
       "El grafo de conocimiento: cómo se conectan zonas, proyectos y entidades del mercado.",
       "Las relaciones ocultas entre entidades + anomalías detectadas.",
       "Descubres conexiones que ninguna tabla plana te muestra.",
       "Haz preguntas al grafo, explóralo visualmente, revisa anomalías.",
       "/superadmin/knowledge-graph", temas=["operacion", "certeza"]),
    _p("granularidad", "inventario", "vista", "Visibilidad de granularidad",
       "Hasta qué nivel de detalle llega cada dato (ciudad → colonia → proyecto → unidad).",
       "Qué tan fino es tu dato en cada dimensión — dónde tienes el átomo.",
       "Sabes dónde tu moat de granularidad es real y dónde es estimado.",
       "Inspecciona el registro de granularidad por dimensión.",
       "/superadmin/granularidad", temas=["granularidad", "calidad"]),
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
    # los bloques que YA son productos de primera clase no se re-listan como reporte suelto
    # (dedup: CARFAX y DMX-30 viven como 'producto'/'indice', su bloque no duplica la card)
    ya_producto = {"carfax", "dmx30"}
    out = []
    for b in reportes_catalogo().get("bloques", []):
        if b["id"] in ya_producto:
            continue
        out.append(_p(
            f"reporte_{b['id']}", _BLOQUE_A_DOMINIO.get(b["id"], "mercado"), "reporte",
            b["titulo"],
            b["desc"],
            b["desc"],
            "Es un bloque del generador de reportes: combínalo con otros y expórtalo o guárdalo.",
            "Pulsa 'Ir': abre el generador con este reporte ya marcado.",
            # DEEP-LINK (auditoría Fase A): 'Ir' pre-selecciona el bloque en el Hub, no manda al genérico
            f"/superadmin/mercado?tab=reportes&bloque={b['id']}",
            ["/api/superadmin/reportes/generar"], b.get("necesita", []),
            temas=["reporte"] + ([b["id"]] if b["id"] in _BLOQUE_A_DOMINIO else []),
        ))
    return out


# AUDITORÍA FASE A: la capa humana de las features (antes genéricas). key → (dominio, ruta, qué_es,
# qué_dice, beneficio, qué_hago). Una feature nueva sin entrada aquí cae al fallback honesto.
_FEATURE_HUMANO: Dict[str, tuple] = {
    "battle_card": ("demanda", "/superadmin/inteligencia", "La ficha de combate vs un competidor: cómo le ganas.", "En qué eres mejor y peor que un proyecto rival, punto por punto.", "Cierras ventas mostrando ventajas concretas.", "Ábrela desde la ficha de una unidad o proyecto."),
    "buyer_score": ("demanda", "/superadmin/inteligencia", "El puntaje de calidad de un comprador (qué tan probable es que cierre).", "Qué tan caliente y solvente es cada lead.", "Priorizas los leads que sí van a comprar.", "Míralo en el detalle de cada lead."),
    "drpi": ("mercado", "/superadmin/modelo", "El índice de riesgo-precio de un desarrollo (DRPI).", "Si un proyecto está bien o mal valuado según su riesgo.", "Detectas gangas y sobreprecios de proyectos completos.", "Revísalo en Modelo & Aprendizaje → Índices DMX."),
    "zone_score": ("mercado", "/superadmin/terminal-zona", "El puntaje de calidad de una zona (0-100).", "Qué tan buena es una colonia según servicios, seguridad y transporte.", "Comparas zonas con un número objetivo.", "Ábrelo en la Terminal de Zona."),
    "forecast_accuracy": ("operacion", "/superadmin/modelo", "Qué tan bien acertó el pronóstico del sistema.", "Si puedes confiar en las predicciones de precio.", "Sabes cuánto creerle al modelo antes de decidir.", "Revísalo en Modelo & Aprendizaje → Precisión pronóstico."),
    "fsd_accuracy": ("operacion", "/superadmin/modelo", "La confiabilidad de los scores (Full Self-Driving del dato).", "Qué tan estables y confiables son los índices.", "Distingues un score sólido de uno ruidoso.", "Míralo en Modelo → Confiabilidad (FSD)."),
    "knowledge_graph": ("operacion", "/superadmin/knowledge-graph", "El grafo de conocimiento del mercado.", "Cómo se conectan zonas, proyectos y entidades.", "Descubres relaciones que las tablas no muestran.", "Explóralo en Knowledge Graph."),
    "live_pulse_alerts": ("mercado", "/superadmin/live-pulse", "Alertas en vivo de movimientos del mercado.", "Qué zona se está moviendo AHORA.", "Reaccionas el mismo día a un cambio.", "Actívalas en Live Pulse → Alertas."),
    "transactions_network": ("mercado", "/superadmin/transactions", "La red de transacciones reales cerradas.", "El precio real de venta, no el de lista.", "Calibras precios con la verdad del mercado.", "Ábrela en Transaction Network."),
    "probability_ux": ("demanda", "/superadmin/modelo", "La probabilidad de cada evento expresada de forma clara.", "Qué tan probable es que algo pase, en lenguaje simple.", "Decides con probabilidades, no corazonadas.", "Aparece en los tableros de predicción."),
    "metrics_cube": ("mercado", "/superadmin/metrics-cube", "El cubo de métricas: cualquier corte del mercado.", "El número exacto de cualquier combinación de filtros.", "Respondes preguntas muy específicas al instante.", "Ábrelo en Cubo de métricas."),
    "data_lake": ("dinero", "/superadmin/datos", "El almacén de todos los datos crudos.", "Todo lo que el sistema ha capturado, sin procesar.", "Licencias o exportas datos crudos a terceros.", "Gestiónalo en Ingesta → Data Lake."),
    "data_licensing": ("dinero", "/superadmin/monetizacion", "La venta de datos a terceros (licenciamiento).", "Qué datos vendes y a quién.", "Monetizas el moat de datos que construiste.", "Configúralo en Monetización."),
    "ai_cost_dashboard": ("dinero", "/superadmin/monetizacion", "El tablero de cuánto cuesta la IA.", "Cuánto gastas en modelos de IA y en qué.", "Controlas el costo antes de que se dispare.", "Míralo en Monetización → Costo de IA."),
    "cross_sell": ("dinero", "/superadmin/monetizacion", "Analítica de venta cruzada entre productos.", "Qué clientes comprarían otro producto tuyo.", "Aumentas el ingreso por cliente existente.", "Revísalo en Monetización → Cross-sell."),
    "vertical_products": ("dinero", "/superadmin/monetizacion", "Los productos verticales licenciables.", "Qué paquetes de producto puedes vender por industria.", "Empaquetas el moat en productos vendibles.", "Gestiónalos en Monetización."),
    "whatsapp": ("operacion", "/superadmin/crecimiento", "El canal de WhatsApp Business.", "Los mensajes que entran y salen por WhatsApp.", "Conversas con leads donde ya están.", "Ábrelo en Crecimiento → WhatsApp."),
    "newsletter_pulse": ("operacion", "/superadmin/crecimiento", "El motor de newsletters automáticas.", "Qué boletines se envían y su desempeño.", "Nutres tu audiencia sin trabajo manual.", "Gestiónalo en Crecimiento → Newsletter."),
    "bulletins": ("operacion", "/superadmin/crecimiento", "Los boletines de mercado generados por IA.", "Reportes de mercado listos para publicar.", "Publicas autoridad de marca sin escribir.", "Genéralos en Crecimiento → Boletines."),
    "social_cards": ("operacion", "/superadmin/crecimiento", "Tarjetas para redes sociales auto-generadas.", "Contenido visual listo para compartir.", "Distribuyes en redes sin diseñador.", "Créalas en Crecimiento → Tarjetas sociales."),
    "smart_notifications": ("operacion", "/superadmin/operacion", "Notificaciones inteligentes por evento.", "Qué avisos automáticos manda el sistema.", "Te enteras de lo importante sin revisar.", "Configúralas en Operación."),
    "lead_journey": ("demanda", "/superadmin/crecimiento", "El viaje completo de un lead de principio a fin.", "Por dónde pasó cada lead hasta comprar (o no).", "Optimizas el embudo donde se cae la gente.", "Ábrelo en Crecimiento → Embudo."),
    "marketplace_search": ("demanda", "/superadmin/inteligencia", "El motor de búsqueda del marketplace (Atlax).", "Qué y cómo busca la gente en tu marketplace.", "Entiendes la demanda desde el buscador mismo.", "Su señal alimenta el genoma; revísala en Demanda."),
    "partners": ("operacion", "/superadmin/crecimiento", "El directorio de aliados y socios.", "Con quién estás asociado y su desempeño.", "Escalas distribución vía aliados.", "Gestiónalo en Crecimiento → Aliados."),
    "private_beta": ("operacion", "/superadmin/crecimiento", "Las invitaciones a la beta privada.", "Quién está invitado y quién entró.", "Controlas el acceso temprano al producto.", "Gestiónalas en Crecimiento → Invitaciones."),
    "brochure": ("operacion", "/superadmin/monetizacion", "El generador de folletos de proyectos.", "Material de venta listo por proyecto.", "Das a los devs material profesional al instante.", "Genéralos desde Plantillas marketplace."),
    "studio_ads": ("dinero", "/superadmin/monetizacion", "El estudio de anuncios sociales (Social Ads).", "Campañas de anuncios y su rendimiento.", "Monetizas con publicidad de proyectos.", "Ábrelo en Monetización → Social Ads."),
    "studio_video": ("dinero", "/superadmin/monetizacion", "El estudio de video para proyectos.", "Videos generados y en cola.", "Vendes contenido de video a los devs.", "Ábrelo en Monetización → Video."),
    "tour_3dgs": ("dinero", "/superadmin/monetizacion", "Los recorridos 3D (Gaussian Splatting) de unidades.", "Qué unidades tienen tour inmersivo.", "Diferencias la ficha con experiencia 3D.", "Gestiónalos en Monetización."),
    "avm_public": ("mercado", "/superadmin/modelo", "El AVM público: valuación automática de una propiedad.", "Cuánto vale un inmueble según el modelo.", "Das una valuación instantánea y creíble.", "Revisa su precisión en Modelo → Precisión AVM."),
    "duplicates": ("operacion", "/superadmin/operacion", "La revisión de registros duplicados.", "Qué proyectos/unidades están duplicados.", "Mantienes el inventario limpio y confiable.", "Resuélvelos en Operación → Duplicados."),
    "entity_resolution": ("operacion", "/superadmin/operacion", "La resolución de entidades (el mismo dev/proyecto con nombres distintos).", "Qué registros son en realidad la misma entidad.", "Unificas datos que estaban fragmentados.", "Ábrelo en Operación → Resolución de entidades."),
    "audit_chain": ("operacion", "/superadmin/operacion", "La cadena de auditoría inmutable (SHA-256).", "Todo lo que cambió, imposible de alterar.", "Pruebas ante YC/regulador que nada se manipuló.", "Revísala en Operación → Cadena."),
    "bulk_drive_ingest": ("inventario", "/superadmin/datos", "La ingesta masiva desde Google Drive.", "Qué archivos entraron y su estado.", "Subes inventarios completos desde Drive.", "Ábrelo en Ingesta → Drive."),
    "widget_embeds": ("operacion", "/superadmin/operacion", "La analítica de los widgets embebidos en sitios externos.", "Dónde están embebidos tus widgets y su uso.", "Mides tu alcance fuera de la plataforma.", "Revísalo en Operación → Widgets embebidos."),
    "valores_landing": ("operacion", "/superadmin/crecimiento", "Los lead-magnets de las landing pages.", "Qué formularios capturan leads y cuántos.", "Captas compradores desde landings de marca.", "Revísalos en Crecimiento → Leads de landing."),
    "atlax_chat": ("demanda", "/superadmin/ia-conversacional", "El chat de Atlax (el asistente IA público).", "Qué conversa la IA con los usuarios.", "Escalas atención sin agentes humanos.", "Revísalo en Conversaciones IA."),
}


def _piezas_de_features() -> List[Dict[str, Any]]:
    """Indexa las features del feature_registry con capa HUMANA (registro _FEATURE_HUMANO) o
    fallback honesto. Cero pérdida: toda feature registrada entra al catálogo."""
    try:
        from feature_registry import get_all_features
    except Exception as e:
        log.warning("[catalogo] features fail-open: %s", e)
        return []
    ya = {p["id"] for p in _PIEZAS}
    out = []
    for f in get_all_features():
        pid = f"feature_{f['key']}"
        if pid in ya:
            continue
        h = _FEATURE_HUMANO.get(f["key"])
        cat = str(f.get("category", "")).lower()
        if h:
            dominio, ruta, que_es, que_dice, beneficio, que_hago = h
        else:  # fallback honesto para features sin descripción a mano (mejorable incrementalmente)
            dominio = ("dinero" if cat in ("monetization", "pricing", "billing")
                       else "demanda" if "demand" in cat or "intelligence" in cat else "operacion")
            ruta = "/superadmin/monetizacion"
            que_es = f"Capacidad del sistema ({cat or 'general'}), del plan {f.get('plan_tier', 'free')}."
            que_dice = "Una función registrada del producto — su descripción detallada está pendiente."
            beneficio = ("Genera ingreso (feature de pago)." if f.get("monthly_price_mxn")
                         else "Amplía lo que el sistema puede hacer.")
            que_hago = "Se activa/gestiona desde Monetización según su plan."
        out.append(_p(pid, dominio, "motor", f.get("name", f["key"]),
                      que_es, que_dice, beneficio, que_hago, ruta,
                      temas=["feature", cat or "general",
                             ("descrita" if h else "por_describir")]))
    return out


# FASE D (auditoría): cada hub-vista LISTA sus pestañas → buscar cualquier término de tab
# encuentra su hub (cerró el gap 'gov data'→0). Los tabs son 1-nivel (visibles al abrir el hub),
# por eso van como 'incluye' del hub, no como pieza propia (los lentes de 2-niveles sí son piezas).
_HUB_INCLUYE: Dict[str, List[str]] = {
    "ingesta_datos": ["Ingesta masiva", "Conectores", "Gov Data MX", "Drive", "Data Lake",
                      "Documentos", "Cobertura de datos", "Pulso del catálogo"],
    "operacion_salud": ["Salud sistema", "Observabilidad", "ROI & Phase Y", "Actividad unificada",
                        "Audit log", "Cadena SHA-256", "Compliance", "Patrones de fraude",
                        "Alertas de fraude", "Alertas de riesgo", "Duplicados",
                        "Resolución de entidades", "Visibilidad de funciones", "Widgets embebidos",
                        "Reputación de marca"],
    "monetizacion": ["API Keys & Uso", "Bundles B2B", "Probar API", "Cross-sell", "Franquicia SOC",
                     "Plantillas marketplace", "Enriquecimiento de leads", "Social Ads", "Video",
                     "Costo de IA", "Comercial & Planes"],
    "crecimiento": ["WhatsApp", "Newsletter", "Boletines", "Tarjetas sociales",
                    "Distribución social", "Leads de landing", "Embudo auditoría",
                    "Fuentes de leads", "Onboarding", "Aliados", "Invitaciones"],
    "inteligencia_demanda": ["Demanda de mercado", "Gemelo de demanda", "Grafo del comprador",
                             "Google Trends", "Calidad de obra", "Reseñas de residentes",
                             "Staging virtual", "Investment Explorer", "Granularidad",
                             "Migración climática"],
    "ia_conversacional": ["Conversaciones", "Copiloto", "Costo", "Huecos de conocimiento",
                          "A/B de prompts", "Drift", "RAG Inspector"],
    # FASE E (matriz de trazabilidad): vistas NO-hub que traen sub-pestañas con capacidades
    # reales (motores/scores/índices). Se listan para que la búsqueda las encuentre igual que
    # a un hub — cerró los últimos huecos del crawl (Precisión AVM, DENUE, Heatmap, etc.).
    "modelo_aprendizaje": ["Precisión AVM", "Precisión pronóstico", "Confiabilidad (FSD)",
                           "Calibración", "Cómo aprende el modelo", "Scores", "Índices DMX",
                           "DRPI", "Risk Score"],
    "alta_devs": ["Alta manual", "Carga masiva (IA)", "Directorio de desarrolladores"],
    "terminal_zona": ["Explorar", "Analizar", "Reportar", "Celda atómica", "Explorador (árbol)",
                      "Mapa de tensión", "Atlas de zonas", "Por desarrollo"],
    "live_pulse": ["Heatmap", "Timeline", "Alertas", "Readiness"],
    "cubo_metricas": ["Comparar zonas", "Drill-down", "Corte cruzado", "Backfill histórico"],
    "knowledge_graph": ["Preguntas al grafo", "Grafo", "Anomalías", "Monitoring"],
    "phase5_foundation": ["DENUE", "Costos de construcción", "Zone Scores"],
    "devtools": ["Primitivas UI", "Mapa del sistema", "Diagnóstico de usuarios"],
    "intelligence_hub": ["Precio", "Demanda", "Riesgo", "Oferta"],
    "hub_mercado": ["Equilibrio 4S", "Asequibilidad", "Vida a pie y segura", "Explorador"],
}


def construir_catalogo() -> Dict[str, Any]:
    """El catálogo COMPLETO: piezas propias + reportes auto-descritos + features de pricing.
    Idempotente y puro (sin I/O) salvo la lectura de los registros vivos."""
    piezas = list(_PIEZAS) + _piezas_de_reportes() + _piezas_de_features()
    # enriquecer los hubs con sus pestañas (searchable + visible como 'incluye')
    for p in piezas:
        tabs = _HUB_INCLUYE.get(p["id"])
        if tabs:
            p["incluye"] = tabs
            p["temas"] = list(dict.fromkeys(p["temas"] + [t.lower() for t in tabs]))
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
                             p["que_hago"], " ".join(p["temas"]),
                             " ".join(p.get("incluye", []))]).lower()
            if t not in heno:
                continue
        out.append(p)
    return {"n": len(out), "piezas": out}
