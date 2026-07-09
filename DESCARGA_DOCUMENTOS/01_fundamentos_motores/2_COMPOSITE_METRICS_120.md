# 100 → 120 MÉTRICAS COMPUESTAS — los productos empaquetados vendibles

> **ACTUALIZACIÓN (2026-06-29):** ya son **120 compuestas** en **12 paquetes** — se agregaron Pack 11 **Suelo&Construcción**
> (#101-110: margen del dev, residual÷catastral, premium sobre catastral, eficiencia de obra…) y Pack 12 **STR/Airbnb**
> (#111-120: payback STR, premium vs renta tradicional, yield ajustado a riesgo, índice STR — con **AirROI real**, candado
> 1 llamada/zona/mes). Cobertura ~64-78% (resto build-ready esperando dato de prod). Las 13 nulls quedaron **cableadas a su
> fuente real** (forecast/clima/fraude/reseñas/brokers) para poblarse en producción.



Cada métrica = **(comportamiento del marketplace) ⊗ (motor de mercado del superadmin)**. Ninguna existe en un motor solo.
Organizadas en **10 paquetes vendibles**. ✅ = ya construida y verificada (`cross_intelligence`). Portal = quién la consume.
Todas son calculables a 4 escalas (micro/media/grande/macro) × tiempo × segmento → cada una es **cientos de celdas**.

---

## 📦 PACK 1 — PRICING INTELLIGENCE (precio justo y arbitraje)
| # | Métrica | Cruce (A ⊗ B) | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 1 | Brecha demanda-precio ✅ | demand_twin ⊗ AVM | ¿la demanda puede pagar lo que cuesta? (+/−%) | Dev·SA |
| 2 | Arbitraje WTP-feature | willingness_to_pay ⊗ avm_feature | feature que el mercado paga MÁS de lo que el modelo valúa | Dev·SA |
| 3 | Sobreprecio validado | rejection(precio) ⊗ brecha AVM | ¿rechazan por precio DONDE sí está caro? | Dev·Asesor |
| 4 | Sweet-spot de precio | price_elasticity ⊗ absorción | banda de precio que maximiza velocidad de venta | Dev·SA |
| 5 | Margen-oportunidad del dev | WTP ⊗ construction_cost | lo que pagarán − lo que cuesta construir | Dev |
| 6 | Precio óptimo de lanzamiento | AVM ⊗ elasticidad ⊗ forecast | a qué precio entrar para vender Y plusvaluar | Dev |
| 7 | Prima de estrenar real | price_context ⊗ demand_by_feature | cuánto extra pagan por nuevo, validado con demanda | Dev·Comprador |
| 8 | Descuento esperado al cierre | transaction_network ⊗ demanda | cuánto bajan para cerrar según nivel de demanda | Asesor·Dev |
| 9 | Prima de especulación | asking ⊗ catastral ⊗ demanda | sobreprecio sobre el suelo, ponderado por interés | SA·Inversionista |
| 10 | Elasticidad → forecast | price_elasticity ⊗ DRPI forecast | dónde se moverá la demanda cuando suba el precio | SA |

## 📦 PACK 2 — DEMAND INTELLIGENCE (qué/dónde/cuándo)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 11 | Demanda no satisfecha por feature | demand_by_feature ⊗ cobertura oferta | feature pedido que NO existe en la zona | Dev·SA |
| 12 | Demanda como indicador líder | momentum ⊗ DRPI | ¿la demanda PREDICE el precio? (señal adelantada) | SA·Inversionista |
| 13 | Potencial vs revelada | demanda_demografica ⊗ búsquedas | zonas con potencial sin búsquedas aún (blue ocean) | Dev·SA |
| 14 | Config que más absorbe | spec_pedida ⊗ absorción por cohorte | qué tipología/m² se desplaza primero | Dev |
| 15 | Mejor mes para lanzar | seasonality ⊗ absorción | estacionalidad de demanda × velocidad de venta | Dev·Asesor |
| 16 | Demanda por hora-canal | temporal ⊗ attribution | cuándo y por qué canal llega la demanda | Asesor·SA |
| 17 | Migración de demanda | cross_zone ⊗ supply gap | de qué zona cara migran a cuál barata | SA·Dev |
| 18 | Profundidad × calidad | journey_depth ⊗ zone_score | ¿las mejores zonas se exploran más a fondo? | SA |
| 19 | Intent-mix por tier | intent_split ⊗ zone tier | vivir vs invertir según el nivel de la zona | Asesor·SA |
| 20 | Concentración de demanda (Gini) | demanda por colonia ⊗ distribución | qué tan concentrada/dispersa está la demanda | SA |

## 📦 PACK 3 — INVESTOR GRADE (retorno con respaldo de demanda)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 21 | Demanda-inversor × yield | intent invertir ⊗ cap_rate | demanda inversionista que coincide con yield real | Inversionista·SA |
| 22 | Demanda grado-inversión ✅ | demanda ⊗ score_inversion | donde demanda y retorno coinciden | Inversionista·SA |
| 23 | Sharpe de la colonia | (yield−CETES) ⊗ riesgo ⊗ demanda | retorno ajustado por riesgo, con demanda real | Inversionista |
| 24 | Spread vs CETES por zona | cap_rate ⊗ market_rates | prima sobre la tasa libre de riesgo, por colonia | Inversionista |
| 25 | ROI ponderado por absorción | ROI ⊗ absorción | retorno real considerando velocidad de salida | Inversionista |
| 26 | Yield renta-corta vs larga | airroi ⊗ zone_cycle | dónde Airbnb supera la renta tradicional | Inversionista |
| 27 | Bancabilidad × demanda | bancabilidad ⊗ demanda | proyecto financiable con demanda probada | Dev·Banco |
| 28 | Plusvalía esperada × demanda | forecast ⊗ momentum | apreciación donde la demanda empuja | Inversionista |
| 29 | Liquidez (entrada-salida) | absorción ⊗ días en mercado | qué tan rápido entras y sales de la zona | Inversionista |
| 30 | Cap rate ajustado a riesgo | cap_rate ⊗ risk_score | yield neto de riesgo físico/seguridad | Inversionista·Banco |

## 📦 PACK 4 — RISK-ADJUSTED (riesgo que el comportamiento ignora)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 31 | Demanda ajustada a riesgo ✅ | demanda ⊗ risk_score | caliente pero riesgosa vs caliente y segura | SA·Comprador |
| 32 | Precio vs riesgo sísmico | AVM ⊗ sísmico | ¿pagas premium en zona de alto riesgo? | Comprador·Banco |
| 33 | Demanda en zona vulnerable | demanda ⊗ inundación | interés en zonas inundables (alerta temprana) | SA·Comprador |
| 34 | Brecha de percepción | rejection ⊗ reviews_residents | rechazo que los vecinos CONFIRMAN | SA·Dev |
| 35 | Riesgo climático × migración | climate ⊗ demanda | ¿la demanda huye de zonas vulnerables? | SA |
| 36 | Miedo vs dato | perception_risk ⊗ crime_fgj | donde el miedo supera al delito real (o al revés) | SA·Comprador |
| 37 | Frontera riesgo-retorno | risk ⊗ score_inversion | la frontera eficiente de colonias | Inversionista |
| 38 | Descuento por riesgo | transaction_network ⊗ risk | cuánto descuenta el mercado por riesgo | Inversionista·Banco |
| 39 | Fraude en zona caliente | fraud_detection ⊗ demanda | listings sospechosos donde hay más demanda | SA |
| 40 | Riesgo de título × valor | predio_DD ⊗ AVM | exposición legal ponderada por valor | Dev·Notaría |

## 📦 PACK 5 — ABSORPTION & VELOCITY (oferta vs demanda en el tiempo)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 41 | Presión de absorción ✅ | absorción ⊗ oportunidad demanda | agotándose vs hambrienta | Dev·SA |
| 42 | Meses-para-agotar real | meses_agotar ⊗ demanda nueva | agotamiento considerando demanda entrante | Dev |
| 43 | Sold-out forecast × precio | probability sold-out ⊗ AVM | cuándo agota y a qué precio | Dev·Asesor |
| 44 | Velocidad vs competencia | absorción ⊗ HHI | qué tan rápido vendes vs la saturación | Dev |
| 45 | Inventario zombie × demanda | stock muerto ⊗ demanda zona | oferta sin movimiento DONDE sí hay demanda (mismatch) | Dev·SA |
| 46 | Cohorte que más absorbe | absorción cohorte ⊗ spec pedida | preventa/entrega que mejor se desplaza | Dev |
| 47 | Pipeline vs demanda | nuevos lanzamientos ⊗ demanda | sobreoferta futura vs demanda real | SA·Dev |
| 48 | Sobreprecio en DOM | días en mercado ⊗ brecha AVM | el sobreprecio medido en tiempo en mercado | Asesor·Dev |
| 49 | Absorción estacional | absorción ⊗ seasonality | velocidad de venta por temporada | Dev |
| 50 | Velocidad × calidad | absorción ⊗ zone_score | ¿las mejores zonas venden más rápido? | SA |

## 📦 PACK 6 — DEVELOPER UNDERWRITING (qué/cómo construir)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 51 | Qué construir (gap) | demand_by_feature ⊗ supply | feature pedido sin oferta = oportunidad | Dev |
| 52 | Mezcla óptima de producto | grafo_comprador ⊗ generador_producto | tipología por demanda real de la zona | Dev |
| 53 | Margen-oportunidad | WTP ⊗ construction_cost | lo que pagan − costo de construir | Dev |
| 54 | Valor residual × demanda | valor_residual ⊗ demanda | máx a pagar por terreno con demanda probada | Dev |
| 55 | Norma 3 × plusvalía | norma3 ⊗ DRPI | ganancia de fusionar predios donde el precio sube | Dev |
| 56 | Lift de feature aprendido | simulador_palancas ⊗ demanda | terraza +X% validado con demanda real | Dev |
| 57 | Precio de lanzamiento | AVM ⊗ elasticidad ⊗ absorción | a qué precio entrar para vender rápido | Dev |
| 58 | Bancabilidad del lote | bancabilidad ⊗ absorción zona | financiable según velocidad de la zona | Dev·Banco |
| 59 | Riesgo-margen del proyecto | dmx_margin ⊗ risk | margen neto de riesgo | Dev |
| 60 | Demanda para proyecto nuevo | demanda_demografica ⊗ generador_producto | demanda donde aún no hay búsquedas | Dev |

## 📦 PACK 7 — LIVABILITY & LIFESTYLE (por qué se compra aquí)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 61 | Conversión × calidad de vida | funnel ⊗ zone_subscores | qué atributo (seguridad/transporte) sube conversión | SA·Dev |
| 62 | Demanda-familia × escuelas | intent vivir ⊗ educación | demanda de hogar que coincide con escuelas | Comprador·Asesor |
| 63 | Walkability × precio | transporte subscore ⊗ AVM | premium por caminabilidad | Comprador·SA |
| 64 | Amenidades × WTP | amenidades subscore ⊗ WTP | cuánto pagan por densidad de amenidades | Dev·SA |
| 65 | Vibe × perfil | vibe subscore ⊗ DISC/RFM | qué perfil busca qué vibe | Asesor |
| 66 | Sentimiento × demanda | reviews_residents ⊗ demanda | ¿la demanda sigue al sentimiento de vecinos? | SA |
| 67 | Lente de gusto (4 perfiles) | liv_engine ⊗ demanda | misma zona, 4 puntajes según perfil de comprador | Comprador·Asesor |
| 68 | Habitabilidad ponderada | seguridad ⊗ intent vivir | calidad de vida pesada por demanda real de hogar | Comprador·SA |
| 69 | Value index (calidad-precio) | zone_score ⊗ AVM | la mejor relación calidad-precio de la ciudad | Comprador·Inversionista |
| 70 | Comercio que se valora | DENUE ⊗ demanda | densidad comercial que la demanda realmente busca | SA·Dev |

## 📦 PACK 8 — COMPETITIVE INTELLIGENCE (posición vs el mercado)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 71 | Posición competitiva de precio | co_viewed ⊗ brecha AVM | contra quién compites y si estás caro | Dev·Asesor |
| 72 | Battle card × demanda | battle_card ⊗ demanda | score competitivo ponderado por demanda | Dev |
| 73 | Canibalización | co_viewed ⊗ misma colonia | proyectos que se comen entre sí | Dev·SA |
| 74 | Captura de demanda | share-of-search ⊗ supply | qué % de la demanda de la zona capturas | Dev |
| 75 | Migración competitiva | co_viewed cross-zone ⊗ precio | a qué zona/proyecto se van tus prospectos | Dev·SA |
| 76 | Saturación futura | pipeline ⊗ demanda | quién va a sobre-ofertar tu zona | Dev·SA |
| 77 | Velocidad relativa | absorción propia ⊗ absorción zona | vendes más rápido o lento que el promedio | Dev |
| 78 | Concentración de brokers | broker share ⊗ demanda | quién controla la demanda de la zona | SA·Dev |
| 79 | Precio vs comparables | AVM ⊗ comparables ⊗ demanda | posición de precio validada por demanda | Dev·Asesor |
| 80 | Feature diferenciador | demand_by_feature ⊗ supply mix | feature que te diferencia Y se busca | Dev |

## 📦 PACK 9 — LEAD QUALITY & CONVERSION (el asesor)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 81 | Calidad del lead caliente | hot_visitors ⊗ score_inversion zona | el lead anónimo va tras zonas AAA | Asesor |
| 82 | Presupuesto revelado vs declarado | predicted_budget ⊗ AVM | lo que MIRA vs lo que DICE | Asesor |
| 83 | Pipeline ponderado por ticket | close_probability ⊗ AVM | prob. de cierre × valor de la propiedad | Asesor·SA |
| 84 | Pitch que convierte por zona | DISC ⊗ narrative ⊗ conversión | qué tono cierra en cada colonia | Asesor |
| 85 | Lead-zona fit | lead spec ⊗ zone_intelligence | qué tan bien encaja el lead con la zona | Asesor |
| 86 | Urgencia × inventario | urgency ⊗ meses_agotar | lead urgente + inventario que se agota = cerrar YA | Asesor |
| 87 | Churn × ciclo de zona | churn ⊗ zone_cycle | pierdes leads en zonas en contracción | Asesor |
| 88 | Next-best-zone para el lead | lead taste ⊗ zone_subscores | la mejor zona para ese comprador | Asesor |
| 89 | Mejor canal por calidad | attribution ⊗ buyer_score | qué canal trae los mejores leads | Asesor·SA |
| 90 | Timing de contacto | temporal ⊗ propensity | cuándo contactar para máxima respuesta | Asesor |

## 📦 PACK 10 — MOMENTUM & FORECAST (la próxima Condesa)
| # | Métrica | Cruce | Qué descubre / vende | Portal |
|---|---|---|---|---|
| 91 | Demanda indicador líder | momentum ⊗ DRPI forecast | la demanda adelanta el precio | SA·Inversionista |
| 92 | Live Pulse compuesto | live_pulse ⊗ demanda ⊗ riesgo | el pulso de la zona en 1 número vivo | SA |
| 93 | Gentrificación temprana | zone_cycle ⊗ demanda joven/device | señales tempranas antes de que suba | Inversionista·SA |
| 94 | P(precio sube) × demanda | probability DRPI ⊗ momentum | probabilidad reforzada con demanda real | Inversionista |
| 95 | Forecast de absorción | absorción ⊗ demanda ⊗ pipeline | proyección de velocidad de venta | Dev |
| 96 | Ventana de oportunidad | ciclo ⊗ precio ⊗ demanda | cuándo entrar/salir de una zona | Inversionista |
| 97 | Aceleración de demanda | momentum 2ª derivada ⊗ supply | demanda acelerando vs oferta plana | SA·Dev |
| 98 | Índice de oportunidad real ✅ | demanda+precio+riesgo+retorno | el número maestro de la zona | Todos |
| 99 | Forecast de hueco | unmet ⊗ pipeline | demanda insatisfecha que seguirá sin oferta | Dev·SA |
| 100 | Termómetro zona emergente | zone_cycle ⊗ demanda ⊗ precio bajo | la próxima Condesa antes de que suba | Inversionista·Dev |

---

## CÓMO SE EMPAQUETAN Y VENDEN
| Paquete | Cliente | Producto vendible |
|---|---|---|
| 1·5·6 Pricing/Absorción/Underwriting | **Desarrollador** | "Underwriting & Pricing Suite" — qué/cómo/a-qué-precio construir y vender |
| 3·4·10 Investor/Risk/Momentum | **Inversionista / Fondo** | "Investment Terminal" — score AAA-B + Sharpe + ventana + riesgo |
| 4·7 Risk/Livability | **Banco / Aseguradora** | "Risk & Valuation API" — AVM + riesgo físico + bancabilidad |
| 9 Lead Quality | **Asesor / Inmobiliaria** | "Lead Intelligence" — calidad, fit, pitch, timing |
| 2·8·10 Demand/Competitive/Momentum | **Superadmin (B2B data)** | "Bloomberg CDMX" — terminal de mercado licenciable |

**5 ya construidas y verificadas. Las 95 restantes son el MISMO patrón** (cruzar dos motores que ya existen) — no hay que
construir motores, hay que **componer** los que ya tenemos. Cada una × 4 escalas × tiempo × segmento = cientos de celdas.
