# DMX · Autopiloto de Underwriting + Modelo del Mundo + Utilidad de Datos (spec canónico v2)

**Fecha:** 2026-06-09 (v2) · **Estado:** spec aprobado para construir por fases.
**Origen:** análisis del Memorándum de Inversión real de QuieroCasa (Puente Alvarado 37) + 7 investigaciones de mejores prácticas con fuentes + 8 plantillas de una metodología real de desarrollo (módulos 3/4/8: análisis de tierra, flujo/WBS, Neodata, plan de negocios, generador, licitación, checklist de ciclo de vida).
Slot en el North Star: aterriza "el autopiloto del desarrollador" + "Modelo del Mundo DMX" + "terminal vendible". Reusa Cerebro E0-E6 y motores ya construidos. NO es IA nueva: es ORQUESTACIÓN + capa de datos.

> **Identidad de DMX (línea inviolable, ruling founder 2026-06-09):** DMX es una **UTILIDAD DE DATOS E INFRAESTRUCTURA** (como Bloomberg, el Buró de Crédito o un MLS). **NO hace funciones de terceros: no presta, no asegura, no escritura, no es intermediario financiero.** Solo (1) vende su data como producto y (2) da infraestructura para que los actores (bancos, aseguradoras, notarios, fondos, contratistas, gobierno) la usen y hagan SU trabajo. El moat es el dato único, no una función regulada. Cero licencia, cero balance, cero riesgo de crédito.

---

## 0. La idea grande (3 capas)
El memorándum de inversión NO es un documento: son ~8 calculadoras que hoy se arman a mano (3 analistas, semanas) en **8 Excels separados que nunca se hablan entre sí** — el paramétrico del memo y los precios reales de la licitación viven en archivos distintos y nunca se comparan. El upgrade:
1. **Autopiloto de Underwriting** — dirección + idea de producto → memorándum completo en minutos.
2. **Gemelo Digital + Modelo del Mundo** — cada proyecto deja su dato real → índices vivos por colonia que nadie tiene.
3. **Utilidad de Datos e Infraestructura** — vender ese dato + dar el riel para que los actores se conecten (sin hacer su función).

**Flywheel:** más proyectos → mejores índices → cada número deja de ser supuesto y se vuelve real → más actores se conectan y pagan por el dato → más dato. Moat no-copiable (no se scrapea: vive en el CRM de cada quien y en la cadena completa).

---

## 1. Las calculadoras: método REAL (zoom-in) + dato único
Cada fórmula está documentada (validada contra el memo real + las 8 plantillas + 7 investigaciones). Regla: **no inventar matemáticas; usar el estándar de industria.**

| # | Área | Método real (fórmula) | Dato único DMX (moat) |
|---|---|---|---|
| 1 | **Valor Residual del Suelo** | `Máx a pagar = Ventas − Costos − Utilidad requerida` (circular). Incidencia 25–45% del valor de venta. | AVM **del suelo según su potencial construible**, por colonia. |
| 2 | **COS/CUS / potencial** | `COS = 1 − %área libre`; `Sup. máx SNB = CUS × terreno`; # viviendas por **densidad** (A=1/33m², M=1/50, B=1/100). BNB no computa. | Zonificación CDMX digitalizada por predio. |
| 3 | **Norma 3 / upzoning** | Fusionar predios → elegir zonificación de mayor potencial. Δ = Δ valor residual − plusvalía. | Detector de fusiones rentables. |
| 4 | **Estudio de Mercado (NSE+competidores)** | NSE AMAI: 6 variables, 300 pts (A/B 202+…E 0-47). **AMAI publica NSE por manzana/AGEB sobre Censo INEGI 2020 = PÚBLICO/GRATIS.** Set por isócrona. Tabla: stock/vendidas/velocidad %/$ por m² ajustado. | Tensión oferta-demanda por colonia×NSE en vivo. |
| 5 | **Absorción / velocidad** | Absorción = uds/mes; velocidad = %/mes; meses para agotar = 1/velocidad. Curva rampa→pico→cola. Etapa 2 ≈ 2× absorción / 1.7× velocidad. **Error #1: optimismo en el timeline.** | Curva de absorción real por colonia×tipología×ticket. |
| 6 | **Generador de Producto (HBU + áreas)** | (del "generador OFICIAL" real) `terreno × CUS → m² construibles`; `cajones = viviendas × 2.3` (30 m²/cajón); `factor construcción/rentable = 1.15` (≈87% eficiencia); mezcla por tipo con $/m² y % de distribución. `costo/m² vendible = costo/m² ÷ eficiencia`. | Optimizador de mezcla calibrado con demanda real. |
| 7 | **Paramétrico de Obra (+ curva S)** | $/m² por partida (Neodata/ConstruBASE real, edificio económico $10,878/m²): estructura ~22-30% (la mayor), acabados ~10-25% (sube con categoría), cimentación 9%, instalaciones 13%. Imprevistos 2.5–5%. Curva S = centro con 50-70% del costo; es a la vez la curva de flujo (del WBS-Erogación). **CDMX inflaciona MENOS que nacional (+3.27% vs +4.84%).** | Índice de obra por colonia×partida (vivo). |
| 8 | **Gestión normativa** | ~20 meses (real 18–30). Cuello = **Impacto Urbano (EIU)** (integra SACMEX+SEMOVI+Prot. Civil). **Obra detenida = 7–10% del costo/mes.** Derechos manifestación habitacional $597.50 + $56.88/m². | Tiempos reales por trámite × alcaldía. |
| 9 | **Crédito puente + modelo financiero** | LTV 50–70% (banca topa 65%, las plantillas usan 55%); tasa = TIIE+spread (real 2–4.5%; TIIE fondeo ~6.69% jun-26 → all-in ~8.7%). Estructura de pago **10/10/80 o 5/10/85** (enganche/mensualidades/escrituración). **Cada +1% spread ≈ −1.5 a −3 pts TIR sobre equity.** Comité pide: TIR apal/desapal, múltiplo, **peak equity** (`MAX del saldo de capital acumulado`). **MX: preventa = fuente de capital** que baja el peak equity. | Score de Bancabilidad (desempeño real). |

% de gastos validados (memo + plantillas, coinciden): comisión ventas 3–6% · publicidad 1.5–2% · developer fee 10% · gerencia de obra 6% · gestoría 2% · legal 1.5% · imprevistos 2% · costo financiero ~13% anual. Margen MX 15–25%, TIR >20%, múltiplo 1.5–2x. (Punto de partida, NO ley — ver Doctrina §9.)

---

## 2. El ciclo de vida completo = el Gemelo Digital (16 etapas)
Del checklist real (módulo 08). Cada etapa es un estado del proyecto en DMX:
`1 Tierra → 2 Anteproyecto (volumetrías/rentabilidad) → 3 Plan de Negocios → 4 Formalización de tierra (compra/fideicomiso) → 5 Proyecto Arquitectónico → 6 Estudios/Factibilidades/Vo.Bo. → 7 Ingeniería Estructural F1 → 8 Licencias y Permisos → 9 Comercialización (preventas) → 10 Proyecto Ejecutivo (presupuestos+programa) → 11 Contratación de Servicios → 12 Construcción → 13 Recepción de Obra → 14 Entrega y Escrituración (régimen condominio) → 15 Operación (admin/mantenimiento/garantías/renta).`
Cada proyecto es un **gemelo digital**: nace como predicción (el memo) y se actualiza con la realidad en cada etapa.

---

## 3. Las 3 piezas NUEVAS de las plantillas (cierran ciclos que no teníamos)
| Pieza nueva | Qué la dispara | Dato único / por qué importa |
|---|---|---|
| **Licitación → Marketplace de Contratistas + Índice de Obra** | Los precios unitarios por partida (códigos tipo ALB-MIL-xxx) del proceso de licitación | **Precio real de obra por partida × ciudad × fecha** → dato VIVO que ConstruBASE/Neodata (estático/trimestral/genérico) no tiene. DMX es el **venue** (no construye). |
| **Reconciliación Paramétrico ↔ Ejecutivo ↔ Real** | Los 3 niveles de presupuesto que revelan las plantillas (anteproyecto / licitación / gasto real) viven en archivos distintos y nunca se comparan | "Tu paramétrico se desvió 12% del real" → el modelo de costo **se auto-calibra cada proyecto**. Resuelve el dolor #1 del gremio (desviaciones de costo). |
| **Operación / Post-venta (la cola)** | La etapa 15 del ciclo (admin de condominio, renta, mantenimiento, garantías, reventa) | El edificio **sigue generando dato** después de vendido → alimenta AVM, reventa y renta. El inmueble nunca sale de DMX. |

---

## 4. El último upgrade: los 4 portales conectados + la Utilidad de Datos
**El cierre de ciclo de toda la plataforma** (el dato fluye de la operación al Modelo del Mundo, y el Modelo del Mundo regresa como inteligencia a cada portal):
```
DEV underwrite (con los índices) → DMX da el riel para que el BANCO que el dev elija evalúe (con su consentimiento) y preste
   → ASESOR vende (casamentera) → COMPRADOR compra · su demanda alimenta los índices
   → la operación deja dato → SUPERADMIN opera la terminal y los índices · los ACTORES (bancos/aseguradoras/notarios/fondos/contratistas/gobierno) se conectan a consumir el dato
```
**DMX nunca presta, asegura ni escritura.** Vende el dato y da el riel. Lo que rompe el mercado es **el dato que solo DMX tiene**, no una función regulada.

### Qué SÍ hacemos / qué NO (la línea)
| Modo permitido | Ejemplo | DMX hace la función del tercero? |
|---|---|---|
| **Vender data** | Índices (obra/absorción/gestión), terminal "Bloomberg CDMX", Score de Bancabilidad, grafo del comprador, estudio de mercado vivo, AVM/NSE por colonia | NO — solo data |
| **Dar infraestructura** | El dev comparte (con consentimiento) su expediente con el banco/contratista/aseguradora que él elige, vía DMX; marketplace de contratistas (venue) | NO — solo el riel; el actor hace su trabajo |
| **SaaS** | El autopiloto + el OS de los 4 portales | NO — solo software |
| ❌ NO permitido | prestar, originar crédito como bróker, asegurar, escriturar, custodiar dinero de clientes, iBuying con balance | — |

---

## 5. Los 3 Índices = el moat imposible de copiar
Como DMX vive en toda la cadena (única plataforma que lo hace), genera 3 índices vivos que nadie cruza:
1. **Índice de Obra DMX** (de la licitación real) — precio por partida, vivo. *Mata a ConstruBASE/Neodata (estático).*
2. **Índice de Absorción DMX** (de las ventas reales) — velocidad por colonia, vivo. *Mata el PDF trimestral de TINSA/Softec.*
3. **Índice de Gestión DMX** (de los permisos reales) — tiempos por trámite×alcaldía. *Nadie lo tiene.*
El que tenga los 3 es dueño del mercado de inteligencia. Solo DMX puede, porque es el único que vive en toda la cadena. Neodata solo hace presupuesto; TINSA solo mercado; los bancos solo crédito.

---

## 6. Granularidad (el átomo se expande)
Se captura al átomo y se agrega a todos los niveles de arriba.
- **Átomo:** `unidad-mes` + `transacción` (cada pago/contrato) + `partida-de-obra` (cada concepto de la licitación).
- **Sube a:** proyecto → desarrollador → colonia → **tipología × colonia × ticket** (la celda del Modelo del Mundo) → alcaldía/ciudad.
- Cada número lleva **etiqueta de origen** (supuesto/dato/cálculo/benchmark) — Doctrina §9.

---

## 7. IA / ML / Deep Learning / Agentic (por capa)
- **ML:** los índices (absorción/obra/gestión/AVM) + el Score de Bancabilidad, calibrados por Predicción↔Realidad.
- **Deep Learning:** visión en el predio (satélite→potencial), en la obra (fotos→avance verificado), en planos (auto-extrae áreas/mezcla = el generador desde un PDF) · NLP en escrituras/contratos (DD legal) · embeddings de inmuebles/compradores (la casamentera).
- **Agentic (Cerebro E0-E6):** agentes que hacen el ciclo — underwrite, arman el memo, ordenan la licitación, matchean compradores, preparan el expediente para el actor, operan el post-venta. Un cerebro central multi-tenant, muchos lentes (dev/asesor/comprador/superadmin).
- **Front/Back:** cada pieza con su UI por portal + el motor en el Cerebro central.

---

## 8. Integración Superadmin (5 capas)
| Capa | Qué es | Quién la ve |
|---|---|---|
| 1 · Dato crudo del proyecto | unidad-mes/transacción/partida de UN dev | Solo ese dev (aislado, red-team 16/16) |
| 2 · Superadmin (gobierno) | TODOS los proyectos crudos | Solo superadmin |
| 3 · Agregación k-anónima | crudo → índices (mín. N proyectos por celda) | automático |
| 4 · Productos de data | índices/score/terminal | Dev (benchmark) + externos (pago) |
| 5 · Utilidad de Datos e Infraestructura | vender data + dar riel · NUNCA funciones de terceros | Superadmin lo opera |
**Gobierno:** aislamiento estricto del dato crudo · k-anonimato (un índice no se publica con < N proyectos) · consentimiento (el dev acepta que su dato agregado+anónimo alimente los índices a cambio de los benchmarks — LFPDPPP).

---

## 9. Doctrina de Datos (cómo NO repetir el dato mal calculado) — el cimiento de TODO
Ya tenemos el músculo: bandas honestas (`metric_normalizer`), calibración Cerebro E4 (`coach.py`), umbrales de confianza (`comercial_value_model` n≥8/R²≥0.5), "sin dato aún", disciplina verify-don't-trust. Se formaliza en 7 reglas **inviolables**:
1. **Separar SUPUESTO ≠ DATO ≠ CÁLCULO ≠ BENCHMARK.** Etiqueta de origen en cada número.
2. **Toda fórmula con fuente citada + versionada.** Nada improvisado (usar §1).
3. **Predicción ↔ Realidad (back-test continuo).** No se confía un número hasta confrontarlo con lo que pasó. Aplica en CADA etapa: paramétrico↔ejecutivo↔real, plan↔ventas, cronograma↔permisos, curva S↔avance.
4. **Bandas honestas + N, nunca falsa precisión.** "$21k–$24k (P25–P75, 4 proyectos)", no "$22,347".
5. **"Sin dato aún" de verdad.** Pocos proyectos → dar el de la alcaldía y decirlo.
6. **Calibración contra golden cases (§10).** Si el motor no reproduce el caso real, la fórmula está mal.
7. **Prender al final, en silencio (shadow mode).** Los índices miden su error antes de venderse.
Madurez por índice: `experimental` → `validado` → `robusto`. Solo `validado`+ se publican/venden.

---

## 10. Golden Cases (para calibrar)
- **Puente Alvarado 37 (QuieroCasa):** terreno 2,835 m² · 252 viviendas · ventas $970M · costo $791.9M · **TIR apal 23.9% / desapal 17.1% · margen 18.4% · múltiplo 1.85x · peak/capital $209M · crédito 60% LTV TIIE+2%**. Sensibilidades: mes construcción F1 = −80pb · $250/m² = −99pb · 0.8 uds/mes = −64pb · 1% inflación = −53pb.
- **Plantillas de metodología:** Neodata económico $10,878/m² (estructura 22%, acabados 9.8%) · generador (cajones=viv×2.3, factor 1.15) · % de gastos (developer fee 10%, gerencia 6%, comisión 3.5%, publicidad 2%) · crédito 55% LTV · pago 10/10/80.
El motor, alimentado con los inputs, **debe reproducir estos outputs dentro de margen**. Si no cuadra → fórmula mal.

---

## 11. Principio de UX/UI (ruling founder 2026-06-09) — INVIOLABLE
El frontend **NO** es una cantidad absurda de elementos que confunde. Es **limpio, simple, que enamora, fácil de entender**. Reglas:
1. **Una pantalla por decisión.** El dev mete una dirección y ve "aquí está tu oferta máxima / tu memo / tu cockpit" — no 50 tabs.
2. **Mostrar la RESPUESTA primero, el detalle bajo demanda** (progressive disclosure). El número grande + la banda; el desglose se abre si lo pides.
3. **El dev ve un cockpit, NO un Excel.** Toda la complejidad (las 8 calculadoras, las fórmulas) vive en el MOTOR, invisible. La UI solo muestra la conclusión y la jugada.
4. **Lenguaje humano, cero jerga** (ya es regla DMX). "Tu oferta máxima por este lote es $X", no "valor residual NPV iterado".
5. **Nivel de pulido = Mis Leads asesor** (la vara de diseño ya establecida) · tarjetas con borde+hover (`.dmx-card`) · flujo obvio que alguien que nunca lo vio entiende solo.
6. **Backend rico, frontend pobre en ruido.** El valor está en el motor y el dato; la UI enamora por simple, no por llena.

---

## 12. Qué ya existe vs net-new (no partimos de cero · ~60% latente)

> **Estado REAL del dato SIG (verificado 2026-06-09 · disciplina verify-don't-trust):** tenemos los TUBOS, no el AGUA.
> - `sig_catastro_engine.py` (ING.1): valor de suelo $/m² catastral · capa `predios2022sig_local` (6.8M predios = toda la ciudad). El motor puede jalar CUALQUIER colonia por lat/lng. **Pero la DB solo tiene 16 colonias sembradas** (muestra: Polanco $1,409/m², etc.), todas con su valor SIG.
> - `data_sources/sigcdmx_engine.py` (W4.18): uso de suelo + densidad + niveles máx por predio (16 alcaldías, `lookup(cuenta_catastral)`, guarda `raw_metadata` con 18 campos crudos). **Pero `sigcdmx_uso_suelo` = 0 docs poblados** (la ingesta no ha corrido o el CSV oficial cambió de formato/URL).
> - **COS/CUS explícito** (% área libre) NO está mapeado (probablemente vive en `raw_metadata`).
> - **Conclusión:** la FUENTE SIGCDMX sí tiene toda la ciudad; NOSOTROS tenemos 16 colonias y la zonificación en cero. Poblar todo es OPERATIVO (el motor existe), no construir desde cero.

| Calculadora / pieza | Ya en repo (latente) | Net-new / falta |
|---|---|---|
| Valor suelo / catastro | ING.1 motor OK · AVM · `comercial_value_model` | **poblar las ~1,800 colonias** (hoy 16) · fusionar con COS/CUS por predio |
| Due Diligence del predio | IE / POI | checklist legal/factibilidades del doc 01 |
| Generador de producto (HBU) | `dev_batch7` (site selection) | el motor "generador OFICIAL" (fórmulas reales) |
| Paramétrico de obra | — | partidas Neodata + curva S del WBS |
| Cash flow / TIR | `dev_batch8` | proforma institucional + peak equity + preventa |
| Sensibilidad | W4.4D | tablas 2D + tornado |
| Mercado / competidores | Battle Card, Competidores, IE | NSE AMAI (pública) + estudio vivo |
| Absorción / aprendizaje | Cerebro E0-E6, Live Pulse | índice de absorción cross-dev |
| Gestión normativa | — | módulo nuevo (el más grande) |
| Licitación / Índice de Obra | — | net-new (marketplace contratistas) |
| Operación / post-venta | soc_franchise/leads custom_event | módulo property management |
| Score de Bancabilidad + terminal | — | productos de data |
| Bandas honestas / calibración | `metric_normalizer`, Cerebro E4 | la Doctrina §9 formalizada |

---

## 13. Secuencia de fases (gate por fase · cada índice se prende solo cuando su back-test mide error aceptable)
**F1.0 ✅ HECHO (prerrequisito): poblar el SIG catastral de CDMX** — 1,524 colonias deduplicadas; ~90% con COS/CUS oficial (SIG); ~91% con valor de suelo catastral. Endpoints superadmin: sync-zonificacion + dedupe.

**F1.2 ✅ HECHO: Motor de Valor Residual del Terreno** — responde "¿cuánto máximo pago por este terreno?" método residual (Ingreso − Obra − Costos blandos − Utilidad exigida). Reutiliza colonias (CUS/precio/vsuelo), `comercial_value_model` (suelo→comercial) y `construction_cost_engine` (BANXICO/INEGI). Cada insumo trae ORIGEN (dato/benchmark/estimado/supuesto) + banda + avisos honestos (Doctrina). Backend `valor_residual_engine.py` + `routes/dev_valor_residual.py` (`/api/dev/valor-residual/{categorias,colonias,calcular}`). Frontend dev `/desarrollador/valor-terreno` (una pantalla: número grande + semáforo + desglose colapsable). Calibrado vs Puente Alvarado.

**F1.3 ✅ HECHO: Due Diligence del Predio** — "antes de comprar, ¿qué reviso?". 5 secciones (zonificación+potencial · riesgos del entorno · verificaciones legales · factibilidades técnicas · oportunidad Norma 3) con estado (ok/alerta/pendiente/info) + origen por ítem (Doctrina). Despierta features dormidas: `colonia.scores_reales` (seguridad/riesgo FGJ) + `natural_risk_engine` (Atlas CENAPRED, fail-open). EIU dinámico por tamaño (construibles ≥10,000 m²). Backend `predio_due_diligence_engine.py` + endpoint `/api/dev/valor-residual/due-diligence`. Integrado en la MISMA pantalla Valor de Terreno (cierra el ciclo oferta→qué revisar).

Pendiente: F1.1 Doctrina explícita en UI → F1.4 detector Norma 3 a fondo (fusión de predios rentable; hoy solo flag) → F1.5 1-pantalla integrada → F1.6 calibración formal vs Puente Alvarado.
Luego: F2 Autopiloto de Memorándum → F3 Gemelo Digital + Predicción↔Realidad → F4 Modelo del Mundo (3 índices, shadow→validado) → F5 Utilidad de Datos e Infraestructura. Transversal: 4 portales (Cerebro) + UX/UI limpio + Doctrina de Datos en cada chunk.
