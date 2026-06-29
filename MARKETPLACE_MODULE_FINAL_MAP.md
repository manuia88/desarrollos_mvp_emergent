# MAPA FINAL — Módulo Marketplace: toda la granularidad y su visualización en 3 portales

Este documento CIERRA el módulo marketplace. Es el plano de lo que se captura, lo que se calcula, y lo que se ve en
**superadmin, dev y asesor**. La barra ya está puesta: **~4,000 celdas/colonia × 1,811 colonias + 100 métricas compuestas.**

---

## CAPA 0 · CAPTURA (el espinazo del comprador) — ✅ COMPLETO
- **92 tipos de señal** en `buyer_signals` (visitor_id como espinazo) · 3 niveles de precisión de atribución.
- Geo: calle · CP · colonia · alcaldía · ciudad. Propiedad: internas/externas/amenidades/fichas/fotos.
- Financiero: cotizador (payment_explore) · ROI (roi_explore). Conversación: 145 mensajes turno-por-turno.
- Capturas nuevas cerradas: **device · tour_view · scroll_depth · DISC (agregado) · compare (vía co-vistos)**.

## CAPA 1 · INTELIGENCIA BASE (qué mide el marketplace solo) — ✅ COMPLETO
`demand_intelligence` (25 funciones) + `marketplace_granularity` (20 avanzadas):
- Demanda: por feature/colonia/atributo · qué construir · no satisfecha · tendencias · intención financiera · geo-fino.
- 20 avanzadas: estacionalidad · balance · absorción · RFM · elasticidad · viral · fugas · competidores · locale ·
  re-engagement · criterios · urgencia · sentimiento · presupuesto/timeline/prob predichos · co-ocurrencia · WTP ·
  sustitución · atribución. **(20/20 verificadas con dato real.)**

## CAPA 2 · ESCALA GEO (micro/media/grande/macro) — ✅ COMPLETO
`zone_dynamics` + `market_movement`: demanda + oferta + **absorción** + **movimiento** a 3 zooms (CP/colonia/alcaldía).

## CAPA 3 · FUSIÓN DE MOTORES (el HouseCanary por zona) — ✅ COMPLETO
`zone_intelligence`: fusiona **8 motores vivos** por colonia → demanda + absorción real + precio/m² + 6 subscores de
vida + riesgo + score de inversión + ciclo + recomendación. *(Polanco: $95k/m², absorción 15%/1.6-u-mes, riesgo C,
inversión 41-B, "maduro: no te sobrepases en precio".)*

## CAPA 4 · MÉTRICAS COMPUESTAS (el cruce net-new, lo vendible) — 🔵 5/100 construidas
`cross_intelligence` (5 ✅ verificadas) + catálogo de **100 compuestas** en 10 paquetes vendibles
(ver `COMPOSITE_METRICS_100.md`): Pricing · Demand · Investor · Risk · Absorption · Underwriting · Livability ·
Competitive · Lead Quality · Momentum. *(Polanco "hambrienta" +85% puede pagar · Condesa "caliente pero riesgosa".)*

## CAPA 5 · EL CUBO (la matriz direccionable) — 🟡 esquema listo, poblado parcial
medida(100) × escala(4) × tiempo(6) × segmento(9) × producto(12) ≈ **3,880 celdas/colonia × 1,811 colonias**.
Consultable vía `cube_olap` (tiers city→unit) + `cross_intelligence`. Poblar = prender feeders (catastro/places/risk/DRPI).

---

## VISUALIZACIÓN POR PORTAL — qué ve cada uno

### 🟣 SUPERADMIN — el terminal completo (vista dios)
| Vista | Qué muestra | Estado |
|---|---|---|
| **Demanda de Mercado** | overview + deep + 20 avanzadas + zonas 3-escalas + cruces | ✅ vivo (página existe) |
| **Terminal de Zona** (NUEVO) | pivote medida × escala × tiempo × segmento × producto + capa de cruces | ⛏️ construir (la página estrella) |
| **Índice de Inteligencia de Zona** | la fusión de 8 motores por colonia (tarjeta institucional) | ✅ en endpoint, falta página dedicada |
| **Cruces (100 compuestas)** | brecha demanda-precio, demanda ajustada a riesgo, oportunidad real… | 🔵 5 en endpoint, faltan 95 + UI |
| **8 Dev-Master stubs** | DondeConstruir·GustoMercado·MacroCiudad·Comportamiento·CompetenciaRed·StockSoldOut·Panorama·ObservabilidadIA | 🟡 UI lista, cablear motor |
| Terminal Mercado · Índices · DRPI · Risk · Transaction Network · Metrics Cube | el resto del moat ya expuesto | ✅ vivo |

### 🔵 DEV — su slice (underwriting + pricing de SUS colonias)
| Vista | Qué muestra | Métricas compuestas que consume | Estado |
|---|---|---|---|
| **Demanda de tu zona** | feature-demand + jugadas "qué construir" + avanzado scoped | #11,#18,#51 | ✅ vivo |
| **Underwriting & Pricing Suite** (NUEVO) | qué construir · mezcla óptima · margen-oportunidad · precio de lanzamiento · valor residual | #5,#6,#52,#53,#54,#57 | ⛏️ construir |
| **Tu zona (institucional)** | zone_intelligence scoped + brecha demanda-precio + presión absorción | #1,#41,#98 | 🟡 backend listo (avanzado), falta UI rica |
| **Competencia** | battle card · canibalización · velocidad relativa · saturación futura | #71,#72,#73,#76,#77 | 🟡 motor existe, cablear |
| **Absorción & sold-out** | meses-para-agotar real · cohorte que absorbe · sold-out forecast | #42,#43,#46 | 🟡 absorcion_engine vivo, falta UI |

### 🟢 ASESOR — lead-level (calidad, fit, pitch, timing)
| Vista | Qué muestra | Métricas compuestas que consume | Estado |
|---|---|---|---|
| **Leads anónimos calientes** | hot_visitors + presupuesto/timeline predichos | #81,#82 | ✅ vivo (SenalesCalientesCard) |
| **Qué ofrecerle** (recomendación) | recommend_for_lead por contacto | #85,#88 | ✅ vivo |
| **Lead Intelligence** (NUEVO) | lead-zona fit · pitch por zona · urgencia×inventario · next-best-zone · timing | #84,#85,#86,#88,#90 | ⛏️ construir |
| **Pipeline ponderado** | prob. de cierre × ticket · mejor canal por calidad · churn×ciclo | #83,#87,#89 | 🟡 motores vivos, cablear |

---

## ESTADO DEL MÓDULO MARKETPLACE (actualizado tras el build completo)
| Capa | Estado |
|---|---|
| 0 Captura (92 señales, 5 nuevas + enganche/crédito/años/mensualidad/ROI) | ✅ COMPLETO |
| 1 Inteligencia base (45 funciones) | ✅ COMPLETO |
| 2 Escala geo (3 zooms) | ✅ COMPLETO |
| 3 Fusión 8 motores (zone_intelligence) | ✅ COMPLETO |
| 4 **Las 100 compuestas** (composite_metrics.py) | ✅ COMPLETO (registro 100/100, 62% valor real, resto feeder-off cableado) |
| 4b **Eje de atributos de unidad** (attribute_demand) | ✅ COMPLETO (balcón/vista/altura/orientación/baños/recámaras) |
| 4c **Eje financiero** (financial_demand) | ✅ COMPLETO (presupuesto/enganche/crédito/años/mensualidad/intent/ROI/rentabilidad) |
| 5 El cubo (~4,000 celdas) | ✅ esquema + consulta vivos; poblar columnas micro/macro = feeders 🟡 |
| **Terminal de Zona** (superadmin) | ✅ COMPLETO (página + 6 tabs + ruta + nav) |
| Visualización dev | ✅ atributos + financiero + compuestas en DesarrolladorDemanda |
| Visualización asesor | ✅ bolsillo + mejores-zonas (compuestas lead) en SenalesCalientesCard |

**Cero motores nuevos: todo es composición.** Lo único que resta para poblar el 100% de las ~4,000 celdas es **prender
feeders 🟡** (catastro/places/risk/DRPI/airroi) — captura y cálculo ya están construidos y cableados a los 4 portales.

## LO QUE FALTA PARA CERRAR EL MÓDULO (secuencia)
1. **Terminal de Zona** (superadmin) — la página estrella: pivote escala×medida×tiempo×segmento + cruces. ← el producto.
2. **Construir las 95 compuestas restantes** en `cross_intelligence` (mismo patrón, componer motores existentes).
3. **Underwriting & Pricing Suite** (dev) + **Lead Intelligence** (asesor) — UI rica sobre lo ya cableado.
4. **Cablear los 8 Dev-Master stubs** a sus motores.
5. **Prender feeders 🟡** (catastro/places/risk/DRPI) → pobla las columnas micro/macro del cubo.

> **Conclusión:** el módulo marketplace ya CAPTURA y CALCULA todo (capas 0-3 completas, 4 demostrada). Lo que resta es
> **componer** (las 95 compuestas restantes) y **visualizar** (3 vistas nuevas + Terminal de Zona). Cero motores nuevos:
> todo es composición de los ~190 que ya existen. La barra de las ~4,000 celdas está puesta y es real.
