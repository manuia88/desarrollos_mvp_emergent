# DMX Enhancements Backlog

Tracking de enhancements diferidos surgidos durante batches B14-B35. Cada item tiene origen (batch where suggested), destino propuesto (phase/batch where to ship), justificación, y costo estimado.

**Regla:** TODO enhancement que founder apruebe diferir DEBE persistirse aquí inmediatamente. No basta con decir "lo metemos en BXX" — sin entry aquí, se pierde.

---

## 🟡 ALTA PRIORIDAD (1-3 batches futuros)

### Phase Y upgrades · 5 features killer + 3 capas resilience (autorizado founder 2026-05-09)
- **Origen:** análisis Master Dev 2026-05-09 + autorización founder
- **Destino:** distribuido en W4.4-W4.8 (NO batch separado)
- **Qué (3 capas resilience embedded en cada Y.2 agent · +10h total):**
  1. Cache local por agente (snapshots cada 30 min en colección propia · si DB principal falla, usa último snapshot)
  2. Fallback chain 3 niveles (primary → cache → static defaults)
  3. Circuit breaker per-agent (X errors seguidos → auto-degrade tier off + Sentry alert)
- **Qué (5 killer features · +25h total):**
  1. **W4.4 Director chat público `/asistente`** — comprador busca natural language · Director invoca sub-agents → respuesta con recomendaciones reales (+8h)
  2. **W4.6 Smart Routing Lead <60 seg** — lead enriquecido + DISC + asesor asignado + WhatsApp en 1 min (+6h)
  3. **W4.4 What-if Simulator** — dev pregunta "¿qué pasa si bajo 5% precio?" · forecast con confidence interval (+6h)
  4. **W4.8 Replay Debugger AI** — UI con inputs/prompt/output/reasoning chain de cada decisión AI · auditable 100% (+3h)
  5. **W4.8 AI ROI per-developer dashboard** — cada dev ve "AI ahorró Xh · accuracy Y% · conversión +Z%" en su portal (+2h)
- **Total upgrade Phase Y: 102h → 137h (+35h)** · refleja Wave 4 nueva = 496h · H1 nuevo = 813h plan
- **Por qué:** moat real · diferenciación vs Inmuebles24/Lamudi · justifica tier Pro premium · resilience evita cascada cuando algo falla.

### Embed Analytics · trackear qué sitios embeben widgets DMX
- **Origen:** W4.2.5 emergent suggested 2026-05-09
- **Destino:** Wave 4 W4.10 (post Phase Y) ó early W4.16 marketing
- **Qué:** GET endpoint ligero `/api/widgets/{type}/{slug}/track?ref={hostname}` invocado al cargar el widget. Persiste `db.widget_embeds` con `{slug, hostname, count, last_seen_at}`. Dashboard superadmin muestra "Forbes embebe Polanco · El Financiero embebe Condesa" → priorizar outreach prensa data-driven.
- **Por qué:** cierra el loop "embed widget → SEO equity → press relationships". Sin esto, founder NO sabe quién está usando los widgets organicamente.
- **Costo:** ~2h (endpoint + dashboard + minimal UI).

### Widget design system fix · gradient eyebrow + tier colors + dark theme variant
- **Origen:** W4.2.5 design audit founder 2026-05-09
- **Destino:** W4.2.5.1 mini fix-pass (~30 min emergent)
- **Qué:** ajustar `ScoreWidgetPage.js` y `RiskWidgetPage.js`: (1) número grande con gradient indigo→pink Outfit 800; (2) eyebrow "SCORE IE · DESARROLLOSMX" con gradient mask; (3) Risk pill con tier color real (B=cream-green, etc); (4) opción `?theme=dark` URL param para variant dark navy bg + cream text; (5) "Powered by DesarrollosMX" Outfit 700 indigo.
- **Por qué:** widgets actuales se ven genéricos · pierden brand identity · cada embed externo debe ser unmistakable DMX.
- **Costo:** ~30 min (estilos + prop theme).

### Migrar DMX a MongoDB Atlas + setup Mongo MCP read-only para Claude Code
- **Origen:** founder request 2026-05-09 (Mongo MCP setup option A)
- **Destino:** W4.15 Phase 20 Polish + Launch o W4.2.6 prelaunch batch
- **Qué:**
  1. Crear cluster MongoDB Atlas free tier (M0 · ~512MB · suficiente H1)
  2. Migrar data del preview env (mongodump → mongorestore)
  3. Actualizar `MONGO_URL` en `.env` backend
  4. Configurar Mongo MCP server en `~/.claude/settings.json` para Claude Code (yo) — read-only auth
  5. Documentar connection string en password manager
- **Por qué:** hoy preview Mongo corre en K8s interno NO accesible externamente. Atlas es production-grade + me da debugging directo via Mongo MCP + backups automáticos + scaling. Necesario antes de launch H1 igualmente para production-readiness.
- **Costo:** ~4h (cluster setup + migration + verify + MCP config)

### SSR pre-render para landing pages (zona/alcaldía/cdmx-intent)
- **Origen:** W4.2D3 emergent suggested 2026-05-09
- **Destino:** Post-launch H2 (refactor Next.js)
- **Qué:** SSR completo via Next.js refactor o react-snap para que crawlers vean HTML completo sin JS execution. Endpoints `/zona/:slug`, `/alcaldia/:slug`, `/cdmx/:intent` pre-rendered con cache invalidation.
- **Por qué:** ÚTIL pero NO crítico — Google ejecuta JS desde 2019. Refactor mayor (Next.js migration o react-snap pipeline). Mejor en H2 cuando ya hay tráfico para validar ROI.
- **Costo:** ~6-8h (architecture + prerender service + cache invalidation).

### Lead Nurture Cron · matching landing_leads → nuevo inventario + email
- **Origen:** W4.2D3 emergent suggested 2026-05-09
- **Destino:** Wave 4 W4.10 (Phase 8 ext WhatsApp + AutoNewsletter) ó early W4.3
- **Qué:** Cron diario que: query `db.landing_leads` (de W4.2D3 lead capture forms en zonas tier 2 sin inventario), por cada lead match con `db.developments` que apareció nuevo en `zone_interest`, dispara Resend email "Tu zona favorita {Granada} ya tiene inventario nuevo".
- **Por qué:** convierte tráfico SEO en revenue real · cierra el loop tier 2 (capturas leads → entregas valor cuando hay inventario) · LFPDPPP compliant (opt-in en form ya está).
- **Costo:** ~3h (cron job + matching logic + email template).

### Endpoint Superadmin `/api/superadmin/landing-leads` con count agrupado por zone_interest
- **Origen:** W4.2D3 emergent suggested 2026-05-09
- **Destino:** Wave 4 closure ó Phase 20 polish
- **Qué:** GET endpoint admin que retorna `[{zone_slug, lead_count, last_lead_at}]` ordenado por count desc. Permite a founder priorizar qué colonias tier 2 onboardear primero (data-driven roadmap).
- **Por qué:** las leads ya se persisten en `db.landing_leads` (W4.2D3) — solo falta el dashboard. Founder ve "150 leads para Granada → priorizar onboarding inventario allí".
- **Costo:** ~30 min (aggregation + UI minimal en SuperadminDashboard).

### Integración INEGI demographics en `/api/public/zones/{slug}`
- **Origen:** W4.2D2 emergent suggested 2026-05-09
- **Destino:** Phase 7.2 (DENUE/INEGI cuts) ó Wave 5
- **Qué:** Hoy `demographics: {available: false}` placeholder. Integrar INEGI Censos 2020 + Encuesta Nacional Ingresos por AGEB (área geoestadística básica) → enriquece zone pages con población, ingreso medio hogar, edad media, escolaridad, % propietarios, % renta. Datos públicos free.
- **Por qué:** zone pages con demographics reales son 3-5x más creíbles para Google SEO (datos únicos no encontrables en Inmuebles24/Lamudi) + esenciales para inversionistas evaluando barrios.
- **Costo:** ~6h (parser INEGI CSV + map AGEB→colonia + endpoint enrichment).

### Refactor `routes_*.py` flat → `/app/backend/routes/` directory
- **Origen:** W4.2D1 emergent suggested 2026-05-09
- **Destino:** F0 sweep o post-launch H2
- **Qué:** Hoy `backend/` tiene ~80+ archivos `routes_*.py` flat. Mover a estructura:
```
backend/routes/
  scores/  (ie_engine, scores, recipes)
  diagnostic/  (diagnostic, recommendations, comparable_alerts)
  marketplace/  (developer, advisor, comprador)
  superadmin/  (tenants, audit, etc)
  public/  (mcp, seo_files, watchlist)
```
- **Por qué:** footprint creciente · navegación difícil para nuevos contributors · imports más limpios.
- **Costo:** ~3h (mover archivos + ajustar imports en server.py + verificar sin breaks).

### Developer self-serve onboarding flow + tier selection
- **Origen:** W4.2C emergent suggested 2026-05-09
- **Destino:** Wave 4 W4.10-W4.11 area (post Phase Y para que onboarding use agentic features)
- **Qué:** Public signup page para developers · tier selection (free/pro/enterprise) · org_id provisioning automático · welcome email Resend · onboarding checklist UI primer login.
- **Por qué:** sin esto, founder hace onboarding manual 1-on-1 cada developer nuevo. No escala.
- **Costo:** ~12h (signup form + tier picker + org creation + welcome email + checklist UI).

### MCP tool `search_developments` extension (filters bedrooms/m2/parking/stage)
- **Origen:** W4.2B spec gap 2026-05-09 (emergent skipeó esta extensión)
- **Destino:** W4.2C inline mini-fix (~30 min)
- **Qué:** Hoy `search_developments` MCP tool acepta solo `{colonia_id, price_max_mxn, type}`. Falta agregar `bedrooms_min`, `bedrooms_max`, `m2_min`, `m2_max`, `parking_min`, `stage` (preventa/en_construccion/entrega_inmediata). Sin esto Claude/ChatGPT no pueden filtrar correctamente queries tipo "depas 2 recs Polanco <15M con 2 cajones".
- **Por qué:** pieza chica pero crítica para AI assistant capability. Ya estaba en spec original W4.2B pero emergent omitió.
- **Costo:** 30 min en W4.2C como sub-chunk extra.

### Arquitectura nota: K8s routing requiere prefix `/api/*` para backend
- **Origen:** W4.2A emergent constraint 2026-05-09
- **Destino:** Documentar en `prompt_standards.md` (next sweep)
- **Qué:** En el preview env Kubernetes, solo paths con prefix `/api/*` van al backend FastAPI. Paths como `/mcp/*` o `/health` van al frontend React. Por eso MCP server quedó en `/api/mcp` (no `/mcp` puro como spec MCP estándar).
- **Por qué:** evitar que future emergent prompts asuman `/mcp` u otros paths sin prefix `/api/`.
- **Costo:** 5 min documentación.

### Tenant↔Developer mapping schema (reemplazar `TENANT_DEV_MAP` hardcoded)
- **Origen:** W4.1B emergent fix workaround 2026-05-09
- **Destino:** Wave 4 cleanup batch ó CC2 cross-cutting
- **Qué:** Hoy `routes_diagnostic.py` tiene `TENANT_DEV_MAP = {"constructora_ariel": ["quattro","habitare-capital","agora-urbana"]}` hardcoded. Reemplazar con collection `db.tenant_developer_links` schema `{tenant_id, developer_id, role, created_at}` + helper `get_developers_for_tenant(tenant_id)`.
- **Por qué:** hardcoded mapping NO escala más allá de los 3 demo tenants. Bloquea onboarding de tenants reales sin re-deploy.
- **Costo:** ~1.5h (schema + migration script seed actual + 2 endpoint refactor calls).

### W4.1A index dup fix · diagnostic_reports.generated_at TTL conflict
- **Origen:** W4.1A Sentry alert 2026-05-09 ("equivalent index already exist with different name and options")
- **Destino:** W4.1C (mini-fix inline, ~5 min)
- **Qué:** En `diagnostic_engine.py::ensure_diagnostic_indexes` el bloque W4.1A crea 2 índices sobre `generated_at` (uno sin TTL, otro con TTL 24h). Mongo rechaza el segundo. Try/except lo absorbe pero Sentry suena. Eliminar la línea `await db.diagnostic_reports.create_index("generated_at", background=True)` (sin TTL); el TTL index ya cubre query patterns equivalentes.
- **Por qué:** ruido en Sentry · no bloquea funcionalidad pero ensucia signal hygiene.
- **Costo:** 5 min (1 línea)

### Página `/watchlist/manage?token=...` (frontend manage UI)
- **Origen:** W3.9c emergent suggested 2026-05-08
- **Destino:** Wave 3 closure ó early Wave 4
- **Qué:** Page que llame `getWatchlistManage`/`updateWatchlistManage`/`unsubscribeWatchlist` (helpers ya existen en `frontend/src/api/watchlist.js`). Usuario puede editar zonas, cambiar scope, darse de baja desde el link del email opt-in.
- **Por qué:** cierra el loop end-to-end del watchlist. Sin esto el email de doble opt-in tiene un link manage que rompe a 404 en frontend.
- **Costo:** ~30 min (1 page + 3 forms + Route + nav).

### Endpoint Superadmin `/api/superadmin/watchlist/stats`
- **Origen:** W3.9b emergent suggested 2026-05-08
- **Destino:** Wave 3 closure ó early Wave 4
- **Qué:** GET que retorna metrics: count subs por scope · % confirmation rate · % unsubscribe rate · throttled vs sent ratio últimos 30 días.
- **Por qué:** dashboard founder para medir adopción del watchlist sin depender de Mixpanel/Amplitude.
- **Costo:** ~20 min (aggregation pipeline sobre db.watchlist_subscribers).

### Trust Score Badge en cards marketplace
- **Origen:** B32 (Asesor Identity)
- **Destino:** B36 (Phase 13 Marketplace asesor whitelist) o sweep pre-launch
- **Qué:** Mostrar mini-badge (foto + Trust Score + DISC pill) en cada card de asesor visible en marketplace + CRM listings
- **Por qué:** Loop competitivo asesor (mejorar perfil = más leads orgánicos) + buyers filter por trust + amplifica conversion WhatsApp Business
- **Costo:** ~2h (reusa TrustScoreBadge B32 component)

### Bilateral Approval dev-side UI para Inmobiliaria-Dev partnerships
- **Origen:** B35 (Phase 18 Inmobiliaria entity)
- **Destino:** B36 (Phase 13 Marketplace whitelist — mismo pattern bilateral)
- **Qué:** Endpoint PATCH approval ya existe; falta UI en portal dev para aprobar/rechazar partnerships solicitadas por inmobiliarias
- **Por qué:** Cierra el loop bilateral cross-tenant (sin esto = unilateral, no production-safe)
- **Costo:** ~1h (UI + notification al dev_admin)

### Score de Alianza per asesor-developer
- **Origen:** B36 (Phase 13 whitelist closure)
- **Destino:** B37 (Phase 14 cross-partnerships) ó sweep post-launch
- **Qué:** Score 0-100 PER partnership específica (asesor X con dev Y), distinto del Trust Score genérico B32. Combina: deals cerrados con ese dev + response time en proyectos del dev + endorsements de clientes que cerraron con esa partnership. Visible en sidebar inventario asesor + tabla solicitudes dev.
- **Por qué:** Incentiva retention partnership (asesor mantiene buena reputación con dev específico) + dev prioriza top performers reales (no solo trust generic). Diferente de Trust Score B32 que es promedio across todos los devs.
- **Costo:** ~2h (reusa Trust Score B32 formula pattern + asesor_metrics B20 con filtro por dev_org_id + endorsements filtered)

### Smart Match B30 → conectar con B34 Lead-to-Asesor
- **Origen:** B30 + B34 (similares conceptos, diferentes scopes)
- **Destino:** Sweep optimization post-launch
- **Qué:** B30 Smart Match buyer↔colonia + B34 Smart Match Lead↔asesor → unificar bajo motor común reusable
- **Por qué:** DRY, ya hay lógica weighted scoring repetida
- **Costo:** ~2h refactor

---

## 🟢 MEDIA PRIORIDAD (Phase específica)

### Auto-WA briefing pre-visita
- **Origen:** B31 (Asesor Tools)
- **Destino:** Phase 8 WhatsApp + Coms (~15h)
- **Qué:** Cuando asesor tiene cita próxima 24h, enviar automáticamente briefing pre-visita (B33 visit_auto_prep) por WhatsApp al cliente como template "Te espero mañana en X. Lleva: ..."
- **Por qué:** Reduce no-shows ~30-40% (estimado emergent). Diferenciador vs Inmuebles24/Lamudi
- **Costo:** ~3h (cuando WhatsApp Business activo)

### Buyer DISC Inferencer
- **Origen:** B32 (clarificación founder)
- **Destino:** Phase Y.3 (Reply Classifier + Buyer DISC)
- **Qué:** AI analiza mensajes acumulados del lead (WA + chat) → infiere DISC → surface insights al asesor "lead tipo D, sé directo"
- **Por qué:** Verdadero valor vs DISC asesor (que es auto-declaración)
- **Estado:** ✅ YA documentado en PRD.md commit `2eb298e` · Phase Y.3 25h → 28h
- **Costo:** Incluido en Y.3 (~3h del total 28h)

### Reply Classifier inbound
- **Origen:** Audit Teckel AI Atlas (B26 era)
- **Destino:** Phase Y.3
- **Qué:** Clasifica intent en mensajes WA/email entrantes + auto-draft response con confidence threshold human-in-loop
- **Por qué:** Cierra el loop CRM end-to-end (Teckel diferencial real)
- **Estado:** ✅ YA documentado en PRD.md Phase Y.3
- **Costo:** Incluido en Y.3 (~5h del total 28h)

### Inmobiliaria War Room dashboard
- **Origen:** B34 (post-Phase 3 closure)
- **Destino:** Phase 13/14/18 Inmobiliaria entity (cuando se construya)
- **Qué:** Dashboard "war room" para director: forecast Claude Sonnet 30/60/90 días + anti-leakage heatmap (asesores sin Daily Feed B34 ejecutado) + Trust Score B32 promedio team + Pipeline mix por DISC
- **Por qué:** Convierte DMX en herramienta gestión vs Salesforce/HubSpot para inmobiliarias LATAM
- **Costo:** ~5h (originalmente B36 standalone)

### Copilot Agentic Actions
- **Origen:** B23 (AI Copilot lateral)
- **Destino:** Phase Y.1 Director Agent (~25h)
- **Qué:** Copilot puede ejecutar acciones (navigate, filter, etc) — no solo responder. Ej: "Llévame al CRM filtrado por leads sin contacto últimos 7 días" → estructured output `{type: 'navigate', url}` ejecutable
- **Por qué:** DAU multiplier + más sticky
- **Estado:** Documentado mentalmente en Phase Y, ahora explícito aquí
- **Costo:** Incluido en Y.1 (~3h del total 25h)

---

## 🔵 BAJA PRIORIDAD (H2 / Polish / Growth)

### Export CSV/PDF Comparables
- **Origen:** B19 (Branding 100%)
- **Destino:** Sweep pre-launch o H2 polish
- **Qué:** Botón "Descargar comparación CSV/PDF" en `/comparar` para dev/asesor compartir benchmark con inversionistas
- **Por qué:** Útil para closing presentations, reusa endpoint PDF B8
- **Costo:** ~30 min

### Widget embebible Comparador iframe
- **Origen:** B27 (Phase 1 closure)
- **Destino:** H2 backlog growth channels
- **Qué:** `<iframe src="/comparar?ids=...&embed=1">` para blogs inmobiliarios y agencias asociadas — backlinks SEO + leads attributed al embedder
- **Por qué:** Low-CAC growth channel, viral organic
- **Costo:** ~3h (modo embed sin Navbar + theming via query params + tracking source)
- **Activar cuando:** después de validar adopción interna del comparador

### W5.10 — Social/Ads Multi-tenant + Analytics Granular + IA Layer (Wave 5 H2 · 205h)
- **Origen:** founder propuesta 2026-05-10 (modelo GoHighLevel + IA + granularity brutal)
- **Destino:** Wave 5 H2 (post-launch público compradores · ~julio)
- **Detalle granularidad completo:** `memory/INSIGHTS_GRANULARITY_SCHEMA.md` (16 categorías × ~150 sub-dims · top 10 cross-dim queries definidas)
- **Sub-chunks:**
  - **Capa 1: OAuth multi-platform** (Meta + Google/YouTube + base TikTok/LinkedIn) · token vault encrypted per-user · embedded signup WhatsApp · 30h
  - **Capa 2: Posting engine multi-platform** (FB · IG · WhatsApp Cloud API · YouTube Data API + Shorts · cross-post automático) · 25h
  - **Capa 3: Ads creator + scheduler** (campaign · ad set · ad creative builder · queue calendar) · 25h
  - **Capa 4: Analytics aggregation engine** (16 categorías · 150 sub-dims · cross-platform · cross-user · cross-tenant · MongoDB time-series + agregados materializados) · 35h
  - **Capa 5: Granularity slicer multidim** (cubo OLAP-like · faceted UI · 16 dims · multi-select · time range · save filter views · pre-compute slices comunes 1h cron) · 30h
  - **Capa 6: Dashboards 3 roles** (Asesor/Inmobiliaria · Dev · Superadmin · permission filter middleware · jerarquía interna inmobiliaria multi-asesor) · 25h
  - **Capa 7: MCP IA optimization layer** (Meta MCP oficial https://mcp.facebook.com/ads · LLM ingiere snapshot queries → recomendaciones cuantificadas top 10 cross-dim queries) · 25h
  - **Capa 8: Studio Wave creative pipeline integration** (W4.9 video → cross-post Reels/Shorts/FB · staging IA → ads imagery) · 10h
- **Founder ops paralelo H1 (sin esto Wave 5 atrasa):**
  - Meta Business Verification (3-7 días)
  - Meta App Review permissions: `ads_management` · `pages_manage_posts` · `instagram_basic` · `whatsapp_business_management` · `whatsapp_business_messaging` (2-4 sem)
  - Google OAuth + YouTube Sensitive Scopes Review (4-6 sem)
  - TikTok Marketing API request (2-3 sem · diferir Wave 6 si no priority)
  - LinkedIn Tier 2 Partner (6-8 sem · diferir Wave 6 si no priority)
- **Acceptance criteria mínimo:** plataforma debe responder sin código adicional las 10 queries cross-dim definidas en `INSIGHTS_GRANULARITY_SCHEMA.md`
- **Wedge:** plataforma estilo HubSpot+GoHighLevel+Hootsuite+Sprout Social cross-vertical real estate MX único en LATAM

### Lead Journey leaderboard cohort comparison (W4.13.A enhancement P2 0h emergent)
- **Origen:** W4.13.A emergent suggested 2026-05-10
- **Destino:** F0 sweep tech debt o W5.10 capa 6 dashboards
- **Qué:** endpoint `GET /api/lead-journey/leaderboard?period_days=30` retorna top 10 asesores por conversion_rate + avg_steps_to_close · permite tenant admin identificar mejor playbook
- **Costo:** ~1h (consulta agregada sobre `lead_journey_steps` ya indexada)
- **Activar:** F0 sweep próximo

### Cross-org lead movement audit (W4.13.A deferral)
- **Origen:** W4.13.A scope analysis 2026-05-10 — leads que cambian de tenant son <5% pero auditoría compleja
- **Destino:** Wave 5 W5.11 governance suite
- **Qué:** flujo formal cuando lead cambia de org (ej. broker A pierde, broker B captura) · audit log · notificación ambos tenants · ownership timeline en lead detail
- **Por qué:** edge case real pero infrecuente · auditoría requiere governance UI + LFPDPPP cross-tenant data sharing rules · no bloquea H1 testing brokers únicos
- **Costo:** ~6h (audit log cross-tenant + UI ownership timeline + notification rules)
- **Activar cuando:** Wave 5 H2 cuando >10 brokers piloto compitan por mismo lead

### A/B Meta Ads campañas automatizadas (W4.13.B condicional)
- **Origen:** W4.13.B Project Performance Intelligence scope analysis 2026-05-10
- **Destino:** Wave 5 W5.10 si founder no tiene FB Ads API token + Meta Business Manager access H1
- **Qué:** dev sube proyecto pre-construction → DMX crea automáticamente 3 variant ad copies + targeting interests + budget split → corre 7 días → optimiza ganador → reporta ROI per ad spend · requiere Meta Business Manager + FB Ads API token + ad account ID
- **Por qué:** wedge competitivo único (devs que no manejan Meta Ads se ahorran agencia $5K-15K/mes) · pero depende de stack Meta complejo (Business Manager + ad account + payment method + token rotation 60d)
- **Costo:** ~12h (FB Ads API integration + ad creator + targeting builder + budget allocator + winner picker)
- **Activar cuando:** founder confirme acceso Meta Business Manager + FB Ads API token (sino diferir Wave 5)

### ROI Dashboard Panel TenantDrawer (W4.18.2A emergent suggested)
- **Origen:** W4.18.2A emergent suggested 2026-05-10 (P1)
- **Destino:** Wave 5 W5.11 governance suite
- **Qué:** panel en superadmin TenantDrawer que muestra `{leads_capturados, conversion_rate, revenue_attributed, AI_hours_saved, asesor_efficiency}` per tenant · gráfico evolución 90d
- **Por qué:** founder debe poder responder "¿qué tanto vale DMX para tenant X?" en 30 segundos · informa retention + pricing tier upgrades
- **Costo:** ~4h (endpoint agregado + panel UI dentro TenantDrawer existente)
- **Activar cuando:** Wave 5 con ≥10 tenants piloto activos

### Refactor `routes_*.py` → `/app/backend/routes/` (W4.18.2A emergent suggested)
- **Origen:** W4.18.2A emergent suggested 2026-05-10 (P1) · 30+ archivos `routes_*.py` en raíz `backend/`
- **Destino:** F0 sweep tech debt
- **Qué:** mover todos los `routes_*.py` (30+ archivos) a `/app/backend/routes/` · ajustar imports en `server.py` · mantener nombres archivos · mejora navegabilidad
- **Por qué:** raíz `backend/` tiene 50+ archivos · degrada legibilidad · cualquier dev nuevo se pierde · cero impacto runtime
- **Costo:** ~3h (move + sed imports + verify all routers register)
- **Activar cuando:** F0 sweep próximo

### Microsoft OAuth activation (Calendar W2 follow-up)
- **Origen:** W2.x Calendar shipped Google OAuth · Microsoft pending · W4.18.2A emergent suggested 2026-05-10 (P2)
- **Destino:** F0 sweep tech debt o Wave 5 W5.13 integrations expand
- **Qué:** activar Microsoft Graph OAuth para users con Outlook/Office365 · sync Calendar bidireccional · setup wizard
- **Por qué:** brokers/devs corporativos suelen usar Outlook · ahora obligados a Google · barrera adopción
- **Costo:** ~4h (Microsoft app registration + OAuth flow + Graph API calendar.read/write)
- **Activar cuando:** founder reporte ≥3 brokers piloto pidiéndolo (signal real demand)

### CLI `python -m lead_nurture_engine --dry-run` (W4.18.2A emergent suggested)
- **Origen:** W4.18.2A emergent suggested 2026-05-10 (P2)
- **Destino:** F0 sweep tech debt
- **Qué:** modo CLI dry-run para `lead_nurture_engine` Y.3E que itera leads activos sin enviar mensajes reales · output: tabla leads + qué mensaje recibirían + canal · útil debugging cron 04:15 MX
- **Por qué:** cuando algo falla en cron nurture diario, founder/dev debug sin spam usuarios reales
- **Costo:** ~2h (CLI argparse + dry_run flag en send functions + table output)
- **Activar cuando:** F0 sweep próximo

### Resend "welcome broker" email post-signup-broker (W4.18.3 follow-up)
- **Origen:** W4.18.3 spec mencionó pero no implementado (out-of-scope sub-A) · founder needs warm onboarding 2026-05-10
- **Destino:** F0 sweep tech debt (Claude Code · ~1h) · activar antes de invitar primer broker piloto
- **Qué:** hook en `routes_private_beta.signup_broker` después de `consume_code` exitoso → llamada a `resend_engine.send_welcome_broker(email, name, invite_code)` reusando infra W4.10 ya shipped · template HTML con branding DMX + login link `/broker-portal` + onboarding tips top 3 features · LFPDPPP-compliant
- **Por qué:** broker piloto recibe correo bienvenida = profesionalismo desde primer contacto · reduce abandono onboarding (40% típico sin warm sequence) · dato crítico: brokers VIP early-adopters · cero cost (Resend free tier 3K/mes ya activo)
- **Costo:** ~1h (template HTML + hook + smoke test)
- **Activar cuando:** ANTES de generar primer batch de códigos invitación reales (founder ops trigger)

### Waitlist funnel analytics dashboard (PostHog cross W4.18.3)
- **Origen:** W4.18.3 emergent suggested 2026-05-10 mientras `PRIVATE_BETA_MODE=true` activo
- **Destino:** Wave 5 W5.20+ marketing analytics suite
- **Qué:** endpoint `/api/superadmin/waitlist/funnel` retorna `{visitors_landing, waitlist_signups, signup_rate, by_utm_source_breakdown, by_utm_medium, by_utm_campaign}` cruzando eventos PostHog `$pageview` filtrados por path `/` con waitlist signups · UI panel en `/superadmin/invites` tab nuevo "Conversión waitlist" con gráfico de embudo
- **Por qué:** durante 2-3 meses private beta el waitlist crece orgánicamente · founder necesita dashboard real de cuál UTM source convierte mejor (FB ads vs LinkedIn vs prensa orgánica vs SEO mapa) · informa presupuesto Q2 marketing post-launch · permite A/B test landing variants
- **Costo:** ~2h (endpoint funnel agregado + UI panel reusa SuperadminInvites tabs · llamada PostHog API server-side con secret key)
- **Activar cuando:** waitlist tenga ≥100 emails (cuándo signal sea estadísticamente útil)

### Rate-limit `/api/waitlist/signup` (P2 abuse protection)
- **Origen:** W4.18.3 edge case 6 emergent reportado 2026-05-10
- **Destino:** F0 sweep tech debt (Claude Code · 30 min)
- **Qué:** aplicar mismo pattern `routes_avm_public.py` rate-limit in-memory (defaultdict deque por IP · 30/min/IP) al endpoint `/api/waitlist/signup` · evita scrapers/bots inflando waitlist con emails fake
- **Por qué:** endpoint público sin auth + idempotente upsert por email = bot puede meter 50K emails fake con scripts trivialmente · contamina conversion analytics + DMX se ve mal en métricas reales
- **Costo:** ~30 min (copy-paste pattern existente)
- **Activar cuando:** F0 sweep próximo · ANTES de exposición pública real

### DMX Insights Layer — Wiki Karpathy + Backend público (W5.20-21 Wave 5 H2)
- **Origen:** founder propuesta 2026-05-10 + análisis Karpathy LLM Wiki pattern (video Andrej Karpathy 2026-05-10)
- **Destino:** Wave 5 H2 W5.20-21 (post-launch público brokers + compradores)
- **Qué (arquitectura dual)**:
  - **Capa A — Wiki interno Karpathy pattern** (`/insights-wiki/` repo): `CLAUDE.md` rules curación + `index.md` + `raw/{fuente}/` por fuente + `wiki/{temas,ciudades,insights}/` curado · navegable via Obsidian local (founder/team) o cualquier IDE/agente CLI · portátil agent-agnostic
  - **Capa A.2 — Multi-source scrapers** (~80 fuentes investigadas en `memory/INSIGHTS_SOURCES_RESEARCH.md` · Tier prioritario ~25 fuentes 🟢): JLL · Knight Frank · Savills · CBRE · Cushman · Colliers · PwC · Deloitte · BIS · OECD · IMF · World Bank · FRED · BANXICO ✅ · INEGI · SHF · CONAVI · BMV FIBRAs · CNBV · Numbeo · Global Property Guide · Zillow Research · Redfin · Inmobiliare · Obras Web · Expansión · El Financiero · Forbes MX · ULI · ArchDaily · Espacio Urbano · Real Estate Lifestyle
  - **Capa A.3 — Pipeline curación Claude Code skill** (`bulk_ingest`/`lint`/`query` Karpathy pattern): cron weekly itera fuentes activas · sintetiza raw → wiki cross-referenced con cita fuente + archive.org snapshot
  - **Capa B — Backend público DMX** (MongoDB `knowledge_articles` collection + sync wiki→DB al publicar + `/insights` blog SEO + sitemap dinámico) · indexable Google
  - **Capa B.2 — 5 upgrades Tier 1** (AI-assisted authoring Haiku +3h · PDF lead magnet +2h · asesor citation widget WhatsApp +2h · Cited by Atlax badge +1h · Newsletter auto-include W4.10 wire-up +1h)
  - **Capa B.3 — Atlax 17vo tool dual-mode** (search wiki interno paths + DB pública semantic · cita fuentes transparente · narrativa moat única en LATAM)
- **Por qué:** wedge "referente noticias real estate MX" único en LATAM · paridad con Knight Frank/Savills/JLL reports · cruce MX↔global verificable · authority play SEO + waitlist conversion · Atlax cita fuentes con paths reales (auditable) · founder/team puede operar via Obsidian visual sin tocar código (zero barrier-of-entry) · multi-vertical: compra · venta · inversión · proptech · fintech · innovación · sustentabilidad · lifestyle
- **Por qué NO Obsidian standalone:** Obsidian es PKM personal, no integrable como producto público. Sirve como reader del vault `/insights-wiki/` (markdown puro) pero el blog SEO + Atlax + lead magnets requieren capa B backend.
- **Costo:** ~41h Wave 5-6 distribuido:
  - Sub-A wiki estructura + CLAUDE.md curación: 3h
  - Sub-B verificación 80 fuentes (founder + Claude Code session): 4h founder ops
  - Sub-C scrapers tier prioritario 25 fuentes + cron: 12h
  - Sub-D pipeline curación Claude Code skill: 2h
  - Sub-E backend `knowledge_articles` + sync + `/insights` blog SEO + sitemap: 12h
  - Sub-F 5 upgrades Tier 1 (AI auth + PDF + citation + badge + newsletter): 9h
  - Sub-G Atlax 17vo tool dual-mode: 3h
- **Reglas operativas:** NO scrapear competidores MX (per `feedback_no_scraping_competitors.md`) · NO publicar paywall raw (cita+link) · respeter robots.txt · throttle 1req/30s · archive.org snapshot · LFPDPPP no PII · source attribution obligatoria
- **Activar cuando:** Wave 5 H2 post-launch público compradores (cuando termine private beta brokers W4.18.3 · ~3 meses post-launch H1)

### Social cards multi-formato `/og` + `/social/feed` + `/social/story` (FB/IG/LinkedIn/WA/TikTok/Twitter/Telegram)
- **Origen:** W4.18.2B emergent suggested 2026-05-10 · founder catch alcance multi-plataforma 2026-05-10
- **Destino:** Wave 5 H2 W5.16 marketing distribution
- **Qué:** 3 endpoints backend que renderizan imágenes dinámicas con Mapbox Static API snapshot + KPIs colonia (zone_score · avg_price/m2 · top dev · demand index) + branding DMX:
  - `GET /og/colonia/{slug}.png` → 1200×630 horizontal · auto-servido vía `<meta og:image>` para link previews en **FB · LinkedIn · WhatsApp · Twitter · Telegram · iMessage · Discord · Slack** (todas parsean OG protocol)
  - `GET /social/colonia/{slug}/feed.png` → 1080×1080 cuadrado · download manual broker/marketing para postear nativo en **Instagram feed · Facebook feed · LinkedIn nativo**
  - `GET /social/colonia/{slug}/story.png` → 1080×1920 vertical · download para **Instagram Stories · TikTok · Facebook Stories · WhatsApp Status**
- **Por qué:** broker comparte link colonia → preview rich = CTR x3-5 vs plano (link platforms) · IG/TikTok no parsean OG pero brokers descargan PNG y postean nativo · marketing orgánico viral 6 plataformas con un solo backend pipeline · paridad con Zillow/Redfin shareability
- **Costo:** ~10h (FastAPI 3 endpoints + Pillow render compose multi-layout + Mapbox Static API call + cache filesystem 24h + 3 templates layout · pipeline rendering compartido entre formatos)
- **Activar cuando:** Wave 5 marketing campaign · post launch público · pre-Reels/TikTok/IG/FB content series brokers

### AVM público swap heurístico → hedonic_regression_engine real (P1 tech debt)
- **Origen:** W4.18.2B audit Claude Code 2026-05-10 — emergent reportó "hedonic_engine.py no existe" pero `backend/hedonic_regression_engine.py` SÍ existe (9+ archivos lo importan)
- **Destino:** F0 sweep tech debt (Claude Code lead)
- **Qué:** swap en `backend/avm_public_engine.py:avm_quick()` de modelo heurístico (rec_factor + ban_factor + age_factor) a llamada real `hedonic_regression_engine.predict(colonia, m2, recamaras, banos, antiguedad)` · mantener mismo response shape · mantener fallback heurístico si hedonic falla
- **Por qué:** AVM público `/valores` debe usar regression real con coefficientes entrenados sobre `unit_price_history` para credibilidad founder (precio confiable cara a prensa) · evita reportes "DMX inventa precios"
- **Costo:** ~2h (swap function call + tests numéricos comparison vs heurístico baseline)
- **Activar cuando:** próximo F0 sweep (P1 alta prioridad antes de marketing campaign)

### PostHog dashboard "Funnels Mapa Cerebro" (post-launch ops)
- **Origen:** W4.18.2A.0 emergent suggested 2026-05-10
- **Destino:** Founder ops post-launch (cuando active API key real PostHog)
- **Qué:** crear dashboard en posthog.com UI con funnel filtrado por `$current_url ~ /mapa*`. Steps: `Marketplace pageview` → `click ver-en-mapa-trigger` → `Mapa pageview` → `click layer pill` → `Atlax contextual button click`. Permite cuantificar conversión flow Mapa Cerebro Espacial.
- **Por qué:** valida wedge competitivo W4.18.2 con data real desde día 1 launch · informa W4.18.2B priorización cross-features · costo cero PostHog free tier 1M events
- **Costo:** 0h dev · ~30 min founder ops en posthog.com UI
- **Activar cuando:** founder cargue `REACT_APP_POSTHOG_API_KEY` real en frontend/.env producción

### Widget embebible Mapa Cerebro Espacial iframe
- **Origen:** W4.18.2A emergent suggested 2026-05-10
- **Destino:** Wave 5 H2 W5.16 marketing distribution (junto con MCP distribution)
- **Qué:** `<iframe src="/mapa?layer=zone_score&embed=1">` para prensa/bloggers integren Mapa directamente en artículos — multiplica backlinks SEO + autoridad dominio (paridad con `/widgets/score/{slug}` ya producción)
- **Por qué:** CAC=0 viral angle · prensa inmobiliaria CDMX (Forbes, El Financiero, Expansión) embebe = backlinks high-authority · cada embed = pixel tracking source
- **Costo:** ~4h (modo embed sin Navbar + theming via query params + tracking source via `/api/widgets/maps/track` reusando infra Embed Analytics)
- **Activar cuando:** post-launch público + prensa outreach activa (Wave 5)

### Image embeddings real activation
- **Origen:** B24 image search (B25 toggle)
- **Destino:** Cuando portfolio tenga ≥50 proyectos con fotos buenas
- **Qué:** Toggle `IMAGE_EMBEDDINGS_ENABLED=true` activa cron nightly que pre-computa embeddings reales sobre fotos
- **Estado:** ✅ Pipeline + toggle ya construidos en B25 Sub-C — solo flip env var
- **Costo:** $0 código (ya hecho), solo cuando data madure

### Sparklines real price history activation
- **Origen:** B29 (Comparador Premium)
- **Destino:** Cuando proyectos tengan ≥12 meses data en `db.unit_price_history`
- **Qué:** Toggle `PRICE_HISTORY_REAL_DATA=true` activa sparklines reales en lugar de synthetic
- **Estado:** ✅ Toggle ya construido en B30 Sub-B — solo flip env var
- **Costo:** $0 código

### Wrapped scheduler staging activation
- **Origen:** B30 (Phase 2 closure)
- **Destino:** Post-launch cuando tengas users reales
- **Qué:** Activar APScheduler 1ro de mes 6am en producción para auto-generar wrapped mensual + email Resend
- **Estado:** Code listo en B30, solo necesita RESEND_API_KEY activo + bandera de activación
- **Costo:** $0 código, solo configuración cuando tengas user base

### LinkedIn OAuth real
- **Origen:** B32 (LinkedIn import manual stub)
- **Destino:** Phase 8 ó standalone post-launch
- **Qué:** Hoy es manual paste URL + form fields. Activar OAuth real con LinkedIn API requiere LinkedIn partnership program
- **Costo:** ~4h + LinkedIn partnership approval timeline
- **Bloqueador externo:** LinkedIn partnership not guaranteed

### AMPI API real verification — DESCARTADO 2026-05-07
- **Origen:** B35 (Phase 18 Inmobiliaria)
- **Destino:** ❌ NO perseguir partnership AMPI
- **Qué:** Hoy stub formato 8-12 alfanum + manual review.
- **Decisión 2026-05-07:** Founder confirmó AMPI no tiene data unique value (solo lista membresía + códigos éticos + eventos). Lo que importa viene de catastros municipales, notarías, bancos/SOFOM. **Mantener stub format check para badge Trust Score B32**, pero NO perseguir verification real ni partnership institucional.
- **Reemplazos data inmobiliaria reales:** Wave 3 SHF Índice + cubo Z + ZZ.2 Transaction Network (notaría partnership) + catastros piloto

### Microsoft OAuth Calendar
- **Origen:** B15 (stub forward-compat)
- **Destino:** Cuando founder tenga Microsoft tenant válido
- **Qué:** B15 dejó CalendarProvider abstracto + Microsoft stub. Solo activar real OAuth + flip card UI
- **Estado:** Code listo, solo falta tenant Microsoft 365
- **Costo:** $0 código, solo configuración tenant

### Mobile push notifications real
- **Origen:** F0 sweep (F0.10)
- **Destino:** F0 sweep batch (~22h)
- **Qué:** iOS APNs + Android FCM real wiring (hoy solo in-app notifications)
- **Costo:** ~2-3h (parte del F0 sweep)

### Web Push API real
- **Origen:** B23 + B14
- **Destino:** F0 sweep / Phase 8
- **Qué:** Service worker + push subscription para notifications navegador desktop
- **Costo:** ~2h

### Google Calendar bidireccional Tareas
- **Origen:** B33 (Calendar bidireccional)
- **Destino:** Sweep post-launch
- **Qué:** Hoy Calendar bidi solo para appointments. Extender a Tareas asesor (sync bidirectional con Google Tasks o Calendar tasks)
- **Costo:** ~3h

### ML Observability Feedback Acceptance Rate
- **Origen:** F0.11 + Phase Y
- **Destino:** Phase Y.5 (Agent observability)
- **Qué:** Dashboard de quien acepta/rechaza sugerencias AI (Argumentario, AI Suggestions, Daily Feed actions) + Feedback Acceptance Rate per agent
- **Estado:** Mencionado en Phase Y.5 originally
- **Costo:** Incluido en Y.5 (~3h del total 9h)

### Studio Wave 1.5 features tier
- **Origen:** Phase 6 master plan
- **Destino:** Phase 6 (~36h ya planeada)
- **Qué:** S1.2 Trim/Reorder/Transitions · S1.3 10 export presets multi-canal · Hook auto + Pacing AI + Re-edit AI
- **Costo:** Ya en Phase 6 plan

### Argumentario Feedback Loop
- **Origen:** B31 (Argumentario AI RAG)
- **Destino:** Phase Y.5 ó sweep ML training
- **Qué:** Asesor da feedback "esta respuesta funcionó" / "no funcionó" → entrenar ML para mejorar KB ranking + suggestions futuras
- **Costo:** ~3h

### Chat Attachments
- **Origen:** B29 (Chat asesor in-app)
- **Destino:** Sweep post-launch ó Phase 8
- **Qué:** Permitir attachments (fotos, PDFs) en chat in-app comprador↔asesor
- **Costo:** ~2h

### Briefing en fichas proyecto público
- **Origen:** B31 (Briefing Tráfico)
- **Destino:** Phase 1 sweep marketing OR Phase 8
- **Qué:** Cuando comprador público abre ficha proyecto, mostrar tiempo viaje + clima a esa zona desde su location (geolocation API browser)
- **Costo:** ~2h

### Bulk-upload-btn render bug fix
- **Origen:** B1 original
- **Destino:** F0 sweep / pre-launch QA
- **Qué:** Botón Bulk Upload no renderiza correctamente en alguna ruta. Diferido sweep H1.
- **Costo:** ~1h debug + fix

### Playwright auth nested routes drop
- **Origen:** Multiple batches (testing infra)
- **Destino:** Phase 20 Polish + Launch (E2E tests)
- **Qué:** Playwright auth se drop en rutas anidadas durante testing automation
- **Costo:** Incluido en Phase 20

### Asesor Wrapped + Share-link público
- **Origen:** Audit Teckel AI Atlas (skipped en Phase 3 split)
- **Destino:** Sweep growth post-launch
- **Qué:** Spotify Wrapped pero para asesor (deals cerrados · response time · NPS · ranking equipo) + share LinkedIn/WhatsApp con og:image
- **Por qué:** Asesor se vuelve marketer DMX hablando de sus achievements
- **Costo:** ~3h (reusa pattern B30 wrapped + B27 share-link)

### Asesor Coach AI proactive
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Phase Y.3 Lead Sub-agent
- **Qué:** AI lateral sugiere acciones específicas: "Lead X tiene 5 días sin contacto, response rate baja, sugiero llamar próxima hora"
- **Estado:** Concepto incluido implícitamente en Phase Y.3 + B34 Daily Feed
- **Costo:** Incluido en Y.3

### Voice Calibration asesor
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Phase Y.4 Adaptive features
- **Qué:** Argumentario aprende del style del asesor (top-performing emails históricos) — para emails/WA salientes
- **Estado:** Mencionado en Phase Y.4 "Caya style adaptive"
- **Costo:** Incluido en Y.4

### Mailbox Warmup + SPF/DKIM/DMARC
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Defer hasta validar demanda outbound real
- **Qué:** Email deliverability infra para outbound massive
- **Costo:** ~5-8h cuando se valide demanda

### Tier "Asesor Pro" comercial
- **Origen:** Audit Teckel AI Atlas
- **Destino:** H2 commercialization
- **Qué:** Tier standalone para asesores independientes ($X/mes) con KPIs comprometidos packaging tipo Teckel
- **Costo:** Comercial, no técnico

### SA5.0 — Per-tenant Feature Flags + GHL-style Snapshots (commercialization foundation)
- **Origen:** B36 discussion 2026-05-06 + 2026-05-07 (founder pidió checklist per-dev + GHL-style templates)
- **Destino:** Wave 2 SA5 Commercial · prerequisite para Stripe billing tiered
- **Qué:** Sistema 4 piezas integradas:
  1. **Feature flags per tenant** (~8h): schema `db.tenant_features` + endpoint admin toggle + hook frontend `useFeatureFlag` + `<UpgradeTeaser/>` component (preview borroso + CTA "Contactar ventas") + ~10 flags iniciales (demanda · pricing_ai · site_selection · competidores · reportes_ia · cross_partnerships · studio · bulk_drive_sync · api_access · advanced_analytics)
  2. **Plan templates simples** (~2h): guardar combos reusables ("Basic", "Pro", "Enterprise") aplicar a dev en 1 click vs marcar 12 checkboxes
  3. **Trial auto-expiry + email warnings** (~3h): toggle con `expires_at` + cron diario que avisa día 7/3/1 antes + auto-revert + email "tu trial expiró"
  4. **GHL-style full snapshots** (~6h): templates clonables tipo GoHighLevel con feature flags + pipeline CRM default (etapas + colores) + email templates default (bienvenida/follow-up/propuesta) + branding starter + automations default (nuevo lead → asignar asesor) + DISC config + reportes IA pre-configurados. Founder en superadmin tiene 3 templates base: "Dev Solo" · "Dev Mid 5-15 proyectos" · "Dev Enterprise 30+ proyectos". Onboarding nuevo dev = aplicar snapshot → en 30s tiene plataforma funcional vs 2h configurando manual.
- **Por qué:** Foundation para freemium + tiered pricing. Sin esto, monetización solo es flat fee. GHL-style snapshots habilitan franchising modelo a otros países (Colombia, Perú) — patrón monetización que escala $100M+ ARR.
- **Costo total:** ~19h Wave 2
- **Dependencias:** Phase 16 BYO AI Keys + cost tracking + Stripe Connect (post-MVP)
- **Plan tiers iniciales propuestos:**
  - Basic (gratis): Dashboard + CRM + Mini Market
  - Pro ($X/mes): + Demanda + Pricing IA + Reportes IA
  - Enterprise ($XX/mes): + Site Selection + Competidores + Cross-partnerships + Bulk drive sync
  - Add-ons sueltos: Studio video ($), API access ($)
- **Diferidos a Wave 3 cuando 20+ devs pagando:**
  - Usage analytics per feature flag (~4h): log cada vez que dev abre módulo gated → dashboard "Dev X usó Pricing IA 47 veces este mes" → data brutal para upsell argumentado
  - Self-serve trial activation (~3h): dev ve teaser → click "Probar 14 días gratis" → auto-enable + tracking → reduce ciclo de venta sin founder bottleneck
- **Descartados:** webhook Slack (overkill solo founder) · feature dependency graph (premature) · A/B testing % rollout (no consumer product) · revenue attribution dashboard (hasta Stripe live)
- **Nota:** NO confundir con feature dev approval (descartada B36) · este es nivel SUPERADMIN para gestión comercial DMX

### Feature flag toggle DISC asesor visibility
- **Origen:** B32 clarification founder
- **Destino:** Decisión post-launch UX
- **Qué:** B32 dejó DISC asesor como auto-declaración secundaria. Si después de feedback users el asesor DISC no aporta → deprecar via feature flag
- **Costo:** Cero (solo flag toggle)

---

### Compliance badge footer público "LFPDPPP Compliant · k-anon ≥5"
- **Origen**: W3.7 emergent potential improvement 2026-05-08
- **Destino**: **W3.9 Polish (Claude Code, ~30 min)** — absorbed sin sumar horas significativas
- **Qué**: badge visible en footer marketplace público + landing pages SEO `/zona/{slug}` con texto "LFPDPPP Compliant · k-anonymity ≥5 · Audited Trail" + link a `/methodology` y `/privacy/dsr`
- **Por qué**: brand authority + confianza B2B (bancos/aseguradoras lo ven en widget embebible) + diferenciación vs Inmuebles24/Lamudi que NO tienen compliance público
- **Costo**: ~30 min (1 component + mount en CtaFooter + Schema.org markup)

### Bulletins subscribe + RiskWatchlist público multi-zone (PRE-Wave 4)
- **Origen**: W3.3 + W3.4A + W3.4B emergent potential improvements 2026-05-08 (3 ideas unificadas)
- **Destino**: **W3.9 Polish (Claude Code, ~7-9h)** — meto YO antes de cierre Wave 3
- **Qué (3 features unificadas en 1 backend)**:
  1. Endpoint público `POST /api/watchlist/subscribe` body `{email, zone_ids:[], scope:"bulletins|risk_alerts|both"}`
  2. Schema `db.watchlist_subscribers`: `{email, zone_ids[], scope, active, created_at, last_email_sent_at}` con double opt-in
  3. **MethodologyPage** form capture (W3.3 deferred bulletins subscribe)
  4. **RiskScoreSubscribeWidget** marketplace single-zone (W3.4A deferred)
  5. **`<RiskWatchlist/>` público en `/inteligencia`** multi-zone paste list (W3.4B deferred)
  6. Cron post-risk_score_daily envía email Resend si cualquier zona del watchlist cambió letter negativamente (throttle 1/sem per email)
  7. Endpoint manage subscription (resubscribe/unsubscribe/edit zones)
- **Por qué keep ahora (no defer)**:
  - Cron `bulletins_monthly_generate` corre 1ro mes — sin subscribers, primer boletín no distribuye
  - Risk Score recién shipped (W3.4A+W3.4B) — capturar leads ANTES de Forbes/El Financiero foundation authority launch
  - Unificar 3 ideas en 1 backend evita duplicate work
  - Lead magnet orgánico tier-free → conversion path a Pro cuando piden alertas instantáneas
- **Costo**: ~9h total (1 endpoint + 1 schema + 3 frontend surfaces + 1 cron + double opt-in flow + manage subscription)
- **Ejecutor**: Claude Code en W3.9 polish (sin scope creep emergent)
- **Origen**: W3.3 + W3.4A emergent potential improvements 2026-05-08
- **Destino**: **W3.9 Polish (Claude Code, ~5h)** — meto YO antes de cierre Wave 3
- **Qué (combinado)**:
  1. Endpoint público `POST /api/bulletins/subscribe` + schema `db.bulletin_subscribers` (W3.3 deferred)
  2. Form capture en MethodologyPage + double opt-in Resend confirmation
  3. **`<RiskScoreSubscribeWidget/>`** en marketplace cuando user filtra por zona — captura email para alertas auto cuando zona favorita cae a Risk D-F (W3.4A connection)
  4. Cron post-risk_score_daily checks subscriber zones y dispara alerts via Resend (throttle 1/sem per subscriber)
- **Por qué keep ahora (no defer)**:
  - Cron `bulletins_monthly_generate` corre 1ro mes — sin subscribers list, primer boletín no distribuye
  - Risk Score recién shipped (W3.4A) — capturar subscribers ANTES de Forbes/El Financiero launch foundation authority
  - Combinar ambos en 1 batch evita scope dispersion
- **Costo**: ~5h total (3h bulletins subscribe + 2h Risk widget + alerts cron)
- **Ejecutor**: Claude Code en W3.9 polish (sin scope creep emergent)
- **Diferencia vs W4 #8 AutoNewsletter Pulse**: este es boletines mensuales + Risk alerts (Wave 3), AutoNewsletter Pulse es semanal segmentado 4 segments (Wave 4)

### Data Lake: R² trend sparkline 30 runs (model health monitoring)
- **Origen:** W2.7 Phase Z.0 emergent potential improvement 2026-05-07
- **Destino:** Wave 4 Polish — cuando ≥30 días validation data acumulada
- **Qué:** Sparkline mini junto a cada row de ValidationMetricsTable mostrando R² histórico últimos 30 runs. Convierte "snapshot status" en "model health monitoring" tipo MLflow/W&B.
- **Por qué:** ÚTIL pero requiere data acumulada. Hoy cron acaba de arrancar, no hay tendencia visible. Costo bajo (~30 líneas reuse patrón W2.3/W2.6).
- **Costo:** ~1h
- **Pre-requisito:** ≥30 días `db.model_validation_runs` ejecutados

## 🧠 ML Frontier Wave 4+ (review post-W3.4 cuando data madurada)

### Multi-Armed Bandits para A/B testing dinámico Amenities Validator
- **Origen**: análisis ML frontier 2026-05-08 (founder pregunta scikit-learn timing)
- **Destino**: extends Wave 4 #18 Amenities Validator (review post-W3.4 ship)
- **Qué**: convierte A/B testing static (50/50 split) a dynamic traffic optimization. Bandit redirige presupuesto Meta Ads a variante ganadora MIENTRAS corre el experimento. 3-5x más eficiente que Teseo static testing.
- **Tech**: librería `mab` Python o Thompson Sampling custom
- **Por qué defer**: depends on #18 ship + data baseline. Validar primero static A/B testing antes de añadir bandit complexity.
- **Costo**: +5-8h sobre #18 (20h)
- **Trigger reconsideration**: post-W3.4 ship cuando Transaction Network tenga ≥1000 transactions baseline

### Causal Inference (DoWhy/EconML) para diferenciar correlación vs causalidad
- **Origen**: análisis ML frontier 2026-05-08
- **Destino**: extends Phase Y.2 Construction Manager + W4 #18 Amenities Validator + ZZ.3 DRPI methodology
- **Qué**: hoy DMX dice "lavandería correlaciona con +0.4% apreciación". Causal inference dice "lavandería CAUSA +0.4% apreciación con 90% confianza". Diferenciador estadístico citable académicamente.
- **Tech**: `DoWhy` (Microsoft Research) + `EconML`
- **Por qué defer**: requiere domain expertise estadístico para interpretar correctamente. Validar primero correlation insights antes de causal claims (overpromising risk).
- **Costo**: +10-15h
- **Trigger reconsideration**: post-W3.3 DRPI ship + W4 #18 Amenities Validator data acumulada

### Property/Buyer Embeddings foundational ("GPT inmobiliario MX")
- **Origen**: análisis ML frontier 2026-05-08
- **Destino**: extends Phase D1 RAG (ya shipped) + Phase Y.2 sub-agents foundation
- **Qué**: pre-entrenar modelo (sentence-transformers fine-tuned) sobre TODA data DMX. Genera embeddings unified que capturan "esencia" propiedades + buyers. Multiplicador downstream: Smart Match dimensional + Comparables visual + Recommendation collaborative + Anomaly clustering.
- **Tech**: `sentence-transformers` + `pgvector`/`Pinecone` extension RAG existing
- **Por qué defer**: one-shot grande (~25-30h) que requiere data baseline madura. Mejor shipear Recommendation Engine W4.NEW collaborative filtering simple primero, validar valor, después invertir en embeddings foundational.
- **Costo**: +25-30h
- **Trigger reconsideration**: post-Recommendation Engine W4.NEW ship + ≥10K buyer interactions trackeadas

---

## DEFERRED — Wave 4 ML innovations (review post-Phase Y ship)

### Zone Score: dimensión Yield auto-calculada con datos Airbnb/STR
- **Origen**: W3.1A Phase 5 Foundation emergent potential improvement 2026-05-07
- **Destino**: H2 vertical STR si valida demanda · Wave 4 backlog post-PMF
- **Qué**: dimensión Yield del Zone Score hoy es `alquiler-promedio-zone / precio-mediano-zone × 100` con datos básicos. Mejorar con scraping Airbnb (tipo AirDNA) o AMPI API.
- **Razón defer**:
  - DMX foco residencial venta, no short-term rental principal
  - AirDNA cobra $$$ por data Airbnb
  - Scraping Airbnb legal-grey, mantenimiento alto
  - AMPI API descartado (founder confirmó no tiene data unique value)
  - Yield actual con base alquiler tradicional es suficiente para Score A-F
- **Reconsiderar**: si validamos demanda inversionistas STR vertical (Cancún, Vallarta, Tulum focus). H2 si.
- **Costo**: ~10-15h scraping pipeline + matching property-to-listing

### Founder Console: deep-link compartible anomalías
- **Origen:** W2.6 SA8 emergent potential improvement 2026-05-07
- **Destino:** Wave 4 / post-launch cuando founder tenga equipo (CTO/CFO/COO)
- **Qué:** URL `/superadmin?anom=anom_xxx` aterriza directo al row anomalía expandido con Claude reasoning pre-renderizado. Founder comparte en Slack/email al equipo.
- **Por qué:** UX cierre de loop "detect → investigate → assign". Hoy founder es solo, no aplica. Cuando hire CTO/CFO/team lead, esto reduce friction.
- **Costo:** ~1h (URL param + auto-scroll + auto-expand row matching anom_id)
- **Pre-requisito:** founder hire equipo

### Metrics Cube: prefetch períodos para switching instantáneo
- **Origen:** W2.5 SA6 emergent potential improvement 2026-05-07
- **Destino:** W2.6 SA8 Founder Console (consistente con experiencia ejecutiva snappy)
- **Qué:** Prefetch background de los 3 períodos no-activos (current/7d/30d/90d) en `useEffect` cuando carga la página. Switching de período instantáneo vs on-demand actual.
- **Por qué:** UX "Bloomberg Terminal" para founder — "¿cómo va Polanco?" en 2 clicks vs 5. Aplica el patrón a TODA SA8 founder console (no solo metrics cube).
- **Costo:** ~1h dentro de SA8 (no incremental)

### Bulk Ingest: histórico inline edits panel UI
- **Origen:** W1.5 ZZ.1.1 emergent potential improvement 2026-05-07
- **Destino:** W2.2 SA3 Audit Log Viewer (visualización trazabilidad)
- **Qué:** Panel colapsable en `ReviewQueueItem` mostrando `extracted_overrides[]` + `extraction_history[]` con timestamp + autor.
- **Por qué:** trazabilidad ya guardada en backend, pero UI explícita ayudaría founder a auditar antes de approve. NO crítico — `audit_log` cross-org cubre el caso. Encaja natural en SA3 que ya construye timeline genérico.
- **Costo:** ~1h dentro de SA3 (no incremental)

### System Health: mini-graph crons fallos por hora 24h
- **Origen:** W1.3 SA1.2 emergent potential improvement 2026-05-07
- **Destino:** W2.6 SA8 Founder Console (visualization analytics)
- **Qué:** Mini-graph en `/superadmin/health` mostrando crons fallos por hora últimas 24h (aggregations sobre `cron_heartbeats` con TTL). Permite detectar patrones (ej: cron falla solo 6am por carga).
- **Por qué:** útil para detección proactiva pero rompe scope Wave 1 (ops-foundation pura). Encaja en SA8 que ya tiene 14h asignadas para visualización ejecutiva.
- **Costo:** ~2h dentro de SA8 (no incremental)

### Tenants UI: AI gasto top-5 + Members growth sparkline
- **Origen:** W1.2 SA1.1 emergent potential improvement 2026-05-07
- **Destino:** W2.3 SA4 AI Cost Observatory (top-5 gasto) + W2.6 SA8 Founder Console (sparkline members + churn alerts)
- **Qué:** Widget agregado superior en `/superadmin/tenants` — top-5 gasto IA mes actual + sparkline histórico crecimiento members per tenant. Permite detectar churn antes de downgrade explícito.
- **Por qué:** anti-churn intelligence — útil pero rompe scope Wave 1 (ops-foundation pura). Encaja natural en SA4/SA8 que ya tienen 12h+14h asignadas para esto.
- **Costo:** ~2-3h dentro de SA4 + SA8 (no incremental)

---

## 🚫 DEFERRED — Teseo+AirDNA+cofounder ronda 2 (post-filtro objetivo 2026-05-07 PM)

### Pinterest/Instagram/TikTok scrapers (Demanda digital signals #19)
- **Origen**: ronda 2 análisis Teseo audio + cofounder
- **Razón defer**: Apify scrapers legal-grey (Pinterest/TikTok), mantenimiento alto (APIs cambian), hipótesis sin validar (¿pin Pinterest predice intent comprar depto $5M? probablemente correlación débil). Mejor validar hipótesis con experimento pequeño antes de invertir 10h.
- **Reconsiderar**: post-launch cuando tengamos data baseline para correlacionar pinterest/instagram trends vs conversion real

### ML clustering 6-12 micro-segments (#20)
- **Origen**: ronda 2 (audio Dania)
- **Razón defer**: depende de #19 + sub-agent Phase Y.2 ya hace clustering parcial. Sobreingeniería sin validar baseline.
- **Reconsiderar**: post Phase Y.2 ship cuando tengamos data sobre necesidad real

### DMX Explorer lead magnet público (#23)
- **Origen**: ronda 2 (Teseo regala "Explorador" en webinars)
- **Razón defer**: 5h en feature sin canal de distribución. Teseo lo regala en sus webinars cautivos. DMX no tiene canal webinar establecido. **Sin distribución, feature = waste**.
- **Reconsiderar**: cuando tengamos canal webinar/podcast/eventos establecido (post-launch, brand)

### Pre-pre-construction Lot Acquisition Simulator (D)
- **Origen**: ronda 2 inspirado Teseo Investment Validation
- **Razón defer**: 12h subestimado (real ~25h+). Producto separado nicho premium devs serios. Mejor H2 enterprise tier cuando tengamos credibility con devs grandes.
- **Reconsiderar**: H2 enterprise tier post-PMF con devs grandes

### Buyer educación contextual ("92% valoran Pet Park...") (G)
- **Origen**: ronda 2 cross-feature
- **Razón defer**: Riesgo percibido como "nag" por buyers. Validar en user-test ANTES de shipear. UX inversion sin certeza no vale 4h.
- **Reconsiderar**: post-launch con A/B test user research

### DMX White-Label enterprise (idea #4 ronda cofounder)
- **Origen**: cofounder.co inspiration
- **Razón defer**: founder cuestionó válidamente "si RE/MAX presenta como suyo, brand DMX desaparece + dependencia de 1-2 clientes enormes = riesgo brutal". Construir base directa primero (50-100 devs propios + asesores/inmobiliarias) antes de white-label.
- **Reconsiderar**: H2 cuando tengamos base directa construida + brand DMX establecido

### Regulación Score SEDUVI (AirDNA-inspired)
- **Origen**: ronda 2 análisis AirDNA Regulation Score
- **Razón defer**: data SEDUVI fragile (scraping mantenimiento alto), payoff incierto, ~8h estimado.
- **Reconsiderar**: H2 si verticals B2B (Z.4) lo demandan

### Slack/GitHub bots + browser extension (cofounder-inspired add-ons)
- **Origen**: ronda 2 análisis cofounder
- **Razón defer**: out of scope target asesor/dev/inmobiliaria MX (no son tech-savvy en estos canales). Mejor vehículos: WhatsApp + email + plataforma directa.
- **Reconsiderar**: nunca probablemente

---

### W3.8 partner objetivo H2: SOC Asesores (Sociedad Operadora de Crédito)
- **Origen**: founder analysis 2026-05-08 cross-sell partners realistas MX
- **Destino**: H2 cuando founder firme partnership
- **Qué**: SOC Asesores (https://socasesores.com/) — primera y mayor red asesores financieros MX 25 años. 30+ institutional partnerships (Banamex · Banorte · HSBC · Santander · Scotiabank · GBM · AXA · Zurich · etc.). Multi-producto: **hipotecas + seguros vida/médico/hogar/auto + créditos PYME + auto financing + inversiones GBM**.
- **Por qué SOC y NO Loanco**:
  - **SOC = bróker establecido** que recibe nuestros leads → cobra comisión banco → revenue share a DMX
  - **Loanco = SaaS para que TÚ seas bróker** ($999-2999/mes suscripción) → modelo inverso, NO encaja DMX
- **Beneficio crítico**: 1 sola partnership SOC cubre **4 de 5 categorías cross-sell** W3.8 (hipoteca + seguros + auto + inversiones). Founder no necesita firmar 5 partnerships separados.
- **Bandera amarilla**: NO tienen API B2B documentada · integración H2 requiere custom integration negociada (sandbox webhook + branded landing pages co-marketing).
- **Activación H2**:
  1. Founder negocia + firma con SOC
  2. Superadmin: cambia `partner.status = "pending_partnership"` → `"active"`
  3. Update label "Bróker Hipotecario [Pending]" → "SOC Asesores"
  4. Configurar webhook receiver con SOC API custom
  5. SOC paga DMX revenue share por cada deal cerrado attribution-tracked
- **Otros canales separados** (notarías + avalúos + mudanzas): partnerships individuales founder firma post-SOC
- **Loanco DESCARTADO**: modelo inverso (SaaS para crear brókers, no para integrar con bróker existente)

---

## 💼 H2 COMMERCIAL (Teseo expansion ronda 1 · sin código H1)

### #5 DMX Insights consultoría premium
- **Origen:** Teseo Data analysis 2026-05-07 (servicios consulting $150-300K MXN/project)
- **Destino:** H2 commercialization tier
- **Qué:** Tier premium $X/mes con analyst dedicado interpreta cubo Z + entrega report custom mensual al dev/inmobiliaria. Comercial, no técnico.
- **Por qué:** Teseo cobra $150-300K MXN per project consulting. DMX puede ofrecerlo recurring + cubo data-backed.
- **Costo H1:** 0h código (comercial)
- **Pre-requisito:** Wave 3 cubo Z + DRPI live para que el analyst tenga data structured

### #9 DMX Expansion Advisor (PDF report $5K USD)
- **Origen:** Teseo Expansion Analysis ($150-300K MXN, 397% ROI Cayco case)
- **Destino:** H2 enterprise tier (post-PMF)
- **Qué:** Dev paga $5K USD/report por análisis profundo de UNA zona específica. Output: PDF 30 páginas con scenarios + competitive analysis + demand forecast 12 meses generado con cubo Z + IE Engine + Claude Sonnet.
- **Por qué:** Teseo charges $150K-300K MXN/project ($7-15K USD). DMX a $5K USD/report es 50-70% más barato Y data-backed real-time vs static econometric.
- **Costo H1:** 0h (defer post-PMF)
- **Pre-requisito:** Wave 3 cubo Z completado + plantilla PDF + integración Stripe one-time billing

### #10 DMX Capex Validator pre-construcción
- **Origen:** Teseo Investment Validation (60.7% ROI Huauchinango)
- **Destino:** H2 advanced features tier enterprise
- **Qué:** Validador de proyectos antes de comprometer capital del dev. Input: 3 sitios alternativos (ubicación, m², mix unidades, precio target). Output: viabilidad financiera con confidence interval + Monte Carlo scenarios + ranking. Use case: dev considera 3 sitios alternativos → sube los 3, sistema rankea.
- **Por qué:** valor enorme para dev pre-CAPEX, requiere clientes establecidos + cubo Z maduro para inputs reliable
- **Costo H1:** 0h (defer post-Wave 3)
- **Pre-requisito:** Wave 3 cubo Z + Risk Score #12 + Construction Cost Predictor #13 + Phase Y agentic

### #15 Co-creation enterprise tier (solutions architect)
- **Origen:** Teseo Co-creation value proposition
- **Destino:** H2 enterprise services
- **Qué:** Para enterprise tier, asesor solutions architect dedicado trabaja con dev cliente para crear modelo custom (e.g. cubo segmentado solo a su portfolio + métricas custom + dashboard tailored).
- **Por qué:** ARR multiplier — enterprise tier $2-5K USD/mes vs basic $499/mes. Comercial, no técnico.
- **Costo H1:** 0h código (solo comercial)

### #16 Partnerships institucionales (catastro · notarías · bancos)
- **Origen:** Teseo es VP Analytics CANACINTRA + AMCI alliance + AMPI Riviera
- **Destino:** H2 strategic — founder negociaciones
- **Qué:** Buscar partnerships con valor data REAL (no AMPI):
  - **Catastro alcaldía piloto** (Miguel Hidalgo Polanco): avalúos oficiales por predio
  - **Notaría grande CDMX**: closings reales para ZZ.2 Transaction Network
  - **Banco/SOFOM piloto**: cartera hipotecaria con avalúos validados (golden data AVM)
  - **CMIC**: proyectos en cartera nacional + capex sector
  - **CANADEVI**: producción nacional vivienda
- **Por qué:** Founder confirmó 2026-05-07 que AMPI NO tiene data unique value. Estas alternativas SÍ tienen datos exclusivos.
- **NO perseguir:** AMPI partnership institucional (percepción sin data)
- **Costo H1:** 0h código (estratégico/comercial)

---

## ❌ DESCARTADOS (referencia histórica · post-challenge founder 2026-05-07)

### Construction Pipeline Tracker
- **Origen:** propuesta game-changer Phase ZZ original
- **Razón descarte:** oversold ~5-10x. Government data MX fragmentada (RUV federal, SEDUVI CDMX, 32 estados sin API unificado). Real implementation ~100h+ partnerships Tinsa/Softec.
- **Reconsiderar:** Y2 con presupuesto data acquisition + partnerships institucionales firmados

### Government API integration (RUV/SEDUVI/INFONAVIT bulk)
- **Origen:** propuesta acceso datos government
- **Razón descarte:** no existe API unificada MX. RUV federal vs SEDUVI CDMX vs 32 estados separados. Solo viable post-partnerships institucionales.
- **Reconsiderar:** post-Index Provider DRPI launch cuando DMX tenga leverage para negociar acceso institucional

### Press Kit Generator
- **Origen:** propuesta marketing automation
- **Razón descarte:** sales-problem-disguised-as-product. Founder PR puede usar Canva/manual hasta validar product-market fit.
- **Reconsiderar:** post-Wave 4 si volumen PR justifica automatización

### Webhook to Slack on feature flag toggle (SA5.0)
- **Origen:** SA5.0 design discussion 2026-05-07
- **Razón descarte:** overkill para founder solo. Notificaciones email bastan.
- **Reconsiderar:** cuando equipo founder >3 personas

### Feature dependency graph (SA5.0)
- **Origen:** SA5.0 design discussion 2026-05-07
- **Razón descarte:** premature. Con 5-10 features iniciales no hay dependencies complejas.
- **Reconsiderar:** Wave 4+ cuando feature catalog >20

### A/B testing % rollout per feature flag (SA5.0)
- **Origen:** SA5.0 design discussion 2026-05-07
- **Razón descarte:** DMX no es consumer product que justifique A/B masivo. B2B SaaS no necesita esto.
- **Reconsiderar:** nunca a menos que se construya consumer marketplace puro

### Revenue attribution dashboard per feature flag (SA5.0)
- **Origen:** SA5.0 design discussion 2026-05-07
- **Razón descarte:** prematuro hasta tener Stripe live + 20+ devs pagando. Sin data real no aporta.
- **Reconsiderar:** Wave 3 post-Stripe activation cuando MRR per feature sea calculable

---

## 📥 W4.3 — Phase Y.0 Foundation enhancements diferidos (2026-05-09)

### W4.3.1 · Superadmin Widget Embed Tracker (P1)
- **Origen:** emergent next action items W4.3
- **Destino propuesto:** sub-chunk dentro de W4.8 Phase Y.5 (Observability) o standalone post-Y.5
- **Razón diferir:** dashboard de dominios externos que embeden widgets `/widgets/score|risk` · útil pero no crítico para Phase Y agentic core
- **Costo estimado:** 4h

### W4.2.5.2 · CLI dry-run lead nurture (P2)
- **Origen:** emergent next action items W4.3
- **Destino propuesto:** F0 sweep tech debt
- **Razón diferir:** `python -m lead_nurture_engine --dry-run` para QA pre-deploy · DX improvement, no blocker
- **Costo estimado:** 1h

### Integrar `get_phase_y_settings()` en features agentic existentes
- **Origen:** emergent next action items W4.3
- **Destino propuesto:** **integrar en cada batch Y.1-Y.5 al construirlo** (no diferir, hacerlo inline)
- **Razón:** master switch + simulation mode + tier gating debe respetarse desde Y.1A en adelante · features previas (W4.1A Diagnostic, W4.1C Recommendations, W4.2D3.5 Lead Nurture) se actualizan en F0 sweep
- **Costo estimado:** 2h F0 sweep + 0h en Y.1-Y.5 (ya en scope cada chunk)

### Phase 7.10 — Avance-Obra público
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** Phase 7 ext (no en Wave 4 actual)
- **Razón diferir:** feature standalone, no agentic · merece su propio scoping post-Wave 4
- **Costo estimado:** 12-16h TBD

### WhatsApp Business real (vs stub actual)
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** **W4.10 Phase 8 ext** (ya está en plan)
- **Razón:** YA está scoped en W4.10, no es enhancement nuevo · marcar como dependencia
- **Costo:** incluido en W4.10 (25h)

### Multi-subscriber digest (Watchlist)
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** F0 sweep o sub-chunk W4.10
- **Razón diferir:** extensión Watchlist (W3.9b shipped) · enviar 1 email con N propiedades vs N emails con 1
- **Costo estimado:** 3h

### Microsoft OAuth (login)
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** post-launch H2
- **Razón diferir:** Google OAuth + email/password ya cubre 99% mercado MX · Microsoft solo requerido para enterprise grandes (Dubai H2 puede)
- **Costo estimado:** 4h

### AMPI API real (vs comparables manuales)
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** **bloqueado** hasta firmar acuerdo AMPI
- **Razón:** AMPI no tiene API pública · requiere relación comercial · Founder está en conversaciones
- **Costo estimado:** TBD post-acuerdo

### Refactoring `routes_*.py` → `/app/backend/routes/`
- **Origen:** emergent backlog W4.3
- **Destino propuesto:** F0 sweep tech debt rolling
- **Razón diferir:** organizational, no funcional · 30+ archivos `routes_*.py` actualmente flat en backend/ · merece refactor coordinado
- **Costo estimado:** 4h F0

### Mini-dashboard "Sesiones activas HOY" en Founder Console
- **Origen:** emergent sugerencia W4.3
- **Destino propuesto:** W4.8 Phase Y.5 Observability
- **Razón diferir:** real-time behavioral data ya existe (W4.3) · widget visual sirve a pitch inversionistas pero no crítico para agentic
- **Costo estimado:** 3h

---

## 📥 W4.4C — Phase Y.1C MCP Exposure enhancements diferidos (2026-05-09)

### Playwright runner pierde session/cookies en rutas Superadmin profundas (BLOCKED)
- **Origen:** emergent QA W4.4C
- **Destino propuesto:** F0 sweep tech debt + investigación dedicada
- **Razón diferir:** bug de Playwright auth handling · NO bloquea features para usuarios reales · solo afecta automation testing
- **Costo estimado:** 4-6h (root cause + fix)

### bulk-upload-btn no renderiza en DOM (DEFERRED P2)
- **Origen:** emergent QA W4.4C
- **Destino propuesto:** F0 sweep
- **Razón diferir:** bug pequeño · usuarios pueden seguir flujo alternativo · scope < 1h fix
- **Costo estimado:** 1h

### Blog post "Conecta tu Claude Desktop al Director AI de DMX" (lead magnet MCP)
- **Origen:** emergent sugerencia W4.4C
- **Destino propuesto:** Marketing content (no Wave 4 batch · founder/agencia)
- **Razón diferir:** contenido marketing, NO código · founder o agencia content lo escribe · cero esfuerzo dev
- **Costo:** content team

---

## 📥 W4.4D — Phase Y.1D What-if Simulator enhancements diferidos (2026-05-09)

### Tier `whatif_simulator` explícito en phase_y_settings.feature_tiers
- **Origen:** emergent edge case W4.4D
- **Destino propuesto:** **F0 sweep tech debt** o sub-chunk dentro de W4.4F resilience
- **Razón diferir:** emergent fallback temporal a tier `diagnostic_engine` funciona · agregar tier propio + UI superadmin permite gating granular
- **Costo estimado:** 2h (schema seed + UI superadmin PhaseYControlsPanel update)

### Director chat single-session enforcement bloquea Playwright workaround
- **Origen:** emergent W4.4D edge case
- **Destino propuesto:** F0 sweep + Playwright auth enhancement (combinar con W4.4C blocked)
- **Razón diferir:** workaround `page.request.post` antes de navegar funciona · root cause = single-session enforcement a nivel auth · no bloquea producción
- **Costo estimado:** ya capturado en W4.4C "Playwright runner pierde session" (mismo root cause)

---

## 📥 W4.4E — Phase Y.1E `/asistente` enhancements diferidos (2026-05-09)

### Routing inteligente lead → desarrolladora según intent/zona detectada
- **Origen:** emergent W4.4E P2
- **Destino propuesto:** **W4.4E.5 Unification** (incorporar al refactor) o W4.6 Phase Y.3 Smart Routing Lead
- **Razón diferir:** hoy todos los leads van a `dev_org_id="dmx"` default · routing por intent (zona/presupuesto/tipología) requiere reglas + tabla de mapping dev↔zonas · sinérgico con W4.6 Smart Routing
- **Costo estimado:** 3-4h (incluido en scope W4.6)

### Resume sesión expirada con auto-reset en UI
- **Origen:** emergent W4.4E P2
- **Destino propuesto:** F0 sweep
- **Razón diferir:** hoy localStorage trae session expirada → muestra error inline pero NO hace reset · UX degradada pero no rompe · 1h fix
- **Costo estimado:** 1h

### Tier `asistente_publico` explícito en feature_tiers (UI superadmin)
- **Origen:** emergent edge case W4.4E (igual patrón que W4.4D `whatif_simulator`)
- **Destino propuesto:** **F0 sweep** (combinar con tier `whatif_simulator` faltante de W4.4D · ambos requieren mismo seed update)
- **Razón diferir:** fallback temporal a `diagnostic_engine` funciona · agregar tiers propios + UI superadmin permite gating granular
- **Costo estimado:** 3h (combinado con W4.4D tier seed: ambos en una pasada)

### Sitemap.xml regression .com → .io
- **Origen:** Claude Code catch durante merge W4.4E (founder rule canonical desarrollosmx.io)
- **Destino propuesto:** ✅ **YA FIXED** durante merge (línea privacy/dsr era único .com restante)
- **Estado:** RESOLVED en commit `4cb7674`

---

## 📥 W4.4E.5 — Caya/Asistente Unification edge cases reviewed (2026-05-09)

### 🔴 SECURITY GAP · Rate limit en `get_or_create_from_legacy` (priority alta)
- **Origen:** review edge case W4.4E.5 (Claude Code catch)
- **Razón:** `get_or_create_from_legacy()` skip rate limit "para mapeo idempotente". Pero ATTACKER puede generar 10000 session_ids inventados con prefix `dmx_caya_xxx` y crear 10000 sessions sin límite (DoS amplificado por LLM cost).
- **Destino propuesto:** **W4.4E.5.1 fix-pass (1h)** — aplicar mismo rate limit (5 sessions/hora/ip) al método legacy mapping con allowlist solo a session_ids con prefix `dmx_caya_` previamente persistido en collection `caya_sessions`.
- **Costo estimado:** 1h (security fix)

### 🟡 Lead capture mini-form en CayaBubble (parity con AsistentePage)
- **Origen:** review post W4.4E.5 (Claude Code catch upgrade)
- **Razón:** AsistentePage tiene LeadCaptureCard inline cuando suggested_lead_capture=True. CayaBubble NO lo tiene · solo muestra hand_off banner. Resultado: comprador en bubble debe expandir a /asistente para capturar — fricción innecesaria.
- **Destino propuesto:** **W4.4E.5.1 fix-pass (1h, junto al rate limit)** — agregar mini-form embebido en CayaBubble cuando hand_off_recommended=True (nombre + WhatsApp · misma persistencia source=caya_bubble)
- **Costo estimado:** 1h

### 🟢 Director RAG public adapter para popular memory_hits real en Caya
- **Origen:** emergent W4.4E.5 P2 (memory_hits=[] hardcoded)
- **Razón:** `MemoryHitsBlock` UI listo en CayaBubble + AsistentePage pero memory_hits siempre vacío · adapter público (read-only sobre director_memory_index filtrado por source_type IN [zone, market_pulse, public_diagnostic]) habilitaría respuestas con citas memoria
- **Destino propuesto:** W4.5 Phase Y.2 (sub-agents) o batch standalone post-Y.2
- **Razón diferir:** Caya ya tiene RAG citations vía `rag_engine.semantic_search` (otra fuente) · memory_hits reales son nice-to-have · valor incremental modesto vs costo
- **Costo estimado:** 4-5h

### 🟢 Routing inteligente lead → desarrolladora según intent/zona detectada
- **Origen:** emergent W4.4E P2 (ya en backlog) + W4.4E.5 reaffirmado
- **Razón:** todos los leads van a `dev_org_id="dmx"` default · routing por intent (zona/presupuesto/tipología) requiere reglas + tabla de mapping dev↔zonas
- **Destino propuesto:** **W4.6 Phase Y.3 Smart Routing Lead** (ya en plan)
- **Costo estimado:** incluido en W4.6 (3-4h dentro de 36h)

---

## 📥 W4.5 Y.2A — Pricing Sub-Agent enhancements diferidos (2026-05-09)

### ROI Panel Pricing en TenantDrawer (suma MXN recuperables aplicadas vs rechazadas)
- **Origen:** emergent enhancement W4.5 Y.2A
- **Destino propuesto:** post-Y.2 cierre (cuando haya recomendaciones aplicadas reales en producción)
- **Razón diferir:** valor pitch metric, pero NO crítico · necesita data acumulada (≥30 días con recomendaciones aplicadas) para ser relevante · prematuro hoy
- **Costo estimado:** 3-4h

### LLM-generated thread titles vs truncate 60 chars (W4.11a)
- **Origen:** emergent W4.11a edge case (no implementado, fallback a truncate)
- **Destino propuesto:** F0 sweep cuando UX pain real
- **Razón diferir:** truncate funciona, costo LLM extra ($0.60/mes 1k threads) marginal pero NO crítico · 1h fix-pass futuro
- **Costo estimado:** 1h

---

## 📥 W4.5 Y.2B-C — Sub-Agents enhancements diferidos (2026-05-09)

### Digest semanal automático top-3 recomendaciones Pricing+Marketing+Lead vía Resend
- **Origen:** emergent enhancement W4.5 Y.2B (re-pegado en summary Y.2C)
- **Destino propuesto:** **absorber dentro de W4.10 Phase 8 ext AutoNewsletter Pulse semanal** (ya en plan, 25h)
- **Razón diferir + absorber:** W4.10 ya construye Pulse semanal segmentado por rol (dev/asesor/buyer/inversionista). El digest sub-agents = sub-feature del Pulse al rol "dev" (sección "Tus recomendaciones top 3 esta semana"). Crear batch separado = email duplicado compitiendo por inbox. Mejor: una sola comunicación semanal personalizada.
- **Nota implementación W4.10:** asegurar que prompt incluya integración con sub-agents (Pricing/Marketing/Lead/Construction/Compliance) para alimentar la sección personalizada del Pulse del dev
- **Costo absorbido:** 0h adicional (incluido en 25h W4.10)

---

## 📦 H2 — Sub-Agents diferidos (decisión 2026-05-09)

### Y.2D Construction Sub-Agent (DEFERRED H2)
- **Razón diferir:** sin data madura H1 · cronogramas obra + costos updates no estructurados en DMX hoy · 80% sería layer-3-heuristic (ruido) sin valor real
- **Pre-requisitos para activar H2:** Phase 7.10 Avance-Obra shipped (timeline obra estructurado) + extensión Construction Cost Predictor con updates dev manuales
- **Costo estimado H2:** 6h cuando data esté lista
- **Caso uso real (cuando data madura):** detectar atrasos cronograma vs plan + alertar costos desviados >15% del benchmark zona + flag obras sin updates >X semanas

### Y.2E Compliance Sub-Agent (DEFERRED H2)
- **Razón diferir:** sin data madura H1 · depende de W4.18 SIGCDMX/Catastro (no shipped) + contratos no en DMX · LFPDPPP ya cubierto por W3.7 anonymization · Caso uso disclosures requiere NLP sobre copy
- **Pre-requisitos para activar H2:** W4.18 Data Sources gov MX shipped (SIGCDMX uso suelo + Catastro CDMX) + módulo contratos en DMX (no en plan H1)
- **Costo estimado H2:** 6h cuando data esté lista
- **Caso uso real (cuando data madura):** validar permiso uso suelo proyecto vs SIGCDMX + flag avalúos catastrales vs precio listado (red flags lavado dinero) + NLP disclosures marketing copy

---

## 📥 W4.18.1 — Apify Trends enhancements diferidos (2026-05-09)

### 🔴 DECISION FOUNDER · Apify plan FREE bloqueado por Google Trends
- **Origen:** emergent W4.18.1 reporta `TIMED-OUT 240s` en plan FREE (sin proxies residenciales)
- **Status:** arquitectura completa shipped + degradación graceful funciona · captura REAL no funciona en FREE
- **Decisión pendiente founder:**
  - **A. Upgrade Apify STARTER $49/mo** (recomendado) → cero cambio código
  - **B. Switch env var a `data_xplorer/google-trends-fast-scraper`** → actor alternativo · pricing diferente
  - **C. Mantener FREE** → feature shipped pero data simulada · ahorro $588/año vs perder valor downstream W5
- **Impacto downstream:** W5.5 Live Pulse + W5.9 Climate Migration + W5.4 Buyer Score dependen de trends reales para alimentación

### 🟡 Alertas Atlax keyword +30% WoW (cron 4 líneas)
- **Origen:** emergent enhancement W4.18.1
- **Razón absorber:** quick win 15-30 min · habilita inteligencia demanda en vivo para asesores · "Polanco subió +45% intent esta semana"
- **Destino propuesto:** **F0 sweep tech debt H1** (cero horas adicionales)
- **Costo estimado:** 0.5h F0

---

## 📥 W4.6 Y.3B — Visit Prep enhancements diferidos (2026-05-10)

### Coexistencia VisitAutoPrepCard (Phase 4 Batch 33 legacy) + VisitPrepDossier (Y.3B nuevo)
- **Origen:** emergent edge case W4.6 Y.3B (decisión consciente)
- **Status actual:** ambos cards visibles simultáneamente en AsesorTareas → posible UX clutter
- **Razón decisión:** legacy intacto · paths distintos · NO es shadow ni duplicate
- **Destino propuesto:** F0 sweep tech debt — decidir si reemplazar legacy con Y.3B o mantener ambos con diferenciación clara
- **Costo estimado:** 2h F0 (UI consolidation + posible deprecation B33)

---

## 📥 W4.18 — Data Sources gov MX gaps post-deployment (2026-05-10)

### 🟡 OPS · GDAL system deps en Dockerfile producción (geopandas/fiona/pyrosm/gtfs-kit)
- **Origen:** emergent W4.18 reporta heavy libraries no instaladas en sandbox preview Kubernetes
- **Razón:** GDAL es system dependency que romperíá entorno emergent · decisión conservadora correcta
- **Solución producción:** agregar al Dockerfile backend cuando deploys (Render/AWS/Vercel):
  ```
  RUN apt-get update && apt-get install -y libgdal-dev gdal-bin python3-fiona && pip install geopandas pyrosm gtfs-kit
  ```
- **Costo estimado:** 1h founder (Dockerfile edit + redeploy)

### 🟡 OPS · Acceso datos.cdmx.gob.mx (CKAN host) en sandbox
- **Origen:** emergent W4.18 reporta timeouts curl/httpx desde sandbox preview
- **Razón:** sandbox preview tiene IP whitelist o firewall · NO es bug · es ambiente
- **Solución:** auto-resuelve cuando deploys a producción (Render/Vercel/AWS tienen IPs públicas estándar) · NO requiere acción inmediata
- **Validación post-deploy:** correr `POST /api/superadmin/data-sources-gov-mx/sync_now/{source}` para Atlas/Catastro/GTFS · cache se popula

### 🟢 GTFS afluencia diaria · feed específico CKAN identificar
- **Origen:** emergent W4.18 reporta cron 06:30 placeholder
- **Razón:** GTFS estático shipped · afluencia diaria por estación queda pendiente endpoint específico
- **Solución:** post-deploy validar acceso · buscar dataset "afluencia metro/metrobús" en datos.cdmx.gob.mx · agregar URL al engine
- **Costo estimado:** 2h F0 cuando datos.cdmx accesible

### 🟢 OSM diff-parse semanal (upgrade de Overpass query a PBF download)
- **Origen:** emergent W4.18 implementación lightweight con Overpass
- **Razón:** Overpass funciona OK para CDMX subset · PBF requiere pyrosm/osmium (heavy libs)
- **Solución:** post-deploy con pyrosm instalado · upgrade engine a PBF diff (más eficiente para escala)
- **Costo estimado:** 3h F0 después de Dockerfile prod ready

---

## 📥 W4.10 — WhatsApp + Newsletter + Voice enhancements diferidos (2026-05-10)

### 🟡 OPS · ElevenLabs upgrade desde Free Tier
- **Origen:** emergent W4.10 reporta 401 "unusual activity" desde IP Kubernetes sandbox
- **Razón:** Free tier ElevenLabs bloquea IPs cloud · upgrade $5-22/mo Starter resuelve · cero cambio código
- **Solución producción:** founder upgrade plan elevenlabs.io · ENV var ya configurada
- **Costo estimado:** $22/mo Creator tier o $99/mo Pro a escala · vs $0 free tier

### 🟢 OPS · WhatsApp Twilio sandbox → producción real
- **Origen:** emergent W4.10 nota webhook funcional con sandbox Twilio
- **Razón:** sandbox Twilio FREE OK para H1 testing · producción requiere número real verificado WhatsApp Business
- **Solución:** post-launch cuando founder firme cuenta WhatsApp Business o Twilio production · cambio ENV var · cero código
- **Costo estimado:** $0.005/mensaje saliente Twilio · ~$25/mes a 1000 users 5 msgs/mo

---

## ✅ INCORPORADOS (referencia histórica)

Enhancements que SÍ se persistieron correctamente:

- B14 Sankey atribución diferido B14 → B20 ✅ shipped en B20
- B16 PostHog conversion funnel diferido B16 → B20 ✅ shipped en B20
- B23 Cmd+J shortcut (Cmd+/ ya tomado) → resolved en B23
- B25 Image embeddings pipeline + toggle → shipped en B25 Sub-C
- B27 Share-link comparador og:image → shipped en B27 Sub-C
- B28 Smart Match score → shipped en B30
- B29 Sparklines reales toggle → shipped en B30 Sub-B
- B33 "Tu día hoy" feed dashboard → shipped en B34 Sub-B
- B34 Lead-to-Asesor Smart Match → shipped en B34 Sub-A
