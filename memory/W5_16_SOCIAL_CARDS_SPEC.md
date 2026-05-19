# W5.16 · Social Cards Multi-platform Renderer · Spec canónico

**Versión**: 1.0 retroactivo · 2026-05-19
**Origen**: rescatado post-audit forense 10 batches 2026-05-19 · BACKLOG_ENHANCEMENTS L672-681 (entry original 10h emergent W4.18.2B 2026-05-10) + WAVE_PROGRESS L234 + commit `e42bf945`
**Status**: ✅ SHIPPED · documentación trazabilidad retroactiva
**SHAs shipped**:
- Plan A++ aprobado founder · `0924ce74` (docs resolución W5.16 numbering · MÁXIMO alcance cero pérdida features)
- Merge build `e42bf945` (Claude Code terminal · 2026-05-18)
- Post-tag rollback `pre-W5.16-social-cards-20260518-2232`
- Post-tag shipped `shipped-W5.16-social-cards-20260518-2244`
**Horas reales**: 11h shipped (10h originales + 1h Plan A++ inclusion entity_type "insights" reusable post-W5.21)
**Quién shipped**: Claude Code terminal ULTRA-defensivo (5/5 batches consecutivos sin tocar críticos)

⚠️ **RETROACTIVO**: spec reconstruido post-shipped desde commit `e42bf945` diff + WAVE_PROGRESS verbose. Decisión arquitectónica Plan A++ "renombrado" (W5.16 standalone NO absorbe Z.2 marketing distribution) verificada via commit `0924ce74`.

---

## 1 · Resumen ejecutivo

**Backend pipeline + UI superadmin preview** para renderizar imágenes sociales dinámicas multi-plataforma (FB · IG · LinkedIn · WA · TikTok · Twitter · Telegram). 3 layouts (`og` 1200×630 · `feed` 1080×1080 · `story` 1080×1920) sobre 4 entity_types (`zone` · `property` · `development` · `asesor` · +`insights` agregado W5.21 Sub-B).

Compose: Pillow + Mapbox Static API snapshot + KPIs entity + branding DMX gradient + QR code en story layout. Cache LRU 24h memoria + disk en `storage/social_cards/`. FAIL-OPEN: si Mapbox falla → gradient solid fallback · si entity fetch falla → render con `slug.title()` (siempre 200 + PNG válido viral robust).

**Audience**: T0 público (compartidos sociales auto-generados via `<meta og:image>`) + brokers/marketing (download manual feed/story para postear nativo IG/TikTok/WA Status).

**Valor diferencial**: paridad con Zillow/Redfin shareability · CTR x3-5 vs link plano en preview platforms (FB · LinkedIn · WA · Twitter · Telegram · iMessage · Discord · Slack). CAC=0 viral.

---

## 2 · Arquitectura técnica

### 2.1 Backend

#### Engines NEW
- `backend/social_cards_engine.py` (380-468L según diff)
  - Pillow compose + Mapbox Static API
  - 3 layouts hardcoded:
    - `og` 1200×630 horizontal (link previews)
    - `feed` 1080×1080 cuadrado (IG/FB feed nativo)
    - `story` 1080×1920 vertical (Stories/TikTok/Status) + QR code (qrcode lib)
  - 4 entity_types (extensible · W5.21 añadió +"insights"):
    - `zone` · `property` · `development` · `asesor`
  - `compose_card(entity_type, slug, layout)` router
  - `ALLOWED_ENTITY_TYPES` enum gate
  - Mapbox: si `MAPBOX_TOKEN` ausente → gradient solid fallback (zero crash)
  - Entity fetch fail → render con `slug.title()` (siempre 200 + PNG válido viral robust)
  - Audit log first-time render best-effort `try/except` (audit NO debe bloquear render)
- `backend/social_cards_cache.py` (80L) NEW
  - Disk cache 24h en `storage/social_cards/`
  - `get_cached(key)` / `set_cached(key, png_bytes)`
  - LRU memoria implícito vía OS file mtime

#### Routes NEW
- `backend/routes/social_cards.py` (220L · 4 endpoints)
  - Public endpoints (cache disk first check `mtime <24h` · headers `cache-control max-age=86400`):
    - `GET /api/social-cards/og/{entity_type}/{slug}.png`
    - `GET /api/social-cards/feed/{entity_type}/{slug}.png`
    - `GET /api/social-cards/story/{entity_type}/{slug}.png`
  - Rate-limit 600/min/IP **lax NO 429** al cliente (fallback PNG · evita romper compartidos)
  - Superadmin endpoint:
    - `GET /api/superadmin/social-cards/stats` (cache_entries + render_count_24h + cache_hit_rate)
  - `_RENDER_LOG` deque maxlen=10000 sliding 24h en-memoria
- `backend/server.py` +3L include_router

### 2.2 Frontend

#### Pages superadmin NEW
- `frontend/src/pages/superadmin/SuperadminSocialCards.js` (340-354L)
  - Aurora **CRECIMIENTO** sección (teal · tier 6)
  - Preview tool:
    - Dropdown `entity_type` (zone · property · development · asesor · insights)
    - Input `slug`
    - Dropdown `layout` (og · feed · story)
    - Botón Preview
  - `<img>` preview area con loading state
  - KPIs strip:
    - cache_entries
    - render_count_24h
    - cache_hit_rate
  - Section stats por entity_type

#### API client NEW
- `frontend/src/api/social_cards.js` (30L)

#### Aurora integration
- `SuperadminLayout.js` +1 word `social-cards` en regex `sectionFromPath` (crecimiento)
- `navByRole.js` tier 6 (CRECIMIENTO teal) +1 item `Icon Share2` (NUEVO import añadido al **lucide-react existing block** · NO crear bloque import nuevo · pattern Claude Code ULTRA-defensivo)
- `App.js` +1 lazy Route

#### og:image inyección pages públicas (aditivo)
- `frontend/src/pages/public/ValorColonia.js` (+9L) — useEffect setMetaTag pattern existente
- `frontend/src/pages/public/ZonePage.js` (+19L)
- `frontend/src/pages/DevelopmentDetail.js` (+21L)
- Pattern **imitar ColoniaLanding shipped** · NO Helmet · NO añadir boilerplate

#### i18n
- `es-MX/common.json`: namespace `social_cards` 32 strings (+40 con global keys)

### 2.3 Integraciones cross-módulo

- **W4.18.2 Mapbox Static API**: snapshot mapas KPIs colonia
- **W3.1 zones collection**: KPIs zone_score · avg_price/m2 · top dev · demand index para zone cards
- **developments + properties collections**: KPIs entity_type específico
- **asesores collection**: bio/photo asesor cards
- **W5.11 audit_immutable_engine**: log first-time render (best-effort)
- **W5.21 InsightsCompare.js** (posterior): agregó entity_type `insights` reusando engine (+1 SUBTITLES map)

---

## 3 · Endpoints (4 total)

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | `/api/social-cards/og/{entity_type}/{slug}.png` | Public | 1200×630 horizontal · OG protocol link preview (FB · LinkedIn · WA · Twitter · Telegram · iMessage · Discord · Slack) |
| GET | `/api/social-cards/feed/{entity_type}/{slug}.png` | Public | 1080×1080 cuadrado · download manual broker para postear IG/FB feed nativo |
| GET | `/api/social-cards/story/{entity_type}/{slug}.png` | Public | 1080×1920 vertical + QR code · download para IG Stories/TikTok/WA Status |
| GET | `/api/superadmin/social-cards/stats` | Superadmin | cache_entries + render_count_24h + cache_hit_rate + por entity_type |

Rate-limits:
- Public: 600/min/IP **lax NO 429** (fallback PNG en lugar de error · evita romper compartidos virales)
- Superadmin: 60/min

---

## 4 · Crons y scheduled tasks

**Ninguno**. Sistema 100% on-demand con cache LRU 24h memoria + disk. Si entity changes → cache se invalida automáticamente al expirar TTL 24h (acceptable lag para social previews).

⚠️ Riesgo residual documentado: disk cache **sin eviction max-size** (puede crecer indefinidamente · monitorear filesystem en producción).

---

## 5 · Decisiones founder históricas

### 2026-05-10 · BACKLOG entry original (L672-681)
Founder catch alcance multi-plataforma: emergent W4.18.2B sugirió `/og` solo · founder amplió a 3 formatos × 6 plataformas (link previews + IG feed + Stories/TikTok/WA Status).

> "broker comparte link colonia → preview rich = CTR x3-5 vs plano (link platforms) · IG/TikTok no parsean OG pero brokers descargan PNG y postean nativo · marketing orgánico viral 6 plataformas con un solo backend pipeline · paridad con Zillow/Redfin shareability"

### 2026-05-18 · Plan A++ founder approved (commit `0924ce74`)
**Resolución conflict numbering W5.16**: WAVE5_PLAN originalmente W5.16 = "Marketing distribution" mezclando social cards + MCP iframe. MAYO 2026 separación:
- **W5.16 standalone**: Social Cards Multi-platform Renderer (este SPEC) · 11h
- **Z.2 Marketing distribution** (diferido Phase Z): MCP iframe embebible · marketing reusable

Founder ruling: "máximo alcance cero pérdida features" · separar para no inflar batch · ambos shipped independientes.

### 2026-05-18 · ULTRA-defensivo pattern
Tras 5 bugs aurora consecutivos emergent superadmin (W5.11/12/5/15 P2 + W5.FF3 INTENTO 1), founder approved **Claude Code terminal ULTRA-defensivo** para todos los batches superadmin. Pattern probado en W5.16: 5/5 consecutivos sin tocar críticos. Audit Master Dev 10/10 PASSED · W5.FF + W5.25 críticos 16/16 diff=0 · cero hex hardcoded.

---

## 6 · Scope shipped vs scope discutido

### ✅ Shipped completo (3 sub-chunks · 11h)

**Sub-A · social_cards_engine + cache (4h)**:
- Pillow compose + Mapbox Static ✅
- 3 layouts (og · feed · story con QR) ✅
- 4 entity_types iniciales ✅
- Cache LRU memoria 24h ✅
- `social_cards_cache.py` disk cache 24h ✅
- FAIL-OPEN: Mapbox token ausente → gradient solid · entity fetch fail → slug.title() render ✅

**Sub-B · routes + meta og:image inject (4h)**:
- 3 endpoints públicos PNG + 1 superadmin stats ✅
- Cache disk first + headers cache-control ✅
- Rate-limit 600/min lax NO 429 ✅
- og:image aditivo en 3 pages públicas (ValorColonia · ZonePage · DevelopmentDetail) via useEffect setMetaTag pattern ✅
- _RENDER_LOG deque sliding 24h ✅

**Sub-C · SuperadminSocialCards UI + nav (3h)**:
- Page aurora CRECIMIENTO teal ✅
- Preview dropdown + slug + layout + button ✅
- `<img>` preview con loading ✅
- KPIs strip ✅
- Stats por entity_type ✅
- API client ✅
- SuperadminLayout +1 word regex ✅
- navByRole tier 6 +1 item ✅
- i18n 32 strings ✅

### 🟡 Diferido conscientemente

| Item | Score | Razón diferir | Destino |
|---|---|---|---|
| **Z.2 Marketing distribution (MCP iframe embebible)** | 7/10 | Plan A++ separa concerns · widget embebible es módulo standalone | Phase Z post-launch · BACKLOG L699-705 |
| **Disk cache eviction max-size** | 6/10 | Acceptable producción small-scale · monitorear filesystem | Tech debt post-launch |
| **Image embeddings auto-gen** | 5/10 | Sin volumen real | Activar cuando ≥50 proyectos con fotos buenas (BACKLOG L707-712) |
| **og:image dinámico para entity_type "insights"** | 8/10 | Agregado retroactivamente en W5.21 Sub-B (commit `26e5e559`) | ✅ Done post-shipped W5.16 |
| **Audit chain mandatory cada render** | 6/10 | Volume sería excesivo · solo first-time render audit OK | Post-launch evaluar |
| **Variants per language (en-US/pt-BR)** | 5/10 | Mercado MX only por ahora | Wave 6+ |

### 🔴 Perdido — CERO (audit forense confirma)

Audit forense 2026-05-19 verificó · CERO sesgo sistémico.

---

## 7 · BACKLOG enhancements asociados

- `Z.2 Marketing distribution MCP iframe widget embebible` (BACKLOG L699-705) · 4h · Wave 5 H2 / Phase Z
- `Image embeddings real activation toggle` (BACKLOG L707-712) · 0h código (toggle env var) · cuando portfolio ≥50 proyectos fotos
- `Disk cache eviction LRU max-size` (no en BACKLOG · riesgo residual P2 monitor)

---

## 8 · Riesgos residuales NO bloqueantes (documentados al shipping)

1. **SPA og:image inyecta client-side**: crawlers modernos Twitter/FB/LinkedIn parsean post-JS · old crawlers podrían no ver og:image (acceptable · founder approved trade-off)
2. **Mapbox Static quota free 50K req/mes**: monitorear post-launch · upgrade tier si rate cards >50K/mo
3. **Disk cache sin eviction max-size**: filesystem puede crecer indefinidamente · monitorear `storage/social_cards/` size · cron cleanup futuro o LRU eviction
4. **`_RENDER_LOG` deque resetea on restart**: acceptable (analytics no business-critical · stats sliding 24h en-memoria)
5. **Rate-limit lax NO 429**: si bot/attacker satura → cache se llenará de slugs basura · monitorear cache hit rate y aplicar 429 si abuse pattern detectado

---

## 9 · Conexiones cross-módulo (cierre ciclos)

### 📥 Consume (módulos shipped previos)
- ✅ `W4.18.2 Mapbox Static API` (snapshot maps)
- ✅ `W3.1 zones collection` (KPIs zone cards)
- ✅ `developments + properties collections`
- ✅ `asesores collection`
- ✅ `W5.11 audit_immutable_engine` (log first-time render best-effort)
- ✅ `aurora design system` (CRECIMIENTO teal)
- ✅ `i18n es-MX`
- ✅ `superadmin permissions` (stats endpoint)

### 📤 Alimenta (módulos posteriores)
- ✅ **W5.21 InsightsCompare.js** (commit `26e5e559`) reusa engine añadiendo entity_type `insights` + SUBTITLES map (10 títulos estáticos + fallback title-case) para og:image dinámico de 8 SEO landings
- ✅ **3 pages públicas con og:image inyectada** (ValorColonia · ZonePage · DevelopmentDetail) → CTR x3-5 link previews
- ✅ **Brokers/marketing download workflow** feed/story PNG manual para IG/TikTok/WA Status nativo
- 🔜 **Future Z.2 Marketing distribution**: widget embebible iframe puede reusar render engine

---

## 10 · Métricas de éxito / KPIs

| KPI | Target | Cómo medir |
|---|---|---|
| **Cache hit rate** | ≥80% post-warmup | `/api/superadmin/social-cards/stats` |
| **Render latency p50** | <300ms (cache hit) · <2s (cold render) | _RENDER_LOG sliding 24h |
| **Mapbox quota usage** | <50K req/mes free tier | Mapbox dashboard externo |
| **CTR uplift vs link plano** | x3-5 (founder hypothesis L679) | PostHog post-launch funnels (cuando active key) |
| **Disk cache size** | <500MB en producción small-scale | `du -sh storage/social_cards/` cron monitor |
| **Render 200 rate** | ≥99% (fallback PNG garantiza 200 incluso si Mapbox falla) | _RENDER_LOG error count |

---

## 11 · Referencias

- **BACKLOG_ENHANCEMENTS.md L672-681**: entry original 10h emergent W4.18.2B 2026-05-10 + founder catch multi-plataforma
- **WAVE_PROGRESS.md L234**: row W5.16 verbose shipped (3 sub-chunks · ULTRA-defensivo · 16/16 críticos diff=0)
- **Commits canónicos**:
  - `e42bf945` feat W5.16 Social Cards Multi-platform Renderer (ULTRA-defensivo) · merge build
  - `0924ce74` docs Plan A++ resolución W5.16 numbering · MÁXIMO alcance cero pérdida features
  - `4c4fac48` docs W5.16 SHIPPED · 475h
  - `26e5e559` W5.21 SUB-B (reusa engine añadiendo entity_type "insights") · post-W5.16
- **Tags**: `pre-W5.16-social-cards-20260518-2232` (rollback) · `shipped-W5.16-social-cards-20260518-2244` (post)
- **Files NEW**:
  - `backend/social_cards_engine.py` (468L)
  - `backend/social_cards_cache.py` (80L)
  - `backend/routes/social_cards.py` (282L)
  - `frontend/src/api/social_cards.js` (31L)
  - `frontend/src/pages/superadmin/SuperadminSocialCards.js` (354L)
- **Files EDIT**:
  - `backend/server.py` +4L include_router
  - `frontend/src/App.js` +4L lazy Route
  - `frontend/src/components/superadmin/SuperadminLayout.js` +1 word regex sectionFromPath
  - `frontend/src/config/navByRole.js` +3L tier 6 entry
  - `frontend/src/i18n/locales/es-MX/common.json` +40L
  - 3 pages públicas og:image inject

---

## 12 · Reglas inviolables

1. **FAIL-OPEN siempre**: render returns 200 + PNG válido aunque Mapbox/entity fetch fallen (gradient solid + slug.title() fallback) · viral robust > error correctness
2. **NUNCA 429 al cliente público**: rate-limit lax · fallback PNG en lugar de error · evita romper links virales compartidos
3. **og:image inyección aditiva**: NO Helmet · NO añadir boilerplate · imitar pattern useEffect setMetaTag de ColoniaLanding shipped
4. **Audit log best-effort try/except**: audit NO debe bloquear render · audit chain primary path es para acciones críticas, no para social cards
5. **navByRole tier 6 CRECIMIENTO teal**: NO reasignar tier · respeta sidebar aurora 7-tier canónico
6. **Cache disk first check mtime <24h**: ahorra Mapbox quota + reduce latency · invalidación natural por TTL
7. **Audit Master Dev pre-merge**: cero hex hardcoded · 16/16 críticos diff=0 (W5.FF + W5.25) · build OK
