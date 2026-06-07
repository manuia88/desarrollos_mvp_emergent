# DMX · Orden de Construcción Maestro (lo pendiente, priorizado)

**Persistido**: 2026-06-07 · dictado por founder. Este es el plan de build que retomamos **al terminar el AVM/fundamentación de datos**.

> Contexto: íbamos avanzando el catálogo (≈ítem 4.2) cuando salió el problema del AVM (saltaba 20% con coeficientes inventados) y nos desviamos a **fundamentar los datos** (Tandas A/B/C). Ese desvío = "el AVM". Al cerrarlo, seguimos con este orden.

---

## BLOQUE 1 — Terminar el portal del Dev (Paso C) · lo dejamos a medias, va primero
- ⏳ **1.1** Inicio del dev — cerrar los 4 upgrades que iban a medias · **S**
- ⏳ **1.2** CRM & Leads — Embudo · Leads · Ficha (reusar el board de Mis Leads del asesor) · **M**
- ⏳ **1.3** Inteligencia del dev — bajar las inteligencias del Dev-Master filtradas a SUS proyectos (Dónde Construir, Competencia, Stock, etc.) — barato, reusa lo ya hecho · **M**
- ⏳ **1.4** Pricing (Tabla · Lab) · **1.5** Red Comercial · **1.6** Marketing · **1.7** Reportes/Finanzas · **M c/u**

## BLOQUE 2 — Quick-wins de dato real (Tier 1 del catálogo) · alto valor, dato ya listo
- ⏳ **2.1** B08 Absorción real (hoy es random sintético → reusar el motor que ya hice en Stock/Sold-Out) · **S**
- ⏳ **2.2** B05 Market Cycle · D05 Gentrificación · D07 renta corta/larga (campos ya en el schema) · **S–M**
- ⏳ **2.3** I04 · los 5 índices DMX (solo existe DRPI; componer IPV/IAB/IDS/IRE/ICO sobre scores que ya hay) · **M**
- ⏳ **2.4** Conectar recipes "DataPending" (escuela/salud/agua/Locatel: setear resource_id) · **S**

## BLOQUE 3 — Endurecer el Dev (Fase 1–4 del workplan) · antes de uso multi-dev real
- ⏳ **3.1** Aislamiento entre desarrolladoras (cada endpoint filtra por dev_org — el riesgo #1) · **L**
- ⏳ **3.2** Atomicidad (reserva de unidad / booking sin doble-reserva) + índices · **M**
- ⏳ **3.3** QA "día del desarrollador" + red-team de aislamiento · **M**

## BLOQUE 4 — Completar catálogo + pulido
- ⏳ **4.1** Tier 2 (calculadoras comprador: renta-vs-compra, arbitraje, TCO, precio justo; Portfolio Optimizer) · **M–L**
- ⏳ **4.2** B13 Amenity ROI real · B04 PMF · B10 Unit Revenue · B14 Buyer Persona · B15 Launch Timing · **M–L**  ← *íbamos por aquí cuando salió el AVM*
- ⏳ **4.3** Asesor P6 (pulido fino: tokens, mobile, onboarding, accesibilidad) · **M**
- ⏳ **4.4** Tier 3 (necesitan fuente nueva: tráfico real, crédito, patrimonio, due diligence) · **L**

## BLOQUE 5 — Prender (deploy/ops, no código) · al final, cuando esté completo
- ⏳ Llaves: OpenAI (visión fotos) · WhatsApp (conversaciones) · gov (GTFS/DENUE/Atlas) · link Tinder al comprador (swipes)
- ⏳ Subir flags DEV_V2 / COMMAND_CENTER a usuarios reales

---

# 🔎 HALLAZGOS DE LA INVESTIGACIÓN ACTUAL (para analizar AL FINAL, no ahora)

## A) El desvío "AVM" = Tandas de fundamentación (donde estamos parados)
| Tanda | Qué | Estado |
|---|---|---|
| A — Honestidad | tasas oficiales, quitar datos sintéticos, marcar "estimado", tokens+resource_ids, bug env | ✅ cerrada |
| B — Scores → bandas | índices inventados → "bajo/medio/alto" + "señal DMX, no medición" | 🟡 falta implementar |
| C — Valuación | AVM anclado a spine propio + cierres + filtro de atípicos + confianza + normalizador percentiles | ⏳ pendiente |
| Ingesta | SIG vsuelo + valores unitarios 2026 + SHF (poblar `catastro_cdmx`, hoy vacío) | ⏳ pendiente |

## B) OJO — Tanda B/C SE TRASLAPAN con BLOQUE 2 (no son dos trabajos, es uno)
Los ítems del catálogo que íbamos a construir son EXACTAMENTE las métricas que la auditoría marcó como inventadas:
- **2.1 Absorción** = el `random sintético` que Tanda A/B marca corregir.
- **2.2 Gentrificación (D05)** = fórmula inventada `mom*6+slope*1.5+15` (auditoría).
- **2.3 Los 5 índices DMX (IPV/IAB/IDS/IRE/ICO)** = IAB `50+mom*4`, IDS `0.55*desir+mom*4` inventados (auditoría).
→ **Conclusión PM:** construir BLOQUE 2 **ya fundamentado** (Tanda B incrustada), para no construir inventado y re-arreglar después. Tanda B ≈ "hacer BLOQUE 2 bien la primera vez".

## C) Lo que aprendimos de Monopolio / DD360 (proptech MX líder en AVM)
- **El moat NO son las tablas de gobierno, es TU dato de cierres.** Su AVM se apoya en 4 fuentes (transacciones reales, comparables de portales/brokers, su base de valuaciones, y **los precios de cierre de sus propias hipotecas**). Nuestro equivalente = **la operación cerrada del asesor/dev** (`on_deal_closed`, ya cableado). → En Tanda C/BLOQUE 4: el AVM debe anclarse a **cierres reales**, no solo a captaciones (que traen precio pedido, inflado).
- **Híbrido algoritmo + perito** (no reemplazan al perito; certifica/fotos/experiencia). → mantener ajuste humano + confianza, no vender precisión falsa.
- **Matiz hiperlocal no-lineal** (escuela a 50m baja valor, a 500m sube). → valida normalizar por percentiles reales (Tanda B/C), no topes inventados.
- **Mapa de valores venta+renta de ~2M propiedades CDMX.** → valida nuestra visión de granularidad del AVM + heatmaps (superficie a priorizar).
- **Gratis + transparente como gancho, monetiza adyacente (crédito).** Nuestro equivalente: marketplace público gratis = gancho; SaaS asesor/dev = monetización.
- Refs: inmobiliare.com/noticias/valuacion-inmobiliaria-digital-dd360 · contxto.com (Monopolio) · dd360.mx

## D) Fixes de honestidad NO listados arriba (de la auditoría de 50 motores) — sumar a BLOQUE 2/4
- `investment_simulator`: `APREC_RATES` por tier siguen heurísticas + ROI mezcla plusvalía con flujo (separar).
- `vertical_products` (seguros): pesos de peligro + factor edad inventados (puede errar 100-200%).
- DENUE: inconsistencia tope 3000 vs 500 vs ~400 real (unificar).
- **Guard de atípicos en captación** (punto del founder: precios inflados): marcar ±rango vs colonia, etiquetar "fuera de rango" sin borrar + sello de confianza visible.

> Estos hallazgos NO cambian el orden todavía. Se analizan al cerrar el AVM, junto al founder, para decidir cómo se incrustan en BLOQUE 2/4.
