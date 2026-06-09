# DMX · Autopiloto de Underwriting + Modelo del Mundo (spec canónico)

**Fecha:** 2026-06-09 · **Estado:** spec aprobado para construir por fases · **Origen:** análisis profundo del Memorándum de Inversión real de QuieroCasa (Puente Alvarado 37) + 7 investigaciones de mejores prácticas documentadas (con fuentes).

Slot en el North Star: este doc aterriza **"el autopiloto del desarrollador"** + **"Modelo del Mundo DMX"** + **"terminal vendible Bloomberg CDMX"** (ver `DMX_NORTH_STAR_AI.md`, `DEV_VALUE_THESIS.md`, `CEREBRO_DMX_ROADMAP.md`). Reusa el Cerebro E0-E6 y los motores ya construidos; NO es IA nueva, es ORQUESTACIÓN + capa de datos.

---

## 0. La idea grande (una línea)
El memorándum de inversión NO es un documento: son 8 "calculadoras" que hoy se arman a mano (3 analistas, semanas) con **supuestos inventados**. El upgrade son **dos capas que se alimentan entre sí**:
1. **Autopiloto de Underwriting** — dirección + idea de producto → memorándum completo en minutos.
2. **Modelo del Mundo DMX (Índices)** — cada proyecto deja su dato real → índices vivos por colonia que NADIE tiene.
**Flywheel:** más proyectos → mejores índices → cada número deja de ser supuesto y se vuelve real → más devs → más dato. Moat no-copiable (no se scrapea: vive en el CRM de cada quien).

---

## 1. Las 8 áreas: método REAL (zoom-in) + upgrade + dato único

Cada área = una calculadora del autopiloto. La fórmula real está documentada (fuentes abajo). Regla: **no inventar matemáticas; usar el estándar de industria.**

| # | Área | Método real (fórmula) | Dato único DMX (el moat) |
|---|---|---|---|
| 1 | **Valor Residual del Suelo** ("¿cuánto pago por el terreno?") | `Máx a pagar = Ventas − Costos desarrollo − Utilidad requerida` (circular, se itera). Incidencia del suelo = 25–45% del valor de venta. | AVM **del suelo según su potencial construible**, por colonia. Nadie cruza norma + catastro + AVM. |
| 2 | **COS/CUS / potencial** | `COS = 1 − %área libre`; `Desplante = COS × terreno`; `CUS ≈ COS × niveles`; `Sup. máx construible SNB = CUS × terreno`; # viviendas amarrado por la **densidad** (literal A=1/33m², M=1/50, B=1/100…). BNB (bajo banqueta) NO computa en CUS. | Zonificación CDMX digitalizada a nivel predio. |
| 3 | **Norma 3 / upzoning** | Fusionar 2+ predios (uno habitacional) → elegir la zonificación de mayor potencial → más m² → más valor. El delta ($140M→$165M) = Δ valor residual − plusvalía a pagar. | Detector de fusiones rentables predio×colindantes. |
| 4 | **Estudio de Mercado (NSE + competidores)** | NSE AMAI: 6 variables, 300 pts (A/B 202+, C+ 168-201, C 141-167, C- 116-140, D+ 95-115, D 48-94, E 0-47). **AMAI publica NSE por manzana/AGEB sobre Censo INEGI 2020 = PÚBLICO/GRATIS.** Set por isócrona (no círculo) + mismo NSE/tipología/ticket. Tabla: stock, vendidas, velocidad %, $/m² ajustado por tamaño. | **Tensión oferta-demanda por colonia×NSE en vivo** (oferta conectada × demanda propia × NSE oficial). |
| 5 | **Absorción / velocidad** | Absorción = uds/mes; velocidad = %/mes; meses para agotar = 1/velocidad. Curva NO lineal (rampa→pico→cola). Etapa 2 ≈ 2× absorción / 1.7× velocidad (escasez+anchoring+momentum). **Error #1 de underwriting: optimismo en el timeline.** | Curva de absorción real por `colonia×tipología×ticket`. El 1.7x ni los papers lo publican → seríamos los primeros con respaldo. |
| 6 | **Producto óptimo + áreas (HBU)** | Highest&Best Use: gana el producto de mayor valor residual entre los que la norma permite. Palanca silenciosa: **eficiencia** = `área vendible ÷ construida` (vivienda 80–85%, NO 67%). `costo/m² vendible = costo/m² ÷ eficiencia`. | Optimizador de mezcla calibrado con demanda real. |
| 7 | **Presupuesto de obra (paramétrico + curva S)** | $/m² por especialidad: superestructura 25–34% (la mayor), acabados 12–25% (sube con categoría). Media ~$22,500/m². Imprevistos 2.5–5%. Curva S = arranque lento → centro con 50–70% del costo → cola; es a la vez la curva de flujo. **CDMX inflaciona MENOS que nacional (+3.27% vs +4.84%).** | Índice de inflación de obra DMX por colonia×especialidad (INPP-INEGI + datos propios). |
| 8 | **Gestión normativa** | ~20 meses (real 18–30). Cuello de botella = **Impacto Urbano (EIU)** (integra SACMEX+SEMOVI+Protección Civil). **Obra detenida cuesta 7–10% del costo/mes.** Derechos manifestación habitacional $597.50 + $56.88/m². Ventanilla Única 2025 promete 8 meses → ser el software que la ordene. | **Tiempos REALES por trámite × alcaldía** (los PDFs oficiales mienten; nadie lo publica). |
| 9 | **Crédito puente + modelo financiero** | LTV 50–70% (banca topa 65%); tasa = TIIE+spread (real 2–4.5%; +2% = best case; TIIE fondeo ~6.69% jun-26 → all-in ~8.7%). **Cada +1% spread ≈ −1.5 a −3 pts de TIR sobre equity.** Driver #1 de riesgo = velocidad de individualización. Comité pide: **TIR apalancada+desapalancada, múltiplo, peak equity** (`MAX del saldo de capital acumulado`). **MX: preventa = fuente de capital** que baja el peak equity. | **Score de Bancabilidad** con desempeño real (absorción+individualización+AVM) — la banca NO lo puede hacer. |

Benchmarks de cierre (industria): margen antes de impuestos 15–25%; TIR MX >20%; múltiplo 1.5–2x; comisión ventas 3–5%; publicidad 1–1.5%; directos 60–70% del costo. (Punto de partida, NO ley — ver Doctrina §5.)

---

## 2. El último upgrade que cierra TODOS los ciclos
**Gemelo Digital del Proyecto + Predicción ↔ Realidad.**
- Cada proyecto nace como predicción (el memo) y queda **vivo**: entran ventas/costos/permisos reales, el gemelo se actualiza y **cada número predicho se confronta con lo que pasó**.
- **Para el dev:** cockpit vivo ("predijiste 6/mes, vas en 4 → la jugada de hoy es…") = Cerebro E4 "el espejo" aplicado al dinero.
- **Para el modelo:** cada confrontación **calibra los índices** → la data se vuelve correcta porque se mide contra la realidad.
- **Outcome espectacular — "Dónde Construir" en reversa:** la plataforma deja de esperar al dev y le dice *"compra AQUÍ: demanda C+ insatisfecha, poco inventario, norma permite 60 deptos, suelo barato vs potencial → TIR ~28%"*. Moonshot del North Star.

---

## 3. Granularidad (el átomo = **unidad-mes**)
Se captura a nivel unidad-mes; se agrega a todos los niveles de arriba.

| Nivel | Guarda | Para quién |
|---|---|---|
| **Unidad × mes** (átomo) | tipología, m², piso, vista, precio, estado, fecha venta, perfil comprador, lead | Dev (privado) |
| **Proyecto** | absorción, costo real, TIR viva, avance de gestión | Dev |
| **Desarrollador** | track record, bancabilidad | Dev + banca |
| **Colonia / submercado** | índice agregado | Producto |
| **Tipología × Colonia × Ticket** | la celda del Modelo del Mundo (analítica más valiosa) | El moat |
| **Alcaldía / Ciudad** | el mapa | Superadmin / gobierno |

Cada número lleva **etiqueta de origen** (supuesto / dato / cálculo / benchmark) — ver Doctrina §5.

---

## 4. Integración con Superadmin (4 capas + productos)

| Capa | Qué es | Quién la ve |
|---|---|---|
| **1 · Dato crudo del proyecto** | unidad-mes, leads, costos, absorción de UN dev | **Solo ese dev** (candado cross-org, red-team 16/16) |
| **2 · Superadmin (gobierno)** | TODOS los proyectos crudos, para construir modelo + auditar | **Solo superadmin** |
| **3 · Motor de agregación** | crudo → índices **k-anónimos** por colonia/tipología | automático |
| **4 · Productos** | índices como benchmark (al dev) + terminal/API (vendible) | Dev (incluido) + externos (pago) |

**Quién ve qué:** el dev ve SU proyecto en detalle + el mercado **anónimo** (percentiles), nunca el dato desnudo de otro. Superadmin ve cada proyecto con su granularidad (gobierno/auditoría/calidad) + los índices que monetiza.

**Productos vendibles de la data:**
| Producto | Cliente |
|---|---|
| Autopiloto + Gemelo Digital | Dev (suscripción) |
| **Terminal "Bloomberg CDMX"** (absorción, costos, tiempos gestión, valor suelo, tensión oferta-demanda por colonia) | Otros devs, fondos, valuadores, gobierno (API/premium · lo opera superadmin) |
| **Score de Bancabilidad** | Bancos/SOFOMes/fondos (pre-DD + success fee) |
| Estudio de Mercado Vivo (PDF fechado hoy) | Dev externo (reemplaza el de $40-80k) |
| Índice de inflación de obra por colonia | Devs, bancos, constructoras |

**Gobierno (3 candados):**
1. **Aislamiento estricto** del dato crudo (ya endurecido).
2. **k-anonimato:** un índice NO se publica con menos de **N proyectos** (ej. 3). Nunca un benchmark que delate a un competidor.
3. **Trato del flywheel (consentimiento, LFPDPPP):** el dev acepta que su dato agregado+anónimo alimente los índices a cambio de los benchmarks. Win-win, en términos.

---

## 5. Doctrina de Datos de Underwriting (cómo NO repetir el error del dato mal calculado)
Aprendizaje de los problemas pasados (AVM/IE con dato falso). Ya tenemos el músculo (bandas honestas `metric_normalizer`, calibración Cerebro E4 `coach.py`, umbrales de confianza `comercial_value_model` n≥8/R²≥0.5, "sin dato aún", disciplina verify-don't-trust). Se formaliza en 7 reglas **inviolables**:

1. **Separar SUPUESTO ≠ DATO ≠ CÁLCULO ≠ BENCHMARK.** Cada número lleva etiqueta de origen. Nunca mezclar inventado con observado.
2. **Toda fórmula con fuente citada + versionada.** Nada improvisado; usar la metodología documentada de §1.
3. **Predicción ↔ Realidad (back-test continuo).** No se confía un número hasta confrontarlo con lo que pasó; si predijo 6/mes y vendió 4, se calibra. (Cerebro E4.)
4. **Bandas honestas + N, nunca falsa precisión.** No "$22,347/m²"; sí "$21k–$24k (P25–P75, 4 proyectos)". Siempre decir cuántos proyectos respaldan.
5. **"Sin dato aún" de verdad.** Pocos proyectos en la celda → dar el de la alcaldía y decirlo; jamás inventar.
6. **Calibración contra el golden case (§6).** Si el motor no reproduce el memo real dentro de margen, la fórmula está mal.
7. **Prender al final, en silencio primero (shadow mode).** Los índices se construyen y miden su error antes de venderse. No se vende "absorción por colonia" sin N suficiente y error medido.

Etiqueta de **madurez** por índice: `experimental` (N chico) → `validado` (back-test ok) → `robusto` (N grande + error bajo). Solo `validado`+ se publican/venden.

---

## 6. Golden Case — Puente Alvarado 37 (números reales para calibrar)
Caso real verificado por un dev serio (QuieroCasa, sept-2025). El motor, alimentado con estos inputs, **debe reproducir estos outputs dentro de margen**. Si no cuadra → fórmula mal.

**Inputs:** terreno 2,835.62 m² · $140M ($49,372/m²) · 252 viviendas · 2 etapas · 10 niveles · 57.76 m² prom · residencial/media · zonificación HM 10/28/340 → HM 10/20/Z (Norma 3) · construcción 22,076 m² · $13,123/m² SNB+BNB · contingencia 4.94% · crédito 60% LTV, TIIE+2%, comisión 0.5%, plazo 43m.

**Outputs a reproducir:**
| Métrica | Valor real |
|---|---|
| Ingresos por ventas | $970.0 mdp |
| Costo total | $791.9 mdp |
| Precio inicial / promedio | $3,223,227 / $3,849,212 ($55,800 / $66,637 por m²) |
| Absorción / velocidad | 6.0 uds/mes / 2.4% |
| Utilidad antes de impuestos | $178.1 mdp |
| **Margen antes de impuestos** | **18.4%** |
| **TIR apalancada / desapalancada** | **23.9% / 17.1%** |
| Múltiplo capital apal. / desapal. | 1.85x / 1.45x |
| Capital requerido apalancado | $209.1 mdp |
| Crédito puente | $487.4 mdp |
| Duración proyecto | 63 meses (gestión 20 + construcción 35 + ventas 42 + escrituración 22) |
| CUS S.N.M.B. / máximo / rendimiento | 18,894 / 22,685 / 67.41% |
| Mezcla | 2R1B 51.55m² (99u, 39%) · 2R2B 56.82m² (72u, 29%) · 3R2B 66/67m² (81u, 32%) |
| Estructura costo (% ventas) | Costo ventas 59.1% (tierra 14.4% · construcción 29.9% · inflación 5% · permisos 6%) · Gastos op 17.1% (com. ventas 6% · com. desarrollo 15% · indirectos 4.5% · publicidad 1.5%) · Gastos financieros 5.4% |

**Sensibilidades reales (para validar el motor de escenarios):** cada mes de construcción Fase 1 = −80 pb TIR · cada $250/m² de costo = −99 pb · cada 0.8 uds/mes menos = −64 pb · cada +1% inflación año 1 = −53 pb · cada mes de atraso normativo sube costo de terreno y baja TIR.

---

## 7. Qué ya tenemos vs net-new (no partimos de cero)
| Calculadora | Ya en repo (latente) | Net-new |
|---|---|---|
| Valor suelo / catastro | ING.1 (`sig_catastro_engine`), AVM, `comercial_value_model` | fusionar con COS/CUS por predio |
| Mercado / competidores | Battle Card, Competidores, IE | capa NSE AMAI (pública) + estudio vivo |
| Absorción / aprendizaje | Cerebro E0-E6 (`coach.py`), Live Pulse | índice de absorción cross-dev |
| Cash flow / TIR | `dev_batch8` (cash flow) | proforma institucional + peak equity + preventa-como-fuente |
| What-if / sensibilidad | W4.4D | tablas 2D + tornado calibrado |
| Sitio / dónde construir | `dev_batch7` (site selection) | optimizador HBU + reverse land-sourcing |
| Gestión normativa | — | módulo nuevo (el más grande) |
| Crédito puente | — | estructurador + Score de Bancabilidad + marketplace |
| Bandas honestas / calibración | `metric_normalizer`, Cerebro E4, umbrales `comercial_value_model` | la Doctrina §5 formalizada |

~60% de los motores existen y están latentes. El trabajo es ORQUESTAR + capa de Índices + Doctrina.

---

## 8. Secuencia de construcción (por fases · gate por fase)
| Fase | Construye | Por qué primero |
|---|---|---|
| **F1 · Motor de Valor Residual** | dirección → COS/CUS + unidades + AVM → "oferta máxima por el lote" | reusa lo existente · "wow" inmediato · 1ª decisión del dev |
| **F2 · Generador de Memorándum** | junta las 8 calculadoras en expediente de 1 clic | prueba el autopiloto · vendible · ahorra semanas |
| **F3 · Índices DMX (el moat)** | absorción + costo obra + tiempos gestión, por colonia (shadow mode → validado) | el dato que nadie tiene · terminal vendible |
| **F4 · Score de Bancabilidad + Marketplace crédito** | precia riesgo con desempeño real | abre fintech · cierra ciclo dev↔capital |
| **(transversal)** | Gemelo Digital + Predicción↔Realidad + Doctrina §5 | el motor que hace la data correcta y vende |

Regla de oro de toda fase: **cumplir la Doctrina §5** (etiqueta de origen, fórmula citada, banda+N, golden-case, shadow mode). Cada índice se prende solo cuando su back-test mide error aceptable.

---

## 9. Fuentes (metodología documentada, verificada)
- **Underwriting financiero:** A.CRE, REFM/Linneman cap.10, BIWS (draws/curva S), PropertyMetrics (yield/spread), GERPRO/Tinsa MX (% costos), WallStreetPrep (IRR/peak equity).
- **Valor residual + COS/CUS:** SEDUVI (Normas Generales de Ordenación, COS/CUS, Norma 3), PAOT (Norma 11 densidad), Tinsa MX (literales), Appraisal Institute (HBU), SIGCDMX/CUZUS.
- **Absorción:** HUD SOMA (hitos 3/6/9/12m), Softec (diccionario/DIME), 4S REDI, Zonda/Zelman (elasticidad), Redfin (phased release).
- **Estudio de mercado MX:** AMAI (Regla NSE 2022, NSE por AGEB sobre Censo INEGI 2020), TINSA MX (campo trimestral), 4S REDI (130k unidades), INEGI.
- **Crédito puente:** BBVA/BIM/Banorte/SHF (LTV/tasa/draws), Banxico (TIIE fondeo ~6.69% 09-jun-2026), Fovissste (individual).
- **Gestión normativa:** SEDUVI/SEDEMA/SACMEX/INAH (trámites/plazos), NADF-001-RNAT-2015 (arbolado), Código Fiscal CDMX (derechos), Ventanilla Única 2025 (Expansión/CMIC).
- **Presupuesto construcción:** Varela Ing. de Costos (% por partida/$/m² por clase), CEICO-CMIC/INEGI (inflación construcción CDMX 3.27%), Opus/Neodata/BIMSA.

**Caveats (honestidad):** los % de costos MX son de consultoría, no norma (punto de partida). El 1.7x de etapa 2 NO está peer-reviewed (lo validaremos con dato propio). La literal de densidad se verifica contra el PDDU vigente por alcaldía. TINSA/Softec exactos son de pago. Todo esto refuerza la Doctrina §5: nada se da por verdad sin back-test.
