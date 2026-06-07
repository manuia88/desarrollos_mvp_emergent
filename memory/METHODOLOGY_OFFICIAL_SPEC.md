# Metodología Oficial por Métrica — Cómo se Calcula de Verdad

> 2026-06-07 · Análisis 2 (7 agentes paralelos). Para CADA métrica que la plataforma publica: su metodología OFICIAL (con cita), cómo la calculamos hoy, el método corregido con la data ya conectada, y cómo mostrarla en lenguaje normal. Fuente de verdad para que TODO lo que publicamos sea defendible.

## HALLAZGO TRANSVERSAL (el patrón del problema)
La **arquitectura es sólida**, pero falla en 3 cosas repetidas, que se arreglan con UN principio:
1. **Normalización por topes inventados** (ej. densidad DENUE 3000 vs 500 → Polanco saca 13 por un lado y 80 por otro, MISMO dato). → **Fix: normalizar por percentiles reales de CDMX, no topes a mano.**
2. **Pesos inventados** en los compuestos. → **Fix: documentarlos (método OCDE) o aprenderlos de cierres reales.**
3. **Probabilidades sin calibrar** (sigmoide×4 arbitrario). → **Fix: regresión logística sobre cierres reales + curva de calibración.**
Y la regla de oro: **anclar a la fuente OFICIAL ya conectada** (catastro, SHF, FGJ, DENUE, AirROI, GTFS, OSM, Banxico, INEGI), **mostrar como banda/lenguaje** (nunca decimal crudo), y **marcar confianza** (real vs estimado).

## CONTRADICCIONES/ERRORES CONCRETOS A CORREGIR (los 🔴)
- **Densidad DENUE**: tope 3000/km² (zone_score) vs 500/km² (zone_subscores) — real CDMX ~400-1200. → percentil real.
- **Riesgo sísmico**: A=20/B=50/C=75/D=95 INVENTADO — las zonas A-D son **categorías físicas** (NTC-2017), no un score lineal. → mostrar la zona literal + lectura, o usar aceleración espectral.
- **Hundimiento**: `mm/año × 4` inventado → clasificación oficial SACMEX (5 categorías no lineales).
- **Absorción**: `vendido/total` (mal denominador) → `vendido/(disponible+vendido)` + "meses de inventario" (NAR).
- **Días en mercado (DOM)**: usa edad del PROYECTO, no de la unidad listada → necesita `first_listing_date`+`closing_date`.
- **Caminabilidad**: solo 1 de 8 categorías de Walk Score → no es walkability real.
- **Yields de renta**: tabla por tier inventada → comparables de renta + AirROI (ADR×ocupación).
- **Prob. de venta / close**: suma aditiva 0.45+… y sigmoide×4 sin calibrar → logística sobre cierres reales.

---

## FAMILIA 1 · VALUACIÓN (AVM, Precio Justo, Catastro→Comercial)
**Método oficial:** IVSC International Valuation Standards 2022 · RICS Red Book 2023 · **NMX-C-459** (perito México: enfoque comparativo + homologación) · **Ross-Heidecke** (demérito edad+conservación) · **Manual OCDE-Eurostat RPPI** (hedónico). Cap rate del enfoque de ingresos (NOI/valor).
**Hoy:** `avm_public_engine` fallback heurístico (rec×0.04, baño×0.025, edad×0.012) NO consulta comparables reales; el hedónico real (`hedonic_regression_engine`) sí pero requiere ≥30 transacciones; `avm_feature_engine` ya acotado estilo Ross-Heidecke (✅ corregido antes).
**Corregido (selector 3 niveles):**
1. **Comparativo (preferido)**: ≥3 comparables reales de la zona (obra nueva = unidades de devs · reventa = captaciones), homologados (edad/superficie/ubicación/estado), promedio + rango ±12%.
2. **Hedónico**: ≥30 transacciones → OLS log($/m²) ~ features + CI 95%.
3. **Heurístico (fallback)**: base = $/m² del catastro `vsuelo`×ratio comercial o SHF, acotado, marcado "datos limitados".
**Catastro→comercial:** el `vsuelo` (catastral 2022, 6.89M predios SIG WFS) es FISCAL (~60-85% del comercial). Ratio comercial/catastral por alcaldía aprendido de transacciones reales; temporal 2022→hoy con índice SHF. NO usar catastral como precio directo.
**Mostrar:** "Precio basado en N propiedades similares vendidas" / "Estimado con datos limitados, rango amplio" / "Sin dato — solo precio del desarrollador".

## FAMILIA 2 · ÍNDICES DE PRECIO / PLUSVALÍA (DRPI, IPV, gentrificación)
**Método oficial:** **Manual OCDE-Eurostat RPPI** (hedónico + repeat-sales Case-Shiller + stratified median) · metodología índice **SHF** · gentrificación académica (Freeman/Furman: cambio en precio + ingreso + escolaridad + composición).
**Hoy:** DRPI hedónico ✅ conforme pero sin CI ni sample; **gentrificación/IPV** = `mom*6 + slope*1.5 + 15` INVENTADO (el +15 sin justificación).
**Corregido:** DRPI hedónico + reportar CI + sample_size + validar contra SHF. IPV = `0.50×momentum_12m + 0.25×aceleración_6m − penalización_volatilidad` (todo del DRPI real) + bono emergente CONDICIONAL (no fijo). Plusvalía real = del índice SHF.
**Mostrar:** "Polanco subió 25% desde enero 2024 (95% seguros)" — NUNCA "índice 125".

## FAMILIA 3 · MERCADO (absorción, demanda, días en mercado, prob. venta)
**Método oficial:** **NAR** (absorción = vendidas/(disponibles+vendidas); meses de inventario = stock/ventas mensuales) · **CoStar** demanda = (búsquedas+leads)/inventario · **MLS** DOM = cierre − primer listado · prob. venta = **regresión logística** sobre cierres.
**Hoy:** absorción `vendido/total` (denominador mal); demanda mezcla "deseabilidad" con momentum + proxy inventario; DOM usa edad del proyecto (mal concepto); prob_venta = suma aditiva inventada.
**Corregido:** absorción con denominador correcto + meses de inventario por tipología; demanda real con **Apify Google Trends** (ya conectado) + leads + vistas; DOM con `first_listing_date`/`closing_date` (agregar al schema); prob_venta = logística sobre cierres reales (cuando haya volumen; mientras, marcada "estimado heurístico").
**Mostrar:** "Se vende ~25% del inventario al mes = 4 meses para agotar · ritmo normal CDMX".

## FAMILIA 4 · RENTA / YIELD (renta larga/corta, cap rate, IRE)
**Método oficial:** **IVSC/RICS** enfoque de ingresos: Cap Rate = NOI/valor · Gross/Net Yield · GRM = precio/renta anual · **APVIM** México · STR: **ADR × ocupación × 365** (AirDNA/AirROI).
**Hoy:** `_TIER_YIELD` tabla por tier inventada; renta corta = `larga × (1.4 + comercio×0.0055)` sin evidencia.
**Corregido:** renta larga = comparables reales de renta (captaciones tipo_operacion=renta) / precio; renta corta = **AirROI real** (ADR×ocupación×365/precio); NOI = renta − gastos (~25% larga, ~45% corta); publicar cap rate vs rango de mercado (CBRE). IRE se auto-corrige al arreglar los yields.
**Mostrar:** "Rentándola te dejaría ~5.2% al año (4 deptos similares rentaron a $X/mes); neto ~3.9% tras gastos".

## FAMILIA 5 · RIESGO (sísmico, inundación, seguridad, percepción)
**Método oficial:** **SESNSP** delitos por 100k · **INEGI ENVIPE** percepción · **NTC-CDMX 2017** zonas sísmicas (categorías físicas) · **CENAPRED/Atlas** períodos de retorno (inundación) · clasificación **SACMEX** hundimiento · **OCDE** índice compuesto.
**Hoy:** crimen por 100k ✅ correcto (FGJ real, 2.1M filas) · ENVIPE ✅ · sísmico A=20/B=50/C=75/D=95 🔴 inventado · hundimiento ×4 🔴 · inundación ambiguo · pesos del compuesto sin documentar.
**Corregido:** seguridad con FGJ real / población INEGI; sísmico = **mostrar la zona literal (A/B/C/D) + lectura**, no número lineal; inundación por período de retorno (Tr 10/25/50/100); hundimiento por clasificación SACMEX; documentar pesos (crimen 40% cuantificable · natural 25% · percepción 20% subjetiva · título 15%).
**Mostrar:** "Zona sísmica C (suelos blandos, amplificación moderada-alta)" · "2,900 delitos por 100k (arriba del promedio CDMX 2,200)".

## FAMILIA 6 · CALIDAD DE VIDA (walkability, amenidades, movilidad, ICO)
**Método oficial:** **Walk Score** (8 categorías × decaimiento por distancia) · **TfL PTAL** accesibilidad a transporte · densidad por **percentil** (OCDE/INEGI DENUE) · índices de calidad de vida (Numbeo/EIU/Mercer).
**Hoy:** caminabilidad solo 1 de 8 categorías; densidad con topes contradictorios 3000 vs 500; transporte usa proxy del seed (no GTFS); ICO mezcla "riesgo" y "plusvalía" con "vivibilidad".
**Corregido:** Walk Score real con **OSM** (8 categorías, 400m, decay); transporte **PTAL con GTFS** (Metro/Metrobús/EcoBici); densidad = **percentil real** de DENUE (elimina los topes); ICO = solo vivibilidad (sacar riesgo y plusvalía a sus propios índices).
**Mostrar:** "Muy caminable — súper, restaurantes, banco y parque a pie" · "Hay que usar auto para casi todo".

## FAMILIA 7 · SCORES COMPUESTOS Y PROBABILIDADES (IDM, project/zone/health/fit/buyer score, close prob)
**Método oficial:** **Manual OCDE/JRC de Indicadores Compuestos** (normalización min-max/z-score/percentil · ponderación justificada AHP/PCA/experto · agregación · análisis de sensibilidad · transparencia) · probabilidades = regresión logística + **curva de calibración** + Brier score + intervalo de confianza.
**Hoy:** pesos razonables pero sin justificar; normalización por topes inventados (P90=50, cap=20, cap=5, ritmo×25); buyer/fit/project score con decenas de cortes a mano; close_probability con sigmoide×4 sin calibrar (confunde "confianza en la señal" con "probabilidad calibrada").
**Corregido:** normalizar cada componente por **percentil real** de la población (colonias/proyectos/leads); pesos documentados (AHP) o **aprendidos de cierres**; probabilidades con **logística calibrada** + IC; análisis de sensibilidad (variar pesos ±10% y ver que el ranking no se voltea).
**Mostrar SIEMPRE como banda + lenguaje** (Salud: B · "sube moderado, liquida rápido, demanda balanceada"), NUNCA "72.3"; y con la confianza ("basado en 342 perfiles similares, 180 cerraron").

## FAMILIA 8 · FINANCIERO (ROI, TIR, TCO, hipoteca, impuestos)
**Método oficial:** finanzas estándar (TIR/VPN con descuento) · SAT/Gaceta (impuestos) · Banxico (tasas).
**Hoy:** impuestos ✅ oficiales · hipoteca ✅ (banxico_rates CF303) · TIR del simulador mezcla plusvalía + flujo sin descontar bien (revisar) · APREC_RATES por tier heurísticas.
**Corregido:** TIR/VPN con descuento correcto; plusvalía por zona desde el índice SHF real (no tabla por tier).

---

## CÓMO SE INTEGRA (un solo motor de normalización + leyenda)
Construir un **servicio común de normalización** (`metric_normalizer`): toma un valor crudo + la población de referencia (todas las colonias/proyectos) → devuelve percentil + banda (bajo/medio/alto o A-F) + leyenda en lenguaje normal + fuente/confianza. TODOS los scores lo usan → consistencia, cero topes inventados, y una sola leyenda honesta en las 4 superficies (marketplace/asesor/dev/superadmin).

## PLAN DE CONSTRUCCIÓN (cierra ciclos, front+back, prioridad por valor/riesgo)
1. **`metric_normalizer` (percentiles reales) + leyenda** — base de todo. Elimina topes inventados (3000/500), unifica bandas.
2. **Riesgo real** (FGJ/Atlas/ENVIPE ya conectados) — seguridad por 100k, sísmico literal, inundación por Tr. Alto valor + dato listo.
3. **Calidad de vida real** (Walk Score con OSM + PTAL con GTFS + DENUE percentil) — reemplaza scores mock por dato.
4. **Renta real** (AirROI + comparables) — yields/cap rate/IRE de verdad.
5. **Valuación** (comparables→hedónico→catastro+SHF, ratio catastral→comercial) — el AVM grounded.
6. **Índices de precio** (DRPI con CI + IPV momentum real + plusvalía SHF).
7. **Mercado** (absorción NAR + demanda Apify + DOM con fechas + prob logística).
8. **Probabilidades calibradas** (logística sobre cierres, cuando haya volumen).
Regla: cada uno se construye COMPLETO (front+back), se prende con el dato conectado y cae a "estimado" honesto si falta, y muestra banda + leyenda (nunca decimal crudo). Doc fuente: `memory/METHODOLOGY_OFFICIAL_SPEC.md`.
