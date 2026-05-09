# DMX Enhancements Backlog

Tracking de enhancements diferidos surgidos durante batches B14-B35. Cada item tiene origen (batch where suggested), destino propuesto (phase/batch where to ship), justificación, y costo estimado.

**Regla:** TODO enhancement que founder apruebe diferir DEBE persistirse aquí inmediatamente. No basta con decir "lo metemos en BXX" — sin entry aquí, se pierde.

---

## 🟡 ALTA PRIORIDAD (1-3 batches futuros)

### `include_unit: bool` en `/api/superadmin/scores/recompute-all`
- **Origen:** W3.1B-5 (emergent suggested 2026-05-08)
- **Destino:** W3.9 Polish
- **Qué:** extender `RecomputeAllRequest` con flag `include_unit` (default True) para que el panel Superadmin pueda re-recomputar las 496 unidades on-demand sin esperar al cron 02:00.
- **Por qué:** post-cambios a recipes UNIT, ops puede forzar refresh sin reiniciar backend. Fundación cron unit-aware ya está lista.
- **Costo:** ~15 min

### Auto-scope routing para `unit` en `compute_many`
- **Origen:** W3.1B-3 (emergent reported 2026-05-08)
- **Destino:** W3.1B-4 (junto a 4 recipes UNIT restantes + frontend score card)
- **Qué:** `compute_many` actualmente solo distingue colonia/proyecto en su auto-scope detection. Con 4 IE_UNIT_* nuevos, agregar branch que detecte zone_id formato unit (`{dev_id}-{NN}{prototype}`) y route al scope unit.
- **Por qué:** sin esto, frontend tiene que hardcodear scope por endpoint. Bloquea expone público de unit scores.
- **Costo:** ~30 min

### Endpoint público `/api/scores/unit/{unit_id}`
- **Origen:** W3.1B-3
- **Destino:** W3.1B-4
- **Qué:** GET endpoint que retorna scores de un unit (los 4 IE_UNIT_* + cualquier futuro). Reusa compute_many con auto-scope.
- **Por qué:** comprador necesita ver score de unidad específica en flujo de búsqueda.
- **Costo:** ~30 min

### Seed density ≥3 devs/colonia para activar R3/R4/R5 IE_PROY_*
- **Origen:** W3.1B-2 (data density limitation reported)
- **Destino:** W3.9 Polish o seed expansion batch separado
- **Qué:** Expandir `data_developments.DEVELOPMENTS_RAW` de 18 → ~30-40 devs distribuidos para que polanco/condesa/roma-norte/lomas/del-valle tengan ≥3 devs cada una. Activa automático IE_PROY_RECENCY_LAUNCH, IE_PROY_TIPO_FIT_COLONIA, IE_PROY_INVENTORY_DEPTH_RELATIVE.
- **Por qué:** sin esto, 3 de los 6 nuevos recipes W3.1B-1 emiten stub permanente en demos.
- **Costo:** ~1.5h (research + redacción seed data realista)

### IE_UNIT_M2_VALUE — score precio justo por unidad
- **Origen:** W3.1B-3 (emergent suggested 2026-05-08)
- **Destino:** W3.1B-4
- **Qué:** Recipe `IE_UNIT_M2_VALUE` lower_better usando `unit.price / unit.m2_privative` vs avg(dev_peers). Sin nuevo feed.
- **Por qué:** comprador ve "score precio justo" instantáneo en UI detalle. Complementa PRECIO_VS_PROTOTYPE.
- **Costo:** ~20 min

### IE_UNIT_PRECIO_VS_PROTOTYPE formula tweak (saturación)
- **Origen:** W3.1B-3 edge case observation
- **Destino:** W3.9 polish
- **Qué:** la fórmula actual `100 - (ratio-1)*100` clamped 0-100 satura en 100 cuando ratio<1 (units baratos). Considerar usar percentile-based scoring en su lugar para preservar señal entre units accesibles.
- **Por qué:** hoy el 100% de las primeras unidades de cada prototype dan 100, perdiendo discriminación entre las "muy baratas" y las "razonablemente baratas".
- **Costo:** ~30 min

### `/api/admin/score/recipes` expone metadata de los 18 IE_PROY_*
- **Origen:** W3.1B-1 (emergent suggested 2026-05-08)
- **Destino:** W3.9 Polish ó W3.1B-3 (cuando se cablee frontend IeEngineScoreCard)
- **Qué:** Endpoint GET admin que liste `[{code, tier_logic, description, scope, version}]` de todos los recipes del REGISTRY filtrable por scope. Permite que SuperadminTenants/diagnostics liste los 18 PROYECTO sin hardcoding.
- **Por qué:** facilita debugging IE Engine en demos + base para futuro UI de inspección de recipes. Sin esto, frontend tiene que hardcodear la lista.
- **Costo:** ~30 min

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
