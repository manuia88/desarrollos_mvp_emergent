# W5.19 · Probability UX (Kalshi-inspired) · Spec canónico

**Última actualización**: 2026-05-18 (rescatado de sesión 2026-05-08 por Agent forense · founder approved 6h · 1 batch)

**Doc canónico** que define qué construimos en W5.19 · origen · scope.

---

## 0 · Origen (trazable)

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-08 20:22 | `6682a26f` | Founder pegó URL `kalshi.com` · pidió análisis · Claude propuso 5 ideas |
| 2026-05-08 | `6682a26f` | Founder aprobó 4 ideas Kalshi (W4.17) + 1 Smart Notifications |
| 2026-05-10 | `c5e6246e` | Probability UX 6h diferido de W4.17 → W5.19 · razón: dependía AVM W5.1 + Forecast W5.3 (ahora ✅ shipped) |
| 2026-05-18 | actual | Founder approved 6h · 1 batch · T0 público · tooltip sencillo |

---

## 1 · Qué es

**Capa UX pura** que convierte números crudos (DRPI · AVM · forecast) en **% probabilidades visuales estilo Kalshi/Robinhood**.

**NO es** real prediction market (regulación CNBV bloqueada).
**SÍ es** display layer sobre módulos shipped existentes.

### Posicionamiento

> "Diferencia entre Bloomberg Terminal (analistas) y Robinhood (retail masivo). DMX hoy = Bloomberg-style. Probability UX nos convierte en Robinhood-style → adopción retail masiva."

---

## 2 · 3 use-cases iniciales

| Use-case | Cálculo | Source |
|---|---|---|
| **"73% probabilidad este proyecto vende completo 12m"** | velocity comparables · what_if_engine | W4.4D |
| **"82% probabilidad zona Polanco DRPI sube 3m"** | hedonic + trend slope · sigmoid | W5.3 forecast |
| **"45% probabilidad este depto cierra debajo listed"** | AVM value vs listed · distribución normal | W5.1 AVM |

---

## 3 · Scope canónico · 6h · 1 batch

| Decisión | Valor |
|---|---|
| **Audiencia** | T0 público todos · sin gate tier (founder decision 2026-05-18) |
| **Tooltip** | Sencillo · badges sources con icon (AVM · Forecast · What-if) · NO números crudos (founder decision) |
| **Backend** | NUEVO `probability_engine.py` + 1 endpoint unificado · NO collections nuevas |
| **Frontend** | 2 components shared (Badge · Bar) · insertados en 4 surfaces |
| **Atlax integration** | Tool #20 query_probability · LLM puede invocar |
| **Fallback** | Si data insufficient → mensaje "Predicción no disponible" honest |

---

## 4 · Sub-chunks · 6h

### Sub-A · Backend probability_engine (~2h)

- `probability_engine.py` NEW · 3 funciones async:
  - `compute_sells_complete(project_id, months=12)` → usa what_if_engine W4.4D
  - `compute_zone_drpi_up(zone_slug, months=3)` → usa forecast_engine W5.3 slope + sigma
  - `compute_closes_below_listed(property_id)` → usa avm_engine W5.1 valor vs listed
- Cada función retorna `{probability_pct, confidence_lvl, sources: ["AVM","Forecast","WhatIf"], computed_at, insufficient_data: bool}`
- Endpoint `GET /api/probability/{type}?id=X&months=Y` → router unificado
- Audit log opcional (no critical) · cache LRU 60s per query

### Sub-B · Frontend components shared (~3h)

- `<ProbabilityBadge />` shared · pill compacto formato "82% sube" · color-coded (verde≥70 · amarillo 40-70 · rojo<40)
- `<ProbabilityBar />` Kalshi-style bar horizontal + tooltip con sources icons (NO números crudos)
- Insertar en 4 surfaces:
  1. Marketplace cards (`<ProbabilityBadge />` compacto)
  2. `/valor/:slug` (`<ProbabilityBar />` close-below-listed)
  3. `/detalle-proyecto/:slug` (`<ProbabilityBar />` sells-complete 12m)
  4. `/zona/:slug` (`<ProbabilityBar />` DRPI-up 3m)
- Hidden si `insufficient_data=true` (NO empty state vacío)

### Sub-C · i18n + Atlax tool (~1h)

- i18n namespace `probability` con strings: titles, types, tooltips, source_labels, confidence_levels, fallback
- Atlax `asistente_engine.py` tool #20 `query_probability(type, entity_id)` whitelisted · 3 types permitidos · response shape consistente
- System prompt Atlax extension: "Usa tool query_probability cuando user pregunte sobre probabilidades de eventos (vende-completo · DRPI sube · cierra debajo precio). NO inventes números. Si insufficient_data → di honest 'data acumulándose'"

---

## 5 · Cierre ciclos (NO aislado)

**Consume** (módulos shipped):
- ✅ `avm_engine` W5.1 → AVM puntual + sigma
- ✅ `forecast_engine` W5.3 → DRPI slope + confidence
- ✅ `what_if_engine` W4.4D → velocity comparables · sells-complete
- ✅ `fsd_engine` W5.15 → confidence intervals refinan probabilidades

**Alimenta** (5 surfaces shipped):
- ✅ Marketplace cards (componentes existentes)
- ✅ `/valor/:slug` (ValorColonia)
- ✅ `/detalle-proyecto/:slug` (DevelopmentDetail)
- ✅ `/zona/:slug` (ZonePage)
- ✅ Atlax IA tool #20

---

## 6 · Reglas inviolables

1. **NO real prediction markets** (regulación CNBV)
2. **NO inventar números** · si data insufficient → "Predicción no disponible"
3. **NO números crudos en tooltips** · solo iconos sources (founder decision)
4. **T0 público todos** · sin gate tier
5. **Hidden gracefully** si insufficient_data · NO renderizar empty state vacío
6. **Cache LRU 60s** evita spam queries · audit opcional

---

## 7 · Upgrades evaluados (5 · ninguno recomendado P1)

| Upgrade | Score | Veredicto |
|---|---|---|
| Update real-time websocket | 7/10 | Over-engineering · HTTP cache 60s suficiente |
| Historical probability accuracy ("¿82% acertó real?") | 8/10 | Backlog 6m (necesita data acumulada) |
| Probability per buyer segment | 6/10 | Scope creep · backlog post-W5.4 tracción |
| Personalización buyer profile | 5/10 | Over-engineering H1 |
| Share-able cards Twitter/WA viral | 7/10 | Marketing fit pero backlog post-launch |

**Recomendación**: ship clean 6h · acumular data · decidir upgrades cuando MAPE/sample suficiente.

---

## 8 · Próximo paso

1. Persistir spec ✅
2. Update MEMORY.md index
3. Commit + push docs
4. Escribir prompt W5.19 emergent (6h · 1 batch · 3 sub-chunks A/B/C)
5. Founder pega · emergent ships · merge + docs
