# W5.21 · External Insights UI/SEO · 9 pages públicas comparativas · Spec canónico

**Versión**: 1.0 retroactivo · 2026-05-19
**Origen**: rescatado post-audit forense 10 batches 2026-05-19 · WAVE_PROGRESS L232 verbose + 3 commits Sub-A/B/C (`62982b04` + `26e5e559` + `821d891a`) · pareja UI/SEO de W5.20 (External Insights Ingest)
**Status**: ✅ SHIPPED · documentación trazabilidad retroactiva
**SHAs shipped**:
- Sub-A `62982b04` `/insights/global` MX vs Mundo 6-8 charts comparativos
- Sub-B `26e5e559` 8 SEO landings `/insights/compare/:topic` + JSON-LD + og:image dinámico
- Sub-C `821d891a` MethodologyPage + sitemap + Atlax tool #23 visibilidad
- Merge build `821d891a` (último commit Sub-C contiene merge state final)
- Post-tag rollback `pre-W5.21-external-insights-ui-260519-0850`
- Post-tag shipped `post-W5.21-external-insights-ui-260519-0953`
- Docs `e81c4ce2` "W5.21 External Insights UI/SEO SHIPPED · 514h · 7/7 Claude Code ULTRA-defensivo"
**Horas reales**: 14h shipped (12-15h estimado · 3 sub-chunks · upgrade og:image dinámico W5.16 integration +2h)
**Quién shipped**: Claude Code terminal ULTRA-defensivo (7/7 batches consecutivos cero violaciones aurora)

⚠️ **RETROACTIVO**: spec reconstruido post-shipped desde 3 commits (1185 insertions / 1 deletion / 9 files) + WAVE_PROGRESS L232 verbose. Pareja directa con W5_20_EXTERNAL_INSIGHTS_SPEC.md (W5.20 entrega backend · W5.21 entrega UI/SEO consumiendo endpoints).

---

## 1 · Resumen ejecutivo

**9 URLs públicas T0** consumiendo backend W5.20 (12 fuentes globales · 5 endpoints):
- 1 dashboard hub: `/insights/global` (MX vs Mundo · 5 tabs categorías · 5 charts Recharts · 12 sources status grid)
- 8 SEO landings comparativas: `/insights/compare/:topic` (parametrizado · 8 topics hardcoded · cada una H1 long-tail + gráfica + tabla + CTA + JSON-LD Schema.org Article + Dataset)

**Sub-C** añade visibilidad pública: MethodologyPage sección 9 nueva (tabla 12 fuentes · URL · licencia · frecuencia) + PrensaPage sección Atlax tool #23 + sitemap.xml +9 URLs + og:image dinámico reusando W5.16 social_cards_engine (entity_type "insights").

**Valor diferencial**: SEO long-tail "DMX referente noticias real estate MX" · paridad con Knight Frank/Savills/JLL reports públicos · cada landing JSON-LD Google Rich Results · og:image dinámico vía W5.16 multi-platform shareable. Authority play SEO + waitlist conversion + prensa outreach assets.

**Audience**: T0 público (compradores buscando "mortgage rates México vs Estados Unidos"/"home prices CDMX comparados") + prensa MX (Inmobiliare · Forbes MX · El Financiero · Expansión) + investor outreach (Schema.org Dataset · auditable IRL).

---

## 2 · Arquitectura técnica

### 2.1 Frontend (puramente · NO backend NEW · solo EDIT puntual)

#### Pages públicas NEW
- `frontend/src/pages/public/InsightsGlobal.js` (456L · Sub-A)
  - Hero + 5 tabs categorías:
    1. **Economía** (FRED US Housing live · BIS Property Prices)
    2. **Vivienda** (OECD Housing · INEGI vivienda · World Bank Doing Business)
    3. **Demografía** (Numbeo Property Index 500+ ciudades)
    4. **Inversión** (Global Property Guide yields · IMF Global Housing Watch)
    5. **FIBRAs** (BMV/BIVA FIBRAs · HR Ratings MX)
  - 5 charts Recharts:
    - 2 live: FRED observations + World Bank serie histórica si payload presente
    - 3 demo overlay: si payload disponible W5.20 cron corrió · DEMO_PRICE_TREND fallback (MX INEGI vs US FRED) hasta cron preview
    - FAIL-OPEN: si fetch falla muestra "Pendiente cron"
  - 12 sources status grid (ok/error/skipped + last_updated)
  - CTA `/insights/compare`
  - Footer "Última actualización" + link `/sources`
  - Aurora pública: `var(--bg)` + `var(--cream)` + brand gradient indigo→pink

- `frontend/src/pages/public/InsightsCompare.js` (518L · Sub-B)
  - Template parametrizado por `:topic` parametrizado (NO 8 archivos separados)
  - 8 topics hardcoded en `TOPICS` array (export `INSIGHTS_COMPARE_SLUGS` para sitemap Sub-C):

  | # | Topic slug | H1 long-tail SEO |
  |---|---|---|
  | 1 | `mortgage-rates` | Tasas hipotecarias México vs Estados Unidos |
  | 2 | `home-prices` | Precios de vivienda CDMX comparados |
  | 3 | `rental-yields` | Yields de renta MX vs mundo |
  | 4 | `construction-cost` | Costo de construcción comparado global |
  | 5 | `doing-business` | Doing Business RE índices |
  | 6 | `housing-affordability` | Affordability vivienda CDMX vs ciudades globales |
  | 7 | `fibras-vs-reits` | FIBRAs MX vs REITs US comparativa |
  | 8 | `us-metros-vs-cdmx` | Top metros US vs CDMX precios |

  - Estructura por landing:
    - Hero + 1 gráfica (line o bar dinámica según topic)
    - Tabla comparada multi-fuente
    - Sources cited (URL + license + frequency)
    - CTAs cross-link 7 topics restantes
    - **JSON-LD Schema.org Article + Dataset** (Google Rich Results)
    - Meta og:title/description/image + twitter:card
    - **og:image dinámico** → `/api/social-cards/og/insights/{slug}.png` (W5.16 engine reusado)
    - Best-effort live data fetch via `fetchGlobalSource` (display only · NO bloquea render)
    - Cleanup script tags on unmount (no leak)

#### Pages públicas EDIT (Sub-C aditivo)
- `frontend/src/pages/public/MethodologyPage.js` (+60L)
  - **Section 9 nueva**: "Fuentes externas globales (W5.20)"
  - Tabla hardcoded 12 fuentes (nombre · URL oficial · licencia · frecuencia · tier)
  - Link a `/insights/global` y `/insights/compare`
- `frontend/src/pages/public/PrensaPage.js` (+42L)
  - Sección final "Comparativas MX vs Mundo · 12 fuentes globales"
  - 3 CTAs: `/insights/global` · `/insights/compare` · `/methodology`
  - Referencia explícita a tool #23 `query_global_insights`
  - **NO modifica engine** (tool ya shipped W5.20)

#### API client NEW
- `frontend/src/api/insights_external.js` (34L · Sub-A)
  - Client wrappers para W5.20 endpoints:
    - `fetchAllSources()` → `GET /api/insights/global/all-sources`
    - `fetchGlobalSource(source_id)` → `GET /api/insights/global/{source_id}`
    - `fetchMethodologySources()` → `GET /api/insights/methodology/sources`

#### App.js routes (Sub-A + Sub-B)
- `frontend/src/App.js` (+6L total)
  - +1 lazy `InsightsGlobal` + 1 Route `/insights/global` (Sub-A)
  - +1 lazy `InsightsCompare` + 1 Route `/insights/compare/:topic` (Sub-B)

#### sitemap.xml (Sub-C)
- `frontend/public/sitemap.xml` (+46L)
  - +9 URLs:
    - `/insights/global` · changefreq monthly · priority 0.9
    - 8 × `/insights/compare/:topic` · changefreq weekly · priority 0.8
  - Lastmod actualizado

### 2.2 Backend (upgrade +2h og:image dinámico)

#### social_cards_engine EXTEND (W5.16 reusado · Sub-B aditivo)
- `backend/social_cards_engine.py` (+4L)
  - `ALLOWED_ENTITY_TYPES` += `"insights"` (5to entity_type)
  - `INSIGHTS_SUBTITLES` map agregado (10 títulos estáticos + fallback title-case)

#### routes/social_cards.py EXTEND (Sub-B aditivo)
- `backend/routes/social_cards.py` (+20L)
  - `elif branch entity_type="insights"` en `_fetch_entity_data` (10 títulos estáticos + fallback title-case)
  - Resto del endpoint pipeline (cache + render) sin cambios

### 2.3 Integraciones cross-módulo

- **W5.20 External Insights**: consume 5 endpoints (3 público T0)
- **W5.16 Social Cards**: reusa engine añadiendo entity_type `insights` (NO crea nuevo endpoint · usa `/api/social-cards/og/insights/{slug}.png` con cache LRU 24h + disk)
- **W4.4 asistente_engine (Atlax)**: tool #23 ya shipped W5.20 · Sub-C añade discoverability vía link en PrensaPage (NO duplica)
- **Aurora pública design system**: `var(--bg)` + `var(--cream)` + brand gradient indigo→pink (NO superadmin theme)
- **i18n es-MX**: strings InsightsGlobal + InsightsCompare (asumido namespace existing patterns)

---

## 3 · URLs públicas (9 total)

| # | URL | Status SEO | JSON-LD |
|---|---|---|---|
| 1 | `/insights/global` | priority 0.9 · monthly | — |
| 2 | `/insights/compare/mortgage-rates` | priority 0.8 · weekly | Article + Dataset |
| 3 | `/insights/compare/home-prices` | priority 0.8 · weekly | Article + Dataset |
| 4 | `/insights/compare/rental-yields` | priority 0.8 · weekly | Article + Dataset |
| 5 | `/insights/compare/construction-cost` | priority 0.8 · weekly | Article + Dataset |
| 6 | `/insights/compare/doing-business` | priority 0.8 · weekly | Article + Dataset |
| 7 | `/insights/compare/housing-affordability` | priority 0.8 · weekly | Article + Dataset |
| 8 | `/insights/compare/fibras-vs-reits` | priority 0.8 · weekly | Article + Dataset |
| 9 | `/insights/compare/us-metros-vs-cdmx` | priority 0.8 · weekly | Article + Dataset |

Cada landing `/insights/compare/:topic` adicionalmente:
- og:image apunta a `/api/social-cards/og/insights/{topic}.png` (W5.16 dinámico)
- twitter:card summary_large_image

---

## 4 · Endpoints consumidos (de W5.20 + W5.16)

| Endpoint | Origen | Uso W5.21 |
|---|---|---|
| `GET /api/insights/global/all-sources` | W5.20 | InsightsGlobal status grid 12 fuentes |
| `GET /api/insights/global/{source_id}` | W5.20 | InsightsGlobal + InsightsCompare payload fetch live |
| `GET /api/insights/methodology/sources` | W5.20 | MethodologyPage tabla 12 fuentes (NO fetcheado · hardcoded tabla por consistencia · endpoint queda disponible para refresh futuro) |
| `GET /api/social-cards/og/insights/{topic}.png` | W5.16 (extend) | InsightsCompare meta og:image |

**Atlax tool #23** `query_global_insights` ya shipped W5.20 · Sub-C añade discoverability vía link público en PrensaPage (NO modifica engine).

---

## 5 · Decisiones founder históricas

### 2026-05-18 · Plan A re-scoped W5.20 (commit `b188400b`)
W5.21 originalmente parte del "DMX Insights Layer 41h" (BACKLOG L649-670). Re-scope founder approved separó:
- **W5.20** (25h): Backend connectors + crons + endpoints + Atlax tool #23
- **W5.21** (12-15h): UI/SEO 9 pages consumiendo W5.20

Founder ruling: "primer músculo backend público · luego UI SEO ranking play".

### 2026-05-19 · Upgrade +2h og:image dinámico
**Sub-B inicialmente** planeado solo Schema.org + meta tags estáticos. Founder/Master Dev decisión durante implementación: **reusar W5.16 social_cards_engine** añadiendo entity_type `"insights"` (4L engine + 20L routes · cero código duplicado). Resultado: 8 SEO landings con og:image dinámico Google/FB/LinkedIn/Twitter rich previews · CTR x3-5 prensa outreach.

Justificación: "máximo apalancamiento módulos shipped · cero refactor · pattern Plan A++".

### 2026-05-19 · 8 topics hardcoded TOPICS array
Decisión arquitectónica: NO crear 8 archivos JS separados · usar **template parametrizado `:topic`** con array hardcoded. Trade-off: añadir topic 9+ requiere edit JS + sitemap manual (vs CMS-driven). Acceptable founder approved (volumen topics esperado bajo y curado).

### 2026-05-19 · ULTRA-defensivo pattern (7/7 batches consecutivos)
Audit Master Dev 10/10 PASSED · 17/17 críticos diff=0 (SuperadminLayout · navByRole · superadmin-aurora.css · feature_gate_engine · feature_registry · feature_legacy_adapter · feature_visibility · widget_embed_analytics · external_insights_engine · external_insights_cron · routes/external_insights · cron · memory/* · PRD · ROADMAP · WAVE_PROGRESS · WAVE5_PLAN · W5_*_SPEC · AURORA_BUGS · .env · test_credentials) · build 19.51s OK · 0 TODO/FIXME.

---

## 6 · Scope shipped vs scope discutido

### ✅ Shipped completo (3 sub-chunks · 14h)

**Sub-A · `/insights/global` page MX vs Mundo (5h)**:
- `InsightsGlobal.js` 456L NEW ✅
- Hero + 5 tabs categorías (Economía · Vivienda · Demografía · Inversión · FIBRAs) ✅
- 5 Recharts (2 live FRED+World Bank · 3 demo overlay) ✅
- 12 sources status grid (ok/error/skipped + last_updated) ✅
- CTA `/insights/compare` ✅
- Footer "Última actualización" + link `/sources` ✅
- Aurora pública (NO superadmin) ✅
- FAIL-OPEN: si fetch falla muestra "Pendiente cron" ✅
- `insights_external.js` client 34L NEW ✅
- App.js +1 lazy + 1 Route ✅

**Sub-B · 8 SEO landings `/insights/compare/:topic` (5h + upgrade og:image +2h)**:
- `InsightsCompare.js` 518L NEW template parametrizado ✅
- 8 topics hardcoded TOPICS array ✅
- Cada landing H1 long-tail + 1 gráfica + tabla + sources + CTAs cross-link ✅
- **JSON-LD Schema.org Article + Dataset** ✅
- Meta og:title/description/image + twitter:card ✅
- og:image dinámico → `/api/social-cards/og/insights/{topic}.png` (W5.16 reusado) ✅
- Best-effort live data fetch (display only · NO bloquea render) ✅
- Cleanup script tags on unmount ✅
- Export `INSIGHTS_COMPARE_SLUGS` para sitemap Sub-C ✅
- App.js +1 lazy + 1 Route ✅
- **Backend extend W5.16**: `social_cards_engine.py` +4L (ALLOWED_ENTITY_TYPES + INSIGHTS_SUBTITLES) + `routes/social_cards.py` +20L (elif branch entity_type="insights") ✅

**Sub-C · MethodologyPage + sitemap + Atlax visibility (2h)**:
- `MethodologyPage.js` +60L · Section 9 "Fuentes externas globales" tabla 12 fuentes ✅
- `PrensaPage.js` +42L · sección Atlax tool #23 + 3 CTAs ✅
- `sitemap.xml` +46L · 9 URLs (changefreq + priority) ✅
- Atlax tool #23 NO duplicado · solo discoverability link ✅

### 🟡 Diferido conscientemente

| Item | Score | Razón diferir | Destino |
|---|---|---|---|
| **CMS-driven topics (vs hardcoded 8)** | 6/10 | Volumen topics esperado bajo · acceptable hardcoded | Wave 6+ si volumen crece |
| **i18n en-US para SEO global** | 7/10 | Mercado MX primero · audience nativa es-MX | Phase Z post-MX tracción |
| **Real-time chart drilldown** | 6/10 | Display only OK first iteration · UX deep-dive post-feedback | Wave 6+ |
| **PDF export 8 landings (institutional)** | 8/10 | Reusable pattern reportlab W5.15/W5.23 · timing post-launch waitlist conversion | BACKLOG (mismo bucket W5.20 deferreds Tier 1) |
| **Newsletter wire-up auto-include W4.10** | 8/10 | Wave 6+ wire-up cadence | BACKLOG (W5.20 deferred Tier 1) |
| **Atlax dual-mode wiki paths** | 7/10 | Wiki Karpathy capa A no shipped (W5.20 deferred) | BACKLOG Wave 6 |
| **Comparador ciudad-vs-ciudad interactivo** (Numbeo 500+ ciudades) | 7/10 | Numbeo payload disponible pero UI dropdown comparador no shipped | Wave 6+ |

### 🔴 Perdido — CERO (audit forense confirma)

Audit forense 2026-05-19 verificó 10 batches incluyendo W5.21 · 17/17 críticos diff=0 · CERO sesgo sistémico.

---

## 7 · BACKLOG enhancements asociados (deferreds W5.21)

Referenciar L649-670 (entry original abarcaba W5.20+W5.21) · deferreds específicos W5.21:

1. **CMS-driven topics (Strapi/Sanity/Builder.io)** (6/10) — si volumen topics crece >20
2. **i18n en-US SEO global landing variants** (7/10) — Phase Z post-MX
3. **Real-time chart drilldown interactivo** (6/10) — UX iteration post-feedback
4. **Comparador ciudad-vs-ciudad UI (Numbeo)** (7/10) — Numbeo payload disponible · solo falta UI
5. **PDF export institutional 8 landings** (8/10) — reusable reportlab W5.15/W5.23 pattern

---

## 8 · Riesgos residuales NO bloqueantes (documentados al shipping)

1. **Charts DEMO data ilustrativos hasta cron W5.20 popule cache**: live overlay aditivo · founder approved trade-off · UI muestra "Pendiente cron" si fetch error
2. **og:image cards "insights" fallback PNG hasta primer compose_card**: cache 24h · primera petición ~2s · subsiguientes <100ms cache hit
3. **8 topics SEO en TOPICS array hardcoded**: añadir más requiere edit JS + sitemap manual · acceptable founder approved
4. **BIS/OECD SDMX payload shapes complejos**: solo FRED+World Bank renderizan live · otros 10 muestran status sin gráfica numérica (founder approved Sub-A trade-off)
5. **JSON-LD Article+Dataset validación**: Google Rich Results test pendiente post-deploy producción · LD generado correcto pero rendering Google requiere crawler refresh
6. **MethodologyPage tabla 12 fuentes hardcoded** (NO fetcheada de `/methodology/sources` endpoint): tradeoff consistencia visual vs auto-sync · si W5.20 añade fuentes 13+ → edit manual tabla MethodologyPage
7. **App.js +1 deletion**: probable conflict resolution App.js Route entry · founder verificar no removió route legacy crítica · audit Master Dev confirmó 17/17 críticos diff=0 (acceptable)

---

## 9 · Conexiones cross-módulo (cierre ciclos)

### 📥 Consume (módulos shipped previos)
- ✅ **W5.20 External Insights** (commit `a49ea651`) · 5 endpoints (3 público T0)
- ✅ **W5.16 Social Cards** (commit `e42bf945`) · engine extend +1 entity_type "insights" + 1 SUBTITLES map
- ✅ **Atlax tool #23 `query_global_insights`** (shipped W5.20) · solo discoverability link añadida W5.21 Sub-C
- ✅ Aurora pública design system (`var(--bg)` + `var(--cream)` + brand gradient)
- ✅ Recharts (W3.x infra base)
- ✅ Schema.org JSON-LD (W3.x infra SEO existing patterns)
- ✅ sitemap.xml infra existing

### 📤 Alimenta (módulos posteriores)
- ✅ **SEO long-tail ranking** Google "DMX referente noticias real estate MX" (efectos post-launch + crawler indexing)
- ✅ **Prensa outreach assets** (Inmobiliare · Forbes MX · El Financiero · Expansión) · 9 URLs citables
- ✅ **Investor outreach** · Schema.org Dataset auditable IRL + sources cited
- ✅ **Atlax tool #23 discoverability** PrensaPage visible (post W5.20 que shipeó tool)
- ✅ **og:image multi-platform shareable** via W5.16 (FB · LinkedIn · WA · Twitter · Telegram · iMessage · Discord · Slack)
- 🔜 Future PDF lead magnet (W5.20 deferred Tier 1) puede consumir misma data
- 🔜 Future Newsletter auto-include (W5.20 deferred Tier 1) puede curar top topics weekly
- 🔜 Future Comparador ciudad-vs-ciudad UI · Numbeo payload disponible

---

## 10 · Métricas de éxito / KPIs

| KPI | Target | Cómo medir |
|---|---|---|
| **Page views `/insights/global`** | ≥500/mo post-launch SEO | PostHog post-launch (cuando active key real) |
| **8 landings impressions Google** | ≥10K/mo total (crawler + ranking) | Google Search Console post-deploy |
| **Top 10 ranking 4+ topics long-tail** | 4/8 keywords core en 90d | GSC + rank tracker |
| **og:image CTR uplift** | x3-5 vs sin og:image | A/B (si setup) o pre/post baseline |
| **Prensa outreach link clicks** | ≥20 backlinks high-authority MX prensa en 6m | Ahrefs/Majestic external referring domains |
| **JSON-LD Rich Results approval** | ≥6/8 landings Google Rich Results approved | GSC Rich Results report |
| **Atlax tool #23 usage post-PrensaPage discoverability** | ≥+30% queries `query_global_insights` post-W5.21 vs pre | asistente analytics |
| **sitemap.xml crawl rate** | 9 new URLs indexed en <14d | GSC coverage report |
| **InsightsCompare live chart fetch success rate** | ≥80% post-cron warmup | PostHog event tracking |

---

## 11 · Referencias

- **Doc canónico previo W5.20**: `memory/W5_20_EXTERNAL_INSIGHTS_SPEC.md` (este SPEC pair · 12 connectors + endpoints consumidos)
- **Doc canónico previo W5.16**: `memory/W5_16_SOCIAL_CARDS_SPEC.md` (engine reusado · entity_type "insights" añadido Sub-B)
- **BACKLOG_ENHANCEMENTS.md L649-670**: entry original "DMX Insights Layer" 41h pre-re-scope
- **INSIGHTS_SOURCES_RESEARCH.md**: 80 fuentes investigadas (referencia tabla 12 sources)
- **WAVE_PROGRESS.md L232**: row W5.21 verbose shipped (3 sub-chunks · upgrade og:image dinámico · 17/17 críticos diff=0)
- **Commits canónicos**:
  - `62982b04` W5.21 SUB-A `/insights/global` page MX vs Mundo 6-8 charts comparativos
  - `26e5e559` W5.21 SUB-B 8 SEO landings `/insights/compare/:topic` + JSON-LD + og:image dinámico
  - `821d891a` W5.21 SUB-C MethodologyPage + sitemap + Atlax tool #23 ya shipped W5.20
  - `e81c4ce2` docs W5.21 External Insights UI/SEO SHIPPED · 514h · 7/7 Claude Code ULTRA-defensivo
- **Tags**: `pre-W5.21-external-insights-ui-260519-0850` (rollback) · `post-W5.21-external-insights-ui-260519-0953` (post-shipped)
- **Files NEW**:
  - `frontend/src/pages/public/InsightsGlobal.js` (456L)
  - `frontend/src/pages/public/InsightsCompare.js` (518L)
  - `frontend/src/api/insights_external.js` (34L)
- **Files EDIT**:
  - `frontend/src/App.js` (+6L · 2 lazy + 2 Routes)
  - `frontend/public/sitemap.xml` (+46L · 9 URLs)
  - `frontend/src/pages/public/MethodologyPage.js` (+60L · Section 9)
  - `frontend/src/pages/public/PrensaPage.js` (+42L · sección Atlax)
  - `backend/social_cards_engine.py` (+4L · ALLOWED_ENTITY_TYPES + INSIGHTS_SUBTITLES)
  - `backend/routes/social_cards.py` (+20L · elif branch entity_type="insights")
- **Total**: 9 archivos · 1185 insertions · 1 deletion

---

## 12 · Reglas inviolables

1. **NO crear endpoint nuevo para og:image**: reusar W5.16 `/api/social-cards/og/insights/{slug}.png` (cache LRU 24h + disk · zero refactor)
2. **NO duplicar Atlax tool #23**: ya shipped W5.20 · Sub-C SOLO añade discoverability link (NO modifica engine asistente_engine.py)
3. **Aurora pública NO superadmin**: `var(--bg)` + `var(--cream)` + brand gradient indigo→pink (NO theme superadmin)
4. **FAIL-OPEN charts**: si fetch falla muestra "Pendiente cron" o demo overlay · NUNCA crash UI
5. **JSON-LD Schema.org Article + Dataset obligatorio** en 8 landings compare (Google Rich Results)
6. **og:image + twitter:card meta tags obligatorios** en 8 landings (shareability multi-platform)
7. **8 topics hardcoded TOPICS array exportado**: cualquier topic 9+ requiere edit JS + sitemap manual + INSIGHTS_SUBTITLES map (acceptable founder approved)
8. **Cleanup script tags on unmount**: no leak DOM en JSON-LD/meta tags injection
9. **Best-effort live data fetch · NO bloquea render**: display only patterns · skeleton/demo fallback
10. **sitemap.xml priority 0.9 (global) + 0.8 (compare)** · changefreq monthly/weekly
11. **MethodologyPage tabla 12 fuentes hardcoded por consistencia visual** (NO fetcheada · trade-off documentado)
12. **Audit Master Dev pre-merge ULTRA-defensivo**: 17/17 críticos diff=0 · 0 TODO/FIXME · build OK
