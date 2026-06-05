# PROMPT CANÓNICO — Cockpit práctico por tab (ficha de proyecto dev) · 2026-06-04

Instrucciones para construir el cockpit de CADA pestaña de la ficha del desarrollador
(`ProyectoDetail.js`, flag `REACT_APP_DEV_V2`). Nace del feedback del founder: "con 100+
features, poner 2-3 tarjetas de palabras vagas es miserable". Piloto probado y verificado: UBICACIÓN.
Fuente de datos por tab: `memory/DEV_FICHA_TABS_DATA_REPORT.md`.

## REGLA DE ORO — DOCTRINA DEL DATO PRÁCTICO
Cada métrica debe traer las 4, o no va:
1. **NÚMERO** real (en pesos / unidades / %, NO un puntaje 0-100 crudo).
2. **PLAZO** (al año, al mes, a 10 años, en 30 días…).
3. **COMPARATIVO** (vs CDMX, vs la zona, vs competidores, vs el periodo anterior, vs la meta).
4. **PARA QUÉ SIRVE / ACCIÓN** (para quién, qué decisión habilita, qué hacer).

- ❌ "Plusvalía +3.2%" · "Áreas verdes: Algunas" · "Nivel: Líder" · "40/100".
- ✅ "Apreciación +7.5%/año vs ~6% CDMX → crece por encima del promedio, buen activo de apreciación."
- ✅ "Tu precio $141,084/m² · +49% vs zona ($95,000) → premium; justifícalo con marca/amenidades o el ritmo se frena."

## CANTIDAD Y FORMA
- **Riqueza, no miseria**: 5-6 bloques temáticos, ~12-15 datos por tab. La tab NO es una rejilla plana de 3 tarjetas; es un centro de mando con secciones (joya arriba).
- **Lenguaje de persona normal**, cero jerga. Títulos como pregunta ("¿Cuánto rinde invertir aquí?", "¿Quién compra aquí?").
- **Lo técnico (fuente, muestra) chico y abajo**, en cursiva gris.

## PATRÓN DE CONSTRUCCIÓN (probado en Ubicación)
1. **Backend**: 1 endpoint wrapper dev por tab que hace fan-out FAIL-OPEN a los motores reales y devuelve un payload con NÚMEROS (cada bloque con su `available` + `source`). Ej: `routes/location_intel.py` → `GET /api/dev/projects/{id}/location-intel`. No recomputes lo caro (lee colecciones persistidas).
2. **Frontend**: 1 componente rico dedicado (ej. `UbicacionIntel.js`), montado desde `AreaInsights` con short-circuit por `area`. Reusa tokens light (`--cream`, `--theme`, `.dmx-card`, Outfit) y los helpers de tarjeta.
3. **Estado final HOY**: construye TODOS los bloques aunque algún conector no traiga dato aún. Lo que falta dato → **stub honesto** ("○ se conecta pronto / al sincronizar"), NUNCA inventar número. Se autollena al llegar el dato.
4. **Sin features huérfanas**: el componente se monta en su tab real; el endpoint se registra en `server.py`. Verificar en la app real logueado.

## LA JOYA + LAS CARTAS POR TAB (del reporte de datos)

### VENTAS → "Pulso de ventas" (joya: what-if + forecast, ya productivos sin cablear)
- **Se agota en**: días-a-sellout (`IE_PROY_DAYS_TO_SELLOUT`) vs fecha de entrega → "agotas en 7 meses, 2 antes de entregar → poder de subir precio 3-4%".
- **What-if de precio** (`POST /api/whatif/simulate`): "si subes 3% → −1.8% velocidad pero +$4.2M ingreso a 12m". REAL y completo.
- **Forecast 3/6/12m** (`GET /api/dev/analytics/forecast`): target vs actual + proyección base/pesimista/optimista.
- **Ritmo real uds/sem + tendencia**, **unidades estancadas (+X días)**, **mix por prototipo con velocidad**: construir agregadores sobre `units_history` (fechas reales). OJO: `weekly_sales` actual es SINTÉTICO — reemplazar.
- **Precio/m² vs zona** (`IE_PROY_PRECIO_VS_MERCADO` + `dmx_margin`) · **margen semáforo**.

### INSIGHTS → "Veredicto de mercado" (joya: AVM real vs tu precio)
- **AVM del proyecto** (`avm_public_engine`): "valor justo $12.06M vs tu lista $14.8M → +22% arriba".
- **Comparables reales** (`insights/comparables`): "comparables venden en ~90 días, tú llevas 140". 🔴 arreglar bug `sqm`→`m2_priv` (precio/m² sale 0).
- **Valor por amenidad** (`dmx_hedonic_atom`) · **forecast zona** · **score + desglose** (`dmx_project_score`) · **embudo vista→lead→cita→cierre** con %.
- Enriquecer el contexto de la IA (hoy "razona a ciegas").

### PAGOS Y BROKERS → "Desempeño comercial" (joya: ranking de brokers, ya calculado sin cablear)
- **`GET /api/dev/leads/analytics`** (REAL, sin cablear): ranking `per_assignee` (quién cierra y en cuántos días), win_rate, `lost_reasons` ("30% se cae por financiamiento → crea plan enganche bajo").
- **SOC por broker** (bronze→platinum) · **split broker/directo/in-house** (`origin_type`).
- 🔴 GAP de dato #1: vínculo esquema-pago ↔ venta (`chosen_scheme_id`) → habilita "qué plan convierte más" y "enganche real vs ofrecido".

### LEGAL → "Estado legal y confianza"
- **Documentos X/10** (`IE_PROY_QUALITY_DOCS`) + **CUÁLES faltan** ("faltan escritura, licencia, predial") · **cross-check 5 reglas** (riesgo legal con detalle de críticos) · **confianza marca** · **entregas a tiempo**.
- 🔴 arreglar bug de upload legal (doc_type='legal' → 400; mapear a slugs `DI_DOC_TYPES`).

### AVANCE DE OBRA → "Salud de la obra" (joya: 1 wrapper de ritmo)
- Construir `GET /api/dev/construction/{id}/health`: "% real 42 vs % plan 50 → 3 sem atrasado · entrega proyectada sep-2027 vs prometida jul-2027" + semáforo de riesgo + días desde último reporte.
- **Costo de obra $/m²** (`getDevConstructionCost`, BANXICO+INEGI, ya front-callable).

### CONTENIDO → "Rendimiento del anuncio" (joya: analytics de landing, casi 0 backend nuevo)
- **Vistas + tendencia + conversión vista→lead + scroll depth + heat por sección** (`GET /api/studio/landing/{id}/analytics-summary`, filtrable por project_id).
- **Salud del anuncio** (`IE_PROY_LISTING_HEALTH` + desglose + qué falta) · **checklist de fotos por categoría** (ya etiquetadas con visión) · **tours 3D** · **hook score del copy**.

### AMENIDADES → "Tu producto vs la zona" (joya: amenity-ranker, ya front-callable)
- **Qué sube tu precio/m²** (`GET /api/dev/market/amenity-ranker`, `dmx_hedonic_atom`): "roof = +6.2% = $+5,700/m²".
- **$ extra en TU inventario** (% × unidades × m² × precio) · **cobertura vs zona/competidores** ("te falta coworking que 2/3 competidores tienen").
- GAP: el hedónico solo modela 5 atributos a nivel unidad; gym/alberca/spa no tienen $ (necesitan hedónico a nivel proyecto).

### INICIO (home) → ya construido (corona Salud + jugada del Cerebro + 4 categorías). Mantener; fusiona cross-tab.

## CHECKLIST DE CIERRE POR TAB
- [ ] endpoint wrapper fail-open registrado en server.py · probado con curl (datos reales)
- [ ] componente rico montado en su tab · verificado logueado en la app real
- [ ] cada tarjeta pasa la doctrina (número+plazo+comparativo+acción)
- [ ] stubs honestos donde falta dato · cero número inventado
- [ ] cero warnings nuevos · consola limpia
- [ ] commit
