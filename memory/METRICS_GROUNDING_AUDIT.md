# Auditoría de Fundamentación de Métricas (Grounding)

> 2026-06-07 · 5 barridos paralelos sobre ~50 motores numéricos del backend. Disparado por founder tras detectar que el AVM saltaba 20% con coeficientes inventados. Pregunta: "¿cuántos índices/métricas más están calculados así y no coinciden con valores reales?"
> Leyenda: ✅ FUNDAMENTADO (fuente real / método estándar) · ⚠️ HEURÍSTICO (plausible pero elegido, sin derivar) · 🔴 INVENTADO (coeficiente arbitrario presentado como preciso, o dato sintético/random presentado como real).

## VEREDICTO
La sospecha del founder **se confirma en parte, con matiz clave**:
- ✅ Lo que toca DINERO LEGAL/REAL está SÓLIDO: impuestos (ISR/ISAI/predial con tablas oficiales DOF/Gaceta, auto-testeadas ±$5), hipoteca (Infonavit/Fovissste oficiales). El **hedónico real, DRPI, ARIMA, FSD** son ML de verdad.
- 🔴 Pero hay **3 niveles de problema** y algunos GRAVES: (1) **datos sintéticos/random presentados como reales**, (2) **constantes financieras stale/mal**, (3) **scores con fórmulas inventadas que se ven falsamente precisos**.

## 🔴 P0 — LO MÁS GRAVE (números inventados/sintéticos vendidos como reales)
1. **live_pulse_engine** — `trend_velocity` cuando `APIFY_TRENDS_REAL=false` (el caso normal) usa `hash(zona+semana)%50-25` = **ruido determinista**, pero entra al score 15%. → "velocidad de mercado" inventada.
2. **dmx_demand** — si no hay behavioral_events, usa `inventory=50` hardcodeado como "demanda"; `prob_venta` = fórmula aditiva (0.45 + ±0.25 + …) **matemáticamente sin sentido**, no validada vs cierres.
3. **state_of_cdmx_engine** — fallbacks con ROI hardcodeado (Polanco 18.4%, Condesa 16.2%) **sin fuente**; ROI/días-en-mercado derivados con fórmulas inventadas; predicciones (q3 8.2%, q4 9.1%) **puestas a mano**.
4. **investment_simulator** — `TIIE=9.5%` y `tasa hipoteca=13.5%` **hardcodeadas y stale** (real 2026 ~7% / ~10.5%) → infla costos ~250bps; `APREC_RATES` por tier inventadas; ROI mezcla plusvalía + flujo sin descontar.
5. **vertical_products (seguros)** — pesos de peligro (fuego 15%), factor edad (+1%/año vs ~0.3% real), prima = composite/50 → puede errar 100-200% vs cotización real.

## 🟡 P1 — Inconsistencias + scores con fórmula inventada (relativos, pero falsamente precisos)
- **Inconsistencia DENUE**: zone_score usa tope 3000 negocios/km², zone_subscores usa 500, real CDMX ~400. → mismos datos, scores distintos.
- **Fórmulas de score inventadas** (no son "valores reales", son rankings, pero se muestran como número preciso): gentrificación `mom*6+slope*1.5+15` · IAB `50+mom*4` · IDS `0.55*desir+mom*4` · pesos IDM/zone_score/dmx_project_score/health_score/score_inversion · buyer_score (pesos 25/20/15…) · fit_engine (38+ cortes a mano) · taste_profile (pesos 1.6/0.7/0.5/4/2…) · close_probability (mapas temp/stage + sigmoid×4) · hook_predictor (modo heurístico = conteo de tokens disfrazado de ML).

## 🟢 P2 — Heurísticas de valuación a afinar (ya empezado este punto)
- avm fallback (4%/recámara, 2.5%/baño), price_context (prima estrenar 18% + bandas ±7/9/22%), dmx_margin (umbrales 30%/15%), comparable_anomaly (5% caída, 85% sold-out), construction_cost (premios de zona Polanco 1.35× + math de inflación simplificada).

## ✅ NO TOCAR (está bien fundamentado)
- **tax_projector** (impuestos oficiales, auto-test) · **mortgage_calculator** (Infonavit/Fovissste oficiales) · **hedonic_regression** + **dmx_hedonic_atom** (OLS real, self-improving) · **drpi_engine** (índice anclado a transacciones) · **forecast_engine** (ARIMA+AIC) · **fsd_engine** (hedónico+CI) · **accuracy/model_validation** (stats puras) · **crime_data/perception_risk/denue/transaction_network** (datos reales SESNSP/INEGI/DENUE) · **cube_olap** (agregación determinista) · **ownership_economics** (constantes CDMX reales) · **probability_engine** (sigmoid/CDF correctos) · **lead_enrichment/conversation_confidence** (LLM/API real).

## MATIZ IMPORTANTE (para no sobre-reaccionar)
Dos tipos de salida:
- **VALOR REAL** (debe coincidir con algo medible: precio, costo, impuesto, tasa) → AHÍ el error duele. Los de impuesto/hipoteca están bien; el AVM fallback + investment_sim son los que hay que fundamentar.
- **SCORE RELATIVO** (ranking construido, NO existe un "valor real" de "gentrificación 38") → el riesgo no es "está mal" sino que se VE preciso. Fix: mostrarlos como **bajo/medio/alto** (lenguaje), nunca número crudo, + anclar a dato real donde se pueda.

## PLAN DE TRIAGE PROPUESTO
- **Tanda A (P0 honestidad):** quitar/etiquetar datos sintéticos (live_pulse trend, dmx_demand proxy, state_of_cdmx fallbacks) → "sin dato aún" en vez de inventar; corregir TIIE/tasa hipoteca (a config/fuente). 
- **Tanda B (P1 consistencia):** unificar tope DENUE; convertir scores inventados a señal direccional (bajo/medio/alto) en TODA superficie usuario + marcar "señal DMX, no medición".
- **Tanda C (P2 valuación):** afinar avm fallback/price_context/margin contra comparables reales (ya iniciado con homologación).
- **Regla nueva:** todo coeficiente lleva comentario con su fuente o la palabra "heurístico"; todo número al usuario que sea score relativo se muestra como banda, no decimal.
