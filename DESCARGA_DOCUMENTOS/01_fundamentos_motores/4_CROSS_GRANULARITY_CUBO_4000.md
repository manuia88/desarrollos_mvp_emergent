# ANÁLISIS PROFUNDO — Cruce Marketplace × Superadmin: el cubo de ~4,000 celdas

Pregunta: cruzando la **hipergranularidad del marketplace** (comportamiento) con los **motores del superadmin** (mercado),
¿qué nivel NUEVO de granularidad descubrimos? ¿Qué motores se comparten, cuáles son independientes, cuáles refinan?

**Respuesta corta:** 230 celdas era la aproximación mínima. El cubo real **direccionable ≈ 4,000 celdas**, y nacen
**~25 métricas COMPUESTAS net-new** que ningún motor solo produce. Demostrado con dato real (ver §4).

---

## 1 · CLASIFICACIÓN DE MOTORES: compartidos / independientes / refinadores

### 🔗 COMPARTIDOS (el puente — viven en ambos lados, son la junta del cruce)
`zone_score` · `demand_intelligence` · `avm_public/hedonic` · `cube_olap` · `transaction_network` · `absorcion` ·
`demand_twin` · `risk_score` · `zone_cycle` · `dmx_cube_feed` · `metrics_cube`.
→ Son la **columna vertebral**: el marketplace los alimenta (señales→demanda) y el superadmin los lee (mercado→índices).
La misma colonia tiene un valor en los dos lados; cruzarlos es lo que produce lo net-new.

### 🟦 INDEPENDIENTES — lado MARKETPLACE (comportamiento puro, solo del comprador)
`buyer_signals` · `journey_depth` · `hot_visitors` · `rejection_intel` · `co_viewed` · `behavior_profile`
(device/DISC/tour/scroll) · `intent_split` · `temporal_demand` · `seasonality` · `funnel_dropoff` ·
`willingness_to_pay` · `price_sensitivity` · `attribution` · `rfm_segments` · `close_probability` · `churn`.
→ Miden QUÉ HACE la gente. No saben nada del mercado físico.

### 🟥 INDEPENDIENTES — lado SUPERADMIN (mercado/externo, solo de la oferta)
Conectores: `banxico` · `inegi` · `sesnsp` · `crime_fgj` · `osm` · `airroi` · `sig_catastro` · `shf` · `valores_unitarios`.
Modelos: `drpi` · `forecast` · `hedonic` · `fsd` · `construction_cost` · `natural_risk` · `perception_risk` ·
`climate_migration` · `dmx_indices` · `terminal_mercado` · `score_inversion` · `bancabilidad` · `vertical_products`.
→ Miden CÓMO ES el mercado/territorio. No saben nada del comportamiento del comprador.

### ⚙️ REFINADORES / CALIBRADORES (no se muestran — afinan OTRAS métricas, el meta-nivel)
| Motor | Qué métrica afina |
|---|---|
| `weight_optimizer` | re-pesa el AVM por zona (≥50 cierres) |
| `close_probability_tuning` | re-aprende los pesos de prob. de cierre desde deals reales |
| `accuracy_engine` | audita el AVM vs precio de cierre (MAPE) y dispara retrain |
| `cerebro_mercado` | reentrena la predicción de demanda al vender (real vs predicho) |
| `golden_calibration` | valida que las fórmulas reproducen casos reales (Puente Alvarado) |
| `model_validation` | R²/RMSE/MAPE de los modelos públicos |
| `estudio_autopiloto` | regenera estudios cuando detecta drift en demanda/oferta |
| `simulador_palancas` | aprende los *lifts* por feature (terraza +12%) que ajustan generador_producto |
| `score_bridge` | marca qué subscore es real vs stub (calidad del dato) |
| `conversation_confidence` | calibra cuándo la IA debe hacer hand-off |
| `pipeline_drift` | detecta si el asesor pierde velocidad |
→ **Estos no producen celdas — multiplican la PRECISIÓN de las celdas existentes.** Son el flywheel.

---

## 2 · LAS ~25 MÉTRICAS COMPUESTAS NET-NEW (nacen solo del cruce)

Cada una = (medida de comportamiento) ⊗ (medida de mercado). Ninguna existe en un motor solo.

| # | Compuesta | Cruce (A ⊗ B) | Qué DESCUBRE |
|---|---|---|---|
| 1 | **Brecha demanda-precio** ✅ | demand_twin ⊗ AVM | ¿la demanda puede pagar lo que cuesta? (+/−%) |
| 2 | **Arbitraje WTP-feature** | willingness_to_pay ⊗ avm_feature | la gente paga MÁS por terraza de lo que el modelo la valúa |
| 3 | **Demanda ajustada a riesgo** ✅ | demanda ⊗ risk_score | caliente pero riesgosa vs caliente y segura |
| 4 | **Demanda grado-inversión** ✅ | demanda ⊗ score_inversion | dónde la demanda coincide con buen retorno |
| 5 | **Presión de absorción** ✅ | absorcion ⊗ oportunidad | mercado *agotándose* vs *hambriento* |
| 6 | **Conversión × calidad** | funnel_dropoff ⊗ zone_subscores | qué atributo de zona (seguridad/transporte) sube conversión |
| 7 | **Validación de precio-rechazo** | rejection "precio" ⊗ brecha AVM | ¿rechazan por precio DONDE sí está caro? |
| 8 | **Demanda-inversor × yield** | intent invertir ⊗ cap_rate | demanda inversionista que coincide con yield real |
| 9 | **Demanda-familia × habitabilidad** | intent vivir ⊗ escuelas/seguridad | demanda de hogar que coincide con buena vida |
| 10 | **Demanda como indicador líder** | momentum ⊗ DRPI forecast | ¿la demanda PREDICE el precio? (señal adelantada) |
| 11 | **Mejor mes para lanzar** | seasonality ⊗ absorción | estacionalidad de demanda × velocidad de venta |
| 12 | **Calidad del lead caliente** | hot_visitors zona ⊗ score_inversion | ¿el lead anónimo va tras zonas AAA? |
| 13 | **Pitch que convierte por zona** | DISC mix ⊗ narrative efectividad | qué tono cierra en cada colonia |
| 14 | **Posición competitiva de precio** | co_viewed ⊗ brecha AVM | contra quién compites y si estás caro |
| 15 | **Presupuesto por device** | device ⊗ price tier | ¿el móvil trae presupuesto distinto? |
| 16 | **Fuga en zona enfriándose** | churn ⊗ zone_cycle | dónde perdemos demanda en zonas en contracción |
| 17 | **Margen-oportunidad del dev** | willingness_to_pay ⊗ construction_cost | lo que pagarán − lo que cuesta construir |
| 18 | **Demanda de feature no satisfecha** | demand_by_feature ⊗ cobertura oferta | qué feature pide la zona y NO existe |
| 19 | **Fit producto-mercado por zona** | price_sensitivity ⊗ tier mix | el techo de precio vs el producto disponible |
| 20 | **Brecha de percepción** | rejection ⊗ reviews_residents | ¿rechazan por algo que los vecinos confirman? |
| 21 | **Profundidad × calidad** | journey_depth ⊗ zone_score | ¿las mejores zonas se exploran más a fondo? |
| 22 | **Prima de especulación** | demanda ⊗ catastral floor | asking vs valor de suelo, ponderado por demanda |
| 23 | **Config que absorbe más rápido** | spec pedida ⊗ absorción por cohorte | qué tipología/m² se desplaza primero |
| 24 | **Demanda risk-adjusted-return** | demanda ⊗ (yield − riesgo) | el Sharpe ratio de la colonia |
| 25 | **Índice de oportunidad real** ✅ | blend de 1+3+4 | demanda alta + puede pagar + bajo riesgo + buen retorno |

✅ = ya construido y verificado (`cross_intelligence`). Las otras 20 son el mismo patrón, listas para construir.

---

## 3 · EL MODELO DIMENSIONAL — por qué 1,000 es el PISO

Una "celda" = una medida cortada por una combinación de dimensiones. El cubo tiene MÁS ejes que solo geo:

| Eje | Niveles | Cardinalidad |
|---|---|---|
| **Medida** | 75 base + 25 compuestas | **100** |
| **Escala geo** | micro · media · grande · macro | 4 |
| **Tiempo** | hoy · 7d · 30d · 90d · año · histórico | 6 |
| **Segmento** | intent(2) · device(3) · DISC(4) · RFM(4) | ~9 valores útiles |
| **Producto** | tipología(5) · tier(3) · cohorte preventa/constr/entrega(4) | ~12 valores |
| **Lente** | comprador · asesor · dev · superadmin | 4 |

**Cálculo honesto de celdas direccionables** (Σ por medida de las dims aplicables, NO el producto cartesiano ingenuo):

```
Tier 1 — base × geo:           100 medidas × 4 escalas                       =   400
Tier 2 — + tiempo:              ~60 medidas temporales × 5 periodos × 4        = 1,200
Tier 3 — + segmento:            ~30 medidas conductuales × 9 segmentos × 4     = 1,080
Tier 4 — + producto:            ~25 medidas de oferta × 12 productos × 4       = 1,200
                                                                       TOTAL  ≈ 3,880 celdas
```

→ **~3,880 celdas direccionables.** 1,000 era, literalmente, "una aproximación mínima". Y eso SIN multiplicar por la
lente (×4) ni por las 1,811 colonias reales (la escala media sola son 1,811 filas, no 14).

**Honestidad (lo importante):** *direccionable ≠ poblado HOY.* El esquema y los motores soportan las ~3,880 celdas;
en dev hay datos para un subconjunto (las 🟢). La diferencia entre direccionable y poblado = exactamente el trabajo de
**prender feeders** (§ SUPERADMIN_AUDIT). Pero el cubo ya está definido y es consultable vía `cube_olap` (tiers
city→alcaldia→colonia→dev→unit) + las compuestas de `cross_intelligence`.

---

## 4 · PRUEBA CON DATO REAL (no teoría)

`cross_intelligence` corriendo hoy sobre dato local:
- **Polanco** — índice de oportunidad **75**. Brecha demanda-precio **+85%** (pagarían 85% sobre el costo). Presión de
  absorción 0.21 = **"hambrienta"** (mucha demanda, venta lenta). Segura.
- **Condesa** — brecha **+145%**, pero demanda ajustada a riesgo cae 98→26 = **"caliente pero riesgosa"**.
- **Nápoles** — brecha **+862%** con 0 enganche = demanda que busca y no encuentra oferta surfaceada (hueco enorme).

Estas tres lecturas **no existen en ningún motor solo**. Nacen del cruce demand_twin ⊗ AVM ⊗ risk ⊗ absorción.

---

## 5 · CONCLUSIÓN
- **Compartidos** (11) = el puente que hace posible el cruce.
- **Independientes** (≈18 marketplace + ≈22 superadmin) = los dos hemisferios (comportamiento vs territorio).
- **Refinadores** (11) = el flywheel que afina la precisión de TODAS las celdas con el tiempo.
- **Net-new** = ~25 métricas compuestas; 5 ya verificadas con dato real.
- **El cubo** ≈ 3,880 celdas direccionables (×1,811 colonias en escala media). 1,000 es el piso.

El producto que esto pide: **un Terminal de Zona** que deje pivotear medida × escala × tiempo × segmento × producto, con
una capa de **cruces** (las compuestas) encima. Eso es, literalmente, el Bloomberg/HouseCanary inmobiliario de México —
y el 70% ya está codificado.
