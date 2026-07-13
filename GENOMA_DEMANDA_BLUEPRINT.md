# GENOMA DE DEMANDA · Blueprint Canónico del Moat DMX
**Fecha:** 2026-07-13 · **Estado:** Ola A en construcción · **Doctrina:** este documento ES el checklist maestro — se actualiza con ✅+fecha por chunk terminado. Nada de esta visión se pierde.

## LA TESIS (el moat en una frase)
Cada búsqueda y cada unidad hablan el mismo idioma de ~40 dimensiones (el GENOMA). Con demanda y oferta en el mismo sistema de coordenadas, todo se vuelve calculable en 12 escalas (CDMX→segundo de atención en una foto). 4S vende fotos de 100 encuestados por $500k; DMX opera el censo continuo del deseo inmobiliario de CDMX. **KPI del moat (auditable por YC): nº de preguntas que la plataforma responde con dato real/observado por semana — debe crecer cada semana.**

## LO QUE NADIE MÁS TIENE (catálogo consolidado)
### Data única
1. Censo continuo de deseo (átomos de demanda, ~40 dims, con visitor y tiempo)
2. Vector genoma por UNIDAD del inventario (mismo idioma que la demanda)
3. 2,951 átomos 4S medidos (calibrador) + curvas gap a $200k + crosstabs etapa de vida
4. Data negativa: exclusiones ("no avenida"), fichas sin like, inventario invisible, zonas nunca buscadas
5. Corpus léxico de búsquedas (tendencias de vocabulario con 1-2 años de ventaja)
6. Catastro 1.08M predios × demanda (nadie más tiene las dos puntas)

### Índices (publicables/licenciables)
7. Índice Adelantado de Plusvalía (aceleración de demanda → precio 12-18m antes)
8. Reloj de Ciclo de Mercado por colonia (expansión/pico/contracción/recuperación)
9. Alerta de Burbuja local (precio÷demanda divergentes + price-to-rent)
10. DMX-30 (índice bursátil de colonias líquidas → prensa/autoridad) + Beta y Sharpe por colonia
11. Índice de Accesibilidad DMX en tiempo real (× tasas BANXICO)
12. Índice de Escasez por feature×zona + Tensión en 12 escalas
13. Gentrificación Adelantada (demanda entrante × giro comercial DENUE)

### Scores y motores
14. Precio Sombra por feature (cuánto vale un balcón en Condesa, $/m²) — hedónico+demanda
15. Score de Liquidez por unidad (prob. venta <90d por su vector vs demanda)
16. Curva de Valor Vertical (precio por piso/orientación por zona)
17. Land Bank Scorer ⭐ (predio × demanda × residual = "dónde comprar tierra HOY")
18. Screener de unidades infravaloradas (el stock-screener inmobiliario)
19. Radar de lo Inexistente (búsquedas con 0 resultados → auto-brief al dev)
20. Sustituibilidad / Corredores de demanda (mercado relevante por comportamiento, no radio)
21. Gemelo de Demanda v2 (¿cuántos buscadores ACTUALES matchean mi edificio hipotético?)
22. Elasticidad por dimensión (quito balcón = −31% demanda)
23. Prima de marca y de puntualidad del desarrollador
24. Inferencia de etapa de vida (crosstabs 4S + vector observado, sin preguntar)
25. Saliencia visual (dwell/zoom por tipo de foto × perfil chef/tecnófilo/sensualista)
26. Temperatura de lead (completitud del vector + señales) + enrutamiento a asesor
27. Termómetro financiero por zona (enganche/mensualidad pedidos vs exigidos)
28. Elasticidad promocional (¿el descuento crea demanda o la adelanta?)
29. Precio real post-impuestos (tax engine como dimensión de comparación)
30. Curva de confianza por avance de obra + costo del retraso
31. Valor de la Información (el sistema auto-prioriza qué dato capturar)

### Productos
32. Estudio DMX auto-generado por zona (sustituto/competidor de 4S, licenciable)
33. Generador de Reportes por menú (territorio × bloques × cortes, macro→átomo)
34. CARFAX del depa (informe de due diligence por unidad, B2C)
35. Originación inversa (cohortes de compradores pre-calificados → bancos/devs)
36. Simulador del mercado (10k compradores sintéticos de vectores reales × inventario real)
37. Cap rate implícito + comprar-vs-rentar por colonia (calculadora pública imán)
38. Alertas: "240 personas buscan lo que tu edificio tiene" / "publica esta semana"

## CHECKLIST MAESTRO POR OLAS (dependencias primero; cada ola termina: tests + verificado en app real + procedencia etiquetada + commit)

### OLA A · GENOMA + CAPTURA TOTAL (el cimiento — sin esto nada existe) — ✅ COMPLETA 2026-07-13 (A6 vector listo; espejo vivo = B1)
- [x] A1. ✅2026-07-13 · Taxonomía canónica de features (texto libre→slug contable: roof_garden, ludoteca, pet_friendly…) `backend/demand_genome.py`
- [x] A2. ✅2026-07-13 · Átomo de demanda universal (visitor × territorio × dimensión × valor × fuente × ts) → colección demand_atoms
- [x] A3. ✅2026-07-13 · Explotador: marketplace_searches + buyer_signals existentes → átomos (backfill idempotente + on-write)
- [x] A4. ✅2026-07-13 · Cerrar dimensiones perdidas de captura: tándem/independiente · meses-a-entrega numérico · tipo de crédito · promos/descuento · tamaño edificio · nivel pedido · m² uniforme (parser + persistencia en las 3 superficies)
- [x] A5. ✅2026-07-13 · Normalizar soft_criteria del buscador IA → taxonomía (dejan de ser texto muerto)
- [x] A6. ✅2026-07-13 · Vector genoma por unidad (mismas dims desde dmx_unit_schema/units) — reader, no migración
- [x] A7. ✅2026-07-13 · Endpoint /api/superadmin/genoma/resumen (átomos por dimensión×zona×día = KPI del moat) + tests
- [x] A8. ✅2026-07-13 · m² y features al contraste 4S (hoy solo recámaras+presupuesto)

### OLA B · ESPEJO + REPORTES (acceso total a la data) — ✅ COMPLETA 2026-07-13
- [x] B1. ✅2026-07-13 · Espejo demanda↔oferta por dimensión×escala (reusa cube_lens/k-anon)
- [x] B2. ✅2026-07-13 · Índice de Escasez + Tensión por feature×zona (12 escalas, mismo índice por peldaño)
- [x] B3. ✅2026-07-13 · Generador de Reportes por menú: endpoint componible (territorio+bloques+cortes) — bloques: demografía/NSE · oferta · demanda viva · finanzas · 4S real/transferido · índices · catastro/DENUE · riesgos · estilo de vida
- [x] B4. ✅2026-07-13 · UI superadmin del generador (menú → reporte en pantalla + imprimible, reusa patrón PDF estudio)
- [x] B5. ✅2026-07-13 · Data negativa v1: inventario invisible (0 vistas/30d) + fichas sin like + zonas nunca buscadas → alertas
- [x] B6. ✅2026-07-13 · Radar léxico (corpus de queries → términos emergentes por trimestre)

### OLA C · SCORES DEL MERCADO (la inteligencia encima del espejo) — ✅ COMPLETA 2026-07-13
- [x] C1. ✅2026-07-13 · Precio Sombra por feature×zona (hedonic_regression_engine + pesos de demanda)
- [x] C2. ✅2026-07-13 · Score de Liquidez por unidad (vector × tensión × absorción → prob_venta v2)
- [x] C3. ✅2026-07-13 · Screener de unidades infravaloradas (Σ precios sombra vs precio lista) + UI superadmin
- [x] C4. ✅2026-07-13 · Radar de lo Inexistente → auto-brief (conecta brief_4s_engine + generador_producto)
- [x] C5. ✅2026-07-13 · Curva de Valor Vertical (piso×orientación×zona desde units)
- [x] C6. ✅2026-07-13 · Corredores de demanda / sustituibilidad (grafo colonias que comparten buscadores)
- [x] C7. ✅2026-07-13 (motor set_competitivo + endpoint; integración battle cards UI pendiente) · Grafo de comparaciones → set competitivo real por unidad → battle cards auto
- [x] C8. ✅2026-07-13 (v1 colonia; drill a predio con catastro_predios+AVM = v2) · Land Bank Scorer ⭐ (catastro × demanda × valor residual, ranked por predio) + UI

### OLA D · TIEMPO + FINANZAS (los indicadores adelantados)
- [ ] D1. Índice Adelantado de Plusvalía (aceleración de demanda vs serie de precios)
- [ ] D2. Reloj de Ciclo por colonia + Alerta de Burbuja (price-to-rent + divergencia)
- [ ] D3. Índice de Accesibilidad DMX (× BANXICO ya conectado)
- [ ] D4. Termómetro financiero por zona + temperatura de lead + enrutamiento a asesor
- [ ] D5. Cap rate implícito + comprar-vs-rentar por colonia (+ calculadora pública)
- [ ] D6. Cronobiología: hora/día por segmento · estacionalidad fiscal · costo de lentitud del asesor
- [ ] D7. Elasticidad promocional + precio post-impuestos (tax engine como dimensión)
- [ ] D8. Curva de confianza por avance de obra + prima de puntualidad del dev

### OLA E · PSICOGRÁFICA + PERSONAS — ✅ COMPLETA 2026-07-13 (ola_e_engines.py · 4 bloques SDUI, 37 total · GET /genoma/ola-e/{motor} registro · gate vivo 4/4 con datos reales · test universal db-vacía)
- [x] E1. Inferencia de etapa de vida ✅ 2026-07-13 — Bayes real: prior ciclo_vida_pct 4S (facts, etapas DESCUBIERTAS del dato — 10 en vivo) × registro de verosimilitudes (rec/m²/features) → posterior por visitante + comparativa demanda-vs-demografía (sobre-representación). En vivo: pareja_joven_sin_hijos busca 2.53× su peso demográfico.
- [x] E2. Saliencia visual ✅ 2026-07-13 — photo_dwell/photo_zoom (YA capturados, 47 señales) → top fotos que retienen + curva de atención por posición + cruce con etapa de vida (E1). Nota: cuando la metadata traiga TIPO de foto, se segmenta sola.
- [x] E3. Cohortes gemelas ✅ 2026-07-13 — gemelos por Jaccard del genoma (llaves dim=val) × destinos ponderados (lead 3.0 > intent 2.0 > save 1.5 > like 1.0, pesados por similitud) → 'compradores como tú terminaron en X' con drill por visitor_id (?visitor_id=).
- [x] E4. Prima de marca ✅ 2026-07-13 — registro de 3 componentes (absorción .40 × demanda/unidad .30 × prima de precio sostenida .30 — cobrar más Y vender = marca) → score 0-100 por dev con nombre.

### OLA F · SIMULACIÓN + CEREBRO (la capa que aprende)
- [ ] F1. Bayes formal: prior 4S + observado → posterior por zona×dimensión
- [ ] F2. Gemelo de Demanda v2 (matcheo de buscadores actuales vs proyecto hipotético)
- [ ] F3. Simulador del mercado (agentes muestreados de vectores reales × inventario)
- [ ] F4. Cerebro: cada índice nuevo registra predicción + drift (motor existe, flag OFF — decisión founder)
- [ ] F5. Valor de la Información (auto-priorización de captura)

### OLA G · PRODUCTOS (monetización del moat)
- [ ] G1. Estudio DMX auto-generado por zona (licenciable, sustituye 4S)
- [ ] G2. DMX-30 + Beta + Sharpe por colonia (publicable trimestral)
- [ ] G3. CARFAX del depa (informe B2C por unidad)
- [ ] G4. Originación inversa (cohortes pre-calificadas → bancos/devs)
- [ ] G5. Alertas dev ("240 buscan lo que tienes" / timing de publicación)
- [ ] G6. API v1: catálogo de índices tier-gated (infra existe)

## PRINCIPIO DE UNIVERSALIDAD (regla del founder 2026-07-13 — aplica a TODAS las olas)
Ningún chunk se construye limitado a los ejemplos: **(1) GARANTÍA "ningún campo se pierde"** — cualquier campo escalar no curado de una búsqueda se vuelve átomo `busqueda.<campo>` automáticamente (campos nuevos entran solos, se curan con banda después); flags `tiene_*` de unidades → features automáticas. **(2) REGISTROS, no ifs** — el contraste 4S↔vivo recorre `_CONTRASTE_REGISTRO` (agregar dimensión = 1 línea); misma regla para escasez/espejo/reportes en olas B+. **(3) La taxonomía es extensible** y lo no-reconocido SIEMPRE queda en el radar léxico — nunca se descarta. Cualquier chunk futuro que no cumpla estas 3 reglas se rechaza en review.

## GATES DE CALIDAD (cada chunk, sin excepción)
tests verdes · verificado logueado en app real · procedencia en cada número (medido/observado/transferido/estimado) · k-anon fuera de superadmin · sin features huérfanas (todo con ruta+UI) · commit descriptivo · este doc actualizado con ✅+fecha.

## HARDENING A-C — ✅ 2026-07-13 (auditoría post-construcción del founder)
🔴 Correctness: espejo con SEMÁNTICA de satisfacción (2 rec = 2+; presupuesto = techo) vía registro `_SEMANTICA` · tensión por VISITANTES ÚNICOS (el obsesivo cuenta 1) · ventana temporal 90d en demanda · precio sombra por ESTRATOS (colonia+m²+rec) · curva vertical INTRA-edificio (dev_id) · screener solo comparables DISPONIBLES + estrato fino con fallback reportado.
🟡 Valor: señales buyer_signals→átomos con PESO (ver=0.3 vs buscar=1.0) · taxonomía promovible en RUNTIME (radar léxico→promover→re-explotar, endpoint /genoma/taxonomia/promover) · KPI del moat con HISTORIA semanal (snapshot idempotente + bloque genoma_kpi en el menú) · land bank por PERCENTILES (50% demanda·30% brecha·20% normativo) · reportes con MEMORIA (guardar/abrir) · backfill+señales+snapshot al arranque + cron horario (la curva crece sola).
⚪ Gates: caché TTL 60s del inventario (perf) · GATE APP REAL: parcial ✅ (app importa, 1,844 rutas, 33 nuevas registradas) — runtime vivo BLOQUEADO por entorno (sin mongod ni docker daemon en esta máquina). Para cerrarlo: `open -a Docker` → `docker run -d --name dmx-mongo -p 27017:27017 mongo:7` → levantar backend/front y navegar Hub Mercado logueado.
Pendientes menores anotados: botón por-término en radar léxico (endpoint listo) · edad de publicación en unidades invisibles · land bank v2 a predio.

## BITÁCORA TEMPORAL (la 4ª dimensión) — ✅ 2026-07-13
Pregunta founder: "en 4 años quiero la evolución de TODA la data". Estado: demanda YA era temporal (átomos con ts) · tasas YA (gov_rates) · oferta NO (el precio pisaba al anterior). Construido `market_timeline.py`: **snapshot_oferta** event-sourced por CAMBIO (nada se pisa, nunca — test: 2 corridas sin cambio = 1 evento; cambio de precio = evento nuevo) · **snapshot_contexto** diario idempotente (tasas BANXICO + inventario + $/m² mediana + átomos) · **evolucion()** universal: cualquier corte del genoma (semántica del espejo reusada) × día/mes/año × colonias × o UNA unidad exacta (test: la vida del PH-402 mes a mes 11.8→12.1→12.5M). Corre solo: arranque + cron diario. Bloque 'evolucion' en el menú (necesita: tiempo → el selector de granularidad aparece solo). FIX universalidad front: ESTUDIOS ya NO hardcodeados — se leen del catálogo (un 5º estudio aparece solo). NOTA HONESTA: la bitácora acumula DESDE HOY — el pasado anterior a hoy no existe (salvo historia del cubo y series de plusvalía ya existentes); en 4 años habrá 4 años.

## EVOLUCIÓN v2 HIPERSEGMENTADA — ✅ 2026-07-13 (aclaración founder: cualquier temporalidad, no 4 años literales)
Registro GRANULARIDADES: **hora → día → semana ISO → mes → trimestre → año** (una nueva = 1 línea), horizonte ilimitado (la bitácora nunca borra). **Cortes MÚLTIPLES con Y lógico**: "2 rec Y roof Y ≤5mdp" — el visitante cuenta solo si pidió TODO (∩ de conjuntos, no suma); la unidad solo si satisface TODO (semántica del espejo reusada). **DESGLOSE** (`desglosar_por`): una serie por CADA valor de cualquier dimensión (demanda 2rec vs 3rec en paralelo). **Tensión por periodo** (demanda/oferta) + señales ponderadas + $/m² + tasa en cada fila. Aplica a TODO: demanda (átomos, cualquier dimensión incl. busqueda.*/exclusion/lexico) y oferta (toda dimensión del registro _SEMANTICA; sin lado-oferta → sin_espejo honesto). Front: selector 6 granularidades + input de desglose (server-driven, aparecen solo con bloques de tiempo) + renderer pinta desglose (sub-tabla por valor). Eventos de bitácora ahora guardan crudos recamaras/piso con fallback al vector.

## INSTANTÁNEA (la pregunta-2033) — ✅ 2026-07-13
Visión founder: "no importa el dato, no importa la fecha, no importa lo hipersegmentado del mix — SIEMPRE obtengo datos: valores unitarios Y múltiples". 3 huecos detectados y cerrados: **(1) MAGNITUDES**: los eventos ahora guardan TODO campo numérico crudo de la unidad (m2_balcon=10, no solo el flag 'tiene balcón') — garantía ningún-campo-se-pierde aplicada al lado OFERTA; **(2) TRANSICIÓN DE VENTA**: "vendidas EN mayo 2027" = detección disponible→vendido dentro de ventana; **(3) VALORES UNITARIOS**: `instantanea()` devuelve LOS registros (cada depa con su estado completo de ESE momento) + agregados. Operadores universales =/>=/<=/rango/tiene sobre CUALQUIER capa (top-level → crudos → vector — un campo capturado mañana ya es consultable). Test LITERAL de la pregunta 2033 en verde: dep-A 95m²/$8.4M/3rec/gym+alberca/balcón 10.0m²/vendido 2027-05 — y dep-B (balcón 4m²) y dep-C (vendido agosto) correctamente excluidos. Bloque 'instantanea' (necesita fecha → inputs aparecen solos) + POST /genoma/instantanea.

## DETECCIÓN DE RETIRO (pregunta founder: ¿'vendido' aplica si la lista quita el depa?) — ✅ 2026-07-13
Tres caminos, todos escritos en la bitácora automáticamente por el cron: **(1) marca explícita** 'vendido' en la lista → evento status=vendido → `tipo_salida=vendido_confirmado`; **(2) DESAPARICIÓN de la lista** (el caso que la bitácora NO cubría): el cron compara la bitácora vs el inventario actual — unidad que estaba disponible y ya no aparece → evento sintético `retirada_de_lista` / `tipo_salida=retirada_probable_venta` (honesto: probable, no confirmada; si reaparece, el siguiente evento lo corrige solo); **(3) cualquier otro cambio** (precio, m², status) → evento por hash. La instantánea etiqueta cada salida con su tipo — el founder distingue confirmadas de probables. Idempotente (no duplica retiros). Tests: desaparición→retirada_probable_venta · marca explícita→vendido_confirmado.

## TRANSICIONES — el "vendido" GENERALIZADO a todas las dimensiones — ✅ 2026-07-13
Pregunta founder: "¿esta idea del depa vendido cómo aplica a todas las dimensiones?". Respuesta: "vendido" es UN caso del patrón universal TRANSICIÓN = cualquier campo que cambia entre dos eventos de la bitácora. Motor `transiciones()`: diffea TODAS las capas (top-level, crudos, features, status) SIN lista fija — un campo capturado mañana genera transiciones hoy. Tipos emergentes: alta · salida (confirmada/probable/otra) · **reaparición (venta caída — señal que nadie tiene)** · cambio(campo) con delta y delta% · feature agregada/removida. Hipersegmentación total: tipo × campo × territorio × ventana × CUALQUIER corte del genoma ("¿cuántos de 3 rec CON balcón bajaron precio en junio y cuánto?" → test literal verde). Bloque 23 del menú (SDUI, cero front) + POST /genoma/transiciones.

## GATE RUNTIME VIVO — ✅ PASADO 2026-07-13 (OrbStack, Mongo real del founder)
Stack: dmx-local-mongo + redis + uvicorn:8000 · login superadmin OK · sin token → 401 (puerta cierra) · genoma/resumen: 425 átomos reales, 24 dimensiones con señal · snapshot bitácora VIVO: 1,276 unidades (597 disponibles), dedup correcto, retiros 0, BANXICO tiie 6.66% fluyendo, pm2 mediana $69,078 · transiciones vivo: 1,276 altas (día 1 de la bitácora) · menú 23 bloques con 'transiciones' auto-aparecido · espejo real 74 llaves. BUG REAL cazado en el gate: piso '10+1' de una lista ingerida tiraba TODO el inventario del espejo → parse tolerante (_entero) + aislamiento por unidad. Suite 1,501.

## UPGRADE 100% PRE-OLA-D (urgentes + no urgentes + gates adelantados) — ✅ 2026-07-13
Orden founder: "nada de backlog, se crea, se resuelve en este momento". Todo shipped y verificado en app real:
1. **BITÁCORA UNIFICADA** (el urgente): fuente/procedencia en CADA evento (cron/arranque/manual/evento:<origen>) · cualquier cambio escrito (edición manual, Drive, webhook vía units_history + ingesta bulk) dispara el snapshot AL INSTANTE con debounce 5s (ráfaga = 1 corrida, fuentes anotadas) e invalidación de caché del espejo · cron pasa de 24h → 1h como red de seguridad (dedup por hash lo hace gratis). Los dos universos (units_history al-momento vs bitácora por-reloj) ya son uno.
2. **ABSORCIÓN VIVA** — la velocidad de venta MEDIDA (no encuesta 4S): salidas por periodo (confirmadas vs retiros probables vs reapariciones), tasa de absorción, meses-de-inventario, altas — hipersegmentada (territorio × granularidad × cualquier corte). Bloque 24 + POST /genoma/absorcion-viva. Cimiento de Ola D.
3. **ALERTAS DE TRANSICIONES** — revisar_transiciones() en el cron 07:30 existente: si el mercado se movió (bajas con % mediano, ventas confirmadas, retiros, resurrecciones — las altas no despiertan a nadie) → notificación a superadmins por notifications_engine. Idempotente por día (db.genoma_checks).
4. **SALUD DEL DATO** — bloque 25 + GET /genoma/salud-dato: presente/rescatado/perdido/ausente por campo con ejemplos y peores colonias. YA PAGÓ: reveló que el campo real de piso en ingeridas es `level` → alias agregado en vector+espejo+salud (piso pasó de 'ausente 1361' a 'presente 872'; 489 de verdad no vienen en la fuente — honesto).
5. **FRONT**: "Ver todas las N filas" + "Descargar CSV" en CADA tabla de CADA bloque (adiós "completo por API") · comparador de guardados LADO A LADO ("Comparar con…" — hoy vs hace un mes, mismo renderer) · **acciones_por_fila** universales (el bloque declara endpoint+param_de_fila y cada fila gana su botón): radar léxico ya tiene "Promover a feature" por término.
6. **GATES ADELANTADOS (producción en masa)**: índices oferta_timeline (unit_id · colonia+ts · ts) + contexto_timeline(fecha) · push-down de filtro colonia a Mongo en evolucion/instantanea/transiciones (fakes de test ignoran filtros-dict → defensa doble) · contexto diario POR COLONIA (pm2/inventario/disponibles — la serie de cualquier colonia sin recomputar).
7. Data negativa con EDAD: unidades invisibles ahora dicen hace cuántos días nacieron en la bitácora (edad_mediana + por unidad).
Suites: backend 1,510+ · front 181. Gate vivo: 25 bloques en menú, absorción/salud respondiendo con datos reales, botones por fila visibles.

## OLA D — TIEMPO + FINANZAS — ✅ COMPLETA 2026-07-13
8 motores en `ola_d_engines.py` sobre la bitácora unificada + genoma, TODOS con bloque en el menú (33 total) + ruta genérica GET /genoma/ola-d/{motor} (registro _MOTORES_OLA_D — motor nuevo = 1 entrada):
- **D1 Índice adelantado de plusvalía** ✅ — registro de 4 componentes 0-100 (momentum demanda ventana 30v30 · tensión visitantes/disponibles · absorción salidas/stock · presión alzas-vs-bajas) → índice por colonia; '_sin_colonia' fuera del ranking; es_estimado por colonia con <3 visitantes.
- **D2 Reloj de ciclo + burbuja** ✅ — cuadrante (precio↑↓ × inventario↑↓) → 4 fases (registro _FASES) + burbuja 0-100 (sube-sin-demanda + inventario creciendo + >12 meses stock); confianza honesta: las ALTAS de día-1 no cuentan como señal de ciclo.
- **D3 Accesibilidad × BANXICO** ✅ — tasa CF303 (banxico_rates, no duplicada) × precio mediano → mensualidad + ingreso requerido (30%) por colonia + sensibilidad ±200pb; precios <$100k (basura) fuera.
- **D4 Termómetro de leads** ✅ — registro de 5 factores (recencia .30, profundidad .25 vía PESO_SENAL, frecuencia .20, especificidad .15, finanzas .10) → temperatura 0-100 + bandas frío/tibio/caliente/hirviendo + distribución. Cierra el pendiente LEAD_SCORING_OPPORTUNITY.
- **D5 Cap rate + comprar-vs-rentar** ✅ — REUSA rentability_from_pm2 (canónico cubo): cap rate, renta est., mensualidad/renta, price-to-rent por colonia; procedencia 'estimado' honesta (se vuelve medida cuando ingestemos rentas).
- **D6 Cronobiología del deseo** ✅ — señales por hora × día-semana × mes + pico ("martes 21h") para timing de campañas.
- **D7 Elasticidad + post-impuestos** ✅ — elasticidad OBSERVADA (baja de precio → Δunit_views ±14d, despertar mediano); neto vendedor REUSA _isr_art126_core (art. 126, single source) con supuestos declarados.
- **D8 Curva de obra** ✅ — pm2 mediano por etapa DESCUBIERTA del dato + prima vs preventa; lectura maneja prima negativa (mezcla de colonias) y los tiempos entre etapas se medirán solos de la bitácora.
Gate vivo: los 8 respondieron con datos reales (D4: 4 visitantes medidos, 1 hirviendo 81.8 · D3: mensualidad $46,700 mediana ciudad, sensibilidad monótona · D7: neto ISR 34 colonias). Test universal: db vacía → 8 motores responden honesto, nada truena (anti-dependencia Lomas). Tests 9 (suite 1,519). Afinaciones cazadas por el gate: colonia fantasma, precio basura, confianza día-1, redacción prima negativa.
SIGUE: Ola E (psicográfica) · F (simulación) · G (productos).
