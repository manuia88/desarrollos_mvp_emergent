# CHECKLIST COMPLETO — MÓDULO 1: MARKETPLACE / COMPRADOR

Auditoría + upgrade exhaustivo del portal Marketplace (rama `dev-redesign-tandas`). Todo lo **mapeado, construido,
descubierto y cableado**. Nada omitido. Batería 66/66 en cada commit · merge NO tocado · multi-tenant app-level (sin RLS).

---

## A) MAPEADO (auditado / inventariado)

- [x] **Espina de señales del comprador** (`buyer_signals`): `visitor_id` como espinazo; **92 tipos** de señal válidos.
- [x] **3 niveles de precisión** de atribución feature×colonia: `meta.amenidades` explícito > `unit_number` > proxy del dev.
- [x] **Wiring marketplace→asesor/dev/superadmin**: HEALTHY — 0 llamadas muertas, 0 huérfanos reales (auditado con openapi.json como verdad, no regex).
- [x] **Granularidad geo**: calle → CP → colonia → alcaldía → ciudad (jerarquía completa).
- [x] **Granularidad propiedad**: internas/externas, amenidades, fichas técnicas, fotos (photo_dwell→feature vía photo_tagger).
- [x] **Granularidad financiera**: cotizador (pago), crédito/mensualidades, ROI/rentabilidad.
- [x] **Conversación Atlax**: 145 mensajes en `asistente_messages` (turno por turno).
- [x] **Mapa de las 26+ interacciones del comprador** → qué señal dispara cada una (mapa completo, no muestra).

## B) CONSTRUIDO — MOTORES (`demand_intelligence.py`, 25 funciones)

Núcleo de demanda:
- [x] `demand_by_feature` · `demand_by_colonia` · `demand_by_attribute` — qué busca el mercado (feature/colonia/atributo).
- [x] `what_to_build` — demanda vs oferta = qué construir (supply-gap).
- [x] `unmet_demand` — búsquedas sin buen match (demanda esperando oferta).
- [x] `engagement_by_content` — resucita section_time/view/module_open (engagement de contenido).
- [x] `trend_alerts` — qué sube (sin % falsos: prior=0 → flag "nuevo", no "+3600%").
- [x] `demand_alerts` — jugadas urgency-ranked "qué construir YA".
- [x] `financial_intent` — payment_explore + roi_explore (intención financiera, antes invisible).
- [x] `demand_by_geo` — demanda fina calle/CP/colonia/alcaldía/ciudad.
- [x] `conversation_intel` — análisis turno por turno de lo que dice el comprador con Atlax.
- [x] `killer_query` — "¿cuántos engancharon con [feature] en [colonia], y cuándo?" (serie de tiempo).

Loops + push proactivo:
- [x] `notify_demand_alerts` — push real al dev (cron lunes 8am, dedup 7d) — no solo dashboard.
- [x] `lead_engaged_features` + `recommend_for_lead` — qué ofrecerle a un lead (comprador→asesor).

Dimensiones profundas (5):
- [x] `rejection_intel` — por qué dicen NO (dismiss→razón: precio/zona/fotos/tamaño).
- [x] `intent_split` — vivir vs invertir (lens).
- [x] `co_viewed` — qué compite (market basket de co-vistos).
- [x] `temporal_demand` — cuándo buscan (hora/día).
- [x] `journey_depth` — toques promedio, % regresa, % convierte.

Comportamiento + nivel profundo (4):
- [x] `behavior_profile` — device + DISC + tour + scroll (consume las capturas nuevas).
- [x] `price_sensitivity` — techo de precio buscado por colonia (mediana/p25/p75).
- [x] `funnel_velocity` — días consideración (1ª señal→lead) + lead→cierre.
- [x] `hot_visitors` — propensión/calor por visitante anónimo (accionable).

## C) CONSTRUIDO — 20 GRANULARIDADES AVANZADAS (`marketplace_granularity.py`)

10 nuevas: `seasonality` · `supply_demand_balance` · `absorption_signal` · `rfm_segments` · `price_elasticity` ·
`viral_shares` · `funnel_dropoff` · `competitor_mentions` · `locale_split` · `reengagement`.
10 del mapa profundo: `decision_criteria` · `urgency_signals` · `sentiment_proxy` · `predicted_budget` ·
`predicted_timeline` · `close_probability` · `feature_cooccurrence` · `willingness_to_pay` · `substitution` ·
`attribution`. **(20/20 corren con dato real, 0 errores.)**

## D) CONSTRUIDO — CAPTURAS NUEVAS (frontend → señal)

- [x] **device** en TODA señal (helper `deviceType()` mobile/tablet/desktop) + `SignalIn.device` + storage.
- [x] **tour_view** — abrir tour 3D / video / fotos (DevelopmentDetail).
- [x] **scroll_depth** — % máximo al salir de la ficha (listener en DevelopmentDetail).
- [x] **payment_explore** — exploró cotizador/plan de pago (PublicCotizador).
- [x] **roi_explore** — exploró rentabilidad (SeccionCalcInversion).
- [x] **section_time / zone_profile / atlax_apartado** — antes enviados por el front y **silenciosamente descartados** (no estaban en VALID) → arreglados (VALID + SignalIn.seconds + meta-whitelist).

## E) CONSTRUIDO — ENDPOINTS + UI

Superadmin:
- [x] `/demand-intel/overview` · `/deep` · `/granular-advanced` · `/feature` · `/notify` (POST).
- [x] Página `SuperadminDemandaMercado.js`: jugadas, killer query, grid, engagement, unmet/tendencias, geo/conversación, **sección profunda (9 tarjetas)**, **sección 20 avanzadas (9 tarjetas, lazy)**.

Dev:
- [x] `/dev/market/demand-features` extendido con `.avanzado` (subset oferta/precio scopeado a SUS colonias).
- [x] `DesarrolladorDemanda.js`: jugadas + por-feature + **tarjeta "Señales avanzadas de tu zona"**.

Asesor:
- [x] `/asesor/senales-calientes` (leads anónimos + presupuesto/timeline predichos) + `/contactos/{cid}/recomendacion`.
- [x] `SenalesCalientesCard.js` montada en AsesorContactos (V2) + panel "Qué ofrecerle".

## F) DESCUBIERTO (bugs corregidos + hallazgos de dato)

Bugs corregidos (aunque no los creé yo):
- [x] **Carrera de concurrencia**: 50 señales mismo visitor → 50 leads + 16 contactos. Fix: índices únicos parciales (`leads_vid_uniq`, `ac_owner_lead_uniq`) + manejo DuplicateKeyError. Verificado 50→1.
- [x] **buyer_scores backfill** reportaba 14 pero persistía 0 (compute sin upsert) → encadenado.
- [x] **Motor de demanda alimentado con campo equivocado** (`unit_id` vs `unit_number`) → corregido.
- [x] **atlax_query no alimentaba demanda** (meta rica almacenada pero no en _ENGAGE) → señales precisas 41→88.
- [x] **trend_alerts "+3600%"** (ventana previa vacía) → None + flag "nuevo".
- [x] **Higiene**: ~3,100 registros huérfanos de tests (audit_log/lead_events/asesor_lead_properties) → teardowns arreglados, Δ=0 en 9 colecciones.
- [x] **Falsos positivos del auditor** (regex de URLs dinámicas) → switch a openapi.json como verdad.

Hallazgos de dato (reales):
- [x] **Sweet-spot de precio: 5-8M** (30 búsquedas) — la banda más buscada.
- [x] **Gran fuga del embudo: guardó→intención 11%** (vio→guardó 100%, intención→lead 100%).
- [x] **Criterio #1 = recámaras/zona** (108 c/u), luego precio (80).
- [x] **Intent 25 invertir : 1 vivir** — mercado muy inversionista.
- [x] **Por qué NO**: precio (2), fotos (1), zona (1).
- [x] **Compite**: Altavista vs Lomas/Pedregal/Polanco Moderno.
- [x] **Balance Cuauhtémoc 4.0** (demanda sin oferta = hueco).
- [x] **Precio por colonia**: Polanco 14M, Del Valle 3M.
- [x] **Journey**: 18 visitantes, 16.8 toques, 11% regresa, 6% convierte. Lead→cierre 35 días.

## G) CABLEADO (loops cerrados, sin huérfanos)

- [x] **Demanda → Dev**: feature-demand + jugadas "qué construir" + señales avanzadas, scopeado a colonias del dev.
- [x] **Comprador → Asesor**: recomendación por lead + leads anónimos calientes.
- [x] **Push proactivo**: demanda → notificación real al dev (cron + dedup), no solo tablero.
- [x] **Demanda anónima → visible** en superadmin (overview + deep + 20 avanzadas).
- [x] **Cierre → re-entrena** ranking del comprador (flywheel, sesión previa).

## H) VERIFICADO

- [x] Batería `scripts/audit_all.sh` = **66/66** (smoke 17 · aislamiento 13 · e2e 8 · propagación 12 · direcciones 8 · concurrencia 1000 = 8).
- [x] 20/20 granularidades avanzadas corren con dato real (0 errores).
- [x] Todas las capturas nuevas: POST + guardado + agregación + cero-residuo.
- [x] 3 endpoints nuevos registrados en openapi · 6 archivos frontend compilan.

## I) PENDIENTE (honesto — el siguiente nivel, por valor no por capacidad)

- [ ] **Semántico** (LLM sobre asistente_messages): sentimiento real, criterios rankeados, drivers emocionales, objeción→resolución.
- [ ] **Predictivo ML** (hoy heurístico): presupuesto/timeline/prob-cierre con modelo entrenado, lookalike, next-best-action.
- [ ] **Micro-interacción** (captura nueva front): heatmap cursor, abandono por campo, filtros probados-y-abandonados.
- [ ] **DISC sparse** (2 conversaciones) — el motor infiere bien, falta volumen de uso.
- [ ] **UI fina** del subset avanzado en Dev y Asesor — se trabaja al rediseñar esos portales.
