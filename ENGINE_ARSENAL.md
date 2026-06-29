# ARSENAL DE MOTORES — DesarrollosMX (catálogo completo)

339 módulos · **154 `_engine.py` + ~40 núcleo = ~190 motores** · 223 rutas. Catalogados uno por uno por 8 exploradores.
Columna clave = **qué podemos HACER**. Estado: 🟢 vivo con dato local · 🟡 necesita cron/conector/API-key · ⚪ puro sin I/O.

> Lectura de fondo: el cuello de botella NO es construir — es **prender feeders** (crons + conectores con credenciales) y
> **fusionar** lo que vive en silos. El moat ("Bloomberg/HouseCanary de MX") ya está casi todo codificado.

---

## 1 · VALUACIÓN & PRECIO (el AVM y su ecosistema)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| avm_public_engine | Valuar cualquier propiedad (hedónico + fallback heurístico) → precio + rango | 🟢 |
| hedonic_regression_engine | Modelo OLS por zona×tier (precio/m² ~ 8 features) = AVM profesional con r²/RMSE | 🟢 si ≥30 muestras |
| fsd_engine | Valor + intervalo de confianza 80% + qué features pesan = "valor certero" | 🟢 |
| avm_feature_engine | Homologación perito (Heidecke/Ross): ajustar por vista/edad/orientación, acotado ±28% | ⚪ |
| avm_explain_engine | Explicar POR QUÉ cuesta X (contribución por feature) = transparencia que da confianza | 🟢 |
| weight_optimizer | Auto-sintonizar pesos del AVM por zona (Ridge, ≥50 cierres) | 🟡 |
| accuracy_engine | Auditar AVM vs precio de cierre real (MAPE/hit-rate) | 🟡 |
| golden_calibration_engine | Validar que las fórmulas reproducen casos reales (Puente Alvarado) | 🟢 |
| model_validation_engine | R²/RMSE/MAPE de modelos públicos = metodología auditable | 🟢 |
| comparator_engine | Comparar 2-3 propiedades lado a lado (AVM+IE+DRPI+riesgo+tax+veredicto IA) | 🟢 |
| comparable_anomaly_engine | Alertar "tu comparable bajó 5% / se agotó / nuevo lanzamiento" | 🟢 |
| cma_engine | CMA completo 1-click (6 motores) = memorándum con comparables+forecast+narrativa | 🟢 |
| market_estimate_engine | Precio en 3 capas (real→estimado→aproximado) etiquetado honesto, sin scraping | 🟢 |
| price_context_engine | Posicionar precio vs obra nueva + reventa + "prima de estrenar" | 🟢 |
| drpi_engine | Índice de precios mensual por zona×tier (base 100) = "Bloomberg inmobiliario" | 🟡 |
| forecast_engine | ARIMA 6/12/24m sobre DRPI + CI95 = qué zona va a subir más | 🟡 hist 6+ |

## 2 · ZONA & ÍNDICES (inteligencia geográfica)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| zone_score_engine | Score A-F por zona (6 dims: liquidez/oferta/demanda/riesgo/yield/comercio) | 🟢 |
| zone_subscores_compute | 6 subscores (seguridad/transporte/educación/amenidades/precio/vibe) | 🟡 cron |
| zone_cycle_engine | Etapa del ciclo (recuperación/expansión/maduro/contracción) + gentrificación + renta | 🟢 |
| perfil_zona_engine | Perfil de zona unificado + "qué le falta" (giros sub-atendidos) | 🟢 |
| liv_engine | "Mismo dato, 4 lentes": una zona puntúa distinto por perfil (familia/joven/inversión) | 🟢 |
| dmx_indices_engine | 5 índices compuestos (IPV/IAB/IDS/IRE/ICO) + maestro IDM = 1 número por zona, licensable | 🟢 |
| score_bridge | Mapear subscores reales a 7 dimensiones, marcar real vs stub | 🟡 |
| score_engine | Framework de 40+ recetas IE (educación/seguridad/movilidad) sin inventar | 🟢 |
| recipe_catalog | Saber qué dato falta y de qué fuente sale (mapa de 40+ recetas) | ⚪ |
| live_pulse_engine | "Bloomberg Terminal CDMX": 5 señales → pulso 0-100 por colonia + alertas volatilidad | 🟡 |
| state_of_cdmx_engine | "Estado de CDMX": top ROI + demanda/oferta para inversionistas | 🟡 |
| terminal_mercado_engine | Vender datos B2B: 3 índices + Grafo Comprador + Cerebro, k-anónimo | 🟡 |
| demanda_demografica_engine | Potencial de demanda donde NO hay búsquedas (modelo EPRAV/INEGI) | 🟡 |

## 3 · RIESGO (seguridad + natural)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| risk_score_engine | Riesgo compuesto A-F (crimen 40% + natural 25% + percepción 20% + título 15%) | 🟢 |
| crime_fgj_engine | Delito ponderado por colonia + percentil "más seguro que X%" | 🟡 FGJ |
| crime_data_engine | Delito por alcaldía (SESNSP mensual) + escaladas | 🟡 cron |
| natural_risk_engine | Riesgo sísmico/inundación/hundimiento por predio (Atlas CDMX/CENAPRED) | 🟡 |
| perception_risk_engine | % percepción de inseguridad (INEGI ENVIPE) | 🟡 |
| climate_migration_engine | "Dónde se mudan" por clima (migración intra-CDMX) | 🟡 |
| fraud_detection_engine | Alertas de listing fraudulento (anomalía precio + duplicado + título) | 🟢 ML |

## 4 · DEMANDA & ABSORCIÓN (el moat de la demanda)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| demand_intelligence | "¿Cuántos buscan gym+terraza en Polanco hoy?" + 20 granularidades + zona 3 escalas | 🟢 |
| demand_twin_engine | Gemelo de demanda (SimCity): score de oportunidad por zona = dónde construir | 🟢 |
| absorcion_engine | Absorción real por cohorte: % vendido · velocidad/mes · meses para agotar | 🟢 |
| grafo_comprador_engine | Qué quiere cada perfil (rec/baños/precio/amenidades) por colonia×etapa de vida | 🟢 |
| generador_producto_engine | Qué construir: mezcla óptima de tipología por terreno (CUS + demanda) | 🟢 |
| simulador_palancas_engine | "Sin terraza→con terraza = +12% venta" (lifts aprendidos por Cerebro) | 🟢 |
| reverse_search_engine | Búsqueda en lenguaje natural ("3 rec Polanco máx 8M") → ranking | 🟢 |
| fit_engine / lead_match | Match lead↔propiedad 0-100 (6 dims) = recomendador | 🟢 |
| mood_engine | Quiz → mood 5D → "¿qué propiedad te SIENTE bien?" (sin LLM) | 🟢 |
| preferencias_engine | Deseabilidad por unidad (vista/privacidad/lujo) + tono de marketing por zona | 🟡 |

## 5 · INVERSIÓN & FINANZAS (grado institucional)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| inversion_v4_finance | NOI/cap rate/DSCR/TIR/MIRR/VPN/equity multiple (motor institucional puro) | ⚪ |
| inversion_v4_tax | ISR/IVA México 2026 (art.152, RESICO, venta/renta) | ⚪ |
| inversion_v4_veredicto | Veredicto en lenguaje simple (semáforo vs CETES) = lead magnet | ⚪ |
| investment_simulator_engine | 3 escenarios (conservador/base/optimista) ROI a 5/10 años | 🟢 |
| score_inversion_engine | Score de inversión 0-100 AAA-B por colonia (TIR+zona+demanda+stress) | 🟢 |
| ownership_economics_engine | Comprar vs rentar + TCO a N años = "¿en qué año comprar conviene?" | 🟢 |
| whatif_engine | "¿Qué pasa si subo precio 10% / doy promo?" → delta en conversión/días | 🟡 |
| tax_projector_engine | Impuestos CDMX 2026 (ISR/ISAI/predial) año a año | 🟢 |
| valor_residual_engine | "¿Cuánto máximo pago por este terreno?" (residual land underwriting) | 🟡 |
| bancabilidad_engine | Score A-F de bancabilidad del proyecto (absorción+zona+prob venta) | 🟡 |
| inversionista_engine | Memo inversionista + perfil de inquilino + decisión de comercio PB | 🟢 |
| vertical_products_engine | Empaquetar 4 productos B2B (valuation/comparables/risk/fraud) white-label | 🟡 |

## 6 · DUE DILIGENCE & SUELO (lado dev)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| predio_due_diligence_engine | Revisión 5-capas del terreno (zonificación/riesgo/legal/técnico/Norma3) | 🟢 |
| norma3_engine | "¿Cuánto ganas si fusionas predios?" (colonias vecinas con más CUS) | 🟢 |
| lote_veredicto_engine | Veredicto único del lote (valor residual + DD + Norma3) | 🟢 |
| construction_cost_engine | Costo de construcción/m² por zona/tipo/tier (BANXICO+INEGI) | 🟡 |
| construction_quality_engine | Índice de calidad de obra 0-100 (avance/acabados/defectos/cronograma) | 🟢 |
| dmx_margin | Margen % + semáforo verde/amarillo/rojo por proyecto | 🟢 |
| dmx_project_score | "PageRank" del proyecto: 1 número 0-100 para rankear cualquiera vs cualquiera | 🟢 |
| sig_catastro_engine / catastro_sig_engine | Valor catastral del suelo $/m² (SIGCDMX, 6.8M predios) | 🟡 |
| valores_unitarios_engine | Valores unitarios oficiales 2026 (Gaceta CDMX) | 🟡 |
| shf_engine | Plusvalía oficial SHF por alcaldía (ancla de valuación, no especulación) | 🟢 |
| cross_check_engine | Certificar documentos (escritura vs LP, predial vencido) antes de marketplace | 🟢 |

## 7 · CUBO, GRAFO & DATOS (el espinazo invisible)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| cube_olap_engine | OLAP multidimensional (zona×tipo×tier×periodo) en 5 niveles city→unit | 🟡 |
| metrics_cube_aggregations | Agregar devs+units+leads+IA por 5 tiers × 4 periodos = cubo vendible | 🟡 cron |
| dmx_cube_feed | Llenar el cubo con átomos (tipología/m²/roof/parking) — ya no "unknown" | 🟢 |
| cube_cache | Cache OLAP en memoria (swappable a Redis) | ⚪ |
| transaction_network_engine | Cierres anónimos (k-anon) = base de DRPI + fraude + comparables = moat | 🟢 |
| knowledge_graph_engine | Grafo Neo4j (8 nodos, 10 edges): dedup + comparables + relaciones | 🟡 Neo4j |
| entity_resolution_engine | Dedup de leads 8-capas (email/tel/nombre/dirección) + anti-fraude | 🟢 |

## 8 · LEAD & CRM (pipeline del asesor)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| buyer_score_engine | Score de comprador 0-100 (7 dims) = quién es el lead más caliente | 🟢 |
| close_probability + tuning | P(cierre) por lead + auto-aprende de cierres reales | 🟢/🟡 |
| churn_prediction_engine | Riesgo de abandono del comprador (uso reciente vs baseline) | 🟢 |
| predictive_alerts_engine | "Lead enamorado / enfriándose" antes de perderlo (8 reglas) | 🟢 |
| lead_journey_engine | Timeline de 15 pasos (captured→closed) = dónde se atora | 🟢 |
| lead_nurture_engine | Avisar a leads cuando hay devs nuevos en su zona (anti-spam 7d) | 🟡 |
| lead_enrichment_engine | Enriquecer lead (empresa/rol/LinkedIn) waterfall PDL/Clearbit/LLM | 🟡 |
| lead_capture_marketplace_engine | Convertir anónimo→lead con "tu auditoría fiscal" (score conductual) | 🟢 |
| lead_capture_engine | Alias privado de email para leads (no expone email real) | 🟢 |
| house_pool_engine | Repartir leads sin asesor (round-robin por zona/carga) | 🟢 |
| smart_lists_engine | "Mis leads calientes / sin contactar 48h / estancados" en 1 tap | ⚪ |
| pipeline_engine | Máquina de estados del lead (7 etapas con reglas) | ⚪ |
| cross_sell_engine | Monetizar: ofertas de hipoteca/seguro/avalúo + routing a partners | 🟢 |

## 9 · IA CONVERSACIONAL & AGENTES
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| asistente_engine / atlax_engine | Chat público (Atlax) que perfila al comprador y hace hand-off | 🟢 |
| atlax_persona_engine | Personalidad de Atlax por tenant (voz de marca) | ⚪ |
| buyer_coach_engine | Coach de compra en 7 etapas (precalificación→cierre→post-compra) | 🟢 |
| conversation_engine | Chat asesor↔lead context-aware (RAG+DISC+SOC+Hook+KB+Enrich) | 🟢 |
| director_agent_engine + memory | Agente orquestador multi-tenant con tool-calling + RAG de memoria | 🟡 |
| voice_atlax_engine | Atlax por voz (Whisper STT + ElevenLabs TTS) | 🟡 |
| reverse_search / hook_predictor / disc_inferencer | Búsqueda natural · score de copy · inferir DISC del lead | 🟢/⚪ |
| narrative_engine + narrative_layer_engine | Storyteller IA por audiencia (inversor/familia) con presupuesto | 🟡 |
| rag_engine + rag_reindex_cron | "¿Qué dicen nuestros reportes de Polanco?" con citas auditables | 🟢/🟡 |
| conversation_* (confidence/cost/disc/hook/kb_gaps/enrich) | Calibrar IA: handoff si duda · modelo más barato · FAQ auto · enriquecer | 🟢 |

## 10 · CEREBRO & APRENDIZAJE (el flywheel)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| cerebro_mercado_engine | El mercado APRENDE: predice demanda, al vender compara real vs predicho, reentrena | 🟢 |
| estudio_autopiloto_engine | Estudio vivo: detecta cambios reales y se regenera | 🟢 |
| close_probability_tuning | Aprende qué señales predicen cierre desde deals ganados/perdidos | 🟡 |
| pipeline_drift_personal | "¿El asesor perdió velocidad?" (baseline 30d vs 7d) | 🟡 |

## 11 · STUDIO & CONTENIDO (marketing del asesor/dev)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| studio_landing_engine (+atlax_adapter) | Landing sin código (10 templates) auto-llenada con data de zona + A/B | 🟢 |
| studio_carrusel_engine (+ab) | Carruseles multipantalla (IG/TikTok/WA) + ganador A/B chi-square | 🟡/⚪ |
| studio_video_engine / video_standalone_engine | Script + video de propiedad con fallback multi-proveedor | 🟡 |
| studio_buyer_copy / hook_score / brand_kit | Copy por persona×DISC · score de gancho · kit de marca | 🟡 |
| brochure_engine | Brochure en 5 estilos (PDF + crops sociales) | 🟡 |
| parallax_engine | Video 3D parallax LOCAL desde fotos en orden de gusto del comprador | ⚪ |
| virtual_staging_engine | Amueblar foto vacía en 6 estilos (SDXL/Replicate) | 🟡 |
| tour_3dgs_engine | Tour 3D Gaussian Splatting (Luma/Polycam) embebible en ficha | 🟡 |
| social_cards_engine / social_ads_engine | Tarjetas OG con marca+KPIs · gestionar anuncios Meta | 🟢/🟡 |
| marketing_mcp_engine / mcp_distribution_engine | Publicar a X/LinkedIn/Telegram/Discord · rastrear adopción MCP | 🟢 |
| reputation_monitor_engine | Qué dicen de la marca en redes/prensa (sentiment + alertas) | 🟡 |

## 12 · CONECTORES & DATOS EXTERNOS (los feeders)
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| connectors_ie + connector_registry | Framework de conectores (NOAA/datos-CDMX/FGJ/OSM/Banxico/INEGI/AirROI) + healthchecks | 🟡 |
| gov_data_mx_engine | Datos oficiales (BANXICO/DataMéxico/CONAVI/SESNSP/CENAPRED) | 🟡 |
| external_insights_engine | 12 fuentes macro globales (BIS/OECD/IMF/FRED/Zillow…) para contexto | 🟡 |
| apify_trends_engine | Google Trends (qué busca el mercado) vía Apify | 🟡 |
| google_places_ingest / osm_engine | Densidad real de amenidades por colonia (Places + OSM Overpass) | 🟡 |
| market_rates_engine | CETES/FIBRAs vivos de Banxico (calculadoras se actualizan solas) | 🟡 |
| dmx_external_enrich | 4 fuentes (AirROI/GTFS/OSM/catastro) enchufables sin tocar código | 🟡 |
| drive_engine + bulk_ingest_engine | Ingerir 100 proyectos desde una carpeta Drive en ~20 min | 🟡 |
| document_intelligence + extraction_engine | OCR + extracción LLM de escrituras/predial/planos | 🟡 |
| auto_sync_engine | Dev edita documento → marketplace se actualiza solo (revertible) | 🟡 |

## 13 · MONETIZACIÓN, OPS & GOBERNANZA
| Motor | Qué podemos hacer | Estado |
|---|---|---|
| feature_flags_engine / feature_gate_engine | Paywalls por plan (free/pro/enterprise) + A/B + rollout | 🟢 |
| ai_quota_engine / ai_cost_aggregations / conversation_cost_* | Cuotas IA por tier · costo por asesor/tenant · forecast de gasto | 🟢 |
| stripe_billing_engine | Suscripciones SaaS multi-tenant | 🟡 |
| soc_franchise_engine | Certificar asesores (bronce→platino) = franquicia premium | 🟢 |
| marketplace_templates_engine | Asesores venden sus workflows como plantillas (split 70/30) | 🟢 |
| private_beta_engine | Códigos invite + gating de beta | ⚪ |
| compliance_engine / anonymization_engine / audit_immutable_engine | DSR LFPDPPP · k-anonimato · auditoría irrevocable (anti-tampering) | 🟢 |
| diagnostic_engine / health_score | Autohealth (cables rotos/data stale) · score operativo | 🟢 |
| notifications_engine / whatsapp_engine / resend_engine | Notificaciones multi-canal · WhatsApp · email transaccional | 🟢/🟡 |
| workflow_engine / auto_pilot_engine | Automatizar pipeline (DAG triggers→actions) · autopilot de asesor | 🟡 |
| ab_testing_engine | A/B determinístico de features/UX | ⚪ |

---

## SÍNTESIS — qué desbloquea el arsenal (los productos/moats)
1. **HouseCanary de MX por zona**: AVM + hedónico + FSD + DRPI + forecast + zone_score + ciclo + riesgo + inversión + absorción → ya fusionado parcialmente en `zone_intelligence`.
2. **Bloomberg de MX (B2B vendible)**: dmx_indices + terminal_mercado + cube_olap + transaction_network + state_of_cdmx.
3. **Moat de demanda**: demand_intelligence + demand_twin + grafo_comprador + absorcion + cerebro (aprende) = el "qué/dónde construir" que nadie más tiene.
4. **Underwriting del dev**: valor_residual + norma3 + due_diligence + margin + project_score + generador_producto.
5. **Inversión institucional**: inversion_v4 (finance+tax+veredicto) + score_inversion + whatif + ownership = grado institucional.
6. **Pipeline IA del asesor**: buyer_score + close_probability(+tuning) + predictive_alerts + churn + conversation + autopilot.
7. **Fábrica de contenido**: studio_* + parallax + staging + 3dgs + social + marketing_mcp.

**El cuello de botella es prender feeders, no construir.** 🟢 corre hoy · 🟡 espera cron/credencial · ⚪ es puro.
