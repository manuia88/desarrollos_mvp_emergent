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

### OLA C · SCORES DEL MERCADO (la inteligencia encima del espejo)
- [ ] C1. Precio Sombra por feature×zona (hedonic_regression_engine + pesos de demanda)
- [ ] C2. Score de Liquidez por unidad (vector × tensión × absorción → prob_venta v2)
- [ ] C3. Screener de unidades infravaloradas (Σ precios sombra vs precio lista) + UI superadmin
- [ ] C4. Radar de lo Inexistente → auto-brief (conecta brief_4s_engine + generador_producto)
- [ ] C5. Curva de Valor Vertical (piso×orientación×zona desde units)
- [ ] C6. Corredores de demanda / sustituibilidad (grafo colonias que comparten buscadores)
- [ ] C7. Grafo de comparaciones → set competitivo real por unidad → battle cards auto
- [ ] C8. Land Bank Scorer ⭐ (catastro × demanda × valor residual, ranked por predio) + UI

### OLA D · TIEMPO + FINANZAS (los indicadores adelantados)
- [ ] D1. Índice Adelantado de Plusvalía (aceleración de demanda vs serie de precios)
- [ ] D2. Reloj de Ciclo por colonia + Alerta de Burbuja (price-to-rent + divergencia)
- [ ] D3. Índice de Accesibilidad DMX (× BANXICO ya conectado)
- [ ] D4. Termómetro financiero por zona + temperatura de lead + enrutamiento a asesor
- [ ] D5. Cap rate implícito + comprar-vs-rentar por colonia (+ calculadora pública)
- [ ] D6. Cronobiología: hora/día por segmento · estacionalidad fiscal · costo de lentitud del asesor
- [ ] D7. Elasticidad promocional + precio post-impuestos (tax engine como dimensión)
- [ ] D8. Curva de confianza por avance de obra + prima de puntualidad del dev

### OLA E · PSICOGRÁFICA + PERSONAS
- [ ] E1. Inferencia de etapa de vida (Bayes: crosstabs 4S + vector observado)
- [ ] E2. Saliencia visual (dwell/zoom por tipo de foto × perfil) — requiere foto-tipo en metadata
- [ ] E3. Cohortes gemelas ("compradores como tú terminaron en X") — extiende casamentera
- [ ] E4. Prima de marca del desarrollador (track record × absorción × demanda)

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
