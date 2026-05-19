# W5.20 · External Insights Ingest · 12 fuentes globales · Spec canónico

**Versión**: 1.0 retroactivo · 2026-05-19
**Origen**: rescatado post-audit forense 10 batches 2026-05-19 · BACKLOG_ENHANCEMENTS L649-670 (entry original "DMX Insights Layer — Wiki Karpathy + Backend público" 41h) + INSIGHTS_SOURCES_RESEARCH.md (80 fuentes investigadas · 25 Tier 🟢 prioritario) + WAVE_PROGRESS L233 + commits `b188400b` (re-scope) + `a49ea651` (build)
**Status**: ✅ SHIPPED (Plan A re-scoped) · documentación trazabilidad retroactiva
**SHAs shipped**:
- `b188400b` docs RE-SCOPED Plan A founder approved · External Insights Ingest 28-33h (NO 41h)
- `a49ea651` feat W5.20 External Insights Ingest · 12 fuentes globales (ULTRA-defensivo) · merge build
- `63c802a3` docs W5.20 SHIPPED ✅ · 500h
- Post-tag rollback `pre-W5.20-external-insights-20260518-2301`
- Post-tag shipped `shipped-W5.20-external-insights-20260518-2312`
**Horas reales**: 25h shipped (re-scope desde 41h originales · capas A.1/A.2 Wiki Karpathy + 5 upgrades Tier 1 DEFERRED)
**Quién shipped**: Claude Code terminal ULTRA-defensivo (6/6 batches consecutivos sin tocar críticos)

⚠️ **RETROACTIVO**: spec reconstruido post-shipped desde commit `a49ea651` diff (1214 insertions / 8 files) + WAVE_PROGRESS L233 verbose + INSIGHTS_SOURCES_RESEARCH.md canónico (research previa 2026-05-10).

---

## 1 · Resumen ejecutivo

**12 connectors gratis backend** que ingieren data real estate macro/global y la cruzan con DMX para narrativa "MX vs Mundo". 10 API connectors + 2 CSV connectors · FAIL-OPEN dual-path · cache compartida `external_insights_cache` collection. 2 crons APScheduler (weekly bulk + daily macro_alert). 5 endpoints (3 público T0 + 2 superadmin). Atlax tool #23 `query_global_insights` con `sources_breakdown` transparente. `intelligence_insights_engine.generate_cross_source_brief` LLM call try/except FAIL-SOFT.

**Valor diferencial**: wedge "referente noticias real estate MX" único LATAM · paridad con Knight Frank/Savills/JLL reports · cruce MX↔global verificable con archive.org snapshot + source attribution + LFPDPPP no PII. Atlax cita fuentes con paths reales (auditable IRL).

**Audience**: T0 público (compradores · prensa · investor outreach) consume via 3 endpoints público + frontend W5.21 (UI/SEO 9 pages). Superadmin DMX (gestión cron status + manual refresh). Atlax IA tool #23 (asistente cita fuentes en sus responses).

**Re-scope Plan A founder approved** (commit `b188400b` 2026-05-18): de 41h originales → 25h shipped · capa A (Wiki Karpathy) y 5 upgrades Tier 1 DEFERRED a BACKLOG (founder ruling "primer músculo backend público · wiki Karpathy nice-to-have post-launch").

---

## 2 · Arquitectura técnica

### 2.1 Backend

#### Engines NEW
- `backend/external_insights_engine.py` (430-485L)
  - **12 connectors gratis con FAIL-OPEN dual-path** (DB None smoke path + network errors return `status="error"` sin raise):

  | # | Connector | Tipo | Notas |
  |---|---|---|---|
  | 1 | **BIS Property Prices** | HTML scrape landing | `bis.org/statistics/pp.htm` · trimestral |
  | 2 | **OECD Housing Prices** | HTML scrape | `oecd.org/housing` · país OECD MX desde 1994 |
  | 3 | **IMF Global Housing Watch** | HTML scrape | `imf.org/housing` · trimestral |
  | 4 | **World Bank Doing Business** | Free API | `worldbank.org/doing-business` · MX index registering property |
  | 5 | **FRED US Housing** | Free API (token gratis registrar) | `fred.stlouisfed.org` · narrativa "vs USA" |
  | 6 | **INEGI vivienda** | Free API | `inegi.org.mx/datosabiertos` · ENVI · ENH |
  | 7 | **BMV/BIVA FIBRAs** | HTML scrape | cotizaciones FIBRA UNO/Macquarie/Inn/Monterrey/Hipotecaria |
  | 8 | **HR Ratings MX** | HTML scrape | `hrratings.com` · calificación FIBRAs |
  | 9 | **Numbeo Property Index** | Free API (token gratis) | `numbeo.com/property-investment` · 500+ ciudades mundo |
  | 10 | **Global Property Guide (GPG)** | HTML scrape | `globalpropertyguide.com` · yields + impuestos por país |
  | 11 | **Zillow CSV** | CSV download | `zillow.com/research/data` · stdlib csv NO pandas · filter top 50 metros US |
  | 12 | **Realtor.com CSV** | CSV download | `realtor.com/research` · stdlib csv |

  - `SOURCE_DISPATCH` dict + `ALL_SOURCES` list + `SOURCE_METADATA` (name · url · license · frequency · tier)
  - Helper `_fetch_cached(db, source_id, url, ttl_days)` cache compartida `external_insights_cache` collection
  - FRED+Numbeo sin token → `status="skipped"` degradación grácil
  - HTML scrape parser minimal `_parse_html_text` para IMF/BMV/HR Ratings/GPG retorna `{length, snippet[:2KB]}` (raw text sin estructurar · alerts solo FRED+WB hasta founder validar SDMX shapes)
  - **stdlib csv NO pandas** (lightweight ULTRA-defensivo)
  - BANXICO + INEGI ya integrados (W4.18 + W4.10 base) NO duplicados

- `backend/intelligence_insights_engine.py` EXTEND
  - **Nueva función** `generate_cross_source_brief(db, country_focus="MX")` 95L
  - LLM call `try/except` FAIL-SOFT (retorna `{status:"error"}` sin raise)
  - `emergentintegrations` opcional · NO toca `generate_brief()` existente
  - Cruza 12 fuentes → LLM síntesis narrativa "MX vs Mundo"

#### Crons NEW
- `backend/external_insights_cron.py` (245-324L · 2 jobs APScheduler)

| Job | Schedule | Lógica | Idempotency |
|---|---|---|---|
| `external_insights_weekly` | Domingo 03:00 UTC | `asyncio.gather` 12 connectors paralelos (concurrencia) · cache TTL 7d | timestamp run + source_id |
| `macro_alert_check` | Daily 07:00 UTC | Detecta cambios significativos BIS MX ±3% MoM · OECD ±2% · BMV FIBRA ±5% · emit notif `macro_alert` | hash `sha256(source_id+date+direction)` TTL 7d en `macro_alert_history` collection |

- `audit_immutable_engine.log` action="cron_run" summary counts
- `emit_notification` a superadmins + `CHURN_SALES_USER_IDS` env config + founder `ALERT_EMAIL` (.env)

#### Routes NEW
- `backend/routes/external_insights.py` (155-192L · 5 endpoints · ver §3)

#### Engines EDIT
- `backend/asistente_engine.py` EXTEND (+89L)
  - **Atlax tool #23** `query_global_insights` agregado al dispatcher línea 366
  - Handler `_tool_query_global_insights` implementado
  - System prompt extension bloque dedicado "══ EXTERNAL INSIGHTS ══" línea 243
  - Response shape Robinhood-style con `sources_breakdown` (cita fuente + URL + license + last_updated)
  - 22 Atlax tools existentes intactos (validado diff=0 críticos)
- `backend/notifications_engine.py` EXTEND (+3L)
  - `NOTIF_TYPE` "macro_alert"
- `backend/server.py` EXTEND (+12L)
  - +3L include_router
  - +7L startup register cron (external_insights + macro_alert)
  - .env config refs

#### Collections Mongo NEW
| Collection | Propósito | TTL |
|---|---|---|
| `external_insights_cache` | Cache compartida 12 fuentes payloads | 7d (per source) |
| `macro_alert_history` | Registra valor previo + idempotency hash | 7d |

#### .env config NEW
- `IE_FRED_API_KEY` (FRED free tier · founder registrar post-deploy)
- `IE_NUMBEO_API_KEY` (Numbeo free tier · founder registrar post-deploy)
- `CHURN_SALES_USER_IDS` (lista comma-separated · sales team alerts macro · default unset OK)
- `ALERT_EMAIL` (founder email para alerts críticos · ya configurado)

### 2.2 Frontend
**Ninguno en W5.20** (puramente backend · UI shipped en W5.21 posterior · 9 SEO landings consume estos endpoints).

### 2.3 Integraciones cross-módulo

- **W4.4 asistente_engine (Atlax)**: tool #23 nueva con dispatcher + handler + system prompt
- **W4.10 notifications_engine + Resend**: notif `macro_alert` a superadmins + sales + founder email
- **W5.11 audit_immutable_engine**: log cron runs + manual refreshes (chain SHA-256)
- **W5.21 InsightsGlobal.js + InsightsCompare.js** (posterior): consume `/api/insights/global/all-sources` + `/api/insights/global/{source_id}` + `/api/insights/methodology/sources`
- **W4.18 BANXICO + W4.10 INEGI**: ya integrados base · W5.20 NO duplica (referencia desde `SOURCE_METADATA`)
- **`intelligence_insights_engine.generate_brief`** (W4.18 existente): NO tocado · W5.20 añade `generate_cross_source_brief` paralelo

---

## 3 · Endpoints (5 total)

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | `/api/insights/global/{source_id}` | Public T0 | Payload cached fuente específica (1 de 12) |
| GET | `/api/insights/global/all-sources` | Public T0 | Status 12 fuentes (ok/error/skipped) + last_updated · consumido por W5.21 InsightsGlobal |
| GET | `/api/insights/methodology/sources` | Public T0 | Tabla 12 fuentes metadata (name · URL · license · frequency · tier) · consumido W5.21 MethodologyPage |
| GET | `/api/superadmin/external-insights/cron-status` | Superadmin | Last run timestamps · success/error counts · per source |
| POST | `/api/superadmin/external-insights/refresh/{source_id}` | Superadmin | Manual refresh fuente (bypass cron) |

---

## 4 · Crons y scheduled tasks

| Job | Schedule | Idempotency | Audit |
|---|---|---|---|
| `external_insights_weekly` | Domingo 03:00 UTC | timestamp run + source_id en `dedup_runs`-style | `audit_immutable.log(action="cron_run", payload=summary)` |
| `macro_alert_check` | Daily 07:00 UTC | hash `sha256(source_id+date+direction)` TTL 7d `macro_alert_history` | `audit_immutable.log(action="macro_alert_emitted")` |

---

## 5 · Decisiones founder históricas

### 2026-05-10 · BACKLOG entry original (L649-670)
Founder propuso "DMX Insights Layer — Wiki Karpathy + Backend público" estilo arquitectura dual:
- **Capa A**: Wiki interno Karpathy pattern `/insights-wiki/` (Obsidian + agentes CLI portátil)
- **Capa A.2**: ~80 fuentes investigadas (`INSIGHTS_SOURCES_RESEARCH.md` Tier prioritario 25 🟢)
- **Capa A.3**: Pipeline curación Claude Code skill
- **Capa B**: Backend público (MongoDB `knowledge_articles` + `/insights` blog SEO + sitemap)
- **Capa B.2**: 5 upgrades Tier 1 (AI auth Haiku +3h · PDF lead magnet +2h · asesor citation widget WA +2h · Cited by Atlax badge +1h · Newsletter auto-include +1h)
- **Capa B.3**: Atlax 17vo tool dual-mode (wiki paths + DB semantic)

**Total propuesto 41h**.

### 2026-05-18 · RE-SCOPED Plan A founder approved (commit `b188400b`)
Founder ruling: "primer músculo backend público · wiki Karpathy nice-to-have post-launch". Re-scope:

| Layer | Scope original | Decisión |
|---|---|---|
| Capa A · Wiki Karpathy `/insights-wiki/` | 3h scaffold | ❌ DEFERIDO BACKLOG Wave 6 |
| Capa A.2 · 80 fuentes research | 4h founder ops | ✅ DONE 2026-05-10 (`INSIGHTS_SOURCES_RESEARCH.md`) |
| Capa A.3 · Pipeline curación CLAUDE skill | 2h | ❌ DEFERIDO BACKLOG Wave 6 |
| Capa B · Backend público + 12 connectors | 12h | ✅ **CORE W5.20** |
| Capa B.2 · 5 upgrades Tier 1 | 9h | ❌ **5 DEFERIDOS BACKLOG** (Tier 1 listado §7) |
| Capa B.3 · Atlax tool dual-mode | 3h | ✅ DESCOPED a tool single-mode (sin wiki paths) → Atlax tool #23 `query_global_insights` |
| Cron + macro_alert + endpoints | — | ✅ INCLUIDO |
| `generate_cross_source_brief` LLM | — | ✅ INCLUIDO |

**Total re-scoped: 25h** (vs 41h originales · -16h Wiki Karpathy y 5 upgrades).

### 2026-05-18 · ULTRA-defensivo pattern (continuo desde W5.16)
Claude Code terminal ULTRA-defensivo 6/6 batches consecutivos sin tocar críticos. Validaciones independientes Master Dev 10/10 PASSED · W5.FF + W5.25 + W5.16 críticos 13/13 diff=0 · 22 Atlax tools existing intactos.

### 13 fuentes Tier 🟢 NO shipped
Decisión founder ruling (research previa): de 25 Tier 🟢 candidatos → solo 12 shipped W5.20. Diferidos:
- **JLL · Knight Frank · Savills · CBRE · Cushman · Colliers** (6 brokerages globales) → BACKLOG Wave 6 (HTML scrape paywalls parciales + ToS strict)
- **PwC · Deloitte** (2 Big 4) → BACKLOG Wave 6 (PDF download manual founder ops)
- **Redfin · Reuters · Forbes MX · Mansion Global** (4 prensa) → BACKLOG Wave 6 (curación manual prensa NO automatable)
- **BANXICO** → ya integrado W4.18 (referenciado en `SOURCE_METADATA` no duplica)

---

## 6 · Scope shipped vs scope discutido

### ✅ Shipped completo (4 sub-chunks · 25h)

**Sub-A · 10 API connectors gratis (8h)**:
- BIS · OECD · IMF · World Bank · FRED · INEGI · BMV · HR Ratings · Numbeo · Global Property Guide ✅
- `_fetch_cached` helper FAIL-OPEN dual-path ✅
- SOURCE_DISPATCH + ALL_SOURCES + SOURCE_METADATA ✅
- FRED+Numbeo skipped graceful sin token ✅
- HTML scrape parser minimal `_parse_html_text` ✅
- stdlib csv NO pandas ✅

**Sub-B · 2 CSV connectors (3h)**:
- Zillow Research CSV ✅
- Realtor.com CSV ✅
- Filter top 50 metros US ✅

**Sub-C · Crons + routes + intelligence brief (10h)**:
- `external_insights_weekly` Sun 03:00 UTC asyncio.gather 12 paralelos ✅
- `macro_alert_check` daily 07:00 UTC con thresholds BIS ±3% · OECD ±2% · BMV ±5% ✅
- `macro_alert_history` collection idempotency ✅
- 5 endpoints (3 público T0 + 2 superadmin) ✅
- `intelligence_insights_engine.generate_cross_source_brief` LLM FAIL-SOFT 95L ✅
- NO toca `generate_brief` existente ✅

**Sub-D · Atlax tool #23 + 3 upgrades top (4h)**:
- Atlax tool #23 `query_global_insights` (dispatcher + handler + system prompt) ✅
- NOTIF_TYPE `macro_alert` + emit a superadmins + sales + founder email ✅
- `/methodology/sources` endpoint expone 12 fuentes para frontend W5.21 ✅
- .env.example +IE_FRED_API_KEY +IE_NUMBEO_API_KEY ✅

### 🟡 Diferido conscientemente (5 upgrades Tier 1 + Wiki Karpathy)

| Item | Score original | Razón diferir | Destino |
|---|---|---|---|
| **Wiki Karpathy `/insights-wiki/` + CLAUDE.md curación** | 8/10 | Founder ruling "nice-to-have post-launch · primer músculo backend público" | BACKLOG Wave 6 |
| **AI-assisted authoring Haiku** | 9/10 (Sub-F Tier 1) | Sin volumen real artículos curados aún · esperar Wiki capa | BACKLOG Wave 6 |
| **PDF lead magnet** (institutional) | 9/10 (Sub-F Tier 1) | Esperar W5.21 SEO landings + waitlist conversion stats | BACKLOG Wave 6 |
| **Asesor citation widget WhatsApp** | 8/10 (Sub-F Tier 1) | Wire-up post-launch broker tracción | BACKLOG Wave 6 |
| **Cited by Atlax badge** | 8/10 (Sub-F Tier 1) | UI Atlax aún no expone sources_breakdown visualmente · esperar UX iteration | BACKLOG Wave 6 |
| **Newsletter auto-include W4.10 wire-up** | 8/10 (Sub-F Tier 1) | Wire-up post-launch newsletter cadence definida | BACKLOG Wave 6 |
| **Atlax tool dual-mode (wiki paths + DB)** | 7/10 | Sin wiki capa A no aplica dual-mode · single-mode `query_global_insights` shipped | BACKLOG Wave 6 |

### 🔴 Perdido — CERO (audit forense confirma)

Audit forense 2026-05-19 verificó · CERO sesgo sistémico · todos los deferreds documentados conscientemente.

---

## 7 · BACKLOG enhancements asociados (deferreds W5.20)

Persistir en BACKLOG_ENHANCEMENTS.md o referenciar L649-670 (entry original abarcaba todo el alcance pre-re-scope):

1. **Wiki Karpathy `/insights-wiki/`** (3h · 8/10) — Capa A + CLAUDE.md curación + Obsidian agent-agnostic
2. **Pipeline curación CLAUDE skill `bulk_ingest_insights`** (2h · 7/10) — Capa A.3 cron weekly raw → wiki cross-referenced
3. **AI-assisted authoring Haiku** (3h · 9/10) — Sub-F Tier 1 · sintesis automática raw fuente → wiki article
4. **PDF lead magnet institutional** (2h · 9/10) — Sub-F Tier 1 · reusa reportlab pattern W5.15/W5.23
5. **Asesor citation widget WhatsApp** (2h · 8/10) — Sub-F Tier 1 · "cita esta data en tu WA"
6. **Cited by Atlax badge** (1h · 8/10) — Sub-F Tier 1 · `sources_breakdown` visible en UI Atlax
7. **Newsletter W4.10 auto-include wire-up** (1h · 8/10) — Sub-F Tier 1 · cadence semanal "Top insights MX vs Mundo"
8. **Atlax tool dual-mode wiki+DB** (3h · 7/10) — Capa B.3 dual-mode cuando Wiki capa A activa
9. **6 brokerages globales (JLL · Knight Frank · Savills · CBRE · Cushman · Colliers)** (~6h · 7/10) — HTML scrape paywalls parciales · ToS strict · curación manual founder ops
10. **2 Big 4 (PwC · Deloitte)** (~2h · 6/10) — PDF download manual founder ops
11. **4 prensa (Redfin · Reuters · Forbes MX · Mansion Global)** (~4h · 6/10) — curación manual prensa NO automatable

---

## 8 · Riesgos residuales NO bloqueantes (documentados al shipping)

1. **BIS/OECD/IMF/BMV/HR Ratings/GPG son HTML scrape landing pages**: FAIL-OPEN si HTML cambia · cron weekly captura cambios al próximo run · alerts NO disparan si parser falla (acceptable graceful degradation)
2. **BIS/OECD SDMX shape complejo NO extraído**: alerts solo FRED+WB hasta founder validar SDMX shapes (resto 10 muestran status sin gráfica numérica · solo snippet 2KB)
3. **Zillow CSV ~5MB primera corrida lenta** (timeout=30s): si timeout → status="error" · próximo cron retry · founder approved trade-off
4. **FRED+Numbeo necesitan key gratis registrar post-deploy**: founder ops 5min cada uno · skipped graceful sin token (status="skipped" UI W5.21 muestra "Pendiente cron")
5. **`macro_alert_check` thresholds hardcoded** (BIS ±3% · OECD ±2% · BMV ±5%): NO configurable UI superadmin · evaluar post-volumen real
6. **CHURN_SALES_USER_IDS env unset default**: founder debe configurar post-deploy · documentado · skip silent si unset
7. **LLM `generate_cross_source_brief` FAIL-SOFT silent**: si `emergentintegrations` no disponible → retorna `{status:"error"}` sin bloquear cron · UI debe handle status

---

## 9 · Conexiones cross-módulo (cierre ciclos)

### 📥 Consume (módulos shipped previos)
- ✅ `intelligence_insights_engine` W4.18 (extend con `generate_cross_source_brief` paralelo)
- ✅ `asistente_engine` Atlax W4.4 (tool #23 nueva)
- ✅ `notifications_engine` + Resend W4.10 (NOTIF_TYPE `macro_alert`)
- ✅ `audit_immutable_engine` W5.11 (audit chain cron runs)
- ✅ `APScheduler` sched_ie (Phase Y · 2 jobs registrados)
- ✅ BANXICO W4.18 + INEGI base (referenciados en SOURCE_METADATA · NO duplica)
- ✅ `emergentintegrations` package (LLM call opcional)

### 📤 Alimenta (módulos posteriores)
- ✅ **W5.21 InsightsGlobal.js** (commit `62982b04`) consume `/api/insights/global/all-sources` + `/api/insights/global/{source_id}` · 5 charts Recharts (2 live FRED+World Bank · 3 demo overlay)
- ✅ **W5.21 InsightsCompare.js** (commit `26e5e559`) 8 SEO landings consume payloads
- ✅ **W5.21 MethodologyPage** (commit `821d891a`) consume `/api/insights/methodology/sources` para tabla 12 fuentes
- ✅ **W5.21 PrensaPage** (commit `821d891a`) visibilidad pública Atlax tool #23
- ✅ **Atlax tool #23 `query_global_insights`** disponible para queries IA cualquier user
- 🔜 Future W6+ Wiki Karpathy capa A · pipeline curación · Atlax dual-mode

---

## 10 · Métricas de éxito / KPIs

| KPI | Target | Cómo medir |
|---|---|---|
| **Cron weekly success rate** | ≥10/12 fuentes status="ok" | `/api/superadmin/external-insights/cron-status` |
| **Cache hit rate weekly** | ≥80% (post-warmup) | summary cron logs |
| **macro_alert false positive rate** | ≤10% | founder qualitative review monthly |
| **macro_alert latency** | <24h desde data publish a alert sent | cron daily 07:00 UTC |
| **Atlax tool #23 usage** | ≥10 queries/mo post-launch | asistente analytics |
| **W5.21 SEO landings reuse** | 9 URLs consume estos endpoints | sitemap.xml + reverse trace |
| **LLM brief generation latency** | <5s p95 | `generate_cross_source_brief` timing |
| **Audit chain integrity** | `verify_chain.valid=True` siempre | cron daily superadmin |

---

## 11 · Referencias

- **Doc canónico previo**: `memory/INSIGHTS_SOURCES_RESEARCH.md` (80 fuentes investigadas · 25 Tier 🟢 prioritario · 4 criterios filtrado)
- **BACKLOG_ENHANCEMENTS.md L649-670**: entry original "DMX Insights Layer — Wiki Karpathy + Backend público" 41h pre-re-scope
- **WAVE_PROGRESS.md L233**: row W5.20 verbose shipped (4 sub-chunks · 12 connectors · 2 crons · 5 endpoints · Atlax tool #23)
- **Commits canónicos**:
  - `b188400b` docs RE-SCOPED Plan A founder approved · 28-33h (NO 41h)
  - `a49ea651` feat W5.20 External Insights Ingest · 12 fuentes globales (ULTRA-defensivo) · merge build
  - `63c802a3` docs W5.20 SHIPPED · 500h · próximo W5.21 UI/SEO
- **Tags**: `pre-W5.20-external-insights-20260518-2301` (rollback) · `shipped-W5.20-external-insights-20260518-2312` (post)
- **Sesiones jsonl referenciada**: `09a918cb-1596-47f5-a234-b08215597294.jsonl` (W5.20 ULTRA-defensivo session)
- **Files NEW**:
  - `backend/external_insights_engine.py` (485L)
  - `backend/external_insights_cron.py` (324L)
  - `backend/routes/external_insights.py` (192L)
- **Files EDIT**:
  - `backend/asistente_engine.py` +89L (tool #23 dispatcher + handler + system prompt)
  - `backend/intelligence_insights_engine.py` +103L (`generate_cross_source_brief`)
  - `backend/notifications_engine.py` +3L (NOTIF_TYPE `macro_alert`)
  - `backend/server.py` +12L (include_router + cron register)
  - `backend/.env.example` +6L (IE_FRED_API_KEY + IE_NUMBEO_API_KEY)
- **Atlax tool #23**: `query_global_insights(source_id?, country_focus="MX")` · response shape Robinhood-style con `sources_breakdown`

---

## 12 · Reglas inviolables

1. **FAIL-OPEN dual-path siempre**: db None smoke path + network errors return `status="error"` sin raise · cron NUNCA crashea
2. **Stdlib csv NO pandas**: lightweight ULTRA-defensivo · zero dependency bloat
3. **HTML scrape parser minimal**: `_parse_html_text` retorna `{length, snippet[:2KB]}` raw · NO intenta estructurar (FAIL-OPEN si HTML cambia)
4. **NO duplicar BANXICO/INEGI**: ya integrados W4.18 + W4.10 · solo referenciar en SOURCE_METADATA
5. **NO tocar `generate_brief` existente**: añadir paralelo `generate_cross_source_brief` (cero regresión Phase 5 foundation)
6. **LLM call try/except FAIL-SOFT**: `emergentintegrations` opcional · sistema funciona sin LLM (gracefully degraded)
7. **Atlax tool #23 `sources_breakdown` transparente**: cada response cita fuente + URL + license + last_updated (auditable IRL)
8. **macro_alert idempotency hash sha256(source_id+date+direction)**: NUNCA duplica alert mismo evento
9. **audit_immutable chain cada cron run + manual refresh**: SHA-256 trazable
10. **NO scrapear competidores MX**: Inmuebles24/Lamudi/Vivanuncios/Propiedades.com (rule `feedback_no_scraping_competitors.md`) · solo fuentes globales/macro/multilaterales
11. **Source attribution obligatoria**: cada artículo wiki (Wave 6+) y cada response Atlax debe citar fuente original con URL + fecha consulta + archive.org snapshot ideal
12. **LFPDPPP no PII**: solo data agregada/anonimizada (ENVI/ENH agregados nacionales · NO PII individual)
13. **Respect robots.txt + throttle 1req/30s mínimo**: ToS legal cada fuente
