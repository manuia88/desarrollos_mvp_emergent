# Auditoría profunda del backend DMX — 2026-07-20

> **Cómo se hizo:** 16 subsistemas auditados en paralelo por agentes (86 agentes, 0 errores,
> 6.6M tokens, ~45 min), cada hallazgo con evidencia real de código + BD, **verificado
> adversarialmente** (se intentó refutar cada uno). 102 hallazgos únicos sobrevivieron.
> Doc canónico — se actualiza al arreglar cada palanca.

## Resumen ejecutivo
El backend **captura bien al INGERIR, tira la señal al VIGILAR y ANALIZAR, y varios índices
"licenciables" corren sobre relleno sintético, no data real.** 19 críticos · 50 altos · 31
medios · 2 bajos. 66 rotos · 18 faltan · 15 mejoras · 3 por crear. Casi todo cuelga de **8
causas raíz (palancas)** — si se atacan en orden, cae el 80%.

## Las 8 palancas (arreglas la raíz → caen muchos)

| Palanca | # | El corazón |
|---|---|---|
| **P1 · Identidad de unidad + poda de fantasmas** | 11 | `norm_unidad` colapsa torres (Humbolt 201 = Madison 201); 32% del cubo son fantasmas (2,243 átomos); re-ingesta duplica; no existe `purgar_dev()` |
| **P2 · Ledger de ventas (moat de velocidad)** | 12 | 413 ventas pero absorción no las lee; `days_to_sell` falso (68%=0); `units_history` vacío; 84% de "transiciones" es ruido de modelo ML |
| **P3 · Cerrar el ciclo del Vigía** | 9 | listas `_LP.pdf` INVISIBLES (feature estrella muerta en GDC); sin candado idempotente; no aprende "vendido"; override tapa el precio nuevo |
| **P4 · Captura de demanda / espinazo visitor_id** | 16 | visitor_id no se captura (83% null); búsquedas sin `id`; 100% de leads sin development_id; el lead no tiene UN score |
| **P5 · Índices sobre data REAL (no relleno)** | 16 | DRPI 99.8% sintético; compuesta Liquidez/Ghost come de placeholders; 3 loaders del ETL leen colecciones vacías |
| **P6 · Un solo rastro + integridad + deshacer** | 2 | deshacer deja eventos colgando; auditor ciego a huérfanos |
| **P7 · Multi-tenant / authz analítico** | 2 | 5 endpoints del dev gatean con el resolver seed → posible fuga cross-inmobiliaria |
| **P8 · Cubo de dos universos** | 5 | consulta-libre come de `dmx_units` (6,913), motor de cortes come de `db.units` → dos verdades del inventario |
| _otros (KG, fiscal, AVM, export, censo, cerebro)_ | 29 | subsistemas específicos — ver tabla |

## Ya arreglado en esta sesión (de esta misma lista)
- ✅ **PALANCA 1 COMPLETA** (identidad + poda):
  - `podar_atomos_fantasma` — cubo 6,913→5,672, 0 fantasmas, átomos vivos = db.units EXACTO (commit 230044e7).
  - `purgar_dev()` reaper + `podar_eventos_huerfanos` — 1,932 eventos huérfanos borrados, cableado al vigía (be7bc5b3).
  - `norm_unidad` torres-nombre — Humbolt 201 ≠ Madison 201, resolvió 152 colisiones, 0 nuevas (714b1304).
- ✅ **Hipersegmentación del parte** (líneas sin specs / "$?") → rediseño 3 cajones con dev·proyecto·depa·precio.
- ✅ **Truncado a 4000 de Telegram** → `_paginar` por bloques.
- ◐ **Bug "salta N renglones"** → el parte ya no lo renderiza (raíz en `lista_forense` pendiente).
- ✅ **Captura de Quiero Casa headless** (Sheet público).
- ✅ Jueces `ppm2_outlier` + `general_coherente` + backstop de locales.

## Los 102 hallazgos (por palanca · con upgrade)

### P1·Identidad+poda (11)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | sync_ingested_to_atom es upsert-only sin prune → 2243 átomos fantasma, 1332 marcados 'vendido', corrompen abso | roto | auditar | pend. | En sync_ingested_to_atom, tras el upsert, hacer delete_many de átomos cuyo unit_id ya no esté en el conjunto vivo (por developer_id/dev). O reconstrui |
| 🔴 | 32% del átomo del cubo (dmx_units) son unidades fantasma que la ingesta nunca poda | roto | alimentar | pend. | En sync_ingested_to_atom, tras el upsert, delete_many de dmx_units donde development_id∈devs y unit_id∉{ids vivos}. Alternativamente estabilizar el un |
| 🔴 | norm_unidad colapsa torres con nombre-palabra: 'Humbolt 201' y 'Madison 201' → misma clave '201' | roto | hipersegment | pend. | Extender el token de torre en norm_unidad a nombres-palabra (capturar el prefijo alfabético completo antes del número, no solo 1-2 letras) e incluirlo |
| 🔴 | No existe purgar_dev() ni reaper: borrar un dev limpia units pero deja 437 status-events + 22 price-events + 4 | crear | alimentar | pend. | Helper único purgar_dev(db, dev_id) que borre en cascada units + unit_status_events(dev_id) + price_events(dev_id) + dev_competitor_price_snapshots(pr |
| 🔴 | Ruido del modelo ML se cuela al hash de estado → 89.5% de la bitácora son eventos fantasma (idempotencia muert | roto | capturar | pend. | El hash SOLO debe cubrir estado declarado real: precio, disponible, status, m2, recámaras y features del vector — nunca crudos.ml_* ni ninguna valuaci |
| 🟠 | Re-ingesta de una lista por-torre marca VENDIDA la torre ausente por usar dos normalizadores distintos | roto | alimentar | pend. | Usar UN solo normalizador canónico (norm_unidad con torre) en el upsert Y en new_nos. Además no marcar vendido cuando la lista nueva claramente cubre  |
| 🟠 | sync_moldes pasa colonia_id como Zone.slug: MOLDE_IN_ZONE apunta a zonas fantasma desconectadas de los proyect | roto | hipersegment | pend. | Resolver colonia_id -> slug canonico de la coleccion colonias antes de pasar a upsert_molde_node, usando el MISMO key que _load_zones. Idealmente comp |
| 🟠 | Anomalia 'asesores_fantasma' es 100% falsos positivos: el campo last_login_at no existe en ningun user y no ha | roto | auditar | pend. | Leer el campo de ultimo login real (verificar en la coleccion/rol correcto de asesores) y no marcar fantasma cuando el campo simplemente falta (distin |
| 🟡 | El cron OLAP escribe oferta/tensión al histórico contando los átomos fantasma → 622 disponibles-fantasma infla | roto | alimentar | pend. | Arreglar el prune de átomos (hallazgo #2) resuelve la raíz. Como cinturón, filtrar la oferta del snapshot a solo átomos vivos (unit_id ∈ db.units) o c |
| 🟡 | Deriva de identidad de zona: _top_zones mezcla slugs (leads) con nombres-display (buyer_signals) → la misma zo | roto | leer | pend. | Normalizar a slug canónico (slugify colonia del buyer_signals) antes de persistir en _run_live_pulse_compute, y aplicar el mismo slugify en el endpoin |
| ⚪ | auditoria_hallazgos sin poda ni TTL: 157 corridas retenidas (21MB), cada ingesta y cada on-demand inserta la c | mejorar | auditar | pend. | TTL index sobre ts (p.ej. 90 dias) o conservar solo la ultima global + la ultima por-dev; opcionalmente separar resumen (retener) de hallazgos (rotar) |

### P2·Ledger ventas (12)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | transiciones() reporta 84% ruido de modelo + campo de procedencia como 'movimientos de mercado' | roto | leer | pend. | _META_EVENTO debe excluir 'fuente' + todo campo con prefijo ml_* + crudos redundantes (price/price_mxn/size_m2/size_m2_total que duplican precio/m2).  |
| 🟠 | days_to_sell contaminado por created_at (fecha de ingesta): 68% = 0 días, máximo 4 días en TODO el catálogo | roto | analizar | pend. | Persistir listed_at real al crear/ingerir la unidad (fecha de la lista más antigua donde aparece / first_seen del snapshot) y calcular days_to_sell =  |
| 🟠 | El ledger de 413 ventas (unit_status_events) NO alimenta el motor de absorción; solo lo lee un panel de displa | roto | alimentar | pend. | Que curva_absorcion/forecast lean unit_status_events por (dev_id/colonia_id, changed_at) para curva de ventas POR COHORTE en el tiempo (no foto puntua |
| 🟠 | units_history vacía Y sus lectores seguirían rotos aun poblada: filtro STRING vs campo Date y sort por campo i | roto | analizar | pend. | Unificar: que reingesta/vigía escriban units_history vía record_unit_change (o que has_real_sales cuente también unit_status_events). Arreglar dev_bat |
| 🟠 | Deshacer una ingesta restaura units pero deja vivos los eventos que emitió → absorción doble-contada | roto | auditar | pend. | deshacer_lote debe borrar/anular los eventos con acta_id o ventana [ts_acta, ts_cierre] del load revertido (marcarlos revertido=true para no ensuciar  |
| 🟠 | unit_status_events (el moat de velocidad, 465 docs) no tiene NINGÚN índice — full collection scan en cada lect | roto | alimentar | pend. | await db.unit_status_events.create_index([('dev_id',1),('changed_at',1)]) + índice en unit_id; agregarlo al bootstrap de índices junto al de price_eve |
| 🟠 | Los eventos no tienen `id` propio ni clave idempotente: la misma unidad acumula múltiples 'vendido' → infla ve | roto | alimentar | pend. | Añadir campo id + unique index (unit_id,new_status,changed_at) o convertir el insert en upsert por esa clave en el writer; script de saneo que colapse |
| 🟠 | Drift de tipo en 'ts' rompe el filtro de la ventana: oferta_timeline es 100% datetime pero se compara como str | roto | leer | pend. | Normalizar ts a un solo tipo en la ingesta (elegir datetime BSON en todas: oferta_timeline, vigia_eventos, audit_log) y filtrar la ventana con datetim |
| 🟠 | Los writers de eventos sólo stampan dev_id (namespace roto) y NUNCA org/tenant; unit_status_events además DROP | falta | capturar | pend. | En ambos writers de status resolver dev→org una vez y stampar org_id + colonia_id + alcaldia (como ya hace record_price_event); normalizar dev_id al d |
| 🟠 | El retiro sintético se re-emite en unidades que oscilan → 322 de 707 retiros son re-retiros, doble-conteo de ' | roto | analizar | pend. | Idempotencia del retiro: no reinsertar si el último evento de la unidad ya es un retiro del mismo estado; o versionar el ciclo reaparición→retiro con  |
| 🟡 | Nunca aprende 'vendido' de una lista y nunca limpia inventario_pelea cuando la unidad reaparece | falta | alimentar | pend. | Añadir token 'vendid·sold' → estado 'vendido' (o estado propio auditado) en el peek/apply; y en el loop de cambios['nuevas'] (o cuando _unidad reapare |
| 🟡 | censo_norma solo caza incoherencia de estado cuando BD=='vendido': 1266 unidades 'reservado' con precio escapa | mejorar | auditar | pend. | Comparar el estado contra el set {vendido, reservado, apartado, bloqueado} (todo lo que contradice 'en oferta') y leer price_mxn or price al cotejar e |

### P3·Ciclo Vigía (9)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | Las listas nombradas '<PROYECTO>_LP.pdf' son INVISIBLES para todo el pipeline de detección y auto-apply | roto | capturar | pend. | Añadir '_LP', '\bLP\b' y 'l\.?p\.?' al regex _LISTA_NOMBRE y al patrón lista_precios de _TIPOS_DOC. Mejor aún: si el mime es hoja/pdf y el contenido t |
| 🟠 | vigia_senales_venta es colección de SOLO ESCRITURA: 11 señales de 'probable venta' que ningún motor lee | roto | alimentar | pend. | Dar salida a la señal: en el mismo lista_apply, además de vigia_senales_venta escribir unit_status_events(new_status='probable_vendido'/vendido, sourc |
| 🟠 | El detector de renglones omitidos dispara falsas alarmas masivas con numeración por piso (101,102,201...) | roto | auditar | ◐ parte ok, raíz pend. | No tratar como secuencia si los enteros no son ~contiguos: agrupar por centenas (detectar bloques por piso) y buscar huecos DENTRO de cada bloque, o e |
| 🟠 | Sin candado de concurrencia: doble corrida re-aplica el diff y estampa un precio_pelea FALSO sobre la unidad q | roto | alimentar | pend. | Tomar lock por fuente (findAndModify {ronda_en_curso:false→true} o advisory lock) al entrar a ronda; alternativamente commitear vigia_fotos ANTES del  |
| 🟠 | El timeline 'unificado' que dice cerrar la fragmentación NO incluye unit_status_events (465) ni vigia_eventos  | falta | leer | pend. | Añadir unit_status_events (ts field, norm con from/to status+unit_id+dev_id) y vigia_eventos a SOURCES; exponer también en /audit/export. Con esto el  |
| 🟠 | El mismo parte dice '😴 Sin movimientos de unidades' y a la vez 'el vigía YA aplicó N precios · N estados' — se | roto | auditar | pend. | Que _sec_movimientos también lea lista_cambiada.aplicado (precios/status/senales aplicados en la ventana) y los sume al conteo, o que _sec_movimientos |
| 🟠 | Las 4 colecciones analíticas están FUERA de SENSITIVE_COLLECTIONS: tenant_filter() es no-op sobre ellas inclus | falta | auditar | pend. | Decidir por colección: (a) registrar price_events/unit_status_events en _OWNER_FIELDS con un campo org stampado (ver hallazgo de captura) para que ten |
| 🟡 | unit_status_events y vigia_senales_venta sin ningún índice; price_events con 1 índice suelto — no hay bootstra | falta | leer | pend. | Crear ensure_event_store_indexes(db) y llamarla en startup: unit_status_events (dev_id,1)+(changed_at,-1) y (colonia_id,1)+(sold_at,-1); vigia_senales |
| 🟡 | El precio auto-aplicado por el vigía queda tapado por developer_unit_overrides en la vista pública/efectiva | mejorar | alimentar | pend. | Al auto-aplicar, también actualizar o limpiar el developer_unit_overrides.price en conflicto (o registrar precio_pelea contra el override), de modo qu |

### P4·Demanda/espinazo (16)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | El buscador IA guarda la búsqueda SIN campo `id` → 340 átomos con search_id="" colapsan en la llave natural | roto | capturar | pend. | En routes/public.py:3517 generar `id`: f"mks_{uuid4().hex[:12]}" (igual que marketplace_search.py:188 ya hace para el picker). Backfill: asignar id a  |
| 🔴 | visitor_id NO se captura en el buscador IA → 362/435 átomos (83%) con visitor null; el espinazo nace roto en l | roto | capturar | pend. | Propagar visitor_id desde el front del buscador IA (mismo que el picker/favoritos ya mandan) y exigirlo en public.py:3517 como en el bloque filtro_est |
| 🔴 | Llave de atribución heterogénea y sin puente: 73% de buyer_signals y 100% de leads.development_id NO resuelven | roto | hipersegment | pend. | 1) Añadir columna slug canónica a developments y un resolver slug→dev_id. 2) Normalizar entity_id/development_id a dev_id en el punto de escritura (bu |
| 🔴 | El lead no tiene UN score: 5 marcadores dispersos que no se reconcilian; leads.score=None en 59/59 | roto | hipersegment | pend. | Un reconciliador que por lead resuelva visitor_id/user_id y escriba UN campo canonico leads.score (0-100)+banda, alimentado por termometro+buyer_score |
| 🟠 | explotar_senales() está cableado y corre en startup pero produce 0 átomos: cruza entity_id (desarrollo) contra | roto | alimentar | pend. | Reescribir el join: resolver entity_id→unidades del desarrollo (o usar unit_number cuando type=unit_view) antes de tomar el vector. Alternativa: deriv |
| 🟠 | behavioral_events (3454, el stream más grande) no tiene visitor_id y buyer_signals tiene session_id 0% → los d | falta | leer | pend. | Emitir visitor_id en behavioral_events (el front ya lo tiene en buyer_signals/favoritos) o poblar session_id en buyer_signals, para tener un puente du |
| 🟠 | Sin flag de entorno: roma-norte-85 (#1 con 543 señales) = 5 visitantes, 469 de UN visitante sintético sobre un | falta | auditar | pend. | Añadir campo `env`/`is_demo` (o allowlist de visitor_id sintéticos) en la escritura de buyer_signals/demand_atoms/leads y filtrarlo en TODA lectura de |
| 🟠 | El espinazo cierra para 2/59 leads: 47/59 leads sin visitor_id; la conversión no se puede atribuir al rastro d | falta | hipersegment | pend. | Sellar visitor_id en la creación del lead (arrastrar el visitor_id de la sesión al formulario) y unificar el visitor_id entre marketplace_searches, bu |
| 🟠 | fraud_rings y leads_zombies NUNCA pueden disparar: 0/59 leads tienen client_global_id | roto | auditar | pend. | Backfill de client_global_id en leads (entity resolution del comprador) antes de que estas anomalias tengan sentido; o cambiar la clave de agrupacion  |
| 🟠 | El store de snapshots mezcla filas per-tenant (tier='development', 1041) con filas compartidas (colonia, 1131) | crear | alimentar | pend. | Añadir owner_org al schema para tiers de entidad (unit/development/prototype), stamparlo en write_many desde el cron, registrar la colección en SENSIT |
| 🟠 | buyer_score IGNORA buyer_signals (1359 senales reales) y lee behavioral_events por user_id que casi no existe  | roto | analizar | pend. | Que compute_user_score lea buyer_signals por visitor_id (resolviendo visitor->user via visitor_identity) y sume likes/ficha_view/unit_view; recalibrar |
| 🟠 | termometro_leads se muere de hambre: 362/435 (83%) de demand_atoms tienen visitor_id=None y se descartan; solo | roto | capturar | pend. | Propagar visitor_id/session_id en marketplace_searches y perfilador antes de atomizar; para atomos anonimos, agregar por search_id/colonia como demand |
| 🟠 | El match lead->asesor da ~32.5% uniforme para todos porque los feeders estan en cero (deals=0, avg_price=0, re | mejorar | analizar | pend. | Alimentar los feeders del match (cierres reales por zona desde copiloto_closings, precio promedio por asesor, tiempo de respuesta real desde lead_even |
| 🟡 | Financiero declarado 'vivo' en el diccionario pero solo materializado en 30% del átomo (mens/enganche) y prob_ | falta | hipersegment | pend. | Correr dmx_finance_atom sobre los 4845 átomos sin finance (idempotente) y bajar prob_venta al átomo, o degradar el estado de 'financiero'/'prob_venta' |
| 🟡 | El fallback de consumers (Atlax/BuyerCoach/dev_batch7) es invisible: 0 filas kg_consumer_query en audit y /sta | mejorar | leer | pend. | Incluir action='kg_consumer_query' en el conteo de /kg/stats y exponer una metrica de fallback_rate (consultas con kg_unavailable/fallback_required).  |
| 🟡 | lead_temperaturas es almacen de solo-escritura: se computa el score 0-100 + banda 'hirviendo' pero NADIE lo le | mejorar | leer | pend. | Al escribir lead_temperaturas, hacer upsert del score+banda al leads correspondiente (via visitor_id) y exponerlo en la bandeja del asesor; o servir l |

### P5·Índices reales (16)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | La compuesta licenciable de Liquidez/Ghost se alimenta de recetas DataPending que escriben un 50.0 constante,  | roto | alimentar | pend. | En composite_metrics marcar estas celdas como estado 'esperando_dato' cuando la receta es DataPendingRecipe o confidence=proxy (no como 'vivo'); filtr |
| 🔴 | El DRPI es 99.8% relleno sintético (proxy_backfill); el motor real produce 0 índices de zona usables y consumi | roto | alimentar | pend. | Añadir synthetic:{$ne:True} a TODA lectura de drpi_snapshots en consumidores públicos (vertical_products, demand_intelligence, bulletins); marcar el Y |
| 🔴 | 3 loaders del ETL leen colecciones VACIAS/inexistentes: Zone, IEScore y Comparable nunca entran al grafo | roto | alimentar | pend. | Reapuntar los 3 loaders a las colecciones reales: _load_zones->colonias/dim_zones (key slug), _load_iescores->ie_scores, _load_comparables->transactio |
| 🟠 | El 'upsert' del índice de precios NUNCA actualiza: mete computed_at en la llave → 660 docs redundantes y la se | roto | alimentar | pend. | Sacar computed_at de la llave del upsert y meter el periodo CALENDARIO (ej. period_key='2026-06' o snapshot_day='2026-06-04'). Así una corrida por día |
| 🟠 | trend_7d en realidad es trend_1d: el sort DESC dentro de la ventana de 7 días agarra el snapshot de AYER, no e | roto | analizar | pend. | Ordenar ASC y tomar el más VIEJO dentro de la ventana [now-7d, now], o buscar el snapshot más cercano a now-7d (ej. {snapped_at<=now-6d} sort DESC). I |
| 🟠 | Dos colecciones de auditoría: db.audit_logs (plural, 6 docs) es escrita e indexada pero NINGÚN API la lee | roto | auditar | pend. | Migrar los 6 docs de audit_logs → audit_log vía log_mutation (mapear user_id→actor, resource→entity_type), reapuntar server.py:1740 y landings.py:277  |
| 🟠 | El KPI de seguridad critical_24h siempre da 0: el campo 'severity' se lee/indexa/exporta pero NINGÚN writer lo | roto | auditar | pend. | En log_mutation derivar severity a partir de action/entity: delete + authz 'denied' + cambios de precio > umbral → 'critical'/'high'; el resto 'info'. |
| 🟠 | health_scores son 8 cachés obsoletas (TTL 60min pero 7 tienen 20+ días); el snapshot diario congela la misma c | roto | auditar | pend. | Agregar cron que recorra proyectos/asesores/clientes vivos y llame compute_health_score(force=True) antes de take_health_snapshots; que take_health_sn |
| 🟠 | El 74% de las filas del índice de precios están vacías (transactions_count=0 con median/p25/p75/iqr todos 0.0) | mejorar | analizar | pend. | No persistir filas con transactions_count < MIN (ej. 3), o marcarlas available:false; que consumidores filtren transactions_count>0; o backfillar con  |
| 🟠 | No existe juez de plausibilidad ni cobertura sobre scores/indices: 26% de ie_scores y 27% de zone_scores son s | crear | auditar | pend. | Crear juez_metricas: rango duro por familia (scores 0-100, cap_rate 0-25%, tir -50..60%), % stub/proxy por zona como metrica de salud, y flag 'stub se |
| 🟠 | Project.zone_slug queda SIEMPRE None: developments usan colonia_id, el ETL lee zone_slug/colonia_slug -> 0 edg | roto | hipersegment | pend. | En el mapper de _load_projects usar colonia_id como fallback y normalizarlo al mismo key space que los nodos Zone (slug de colonia). Alinear el nombre |
| 🟡 | Dos stores 'append-per-corrida' sin idempotencia de periodo ni purga: 78% y 86% de filas son redundantes y cre | falta | alimentar | pend. | Índice único por (tier,tier_id,measure,period,dims) + upsert en vez de insert_many, o job de compactación diario que colapse a la última corrida por ( |
| 🟡 | El DRPI nacional quedó fuera de escala (index_value=3776.9 vs base=100), un solo doc calculado una vez y nunca | roto | analizar | pend. | Recalcular el nacional excluyendo mezcla de escalas (validar que todo index_value ~[50,200] antes de promediar) y volver a anclar a 100; agregar asser |
| 🟡 | Una zona centinela de prueba '___NOPE___' tiene 24 snapshots DRPI sintéticos contaminando el índice | roto | auditar | pend. | Borrar db.drpi_snapshots.delete_many({'zone_id':'___NOPE___'}); añadir guard en el backfill y en compute_drpi_national para rechazar zone_ids que empi |
| 🟡 | 27% de ie_scores son proxy neutro (5,487 en value=50) y hay 3 versiones de fórmula mezcladas (0.1/1.0/1.1); lo | mejorar | auditar | pend. | En lecturas de scoring excluir/segregar is_proxy=True y exponer confidence al consumidor; normalizar formula_version (recomputar el cohorte 0.1 o marc |
| 🟡 | Sin índice único ni llave de idempotencia en oferta_timeline; ingesta_directa dispara snapshot SIN debounce | mejorar | auditar | pend. | Índice único (unit_id, hash) — o (unit_id, hash, disponible) — para que corridas repetidas del mismo estado sean no-op a nivel BD; y enrutar TODA inge |

### P6·Rastro+integridad (2)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🟡 | deshacer_lote borra units y re-inserta el backup pero deja los eventos/competitor-snapshots del lote colgando  | roto | auditar | pend. | En deshacer_lote marcar revertido_at (soft-delete) los eventos con changed_at dentro de la ventana del acta y source de esa ingesta, o escribir evento |
| 🟡 | AUDITAR es ciego a huérfanos de eventos, y el único auto-fix de assets huérfanos consulta el campo equivocado  | falta | auditar | pend. | Capa de integridad referencial en el auditor que reporte por colección los docs con dev_id/development_id ∉ developments y unit_id ∉ units (mismo quer |

### P7·Multi-tenant (2)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | Los 5 endpoints analíticos del dev gatean con el resolver seed (sync), no con user_dev_ids_db → el dueño real  | roto | leer | pend. | Cambiar los 5 `_user_dev_ids` a `await user_dev_ids_db(db, user)` (seed+reales), y traer el dev/units desde db.developments/db.units en vez de DEVELOP |
| 🟡 | read_timeseries dedupea por 'period' SOLO (colapsa celdas de dims distintos) y latest() hace match EXACTO de d | roto | analizar | pend. | Dedup por (period, dims_hash) en read_timeseries; alinear latest() a match por subcampo; índice ÚNICO (tier,tier_id,measure,period,dims_hash) con upse |

### P8·Cubo unificado (5)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | El cubo tiene DOS universos: consulta-libre come de dmx_units (6913) y el motor de cortes come de db.units (51 | roto | leer | pend. | Elegir UNA fuente canónica del inventario para todo el cubo. Recomendado: que cube_query_libre/cube_olap también pasen por unidades_efectivas(db.units |
| 🟠 | _normalize_row une contra el seed data_developments (0% solapamiento con los 123 devs del átomo) → dimensiones | roto | hipersegment | pend. | Cambiar el join a db.developments (los 87 devs reales ingeridos) en vez del seed in-memory. Cargar {id: dev} de db.developments una vez por consulta ( |
| 🟠 | geo.colonia_id null en 3401/6913 (49%) → la 'colonia' más grande del cubo es un bucket VACÍO de 3401 unidades, | roto | hipersegment | pend. | En db_unit_to_atom (dmx_cube_feed.py:149) resolver colonia_id desde el dev cuando la unidad no lo trae, y correr un backfill de geo.colonia_id/alcaldi |
| 🟡 | En re-ingesta por IA, parking_spots colapsa multi-cajón a 1 (ignora _parking_count) | roto | capturar | pend. | Reemplazar la línea buggy por parking_spots = u.get('parking_spots') if not None else _parking_count(u.get('parking')), igual que el insert. |
| 🟡 | Los lunes se disparan diario Y semanal con contenido solapado y sin supresión del subconjunto | roto | exportar | pend. | Cuando toque una cadencia mayor el mismo día, o (a) suprimir el diario y mandar solo el semanal, o (b) hacer el 'desde' de cada parte relativo al ÚLTI |

### otros (29)

| | Hallazgo | Tipo | Cap | Estado | Upgrade |
|--|--|--|--|--|--|
| 🔴 | censar_desarrollo (capa 6) es codigo muerto: cero callers, 66/87 devs nunca censados y censo_pct stale servido | roto | auditar | pend. | Cablear censar_desarrollo dentro del loop por-dev de auditar() (o en el cron diario) leyendo la fuente fresca; o si censar_post_carga ya la reemplaza, |
| 🔴 | El time-series 'pro' (/api/v1/zones/{id}/timeseries) consulta campos que NO existen → serie VACÍA para toda zo | roto | exportar | pend. | Cambiar el filtro a {'zone_id':zone_id,'ts':{'$gte':datetime_cutoff}} y sort('ts',1); alinear el proyector para devolver kpis+ts. Añadir un test de co |
| 🔴 | Las líneas VENDIDA/ALTA/reaparición salen SIN specs y con precio '$?' — la hipersegmentación estrella no se cu | roto | hipersegment | ✅ ya (parte) | En transiciones(), enriquecer cada registro de salida/alta con el snapshot del evento b (precio, recamaras, banos, estacionamientos, m2) además de la  |
| 🟠 | read_timeseries mezcla el TOTAL de colonia con los drills por recámaras: dedup solo por 'period' pisa el total | roto | leer | pend. | En read_timeseries, cuando dims trae solo {gran}, exigir que la fila NO tenga subcampos extra (match exacto de dims o filtrar dims con solo las claves |
| 🟠 | Cada snapshot de oferta recarga TODO oferta_timeline (49k docs, ~31MB) a memoria sin proyección — y se dispara | mejorar | capturar | pend. | Proyectar solo {unit_id,ts,hash,disponible,colonia,dev_id} en el find, u obtener el último evento por unidad con un pipeline $sort+$group (o mantener  |
| 🟠 | Cero detección de moneda: todo se guarda como price_mxn y una lista en USD se corrompe en silencio | falta | capturar | pend. | Añadir campo currency a la extracción y al esquema de unit/development (default MXN pero explícito). El prompt debe detectar '$/USD/US$/AED' de encabe |
| 🟠 | La bitacora que lee el auditor (oferta_timeline) esta desanclada: 1462 eventos huerfanos y 637 unit_id inexist | falta | auditar | pend. | Juez huerfano_bitacora: contar/limpiar eventos cuyo dev_id no esta en developments y unit_id no esta en units; re-anclar por unit_number cuando el dev |
| 🟠 | Dos esquemas incompatibles en los eventos: reingesta escribe {unit_id,dev_id}, retro_lista escribe {dev_name,c | roto | analizar | pend. | Un solo writer canónico con esquema fijo {development_id, unit_id (resuelto por dev+unit_number), unit_number, dev_name, colonia_id}. Migración que re |
| 🟠 | El export CSV de auditoría TIRA resource/payload de los 24 docs de esquema viejo → CSV y JSON no coinciden | roto | exportar | pend. | Normalizar en el export: mapear esquema viejo (resource→entity_type, payload→after_json) o añadir columnas resource/payload_json; hacer que CSV y JSON |
| 🟠 | Los bundles se venden con 'export Excel/CSV · SLA' pero la API v1 que los entrega es 100% JSON — no existe CSV | falta | exportar | pend. | Añadir ?format=csv·xlsx a los endpoints v1 licenciables (mismo patrón que superadmin_audit/insights: StreamingResponse text/csv y openpyxl para xlsx), |
| 🟠 | 'Salta N renglones': las unidades NUEVAS y los cambios de STATUS se truncan sin decir '+N más' (los otros dos  | roto | hipersegment | ◐ parte ok, raíz pend. | Añadir en lineas_de_cambios la misma línea '… y N más' para 'nuevas' (usando totales.nuevas - min(len,8)) y para 'cambios_status' (totales.cambios_sta |
| 🟠 | KG_AVAILABLE se fija UNA vez al arranque y nunca se re-chequea: Neo4j caido desde ~07-02, los 3 crons llevan ~ | falta | alimentar | pend. | Agregar job APScheduler cada N min que llame health_check() para refrescar KG_AVAILABLE (auto-detecta caida y recuperacion). Emitir notificacion/healt |
| 🟠 | Todo el bucketing temporal es UTC, no CDMX → 61% de eventos caen en el día/mes equivocado; el snapshot diario  | roto | analizar | pend. | Convertir a America/Mexico_City antes de derivar 'fecha' y cualquier period (guardar ts en UTC está bien, pero bucketizar en tz local). Con eso el sna |
| 🟠 | INPC congelado en abril-2026: toda venta de mayo en adelante usa un INPC viejo y sobrestima el ISR del vendedo | roto | alimentar | pend. | Añadir la serie INPC de Banxico (SP74625) al BanxicoConnector y un cron mensual que haga append de anchors en una colección (p.ej. db.inpc_series) que |
| 🟠 | El AVM corre casi a ciegas: 15 de 2788 colonias tienen precio_pm2 y la capa '4S dato real' del residual son so | falta | alimentar | pend. | Cerrar el flywheel de precio: (1) job que derive precio_pm2 por colonia desde units.price reales de los 87 developments + market_comps_4s, escribiéndo |
| 🟠 | colonia_valoracion nunca se refresca por cron/route y 977 docs están vacíos; Picks lee la copia congelada mien | roto | alimentar | pend. | Cron mensual (o post-ingesta) que recorra las colonias con actividad y llame upsert_valoracion, y que picks_engine consuma get_valoracion (o exija com |
| 🟡 | El merge de re-ingesta descarta amueblado, cuarto_servicio y notas | roto | capturar | pend. | Agregar amueblado, cuarto_servicio y notas al loop de campos finos del upsert (mismo patrón: escribir solo si u.get(k) is not None). |
| 🟡 | censo_verificacion reporta pct=100% ignorando 928 campos sin_fuente: campos sin respaldo servidos como '100% v | mejorar | auditar | pend. | Reportar aparte cobertura_censo = comparados/(comparados+sin_fuente) y listar los campos sin_fuente por unidad, para que un campo sin respaldo de fuen |
| 🟡 | Cero paginación en toda la API v1: demand-pulse fija $limit 100, comparables tope 200, market/cube sin límite  | falta | exportar | pend. | Añadir paginación por cursor (next_cursor sobre un campo indexado + page_size) a demand-pulse, comparables, market/cube y demand; devolver has_more/ne |
| 🟡 | /audit/unified filtra en Python DESPUÉS del over-fetch por fuente → pierde matches viejos; 'total_trails' devu | roto | leer | pend. | Empujar los filtros (entity_type/actor_user_id/by_ai) al find() de cada colección (con índices), y calcular el total real sumando count_documents(filt |
| 🟡 | Telegram se trunca a 4000 con texto[:4000] y descarta secciones enteras sin aviso; el correo sí va completo | roto | exportar | pend. | Partir el texto por bloques (\n\n) en mensajes de ≤4096 y enviarlos en secuencia numerada (1/3, 2/3…), o mandar un resumen corto + link al parte compl |
| 🟡 | El parte no se guarda en ninguna colección: cero historial, cero dedup entre cadencias, imposible 'solo lo nue | falta | alimentar | pend. | Crear colección partes_enviados {id, periodo, generado_at, desde, hasta, texto, enviado:{telegram,correo}, n_secciones}. Guardar en cada enviar_parte, |
| 🟡 | kg_anomalies con TTL 30d + cron de deteccion muerto: el panel se vaciara a '0 anomalias' = falso 'todo en orde | mejorar | leer | pend. | El endpoint /anomalies debe devolver last_detection_run (del audit kg_anomaly_detected) y un flag 'stale' si >24-48h; el front debe mostrar 'deteccion |
| 🟡 | Formato de period inconsistente rompe el filtro desde/hasta en granularidad 'semana' y 'trimestre' (descarta d | roto | hipersegment | pend. | Filtrar por el timestamp real (comparar fechas, no el string del label); o normalizar desde/hasta al mismo formato del label según la granularidad (se |
| 🟡 | 37 cerebro_tasks (incl. deal.change_price) quedan atrapadas: la unica via para listarlas/aprobarlas esta hard- | mejorar | exportar | pend. | Ruta de solo-lectura (superadmin) que muestre/exporte cerebro_tasks pendientes aunque el flag este off, o dejar de escribir tasks mientras el Cerebro  |
| 🟡 | El residual usa CUS=3.0 inventado para 1413 colonias sin norma, fabricando los m² construibles que sostienen t | mejorar | analizar | pend. | Cuando no hay CUS oficial, en vez de 3.0 usar el CUS MEDIANO real de la alcaldía (ya hay 1375 colonias con cus) como referencia local, y degradar el r |
| 🟡 | El beneficio de predial para adultos mayores/vulnerables NO se aplica cuando el usuario captura su predial act | roto | analizar | pend. | Aplicar el beneficio vulnerable en modo user_actual: si valor_proy==0 pero grupo_vulnerable, tratar el input como bruto y aplicar la cuota fija $408 ( |
| 🟡 | El kill-switch de AirROI (API de pago) viene ENCENDIDO por default y la llave está en el env; solo lo frenan e | mejorar | capturar | pend. | Cambiar el default de AIRROI_ENABLED a 'false' (opt-in explícito), o hacer que build_context/composite_metrics reciban with_airroi desde el llamador e |
| ⚪ | ESTADOS_VALIDOS trae 'bloqueada' (fem) pero no 'bloqueado' (masc): 3 unidades reales marcadas falsamente 'esta | roto | auditar | pend. | Agregar 'bloqueado' (y revisar 'bloqueadas'/'bloqueados') al set ESTADOS_VALIDOS; idealmente normalizar el status a un enum canonico antes de auditarl |
## Plan de ataque (orden de impacto)
1. **P1 · Identidad + poda** — devuelve realismo a TODAS las métricas (mata fantasmas). *← primer paso*
2. **P2 · Ledger de ventas** — revive el moat (velocidad de venta real).
3. **P3 · Ciclo del Vigía** — resucita la feature estrella (auto-apply GDC).
4. **P4 · Demanda / visitor_id** — cierra el flywheel de demanda.
5. **P5 · Índices reales** — quita el relleno de los índices licenciables.
6. **P6-P8 + otros** — rastro, multi-tenant, cubo, KG, fiscal, AVM.

Cada palanca: en scope se arregla, con tests, prendido al final.
