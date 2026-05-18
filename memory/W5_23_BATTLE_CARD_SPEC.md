# W5.23 · Dev Battle Card (Competitive Intelligence) · Spec canónico

**Última actualización**: 2026-05-18 (rescatado de sesión 2026-05-09/13 por Agent forense · founder approved Plan B 17h)

**Doc canónico** que define qué construimos en W5.23 · origen · scope · 3 upgrades approved.

---

## 0 · Origen (trazable)

| Fecha | Sesión | Evento |
|---|---|---|
| 2026-05-09 | WAVE5_PLAN canónico | W5.10 = "Dev Battle Card 12h" original |
| 2026-05-12 | autorización macro | Founder OK Wave 5 H2 batches |
| 2026-05-13 | `b5ec2643` | Claude detectó conflict numbering: W5.10 también asignado a "Social/Ads 233h" · propuso renombrar Battle Card → W5.23 (Opción A) · founder OK |
| 2026-05-18 | actual | Founder approved Plan B 17h (core 12h + 3 upgrades) |

**Note**: el Component "BattleCard T3" básico ya shipped en W4.18.2B (2026-05-14) como parte de Mapa cross-features · W5.23 es la versión avanzada premium.

---

## 1 · Qué es

**Pantalla T3 dev premium** que muestra "tu proyecto vs competidores" con scoring competitivo + acción recomendada + ranking semanal. Es la **intelligence-grade** version del card visual W4.18.2B.

### Posicionamiento

> "Tu Bloomberg Terminal competitivo · cómo va tu proyecto vs Vinte, Be Grand, Quiero Casa, ARA cada semana"

---

## 2 · Scope Plan B canónico · 17h · 1 batch

### Core (12h)
- `battle_card_engine.py` agregación cross-data
- Scoring competitivo 0-100 por dimensión (precio · ventas · zona · marketing · lead-gen)
- Ranking semanal vs top 3 competidores por zona
- Recomendación acción next-step (estilo Y.2A-C recommendations)
- Page `/desarrollador/battle-card/:project_id` aurora dev portal
- Endpoints API + permission gate T3

### 3 Upgrades approved (5h)
| # | Upgrade | h | Score |
|---|---|---|---|
| **B** | **PDF export institucional** (reportlab estilo Fitch/W5.15) para comité inversión | +2h | 9/10 |
| **C** | **Email weekly digest** "Tu Battle Card · semana N" cron lunes 08:00 UTC | +2h | 8/10 |
| **D** | **Atlax tool #21 `query_battle_card`** explicar posición competitiva | +1h | 8/10 |

---

## 3 · Sub-chunks · 17h Plan B

### Sub-A · Battle Card engine core + endpoints (~6h)
- `battle_card_engine.py` NEW · agregación cross-data:
  - `get_my_score(project_id)` → score 0-100 por dimensión (5 dims: precio · ventas · zona · marketing · lead-gen)
  - `get_top_competitors(project_id, zone_slug, limit=3)` → top 3 devs misma zona
  - `compute_ranking(project_id, zone_slug)` → rank actual + delta vs semana pasada
  - `recommend_next_action(project_id)` → acción específica (reuse Y.2A-C recommendations engine)
  - `insufficient_competitors_check` → si comp count <3 → flag honest
- Collection `battle_card_snapshots` schema: `{id, project_id, dev_org_id, zone_slug, week_iso, my_score, competitor_scores, ranking, delta_pp, recommended_action, computed_at}` TTL 90d
- Cron `battle_card_weekly_cron` @ domingo 23:00 UTC · compute snapshot todos proyectos T3
- 4 endpoints:
  - `GET /api/dev/battle-card/:project_id` → my_score + 5 dims + ranking
  - `GET /api/dev/battle-card/:project_id/competitors` → top 3 + scores
  - `GET /api/dev/battle-card/:project_id/history?weeks=12` → ranking timeline
  - `GET /api/dev/battle-card/:project_id/recommendation` → next action
- Permission gate T3+ · 403 si tier inferior

### Sub-B · UI page `/desarrollador/battle-card/:project_id` (~6h)
- Page nueva dev portal aurora theme dev:
  - Hero: "Battle Card · {ProjectName} · Semana {N}"
  - Score gauge (recharts RadialBarChart) 0-100 score compuesto color-coded
  - 5 cards dimensiones (precio · ventas · zona · marketing · lead-gen) con score + delta vs semana pasada
  - Tabla top 3 competidores side-by-side comparación
  - LineChart 12 semanas ranking history
  - Card "Acción recomendada" prominente con CTA gradient
  - Footer "Datos actualizados: domingo {fecha}" + audit chain link
- Empty state si insufficient_competitors: "Necesitamos al menos 3 desarrolladores en esta zona para Battle Card · zona acumulando data"
- navByRole entry tier 1 dev: { key:'battle-card', to:'/desarrollador/battle-card', label:'Battle Card', Icon: Swords }
- API client `frontend/src/api/battle_card.js`
- i18n namespace `battle_card` 35+ strings es-MX

### Sub-C · PDF export institucional (~2h)
- Backend endpoint `GET /api/dev/battle-card/:project_id/export.pdf` (T3+ only · rate-limit 5/min)
- Reportlab template institucional (reusa patrón W5.15 PDF Fitch-style):
  - Cover: logo DMX + project name + semana + dev_org name
  - Page 1: Executive summary + score gauge ASCII + KPIs
  - Page 2: 5 dimensiones breakdown + delta vs semana
  - Page 3: Top 3 competidores side-by-side tabla
  - Page 4: Ranking timeline 12 semanas + recommended action
  - Footer: audit chain SHA-256 + página N de M
- Botón "Descargar PDF para comité" en page Sub-B
- audit_immutable_engine.log action="battle_card_pdf_export"

### Sub-D · Email weekly digest cron (~2h)
- `battle_card_email_cron.py` NEW · job `battle_card_weekly_email_cron` @ lunes 08:00 UTC (después de snapshot domingo 23:00)
- Logic:
  1. Query proyectos T3 activos
  2. Por cada dev_org_admin user: agregar todos sus proyectos · top 3 movements de la semana
  3. Resend email template "Tu Battle Card · Semana {N}" con:
     - Score actual vs semana pasada
     - 3 proyectos con mayor delta (positivo o negativo)
     - Recommended action prominente
     - CTA "Ver detalle completo" → link /desarrollador/battle-card/:slug
  4. Idempotency: 1 email por user por week_iso
- Reusa notifications_engine + Resend infra existente
- NOTIF_TYPE "battle_card_weekly_digest" en notifications_engine

### Sub-E · Atlax tool #21 query_battle_card (~1h)
- asistente_engine.py añadir tool #21 `query_battle_card(project_id, dimension?)`:
  - Si user es T3+ con acceso al project_id → retorna my_score + ranking + recommended action
  - Si NO autorizado → "Battle Card requiere tier T3"
  - Response shape Robinhood-style con sources_breakdown (como tool #20 probability)
- System prompt extension bloque "BATTLE CARD (tool 21 · T3 dev premium):
  Usa query_battle_card cuando dev user pregunte sobre su posición competitiva.
  SIEMPRE incluye ranking + recommended action.
  Ejemplo: 'Tu proyecto rank #2 en Polanco (subiste 1 lugar) · acción recomendada: ajustar pricing -3% según comp velocity'.
  NUNCA inventes scores. Si insufficient_competitors → 'data acumulándose para esa zona'."

---

## 4 · Cierre ciclos (NO aislado)

### 📥 Consume (módulos shipped)
- ✅ `comparables` collection (ZZ.2 Drive ingestion)
- ✅ `ie_scores` collection (W3.1B intelligent_explorer)
- ✅ `pricing_recommendations` (Y.2A sub-agents)
- ✅ `marketing_recommendations` (Y.2B sub-agents)
- ✅ `lead_recommendations` (Y.2C sub-agents)
- ✅ `behavioral_events` (W4.3 Phase Y)
- ✅ `audit_immutable_engine` (W5.11 audit chain)
- ✅ `notifications_engine` + Resend (W4.10 email)
- ✅ `asistente_engine` Atlax (W4.4)
- ✅ `BattleCard T3` component básico (W4.18.2B)
- ✅ permissions.py T3 gate
- ✅ APScheduler sched_ie

### 📤 Alimenta (cross-modules)
- ✅ W5.6 Scenario Storyteller → puede narrativizar battle cards como historias
- ✅ Atlax tool #21 → IA responde queries competitivas
- ✅ Dev dashboard → widget mini-rank en `/desarrollador`
- ✅ NotificationCenter → notif "ranking subió/bajó significativo"
- ✅ Email Resend → weekly digest
- 🔜 W5.16 Marketing distribution → futuro share-able card image

---

## 5 · Reglas inviolables

1. **T3+ only** · 403 si tier inferior
2. **insufficient_competitors check** · si comp count < 3 → honest "data acumulándose"
3. **NUNCA inventar scores** · si data insufficient → flag transparente
4. **Email weekly idempotent** · 1 por user por week_iso
5. **PDF audit chain** · cada export queda en audit_immutable
6. **Cron snapshot domingo 23:00 UTC** · email lunes 08:00 UTC (timing tier T3 dev professional)
7. **Permission cascade**: dev_admin ve sus proyectos · developer_member ve solo asignados · superadmin ve todos

---

## 6 · Upgrades evaluados (top 3 incluidos · resto BACKLOG)

### Top 3 incluidos en Plan B ✅
1. PDF export institucional (+2h · 9/10)
2. Email weekly digest (+2h · 8/10)
3. Atlax tool #21 (+1h · 8/10)

### Backlog (descartados Plan B)
- Combo con W5.16 Marketing distribution (justified arquitectónicamente NO combinar)
- Combo con W5.6 Storyteller (sin sinergia clara hoy · backlog si founder pide)
- Share-able image card viral (Twitter/WA) · backlog post-W5.16 resuelto
- Per-segment competitive analysis · backlog cuando tier T3 tracción

---

## 7 · Próximo paso

1. Persistir spec ✅
2. Update WAVE5_PLAN status 🟡
3. Commit + push docs
4. Escribir prompt W5.23 Plan B emergent (17h · 5 sub-chunks A/B/C/D/E)
5. Founder pega
6. Emergent ships
7. Yo merge + verify + docs

**Resuelve después**: conflict W5.16 numbering (3 identidades en docs)
