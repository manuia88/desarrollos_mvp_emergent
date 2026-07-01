# Auditoría Ficha v3 (FichaCockpit) — Propagación al Flywheel

> **Fecha:** 2026-06-30 · **Rama:** `feat/p1-feeders` · **Ficha default:** FichaCockpit (v3) en `/desarrollo/:id` (`App.js:1174/1180`; v2 tras `?v2=1`, v1 retirada).
>
> **Alcance:** 4 auditorías cruzadas de la v3 como emisor de señales, generador de leads, asistente Atlax y sensor. Verificación EN VIVO (señales emitidas → Mongo → readers reales) + lectura de código + `curl` backend. Este documento **deduplica**, **confronta** y **prioriza**. Los line-refs load-bearing fueron re-verificados contra el código en esta rama.

---

## 1. Resumen ejecutivo

La v3 **funciona bien en el tronco caliente** (lead "camino de oro" → asesor/dev, engagement/temperatura, demanda por-unidad, señales de intención al superadmin). **Pero al volverse default rompió cables del moat** que la ficha vieja alimentaba: el **modelo de gusto se apaga** (no emite `like/save/photo`), la señal **`module_open` desapareció** (degrada temperatura + producto de datos del superadmin), y **dos de los tres caminos de lead** (las dos ramas de Atlax) **pierden la atribución al dev/unidad**. El sensor mide con **tabs gruesos** en vez de módulos finos, y esos tipos **no puntúan** en la temperatura.

**Veredicto:** la v3 **NO** alimenta el flywheel tan completo como debe. Cierra bien el ciclo de leads por el camino principal, pero **fuga las señales más profundas del moat** (gusto, engagement de contenido, atribución del lead conversacional). Es corregible con ~8 fixes acotados, mayormente front, reusando helpers ya existentes.

### Conteo por severidad (post-dedup)

| Severidad | # | IDs |
|---|---|---|
| 🔴 CRÍTICO | 3 | V3-TASTE-DARK · V3-LEAD-01 · V3-LEAD-02 / ATLAX-01 *(mismo defecto, fusionado)* · V3-SENSOR-01 |
| 🟠 ALTO | 6 | V3-FICHA-VIEW-LOST · V3-PAYMENT-EXPLORE-LOST · V3-LEAD-03 · V3-LEAD-04 · V3-SENSOR-02 · ATLAX-02 · V3-01 |
| 🟡 MEDIO | 6 | V3-INTERES-SOCIAL · V3-GRAFO-COLONIA-LIKE · V3-LEAD-05 · V3-SENSOR-03 · ATLAX-03 · V3-02 · V3-03 |
| ⚪ BAJO | 6 | V3-BEHAVIOR-PROFILE-EMPTY · V3-LEAD-06 · V3-SENSOR-04 · V3-SENSOR-05 · ATLAX-04 · V3-04 · V3-05 · V3-06 |

*(V3-LEAD-02 y ATLAX-01 son el mismo defecto — el path `capture-lead` del bubble pierde dev/unidad/visitor — se cuentan como 1 crítico. Idem V3-SENSOR-01/02 comparten la raíz "module_open perdido".)*

---

## 2. Hallazgos por severidad

### 🔴 CRÍTICO

| ID | Ubicación | Impacto | Fix (1 línea) |
|---|---|---|---|
| **V3-TASTE-DARK** | `visitor_taste.py:45,60` · `buyer_signals.py:1041` · `FichaCockpit.js:548` | El modelo de gusto (B5.4) solo lee `like/save/photo_dwell/photo_zoom`; la v3 solo emite `unit_save` → `taste_scores=EMPTY`, `build_visitor_taste=None`. mi-gusto/parecidos/"Para ti" se apagan para TODO comprador v3. **Verificado:** 4 de 5 unit-savers quedan taste-dark. | Ampliar `$in` de positivos a `['like','save','unit_save']` (resolviendo entity_id desde el dev) en `visitor_taste.py:45` y en `taste_scores` (`buyer_signals.py:1041`). |
| **V3-LEAD-01** | `AtlaxBubble.js:856` (`setLeadCtx({dev:null})`), `:318` (sin prop `dev`) · `FichaCockpit.js:684` | CTA "Pregúntale a Atlax" → AtlaxLeadModal registra con `dev_id=null` → lead **sin `development_id`**: el dev NUNCA lo ve, el asesor lo recibe sin unidad/lente. Rompe el triángulo comprador↔asesor↔dev en el asistente "agéntico". | Pasar `dev={dev}` (+unit/lens) a `AtlaxBubble` en `FichaCockpit.js:684`; en el `setLeadCtx` de ficha usar `{dev, unit, lens, query}`; `AtlaxLeadModal` enviar `dev_id/unit_number/lens`. |
| **V3-LEAD-02 / ATLAX-01** *(fusionado)* | `asistente_engine.py:1416-1442` · `asistente.py:79-84` (`CaptureLeadIn`) · `atlaxApi.js:25-36` · `lead_bridge.py:168-180` | 2º camino del bubble (`LeadCaptureMiniForm → /capture-lead`) crea lead **sin** `development_id/unit_number/lens/visitor_id` — el contexto de la ficha queda solo como texto libre en `mensaje`. **Verificado en vivo:** `lead_47aa2531c62a` con `development_id=None`, se fusionó por teléfono a un contacto seed ajeno. Doble universo de leads + moat perdido. | En la ficha, el handoff conversacional debe abrir **AtlaxLeadModal** (postea a `/api/buyer/registrar` con visitor+dev) en vez de `LeadCaptureMiniForm`. O: añadir `dev_id/unit_number/visitor_id` a `CaptureLeadIn` y delegar en `create_buyer_lead`. |
| **V3-SENSOR-01** | `FichaCockpit.js` (0 emisiones) vs `FichaDesarrollo.js:172,345-369` | La v3 **no emite `module_open`** (grep=0). Doble pérdida: (1) `module_open` vale 5pts/tope25 en `compute_engagement` (`buyer_signals.py:798`) → mismos compradores caen más fríos, el asesor prioriza mal; (2) `engagement_by_content` (`demand_intelligence.py:740`) → panel "modulos_abiertos" del superadmin/dev queda VACÍO con tráfico v3. | Re-cablear `module_open` con los MISMOS `value` de la v2 (`inv_calc`, `vivir_pago`, `vivir_panorama`, `confianza`, `vivir_zona`) — 1 `useEffect` por módulo al montar el contenido de cada tab. Reusa el helper de la v2. |

### 🟠 ALTO

| ID | Ubicación | Impacto | Fix (1 línea) |
|---|---|---|---|
| **V3-FICHA-VIEW-LOST** | `App.js:1174` · `DevelopmentDetail.js:145` (huérfano) · `FichaCockpit.js` (no auto-emite) | La ficha default ya NO emite `ficha_view` (ni dwell/scroll_depth/tour_view) en la mayoría de visitas (marketplace/mapa/link directo). Debilita `compute_engagement`, `demand_by_feature`, `/interes` y la profundidad del embudo. **Mongo:** `tour_view=0`, `scroll_depth=0` históricos. | Emitir `ficha_view` en el mount de FichaCockpit (useEffect con entity_id/colonia/unit) + `dwell`/`scroll_depth` on-unmount + `tour_view` al abrir tour/galería. Borrar o re-rutear `DevelopmentDetail.js` (código muerto). |
| **V3-PAYMENT-EXPLORE-LOST** | `PlanDePago.js` (render en `FichaCockpit.js:629`, no emite) · `demand_intelligence.py:97,329` | La v3 renderiza el cotizador completo (apartado/enganche/mensualidad/esquema) pero NO emite `payment_explore` → `financial_intent/financial_demand` pierden la intención financiera del comprador "vivir". Solo sobrevive `roi_explore` (lente inversionista). **Mongo:** `payment_explore=0`. | Emitir `payment_explore` desde `PlanDePago.js` al cambiar enganche/plazo/esquema (meta: enganche/mensualidad/esquema/plazo), patrón idéntico a `PublicCotizador.js:59` y `roi_explore` en `SeccionCalcInversion.js:36`. Debounce. |
| **V3-LEAD-03** | `lead_bridge.py:146-181` (branches 1 y 2 del mirror) | Comprador recurrente (o teléfono ya en el CRM): el espejo refresca temperatura/engagement/taste pero **NO** actualiza `unidad_interes/lente/contexto_registro/development_id`. **Verificado:** contacto con `engagement_score=0`, lente viejo, contexto `None` pese a lead con score 65/contexto 14.2%/unidad 02A. El asesor ve datos viejos. | En branches 1 y 2 del `$set`, incluir (cuando lleguen no-nulos) `unidad_interes/lente/contexto_registro/development_id/project_id` + en branch 2 copiar `engagement_score/factores/temperatura`. Patrón no-destructivo (solo pisa si hay valor). |
| **V3-LEAD-04** | `FichaCockpit.js:474` (`onLead`) · `SeccionPanorama.js:64` | El wizard "para vivir" manda `detail.unit` (mejor unidad) + `detail.perfil` (ingreso/ahorro/renta/crédito/presupuesto), pero `onLead` **solo lee `e.detail.source`** — descarta unit y perfil. El LeadCaptureModal abre con unit de página (a menudo null) → lead sin unidad ni perfil económico. Momento de altísima señal, perdido. | `setLeadModal({reason, unit: e.detail.unit, perfil: e.detail.perfil})` y que LeadCaptureModal acepte overrides que pisen los de página; mapear perfil→contexto/buyer_profile en el registrar. |
| **V3-SENSOR-02** | `buyer_signals.py:792-800` (pesos) vs `FichaCockpit.js:533-540` | La v3 apuesta el engagement a `section_view/section_time`, pero **ninguno está en los pesos** de `compute_engagement` (**re-verificado:** lista = unit_save/intent/like/compare/lead/unit_view/module_open/ficha_view/lens). Todo el tiempo/atención medido por la v3 es **inerte** en la temperatura. Comprador que pasa 10 min puede seguir "frío". | Añadir `section_time` a los pesos (`('section_time',3,15,...)`) o un bonus por segundos acumulados tipo el `dwell_ms` (`buyer_signals.py:808`). Complementa/alternativa de V3-SENSOR-01. |
| **ATLAX-02** | `atlax_engine.py:179-460` (query sin escritura de señal) · `atlaxSearch.js:69` · `AtlaxBubble.js:444-489` | La conversación del bubble sobre una ficha específica **no deja NINGUNA señal ligada al `entity_id`** del dev. `atlax_query` es colonia-scoped de mercado, sin `dev_id`. El diálogo más rico (dudas/objeciones sobre ESTE dev) es invisible al cubo/dev/superadmin. **Mongo:** `atlax_query=26`, ninguno con entity_id de ficha. | En `AtlaxBubble.send()`, con `context` (ficha), emitir `sendBuyerSignal('atlax_query',{entity_id, unit_number, colonia, value:q, meta:{kind:'ficha_chat'}})`; o que `/api/atlax/query` registre server-side la señal con el `entity_id` del page_context. |
| **V3-01** | `FichaCockpit.js:541` (`goTo`) · `SeccionUnidades.js:409` | "Ver mi panorama con esta unidad ↓" llama `onGoTo('panorama')` → `goTab('dinero')`, pero SeccionPanorama (wizard asequibilidad) vive en tab **"Tu unidad"** → el usuario aterriza en Plan de Pago (tab equivocada). **Re-verificado:** `goTo` mapea `'panorama'||'inversion' → goTab('dinero')`. Wizard inalcanzable desde su propio CTA. | En `goTo`: mapear `'panorama' → goTab('unidad')` + scrollIntoView a `[data-panorama]` (poner `data-panorama` en el wrapper, `FichaCockpit.js:620`). |

### 🟡 MEDIO

| ID | Ubicación | Impacto | Fix (1 línea) |
|---|---|---|---|
| **V3-INTERES-SOCIAL** | `buyer_signals.py:307-309` (`/interes`) · `FichaCockpit.js` (no fetchea) | `/interes` (prueba social pública) cuenta `like/save/ficha_view`; la v3 emite `unit_save` (no esos) ni fetchea `/interes`. El interés real (guardados) no sube al agregado por-dev → widget marca 0/bajo aunque haya saves. | En `/interes` contar también `unit_save` (roll-up unidad→dev, dedup por visitor) + `ficha_view` tras arreglar V3-FICHA-VIEW-LOST. Opcional: cablear `fetchInteres` en FichaCockpit. |
| **V3-GRAFO-COLONIA-LIKE** | `grafo_comprador_engine.py:236-237` | El Grafo del Comprador suma interés por colonia SOLO desde `type:'like' active` (**re-verificado**). La v3 no emite `like` → el interés-por-colonia del comprador v3 no cuenta; dev/superadmin subestiman la demanda. | Ampliar query del grafo a `type:{$in:['like','save','unit_save']}` active (unit_save ya trae colonia). |
| **V3-LEAD-05** | `SeccionPanorama.js:64-65` · `FichaCockpit.js:474` + `AtlaxBubble.js:363` | Botón #5 del wizard dispara **`dmx:lead` Y `dmx:ask-atlax` a la vez** → dos modales/paneles encimados a z=9999. Confusión UX + ambigüedad de dónde termina el lead. | Que el wizard dispare UN solo camino: preferir `dmx:lead` (con contexto del wizard) y NO `dmx:ask-atlax`. |
| **V3-SENSOR-03** | `FichaCockpit.js:33,539` vs `demand_intelligence.py:768-778` | `section_view/section_time` se emiten con `value` = 4 tabs gruesos (proyecto/unidad/dinero/confianza). `engagement_by_content` agrega por `value` → dev/superadmin ven heat de 4 cajones en vez del detalle (crédito vs TIR vs zona). Pérdida de resolución del producto de datos. | Emitir a nivel sub-módulo (`'dinero:tir'`, `'unidad:panorama'`) o combinar con V3-SENSOR-01 (`module_open` con nombres finos). |
| **ATLAX-03** | `FichaCockpit.js:476-488` · `:563-568` · `AtlaxBubble.js:480,701` | "Agéntico" = 5 botones estáticos. Ramas `comparar/proyecto/guardar` del handler son **código muerto** (nadie las emite). Los `tool_calls` del LLM NO accionan la ficha (solo se muestran). El LLM no puede "ábreme las 2rec y guárdame la 402". | (a) Borrar ramas muertas o cablear quickActions que las usen. (b) Que `/api/atlax/query` devuelva `ui_actions[]` y AtlaxBubble los traduzca a `dmx:atlax-action`. |
| **V3-02** | `SeccionUbicacion.js:136` (tab Confianza) | Error de consola constante: React "two children with same key: Taquería Orinoco" (×4) por `key={x.name}` sobre lugares con nombres duplicados + a11y "form field should have id/name" (×4). Consola sucia permanente. | `key={\`${x.name}-${j}\`}` + añadir `name={\`slot-${i}\`}` al `<select>`. |
| **V3-03** | `SeccionLente.js:27` | Lente "invertir" muestra `F('Zona','consolidada · obra nueva')` **hardcodeado idéntico** para todo proyecto. Viola doctrina cero-dato-inventado (afirma "zona consolidada" sin respaldo). | Eliminar el fact o derivarlo de dato real (`dev.colonia_madurez` o `valuacion_zona` de buy-signal). Si no hay dato, no renderizar (`hide-if-empty`). |

### ⚪ BAJO

| ID | Ubicación | Impacto | Fix (1 línea) |
|---|---|---|---|
| **V3-BEHAVIOR-PROFILE-EMPTY** | `demand_intelligence.py:2235-2240` · `superadmin_demand_intel.py:48` | `behavior_profile` reporta `abrieron_tour_video`/`scroll_profundo` desde tipos que ya nadie emite → 0 permanente. Valor invisible/muerto (no rompe). | Se resuelve con V3-FICHA-VIEW-LOST. Mientras, marcar "sin datos" en vez de 0 engañoso. |
| **V3-LEAD-06** | `LeadCaptureModal.js:12-18` · `FichaCockpit.js:529,686` | (1) Wizard pasa `source='wizard_vivir'` sin clave en `REASON_TXT` → copy genérico. (2) Wizard "para vivir" usa `lensLabel` de página que puede ser "Invertir" → lente mal etiquetado. | Añadir `REASON_TXT.wizard_vivir` + forzar `lens='Para vivir'` desde el wizard (ligado a V3-LEAD-04). |
| **V3-SENSOR-04** | `FichaCockpit.js:463,533-540` | Tab inicial (`useState('unidad')`) nunca pasa por `goTab` → la primera vista del tab de aterrizaje es invisible; `section_time` no se cierra al abandonar sin cambiar tab. Subconteo sistemático del tab más importante. | `section_view` inicial en useEffect al montar dev + handler `beforeunload/visibilitychange` que cierre el `section_time` activo. |
| **V3-SENSOR-05** *(compartido v2/v3, NO regresión)* | `demand_intelligence.py:86-100` (`_signal_segment`) | **Re-verificado:** `_signal_segment` (línea 89) NO lee `s.get('value')`, pero las señales `lens` ponen la intención en `value` → el desglose "por_segmento" cae a "desconocido". El superadmin no puede decir "a los que invierten les engancha X". Afecta v2 y v3 igual. | 1 línea: en `_signal_segment` para `type='lens'` leer también `s.get('value')` (misma lógica que `intent_split`). |
| **ATLAX-04** | `AtlaxBubble.js:378-397` (`dmx:ask-atlax`) | Opener es tarjeta templada de un solo tiro (no pasa por `/api/atlax/query`, sin sesión/LLM el 1er turno). Inyecta emojis 💰📈⏱ contra doctrina "0 emojis en v3". | Quitar emojis (usar "Precio:"/"Plusvalía:"/"Momento:"). Opcional: sembrar el thread real tras la tarjeta. |
| **V3-04** | `AuthProvider` (bundle) · `GET /api/auth/me → 401 ×2` | Ruido de consola constante en ficha pública anónima (esperado funcionalmente). No rompe. Doble llamada sugiere StrictMode/doble consumidor. | Silenciar el 401 esperado en el fetch de `/api/auth/me` (tratar como "no logueado" sin `console.error`). Fuera de scope de ficha. |
| **V3-05** | `FichaCockpit.js:472-473` · `SeccionConfianza.js` (sin id) | Efecto `#ie-scores` corre solo on-mount (deps `[]`) → no reacciona a hashchange soft-nav; Confianza no tiene ancla para scroll fino. Menor. | Añadir listener `hashchange` + `id='ie-scores'` en el bloque de scores + `scrollIntoView`. |
| **V3-06** | `FichaCockpit.js:625-636` (invMode institucional) | Con lente invertir·institucional y `fundUnits=[]`, se renderiza SeccionCalcInversion con portafolio vacío sin guía. Empty-state sin acompañamiento. | `EmptyHint` "Marca 1+ unidades para tu portafolio institucional →" cuando `multi && fundUnits.length===0`. |

---

## 3. CONEXIONES QUE FALTAN (señales/leads/cube/atlax sin cablear)

Cables que la v3 **debería** alimentar y hoy **NO** alimenta (raíz → consecuencia):

### Señales del moat que la v3 dejó de emitir
- **`like`/`save`/`photo_dwell`/`photo_zoom`** → **modelo de gusto** (`visitor_taste`, `taste_scores`). Sin ellas: mi-gusto, /parecidos, "Para ti", taste materializado = **apagados** para todo comprador v3. *(V3-TASTE-DARK)*
- **`module_open`** (5 valores finos) → **temperatura del lead** (`compute_engagement` 5pts/25) + **`engagement_by_content`** (panel "modulos_abiertos" superadmin/dev). Sin ella: leads más fríos + producto de datos vacío. *(V3-SENSOR-01)*
- **`ficha_view`/`dwell`/`scroll_depth`/`tour_view`** → embudo, `/interes`, `demand_by_feature`, `behavior_profile`. La ficha default ya no los emite (DevelopmentDetail huérfano). *(V3-FICHA-VIEW-LOST, V3-BEHAVIOR-PROFILE-EMPTY)*
- **`payment_explore`** → **intención financiera "vivir"** (`financial_intent/financial_demand`). El cotizador se usa pero no reporta. *(V3-PAYMENT-EXPLORE-LOST)*
- **`atlax_query` con `entity_id`** → señal de demanda del **diálogo** sobre el dev. El chat rico del comprador es invisible al cubo/dev/superadmin. *(ATLAX-02)*

### Leads sin atribución completa
- **Bubble → AtlaxLeadModal** con `dev=null` → lead sin `development_id`. *(V3-LEAD-01)*
- **Bubble → capture-lead** sin `dev/unit/lens/visitor_id` → lead "pelón", identidad visitor→persona rota. *(V3-LEAD-02/ATLAX-01)*
- **Mirror re-engagement** (branches 1/2) no refresca `unidad_interes/lente/contexto/dev` → el asesor ve datos viejos. *(V3-LEAD-03)*
- **Wizard "vivir"** → unit recomendada + perfil económico descartados por `onLead`. *(V3-LEAD-04)*

### Readers del moat que buscan llaves viejas
- **Grafo por colonia** solo suma `like` → no cuenta el interés-por-colonia de la v3. *(V3-GRAFO-COLONIA-LIKE)*
- **`/interes`** solo cuenta `like/save/ficha_view` → los `unit_save` de la v3 no suben a prueba social. *(V3-INTERES-SOCIAL)*
- **`compute_engagement`** no pesa `section_time/section_view` → el engagement que la v3 sí mide no calienta. *(V3-SENSOR-02)*

---

## 4. OK VERIFICADO (lo que SÍ conecta — no tocar)

Verificado EN VIVO (emisión de señales v3 con visitor fresco → Mongo → readers reales) o por código re-confirmado en esta rama:

- **ASESOR · `compute_engagement`** — LIVE OK: score 73/caliente derivado de `unit_save/intent/compare/lead/unit_view/lens` (`buyer_signals.py:791-801`). Todos los tipos clave de la v3 pesan. *(Nota: `module_open`/`section_*` NO pesan — ver V3-SENSOR-01/02.)*
- **DEV · `percepcion-unidades`** — LIVE OK: query `{entity_id,unit_number}` matchea `unit_view/unit_save` por-unidad (views=33/saves=4 para 02A). Wired a UnitPulsePanel/getUnitPulse.
- **DEV · `demand_by_feature`** — LIVE OK: `_ENGAGE` incluye `unit_view/unit_save/lens/intent/compare/section_view` (`demand_intelligence.py:19-21`). Expuesto en `dev_market.py:94` → DesarrolladorDemanda.js.
- **SUPERADMIN · `engagement_by_content`** — LIVE OK: sección "dinero" con vistas tras `section_view/section_time` (`demand_intelligence.py:740-779`). *(Granularidad gruesa — ver V3-SENSOR-03.)*
- **SUPERADMIN · `intent_split`** — LIVE OK: `lens=invertir` + `roi_explore` movieron polanco→invertir (`demand_intelligence.py:329,95-97`). Lee `value` correctamente.
- **SUPERADMIN · cube por-unidad** — OK a nivel código: lee `unit_view/unit_save` por `unit_number` (`superadmin_metrics_cube.py:231-233,577-579`).
- **ASESOR/COMPRADOR · Mis Favoritos + tablero** — OK: `favoritos.py:71,229` lee `unit_save active=True` y espeja a `asesor_lead_properties` (Ficha360).
- **GOLD PATH lead** (sidebar "Agendar visita" → LeadCaptureModal → `/api/buyer/registrar`) — LIVE OK: crea lead con `development_id + unidad_interes + lente + contexto_registro + temperatura`, espeja a `asesor_contactos`, asigna por afinidad/round-robin (1 broker×proyecto), audit_log. Probado: `lead_3918e901b151`/`lead_c4d9bdbb6a15` con `ok:true`.
- **PDF inversión** (`SeccionCalcInversion.js:51 → source=calc_inversion_pdf`) — OK cuando lens=invertir + unit elegida: la unidad de página coincide → atribución correcta.
- **ATLAX `/api/atlax/query`** — LIVE grounded: invocó `get_zone_info`, datos reales (Roma Norte: 2 devs, $5.4M, resiliencia 24.8), sesión+thread+tier, `simulated=false` (LLM real Sonnet 4.5). `page_context` viaja sanitizado como "untrusted" al system prompt.
- **quickActions → `dmx:atlax-action`** — OK: `dinero/unidad/confianza/agendar` cableados (`FichaCockpit.js:476-488`) vía navRef sin stale.
- **Precios por unidad respetan `developer_unit_overrides`** — end-to-end OK: `GET /api/developments/{id}` aplica `_apply_unit_overrides` (`public.py:2002`) y recomputa `price_from`/rangos. Verificado: override 02B=$15.9M → API devuelve 15900000.
- **`compare`** — señal NUEVA que la v2 NO tenía (`FichaCockpit.js:595`), vale 10pts/tope20. Mejora neta de sensor.
- **DevStructuredData** (SEO/GEO schema) reconectado en la v3 (`FichaCockpit.js:577`).

### By-design (NO son cables rotos — confrontados y descartados)
- **Cubo OLAP** (`metrics_cube_aggregations.py`) NO lee `buyer_signals` (solo `leads/developments/ai_usage`). Las señales entran al cubo vía **leads** (lead v3→registrar→asesor_contactos verificado). **By-design.**
- **`demanda-mapa`** (`buyer_signals.py:594`) lee solo `marketplace_searches` (heatmap = demanda de búsqueda). **By-design.**
- **`photo_dwell/photo_zoom/dismiss`** provienen de `atlaxPrefs.js`/`AtlaxExperiencia.js` (scrollytelling Atlax), no de ninguna ficha. **Paridad v2=v3** (ambas carecen), no regresión de la v3.

### Falsos positivos / premisas NO reproducidas (confrontación)
- **`#ie-scores` SÍ aterriza en Confianza** en navegación limpia (verificado en roma-norte-85 y altavista-polanco) — **CONTRADICE** la premisa original de que "no lo hace". La lectura previa de "Tu Dinero" fue artefacto de estado SPA. Solo queda el edge menor V3-05 (soft-nav + scroll fino).
- **V3-SENSOR-05** NO es regresión de la v3 — el defecto `_signal_segment` afecta v2 y v3 por igual (degradado histórico compartido).

---

## 5. Plan de fixes priorizado

> Principio (memoria del founder): **cero features huérfanas · reusar motores · nada parcial**. La mayoría son front reusando helpers de la v2. Agrupados por tanda; cada tanda cierra un ciclo completo.

### TANDA A — Reactivar el moat de señales (🔴🔴🟠) — *~4-6 h*
El corazón del flywheel. Sin esto, promover la v3 a default degrada gusto + temperatura + datos del superadmin para TODO el tráfico.
1. **V3-TASTE-DARK** — `visitor_taste.py:45` + `taste_scores:1041`: `$in` positivos → `['like','save','unit_save']`. *(backend, 2 líneas + resolución entity_id)*
2. **V3-SENSOR-01** — re-cablear `module_open` en FichaCockpit (5 useEffects, values de la v2). *(front)*
3. **V3-FICHA-VIEW-LOST** — `ficha_view` on-mount + `dwell`/`scroll_depth` on-unmount + `tour_view` en FichaCockpit; **borrar `DevelopmentDetail.js`** (código muerto). *(front)*
4. **V3-SENSOR-02** — añadir `section_time` a los pesos de `compute_engagement`. *(backend, 1 línea)*

### TANDA B — Cerrar la atribución de leads (🔴🔴🟠🟠) — *~4-5 h*
Que TODO lead de la ficha llegue al dev/asesor con dev+unidad+lente+perfil.
5. **V3-LEAD-01 + V3-LEAD-02/ATLAX-01** — unificar ambos caminos de Atlax al path bueno: pasar `dev={dev}` a AtlaxBubble y enrutar el handoff conversacional a **AtlaxLeadModal** (`/api/buyer/registrar`). *(front + `CaptureLeadIn` opcional)*
6. **V3-LEAD-03** — mirror branches 1/2: refrescar `unidad_interes/lente/contexto/dev/engagement`. *(backend, no-destructivo)*
7. **V3-LEAD-04** — `onLead` propaga `unit`/`perfil` del wizard; LeadCaptureModal acepta overrides. *(front)*
8. **V3-01** — `goTo('panorama') → goTab('unidad')` + scroll a `[data-panorama]`. *(front, 1 línea + data-attr)*

### TANDA C — Señales financieras + conversacional + prueba social (🟠🟠🟡🟡) — *~3-4 h*
9. **V3-PAYMENT-EXPLORE-LOST** — emitir `payment_explore` desde PlanDePago (debounce). *(front)*
10. **ATLAX-02** — emitir `atlax_query` con `entity_id` desde el bubble en contexto ficha. *(front o backend)*
11. **V3-INTERES-SOCIAL** — `/interes` cuenta `unit_save` (roll-up dedup). *(backend)*
12. **V3-GRAFO-COLONIA-LIKE** — grafo colonia `$in ['like','save','unit_save']`. *(backend, 1 línea)*

### TANDA D — Limpieza de sensor + UX + doctrina (🟡🟡🟡⚪…) — *~2-3 h*
13. **V3-SENSOR-05** — `_signal_segment` lee `value` (1 línea, arregla v2+v3).
14. **V3-02** — key único + `name` en `<select>` (consola limpia).
15. **V3-03** — quitar/derivar el fact "Zona consolidada" hardcodeado (cero-dato-inventado).
16. **V3-LEAD-05** — wizard dispara UN solo camino (quitar doble modal).
17. **ATLAX-03** — borrar ramas muertas del handler (o cablear `ui_actions[]`).
18. **V3-SENSOR-03/04** — sub-módulo en `section_view` + `section_view` inicial + `beforeunload`.
19. **ATLAX-04 / V3-04 / V3-05 / V3-06 / V3-LEAD-06 / V3-BEHAVIOR-PROFILE-EMPTY** — pulido (emojis, 401, hashchange, empty-state institucional, copy/lente wizard, "sin datos").

**Ruta crítica:** Tandas A + B son bloqueantes para que la v3 default no degrade el moat. C y D son valor incremental / limpieza. Total estimado ~13-18 h.
