# MATRIZ DE HIPERGRANULARIDAD — toda métrica × 4 escalas de zona

No son "7 productos". Son **~75 métricas/analíticas** que el arsenal de ~190 motores puede calcular, cada una en **4
escalas geográficas**. Esto es la superficie real del moat. ✓ = calculable con el motor indicado.

**Escalas:**
- **MICRO** = predio · manzana · CP · calle (catastro, point-in-polygon, demand_by_geo calle/cp)
- **MEDIA** = colonia (la mayoría de motores)
- **GRANDE** = corredor · cluster de colonias · zona testigo (agregación de colonias)
- **MACRO** = alcaldía · ciudad (cube tiers, crimen/SHF/INEGI por alcaldía)

---

## A · PRECIO & VALOR (12)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Precio/m² asking | ✓ | ✓ | ✓ | ✓ | avm_public / hedonic |
| Valor catastral del suelo $/m² | ✓ | ✓ | ✓ | ✓ | sig_catastro / valores_unitarios |
| Plusvalía histórica | · | ✓ | ✓ | ✓ | drpi / shf |
| Forecast precio 6/12/24m | · | ✓ | ✓ | ✓ | forecast (ARIMA) |
| Brecha asking vs lo buscado | · | ✓ | ✓ | ✓ | price_sensitivity + avm |
| FSD / confianza de valuación | ✓ | ✓ | · | · | fsd |
| Prima de estrenar (vs reventa) | ✓ | ✓ | · | · | price_context |
| Descuento real al cierre | ✓ | ✓ | ✓ | · | transaction_network |
| Costo de construcción/m² | · | ✓ | ✓ | ✓ | construction_cost |
| Margen del dev % | ✓ | ✓ | · | · | dmx_margin |
| Valor residual del suelo (máx a pagar) | ✓ | ✓ | · | · | valor_residual |
| Homologación perito (ajustes) | ✓ | ✓ | · | · | avm_feature |

## B · DEMANDA (13)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Volumen de búsquedas | ✓ | ✓ | ✓ | ✓ | demand_intelligence |
| Demanda por feature (gym/terraza…) | · | ✓ | ✓ | ✓ | demand_by_feature |
| Spec que pide la demanda (precio/rec/m²) | · | ✓ | ✓ | ✓ | demand_twin |
| Demanda insatisfecha (unmet) | · | ✓ | ✓ | ✓ | unmet_demand |
| Score de oportunidad (gemelo) | · | ✓ | ✓ | ✓ | demand_twin |
| Demanda potencial demográfica | · | ✓ | ✓ | ✓ | demanda_demografica |
| Intent vivir vs invertir | · | ✓ | ✓ | ✓ | intent_split |
| Por qué dicen NO (rechazo) | · | ✓ | ✓ | · | rejection_intel |
| Elasticidad precio (curva) | · | ✓ | ✓ | ✓ | price_elasticity |
| Estacionalidad (mes) | · | ✓ | ✓ | ✓ | seasonality |
| Demanda por hora/día | · | ✓ | ✓ | ✓ | temporal_demand |
| Grafo del comprador (perfil×etapa vida) | · | ✓ | ✓ | ✓ | grafo_comprador |
| Qué construir (gap demanda-oferta) | · | ✓ | ✓ | ✓ | what_to_build / generador_producto |

## C · OFERTA & ABSORCIÓN (9)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Inventario (unidades disponibles) | ✓ | ✓ | ✓ | ✓ | data_developments / cube |
| Absorción % vendido (por cohorte) | ✓ | ✓ | ✓ | ✓ | absorcion |
| Velocidad de venta (u/mes) | ✓ | ✓ | ✓ | ✓ | absorcion |
| Meses para agotar inventario | ✓ | ✓ | ✓ | ✓ | absorcion |
| Predicción sold-out + fecha | ✓ | ✓ | · | · | probability (sells_complete) |
| Balance oferta-demanda | · | ✓ | ✓ | ✓ | supply_demand_balance |
| Pipeline / nuevos lanzamientos | · | ✓ | ✓ | ✓ | comparable_anomaly |
| Concentración / competencia (HHI) | · | ✓ | ✓ | ✓ | battle_card / competencia_red |
| Inventario zombie (sin movimiento) | ✓ | ✓ | ✓ | · | competencia_red |

## D · CALIDAD DE VIDA (8)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Score seguridad | ✓ | ✓ | ✓ | ✓ | risk_score / crime_fgj |
| Score transporte / walkability | ✓ | ✓ | ✓ | ✓ | osm / gtfs |
| Score educación (escuelas) | ✓ | ✓ | ✓ | ✓ | google_places |
| Score amenidades (densidad) | ✓ | ✓ | ✓ | ✓ | google_places / osm |
| Score lifestyle / vibe | · | ✓ | ✓ | · | zone_subscores |
| Densidad comercial (DENUE) | ✓ | ✓ | ✓ | ✓ | osm / places |
| Sentimiento de residentes | · | ✓ | ✓ | · | reviews_residents |
| Score zona maestro A-F | · | ✓ | ✓ | ✓ | zone_score |

## E · RIESGO (8)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Riesgo compuesto A-F | ✓ | ✓ | ✓ | ✓ | risk_score |
| Sísmico (microzonificación) | ✓ | ✓ | ✓ | · | natural_risk |
| Inundación | ✓ | ✓ | ✓ | · | natural_risk / sacmex |
| Hundimiento / subsidencia | ✓ | ✓ | ✓ | · | natural_risk |
| Delito ponderado por gravedad | ✓ | ✓ | ✓ | ✓ | crime_fgj / crime_data |
| Percepción de inseguridad | · | · | · | ✓ | perception_risk (ENVIPE) |
| Riesgo climático / migración | · | ✓ | ✓ | ✓ | climate_migration |
| Fraude en listings | ✓ | ✓ | · | · | fraud_detection |

## F · INVERSIÓN & FINANZAS (9)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Cap rate / gross yield | ✓ | ✓ | ✓ | ✓ | inversion_v4 + airroi |
| ROI 5/10 años (3 escenarios) | ✓ | ✓ | · | · | investment_simulator |
| TIR / MIRR / VPN | ✓ | ✓ | · | · | inversion_v4_finance |
| Score de inversión AAA-B | · | ✓ | ✓ | ✓ | score_inversion |
| Spread sobre CETES | ✓ | ✓ | ✓ | ✓ | market_rates |
| Comprar vs rentar + TCO | ✓ | ✓ | · | · | ownership_economics |
| Renta corta vs larga (yield) | · | ✓ | ✓ | · | zone_cycle / airroi |
| Bancabilidad del proyecto | ✓ | ✓ | · | · | bancabilidad |
| ISR/ISAI/predial proyectado | ✓ | ✓ | · | · | tax_projector / inversion_v4_tax |

## G · CICLO & MOMENTUM (7)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Etapa del ciclo (expansión/maduro…) | · | ✓ | ✓ | ✓ | zone_cycle |
| Velocidad de gentrificación | · | ✓ | ✓ | ✓ | zone_cycle |
| Movimiento (reciente vs previo) | ✓ | ✓ | ✓ | ✓ | zone_dynamics |
| Probabilidad de que el precio suba | · | ✓ | ✓ | ✓ | probability (DRPI) |
| Live Pulse 0-100 + alertas | · | ✓ | ✓ | ✓ | live_pulse |
| Qué sube / tendencias | · | ✓ | ✓ | ✓ | trend_alerts |
| Migración de demanda (cross-zone) | · | ✓ | ✓ | ✓ | substitution |

## H · COMPRADOR & COMPORTAMIENTO (9)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| Profundidad del journey | · | ✓ | ✓ | ✓ | journey_depth |
| Visitantes calientes / propensión | · | ✓ | ✓ | ✓ | hot_visitors |
| Probabilidad de cierre por lead | ✓ | ✓ | · | · | close_probability |
| Mix DISC (estilo de decisión) | · | ✓ | ✓ | ✓ | disc / behavior_profile |
| Device (mobile/desktop) | · | ✓ | ✓ | ✓ | behavior_profile |
| Qué compite (co-vistos) | · | ✓ | ✓ | · | co_viewed |
| Gusto/taste agregado (estilos/amenidades) | · | ✓ | ✓ | ✓ | gusto_mercado / taste |
| Churn / enfriamiento | ✓ | ✓ | · | · | churn_prediction |
| Atribución por canal | · | ✓ | ✓ | ✓ | attribution |

## I · ÍNDICES MAESTROS & B2B (5)
| Métrica | Micro | Media | Grande | Macro | Motor |
|---|:--:|:--:|:--:|:--:|---|
| 5 índices DMX (IPV/IAB/IDS/IRE/ICO) + IDM | · | ✓ | ✓ | ✓ | dmx_indices |
| Terminal de Mercado (oferta+demanda+aprendizaje) | · | ✓ | ✓ | ✓ | terminal_mercado |
| Project score / PageRank | ✓ (unidad) | ✓ | · | · | dmx_project_score |
| Cubo OLAP (cualquier slice×tier×periodo) | ✓ | ✓ | ✓ | ✓ | cube_olap |
| Índice de inteligencia de zona (fusión 8) | · | ✓ | · | · | zone_intelligence (NUEVO) |

---

## LO QUE ESTO SIGNIFICA
**~75 métricas × 4 escalas ≈ 230+ celdas calculables.** No es un portal de listados — es un **terminal de inteligencia
geográfica** donde cualquier métrica se puede ver del predio a la ciudad.

**Lo que falta para encenderlo TODO:**
1. **Extender `zone_intelligence` a las 4 escalas** (hoy solo media/colonia) — el cubo OLAP ya tiene tiers city→unit.
2. **Prender feeders 🟡** (catastro, places/osm, natural_risk, drpi/hedonic) → encienden las columnas micro/macro.
3. **Un solo "Terminal de Zona"** que pivotee escala (micro/media/grande/macro) × categoría (A–I) = la vista que mata
   a Inmuebles24/HouseCanary/CoStar juntos.
