# W5.5 · Live Pulse · "Bloomberg Terminal de CDMX residencial" · Spec canónico

**Última actualización**: 2026-05-17 (rescatado de sesiones 2026-05-09/13/16 por Agent forense)

**Doc canónico** que define qué construimos en W5.5 · origen · scope · STUB mode.

---

## 0 · Origen (trazable)

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-09 23:36 | `760b7418` | **NACIMIENTO** — análisis competitivo DMX vs LocalLogic/Cherre/HouseCanary/CoStar · identificado "Gap masivo #2 · Live Market Pulse en tiempo real" |
| 2026-05-12-13 | `b5ec2643` | Scope consolidado en WAVE5_PLAN · 12h originales |
| 2026-05-16 | `1dd23ac9` | Founder decision STUB MODE: "todos batches bloqueados = STUB AHORA · flip env var cuando pague Apify $49/mo" · escala 12h → 25h |

---

## 1 · Por qué Live Pulse (el caso competitivo)

```
LocalLogic       ❌ Sin live signals
Cherre           ❌ Datos estáticos relacional
HouseCanary      ⚠️ Forecasts mensuales (stale)
CoStar           ⚠️ Trends trimestrales (muy stale)
DMX hoy          ✅ Tiene behavioral en vivo + Atlax threads (sub-utilizado)
```

**Insight clave** (Claude 2026-05-09 verbatim):
> *"HouseCanary forecast 36mo es estático mensual · CoStar trends son trimestrales · DMX ya tiene behavioral data **en vivo**. DMX puede construir CDMX Live Pulse · ventana early-detect 2-3 semanas antes que portales reflejen."*

**Posicionamiento founder-aprobado**: **"Bloomberg Terminal de CDMX residencial"**.

---

## 2 · Scope canónico (2026-05-13 + STUB scope 2026-05-16)

| Dimensión | Decisión |
|---|---|
| **Tipo** | Mercado + Zona (heatmap CDMX + alertas zonal trending) |
| **Audiencia** | **T3 inversionista/dev** (alertas push + dashboard analytics) + **T0 público** (read básico landing zona) |
| **Métricas éxito** | Latency detección <30s · 50+ zonas trackeadas · 7d retention behavioral |
| **Fuentes data** | `behavioral_events` (W4.3) + `apify_trends_cache` (W4.18.1) + `atlax_threads` (W4.4-W4.11a) + `zones` (W3.1) |
| **STUB mode** | Apify FREE no entrega trends reales · cuando founder paga $49/mo flip env var · cero rework |
| **Fallbacks** | Si Apify falla → cache 7d · si behavioral=0 → "insufficient_data" honest |
| **Alimenta** | W5.6 Scenario Storyteller (narrativizar pulses como historias LLM) |

---

## 3 · Señales (signals) detectadas

| Signal | Cálculo | Threshold alert |
|---|---|---|
| **search_velocity_change** | (atlax_threads queries últimas 24h / promedio 7d) − 1 | +30% = trending |
| **view_volume_change** | (behavioral_events views zona 24h / promedio 7d) − 1 | +25% = hot |
| **trend_velocity** | apify_trends_cache slope últimos 7d (cuando UP del STUB) | +20% = rising |
| **lead_intent_velocity** | (leads creados zona 7d / promedio 30d) − 1 | +40% = surge |
| **price_movement** | DRPI delta 7d (si W5.3 forecast disponible) | ±5% = significant |

**Score compuesto pulse**: weighted sum (search×0.35 + view×0.25 + trend×0.15 + lead×0.20 + price×0.05) → escala 0-100.

---

## 4 · Sub-chunks propuestos (~25h)

### Sub-A · Backend engine + ETL agregación (~8h)
- `live_pulse_engine.py` con 5 signal computers
- Cron `live_pulse_cron` cada 5min compute_pulse(50 zonas top)
- Persist `live_pulse_snapshots` collection con TTL 30d
- Alert dispatcher: si score > threshold → notif kg_alert-style
- STUB mode: si `APIFY_TRENDS_REAL=false` → trend_velocity usa heurístico determinista

### Sub-B · Endpoints API (~4h)
- `GET /api/live-pulse/zones?limit=50&sort=score_desc` → ranking
- `GET /api/live-pulse/zone/:slug/timeline?hours=168` → últimas 7d
- `POST /api/live-pulse/alerts/subscribe` (T3 only) → suscripción zona+threshold
- `GET /api/live-pulse/alerts/my-subs` (T3) → mis suscripciones
- Audit log integrado

### Sub-C · UI Dashboard superadmin "Pulse CDMX" (~8h)
- `/superadmin/live-pulse` aurora sección INTELIGENCIA (morado)
- 4 tabs:
  1. **Heatmap CDMX** (reusa Mapbox W4.18.2) con color por score 0-100
  2. **Top trending** lista zonas hot 24h/7d
  3. **Timeline zona** click zona → chart recharts 7d con 5 signals overlay
  4. **Alerts config** thresholds + zones subscribe per signal

### Sub-D · Widget público + dev (~5h)
- Widget "Pulse de tu zona" en zone landing pública `/zona/:slug` (T0 read básico)
- Widget en dashboard dev `/desarrollador` "Tus proyectos · pulse zona"
- Push notification subscribe modal T3 (compradores premium · TBD H2)
- i18n namespace `live_pulse`

---

## 5 · Cierre ciclos (NO aislado)

**Alimenta**:
- ✅ behavioral_events W4.3 → view_volume_change signal
- ✅ apify_trends_cache W4.18.1 → trend_velocity signal (STUB hasta upgrade)
- ✅ atlax_threads W4.4-W4.11a → search_velocity_change signal
- ✅ zones W3.1 → 50 zonas tracked
- ✅ leads collection → lead_intent_velocity
- ✅ W5.3 forecast → price_movement signal (opcional)

**Consume**:
- 🔜 W5.6 Scenario Storyteller (ya shipped) → puede narrativizar pulses como story
- 🔜 W5.12 KG → notif kg_relational_alert puede usar pulse signals
- 🔜 W5.4 Buyer Score → factor "zona caliente" alimenta score
- 🔜 Atlax tool 19 → query_knowledge_graph puede preguntar "pulses históricos zona X"

---

## 6 · STUB MODE pattern

Cuando `APIFY_TRENDS_REAL=false` (default actual):
- `trend_velocity` retorna heurístico determinista basado en `zone_subscores` + dia semana
- Resto signals 100% reales (behavioral + atlax + leads ya existen)
- UI muestra badge "STUB" solo en trend_velocity · resto badges "live"
- Cuando founder paga Apify $49/mo · cambia `APIFY_TRENDS_REAL=true` · zero rework

---

## 7 · Decisiones pendientes founder

1. **STUB mode confirmation**: confirmar Apify FREE hasta completar build W5 (ya documentado · solo verificar)
2. **Audiencia T3 alerts push**: ¿push real (browser/email) o solo in-app NotificationCenter?
3. **Heatmap Mapbox reuse**: ¿usar `MapaCDMX` W4.18.2 existente o componente nuevo?
4. **1 batch o partir**: 25h en 1 batch viola "≤120L prompt" · recomendación = partir en 2 (P1 backend+endpoints 12h · P2 UI superadmin + widgets 13h)

---

## 8 · Reglas inviolables

1. **STUB consciente**: signals reales (behavioral/atlax/leads) NO degradar · solo trend_velocity es STUB
2. **NO duplicar data**: live_pulse_snapshots TTL 30d · histórico se calcula on-the-fly
3. **Latency target <30s**: cron cada 5min · cache 60s endpoint
4. **Permission gates**: alerts subscribe T3+ · dashboard T0 públicos · superadmin todo
5. **Cero crash si Apify down**: fallback heurístico siempre
