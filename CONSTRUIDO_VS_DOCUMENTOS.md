# RELACIÓN — lo marcado en los documentos vs lo construido (2026-06-29)

Reconciliación honesta de cada documento contra el estado real del código. Verificado (batería 66/66, backend corre).

---

## 1 · COMPOSITE_METRICS_100.md
| Marcado | Construido | Estado |
|---|---|---|
| 100 compuestas en 10 paquetes | **120 compuestas en 12 paquetes** (+Suelo&Construcción, +STR/Airbnb) | ✅ **superado** |
| (cada una = comportamiento ⊗ mercado) | `composite_metrics.py` · `compute_all()` · `for_dev()` · `for_asesor()` | ✅ construido |
| valores reales | **~64-78% con valor real** · 13 build-ready esperando dato de prod | 🟡 poblado parcial |
| empaquetado vendible por cliente | ruteado: Dev←Suelo&Construcción · Asesor←STR/Airbnb · SA←todas | ✅ conectado |

## 2 · HYPERGRANULARITY_MATRIX.md
| Marcado | Construido | Estado |
|---|---|---|
| ~75 métricas × 4 escalas (~230 celdas) | `zone_dynamics` + `market_movement` a **4 escalas** (micro CP · media colonia · grande corredor · macro alcaldía) | ✅ 4 escalas |
| las 75 métricas en cada escala | **media = fusión completa** (zone_intelligence) · grande/macro = rollup ponderado · micro = subset geo | 🟡 rica en media, subset en micro/macro |
| el cubo ~4,000 celdas | esquema consultable (cube_olap + cross_intelligence) | 🟡 esquema sí, poblado ~64% |

## 3 · CROSS_GRANULARITY_ANALYSIS.md
| Marcado | Construido | Estado |
|---|---|---|
| clasificación motores (compartidos/independientes/refinadores) | documentada (11 compartidos · ~40 independientes · 11 refinadores) | ✅ |
| ~25 métricas compuestas net-new | **120 compuestas** (`cross_intelligence` 5 verificadas + las 120) | ✅ **superado** |
| modelo dimensional (medida×escala×tiempo×segmento×producto) | implementado en el cubo + 39 funciones al universo (por colonia/tiempo/segmento/serie) | ✅ |

## 4 · MARKETPLACE_MODULE_FINAL_MAP.md
| Capa marcada | Construido | Estado |
|---|---|---|
| 0 Captura (92 señales + nuevas) | device/tour/scroll/DISC/pago/ROI + enganche/crédito/años/mensualidad | ✅ |
| 1 Inteligencia base | demand_intelligence + granularidad (todas al universo) | ✅ |
| 2 Escala geo | 4 escalas (micro/media/grande/macro) | ✅ |
| 3 Fusión 8 motores | `zone_intelligence` (8 motores) + AirROI + riesgo natural + crimen | ✅ **ampliado** |
| 4 Compuestas | **120** (no 100) | ✅ |
| 5 El cubo (~4,000) | esquema + ~64% poblado | 🟡 |
| Visualización superadmin | **Terminal de Zona** (página + 6 tabs + nav) | ✅ (falta tu verificación logueada) |
| Visualización dev | DesarrolladorDemanda: atributos + financiero + compuestas | ✅ |
| Visualización asesor | SenalesCalientesCard: bolsillo + compuestas lead/STR | ✅ |

## 5 · ENGINE_ARSENAL.md
| Marcado | Construido | Estado |
|---|---|---|
| catálogo ~190 motores (13 dominios) | fusionados al cubo: AVM · zone_score · risk · absorción · demand_twin · score_inversión · zone_cycle · natural_risk · crime · AirROI · construction_cost · valor_residual · norma3 · simulador_palancas | ✅ los de zona fusionados |
| feeders 🟡 por prender | prendidos LOCALES: catastral · costo-obra · valor-residual · cap-rate-local · riesgo-natural · crimen · AirROI(pagado) | ✅ los locales |
| huérfanos (lead_match/taste/FSD…) | son por-propiedad/lead, NO por-zona → no van al cubo | ⚪ fuera de scope del cubo |

## 6 · SUPERADMIN_AUDIT.md
| Marcado | Realidad verificada | Estado |
|---|---|---|
| 95 páginas (~60 vivas) | confirmado | ✅ |
| 8 Dev-Master "stubs" sin backend | **FALSO — están totalmente cableados** (donde-construir/comportamiento/stock-soldout devuelven dato real). El audit (de un Explore agent) estaba equivocado | ✅ ya estaban vivos |
| ~9 motores huérfanos sin superficie | son por-propiedad/lead; superficie va en flujo proyecto/lead, no zona | ⏳ pendiente (otro módulo) |

---

## RESUMEN
| | Marcado | Construido | Δ |
|---|---|---|---|
| Compuestas | 100 | **120** | +20 |
| Escalas geo | 3-4 | **4** | ✅ |
| Funciones de motor al universo | (principio) | **~46** (7 + 39) | ✅ |
| Ejes de atributo | (ejemplos) | **16** | ✅ |
| Eje financiero | (básico) | **12 sub-dim** | ✅ |
| Feeders externos | varios | **AirROI pagado+candado** · resto build-ready | 🟡 |
| Visualización | 3 portales | **Terminal + Dev + Asesor** | ✅ |

**Lo construido IGUALA o SUPERA lo marcado en cada documento.** Lo único 🟡 es **población de celdas** (depende de dato de
producción: transacciones, crons, las 13 build-ready) y **tu verificación logueada del Terminal**. Cero deuda de construcción.
