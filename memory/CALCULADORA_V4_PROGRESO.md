# Calculadora de Inversión v4 — Progreso + Checklist

**Branch:** `dev-redesign-tandas` · **Última actualización:** 2026-06-22 · **Estado:** ✅ funcional, verificada en app (pendiente merge a main)

Calculadora de inversión inmobiliaria **grado institucional** ("pro por dentro, simple por fuera"), embebida en la página de zona (`/zona/{slug}` → tab Invertir). Reemplazó a `InvestmentSimulator` SOLO en la zona; la vieja sigue viva en `/simulador`/DevelopmentDetail/InsightsTab (NO tocar).

> Filosofía: cada concepto explicado para alguien sin conocimientos financieros (globitos `?`), todos los números honestos (no se maquilla nada), datos de fuentes oficiales citadas.

---

## Flow (corregido — el que pidió el founder)
1. **¿Para ti o institucional?** (tipo de inversión · PASO 1, arriba)
2. **Elige el desarrollo** (PASO 2)
3. **Elige la(s) unidad(es)** (PASO 3 · UN SOLO selector): *Para ti* = 1 depa · *Institucional* = 1 o más
4. **Tus datos** (precio total · cómo lo pagas · configuración) → **Resultados**

En **Institucional con 2+ unidades**, TODO el análisis (impuestos, crédito, renta vs Airbnb, pentágono, año-con-año, métricas) se calcula sobre el **portafolio combinado** (suma de unidades). Validado: cap/NOI/DSCR idénticos por dos caminos; TIR difiere solo por el ISR sobre ingreso combinado (correcto para un fondo = un solo dueño).

---

## Arquitectura (archivos · reusar, no duplicar)
- **Frontend:** `frontend/src/components/investment/InversionV4Calculator.js` (props: `mode`, `prefilled`, `portfolioUnits`, `lockPrice`, `zoneId`, `capRateMercado`, `devId`, `numDesarrollos`). Montado en `frontend/src/pages/public/ZonePageV2.js`.
- **Motor:** `backend/inversion_v4_finance.py` (PMT/IRR/MIRR/NPV/cap rate/NOI/equity multiple/payback/sensibilidad 1D+2D/montecarlo/escenarios/proforma/**portafolio**/proyección retorno-marginal) + `inversion_v4_tax.py` (ISR art.152/RESICO/venta) + `inversion_v4_veredicto.py`.
- **Endpoints (`routes/public.py`):** `POST /api/inversion-v4/analyze` · `/portafolio` · `/airroi` · `GET /zona-contexto` · `/analytics` (superadmin) · `POST /api/superadmin/atlas-riesgo/ingest` · `/api/superadmin/shf/refresh`.
- **Motores reusados:** `connectors_ie.AirRoiConnector` (renta corta) · `lead_capture_marketplace` (PDF tras lead) · `market_rates_engine` (CETES/UDIS/FIX vivo + vehículos) · `absorcion_engine` (absorción) · `climate_migration_engine` + `natural_risk_engine` (riesgo físico).
- **Tests:** `backend/tests/test_inversion_v4_{finance,tax}.py` (11 verdes) + auditoría 41 invariantes financieras.

---

## CHECKLIST de features

### Núcleo (deal-level)
- [x] TIR apalancada y sin apalancar · MIRR · VPN/NPV
- [x] Cap rate (going-in) · NOI · cash-on-cash · equity multiple · payback
- [x] DSCR · debt yield · cobertura de renta · crédito (amortización francesa real)
- [x] Crédito en tarjeta: reparto precio→enganche→te-prestan · capital/interés año-a-año · abono extra · controles inline
- [x] Desglose con escrituración (ISAI/notario/registro) · "cuando lo vendas" (ISR reusa motor)
- [x] Largo plazo vs Airbnb (gastos Airbnb diferenciados ~22%) · AirROI real (cuesta/llamada → caché + botón)
- [x] Break-even de renta + ocupación de equilibrio
- [x] Proyección año-con-año + **mejor año de salida por retorno marginal** (Geltner & Miller, no máx-TIR)
- [x] Comparable **Pentágono de las inversiones** (rendimiento/riesgo/liquidez/plazo/dedicación) + radar SVG + crypto/crowdfunding/SOFIPO

### Nivel fondo / institucional
- [x] Vista **Para ti / Institucional** (la decide ZonePageV2, paso 1)
- [x] Resumen ejecutivo arriba (TIR/cap/vs-mercado/DSCR/pesimista/payback/VPN)
- [x] Calidad de entrada vs mercado · escenarios base/optimista/pesimista · pro-forma CSV · supuestos editables
- [x] Sensibilidad 2D (heatmap tasa × plusvalía) · Monte Carlo (VaR p5/p50/p95 · prob<CETES)
- [x] **Due diligence de fondo**: descomposición del retorno (income vs capital, NCREIF) · spread vs CETES · yield-on-cost · préstamo máx a DSCR 1.2 · estabilización/lease-up
- [x] **Modo portafolio** (1+ unidades · agrega · descuento por volumen · tabla por unidad)
- [x] **Reporte a nivel fondo (INREV/NCREIF)**: TWR sin apalancar · **TWR por horizonte 1/3/5/10** · **SI-IRR** · **PIC/TVPI/DPI/RVPI** · **TGER**
- [x] **Riesgo físico (PML sísmico)**: SEL + SUL/PML90 (marco ASTM E2557/E2026) · zona sísmica real CDMX
- [x] **Plusvalía vs Índice SHF** (Valle de México + nacional) · nota valuación RICS Red Book/IVS
- [x] Barra **sticky** con TIR/flujo en vivo (via portal) · PDF tras captura de lead (perfilamiento)

### Conectividad / multitenant / analíticas
- [x] Cálculos tenant-agnósticos (sin datos de org) · lead rutea por **id de desarrollo**
- [x] Fallback de leads respeta política documentada ([[LEAD_REGISTRATION_RULES]]): pool DMX, nunca asesor cross-tenant
- [x] **Analíticas superadmin**: log anónimo (LFPDPPP) de cada simulación → `GET /analytics` (demanda revelada por zona/precio/modo)

### Feeds de datos (conectados 2026-06-22)
- [x] **Atlas de Riesgo CDMX**: `natural_risk_layers` sembrado con zonificación geotécnica oficial (Polanco=Zona II) · PML usa dato real por colonia
- [x] **Índice SHF (1T 2026)**: nacional 8.7% · Valle de México 5.1% · nueva 9.1% · avalúo prom $2,024,337 · BBVA nueva 10.8%/social 11.2%
- [x] **Absorción**: velocidad de venta + meses para agotar inventario (`absorcion_engine`)

---

## Datos a junio 2026 (fuentes)
- **Plusvalía:** Índice SHF de precios de vivienda, 1T 2026 (gob.mx/shf) + BBVA Situación Inmobiliaria. Nacional 8.7%, **Valle de México (CDMX) 5.1%**.
- **Riesgo sísmico:** Zonificación geotécnica CDMX (NTC Reglamento de Construcciones · Zona I Lomas / II Transición / III exLago) + Atlas de Riesgos CDMX.
- **Marcos institucionales:** CFA Institute · NCREIF/PREA · INREV · ULI · Geltner & Miller · RICS Red Book/IVS · ASTM E2557/E2026. Detalle verificado en [[institutional-metrics-research]].

---

## PROD — correr una vez tras deploy (seed de feeds)
```
POST /api/superadmin/atlas-riesgo/ingest   (header x-cron-token: $ADMIN_ANALYTICS_TOKEN)
POST /api/superadmin/shf/refresh           (header x-cron-token: $ADMIN_ANALYTICS_TOKEN)
```
En dev ya están sembrados (`natural_risk_layers` 6 colonias + `market_benchmarks.shf`).

## Pendiente menor (backlog)
- [ ] Atlas AGEB fino (inundación por bloque censal) vía datos.cdmx.gob.mx SHP — hoy flood/subsidencia son estimados por zona; el sismo SÍ es oficial.
- [ ] Parsear el CSV de transparencia.shf.gob.mx en `shf/refresh` (hoy valores verificados a mano cada trimestre).
- [ ] Softec DIME / días-inventario SNIIV para absorción más fina.
- [ ] Merge a `main` + actualizar `06_ROADMAP.md`.

---

## Bitácora de commits (sesión calc v4)
`da6c4500`→`ba016d25`: controles crédito · enganche 10-90% · radar pentágono + reseed · auditoría 41 invariantes · break-even · 3 métricas pro (payback/ocupación-equilibrio/heatmap) · PDF tras lead · nivel fondo (calidad entrada/escenarios/proforma/supuestos) · fases 1-2-3 (sticky/Para-mí-Fondo/portafolio) · multitenant (sticky portal + lead por desarrollo) · 6 métricas due diligence + analíticas superadmin · fix política leads · absorción + riesgo real · **portafolio calcula TODO** · **flow un-solo-selector + tipo paso 1** · institucional 1+ · recomendaciones deep research (reporte fondo/PML/SHF/RICS) · **conecta todo (TWR×horizonte + SI-IRR + feed Atlas + feed SHF 1T2026)**.
