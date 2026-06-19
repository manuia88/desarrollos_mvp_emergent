# Página de Zona (`/zona/:slug`) — Arsenal disponible para el rebuild total

**Fecha:** 2026-06-19 · branch `dev-redesign-tandas` · inventario por 3 exploradores (motores/endpoints · data por colonia · IA/ML/agentic).
**Objetivo:** rebuild total de la página de zona, un template para las ~200 colonias con buena data (de las 1,811 con geometría).
**Hallazgo:** la página actual muestra ~10% de lo que tenemos. Hay ~32 motores + 100+ recetas de score + 11 dominios de data + IA/agentic listos.

---

## REGLA DE COBERTURA (honesto, para no inventar)
- **1,811 colonias** con geometría (mapa choropleth, ingesta IECM).
- **~200–1,200 colonias** con data ESTRUCTURAL real: scores, crimen (FGJ ~1,200), amenidades/POI (OSM, todas), transporte (GTFS, todas), zonificación (SIGCDMX), valor de suelo catastral.
- **~6–16 colonias** con data DINÁMICA de mercado densa: DRPI (índice de precios), forecast, transacciones, live pulse. Crece con volumen de transacciones/tráfico.
- **Doctrina build-for-endstate:** mostrar TODO con etiqueta honesta de fuente; lo real donde hay, "estimado/aún sin dato" donde no. Se autollena al llegar el dato (cero refactor).

---

## EL ARSENAL POR BUCKET (lo que el comprador/inversionista quiere ver)

### A · PRECIOS Y VALOR (núcleo, real)
| Qué | Motor | Cobertura |
|---|---|---|
| **Valor por m² / por depto** (AVM, ML hedónico, explicable) | `avm_public_engine` + `hedonic_regression_engine` + `avm_explain_engine` | real donde hay transacciones |
| **Índice de precios mensual + cómo se mueve** (DRPI, ancla 100) | `drpi_engine` (`/api/drpi/snapshot`) | ~6 zonas, crece |
| **Pronóstico de precio 6/12/24m + rango (ARIMA)** | `forecast_engine` (`/api/forecast-public/zone`) | zonas con ≥6m DRPI |
| **Rango de confianza del valor (qué tan seguro)** (FSD) | `fsd_engine` (`/api/fsd/property`) | real donde hay modelo |
| **Valor de suelo catastral** (vsuelo) | db.colonias `vsuelo_pm2_catastral` | SIGCDMX |

### B · INVERSIÓN (ya lo construimos para el menú)
| Qué | Motor | Estado |
|---|---|---|
| **ROI · TIR · cap rate · renta · plusvalía + 3 escenarios** | `investment_simulator_engine` (`/api/zona/{id}/inversion`) | ✅ ya en el menú |
| **Probabilidades** (sube de precio, se vende, cierra bajo lista) | `probability_engine` (`/api/probability/...`) | composite real/stub |
| **Valor residual / proyección a futuro** | `valor_residual_engine` | heurístico |
| **Crédito hipotecario** (pago, total a 20a, tasas) | investment_simulator + Banxico (tasas reales) | ✅ ya en el menú |

### C · VIVIBILIDAD / CALIDAD (lo CONCRETO, no scores subjetivos)
| Qué | Fuente | Cobertura |
|---|---|---|
| **Amenidades/POI por categoría** (restaurantes, cafés, escuelas, hospitales, parques, bancos, gyms…) — **conteos reales, esto es lo que pediste** | `osm_engine` + db.denue_zone_density | **todas** (OSM) |
| **Transporte cercano** (estaciones Metro/Metrobús + distancia) | db.gtfs_cdmx | **todas** |
| **Riesgo** A-F: crimen (FGJ por colonia) + natural (sismo/inundación/ladera) + percepción | `risk_score_engine` (+crime/natural/perception) | crimen ~1,200 |
| **Zonificación** (uso de suelo, niveles, COS/CUS, densidad) | db.sigcdmx_uso_suelo | 16 alcaldías |
| **Sub-scores** (estilo de vida, seguridad, transporte, amenidades, precio, vibe) | `zone_subscores_compute` | 5/6 real (vibe stub) |

### D · DEMANDA / MERCADO VIVO (Bloomberg de la zona)
| Qué | Motor | Estado |
|---|---|---|
| **Live Pulse**: 5 señales (búsquedas · vistas · leads · precio · tendencia) → score 0-100 | `live_pulse_engine` (`/api/live-pulse/zone`) | 4/5 real (tendencia stub) |
| **Demanda insatisfecha** (qué se busca y no hay = hueco) | `/casi` + db.demanda_insatisfecha | real |
| **Demanda demográfica** (potencial anual por NSE, EPRAV) | `demanda_demografica_engine` | heurístico 4S |
| **Absorción** (meses para agotar inventario) | `absorcion_engine` | real/heurístico |
| **Ciclo de la zona** (emergente/crecimiento/maduro/declive) | `zone_cycle_engine` | heurístico |
| **Pulso simple de la zona** (cuántos buscan, lo más pedido) | `/api/zona/{id}/pulso` | ✅ real |

### E · OFERTA
| Qué | Fuente |
|---|---|
| **Desarrollos en la zona** (proyectos + unidades + precios + etapa) | db.developments / data_developments |
| **Colonias comparables / similares** | `comparator_engine` · `/api/colonias-similar` |

### F · COMPETITIVO
| Qué | Motor |
|---|---|
| **Battle card** (la zona vs top competidoras: precio/ventas/zona/marketing/leads) | `battle_card_engine` |

### G · IA / ML / DL / AGENTIC (los diferenciadores — nadie tiene esto)
| Qué | Motor | Estado |
|---|---|---|
| **Atlax — "pregúntame de esta zona"** (asistente conversacional, RAG, 39 tools incl. query_zone_subscores/live_pulse/avm/comparables) | `atlax_engine` + `asistente_engine` | real (público) |
| **Lookalike / embeddings** — "zonas parecidas" · "gente como tú buscó/cerró aquí" | `cerebro/lookalike.py` + `rag_engine` | real (con OPENAI_KEY) |
| **Cerebro agéntico** — goal `zone_intel` (orquesta análisis de zona) | `cerebro/orchestrator` | real, **gated** CEREBRO_ENABLED |
| **Modelo de gusto** — personaliza si el visitante navega | `taste_profile` | real |
| **Búsqueda semántica (RAG)** sobre narrativas de zona | `rag_engine` + `conversation_rag` | real (con OPENAI_KEY) |
| **Boletín mensual de la zona** (narrado por LLM + PDF) | `bulletins_engine` | real (gated ai_budget) |
| **Learning loop / calibración** de predicciones | `cerebro/coach.py` | real |

---

## LECTURA PARA EL DISEÑO
1. **Reemplazar los scores subjetivos** por **datos concretos** (bucket C: conteos OSM de amenidades + transporte + crimen real). Eso sí "se siente".
2. **Traer la inteligencia de inversión** (bucket B, ya construida) a la página.
3. **Sumar lo que NINGÚN portal tiene:** Live Pulse (D) + Atlax "pregúntame de esta zona" + Lookalike (G).
4. **Honestidad de cobertura:** real donde hay (estructural: ~200-1,200 zonas), "estimado / aún sin dato" en lo dinámico (DRPI/forecast ~6 zonas) hasta que crezca.
5. **Un solo template** `/zona/:slug` alimentado por endpoints existentes → sirve para las 200.
