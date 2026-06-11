---
name: qa3-master-report
description: QA3 auditoría profunda 2026-06-10 · 7 cazadores de hermanos · ~40 bugs agrupados en 6 causas raíz sistémicas · estado NO-listo-para-prender · plan de fix por causa raíz
metadata:
  type: project
---

# QA3 — Auditoría Profunda (caza-hermanos) · 2026-06-10

Hipótesis del founder (correcta): los bugs de QA2 eran síntomas de CLASES. QA3 barrió todo el repo (no solo F2–F5) con 7 agentes, cada uno persiguiendo una clase-raíz. Resultado: ~40 hermanos, agrupados en 6 causas raíz. La mayoría son LATENTES hoy (BD casi vacía, corre sobre seed) → estallan al entrar dato real. Es EL momento de arreglar antes de prender.

## R1 · SEED-COMO-REAL (honestidad) — el más grave
`data_developments.py` genera estatus vendido/precio/recámaras con `md5(dev_id+unit_num)`. `is_sold()` sobre ese estatus se trata como "venta real" en todo el repo. El umbral honesto (`suficiente_dato`, `es_estimado`, "aprendiendo") EXISTE pero el seed lo empuja siempre al camino "real" → nunca se alcanza.
Afirmaciones FALSAS (≈15): bancabilidad "para bancos/fondos" (vendida por API), Cerebro "lifts de ventas REALES", simulador "según lo aprendido de ventas reales", generador "compradores reales · venta esperada", absorción "curva real", IAB índice licenciable ($80–120k), bundle Grafo $90k (colecciones vacías), badge "Vivo" con 10 búsquedas, developer flags `verified/no_profeco/track-record` hardcodeados que ve el comprador, plantillas Studio/landing "datos verificados/reales", resale/valor_residual "ventas reales/cierres" con `cierres`=0.
Fix de mayor palanca (1 cambio apaga ~6): contar ventas desde `units_history` (eventos reales) no desde el estatus seed → todo cae solo a su estado honesto. + corregir strings `fuente`/docstrings + docstring mentiroso del grafo (grafo_comprador_engine.py:24).
Archivos: cerebro_mercado_engine 121/154, bancabilidad_engine 129, absorcion_engine 113, dmx_indices 12/82, estudio_mercado_engine 319, generador_producto_engine 154/180, routes/public.py 72, data_developments DEVELOPERS, data_licensing bundles, copy Studio/landings.

## R2 · CAMPOS FORKEADOS (lectura↔escritura) — corrompe dinero silenciosamente
Semilla: investment_simulator lee `score_total or score` pero el doc tiene `score_numeric` → tier "F" para TODAS las colonias → yield mal ~36% + bancabilidad sin zona. 11+ hermanos confirmados:
investment_simulator 246/391, score_inversion 79-83 (zona clavada en 50), free_audit 140/178/291, buyer_coach 438/482, avm_public 141, brochure_renderer 382/405, state_of_cdmx 65/70, narrative_collector 94/195/252, dev_batch7 1363/1372 (consulta `db.zones` vacía).
Mapa canónico real (verificado en BD): zone score = `score_numeric` (no score_total/score); grado = `score_letter`; `tier`="colonia" es GEO no grado; subscores = `subscores_real.{k}.value`; ie = `value`.
Fix: normalizar `get_score_or_compute` para exponer `score_total=score_numeric`, O corregir cada lector. Patrón sano de referencia: maps_engine, cma_engine, get_zone_with_subscores.

## R3 · SIN RESOLVEDORES CENTRALIZADOS (cada quien reimplementa → diverge)
- "vendido" literal (solo español, subcuenta) en ~10 sitios: data_developments 551/590, dev_batch2 252/268, dev_sales_intel 145, ai_suggestions 114, ie_proy_core, health_score, dmx_project_score 52, smart_lists 391. Canónico `is_sold` se ignora (o se recopia inline: cube_olap 160, absorcion_engine 36, dmx_dev_benchmark 21).
- Absorción/velocidad: ≥5 fórmulas distintas para el MISMO número (absorcion_engine sold/etapa · dev_sales_intel sold/6 · dev_batch2 actual/6 · superadmin_devmaster sold/meses-reales · IAB precomputado). Cada portal ve velocidad distinta.
- Precio de unidad: 3 extractores (varios usan `precio_lista` ignorando `precio_cierre` → precio pedido no real). m²/recámaras: copias divergentes + defaults mágicos (80 m², 1). 
- Colonia nombre↔id↔slug: 7 `slugify` independientes + ~8 `col_by_name` inline.
- Merge unidad (override>overlay>seed): ≥4 implementaciones (allow-list vs deny-list vs sin-merge) + índice único inconsistente (`unit_id` solo vs clave `{dev_id,unit_id}`).
Fix: hacer públicos los helpers de data_developments + exportar `sales_velocity`/`effective_units`/`unit_price`/`unit_m2`/`unit_beds` + `colonias_catalog.resolve_colonia` + un solo `slugify`. Reemplazar todo fallback inline por import.

## R4 · SCOPE/IDOR INCOMPLETO (auth solo por rol, sin dueño) — ~10 clusters nuevos
funnel.py 84/147 (**SIN auth, anónimo**), insights.py (8 endpoints /projects/{id}/insights/*), battle_card.py (5 endpoints, fuga inteligencia competitiva), maps_cross 115, diagnostic.py 68-157 (el hermano dev_id:796 SÍ valida), argumentario/agentic_crm 1244 (PII del lead ajeno + guion), b13 attribution 267/281, lead_match 82/93, grafo_comprador/contacto 48, deseabilidad (semilla).
Bug transversal: `getattr(user,"id")` está roto en TODO el repo (UserOut usa `user_id`) → en lead_enrichment.py 80 la restricción per-asesor está MUERTA (cae a tenant); infer_contacto_segment ignora owner_id → fuga cross-tenant.
Fix: `assert_dev_project`/owner-check obligatorio por endpoint de entidad propia; quitar fail-open `and org_id and`; grep CI que bloquee `getattr(user,"id"`.

## R5 · FÓRMULAS DE DINERO (con hermano sano en el repo para copiar el fix)
vertical_products 620 IRR pago-bala +3pp · 627 breakeven absurdo (14k meses) · 580 renta neta como bruta (−30%); maps_cross 230 gap stock−flujo · 358/377 sellout /12 fijo (3× optimista); score_inversion 169 `stress_test` firma incorrecta → componente cae a 50. (investment_simulator break-even/renta ya conocidos QA2.)
Fix: reusar los hermanos correctos que YA existen: investment_simulator._compute_tir_anualizada (IRR), dmx_demand.demand_gap (gap normalizado), absorcion_engine (velocidad por meses reales).

## R6 · k-ANON 3 vs 5 (privacidad, decisión founder)
anonymization_engine/transaction_network/public_market/press usan 5; grafo_comprador (40) y terminal_mercado (24) usan 3. Dos políticas de privacidad simultáneas. Decidir 3 o 5 y centralizar `K_ANON_MIN`.

## PLOMERÍA (transversal)
Índices faltantes: developer_reports (solo _id), market_index_snapshots (sin único en fecha), cerebro_predictions (sort resolved_at sin índice), asesor_busquedas (full-scan global sin fecha en grafo+amenidades), units (find por id sin índice). · TZ UTC vs CDMX en snapshot fecha + month_key (existe cdmx_time, casi sin usar). · Guards frontend faltantes: DesarrolladorReportes (varios), DesarrolladorValorTerreno 360, SuperadminIndices 182/384; getForecast sin catch. · Salt PII en bundle (posthog.js 21 + free_audit/tour_3dgs defaults). · plazo_meses muerto en memo.

## CABLES DEL FLYWHEEL ROTOS
comprador swipe→grafo (grafo lee asesor_busquedas, swipe va a asesor_swipe_events) · override→cubo NUNCA propaga (cubo congelado en seed: dev 23% vs cubo 14%) · cierre-por-contacto→unidad/cubo no marca inventario · operación `cancelada`→lost falta (Cerebro a nivel proyecto solo aprende ganados) · on_unit_sold no se dispara desde cierre por operación del asesor · marketplace_searches read-only (0 escritores, demanda muerta).

## VEREDICTO
NO listo para prender. Pero casi todo es LATENTE (seed/BD vacía) → arreglar AHORA antes de datos reales es lo correcto (alinea con "no hay prisa, prender al final"). Las ~6 causas raíz tienen fix CENTRAL (un cambio mata muchos hermanos). 7 olas ejecutables siguen en verde (no hay crashes/500/IDOR en lo que ELLAS cubren; los IDOR nuevos son endpoints que el red-team no tocaba).

## ORDEN DE FIX SUGERIDO (por causa raíz, no por síntoma)
1. R1 honestidad (units_history + strings) — protege credibilidad, desbloquea estado honesto.
2. R2 score_numeric (1 normalización) — desbloquea dinero correcto en ~11 sitios.
3. R4 IDOR + getattr(user,"id") — cierra fugas cross-tenant.
4. R5 fórmulas dinero (reusar hermanos sanos).
5. R3 resolvedores canónicos (is_sold/velocity/unit_price/colonia/effective_units).
6. R6 k-anon (decisión) + plomería (índices/TZ/guards/salt) + cables flywheel.

═══════════════════════════════════════════════════════════════════════════════
# QA4 — RUNTIME (ejecutar + trazar + liveness) · 2026-06-10
Upgrade vs QA1-3: en vez de LEER, se EJECUTA cada endpoint/motor con login real y se AFIRMA que el resultado es real (no vacío/default/stub) — la clase DENUE ("se ve conectado, no trae nada"). Trace end-to-end por número + mapa de fuentes externas vivas/muertas + integridad de nombres en runtime.

## HALLAZGO HEADLINE — Cadena de confianza de los 9 números que ve el usuario
Casi NINGÚN número es confiable hoy. Trazados extremo a extremo contra desarrollosmx:
1. Bancabilidad A-F: 🟡 seed+default (absorción md5 · zona descartada por bug clave)
2. Deseabilidad %: 🔴 BASURA (eje "céntrica" 30% = 0 por bug score_total)
3. Venta esperada %: 🟡 seed (lifts sobre estatus md5, no ventas reales)
4. IRR/cap rate memo: 🔴 VACÍO (transactions=0 → yield unavailable → no se muestra)
5. Demanda Estudio: 🟡 seed (búsquedas reales=0 · población = proxy data_seed)
6. Índices Terminal: 🟡 seed + 🔴 Gestión=default (duplica absorción, leads=0)
7. Grafo Comprador: 🔴 VACÍO honesto (asesor_busquedas/contactos=0)
8. AVM /valor + FSD: 🟡 heurístico seed + 🔴 banda FSD ausente (hedonic sample=0)
9. Zone score/tier: 🟡 3/6 ejes = placeholder 50 (liquidez/demand/risk); solo DENUE density es real
Lo único REAL que ve el usuario: densidad comercial OSM + geometría determinista del seed.
DOS eslabones rompen casi todo: (1) bug clave score_total vs score_numeric; (2) fuentes vivas vacías (transactions/leads/asesor_busquedas=0).

## CLASE NUEVA (la más pura DENUE) — nombre de colección LEÍDA ≠ ESCRITA
- 🔴 `behavioral_tracking_events` (leído live_pulse/kg_etl) vs `behavioral_events` (escrito, 47 docs) → Live Pulse view-volume + KG ETL muertos.
- 🔴 `zone_subscores` (leído battle_card _dim_zona) nunca escrito (los subscores van dentro de zone_scores) → dim zona del Battle Card congelada en 50.
- 🟡 `db.zones` (leído dev_batch7/social_cards) vacía; canónico vivo es `dim_zones` (51 docs).
- 🟡 `marketplace_searches` read-only (0 escritores) → métricas de búsqueda siempre 0.

## NOMBRES/FIRMAS rotos en runtime
- 🔴 `stress_test(db, precio_entrada=…)` vs firma real `stress_test(bundle:dict)` → TypeError tragado → 10% del score de inversión congelado en 50.
- 🔴 `user.id` (dev_batch10:572) → AttributeError tragado → evento ML nunca se emite. + 33 `getattr(user,"id",…)` → atribución con identidad falsa fija.
- (confirmado) score_total/score_numeric en investment_simulator:246/391, avm_public:141, _zona_score, preferencias.centrica.

## FUENTES EXTERNAS — DENUEs escondidas
- 🔴 `data_sources/osm_engine.py` (osm_pois): Overpass GET → 504/HTML, degrada a [], walkability=0. DUPLICA al osm_engine raíz que SÍ funciona (POST). 
- 🔴 6 fuentes IE marcadas status:"active" pero 100% stub: fgj_cdmx (¡viva hoy, solo re-ingestar!), datos_cdmx, sacmex, locatel, osm_overpass, gtfs.
- 🔴 Atlas de Riesgos "active" pero solo baja metadata, nunca parsea shapefile → lookup siempre falla.
- 🔴 Studio Video: keys reales presentes pero STUDIO_VIDEO_ENGINE=stub → URLs stub://.
- 🟡 SIGCDMX/Catastro/GTFS: fuentes sanas (HTTP 200) pero crons nunca poblaron.
- 🟡 Alias "DENUE" cosmético sobre dato OSM (UI/AVM dice DENUE).
- 🟢 vivas: BANXICO, NOAA, AirROI, Mapbox, Resend, Twilio, LLMs, INEGI BISE, reputation RSS.

## OBSERVABILIDAD MUERTA (meta-problema)
🔴 SENTRY_DSN contiene un TOKEN (sntryu_...) no una URL DSN → Sentry no-op → TODA la telemetría de error invisible. Combinado con fail-open en todos los engines = los bugs silenciosos de arriba son invisibles en prod. PostHog también off. Fix: poner DSN real (URL).

## RATE-LIMIT / COMPLIANCE (runtime)
- 🔴 API v1 (producto vendible) SIN throttle de ráfaga (solo cuota mensual) → martilleable.
- 🟡 /api/avm-public/colonias/top sin rate-limit (único de los 5).
- 🟡 grafo_comprador (PII-adjacent) no llama log_compliance_event.
- 🟢 públicos frenan (429 verificado), API v1 SÍ audita, cron idempotente + heartbeat verde.

## LO QUE SÍ ESTÁ SÓLIDO (runtime confirmado)
- Contrato FE↔BE: CERO drifts (todas las pantallas nuevas leen las llaves que el back devuelve).
- 593 módulos importan sin error; 669 paths front resuelven a ruta real; ~120 crons resuelven.
- 26 endpoints F2-F5 ejecutados: 21 ✅ real / 4 🟡 vacío-honesto / 1 🔴 (memo por bug zona).
- Flags funcionan; mcp_tools/recetas/agentes resuelven 1:1.

## ORDEN DE FIX (actualizado con QA4)
0. 🔴 OBSERVABILIDAD primero (Sentry DSN real) — sin esto, no ves nada de lo demás en prod.
1. R2 score_numeric (1 línea, 4 sitios) — desbloquea #1/#2/#8/#9.
2. Nombres colección leída≠escrita (behavioral_events, zone_subscores→zone_scores, db.zones→dim_zones) + stress_test firma + user.id→user_id (mata defaults-50 ocultos).
3. R1 honestidad (units_history + strings "real"→"demo").
4. Fuentes: consolidar osm_engine (matar el GET muerto), re-ingestar las 6 IE "active"-stub, Atlas/SIG/Catastro crons o marcar honesto, Studio Video flag.
5. R4 IDOR + getattr · R5 fórmulas dinero · R3 resolvedores · R6 k-anon · plomería · cables flywheel · rate-limit v1.

═══════════════════════════════════════════════════════════════════════════════
# QA5 — DATOS REALES POBLADOS + PROFUNDIDAD ADVERSARIAL + RE-RUN EXHAUSTIVO · 2026-06-10
Upgrade: las 4 rondas previas probaron con BD vacía/seed → todo "latente". QA5 pobló dmx_qa5 realista (zone_scores 88/A, units_history 45 ventas, 145 búsquedas, 152 tx) y re-corrió → los latentes se vuelven números MAL. + edge/lifecycle/concurrencia + barrido EXHAUSTIVO de nombres (no muestreo).

## CONFIRMADO CON DATOS REALES (el vacío lo ocultaba)
- score_numeric bug: con Polanco 88/A real → simulador da tier **F**, bancabilidad **D**, score_inversión zona=65. Número FALSO, no default honesto. (toca ≥4 números)
- Divergencia cubo-vs-portal: con ventas reales = **44 pp** (portal 14% vs units_history 59%).
- k-anon: PROTEGE bien con búsquedas reales (suprime <3, revela ≥3). 🟢
- compute_avm (vertical_products) NO tiene el guard r²≥0.20 que sí tiene avm_public → con hedonic malo (r²=0.09) emite valuación **101M (8× el input)**. Dos AVM con políticas distintas.
- lifts ignoran units_history aun con 45 ventas reales (R1 sin conectar).

## 🔴 NUEVO MAYOR — PIPELINE ML COMPLETO INERTE
`emit_ml_event(db, *, event_type, ...)` se llama con args POSICIONALES en **16 sitios** (documents, developer, dev_batch1/10/11, diagnostic ×5, wizard ×2, b13 ×3, search_prefs) → TypeError tragado en try/except → `ml_accuracy_log=0`. TODA la telemetría de aprendizaje ML nunca se grabó.
`classify_reply` no existe a nivel módulo (solo método de clase) → import falla → **respuestas WhatsApp nunca se clasifican**.
`track_ai_call(wizard)` firma rota → costos IA del wizard sin contabilizar.

## 🔴 NOMBRES — 43 colecciones LEÍDAS sin escritor (clase DENUE, barrido exhaustivo)
18 son typo/fork con gemelo LLENO (fix 1 línea c/u): behavioral_tracking_events→behavioral_events(47) · zone_subscores→zone_scores(168) · ie_engine_scores→ie_scores(3422) · ie_scores_history→ie_score_history(10266) · scores→zone_scores · zones→dim_zones(51) · asesor_leads→asesor_contactos · asesor_citas→appointments · properties→dmx_units(496) · favoritos→buyer_favorites · dev_leads→leads · comparables→comparable_alerts · asesores→inmobiliaria_internal_users · narratives→ie_narratives · market_bulletins→dmx_bulletins · tenants→organizations · ie_unit_scores→ie_scores. 25 inertes sin gemelo (marketplace_searches, matches, unit_engagement, buyer_assignments/history, engagement_events, site_studies, lead_attribution, etc).
+ 6 hermanos más del campo score_total: cube_aggregations.last_synced_at→computed_at · hedonic_models coefficients (0/48 fitted) · risk_scores_zone score_letter/numeric (rama placeholder nunca corrió, 0/195) · denue_zone_density.safety_score (vive en crime_zone_colonia, 1573 docs) · ie_scores esquema viejo (score/percentile vs value).
+ 1 cable FE roto: RepliesInbox → /api/asesor/leads/* (no existe, es /contactos) → 404.

## 🔴 SEGURIDAD — confirmado ejecutando cross-tenant + 2 MUTACIÓN nuevos
- unit-fields PATCH: A sobrescribe inventario de B (filtro solo por unit_id) → flipea status/precio Y envenena el dev_id. **El más grave.**
- unit-status CAS débil: 3/10 ventas concurrentes pasan (doble venta); primer-override sin candado (8/8).
- Confirmados ejecutando 2 tenants: funnel SIN auth, insights, battle-card, sankey leen proyecto ajeno (200).
- 🟢 robusto: rol/tenant desde BD no token (escalada imposible), mass-assign bloqueado por allowlist, NoSQL-injection y path-traversal bloqueados, errores sin fuga de stacktrace.

## 🔴 DINERO (re-run profundo)
- score_inversion _normalize_zone: mismo bug clave → zona=65 constante (peso 30%).
- vertical_products DRPI: lee yoy_change_pct, el campo es delta_pct → apreciación SIEMPRE 6.5% hardcode.
- ROI inflado: 401% vs TIR 5.55%; recesión muestra **+96%** (TIR −4.4%) → gravemente engañoso.
- tax_projector: base < primer tramo → impuesto NEGATIVO (impacto real ~nulo).
- Inconsistencia costo obra: dev_batch8 $22k/m² vs valor_residual $14k vs Puente Alvarado $13k (~57%). Apreciación: 4 supuestos distintos (4%/4.5%/6%/6.5%).

## 🟡 TRUNCADOS SILENCIOSOS (sesgo a escala)
- drpi_engine + hedonic_regression: entrenan mediana/regresión sobre **2000 tx ARBITRARIAS sin sort** → modelo no representativo presentado como "de la zona". transaction_network 500 sin sort. fraud 2000 sin sort.

## 🔴 OTROS
- Stripe webhook fail-open: si falta STRIPE_WEBHOOK_SECRET acepta JSON sin firma → eventos de billing falsos.
- valor_residual cus_manual=0 (ruta lo permite ge=0) → ignora el 0, usa CUS=3 → oferta $60M en vez de $0.
- Concurrencia: guardar_estudio (versión duplicada) + registrar_prediccion (N abiertas) sin índice único — confirmado en runtime (5× → v1 triplicada; 5 predicciones abiertas).
- status "vendida" (femenino) no entra en SOLD_STATUSES → venta invisible.

## ÁREAS AÚN SIN AUDITAR (crítico de completitud)
superadmin 71 páginas (0 tests) · accesibilidad/mobile (founder usa CELULAR, solo ~9% responsive, 18 img sin alt) · render PDF con datos vacíos/enormes · cobertura tests (bancabilidad/terminal/payment_schemes/grafo sin test) · agentes runtime (prospector/closer doble-disparo) · deps/CVEs (sin pip-audit) · migraciones/backfill seed→real · WhatsApp/email templates con variables faltantes.

## VEREDICTO DE CONVERGENCIA
Las ~8 clases-raíz están ahora MAPEADAS con conteo completo de hermanos (score-key: 12+ · nombre-colección: 43 · firma rota: 19 · IDOR: 12+ incl. 2 mutación · money: 8 · truncado: 5). QA5 ensanchó el radio de las raíces conocidas Y halló 3 nuevas de alto impacto (ML pipeline inerte, mutación-IDOR, Stripe fail-open). Señal: seguimos encontrando MÁS HERMANOS de las mismas clases → estamos cerca de convergencia de CLASES. Recomendación: PIVOTAR A FIX por causa raíz (cada fix central mata muchos hermanos) + re-correr arneses para confirmar. QA6 solo para áreas vírgenes (superadmin/mobile/PDF/agentes).
