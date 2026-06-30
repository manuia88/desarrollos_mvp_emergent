# Auditoría de los 3 Portales — ¿Qué SÍ y qué NO tenemos?

Mapa honesto de Asesor, Dev y Superadmin contra los 5 lentes del plan Atlax.

> ## ✅ COMPLETADO (2026-06-30) — los 3 portales cerrados al 100%
> Tras esta auditoría se cerraron TODOS los gaps (WhatsApp excluido por decisión del founder). Matriz final:
>
> | Portal | Spatial | Taste | Generative | Agentic | Personal |
> |---|:--:|:--:|:--:|:--:|:--:|
> | Asesor | ✅ *(mapa)* | ✅ | ✅ | ✅* | ✅ |
> | Dev | ✅ | ✅ *(pulso/unidad)* | ✅ *(copy IA)* | ✅ *(apply real)* | ✅ *(memoria)* |
> | Superadmin | ✅ | ✅ | ✅ *(LLM memo)* | ✅ *(lazo cerrado)* | ✅ |
>
> *\*Asesor agentic sin WhatsApp (excluido). Detalle de cada acción al pie del documento (§ Acciones implementadas).*
> Verificado: batería 66/66 + **flywheel 4 portales 12/12** (1000 simultáneos · flujo de lead · registro en superadmin).

## Marco: un cerebro, varios lentes

El plan Atlax es **un solo cerebro de la demanda visto a través de lentes** según el rol. Cada portal (Asesor, Dev, Superadmin) reusa los mismos motores y datos, pero los presenta como una "lente" distinta. Los cinco lentes son: **spatial** (mapa / world-model de la demanda en el espacio), **taste** (modelo de gusto y el "porqué del NO"), **generative** (producir piezas: copy, render, memorándum), **agentic** (que el sistema actúe, no solo recomiende) y **personal** (memoria/relación que sigue al usuario). Este documento confronta, sin inflar, qué está realmente construido y cableado, qué está a medias, y qué no existe. **Parcial no es lo mismo que tenemos**: marcamos 🟡 cuando hay código real pero el lente no cierra (agregado en vez de individual, escrito sin lector, apagado por flag, o presentado en tabla en vez de mapa).

## Matriz resumen (portal × lente)

Leyenda: ✅ tenemos · 🟡 parcial · ❌ no tenemos

| Portal | Spatial | Taste | Generative | Agentic | Personal |
|---|:---:|:---:|:---:|:---:|:---:|
| **Asesor** | 🟡 | ✅ | ✅ | 🟡 | ✅ |
| **Dev** | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| **Superadmin** | ✅ | ✅ | 🟡 | 🟡 | 🟡 |

Lectura rápida: Asesor es fuerte en taste/generative/personal y débil en el mapa y en cerrar el acto autónomo. Dev brilla en spatial pero su taste es de masa, lo generativo vive fuera de la ficha, y no hay memoria del dev. Superadmin es el portal más profundo (spatial + taste de verdad), pero sus generadores no usan LLM y su lazo agéntico está abierto.

---

## ASESOR — el portal del asesor/broker

~54 rutas frontend, backend en `advisor.py` (~90 endpoints) + `asesor_market.py`, `cma.py`, `auto_pilot.py`, agent-workforce, agentic_crm, studio_*.

| Lente | Estado | Qué hay | Qué falta | Evidencia |
|---|:---:|---|---|---|
| **Spatial** | 🟡 | Inteligencia de mercado por colonia real y cableada en el Command Center: amenity-ranker (regresión hedónica live, r²=0.95, impacto %/m² por atributo) y demand-gap (gap/absorción por colonia×tipología, datos conductuales). CMA con mapa real (Mapbox: subject + comparables geolocalizados). | La inteligencia de zona se muestra como **tablas/listas, no como mapa navegable de demanda**. El único mapa real del portal es el de comparables del CMA. No hay un mapa de colonias clickeable con capas demanda/oferta/gap como lente espacial primario del asesor. | `AsesorMarketIntel.js`, `asesor_market.py:35`, `CMAComparablesMap.js`, `cma.py` |
| **Taste** | ✅ | Modelo de gusto del lead real y cableado: `taste_profile.py` se consume en `/context`, `/intel`, `/copilot-ask`, `/whatsapp/draft`, `/ai-suggest`. `recomendacion_contacto` cierra el loop comprador→asesor (resuelve contacto→lead→visitor_id→qué ofrecerle según lo que miró). Incluye el porqué del NO (feedback 👍👎 con motivo re-pondera; el cierre re-entrena el ranking). DISC y churn del lead en Ficha360. | El "porqué del NO" explícito (foto-dwell/zoom → señal negativa) vive del lado comprador; el asesor lo consume agregado. Falta explicabilidad ("rechazó X por Y") visible al asesor. | `taste_profile.py`, `advisor.py:870` (recomendacion_contacto), copilot/feedback, commit 4499f79d |
| **Generative** | ✅ | Suite generativa amplia y cableada: Studio (Video IA, Carruseles A/B por persona, Landing 10 templates + PDF, Brand Kit, Auto-Content, copy). Por lead: `/whatsapp/draft` (Claude sonnet-4-5 desde taste+brief), `/argumentario` y `/argumentario-rag` (pitch + objeciones por desarrollo×lead), `/briefing/daily`+`/briefing/voice` (TTS), memo-inversionista, `ai-suggest`. | El render generativo de **imagen/3D ("staged a tu gusto") está diferido** (espera OK de gasto Replicate). Falta el lente visual generativo (unidades restyled al gusto del lead). | `StudioHubPage.js`, `studio_video/carrusel/landing/brand_kit.py`, `advisor.py:1793` |
| **Agentic** | 🟡 | Dos capas reales: (1) Agent Workforce (5 agentes que califican y proponen, upsert a `command_center_actions`); (2) Autopiloto que **ejecuta de verdad** con 3 ejecutores (WhatsApp vía WAEngine, recordatorio, reasignar etapa) + 7 guardrails (whitelist, never-auto dinero, opt-in, confidence-min, kill-switch, cap diario, audit). `AutopilotPanel.js` cableado. | El acto estrella (WhatsApp) está **gated: `WHATSAPP_PROVIDER='stub'` por default**; `/channels/connect-request` es solo solicitud (sin OAuth real). El copiloto general es Q&A/RAG, **sin tool-calling** para actuar. Agéntico real pero en modo demo/opt-in, no cierra ciclo con cliente real. | `auto_pilot_engine`, `whatsapp_engine.py:21`, agent_workforce, `copilot_engine.ask_copilot` |
| **Personal** | ✅ | Memoria/relación robusta: Ficha360 es el hub-perfil (timeline unificado, nota persistente, tablero de propiedades por lead, gusto persistido, búsquedas/criterios). `copilot_events` registra cada pregunta por lead. Lead enrichment con cache. Continuidad comprador→asesor (lead llega con visitor_id + historial). "Mi Espejo" (coaching del propio asesor). DISC por lead. Pipeline persistente por owner. | Memoria **fragmentada en colecciones** unidas por owner_id+source_lead_id; no hay grafo/contexto único que "siga" al usuario sin fan-out. El contexto del copiloto se reconstruye on-the-fly (sin memoria conversacional persistente). El campo `etapa` de pipeline no existe (usa "temperatura" como proxy). | `Ficha360.js`, `/contactos/{cid}/overview`, `lead_enrichment.py`, `/mi-espejo` |

**Extras:** Command Center (cockpit "¿qué hago hoy?", vivo) · Conversaciones IA Playground/Bandeja (parcial: auto-reply real pero sin canal productivo) · CMA (vivo, Mapbox) · Pipeline/Mis Leads CRM (vivo) · Inteligencia de mercado amenity-ranker/demand-gap (vivo) · Workflows / Marketplace de plantillas / Social Ads (vivo) · Visit Auto-Prep / Briefing tráfico+clima (vivo) · Conexión de canales WhatsApp/Meta (**gated**, sin OAuth).

**Veredicto Asesor — ~75-80% construido (demo-completo).** Los 5 lentes están representados con código real y cableado front+back. Fortalezas: **Taste** (gusto + loop comprador→asesor + feedback que re-entrena), **Generative** (Studio + WhatsApp/argumentario/briefing por lead) y **Personal** (Ficha360 con memoria). Lo más importante que falta: **agentic real end-to-end** — el autopilot ejecuta de verdad pero su acción estrella corre sobre provider `stub` y `/channels` es solo solicitud; el copiloto general no tiene tool-calling. Secundario: **spatial** como lente primario (tablas, no mapa) y el **render visual generativo** (diferido por gasto Replicate).

---

## DEV — el portal del desarrollador

Backend en `developer.py`, `dev_market.py`, `dev_batch6/7.py`, `grafo_comprador.py`, `subagents.py`; frontend en `pages/developer/*` + `components/developer/*`. Flag `REACT_APP_DEV_V2`.

| Lente | Estado | Qué hay | Qué falta | Evidencia |
|---|:---:|---|---|---|
| **Spatial** | ✅ | Lente más maduro. **Mapa de demanda Mapbox choropleth real** (`/api/dev/analytics/demand-heatmap`, FeatureCollection con demand_score 0-100 por colonia, verificado en vivo: Polanco 100). Página `/desarrollador/demanda` + área del Centro de Inteligencia. Capas reales wired: demanda insatisfecha en tus colonias, features que pide el mercado vs oferta ("vista: 36 lo buscan vs 0 unidades"), zona-cambios, site-selection con gate, valor de terreno por colonia (valor_residual + norma3), índices DMX por zona. | El world-model espacial usa **colonia, no predio**; falta CUS/SIG real por predio (generador reporta `cus_origen='supuesto (sin SIG aún)'`). El "Gemelo de Demanda" (SimCity) es reciente y vive más en superadmin/founder. Mapbox degrada a lista si falta el token. | `DemandHeatmapMap.js`, `dev_batch6.py:98`, `dev_market.py:80-205`, `dev_batch7.py:519`, `valor_residual_engine.py` |
| **Taste** | 🟡 | Surface real del "qué quiere / por qué dice NO" pero a nivel **agregado/zona**: (1) "Qué Frena Tus Ventas" (objeciones rankeadas con contra-argumento, velocidad-respuesta vs cierre, embudo, DISC inferido); (2) GrafoCompradorCard "Qué Quiere La Demanda Aquí" (segmento dominante, likes, banda de demanda por colonia); (3) demand-features. | Es taste **de mercado, no individual** con el porqué del rechazo unidad-por-unidad. No hay captura del "no le gustó X de ESTA unidad/foto" del comprador llegando al dev. DISC/objeciones dependen de que entren conversaciones (varios paneles muestran "pendiente"). El loop foto-dwell/zoom→rechazo no está surfaceado en dev. | `DevComportamiento.js`, `developer.py:457`, `grafo_comprador.py:38`, `dev_market.py:80` |
| **Generative** | 🟡 | La capacidad real existe y el rol tiene acceso, pero vive en **módulos compartidos, no en la ficha del proyecto**: (1) Virtual Staging real (SDXL en Replicate, 3 estilos); (2) Studio (video/landing/brand-kit) accesible a developer_admin; (3) subagente de Marketing usa Claude (copy/difusión, verificado live). | Dentro del proyecto, ContenidoTab es **solo carga/edición manual** — no hay botón "generar render/copy con IA" inline. Los motores "generadores" del dev (generador_producto, estudio_mercado) son **computacionales/fórmula, no LLM**. Studio es developer_admin only. No hay brochure/landing del proyecto cableado al cierre del flujo. | `virtual_staging.py:24`, `studio.py:20`, `marketing_agent.py:289-342`, `ContenidoTab.js` (upload-only) |
| **Agentic** | 🟡 | DesarrolladorAgentes expone 3 subagentes (Precios/Difusión/Leads) sobre los proyectos del dev; `analyze()` corre con Claude y persiste recomendaciones. Hay flujo de aprobación (`/apply` y `/reject` con audit_log). CrmAssistantStrip y SalaDeControl surfacean jugadas del Cerebro con aprobar/descartar. | **No actúa autónomo**: `apply()` solo cambia status a 'applied' — **NO muta el precio/la unidad real**. Es recomendar-y-aprobar (human-in-the-loop). El agente que de verdad actúa (Cerebro: rutea/cierra) está **gateado por `CEREBRO_ENABLED` (default OFF, responde 503)** y los subagentes por `agentic_enabled` + tier T1. En prod, sin prender flags, el lazo automático no está activo. | `subagents.py:147-220` (apply solo flip status), `marketing_agent.py:535`, `cerebro/__init__.py:33`, `routes/cerebro.py` |
| **Personal** | ❌ | Casi nada de memoria/relación que siga al dev. Lo único persistido en `user_preferences` es estado de onboarding/tours y selección de alcance (Todo/Una zona). La única capa con memoria real es el Cerebro (askCopilot/getCerebroLearning) — pero está **apagado por flag**. | No hay **perfil/contexto persistente del dev** (sus zonas, su tesis, su histórico de decisiones, qué aceptó/rechazó usado para personalizar). Las recomendaciones rechazadas guardan reason pero no re-alimentan un modelo personal. Falta memoria conversacional viva por sesiones (la espina existe en Cerebro/Learning Spine pero off en deploy). | `dev_batch19.py:80-112` (solo tours/prefs), `SalaDeControl.js` (gateado), `subagents.py` (reject sin loop) |

**Extras:** Centro de Inteligencia unificado `/mercado` (9 áreas en un hub, vivo) · Competidor What-If (simulador de respuesta del rival, vivo) · Estudio de Mercado + Generador de Producto (vivo, **computacional no LLM**) · Margen/underwriting `dmx_margin` (motor existe) · Battle Card + Site Selection wizard (vivo con gate) · CRM & Leads + métricas de asesores + embudo (vivo, operativo central).

**Veredicto Dev — ~60-65% construido.** Fortaleza clara: **Spatial** (mapa de demanda + insatisfecha/features/zona-cambios/site-selection/valor-terreno/índices, todo wired y devolviendo dato real, verificado en vivo). **Taste y Generative en parcial**: el dev ve qué quiere el mercado y por qué pierde ventas, pero a nivel agregado, no individual; lo generativo real (SDXL/Studio) existe pero vive fuera de la ficha del proyecto. Lo más importante que falta: cerrar **Agentic y Personal** — hoy los subagentes solo recomiendan-y-aprueban (apply NO muta nada real) y el agente que actúa + la memoria que sigue al dev (Cerebro/Learning Spine) están cableados pero **apagados por flag**. En prod, prender esos flags es lo que convierte el portal de "tablero que recomienda" en "copiloto que actúa y recuerda".

---

## SUPERADMIN — el portal de inteligencia

~90 pantallas. Centro de gravedad: Terminal de Zona (`SuperadminTerminalZona.js`) sobre `superadmin_demand_intel.py` (60+ endpoints) + Founder Console (`superadmin_founder_console.py`). Backend verificado vivo.

| Lente | Estado | Qué hay | Qué falta | Evidencia |
|---|:---:|---|---|---|
| **Spatial** | ✅ | **Mapa geográfico real** cableado: Terminal de Zona > "Mapa de tensión" (`HeatmapPanel.js`, maplibre-gl, basemap CDMX) pinta marcadores por lat/lng repivotables (métrica×dimensión); verificado: 15 puntos (Polanco 19.433,-99.1939). Live Pulse usa Mapbox + geojson de polígonos. Atlas = explorador jerárquico ciudad→alcaldía→colonia→dev. Gemelo de Demanda = world-model tabular por colonia (demanda·oferta·hueco·oportunidad). | El world-model está en **tablas/marcadores, no en coroplético** por polígono de las 1,811 colonias (Heatmap pinta puntos). Live Pulse sí tiene polígonos pero es otra pantalla. Falta **unificar un solo mapa de demanda** sobre geometría real de colonias. | `HeatmapPanel.js`, `LivePulseMapTab.js`, `superadmin_demand_intel.py:278`, `AtlasPanel.js` |
| **Taste** | ✅ | **El "porqué del NO" surfaceado con dato real**: `/demand-intel/deep` devuelve `por_que_no` (verificado: 4 rechazos — precio:2, fotos:1, zona:1) con **taxonomía de 13 motivos**. + demanda no satisfecha (por colonia/recámaras/precio) y objeciones de conversación. Página de gusto dedicada (`GustoMercado.js`: gusto_visual, amenidades_aguja, fotos_recomendadas, perfil_mercado, por_zona). Compare/insights cuantifica qué atributo mueve el sell-through. | El gusto es **agregado de mercado** (qué rechaza la población), no perfil del operador ni el NO a nivel unidad-individuo con evidencia visual (foto-dwell). El "porqué" es **taxonómico/conteo, no narrativo-causal** por caso. | `superadmin_demand_intel.py:34` (/deep), `SuperadminDemandaMercado.js`, `GustoMercado.js`, `/compare/run` |
| **Generative** | 🟡 | Dos generadores reales **por composición de datos/plantilla (no LLM)**: (1) Auto-arquitecto "el cubo diseña" (`/disenar`: fichas tipología+atributo+tier+gap+premium + recomendación en prosa, verificado); (2) Memorándum institucional (`/memorandum`: secciones Resumen/Oferta/Demanda/Tensión/Comparables/Reco con texto auto-redactado + fuente por dato, imprimible). Studio (video/staging/social-cards) existe pero es generación de medios, separada. | **Sin LLM ni render visual** dentro del Terminal: memorándum y fichas son **texto por reglas**. No produce el activo final (brochure/landing) desde el hallazgo — solo recomienda. Falta cerrar diseño→pieza generada. | `auto_arquitecto.py`, `superadmin_demand_intel.py:148` (/disenar), `memorandum.py`, `AnalisisPanel.js`, `MemorandumPanel.js` |
| **Agentic** | 🟡 | Un agente que rutea + un palette que actúa, cableados, pero el **lazo no cierra**: (1) "El cubo actúa" (`/activar` inserta en `db.cube_actions` acción ruteada a dev/asesor/marketplace; para asesor cuenta leads potenciales reales); `/acciones` lista el libro mayor. (2) MotoresPanel corre cualquier motor. (3) Founder Console: command palette (18 comandos ejecutables con audit_log), Quick Actions, anomaly feed. | **LAZO ABIERTO: `db.cube_actions` se ESCRIBE pero ningún portal destino lo LEE** (único consumidor = `activacion.py`). La acción queda en un buzón sin lector. El palette es **17/18 'navigate'** (deep-links), no agente que busca/califica/cierra. No hay agente conversacional en superadmin. | `activacion.py` (insert sin consumidor), `superadmin_demand_intel.py:157/168`, `superadmin_founder_console.py:504/550`, grep `cube_actions` = solo activacion.py |
| **Personal** | 🟡 | **Memoria del OPERADOR superadmin** existe y cableada: (1) Quick Actions por-usuario (filtra `founder_quick_actions` por user_id, CRUD); (2) Vistas guardadas del analista (screeners/búsquedas + alertas con umbral evaluables); (3) FounderPrefetchContext cachea su dashboard; (4) audit_log registra cada mutación con el usuario. | Es **memoria de configuración/preferencias del operador**, no un contexto-relación que "siga" a un usuario externo ni perfil del comprador/tenant observado. No hay timeline unificado por entidad-persona. `director_memory_engine` existe pero **no está montado** en ninguna ruta superadmin. | `superadmin_founder_console.py:550`, `vistas_guardadas.py`, `FounderPrefetchContext.js`, director_memory_engine (sin ruta) |

**Extras (todos vivos salvo nota):** Terminal de Zona — el cubo OLAP consultable, la joya (15 tabs en 3 grupos, pivotea medida×escala×atributo×financiero, estándar INDICADOR 0 dato inventado) · What-if/Lookalike/Sankey/Simetría · Founder Console — cockpit ejecutivo (MRR/ARR/churn/ai-cost/forecast/anomalías) · DevMaster (analista de mercado, 106KB de rutas) · Inteligencia de mercado (Cerebro Mercado, Terminal CDMX, Knowledge Graph, Live Pulse, Grafo Comprador, AVM/Forecast/FSD) · Granularidad — registro de qué dato existe · Operación/Compliance/Audit (chain SHA-256, fraud, feature visibility) · Monetización (Data Licensing, Vertical Products, SOC Franchise) · **120 compuestas — stub honesto (parcial)**: las sin feeder reportan "fuente pendiente", el grid del cubo no está totalmente poblado.

**Veredicto Superadmin — ~75-80% construido (portal de inteligencia, no de venta).** Es de lejos el más profundo. **Spatial y Taste están de verdad** (mapa maplibre real + "porqué del NO" con taxonomía de rechazo viva). Generative/Agentic/Personal son parcial por razones concretas, no por falta de superficie. Lo más importante que falta, en orden: (1) **Agentic — lazo abierto**: el cubo escribe en `db.cube_actions` pero ningún portal lo consume (buzón sin lector); cerrarlo convierte el portal de mirador a operador. (2) **Generative sin LLM**: memorándum y fichas son texto-por-regla; falta narrativa de modelo y producir la pieza final. (3) **Personal es memoria de config del operador**, no contexto que siga a la persona observada (`director_memory_engine` existe pero sin montar). (4) **Spatial**: falta un único coroplético por polígono de colonia. Calidad alta: estándar INDICADOR, dato latente honesto (cero inventado), reutilización rigurosa de motores.

---

## Cierre: qué construir primero por portal

La visión Atlax ("un cerebro, varios lentes") se cierra atacando, en cada portal, el lente que hoy rompe el flywheel. Prioridades:

1. **Superadmin — cerrar el lazo agéntico (LECTOR de `db.cube_actions`).** Es el cambio de mayor apalancamiento de los tres portales: hoy el cubo ya escribe acciones ruteadas a dev/asesor/marketplace, pero nadie las lee. Conectar el consumidor (dev ve "construye esto", asesor ve "este lead calza") convierte el portal central de mirador a operador y, de paso, alimenta los lentes agentic de Dev y Asesor. Es el corazón del flywheel.

2. **Asesor — conectar canal WhatsApp productivo (Twilio/Meta + OAuth real).** El autopilot ya ejecuta de verdad con 7 guardrails, pero su acción estrella corre sobre provider `stub` y `/channels` es solo solicitud. Prender un proveedor real es lo único que falta para que el ciclo agéntico cierre con cliente real. Es el portal más cerca de producto vivo; este es su último cable.

3. **Dev — prender los flags que ya están cableados (`CEREBRO_ENABLED` + `agentic_enabled`) y hacer que `apply()` mute lo real.** Hoy los subagentes solo cambian un status; el Cerebro (que actúa y recuerda) está apagado. Prender los flags + cablear `apply()` al precio/unidad real cierra de un golpe **Agentic y Personal**, los dos lentes más flojos del portal. La memoria del dev (Learning Spine) viene incluida en esa misma espina.

Transversal a los tres: el **render visual generativo "staged a tu gusto"** (diferido por gasto Replicate) es el lente generative-visual que falta en Asesor y Dev; queda como decisión de gasto, no de construcción. Y el **coroplético único de demanda por polígono de colonia** unificaría el lente spatial entre Superadmin y Dev — alto valor de presentación, prioridad media frente a cerrar los lazos agénticos.

---

## Acciones implementadas (cierre 2026-06-30)

Base: el prompt del comprador como vara, esta auditoría como lista de huecos. WhatsApp excluido.

| # | Acción | Lente cerrado | Evidencia |
|---|---|---|---|
| 1 | **Lector del buzón del cubo** — dev/asesor LEEN `cube_actions` y actúan (antes nadie leía) | Superadmin·agentic → alimenta Dev/Asesor·agentic | `routes/cube_inbox.py`, `CuboBuzonPanel.js` |
| 2 | **`apply()` muta el precio real** de la unidad (tope ±20%, audit) | Dev·agentic | `routes/subagents.py` |
| 3 | **Memoria del dev** — tesis + decisiones (qué aplica/rechaza y por qué) | Dev·personal (era ❌) | `dev_memory_engine.py`, `DevMemoryPanel.js` |
| 4 | **Mapa de demanda del asesor** (tabla → choropleth navegable) | Asesor·spatial | `AsesorDemandaMapa.js` |
| 5 | **Narrativa LLM en el memorándum** (grounded, fail-soft) | Superadmin·generative | `memorandum.py` |
| 6 | **Pulso por unidad** — interés/rechazo conductual por unidad | Dev·taste | `/desarrollo/{id}/percepcion-unidades`, `UnitPulsePanel.js` |
| 7 | **Copy IA inline** en la ficha (`✨ Generar con IA`, grounded) | Dev·generative | `/desarrollador/generar-copy`, `ContenidoTab.js` |
| 8 | **Test final de flywheel** (1000 simultáneos + flujo lead + registro superadmin) | verificación · en la batería | `scripts/flywheel_final.py` (12/12) |

**Upgrades aplicados (sin que se pidieran explícito):** guardrail ±20% en `apply()`; el flywheel quedó como test #7 permanente de la batería; el dev prioriza su buzón por sus colonias; los stubs LLM son fail-soft (cero dependencia dura).

**Correcciones a la propia auditoría (verificado vs código, no vs papel):** `director_memory` SÍ estaba montado (`/api/superadmin/director/memory`); el flywheel ya escalaba a 1000 (no era un gap). El audit los marcaba como faltantes.
