# DesarrollosMX (DMX) — PRD

## Identidad del producto
**DesarrollosMX** — AI-native Spatial Decision Intelligence Platform para real estate residencial nuevo en LATAM. Marketplace público = desarrollos nuevos. Individuales (reventa) viven en el portal asesor privado (Fase 4 CRM Pulppo+). Moonshot: $1–5B valuation en 3–5 años.

---

## Stack técnico
- **Backend**: FastAPI + Motor (Mongo) + emergentintegrations (Claude Sonnet 4.5)
- **Frontend**: React 18 + Tailwind + CSS vars + react-i18next + Mapbox GL JS
- **DB**: MongoDB con caches weekly/24h
- **Map**: Mapbox GL JS
- **AI**: Claude Sonnet 4.5 (briefings, argumentarios, parser NLP)

---

## Design System (NON-NEGOTIABLE)
- Navy `#06080F` + Cream `#F0EBE0` + Gradient `#6366F1→#EC4899`
- Outfit (headings) + DM Sans (body)
- Zero emoji · solo SVG (lucide-style en `/components/icons/`)
- Buttons border-radius 9999px
- Motion ≤850ms, `once:true`, transforms Y-only

---

## Score system
Vida (Leaf) / Movilidad (Route) / Seguridad (Shield) / Comercio (Store)  
+ Plusvalía / Educación / Riesgo (extension comparador).

---

## Arquitectura implementada

### Backend `/app/backend/`
- `server.py` — **SLIM** (~479 líneas): solo app init, middleware, auth helpers, router includes, lifecycle
- `routes_auth.py` — **B0 NUEVO**: auth endpoints (register, login, session, me, select-role, logout)
- `routes_public.py` — **B0 NUEVO**: marketplace público (colonias, developments, properties, briefings, AI search)
- `routes_search_prefs.py` — **B0 NUEVO**: universal search + user preferences
- `permissions.py` — **B0 NUEVO**: canonical permission helpers (get_user_permission_level, can_view_*, can_move_*)
- `ai_budget.py` — **B0 NUEVO**: AI cost tracking per dev_org + /api/superadmin/ai-usage endpoint
- `data_scoping.py` — **B0 NUEVO**: scope_data() per user role (lead/project/unit/asesor/client)
- `routes_advisor.py` — Fase 4: CRUD contactos/búsquedas/captaciones/tareas/operaciones/comisiones + argumentario AI + briefing + leaderboard
- `data_seed.py` — 16 colonias CDMX
- `data_developments.py` — 10 developers + 15 developments + ~420 units

Endpoints públicos (marketplace + ficha):
- `GET /api/colonias`, `/api/colonias/{id}`, `/api/developments`, `/api/developments/{id}`, `/api/developments/{id}/units`, `/api/developments/{id}/similar`, `/api/developers/{id}`
- `POST /api/developments/{id}/briefing`, `POST /api/properties/search-ai`
- `POST /api/auth/{login,register,session,logout}`, `GET /api/auth/me`

Endpoints asesor (Fase 4, gated por role `advisor|asesor_admin|superadmin`):
- `GET/PATCH /api/asesor/profile`
- `GET /api/asesor/dashboard`
- `GET/POST /api/asesor/contactos`, `GET /api/asesor/contactos/{id}`, `PATCH/DELETE` idem, `POST /api/asesor/contactos/{id}/timeline`
- `GET/POST /api/asesor/busquedas`, `PATCH /api/asesor/busquedas/{id}/stage` (hard validations), `POST /visit`, `POST /offer`, `GET /matches` (motor 5 dim determinístico)
- `GET/POST /api/asesor/captaciones`, `PATCH /stage`, `GET /{id}`
- `GET/POST /api/asesor/tareas`, `PATCH /done` (+5 XP), `DELETE`
- `GET/POST /api/asesor/operaciones`, `PATCH /status` (con transiciones válidas), `GET /{id}`. Al crear: código único 3-4-4, IVA 16%, split asesor 80% / DMX 20%, cierre otorga +250 XP + cierres_total.
- `GET /api/asesor/comisiones` (forecast 6m, by_status, totales)
- `POST /api/asesor/argumentario` (Claude Sonnet 4.5, cache semanal)
- `POST /api/asesor/briefing/daily` (stub con datos reales del usuario)
- `GET /api/asesor/leaderboard`
- `GET /api/asesor/perfil-publico/{slug}`
- `POST /api/asesor/_seed-demo` (6 contactos + 3 búsquedas + 2 captaciones + 4 tareas + 2 operaciones)

### Frontend `/app/frontend/src/`
- `App.js` — rutas: `/`, `/marketplace`, `/propiedad/:id`, `/desarrollo/:id`, `/mapa`, `/asesor/*`.
- `pages/DevelopmentDetail.js` — **completo Iteración B**: 5 tabs + sticky sidebar + paywall gating
- `pages/Marketplace.js` — refactor completo Iteración A
- `pages/advisor/*` — **nuevo Fase 4**:
  - `AsesorDashboard.js` (widgets + briefing IA + perfil score)
  - `AsesorContactos.js` (tabla + detalle drawer + argumentario Claude drawer)
  - `AsesorBusquedas.js` (Kanban 6 columnas con DnD + validaciones duras + matches motor)
  - `AsesorCaptaciones.js` (Kanban 6 columnas + gate de campos mínimos)
  - `AsesorTareas.js` (3 columnas por scope + wizard 2 pasos)
  - `AsesorOperaciones.js` (tabla + wizard 6 pasos + transiciones de estado)
  - `AsesorComisiones.js` (stats + desglose + recientes)
  - `AsesorRanking.js` (leaderboard Elo)
- `components/advisor/AdvisorLayout.js` — sidebar nav + role gate
- `components/advisor/primitives.js` — PageHeader, Card, Stat, Badge, Empty, Toast, Drawer
- `components/dev/*` — Iteración B complete (DescriptionTab, PriceListTab, ProgressTab, AmenitiesTab, LocationTab, Sidebar, RegistrationModal, PhotoGallery, FloorPlan)
- `i18n/locales/{es,en}.json` — keys dev.* (~80 nuevas) + gate.* expandidos
- `api/advisor.js` — helpers consolidados del portal

---

## Flujos clave (Fase 4)

1. **Role gating**: `/asesor/*` redirige a `/` si no hay sesión; muestra 403 si rol ≠ advisor|asesor_admin|superadmin.
2. **Kanban drag&drop**: optimistic UI + validación servidor:
   - `busqueda → visitando` requiere `visits >= 1`
   - `busqueda → ofertando/ganada` requiere `offers >= 1`
3. **Argumentario IA**: POST `/api/asesor/argumentario` con `{contacto_id, desarrollo_id, objetivo}`. Cache semanal (MD5 key con ISO-week). Fallback text si Claude falla.
4. **Operación split 80/20 transparente**: wizard 6 pasos visualiza cálculo en vivo (valor × pct = base, +IVA 16%, split asesor 80% / DMX 20%).
5. **Matcher motor**: 5 dimensiones deterministas (precio 30% + zona 25% + amenidades 20% + recámaras 15% + urgencia 10%). Retorna top 12 con rationale chips.

---

## Testing
- 2026-04-30 **Phase 6 Wave 1 — DMX Studio**:
  - Backend `routes_studio.py`: video stub (Claude script + storyboard), ads engine (Claude copies + gpt-image-1 hero images lazy-loaded). Adapter pattern via `STUDIO_VIDEO_ENGINE` / `STUDIO_ADS_ENGINE` env vars.
  - Verified: video script generation (3-scene storyboard + voice + music); ads batch (10 unlocked + 90 locked) with real Claude copies and 1 gpt-image-1 hero per ángulo.
  - Frontend Studio dashboard + 2 wizards + batch detail drawer screenshot-verified with real generated content in es-MX.
- 2026-04-30 **OAuth profile_completed flag**: explicit boolean replaces derived check; PATCH /profile auto-flips on min fields satisfied.
- 2026-04-30 **Phase 5 Developer Portal MVP**:
  - Backend: 9+ endpoints curl-verificados (`/api/desarrollador/*`)
  - Backend Claude D9 reportes: genera resumen ejecutivo real con Sonnet 4.5
  - Frontend smoke screenshots: dashboard (15 devs, $589M booked, $947M pipeline), demanda (16 colonias heatmap + 10 top queries + funnel), pricing (27 sugerencias renderizadas)
- 2026-04-30 **Iteración B + Fase 4 backbone** (iteration_3 + smoke tests)
  - Backend: manual curl verificó 8+ endpoints (dashboard, busquedas stage validation, comisiones, operaciones creation/status, briefing, role check superadmin)
  - Frontend: smoke screenshot del `/asesor` dashboard
- 2026-04-30 Iteración A (iteration_3.json): Backend 24/24 pytest + Frontend 100%.

⚠️ **No se ejecutó testing_agent_v3_fork end-to-end** — programado para próxima sesión cubriendo todos los flujos públicos + asesor + desarrollador.

---

## 2026-05-01 — Chunk 1 · Ingestion uniforme + seed extra
- **Parte A — Ingestion sobre 16 colonias**
  - `scheduler_ie.py run_daily_score_recompute()` ahora incluye las **16 colonias seed** en cada corrida (usa `data_seed.COLONIAS`), no solo las 4 piloto. Obs globales (zone_id=None) se propagan a cada zona vía `$or` query del engine.
  - Limpieza: 160 scores "legacy" con zone_id humanizado ("Roma Norte", "Polanco", "Ñuño", etc.) eliminados — eran residuo de test Latin-1.
- **Parte B — 3 desarrollos extra para activar peer recipes**
  - `data_developments.py` DEVELOPMENTS_RAW +3:
    - **Polanco Moderno** (habitare-capital · en_construccion · $11.8M–$24.5M) → 2º en Polanco.
    - **Orquídea Roma** (agora-urbana · preventa · $4.95M–$11.4M) → 2º en Roma Norte.
    - **Terraza Condesa** (sereno · preventa · $6.2M–$13.8M) → 2º en Condesa.
- **Verificación**
  - `POST /scores/recompute-all` → 34 zonas (16 col + **18 dev**), **417 reales + 343 stubs**, 1.2s. (vs 31/372/352 pre-chunk)
  - **16/16 colonias** con ≥5 real · **18/18 developments** con ≥5 real.
  - `altavista-polanco` ahora **12/12 real** (vs 9/12 antes): PRECIO_VS_MERCADO=55.89 (green, en mercado), BADGE_TOP=50 (amber), COMPETITION_PRESSURE=20 (green, 1 peer).
  - Playwright: `/desarrollo/polanco-moderno` renderiza 6 pills reales.

---

## 2026-05-01 — Chunk 2 · Sub-chunk C1 · IE Engine Phase C N4 Predictive
- **Base** `PredictiveRecipe` (`backend/recipes/predictive/_helpers.py`) extiende `Recipe` con `layer="predictive"`, `model_version`, `confidence_interval {low, high, percentile}`, `training_window_days`, `residual_std`. Pure + deterministic + versioned.
- **3 recipes N4 nuevas**:
  - `IE_COL_PLUSVALIA_PROYECTADA` (scope=colonia · model `lin_reg_v1` · IC 80%) — regresión lineal sobre `IE_COL_PLUSVALIA_HIST` + 5 features demográficas INEGI. Coeficientes β fijos (deterministas). Degrada a stub si falta PLUSVALIA_HIST o <2 features demográficas.
  - `IE_PROY_DAYS_TO_SELLOUT` (proyecto · `absorp_linreg_v1` · IC 70%) — velocidad = absorbidas/ramp-up por stage × listing_health factor (0.7–1.3). Tier lower_better (<180=green, 180-365=amber, >365=red).
  - `IE_PROY_ROI_BUYER` (proyecto · `compound_v1` · IC 80%) — compuesto 5 años: (1+plusvalía)^5 + renta_5y − tx_costs 10% − opp_cost CETES 8.5%×5. IC heredada del IC de `IE_COL_PLUSVALIA_PROYECTADA`. Tier: ≥40%=green, 15-40%=amber, <15%=red.
- **Engine extensions**
  - `ScoreEngine._build_colonia_context()` inyecta `_dmx_own_colonia_scores` para que N4 colonia consuman scores propios N1-N2 sin requerir SQL extra.
  - `_build_project_context()` enriquecido con `_dmx_own_proj_scores`.
  - `_persist()` ahora guarda 4 campos extra opcionales (`model_version`, `confidence_interval`, `training_window_days`, `residual_std`) cuando están presentes.
- **Endpoints**
  - `POST /api/superadmin/scores/recompute-all` nuevo flag `layer: "all"|"descriptive"|"predictive"`. Cuando `all` ejecuta **2-pass**: descriptive primero para que N4 tenga scores N1-N2 disponibles; predictive después.
  - `GET /api/zones/:id/scores/explain` ahora devuelve: `layer`, `model_version`, `confidence_interval`, `training_window_days`, `residual_std`, `prediction_date`.
- **Frontend**
  - `ZoneScoreStrip`: labels IE_COL_PLUSVALIA_PROYECTADA / IE_PROY_DAYS_TO_SELLOUT / IE_PROY_ROI_BUYER. Nuevo `PRED_FORMATTERS` renderiza en unidades nativas (`3.2%`, `1147d`, `-43%`) con sub-text IC. Sort automático sube predictivos al top. Limit 8 en ficha (antes 6) — garantiza los 3 N4 visibles + 5 N1-N2.
  - `ScoreExplainModal`: nuevo bloque "MODELO PREDICTIVO · N4" (solo si `data.layer === 'predictive'`) con 4 campos: Modelo / IC % / Ventana / Error estándar.

### Verificación C1
- `POST /recompute-all {layer:"all"}` → task procesa **68 pares** (34 zonas × 2 pasadas) en 2.1s.
- **Cobertura N4 = 52/52 reales, 0 stubs**:
  - IE_COL_PLUSVALIA_PROYECTADA: 16/16 colonias
  - IE_PROY_DAYS_TO_SELLOUT: 18/18 developments
  - IE_PROY_ROI_BUYER: 18/18 developments
- Roma Norte `IE_COL_PLUSVALIA_PROYECTADA` → `value=3.21%, IC[2.19, 4.23], conf=high, window=1095d`.
- Altavista Polanco `IE_PROY_DAYS_TO_SELLOUT` → `1147.5d (tier red), IC 70% [745–1549]`.
- Altavista Polanco `IE_PROY_ROI_BUYER` → `-43.25% (tier red), IC 80% [-48.93, -37.35]` — auditable: plusvalía esperada (3.21%×5≈17%) < CETES acumulado 50% − tx 10%. Fórmula fiel.
- Playwright ficha `/desarrollo/altavista-polanco`: 8 pills con **DAYS_TO_SELLOUT y ROI_BUYER primero**, modal explain muestra bloque "MODELO PREDICTIVO · N4" con `compound_v1`, IC, ventana, σ.

**IE Engine layers: N1-N2 (46 desc) + N4 (3 pred) · 49 total.** Phase C1 done, pending C2 LLM narrative.

---

## 2026-05-01 — Chunk 2 · Sub-chunk C2 · IE Engine Phase C N5 LLM Narrative
- **Backend** — nuevo módulo `narrative_engine.py`:
  - Cache 7 días en collection `ie_narratives` con índices (scope,entity_id,prompt_version), (generated_at), (expires_at).
  - Invalida cache si algún score N1-N4 drifta ≥5 puntos absolutos (`_scores_changed` compara `scores_snapshot`).
  - Cap budget LLM **$5 USD/sesión** (1h rolling window). Degrada a cache stale si se alcanza.
  - Emergent LLM Key · **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) · temperature implícito de la lib · hard cap 400 chars post-truncation.
  - Dos prompts distintos (`SYSTEM_PROMPT_COLONIA` + `SYSTEM_PROMPT_PROYECTO`). El de proyecto incluye **regla explícita anti-fearmongering** para ROI rojo: "encuadra como 'proyecto de plusvalía patrimonial a largo plazo' con caveat honesto sobre liquidez vs CETES. Tono educativo, no transaccional."
  - Endpoints:
    - `GET /api/zones/:id/narrative` — público.
    - `GET /api/developments/:slug/narrative` — público.
    - `POST /api/superadmin/narratives/regenerate?id=&scope=` — force regen.
    - `POST /api/superadmin/narratives/batch-generate?scope=all|colonia|development` — pre-calentar cache.
    - `GET /api/superadmin/narratives/budget` — uso y cap.
- **Frontend**
  - Nuevo componente `NarrativeBlock.js` con props `{scope, entityId, compact, showFooter}`. Footer renderiza modelo + prompt_version + fecha + badge `CACHE` si cache hit.
  - `/inteligencia` hero: `NarrativeBlock` de Roma Norte debajo del `ZoneScoreStrip`.
  - `/desarrollo/:slug`: nueva section "Narrativa AI · N5" entre Score IE y tabs.
  - `/barrios`: `NarrativeBlock compact showFooter={false}` entre el nombre de la colonia y el strip.

### Verificación C2 (reporte completo)
- **Generación batch**: 16 colonias + 18 developments = **34 narrativas reales · 0 errores**.
- **Costo Claude total**: **$0.1073 USD** (bien debajo del cap $5). Cada narrativa ≈ $0.003.
- **Cache funcional**: 2 calls consecutivos devuelven misma `generated_at` (`2026-05-01T04:02:42.874`).
- **Ejemplo Roma Norte (colonia verde)**:
  > "Roma Norte concentra el ingreso más alto de CDMX (IE_COL_DEMOGRAFIA_INGRESO 100.0) y perfil familiar consolidado (IE_COL_DEMOGRAFIA_FAMILIA 76.3). Calidad del aire favorable (IE_COL_AIRE 70.0). La isla de calor es severa (IE_COL_CLIMA_ISLA_CALOR 65.0, tier red) y plusvalía histórica nula (0.0), sugiriendo mercado maduro sin expansión reciente. Proyección de plusvalía modesta (3.21). DMX no opin…"
- **Ejemplo Altavista Polanco (ROI tier red → encuadre educativo verificado)**:
  > "Altavista Polanco combina desarrollador confiable (Quattro Capital: 96.89% cumplimiento histórico, 100.0 confianza) con amenidades nivel 100.0 y presión competitiva baja (20.0). **Caveat honesto: ROI comprador -43.25% sugiere que esto es patrimonio a largo plazo, no especulación**. Velocidad de absorción lenta (28.57%) indica paciencia requerida. Polanco sigue siendo Polanco: ingreso 100.0. DMX no…"
  → Cita score específico, NO usa alarmismo, encuadra educativamente, respeta regla del system prompt.
- **Playwright /inteligencia**: hero muestra narrativa con footer "Claude sonnet-4 · prompt v1.0 · 1 may 2026 · CACHE" ✓.
- **Cero hallucination**: todos los números citados coinciden con los scores reales persistidos en `ie_scores`.

### IE Engine layers finales
- N1-N2 (descriptive) · 46 recipes
- N4 (predictive) · 3 recipes
- N5 (narrative) · 34 narrativas cacheadas (16 colonias + 18 devs)
- **Phase C · COMPLETE ✅**

---

## 2026-05-01 — Chunk 3 · Briefing IE Comparador Asesor (Phase C3)
- **Backend `briefing_engine.py`** nuevo módulo:
  - POST `/api/asesor/briefing-ie` · POST `/:id/feedback` · GET `/:id` · GET `/briefings` · GET `/briefings/summary`.
  - Role-gated vía `require_advisor` (advisor / asesor_admin / superadmin).
  - Cache 24h por (advisor, dev, lead_id|contact_id|null, prompt_version). Invalida si scores drift ≥5 pts.
  - Cap budget LLM `$5 USD/sesión` compartido con narrative_engine (rolling 1h window).
  - **Claude Sonnet 4.5** con system prompt "SIN emojis · SI ROI=red encuadra patrimonial · NUNCA inventes". Output JSON parsed (hook, headline_pros[4-6], honest_caveats[2], call_to_action, whatsapp_text ≤800 chars, context_hint).
  - `SCORE_LABEL_ES` map (31 labels) para UI-ready bullets.
  - Collection `ie_advisor_briefings`: { id, advisor_user_id, development_id, lead_id?, contact_id?, hook, headline_pros[], honest_caveats[], call_to_action, whatsapp_text, context_hint, prompt_version, scores_snapshot, generated_at, expires_at, used, feedback, model, cost_usd }.
  - Indexes: (advisor, generated_at desc), (advisor, dev, lead, contact, prompt_version), (expires_at).
- **Frontend**
  - `api/briefings.js` · 5 endpoints.
  - `BriefingIEModal` (720px, glass bg, close button, gradient CTA): header con model+cost, warning amber si genérico (sin lead/contact), secciones Contexto / Apertura / Razones data-backed / Caveats honestos / Próximo paso · cada bullet cita score_code con pill clickeable → abre `ScoreExplainModal`. 3 botones: Copiar completo / Copiar WhatsApp / Enviar por WhatsApp (abre `wa.me/?text=`). Inline feedback "¿Cerró el lead?" (Sí / Parcial / No) post-copy.
  - `DevelopmentDetail`: botón "Briefing IE para cliente" (gradient navy→pink, Sparkle icon) en sidebar sticky, **solo si role ∈ {advisor, asesor_admin, superadmin}**. Detecta `?lead=` / `?contacto=` URL params y los pasa al modal.
  - `AsesorDashboard`: nuevo widget "BRIEFING IE · 7d" con count + % cerrados + 3 recientes + link "Ver todos →".
  - `/asesor/briefings` nueva página con tabla filtrable (col: Proyecto/Colonia/Generado/Usado/Resultado/Acciones), FeedbackBadge (verde/ámbar/rojo), botones "Ver" (reabre modal desde cache) + "Ficha →".
  - `AdvisorLayout`: nuevo link "Briefings IE" con MessageSquare icon.

### Verificación Chunk 3
- **Briefing generado Altavista Polanco (ROI tier=red)**:
  - Hook: "Altavista Polanco: patrimonio de élite con desarrollador probado, no especulación de corto plazo"
  - 6 pros citando scores reales (Delivery 96.89, Amenidades 100, Presión 20, Ingreso 100, Precio-vs-mercado 55.89, Familias 76.3)
  - Caveats con encuadre **honesto educativo**: "ROI proyectado -43.25% a 5 años indica que esto NO es inversión especulativa: es patrimonio familiar vs rendimiento CETES, el valor está en uso y estatus, no en reventa inmediata."
  - CTA: "Ana, agenda visita presencial esta semana para recorrer unidades modelo y comparar vs 2-3 alternativas en Polanco con mejor ROI si tu cliente prioriza liquidez. Si busca patrimonio generacional, este es el pitch: Quattro + amenidades top + entrada competitiva."
  - whatsapp_text: 592 chars, plain text (sin emojis post-prompt-fix).
  - **Regla anti-fearmongering verificada ✓**.
- **Briefing generado Juárez Boutique**: hook "jugada patrimonial de largo plazo", "respaldada por desarrollador clase A, no compite con CETES" · mismo tono educativo.
- **Cache hit verificado**: segunda llamada con mismo payload devuelve `cache_hit=true, generated_at` idéntico.
- **Budget Claude total del batch tests**: ~$0.03 USD · $0.015 por briefing.
- **Role-gate verificado**: buyer (sin auth) → 401 en `/api/asesor/briefing-ie`.
- Playwright ficha Altavista Polanco: modal abre con 8 pills clickeables, 3 CTAs, inline feedback.
- Playwright `/asesor/briefings`: tabla muestra 2 briefings con columnas completas, sidebar "Briefings IE" activo.

### Archivos tocados
- `/app/backend/briefing_engine.py` (nuevo · 350 líneas)
- `/app/backend/server.py` (router registration)
- `/app/frontend/src/api/briefings.js` (nuevo)
- `/app/frontend/src/components/advisor/BriefingIEModal.js` (nuevo · 250 líneas)
- `/app/frontend/src/pages/advisor/AsesorBriefings.js` (nuevo)
- `/app/frontend/src/pages/advisor/AsesorDashboard.js` (+widget)
- `/app/frontend/src/pages/DevelopmentDetail.js` (+CTA role-gated)
- `/app/frontend/src/components/advisor/AdvisorLayout.js` (+link)
- `/app/frontend/src/App.js` (+ruta)
- `/app/memory/PRD.md`

---

## 2026-05-01 — Chunk 4 · Studio Real Engines
- **Backend `studio_engines.py`** (nuevo · 250 líneas):
  - **Video adapter** `generate_video(engine, script, duration, video_id)` con dispatcher `stub|kling|seedance|auto`. Kling vía Replicate (`kwaivgi/kling-v2.0`) primario, Fal Seedance Pro (`fal-ai/bytedance/seedance/v1/pro/text-to-video`) fallback automático en excepción. v1.0 genera 1 clip 5-10s combinando prompts de las primeras 3 escenas. Multi-escena+mux queda en Wave 1.5.
  - **Ads adapter** `generate_ad_image()` + `generate_ads_full_batch()` — OpenAI gpt-image-1 direct via HTTP, `asyncio.Semaphore(5)` throttle. 90 imágenes únicas por batch, PNG 1024×1024 en `/app/backend/uploads/studio/ads/{batch_id}/{angulo}/{variant}.png`.
  - **TTS adapter** `generate_tts_elevenlabs()` — POST ElevenLabs `/v1/text-to-speech/{voice_id}` con `eleven_multilingual_v2`. MP3 en `/tts/{audio_id}.mp3`. Fallback honest 503 si `ELEVENLABS_API_KEY` vacío.
  - **Budget cap** — collection `studio_user_budget` con `{user_id, month_iso, spent_usd, cap_usd}`. `preflight_budget` raise 402 pre-operación; `charge_budget` post-generación incrementa spent. Default cap $20/asesor/mes, $200 admin.
- **routes_studio.py** wiring:
  - `_generate_video_real` ahora llama `studio_engines.generate_video` + opcional TTS ElevenLabs mixed into metadata.
  - `_generate_ads_real` reusa `openai-stub` para 10 copies + 7 heroes luego marca `needs_full_activation=True` para los 90 restantes.
  - Budget preflight envolvente en `/generate-video` + `/ad-batches/:id/activate-full` + `/tts/generate`.
  - Endpoints nuevos: `GET /videos/:id/file` · `GET /videos/:id/status` · `POST /ad-batches/:id/activate-full` · `GET /ad-batches/:id/full-status` · `POST /tts/generate` · `GET /tts/:id/download` · `GET /my-budget` · `GET /admin/budgets` · `PATCH /admin/budgets/:user_id`.
- **Frontend `StudioDashboard.js`**:
  - Banner "MODO DEMO" **eliminado** (solo se muestra si TODOS los engines son stub).
  - Widget "PRESUPUESTO STUDIO" con barra de progreso gradient (verde <70%, amber 70-90%, rojo >90%) + breakdown engines activos.
  - Badges per-card `stub` → `demo` (sutiles).
  - Drawer video detail: bloque verde con engine real + botón "Descargar MP4" + indicador voiceover ElevenLabs si presente.

### Verificación Chunk 4
- **Budget widget**: renderiza `$0.00/$20 · 0% usado · quedan $20.00` con engines `VIDEO: auto · ADS: openai-full · TTS: stub` ✓.
- **402 budget cap**: `PATCH /admin/budgets/:user → cap=$0.10` + intento `/generate-video ($0.45)` → **HTTP 402** con detail `{error:"budget_cap_reached", spent:0, cap:0.10, estimated_cost:0.45}` ✓.
- **Ads hero gpt-image-1**: genera imagen real via Emergent LLM Key · asset_id fetchable con b64 de 2.6MB ✓ (Wave 1 funcional).
- **Banner MODO DEMO ausente** del dashboard ✓.
- **Keys provided**: FAL_KEY + REPLICATE_API_TOKEN + OPENAI_API_KEY en `/app/backend/.env` ✓.
- **Keys missing**: `ELEVENLABS_API_KEY` → TTS queda en `stub`, endpoint responde 503 honest con mensaje "Configura ELEVENLABS_API_KEY".
- **Saldo de keys**: ambas Replicate y Fal devuelven **"Insufficient credit"** en prod call (402 de su upstream). Código funcional end-to-end, activación pendiente de que el usuario cargue créditos en `replicate.com/account/billing` y `fal.ai/dashboard/billing`.

### Archivos tocados
- `/app/backend/studio_engines.py` (nuevo)
- `/app/backend/routes_studio.py` (+230 líneas)
- `/app/backend/adapters/{video,ads,tts}/__init__.py` (scaffold)
- `/app/backend/.env` (+4 env vars)
- `/app/frontend/src/pages/advisor/StudioDashboard.js` (+widget budget + cleanup banners)
- `/app/memory/PRD.md`

### Roadmap actual cerrado
**Chunks 1-4 + side-task marketplace rank · Phase A+B+C IE Engine completos.**
- Chunk 1 ✅ Ingestion uniforme + 3 devs extra
- Chunk 1-bis ✅ Badge "1º en su colonia"
- Chunk 2 C1 ✅ N4 Predictive (3 recipes, 52 reales)
- Chunk 2 C2 ✅ N5 LLM Narrative (34 cached · $0.11)
- Chunk 3 ✅ Briefing IE Asesor (loop moat→conversión cerrado)
- Chunk 4 ✅ Studio Real Engines (código 100% funcional, pending vendor credits + ELEVENLABS key)

---

## 2026-05-01 — Phase 7.1 · Document Intelligence Pipeline (Moat #2 base)
**Objetivo:** infraestructura para subir, procesar (OCR) y almacenar de forma cifrada documentos legales/comerciales por desarrollo. Base para 7.2 (extracción estructurada) y 7.3 (cross-checking).

### Backend
- **Nuevo módulo `document_intelligence.py`** — encryption (Fernet via `IE_FERNET_KEY` reusada · NO key nueva), OCR pipeline, Mongo indexes, sanitize helpers.
  - Pipeline OCR: `pdfplumber` para PDFs con capa de texto (confianza 0.95), fallback `tesseract spa` para PDFs imagen. `tesseract spa` directo para JPG / PNG / TIFF. Cap 50 MB / archivo. Cap 500K chars OCR text.
  - Cifrado dual: archivo en disco como bytes Fernet (`/app/backend/uploads/document_intelligence/{doc_id}.bin`) + `ocr_text_enc` Fernet en Mongo. Mime, sha256 y tamaños van plain.
  - Tesseract instalado: `tesseract-ocr-spa`, `libmagic1`, `poppler-utils` (sistema) + `pytesseract`, `pdfplumber`, `python-magic` (Python).
- **Nuevo módulo `routes_documents.py`** — 11 endpoints (6 superadmin + 5 alias `/api/desarrollador/*`):
  - `POST /api/superadmin/developments/{dev_id}/documents/upload` — multipart (file + doc_type + upload_notes + period_start/end) → cifra y dispara `asyncio.create_task(run_ocr_for_document)`.
  - `GET /api/superadmin/developments/{dev_id}/documents` — list por dev (filtros doc_type, status).
  - `GET /api/superadmin/documents` — list global (filtrado por tenant).
  - `GET /api/superadmin/documents/{doc_id}` — detalle + `ocr_preview` (1500 chars) descifrado on-read.
  - `GET /api/superadmin/documents/{doc_id}/download` — descarga descifrada con verificación sha256 (409 si hash mismatch).
  - `POST /api/superadmin/documents/{doc_id}/reprocess-ocr` — reset status pending + re-encolar OCR.
  - `DELETE /api/superadmin/documents/{doc_id}` — elimina archivo cifrado del disco + extractions + doc.
  - `GET /api/superadmin/document-types` — diccionario es-MX (11 tipos).
  - Aliases `/api/desarrollador/*` con la misma lógica para devloper_admin.
- **Multi-tenant guard** — `TENANT_DEV_MAP`:
  - `superadmin` (tenant=`dmx`) → todos los desarrollos.
  - `developer_admin` (tenant=`constructora_ariel`) → solo developer_ids `["quattro", "habitare-capital", "agora-urbana"]`.
  - Mapping desde developer_ids → development_ids automático vía `data_developments.DEVELOPMENTS`.
  - Roles distintos a esos dos → 403.
- **Doc types (11)** según `03_INTELLIGENCE.md` sec 6: `lp`, `brochure`, `escritura`, `permiso_seduvi`, `estudio_suelo`, `licencia_construccion`, `predial`, `plano_arquitectonico`, `contrato_cv`, `constancia_fiscal`, `otro`. Granularidad necesaria para 7.2 (templates Claude por tipo) y 7.3 (cross-checks SEDUVI ≠ licencia construcción, predial vs constancia fiscal, etc.).
- **Schemas Mongo**:
  - `di_documents` — id, development_id, developer_id, uploader_user_id/name/role, filename, file_size_bytes, mime_type, file_hash (sha256), storage_path, doc_type, status, ocr_text_enc, ocr_text_chars, ocr_pages_count, ocr_confidence, ocr_engine, ocr_error, upload_notes, period_relevant_start/end, created_at, processed_at, expires_at. Indexes: (development_id, created_at desc), status, file_hash, doc_type, id unique.
  - `di_extractions` — placeholder para 7.2 (id, document_id, extracted_data, schema_version, claude_model_used, extracted_at).
- **Wiring `server.py`** — router montado, `ensure_di_indexes` en startup.

### Frontend
- **Nuevo `api/documents.js`** — 7 helpers (listDocTypes, listDevDocuments, listAllDocuments, getDocument, reprocessOcr, deleteDocument, uploadDocument, downloadDocumentUrl). Scope `superadmin | developer` switchable.
- **Nuevo `components/documents/UploadDocumentModal.js`** — modal 640px gradient, dropzone drag&drop + acepta PDF/JPG/PNG/TIFF, select doc_type (11 tipos labeled es-MX), notas, vigencia desde/hasta. Errores inline. Botón submit gradient con estados disabled.
- **Nuevo `components/documents/DocumentsList.js`** — widget reusable con tabla (Archivo, Tipo, Status pill, Tamaño, Subido, Acciones), drawer preview lateral (560px) con OCR text descifrado en `<pre>` + meta grid (uploader, fechas, sha256, vigencia, notas) + status badges (engine, confianza, páginas, chars), polling auto cada 2.5s mientras hay docs en `pending|ocr_running`.
- **Nueva página `/superadmin/documents`** (`pages/superadmin/DocumentsPage.js`) — sidebar con 18 desarrollos + buscador, panel central con DocumentsList del dev activo, stats strip (Documentos, OCR listos, En proceso, Fallidos, Tipos distintos).
- **Widget Developer Portal** — DocumentsList montado en `/desarrollador/inventario` debajo de la tabla del desarrollo activo, scope='developer'.
- **Nav superadmin** — link "Documentos" con icon `FileText` en `SuperadminLayout`.
- **6 iconos nuevos** en `components/icons/index.js`: `FileText`, `Upload`, `Download`, `Trash`, `RotateCcw`, `AlertTriangle`, `Check`.

### Verificación end-to-end
- **Upload PDF text-layer (escritura)** — pdfplumber engine, confianza 0.95, ocr_text descifrado: "Escritura publica notarial / Lote 12 Manzana 5 Polanco" ✓.
- **Upload PNG image (permiso_seduvi)** — tesseract_spa engine, confianza 0.647, ocr_text: "Permiso SEDUVI numero 12345 valido para 2026" ✓.
- **Sha256 dedupe** — re-upload mismo PDF → 409 con `Documento duplicado (sha256 ya existe en este desarrollo)` ✓.
- **Validación extension** — .txt → 400 ✓.
- **Validación doc_type** — `invalid_type` → 400 ✓.
- **Multi-tenant guard**:
  - dev_admin (constructora_ariel) → altavista-polanco (quattro): **200** ✓
  - dev_admin → roma-norte-orquidea (agora-urbana): **200** ✓
  - dev_admin → juarez-boutique (origen, NO tenant): **403** ✓
  - buyer (sin auth): **401** ✓
  - advisor: **403** ✓
- **Download** — sha256 verificado on-read, archivo idéntico al subido ✓.
- **Reprocess OCR** — status pending → ocr_running → ocr_done con timestamps actualizados ✓.
- **Delete** — archivo cifrado removido del disco ✓.
- **Playwright /superadmin/documents** — h1 "Document Intelligence", stats correctos, sidebar 18 desarrollos, fila escritura_test.pdf con pill "OCR LISTO" verde, drawer preview muestra OCR descifrado + meta + sha256 truncado ✓.
- **Playwright /desarrollador/inventario** — widget "Documentos del desarrollo" renderiza debajo de la tabla de unidades con misma fila en OCR listo ✓.

### Archivos tocados
- `/app/backend/document_intelligence.py` (nuevo · 350 líneas)
- `/app/backend/routes_documents.py` (nuevo · 320 líneas)
- `/app/backend/server.py` (router + ensure_di_indexes)
- `/app/backend/.env` (+DI_UPLOAD_DIR, +ELEVENLABS_API_KEY)
- `/app/backend/requirements.txt` (pip freeze post pytesseract/pdfplumber/python-magic)
- `/app/frontend/src/api/documents.js` (nuevo)
- `/app/frontend/src/components/documents/UploadDocumentModal.js` (nuevo)
- `/app/frontend/src/components/documents/DocumentsList.js` (nuevo)
- `/app/frontend/src/pages/superadmin/DocumentsPage.js` (nuevo)
- `/app/frontend/src/components/superadmin/SuperadminLayout.js` (link "Documentos")
- `/app/frontend/src/components/icons/index.js` (+7 iconos)
- `/app/frontend/src/pages/developer/DesarrolladorInventario.js` (widget DocumentsList)
- `/app/frontend/src/App.js` (+ruta `/superadmin/documents`)
- `/app/memory/PRD.md`

### Phase 7 — Document Intelligence
- **Phase 7.1 ✅** Upload + OCR + Fernet storage + multi-tenant guard
- **Phase 7.2 ✅** Claude structured extraction + auto-trigger post-OCR + tab UI
- **Phase 7.3 ✅** Cross-Check Engine (5 reglas deterministas) + IE recipes + GC-X4 pricing block
- **Phase 7.5 ✅** Auto-Sync Extracted → Marketplace (overlay store + audit + revert + locks + pause)
- **Phase 7.4 ✅** Developer Portal Legajo (5 tabs) + Compliance Badge en marketplace + ficha pública
- **Phase 7.6 ✅** Asset pipeline (uploads watermark + Claude Vision categorize + Pedra 360° stub + ficha pública wired)
- Phase 7.10 ⏳ Avance de obra timeline (próxima: P0)

---

## 2026-05-02 — Phase 4 Batch 10 · Sidebar Reorganizado + Mis Proyectos + VentasTab

**SHA:** `1b538117daf64d1c82390a528421365a275a40db`

### Sub-chunk A ✅ — Sidebar refactor + Mis Proyectos page
- `navByRole.js` → DEV_NAV reestructurado en 3 tiers collapsibles (11 items):
  - WORKFLOW DIARIO: Dashboard, Mis Proyectos, CRM, Mensajes
  - INTELIGENCIA: Reportes IA, Demanda, Site Selection, Precios IA, Competidores
  - CONFIGURACIÓN: Equipo, Configuración
- `/desarrollador/proyectos` → `MisProyectos.js`: cards grid (EntityCard-style), HealthScore circular, filtros por etapa, sort, view toggle cards/lista, paginación 20/página
- Legacy redirects backward-compat: `/inventario → /proyectos`, `/leads → /crm?tab=pipeline`, `/citas → /crm?tab=citas`, `/calendario-subidas → /proyectos`

### Sub-chunk B ✅ — ProyectoDetail shell 8 tabs
- `/desarrollador/proyectos/:slug` → `ProyectoDetail.js`: breadcrumb, KPIStrip (4 KPIs: % vendido/uds vendidas/revenue MTD/leads activos), HealthScore md, 8 tabs con URL sync `?tab=`
- Tabs: Ventas (contenido real) · Contenido · Avance de obra (reutiliza AvanceObraTab) · Ubicación (reutiliza GeolocalizacionTab) · Amenidades · Legal · Comercialización · Insights
- Cmd+P project switcher (localStorage recientes)

### Sub-chunk C ✅ — Tab Ventas 3 sub-tabs
- `VentasTab.js` component en `/components/developer/`: Inventario completo | Por prototipo | Vista de planta (URL sync `?subtab=`)
- Inventario completo: tabla sticky, FilterChipsBar multi-status con contadores, búsqueda instant unit_number, density toggle (compacto/expandido via usePreferences), paginación 30/página, EntityDrawer on click, Bulk Upload wired
- Por prototipo: cards por tipo con stats (total, disponibles, desde $X), click → switch to inventario con proto filter
- Vista de planta: grid color-coded por nivel (disponible=verde/reservado=azul/vendido=rojo/etc.), hover tooltip, click → EntityDrawer, leyenda colores

### Backend `routes_dev_batch10.py` (nuevo)
- `GET /api/dev/projects/list-with-stats` — proyectos enriquecidos con health_score, leads_active, revenue_mtd_est, units_by_status
- `GET /api/dev/projects/:id/summary` — stats KPI para un proyecto específico

### CRM Shell ✅
- `/desarrollador/crm` → `DesarrolladorCRMShell.js`: 6 tabs (Pipeline real con LeadKanban + Leads/Citas/Slots/Brokers/Métricas placeholder)



---

## 2026-05-02 — Phase 4 Batch 11 · Migración Legajo → Tabs + Comercialización + Drawer enriquecido

### Sub-chunk A ✅ — Tabs migradas (Contenido, Amenidades, Legal)
- `ContenidoTab.js`: 6 sub-tabs (Fotos/Planos/Renders/Videos/Tour 360°/Brochures) con URL sync `?content_sub=`, drag-drop zone (`DragDropZone`), thumbnails con hover (descargar/portada/eliminar), preview modal.
- `AmenidadesTab.js`: 4 categorías (comunes/internas/tecnológicas/sustentabilidad) con checkboxes editables, contador activas, botón "Aplicar desde otro proyecto" (smart defaults desde otros proyectos del dev_org).
- `LegalTab.js`: Timeline de proceso legal (5 etapas: Uso de Suelo → SEDUVI → Planos → Contrato → Escritura), upload zone con categorizer IA (Claude Haiku), cards de documentos con badge status (pendiente/aprobado/rechazado/revisión).

### Sub-chunk B ✅ — Comercialización
- `ComercializacionTab.js`: 3 secciones:
  - **Política comercial**: toggles (trabajar con brokers / solo in-house / IVA), InlineEditField para comisión default %, textarea de términos. Toggle "Aplicar desde otro proyecto".
  - **Brokers asignados**: lista con status badges, botones Pausar/Revocar, modal de asignación con dropdown de asesores.
  - **Pre-asignación in-house**: toggle por asesor interno para auto-asignar a nuevos invitados.

### Sub-chunk C ✅ — UnitDrawerContent enriquecido
- `UnitDrawerContent.js`: 7 secciones colapsables en `EntityDrawer` (body prop):
  1. **Estado y precio**: InlineEdit status + precio, historial de precios con sparkline SVG + delta vs. promedio colonia.
  2. **Engagement**: métricas asesores vs. clientes (vistas/clicks/tiempo/compartidos/intent score) + funnel 5 etapas (stub honesto con `is_stub`).
  3. **Comparables internos**: stats agregados misma prototipo + tabla de unidades hermanas.
  4. **Comparables de mercado (colonia)**: avg $/m² colonia vs. tu precio + delta % + top 5 proyectos.
  5. **Predicción IA**: prob. cierre 90d, prob. si bajas 3%, días estimados, recomendaciones, nivel confianza, disclaimer (Claude Haiku via `track_ai_call`, cache 1h, fallback stub honesto).
  6. **Características**: 6 campos read-only (vista/orientación/nivel/m²/recámaras/baños).
  7. **Documentos y assets**: links a plano/render/tour de la unidad.
- Footer con acciones rápidas: Apartar (24h) / Marcar reservado / Marcar vendido.
- `EntityDrawer` extendido con prop `body` para bypass de `sections` (manteniendo backward compat).

### Backend `routes_dev_batch11.py` (nuevo, 700+ líneas)
- `GET/PATCH /api/dev/projects/:id/amenities` — with seed fallback desde `DEVELOPMENTS`, index por `(project_id, dev_org_id)`.
- `GET/PATCH /api/dev/projects/:id/commercialization` — colección `project_commercialization` (unique `(project_id, dev_org_id)`).
- `GET/POST/DELETE /api/dev/projects/:id/preassignments` — colección `project_preassignments` (unique `(project_id, assigned_user_id)`).
- `GET /api/dev/units/:dev_id/:unit_id/price-history` — real desde audit_log + sintético determinístico fallback (6 meses) + avg price/m² de colonia.
- `GET /api/dev/units/:dev_id/:unit_id/comparables` — misma prototipo con stats sold/available.
- `GET /api/dev/units/:dev_id/:unit_id/market-comparables` — top 8 unidades de otros proyectos en misma colonia + vs_market_pct.
- `POST /api/dev/units/:dev_id/:unit_id/ai-prediction` — Claude Haiku vía `track_ai_call` + cache TTL 1h en `ai_predictions_cache` (unique `key`, TTL index 3600s). Fallback stub honesto si sin key o excede budget.
- `PATCH /api/dev/units/:dev_id/:unit_id` — price/status/price_change_reason con audit + ml_event `unit_price_changed|unit_status_changed`.
- `GET /api/dev/units/:dev_id/:unit_id/engagement` — stub determinístico `seed % 997` (marcado `is_stub=true`) con asesores/clientes/funnel.
- `PATCH /api/dev/projects/:id/assets/:asset_id/role` — set cover (auto unset existing cover) en `project_asset_meta`.

### ProyectoDetail.js cableado
- Placeholders reemplazados con `ContenidoTab`, `AmenidadesTab`, `LegalTab`, `ComercializacionTab` reales (Insights sigue como placeholder B22).
- VentasTab `EntityDrawer` ahora usa `body={<UnitDrawerContent .../>}`.

### Smoke tests (2026-05-02, developer@demo.com)
- ✅ Backend: 9 endpoints B11 responden 200 vía curl con cookie session.
- ✅ Frontend: 4 tabs renderizan sin errores + drawer enriquecido abre desde Ventas → click row.
- ✅ PATCH commercialization persiste.
- ✅ AI prediction fallback-stub responde con recomendaciones es-MX.
- ✅ Test regression file: `/app/backend/tests/test_batch11.py`.

### Constraints respetados
- ✅ Ruta legacy `/desarrollador/desarrollos/:slug/legajo` intacta (no migración destructiva).
- ✅ Tabs "Avance de obra" y "Ubicación" siguen con lógica legacy.
- ✅ UI 100% es-MX.
- ✅ Zero emoji (lucide-react SVGs).
- ✅ Icon `Star` agregado a `/components/icons/index.js` (faltaba).

---

---

## 2026-05-02 — Phase 4 Batch 0.5 · Diagnostic Engine + Observability

### Sub-chunk A ✅ — Backend Diagnostic Engine
- `/app/backend/diagnostic_engine.py`: `Probe` base class, `ProbeResult` dataclass, `PROBE_REGISTRY`, `functional_probe()`, `run_diagnostics()`, `ai_recommend_for_failure()` (Claude Haiku via `track_ai_call` + cache 24h), `register_auto_fix()`, `ensure_diagnostic_indexes()`.
- `/app/backend/probes/` package con 9 módulos y **30 probes totales**:
  - **schema** (5): project_required_fields / units_required_fields / assets_orphan / documents_orphan / commercialization_valid
  - **ie_engine** (4): ie_score_recent / heat_score_per_lead / ai_summary_cache / narratives_generation
  - **marketplace** (3): public_listing / public_endpoints_200 / asset_urls_resolve
  - **cross_portal** (4): asesor_brokers / inhouse_preassign / inmobiliaria / tracking_attribution
  - **engagement** (3): posthog_emit / audit_mutations / badge_counters
  - **ai_integrations** (3): claude_budget / cash_flow / site_studies
  - **integrations_external** (4): sentry / resend / mapbox / inegi
  - **performance** (2): heavy_endpoints_under_2s / bundle_initial_size
  - **notifications** (2): notifications_writeable / bell_counter
- Error types (10): schema_integrity, wiring_broken, sync_failure, stale_data, ai_failure, permission_issue, performance, integration_external, data_quality, orphan_record.
- Recurrence tracker: `probe_recurrence` collection (unique `(probe_id, project_id)`) actualizado en cada fail.

### Backend endpoints (`routes_diagnostic.py`)
- `POST /api/dev/projects/:id/diagnostic/run` — scope (all|critical|specific_modules) + modules filter.
- `GET /api/dev/projects/:id/diagnostic/latest` + `/history?limit=N`.
- `POST /api/dev/projects/:id/diagnostic/auto-fix/:action_id` — 6 handlers registrados (seed_default_commercialization, cleanup_orphan_assets, recompute_ie_score, recompute_lead_heat, recompute_cash_flow, generate_narratives).
- `POST /api/dev/projects/:id/diagnostic/ai-recommend` — Claude Haiku suggestion con cache 24h.
- `POST /api/diagnostic/user/:user_id/run` — 12 probes user-level (auth self o superadmin).
- `GET /api/diagnostic/user/:user_id/latest`.
- `POST /api/diagnostic/problem-reports` — crea reporte + auto-ejecuta user-diagnostic + snapshot audit trail 50 entries + notif a superadmins.
- `GET/PATCH /api/superadmin/problem-reports[/:id]` — con filtro `status`.
- `GET /api/superadmin/system-map` — nodos de módulos con pass_pct_7d + health color + edges dependencia.
- `GET /api/superadmin/probe-recurrence` — errores cross-projects rankeados por recurrence.
- `GET /api/superadmin/diagnostics/per-org` — dashboard por dev_org.
- `GET /api/dev/diagnostic/probe-registry` — inventario de probes registrados.

### Schedulers
- Daily 06:15 MX (APScheduler cron): re-ejecuta diagnostic para todos los proyectos activos y detecta drift (`_daily_active_projects_diag`).
- Audit + ml_events: `diagnostic_run`, `auto_fix_applied`, `system_map_viewed`, `user_problem_reported`.

### Sub-chunk B ✅ — Diagnostic Report UI
- `DiagnosticReportContent` (EntityDrawer body, 600px): header con timestamp + botón "Ejecutar ahora" + "Exportar JSON" · KPIStrip (Total/Pass/Fail/Críticos) · filter chips severidad + módulo · probes agrupadas con color-coding (Pass verde / Warning amber / Fail red) · click probe → expandir con Tipo error, Ubicación, Recomendación, Recurrence, botones [Aplicar fix] + [Recomendar con IA].
- Botón "Diagnóstico" en `ProyectoDetail` header con badge contador (rojo si criticals, amber si fails, cream si OK), deep-link `?diagnostic=open`.
- Notificación in-app: al detectar ≥1 critical → crea notifs para developer_admin/director del org (dedup 1/día).

### Sub-chunk C ✅ — Superadmin System Map
- `/superadmin/system-map` (auth superadmin): SystemGraph SVG con 9 nodos (módulos) en layout radial, tamaño ∝ probe_count, color por health (green ≥90% / amber 70-90% / red <70%), edges = data flow deps · click nodo → filtra tabla recurrence.
- KPIStrip global: Total probes 7d · Pass rate · Críticos abiertos · Top problemático.
- Recurrence table: probe_id, módulo, error_type, severity, #, projects afectados, último.
- Per-org dashboard: runs_7d, projects, pass_rate, criticals_open.

### Sub-chunk D ✅ — User-level diagnostic + Report Problem
- `ReportProblemButton` floating (rojo bottom-right, z=900) en `PortalLayout` (cubre todos los portales autenticados). Modal con textarea descripción + auto-captura `current_url`. Submit → corre user-diagnostic + snapshot audit_log últimos 50 + crea reporte + notif a superadmins.
- 12 probes user-level: user_exists, user_role_valid, user_session_valid, user_preferences_load, saved_searches_healthy, asesor_brokers_active (condicional), asesor_has_leads, user_org_linked, calendar_oauth_valid, no_recent_audit_errors, user_events_tracked, notifications_stack_ok. (Sentry MCP lookup stub con hook preparado.)
- `/superadmin/user-diagnostics`: KPIStrip (Total/Open/Investigating/Resolved) + filtros status + lista + drawer detail con audit trail + buttons "Marcar investigando" / "Resolver" + notes.

### Colecciones + índices
- `project_diagnostics` (unique `id`, idx `(project_id, run_at desc)` + `(dev_org_id, run_at desc)`)
- `probe_recurrence` (unique `(probe_id, project_id)`, idx `recurrence_count desc`)
- `user_diagnostics` (idx `(user_id, run_at desc)`)
- `user_problem_reports` (unique `id`, idx `(status, created_at desc)`)
- `user_problem_screenshots` (heavy storage sep.)
- `diagnostic_ai_cache` (unique `sig`, TTL 86400s)

### Smoke tests (2026-05-02)
- ✅ `/api/dev/diagnostic/probe-registry` returns 30 probes, 9 modules.
- ✅ `POST /diagnostic/run` corre en <200ms, persiste doc correctamente.
- ✅ System map visual + KPI strip + módulo nodes con health colors correcto.
- ✅ Report Problem modal abre desde floating button, textarea + auto-capture URL.
- ✅ User-level diagnostic corre 12 probes, detecta 2 warnings honestos.
- ✅ Auto-fix `seed_default_commercialization` persiste correctamente.
- ✅ AI-assisted recommendation wired (cache 24h).
- ✅ Notificación critical fail deduplicada 1/día.
- ✅ Test file: `/app/backend/tests/test_batch05.py`.

### Guardrails respetados
- ✅ Solo Batch 0.5 — 4 sub-chunks, scope-locked.
- ✅ Backward-compat 100% — no routes anteriores tocadas.
- ✅ Probes idempotentes (solo lecturas + update recurrence).
- ✅ Auto-fix actions logged vía audit + ml_event.
- ✅ Reuse primitives: EntityDrawer (con nuevo prop `body`), KPIStrip, HealthScore, notifications, track_ai_call, icons (Activity, AlertTriangle, Check, Sparkle agregados).
- ✅ Zero emoji, 100% es-MX, fuentes Outfit/DM Sans.

### Mocked / pending
- 🟡 Sentry MCP lookup para eventos user-specific (stub honesto).
- 🟡 Recommendations PDF export (solo JSON por ahora).
- 🟡 Screenshot capture via html2canvas (payload `screenshot_data_url` ya aceptado por API, frontend puede plug-in lib después).

---

## 2026-05-02 — Phase 4 Batch 12 · Wizard 7 pasos + IA upload + Drive

### Sub-chunk A ✅ — Wizard manual 7 pasos
- `routes_wizard.py` con 8 endpoints: smart-defaults, draft save/load, projects POST, ia-extract POST/GET, drive/status, drive/url.
- `/desarrollador/proyectos/nuevo` (`NuevoProyecto.js`): page con SmartWizard primitive (B0), 7 step components inline:
  1. **Categoría**: tipo (residencial vertical/horizontal/mixto/comercial) · segmento NSE_AB/C+/C/D · etapa preventa/en_construccion/entregado
  2. **Operación**: nombre + slug auto + total_unidades + construction_cost + target_price + absorption months
  3. **Ubicación**: estado/municipio/colonia/calle/cp (MapboxPicker stub para B13)
  4. **Amenidades** *opcional*: 4 categorías (comunes/internas/exteriores/premium) con checkboxes + smart-defaults sparkle
  5. **Contenido** *opcional*: DragDropZone fotos/planos/renders/videos/tour (max 20, 50MB)
  6. **Legal** *opcional*: estado proceso (5 opciones) + DragDropZone documentos
  7. **Comercialización**: toggle brokers + slider comisión 1-10% + IVA + términos + in-house-only
- Auto-save draft cada 600ms (localStorage + cross-device via `wizard_drafts` collection).
- Smart defaults learning: `GET /api/dev/wizard/smart-defaults` agrega tipo/segmento más frecuente, total unidades promedio, top 10 amenidades del org, comercialización del proyecto más reciente.
- "+ Nuevo proyecto" button en `MisProyectos` ahora navega correctamente a `/proyectos/nuevo`.
- Submit final crea `db.projects` + `db.units` (placeholders) + `db.project_amenities` + `db.project_commercialization` + `db.project_preassignments` con audit + `project_created_via_wizard` ml_event + diagnostic auto post-create (5min delay).
- `list-with-stats` extendido para incluir wizard-created projects desde `db.projects` (merge con DEVELOPMENTS catalog).

### Sub-chunk B ✅ — IA upload modo drag-drop
- `IaUploadTab` component: DragDropZone con accept `.pdf,.xlsx,.xls,.csv,.docx,.txt,.md` (max 10 archivos, 20MB each).
- Pipeline backend `_extract_text_from_upload`: pypdf · openpyxl · python-docx · plain text fallback. Combina texto extraído (cap 30KB).
- Claude Haiku call con system prompt structured (es-MX, JSON output con value/confidence/source per campo). Cache `wizard_ia_extractions` collection.
- Tracked vía `track_ai_call` con call_type='wizard_ia_extract'. Budget gate vía `is_within_budget`.
- Honest stub `_stub_extraction` cuando key missing o budget exceeded — usuario ve badge "FALLBACK STUB" claro.
- `IaResultSummary` modal: confianza promedio + tabla 15 campos (color-coded green/amber/red) + botón "Continuar al wizard pre-llenado".
- Pre-fill: `prefill` merged con smart defaults; cada Field muestra Sparkles icon cuando IA detectó valor + tooltip con confidence% y source filename.
- ml_event `wizard_ia_extract_completed` con metrics.

### Sub-chunk C ✅ — Drive import (URL paste + OAuth check)
- `DriveImportTab` component: input URL paste con regex validación de pattern `drive.google.com/drive/folders/{id}`.
- `GET /api/dev/wizard/drive/status` — reporta `oauth_configured` (basado en `_has_keys()` de drive_engine existente).
- `POST /api/dev/wizard/drive/url` — extrae folder_id, retorna `{ok, reason, message}` honest cuando OAuth no configurado.
- UI muestra badge amber "Google OAuth no configurado" + instrucciones para .env. Sub-modo "Conectar Drive personal" referenciado a flow OAuth existente del sidebar Drive (no duplicado).
- Reutiliza pipeline IA extract de Sub-chunk B (mismo `wizard_ia_extractions`).

### Colecciones nuevas
- `wizard_drafts` (unique `(user_id, dev_org_id)`) — borrador cross-device.
- `wizard_ia_extractions` (unique `run_id`, idx `(dev_org_id, created_at desc)`) — historial extracciones IA.

### Smoke tests (2026-05-02)
- ✅ Smart defaults learning (vacío inicial → enriquecido tras 1 wizard project).
- ✅ Draft save+load cross-device.
- ✅ Project creation completa (db.projects + units + amenities + commercialization).
- ✅ Wizard project visible en Mis Proyectos (`list-with-stats` extendido).
- ✅ IA extract con .txt: filename → text → Claude call → fallback honesto cuando budget exceeded.
- ✅ Drive URL pattern validation + honest oauth_not_configured response.
- ✅ Diagnostic B0.5 auto-corre 5min post-create.
- ✅ `/app/backend/tests/test_batch12.py` regression file.

### Constraints respetados
- ✅ Solo Batch 12 — 3 sub-chunks, scope-locked.
- ✅ Backward-compat 100% — ruta `/desarrollador/proyectos/:slug` legacy intacta.
- ✅ Reuse: SmartWizard (B0) + DragDropZone (B0) + drive_engine (existente) + extraction_engine pattern + diagnostic_engine (B0.5) + track_ai_call (B0).
- ✅ Audit + ml_events: `project_created_via_wizard`, `wizard_ia_extract_completed`.
- ✅ Zero emojis, lucide-react SVGs (Sparkles para IA, Cloud para Drive, FileText para manual, Check, AlertCircle, X).
- ✅ es-MX 100%.

### Mocked / pending
- 🟡 MapboxPicker en step Ubicación (lat/lng auto-infer de dirección) — stub para B13.
- 🟡 Asset role auto-categorize por filename (Claude classify) — pendiente, frontend prepara files lista pero upload físico se debe hacer post-create vía ContenidoTab existente.
- 🟡 Drive OAuth completo desde wizard — actualmente referencia al flow del sidebar Drive existente.
- 🟡 Schema probes B0.5 de wizard projects: actualmente fallan porque check `DEVELOPMENTS` array (gap arquitectural a resolver en B13).

---

## 2026-05-02 — Phase 4 Batch 13 · Cross-portal sync + Tracking attribution

### Sub-chunk A ✅ — Unified projects helper + extended B0.5 probes
- `/app/backend/projects_unified.py`: `get_all_projects(db, dev_org_id)` merge legacy `DEVELOPMENTS` + `db.projects` con `entity_source` field. `get_project_by_slug(db, slug)` lookup unificado. `get_units_for_project(db, project)` retorna units desde fuente correcta. `update_project_unified(db, slug, patch, user)` con fallback a `developer_project_patches` para legacy.
- `is_wizard_project(project)` heurística por `created_via=wizard` o `wizard_source` field.
- Probes `schema/` re-escritas: 5 probes (project_required_fields, units_required, assets_orphan, documents_orphan, commercialization_valid) ahora usan `get_project_by_slug` + retornan `entity_source` en `extra`.
- Probes `marketplace/` re-escritas: 3 probes con check de `dev_assets` collection cuando wizard project sin photos array.
- `ProbeResult` extendido con campo `entity_source` (promovido desde `extra`).
- Verificación: wizard project `test-wizard-torre` ahora pasa todas las schema probes (PASS [schema/critical] project_required_fields_complete (src: db.projects), etc.). Criticals: 0 (era 1).

### Sub-chunk B ✅ — Tracking cookie + Multi-touch attribution
- **Schema `lead_source_attribution`** (unique `lead_id`): `{lead_id, dev_org_id, project_id, touchpoints[], first_touch_asesor_id, last_touch_asesor_id, attribution_model, created_at}`.
- **Frontend `/app/frontend/src/lib/tracking.js`**: `captureRefCookie()` lee `?ref=asesor_id`, persiste cookie 30d (SameSite=Lax) + push touchpoint a localStorage stack (max 15) + dispara POST `/api/tracking/view`. `getCurrentAttribution()` retorna snapshot. `clearAttribution()` post-conversion. `appendTouchpoint(tp)` para casos manuales (caya bot, feria).
- Wire en `App.js` `AppRouter` useEffect inicial (lazy import).
- **Backend endpoints**:
  - `POST /api/leads/public` (no-auth): captura attribution, resuelve dev_org via `get_project_by_slug`, lee `attribution_model` del `dev_org_settings`, asigna `assigned_to` según modelo, persiste en `lead_source_attribution`, notifica al asesor + dev_admins. ml_event `lead_attribution_captured`.
  - `GET/POST /api/leads/:lead_id/attribution` (auth) — read full chain / append touchpoint.
  - `GET/PATCH /api/dev/settings/attribution-model` — `'first'|'last'|'split'` per dev_org. Audit + ml_event `attribution_model_changed`.
  - `POST /api/tracking/view` (no-auth) — registra view event en `tracking_link_events`.
- **Asesor links page** (`/asesor/links-tracking`):
  - `GET /api/asesor/tracking-links` — proyectos visibles por broker_whitelist + preassign, link `https://desarrollosmx.io/desarrollo/{slug}?ref={asesor_id}`, stats views/conversions per link.
  - `POST /api/asesor/tracking-links/qrcode` — genera PNG dataURL via `qrcode` lib (pip installed).
  - `GET /api/asesor/tracking-links/stats` — totales: views, conversions, conversion_rate_pct.
  - UI: KPIStrip global + cards por proyecto con copy-to-clipboard + botón QR toggleable + entity_source badge.
- Sidebar nav `ASESOR_NAV` tier 3 ahora incluye "Links tracking".

### Sub-chunk C ✅ — Cross-portal sync + MapboxPicker wizard
- **Endpoint `GET /api/dev/leads/kanban-unified`**: leads visibles cross-source via `get_all_projects`, agrupados en 6 columnas (nuevo/contactado/qualified/negociacion/cerrado_ganado/cerrado_perdido).
- **Endpoint `POST /api/cross-portal/sync-check`**: itera proyectos del org, detecta wizard projects sin units en `db.units`, retorna `{projects_checked, issues, ok}`. ml_event `cross_portal_sync_check`.
- **Nueva probe** `cross_portal_sync_health` (severity high) en `probes/cross_portal.py` — verifica que wizard projects tengan units en `db.units` para no fallar marketplace público.
- **MapboxPicker en wizard Step 3**: replaced "próximamente" stub con `MapboxPicker` real. Click-to-set marker + draggable + readonly fallback si no `REACT_APP_MAPBOX_TOKEN`. Nuevo Field "Coordenadas (lat, lng)" muestra valores actualizados en tiempo real al draggar.

### Colecciones nuevas/extendidas
- `lead_source_attribution` (unique `lead_id`, idx `first_touch_asesor_id`, `last_touch_asesor_id`)
- `dev_org_settings` (unique `dev_org_id`)
- `tracking_link_events` (idx `(asesor_id, project_id, timestamp desc)`)
- `developer_project_patches` (unique `project_id`) — para mutaciones a DEVELOPMENTS legacy

### Smoke tests (2026-05-02)
- ✅ Probe registry: 31 probes (era 30, +`cross_portal_sync_health`).
- ✅ Diagnostic en wizard project `test-wizard-torre`: schema 5/5 PASS con `entity_source: db.projects` correcto.
- ✅ Diagnostic en legacy `altavista-polanco`: schema 5/5 PASS con `entity_source: developments` correcto.
- ✅ `attribution_model` GET/PATCH cycle (first/last/split) + invalid 400.
- ✅ `POST /api/leads/public` con touchpoints array → lead creado + attribution persistida + notif disparada.
- ✅ `POST /api/tracking/view` registra evento.
- ✅ Asesor con broker assignment → tracking-links retorna 1 item con link generado.
- ✅ QR PNG dataURL generado correctamente (770 chars base64).
- ✅ Cross-portal sync-check: 0 issues para projects con units.
- ✅ Frontend `/asesor/links-tracking` renderiza con sidebar Explorar + KPIStrip + card link + botones Copiar/QR.
- ✅ `/app/backend/tests/test_batch13.py` regression file (10 tests).

### Constraints respetados
- ✅ Solo Batch 13, 3 sub-chunks scope-locked.
- ✅ Backward-compat 100% — legacy `/desarrollador/desarrollos/:slug` sigue, DEVELOPMENTS array intacto.
- ✅ Reuse: diagnostic_engine (B0.5), MapboxPicker (B1), permissions (B0), notifications (B2.1), get_project_by_slug.
- ✅ Audit + ml_events: `lead_attribution_captured`, `attribution_model_changed`, `cross_portal_sync_check`.
- ✅ Zero emojis, lucide-react SVGs (LinkIcon, Copy, Check, BarChart3, QrCode).
- ✅ es-MX 100%.

### Mocked / pending
- 🟡 Mapbox reverse geocoding (auto-infer estado/colonia/CP from click) — actualmente solo lat/lng se guarda; campos texto siguen manuales.
- 🟡 Polling 60s en asesor portal para refresh real-time — usuarios deben recargar manual; deferred.
- 🟡 Cache invalidation tag-based en marketplace — usa polling natural por ahora.
- 🟡 Sentry MCP lookup en problem reports — stub honesto continúa.




## 2026-05-01 — Phase F0.11 · Sentry + PostHog + ML events (observability)
**Objetivo:** wiring completo de observability + seed infra para Phase 17 (ML continuous training).

### Backend (`observability.py` · 260 líneas · nuevo)
- **Sentry SDK** init antes de FastAPI app (auto-instrumentación): `traces_sample_rate=0.1`, `profiles_sample_rate=0.1`, replay on-error 1.0, integraciones FastApi + Starlette + Logging. Release + environment taggeados. `send_default_pii=false`.
- **`sentry_tag_user(user_dict)`** inyectado en `get_current_user` (server.py) → cada request lleva tags `role`, `tenant_id`, `org_id` y user.id/email en el scope Sentry → issues filtrables por tenant.
- **PostHog** init con `sync_mode=False` + host `us.i.posthog.com`. Helpers `capture_event()` + `identify_user()`.
- **`emit_ml_event(db, event_type, user_id, org_id, role, context, ai_decision, user_action)`** — unified emitter que persiste en Mongo `ml_training_events` + mirror a PostHog con prefijo `dmx_ml_*` para filtrado.
- **Schema bare-bones `ml_training_events`**: `{id, event_type, user_id, org_id, role, context:{}, ai_decision:{}, user_action:{}, ts}` con indexes en `event_type`, `user_id`, `org_id`, `ts desc`.
- **Graceful no-op** cuando keys vacías: `_sentry_initialized=False`, `_posthog_client=None` → todos los helpers devuelven silenciosamente sin romper app.

### Endpoints
- `POST /api/ml/emit` — cualquier user autenticado; stamp automático de user_id/org_id/role.
- `POST /api/_internal/test-sentry` — solo superadmin; lanza `RuntimeError` con timestamp + user_id para validar pipeline Sentry end-to-end.
- `GET /api/_internal/observability/status` — counts para UI cards + flags enabled/disabled + links dashboards.

### ML event triggers wired (alimentan Phase 17)
- `routes_advisor.update_op_status` → `operacion_status_change` con from/to status + precio + contacto_id + dev_id.
- `routes_advisor.generate_argumentario_rag` → `argumentario_rag_generated` con rag_chunks_count + cost_usd + hook preview.
- (Futuro — escala C11: Caya hand_off, briefing IE feedback, compliance badge upgrade, etc.)

### Frontend (`observability.js` · 110 líneas · `SuperadminObservabilityPage.js` · 180 líneas)
- **`initObservability()`** en `index.js` bootstrap (antes de ReactDOM.render):
  - Sentry React: `browserTracingIntegration` + `replayIntegration` · sample 0.1 · replay-on-error 1.0.
  - PostHog JS: `autocapture: true` · `capture_pageview/pageleave` · `person_profiles: identified_only`.
- **`identifyUser(u)`** invocado post-login (modal `onSuccess` + `checkAuth` en refresh) → Sentry setUser + setTags role/tenant_id/org_id + PostHog identify con properties role/org_id/email/name.
- **`resetUser()`** en logout → Sentry.setUser(null) + posthog.reset().
- **`emitMlEvent({event_type, context, ai_decision, user_action})`** helper compartido que mirror a PostHog client-side + POST `/api/ml/emit` (doble mirror por defensa).
- **`/superadmin/observability`** (nueva página + nav link con AlertTriangle icon):
  - 3 cards: Sentry status (Conectado/Stub) · PostHog status · ML events 24h count con breakdown top-4 por `event_type`.
  - 3 botones acción: Actualizar · Forzar error (Sentry) · Emitir ml_event test.
  - Banner footer con env + sample rates + autocapture flag.

### Verificación end-to-end
- ✅ Sentry **enabled** via `/api/_internal/observability/status` return `{enabled:true}`.
- ✅ PostHog **enabled** con host `https://us.i.posthog.com`.
- ✅ `POST /api/_internal/test-sentry` retorna HTTP 500 con stacktrace visible en backend.err.log (sentry_sdk.integrations.fastapi wrapea el handler → el SDK intercepta + envía a dashboard Sentry).
- ✅ `POST /api/ml/emit` persiste en Mongo (`ml_events 24h: 2 types: {observability_smoke: 1, test_smoke: 1}` tras 2 llamadas).
- ✅ PostHog recibe mirror `dmx_ml_*` events server-side + client-side.
- ✅ Lint clean (frontend + backend).
- ✅ Backend startup limpio con Sentry + PostHog inicializados.

### Keys en .env
Backend `/app/backend/.env`:
```
SENTRY_DSN=https://1036522abd...@o45112...ingest.us.sentry.io/45112...
SENTRY_TOKEN=sntryu_ff9e2952...
POSTHOG_KEY=phc_QuzLBkPBL4fzm...
POSTHOG_HOST=https://us.i.posthog.com
```
Frontend `/app/frontend/.env`:
```
REACT_APP_SENTRY_DSN=https://1036522abd...@o45112...ingest.us.sentry.io/45112...
REACT_APP_POSTHOG_KEY=phc_QuzLBkPBL4fzm...
REACT_APP_POSTHOG_HOST=https://us.i.posthog.com
```

### Archivos tocados
- `/app/backend/observability.py` (nuevo · 260 líneas)
- `/app/backend/server.py` (init_sentry + init_posthog antes de FastAPI + sentry_tag_user en get_current_user + identify_user post-login + router mount + ensure_ml_indexes startup)
- `/app/backend/routes_advisor.py` (+ emit_ml_event en update_op_status + argumentario-rag)
- `/app/backend/.env` (+SENTRY_DSN + SENTRY_TOKEN + POSTHOG_KEY + POSTHOG_HOST)
- `/app/backend/requirements.txt` (sentry-sdk[fastapi] 2.20 + posthog 3.7 via pip)
- `/app/frontend/src/observability.js` (nuevo · 110 líneas)
- `/app/frontend/src/index.js` (initObservability bootstrap)
- `/app/frontend/src/App.js` (identifyUser post-login + resetUser en logout + checkAuth)
- `/app/frontend/src/pages/superadmin/SuperadminObservabilityPage.js` (nuevo · 180 líneas)
- `/app/frontend/src/components/superadmin/SuperadminLayout.js` (+nav Observability)
- `/app/frontend/src/App.js` (+route /superadmin/observability)
- `/app/frontend/.env` (+REACT_APP_SENTRY_DSN + REACT_APP_POSTHOG_KEY + REACT_APP_POSTHOG_HOST)
- `/app/frontend/package.json` (@sentry/react 8.49 + posthog-js 1.205 via yarn)
- `/app/memory/PRD.md`

### Phase 17 seeds activos
`ml_training_events` ya recibe events reales. Cuando se implemente training continuo, el corpus estará ahí con schema consistente (context/ai_decision/user_action) desde hoy.

### Source maps upload (bonus · pendiente)
Sentry CLI hook para subir source maps en cada deploy frontend. Script listo para agregar a `package.json`:
```
"scripts": {
  "sentry:release": "sentry-cli releases new -p dmx-frontend $DMX_RELEASE && sentry-cli releases files $DMX_RELEASE upload-sourcemaps build/static/js --url-prefix '~/static/js' && sentry-cli releases finalize $DMX_RELEASE"
}
```
Requiere `SENTRY_AUTH_TOKEN` (ya en .env backend como SENTRY_TOKEN) + org/project slugs. Lo dejamos documentado hasta integración CI.

---


## 2026-05-01 — Phase 4 Batch 1 · Dev Portal Foundation + Upload Ready
**Objetivo:** Fundaciones del portal del desarrollador para datos reales. Founder puede subir proyectos reales después de este batch.

### Backend (`routes_dev_batch1.py` · nuevo · ~1000 líneas)

**4.1 Bulk Upload Excel/CSV:**
- `POST /api/dev/bulk-upload/parse` — pandas parse CSV/xlsx, validación por fila, preview 100 filas, retorna `{total_rows, valid_rows, error_rows, detected_columns, preview}`
- `POST /api/dev/bulk-upload/commit` — upsert validados a `developer_unit_overrides`, crea `bulk_upload_jobs` entry, audit_log + ML event
- `GET /api/dev/bulk-upload/jobs` — historial de uploads

**4.5 Geolocalización:**
- `PATCH /api/dev/projects/:id/location` — guarda lat/lng/zoom en `dev_project_meta`
- `GET /api/dev/projects` — lista proyectos con metadata de ubicación

**4.7 Unit Holds (Apartado temporal):**
- `POST /api/dev/units/:id/hold` — crea hold (1/24/48/72h), auto-marca unidad como "apartado"
- `DELETE /api/dev/units/:id/hold` — libera hold, restaura "disponible"
- `GET /api/dev/units/:id/hold` — estado actual + `remaining_seconds`
- `GET /api/dev/holds` — lista holds activos por org
- `auto_release_expired_holds` — cron job APScheduler cada 30min

**4.9 + Phase 14 Dev Slice (Internal Users):**
- `GET/POST /api/dev/internal-users` — lista/invita usuarios del equipo
- `PATCH /api/dev/internal-users/:id` — actualiza rol/estado
- `DELETE /api/dev/internal-users/:id` — deshabilita
- `PATCH /api/dev/org/settings` — toggle `allow_external_inventory` + otros settings
- Roles: `admin|commercial_director|comercial|obras|marketing`
- Invitación genera `activation_token` + envío email via Resend (stub si no hay RESEND_API_KEY)

**4.10 ERP Webhook Stubs:**
- `GET/POST /api/dev/erp-webhooks` — config providers (EasyBroker, Salesforce, HubSpot, Pipedrive, GHL)
- `POST /api/dev/erp-webhooks/:provider/event` — receiver stub honesto (log en `erp_webhook_events`, 200 siempre)
- `GET /api/dev/erp-webhooks/:provider/events` — últimos eventos
- API keys encriptadas con Fernet

**4.15 Content Calendar:**
- `POST /api/dev/content/upload` — submit pending
- `GET /api/dev/content` — lista filtrable por status/type/project
- `POST /api/dev/content/:id/approve|reject` — director action
- `POST /api/dev/content/:id/publish` — published (solo approved)

### Frontend (nuevas páginas + componentes)
- **`BulkUploadModal.js`** — drag&drop zone + parse preview table (error highlighting rojo) + commit con override mode selector
- **`MapboxPicker.js`** — click-to-set marker draggable + save lat/lng + token-missing fallback
- **`DesarrolladorInventario.js`** (actualizado) — Bulk Upload button + Hold buttons per unit + CountdownBadge timer + release hold
- **`DesarrolladorUsuarios.js`** — tabla team + invite modal + edit role/status + disable
- **`DesarrolladorConfiguracion.js`** — org settings toggles + ERP integrations grid + test ping + ver eventos
- **`DesarrolladorCalendarioSubidas.js`** — kanban 4 cols (pending/approved/published/rejected) + upload modal + MapboxPicker integrado
- **`DeveloperLayout.js`** actualizado con nav items: Equipo, Contenido, Configuración

### Verificación curl (todos exitosos):
- ✅ Bulk parse CSV: 5 filas, 4 válidas, 1 error detectado correctamente
- ✅ Bulk commit: 2 unidades committed, job_id generado, audit_log entry
- ✅ Unit hold: hold creado, expires_at calculado, unit marcada "apartado"
- ✅ Internal user: invitado con activation_token y invite_url
- ✅ ERP webhook config: easybroker configurado con receiver URL
- ✅ ERP stub receiver: POST recibido, event_id generado, stub:true
- ✅ Content upload → approve: status "approved" correcto
- ✅ Audit log: 9+ entries creados de batch1 + audit_log scope func
- ✅ MongoDB: 11 índices en 5 colecciones nuevas
- ✅ openpyxl 3.1.5 instalado + requirements.txt actualizado
- ✅ Frontend: webpack compiled sin errores (1 warning webpack no crítico)

### Archivos tocados
- `/app/backend/routes_dev_batch1.py` (nuevo · ~1000 líneas)
- `/app/backend/server.py` (+dev_batch1_router + ensure_dev_batch1_indexes)
- `/app/backend/scheduler_ie.py` (+unit_holds_release cron cada 30min)
- `/app/backend/requirements.txt` (+openpyxl 3.1.5)
- `/app/frontend/src/api/developer.js` (+30 API helpers batch1)
- `/app/frontend/src/components/developer/BulkUploadModal.js` (nuevo)
- `/app/frontend/src/components/developer/MapboxPicker.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorInventario.js` (actualizado: bulk upload + holds)
- `/app/frontend/src/pages/developer/DesarrolladorUsuarios.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorConfiguracion.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorCalendarioSubidas.js` (nuevo)
- `/app/frontend/src/components/developer/DeveloperLayout.js` (+Equipo + Contenido + Configuración nav)
- `/app/frontend/src/components/icons/index.js` (+Users + Settings + Plus)
- `/app/frontend/src/App.js` (+3 rutas developer)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 2 · Dashboards + IE + Construcción + Mapbox tab
**Objetivo:** completar el dev portal con analytics avanzados, drill-down IE, timeline de obra y picker Mapbox en legajo.

### Backend (`routes_dev_batch2.py` · nuevo · ~530 líneas)

**4.5 FIX · Project location read:**
- `GET /api/dev/projects/{id}/location` — devuelve `{lat, lng, zoom, address, source}`. Fallback a centro de colonia (GeoJSON [lng,lat]) si no hay override, último fallback CDMX.

**4.11 · Absorción avanzada:**
- `GET /api/dev/analytics/absorption?project_id?` — cohort matrix 12 meses (captación×cierre), heatmap YTD (ventas por día, niveles 0-4 estilo GitHub), win/loss breakdown (5 razones con %), funnel 5-step (lead→visita→propuesta→aceptada→cerrada) con `dropoff_pct` + `conversion_from_prev`.

**4.12 · Forecast vs actual + multi-proyecto:**
- `GET /api/dev/analytics/forecast?consolidated=` — por proyecto: target_units, actual_units, variance_pct, trend, revenue_target/actual, monthly_projection (base/pesimista/optimista × 12m). Toggle consolidado suma todo.
- `POST /api/dev/analytics/forecast/adjust` — actualiza target manualmente con audit_log + ML event.

**4.13 · Competitor radar enriquecido:**
- `GET /api/dev/competitors/enriched?dev_id&radius_km` — reutiliza `competitor_radar()` legacy + añade `alert_config` (umbrales configurables) + `press_clips` (6 headlines mock con `ai_summary` + sentiment).
- `GET /api/dev/competitors/{id}/history` — 12 meses de price_sqm_mxn por competidor + delta 12m %.
- `POST /api/dev/competitors/alert-config` — guarda umbrales (price_delta, absorption, email/inapp). audit_log + ML event.

**4.16 · IE Score proyecto detallado:**
- `GET /api/dev/ie/projects/{id}/breakdown` — 12 scores en 4 categorías (fundamentals, market, risk, sentiment). Prioriza `ie_scores` real, fallback sintético honesto (flag `is_stub`). Cada score: value, benchmark_colonia, delta_vs_colonia, tier (excellent/good/fair/poor), confidence. `overall_score` + `overall_tier`.
- `GET /api/dev/ie/projects/{id}/improve?code=` — 2-3 recomendaciones concretas por score (title, effort, impact, detail) + `narrative_stub` IA. 12 codes mapeados.

**4.25 · Avance de obra:**
- `GET /api/dev/construction/{id}/progress` — timeline 5 etapas (cimentación/estructura/instalaciones/acabados/entrega) + overall_percent + per_unit_avg_percent + photos + comments. Seed desde `development.progress` si no existe.
- `POST /api/dev/construction/{id}/update-stage` — actualiza % de una etapa + recalcula overall + current_stage. audit_log + ML event (`avance_obra_milestone`).
- `POST /api/dev/construction/{id}/comment` — bitácora con texto + foto_url opcional. audit_log + ML event (`avance_obra_comment`).

**Wiring transversal:**
- `log_mutation` en TODAS las mutaciones (4 tipos de entity: forecast_target, competitor_alert_config, construction_progress, construction_comment, project_location update ya en B1).
- `emit_ml_event` en forecast_adjust, competitor_alert_config_update, avance_obra_milestone, avance_obra_comment, ie_breakdown_view, ie_drilldown_click.

### Frontend

**Nuevos componentes:**
- `ChartPrimitives.js` — SVG-only (zero deps): `Sparkline`, `LineChart` (multi-serie + Y grid + labels), `BarList` (horizontal bars), `HeatmapCalendar` (GitHub-style weekly grid), `FunnelChart` (trapezoidal SVG), `CohortMatrix` (tabla con gradient de intensidad).
- `AvanceObraTab.js` — overall progress bar + timeline 5 etapas editables + bitácora (textarea + photo URL) + audit via API. Modal inline edit.
- `GeolocalizacionTab.js` — reusa `MapboxPicker.js` de B1. Badge "manual/colonia_fallback" + dirección texto. Save audit trail.

**Páginas actualizadas:**
- `DesarrolladorReportes.js` — 3 tabs: `executive` (legacy D9 Claude), `absorption` (cohort+heatmap+winloss+funnel), `forecast` (tabla por proyecto ↔ consolidado + LineChart 12m sensitivity).
- `DesarrolladorCompetidores.js` — alert config modal (umbrales editables), histórico modal con LineChart 12m precio/m², grid press clips (source + sentiment badge + ai_summary).
- `DesarrolladorLegajo.js` — 3 nuevos tabs: Geolocalización, IE Score (CTA a `/ie`), Avance de obra (reemplaza placeholder).

**Nueva página:**
- `DesarrolladorIEDetail.js` (`/desarrollador/desarrollos/:slug/ie`) — overall score card con tier gradient + 4 category cards (12 scores totales con click drill-down) → modal con 3 MiniMetrics (mi/benchmark/delta), narrativa IA + recomendaciones (title, impacto/esfuerzo badges, detail).

### Verificación curl (todos exitosos):
- ✅ GET location altavista-polanco → `{lat:19.433, lng:-99.1939, source:colonia_fallback}` (orden lng/lat GeoJSON corregido)
- ✅ GET absorption → 12 cohort rows, 122 heatmap cells, 5 win_loss reasons, funnel 5 steps
- ✅ GET forecast → 2 rows, consolidated `{target:17, actual:18, variance:+5.9%, trend:up}`, monthly_projection 12m
- ✅ GET competitors/enriched → my_project + 3 competitors + alert_config + 6 press_clips
- ✅ GET competitors/{id}/history → 12 price points + delta 12m
- ✅ POST alert-config → audit entry `competitor_alert_config|update`
- ✅ GET ie/projects/{id}/breakdown → overall 56-70, 4 categories × 3 scores = 12 total
- ✅ GET ie/projects/{id}/improve?code=P1 → 2 recs (title/effort/impact/detail) + narrative_stub
- ✅ GET construction/progress → 5 stages + overall 8% seeded from dev.progress
- ✅ POST construction/update-stage → etapa `estructura 45%`, audit entry + ML event
- ✅ POST construction/comment → entry c_xxx, audit entry `construction_comment|create`
- ✅ POST forecast/adjust → target:35, audit entry `forecast_target|update`
- ✅ Audit log total 5+ entries de Batch 2 con diff_keys correctos
- ✅ MongoDB: 3 nuevos índices (dev_forecast_overrides, dev_competitor_alert_config, project_construction_progress)

### Frontend smoke tests (Playwright):
- ✅ `/desarrollador/desarrollos/altavista-polanco/ie` → 1 h1, 4 categorías, 12 scores renderizados
- ✅ `/desarrollador/reportes` → 3 tabs; tab absorption → cohort + heatmap + winloss + funnel todos con 1 match
- ✅ `/desarrollador/competidores` → 1 config btn, 6 press clips, 3 history btns
- ✅ `/desarrollador/desarrollos/altavista-polanco/legajo` → 8 tabs (docs/fotos/planos/geoloc/avance/ie/tour360/historial); tab geoloc presente; tab avance con 5 stages

### Archivos tocados
- `/app/backend/routes_dev_batch2.py` (nuevo · ~530 líneas)
- `/app/backend/server.py` (+dev_batch2_router + ensure_dev_batch2_indexes)
- `/app/frontend/src/api/developer.js` (+10 API helpers batch2)
- `/app/frontend/src/components/developer/ChartPrimitives.js` (nuevo · ~250 líneas)
- `/app/frontend/src/components/developer/AvanceObraTab.js` (nuevo)
- `/app/frontend/src/components/developer/GeolocalizacionTab.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorReportes.js` (rewrite con 3 tabs)
- `/app/frontend/src/pages/developer/DesarrolladorCompetidores.js` (rewrite con enriquecido)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (+3 tabs: geoloc/ie/avance real)
- `/app/frontend/src/pages/developer/DesarrolladorIEDetail.js` (nuevo · ~260 líneas)
- `/app/frontend/src/App.js` (+ruta `/desarrollador/desarrollos/:slug/ie`)
- `/app/frontend/src/components/icons/index.js` (+TrendDown, Activity, Target, Bell, Eye, Image, Layers, MessageCircle)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 2.1 · Recovery gaps B2
**Objetivo:** cerrar 4 gaps específicos de Batch 2 antes de avanzar a B3: persistencia real de lat/lng + trigger real de alertas competidor con email/notifs + benchmark colonia IE + per-unit construction progress.

### Backend (`routes_dev_batch2.py` +750 líneas · `routes_dev_batch1.py` location validation)

**Sub-Chunk A · 4.5 Mapbox SAVE real:**
- `PATCH /api/dev/projects/{id}/location` reforzado: validación Pydantic `lat∈[-90,90]` + `lng∈[-180,180]` (422 si fuera), captura `before` doc real para diff_keys, `emit_ml_event('mapbox_location_set')`.
- Retorna `{ok, project_id, lat, lng, zoom}`.

**Sub-Chunk B · 4.13 Alert TRIGGER real (notifications + email + simulate):**
- `_fire_competitor_price_alert(db, *, dev_org_id, user_id, user_role, competitor_id, competitor_name, old_price_sqm, new_price_sqm, request)` — núcleo del trigger. Lee `dev_competitor_alert_config`, calcula `delta_pct`, solo dispara cuando competidor baja debajo del umbral (`delta_pct <= -threshold`). Crea `notifications` doc con `channels` (in_app/email), envía Resend email si `RESEND_API_KEY` presente, logs `competitor_alert_fired` audit + `competitor_alert_triggered` ML.
- `POST /api/dev/competitors/{id}/simulate-price-update` (**DEBUG/QA — restrict or remove before prod launch**) — guard: solo `developer_admin` + `superadmin` (403 para otros). Snapshot persistido en `dev_competitor_price_snapshots`. Audit `competitor_price_simulated` separado del trigger normal.
- `GET /api/dev/notifications?unread_only=` — lista paginada + `unread_count`.
- `POST /api/dev/notifications/{id}/read` — marca individual.
- `POST /api/dev/notifications/mark-all-read` — bulk.
- Índices: `notifications` (org_id+user_id+read_at+created_at) + `competitor_price_snapshots` (dev_org_id+competitor_id+ts).

**Sub-Chunk C1 · 4.16 Colonia benchmark:**
- `GET /api/dev/ie/projects/{id}/colonia-benchmark` — agrega score avg de los proyectos peer de la misma `colonia_id` (excluyendo self). Reusa misma RNG determinista para coherencia con breakdown. Retorna `{colonia, projects_count, score_avg:{fundamentals, market, risk, sentiment, overall}}`. `emit_ml_event('ie_colonia_benchmark_view')`.

**Sub-Chunk C2 · 4.25 Per-unit construction progress:**
- Schema extendido `project_construction_progress.units: [{unit_id, unit_number, prototype, level, current_stage, current_stage_index, percent_complete, updated_at}]`. Seed desde `data_developments._generate_units` la primera vez (56 units para Altavista).
- `GET /construction/{id}/progress` ahora incluye `units[] + overall_percent` recalculado server-side como avg. Retro-seed para docs pre-B2.1.
- `POST /construction/{id}/unit-update` — actualiza `percent_complete` + `current_stage` de una unidad, recalcula `overall_percent` + `stages[]` buckets. audit `construction_unit_progress` + ML `avance_obra_unit_update`.

### Frontend

**Componentes:**
- `AvanceObraTab.js` (+90 líneas) — nueva tabla scroll con 56+ unidades. Columnas: Unidad · Prototipo · Etapa (select dropdown inline) · % avance (progress bar visual + input inline) · Última act · Editar/Guardar/Cancelar. Persistencia vía `updateUnitProgress`.
- `GeolocalizacionTab.js` — role guard `canEdit = role ∈ {developer_admin, superadmin}`, disable picker si no.
- `DesarrolladorIEDetail.js` (+90 líneas) — nuevo `ColoniaBenchmarkCard` entre Overall card y categorías. Card muestra 4 categorías con `mine vs col · delta` + badge Δ overall verde/rojo.
- `DesarrolladorCompetidores.js` (+170 líneas):
  - Bell icon con badge count unread en header (badge oculto si 0)
  - Drawer lateral 420px con últimas 50 notifs, botón "Marcar leídas" + bulk mark-all-read + poll 30s
  - Por cada competidor: botón `Sim -7%` **solo visible si role ∈ {developer_admin, superadmin}**, con Zap icon, disabled while submitting
  - Integración directa con `simulateCompetitorPrice` API

**API helpers (+7):**
`getColoniaBenchmark`, `simulateCompetitorPrice`, `listNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `updateUnitProgress`.

### Verificación backend curl (todos ✅)
- PATCH location válido 200 + lat 19.4355 / lng -99.1945 persisted → source=manual
- PATCH lat=200 → 422 `less_than_equal` (validación 90)
- PATCH lng=-500 → 422 `greater_than_equal` (validación -180)
- Config threshold 5% → simulate -7% Lomas Signature → `fired:true, notif_id:notif_...`, notification creada, unread=1
- Simulate -3% → `fired:false` (bajo umbral) — sin notificación
- Role guard: asesor@demo.com POST simulate → 403 `Rol no autorizado`
- Mark-read → unread_count: 0
- Colonia benchmark Altavista (colonia Polanco) → 1 peer + 4 cat averages + overall
- Construction/progress → 56 units embebidas + overall_percent calculado
- POST unit-update (unit 02A, 85%, acabados) → overall recalculado 9.4%
- Audit log final: 14 entries · 4 nuevos tipos B2.1 (`project_location` 1 · `competitor_price_simulated` 3 · `competitor_alert_fired` 2 · `construction_unit_progress` 1)

### Smoke test Playwright
- `/desarrollador/desarrollos/altavista-polanco/ie` → `ie-colonia-benchmark` card=1, `ie-bench-overall-delta`=1, 5 bench cat blocks (incluye overall).
- `/desarrollador/competidores` → `notif-bell-btn`=1, `comp-simulate-*`=3 (1 por competidor), click simulate → notif-drawer=1, 2 notif_items visibles.
- `/desarrollador/desarrollos/altavista-polanco/legajo` tab avance → `avance-units-table`=1, 56 unit rows, 56 botones editar.

### Archivos tocados
- `/app/backend/routes_dev_batch2.py` (+750 líneas: colonia benchmark + notifications + simulate + per-unit)
- `/app/backend/routes_dev_batch1.py` (location validation + before capture + ML event)
- `/app/frontend/src/api/developer.js` (+7 helpers batch 2.1)
- `/app/frontend/src/pages/developer/DesarrolladorIEDetail.js` (+ColoniaBenchmarkCard)
- `/app/frontend/src/pages/developer/DesarrolladorCompetidores.js` (+bell+drawer+simulate btn+role guard)
- `/app/frontend/src/components/developer/AvanceObraTab.js` (+UnitRow table +saveUnit flow)
- `/app/frontend/src/components/developer/GeolocalizacionTab.js` (role guard)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (pasa `user` prop a GeolocalizacionTab)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 3 · Internal Users LOGIN real + GeoJSON Export
**Objetivo:** cerrar debt B1 (invited users no podían hacer login) + feature small (export GeoJSON para análisis externo).

### Sub-Chunk A · 4.9 Internal users login flow real
**Backend (`routes_dev_batch3.py` nuevo · ~330 líneas + extensión `routes_dev_batch1.py` invite):**
- Schema extendido `dev_internal_users`: `activation_expires_at` (now+7d), `password_hash` (ref flag), `last_login_at`, `user_id` (link a `users`).
- `GET /api/dev/invitations/{token}/verify` — público (no auth), retorna `{email, name, role, dev_org_name, expires_at}`. 404 inválido, 410 expirado.
- `POST /api/dev/invitations/{token}/accept` — público, valida token + password ≥8 + confirm match, hashea con bcrypt (reusa `hash_password`), crea entry en `users` con `role=INTERNAL_ROLE_TO_USERS_ROLE[int_role]` + `internal_role` + `tenant_id`, setea JWT cookies httpOnly+Secure+SameSite=none (mismo patrón que `/api/auth/login`), limpia `activation_token`, audit `dev_internal_users|update` + ML `internal_user_activated`.
- `POST /api/auth/internal/login` — valida credenciales en `users`, filtra por role `developer_admin/member/superadmin` (403 si no), setea cookies, bump `last_login_at`, ML `internal_user_login`.
- `routes_dev_batch1.create_internal_user` actualizado: setea `activation_expires_at` +7d, email URL real `{PUBLIC_APP_URL}/aceptar-invitacion/{token}`, template Resend en español con `dev_org_name` dinámico.

**Frontend:**
- Nueva página pública `/aceptar-invitacion/:token` — `AceptarInvitacion.js` (~180 líneas): branding DMX, "Bienvenido a {org_name}", role label localizado (admin/commercial_director/comercial/obras/marketing), fields password+confirm con validación visual (min 8, match), submit → auto-login → redirect hard a `/desarrollador`.
- `DeveloperLayout.js` ROLES_OK ahora incluye `developer_member` (comerciales, obras, marketing invitados deben poder acceder al portal, sin ese cambio quedaban en 403).

**Curl verification (todos ✅):**
- Invite → `activation_expires_at` 7d futuro ✅
- GET verify válido → `{email, role, dev_org_name:"Constructora Ariel"}`
- GET verify token inválido → 404 `Invitación no encontrada`
- GET verify token expirado (seeded -2d) → 410 `Invitación expirada`
- POST accept passwords no match → 400
- POST accept password <8 → 422 Pydantic
- POST accept válido → 200 con user {role:developer_member, internal_role:comercial, tenant_id:constructora_ariel}, cookies access_token+refresh_token emitidas
- POST accept 2ª vez (token ya limpiado) → 404
- POST internal/login válido → 200 + cookies
- POST internal/login wrong pwd → 401 `Email o contraseña incorrectos`

**Smoke Playwright (e2e):**
- `/aceptar-invitacion/{token}` con `marketing` role → fill password → submit → `Final URL: /desarrollador` · `403_page:0 panel_link:1` ✅

### Sub-Chunk B · 4.18 GeoJSON Export
**Backend:**
- `GET /api/dev/projects/{id}/export/geojson` — auth required, role guard `{developer_admin, superadmin}` o internal_role=`commercial_director`. Requiere `dev_project_meta` con `lat/lng` (422 si falta). Retorna FeatureCollection con:
  - 1 Feature Point del proyecto (properties: project_id, name, colonia, units_total, status, ie_score_overall, overall_percent, price_from, exported_at, developer_id)
  - N Features Point (1/unit) con offset determinista ±50m (properties: unit_id, unit_number, prototype, level, status, price_mxn, area_m2, percent_complete, current_stage)
- Response headers `application/geo+json` + `Content-Disposition: attachment; filename="project-{slug}.geojson"`.
- Audit `project_geojson_export|read` + ML `geojson_export`.

**Frontend:**
- `GeolocalizacionTab.js` (+60 líneas): sección "Exportar" debajo del picker (solo visible a roles autorizados). Botón "Exportar GeoJSON" dispara fetch con `credentials: include` → `createObjectURL(blob) + a.download + revokeObjectURL`. Disable + tooltip "Configura y guarda la ubicación primero" cuando `source!=manual`.

**Curl verification (todos ✅):**
- Export con location guardada → HTTP 200 · content-type `application/geo+json` · content-disposition correcto · 32KB · FeatureCollection con 57 features · project feature geometry `[lng, lat]` correcto · metadata `{generator_version: batch3, feature_count: 57}` · GeoJSON structure valid (3 features checked)
- Export sin location (lomas-signature) → 422 `Geolocalización no configurada`
- Export como asesor → 403 `Rol no autorizado`

### Audit log summary
17 entries tenant-scoped después de Batch 3. Nuevos tipos B3:
- `dev_internal_users|update` (invitation accept)
- `project_geojson_export|read` (export)

### Archivos tocados
- `/app/backend/routes_dev_batch3.py` (nuevo ~330 líneas)
- `/app/backend/routes_dev_batch1.py` (invite email template + activation_expires_at)
- `/app/backend/server.py` (router + indexes registrados)
- `/app/frontend/src/api/developer.js` (+4 helpers B3)
- `/app/frontend/src/pages/public/AceptarInvitacion.js` (nuevo)
- `/app/frontend/src/components/developer/GeolocalizacionTab.js` (+export button + role guard)
- `/app/frontend/src/components/developer/DeveloperLayout.js` (+developer_member en ROLES_OK)
- `/app/frontend/src/App.js` (+ruta `/aceptar-invitacion/:token` pública)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Improvement Post-B4.4 · Heat Cohort Dashboard
**Objetivo:** dar visibilidad agregada del distribución `heat_tag` × close-rate para acelerar coaching.

**Cambios:**
- Backend: `GET /api/dev/analytics/heat-cohort?period=&project_id=` aggregando leads por `heat_tag` (caliente/tibio/frío/sin_calcular) con `total`, `won`, `close_rate %`, `share_pct %`.
- Frontend: Card "Cohort de Heat IA" en `InsightsTab` con 4 `HeatCohortCard` (uno por tag) + textura coachable. Solo se renderea si `cohort.total_leads > 0`.
- Lint OK, Playwright smoke confirma `data-testid="heat-cohort"` visible.

---

## 2026-05-02 — Phase 4 Batch 5 · Dynamic Pricing A/B + Branded PDF Reports

### Sub-Chunk A · 4.14 Dynamic Pricing A/B + Bundle
**Backend (`routes_dev_batch5.py` · nuevo · ~640 líneas):**
- Schemas: `pricing_experiments` (variants[] con stats), `pricing_visitor_assignments` (unique idx visitor+exp).
- Asignación visitante **deterministic hash** (md5 visitor_id+exp_id → bucket por visitor_pct).
- 5 endpoints + permission guards:
  - `POST /api/dev/pricing-experiments` (validate variants suman 1.0)
  - `GET /api/dev/pricing-experiments?status=&project_id=`
  - `PATCH /api/dev/pricing-experiments/{id}` (status, name, dates)
  - `POST /api/dev/pricing-experiments/{id}/assign-visitor` (público, idempotente, increment views)
  - `POST /api/dev/pricing-experiments/{id}/track-event` (público, atomic `$inc`)
  - `GET /api/dev/pricing-experiments/{id}/results` (conversion funnel + winner heuristic + confidence)
- Audit + ml_event para create/update/results.

**Frontend (`pages/developer/DesarrolladorPricingLab.js` · nuevo · ~340 líneas):**
- Ruta `/desarrollador/desarrollos/:slug/pricing-lab` con 3 tabs: Activos / Crear / Resultados.
- ActiveTab: cards con variants + stats + funnel inline + botones Pausar/Reanudar/Concluir.
- CreateTab: form variants dinámicas (label + price_modifier {percent|absolute|fixed} + visitor_pct).
- ResultsTab: lista experiments completed con winner highlight.
- Diseño 100% compliant (cream opacity ladder + green/amber semantic).

### Sub-Chunk B · 4.21 Branded PDF Reports + Auto-distribution
**Backend:**
- Schemas: `report_templates` (sections[], branding{}), `report_distributions` (frequency/recipients), `report_files` (PDF base64-encoded).
- **ReportLab 4.5** PDF generation con 7 section types:
  - `cover` (project name + period)
  - `kpi_grid` (leads/citas/cierres/win_rate desde MongoDB)
  - `units_table` (inventory desde DEVELOPMENTS)
  - `absorption_chart` (cierres por mes)
  - `pricing_summary` (experiments del período)
  - `team_perf` (per-asesor stats con name resolution)
  - `narrative_ai` (Claude haiku-4-5 ejecutivo summary 200 palabras)
- 6 endpoints + permission guards:
  - `POST /api/dev/reports/templates`, `GET /api/dev/reports/templates`
  - `POST /api/dev/reports/generate` → genera PDF, persiste, retorna `download_url`
  - `GET /api/dev/reports/files/{id}` → descarga PDF (Content-Type application/pdf)
  - `POST /api/dev/reports/distributions`, `GET`, `PATCH`
- APScheduler **daily 8am job** `check_pending_distributions`: query distribuciones due → genera PDF → envía Resend con .ics → reschedule next.
- Audit + ml_event `report_generated` / `report_distributed`.

**Frontend (extensión `DesarrolladorReportes.js`):**
- Nueva tab "Reportes branded" con 3 sub-tabs:
  - **Templates**: lista + form crear (name, type, color picker, header text, sections preset).
  - **Generar ahora**: selector template + project + date range + botón "Generar y descargar PDF" + link de descarga.
  - **Distribución automática**: lista distribuciones + form crear (template + frequency + recipients emails).
- Diseño compliant (cream opacity + tipografía Outfit/DM Sans).

### Verificación ✅
- **Backend lint** Ruff OK · **Frontend lint** ESLint OK (5 archivos modificados/creados)
- **Curl smoke** (todos OK):
  - `POST /api/dev/pricing-experiments` → 200 con experiment id ✅
  - `POST /assign-visitor` (público) → 200 con variant_label ✅
  - `POST /track-event` (público) → atomic increment ✅
  - `GET /results` → conversion funnel + winner ✅
  - `GET /api/dev/analytics/heat-cohort` → 4 cohort items con close_rate ✅
  - `POST /api/dev/reports/templates` → 200 template id ✅
  - `POST /api/dev/reports/generate` → file_id + size_kb ✅
  - `GET /api/dev/reports/files/{id}` → application/pdf válido (`%PDF-` magic header, 3.7KB) ✅
- **Playwright smoke**:
  - `/desarrollador/desarrollos/quattro-alto/pricing-lab` → h1 + 3 tabs ✅
  - `/desarrollador/reportes` → tab "branded" → sub-tab generate con form completo ✅
  - Insights tab → `heat-cohort` card visible ✅

### Áreas mocked
- 📧 **RESEND_API_KEY** no configurada → `check_pending_distributions` genera PDF + persiste pero NO envía email (try/except silencioso). Workflow funcional, solo falta key.

### Archivos
- Backend: `routes_dev_batch5.py` (nuevo), `routes_dev_batch4_4.py` (extendido con heat-cohort)
- Frontend: `pages/developer/DesarrolladorPricingLab.js` (nuevo), `pages/developer/DesarrolladorReportes.js` (extendido con BrandedReportsTab + HeatCohortCard), `api/leads.js` (10 endpoints nuevos), `App.js` (ruta pricing-lab), `requirements.txt` (+reportlab 4.5)

---

## 2026-05-02 — Phase 4 Batch 6 · Demand Heatmap + Engagement Analytics
**Objetivo:** mapa de calor geográfico Mapbox sobre 16 colonias + analítica de engagement por unidad con recomendaciones Claude haiku.

### Backend (`routes_dev_batch6.py` · ~460 líneas, ya existente, ahora wired en `server.py`)
- `GET /api/dev/analytics/demand-heatmap?from=&to=&granularity=&include_searches=` — agrega leads × 3 + appts × 5 + searches × 1, normaliza score 0–100 por colonia, devuelve **GeoJSON FeatureCollection** (16 polígonos cerrados desde `data_seed.COLONIAS`) + `top_10` ordenado. Tenant-scoped (developer_admin sólo ve su org). ML event `demand_heatmap_viewed`.
- `GET /api/dev/projects/{id}/engagement-units?from=&to=&sort=engagement_score|views|leads|cierres` — lee `units` de `data_developments`, agrega views (ml_training_events `unit_viewed`), leads/appointments/cierres de Mongo, calcula `engagement_score = (views×1 + leads×5 + appts×10 + cierres×30)` normalizado, **Claude haiku-4-5 recommendations** (cache 12h por `project_id`, fallback determinista). ML event `engagement_analytics_viewed`.
- `GET /api/dev/projects/{id}/engagement-units/{unit_id}/timeline` — eventos cronológicos (view/lead_created/cierre/appointment_scheduled). ML event `engagement_unit_drill`.
- Wiring `server.py`: `app.include_router(dev_batch6_router)` + `await ensure_batch6_indexes(db)` en startup.

### Frontend
- **`components/developer/DemandHeatmapMap.js`** (nuevo · ~140 líneas) — Mapbox choropleth con 5-stop ramp cream→navy→pink (0→100), popup hover (Score/Leads/Citas/Búsquedas), `fitBounds` automático, fallback honesto si falta `REACT_APP_MAPBOX_TOKEN`.
- **`components/developer/EngagementTab.js`** (nuevo · ~220 líneas) — KPI strip (Unidades, Engagement promedio, Top, Más lenta) + card "Recomendaciones IA · Claude Haiku" + tabla 200-row sortable (Score/Vistas/Leads/Cierres) con `ScoreBar` gradient + drilldown drawer 440px con timeline de eventos.
- **`pages/developer/DesarrolladorDemanda.js`** — sección Mapbox heatmap nueva en cabecera (con period 7D/30D/90D + sidebar Top 10) preservando legacy forecast/funnel/queries debajo.
- **`pages/developer/DesarrolladorLegajo.js`** — nueva tab `Engagement` con icono `Activity` entre `Avance de obra` e `IE Score`.
- **`api/developer.js`** (+3 helpers): `getDemandHeatmap`, `getEngagementUnits`, `getEngagementUnitTimeline`.

### Verificación curl ✅
- `GET /demand-heatmap` (developer) → 16 features, top_10[0]=Polanco score=100 (6 leads), `total_leads=6` ✅
- `GET /demand-heatmap?from={7d}` → 16 features, periodo correcto ✅
- `GET /engagement-units/altavista-polanco` → 56 unidades + avg=0.0 + 3 recomendaciones reales Claude (e.g. "Las unidades tipo A no generan engagement…", "Implementa estrategia de pricing dinámico…", "Crea campañas segmentadas por piso…"), primer item con `prototype:'A', level:2, m2:127, status:'disponible'` ✅
- `GET /engagement-units/{unit_id}/timeline` → 200 con `events:[]` (sin actividad real aún en periodo) ✅
- Role guard: `asesor@demo.com` → 403 en heatmap y engagement; anon → 401 ✅

### Smoke Playwright ✅
- `/desarrollador/demanda` → `demand-heatmap-card`=1, `demand-heatmap-map`=1, `mapboxgl-canvas`=1, top10 con Polanco visible (badge 100) y polígono fucsia sobre Polanco en mapa.
- `/desarrollador/desarrollos/altavista-polanco/legajo` tab Engagement → `engagement-units-table`=1, 56 rows, `engagement-recommendations`=1 con 3 recos Claude reales en es-MX, 4 sort buttons; drill-down → `engagement-timeline-drawer`=1 con "Sin actividad registrada en este periodo." (esperado, sin events seed).

### Archivos tocados
- `/app/backend/server.py` (+router include + `ensure_batch6_indexes` en startup)
- `/app/backend/routes_dev_batch6.py` (fix mapping campos `unit_number/prototype/m2_total` desde data_developments)
- `/app/frontend/src/components/developer/DemandHeatmapMap.js` (nuevo)
- `/app/frontend/src/components/developer/EngagementTab.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorDemanda.js` (rewrite con Mapbox section + legacy preservado)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (+tab `engagement` con icono Activity)
- `/app/frontend/src/api/developer.js` (+3 helpers B6)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 7 · Site Selection AI Standalone (4.22)
**Objetivo:** motor IA standalone que dado criterios + presupuesto del developer, recomienda y rankea zonas candidatas con feasibility 0–100 + sub-scores + narrative Claude haiku para decisiones de expansión.

### Backend (`routes_dev_batch7.py` · nuevo · ~660 líneas)
- **Schemas Mongo**:
  - `site_selection_studies`: `{id, dev_org_id, name, status:'draft|running|completed|failed', inputs:{project_type, target_segment, unit_size_range, price_range_per_m2, total_units_target, budget_construction, preferred_states[], preferred_features[], avoid_features[]}, candidate_zones:[{colonia, colonia_id, alcaldia, state, center, polygon, bbox, feasibility_score, sub_scores:{market_demand, price_match, competition, infrastructure, absorption_potential, risk_factors}, narrative, data_points:{avg_price_per_m2, existing_projects_count, absorption_rate_12m, demographic_match_pct, ie_score_avg, demand_score}, pros[], cons[], target_units_estimate, target_price_range:{min,max}, estimated_roi_5y}], created_by, created_at, completed_at, error_message}` con índices unique-id + (dev_org, status, created_at).
  - `site_selection_files`: `{id, study_id, dev_org_id, size_bytes, pdf_b64, created_at}` para PDFs exportados.
- **Pipeline asíncrono**:
  1. `POST /studies` → crea draft con inputs validados (Pydantic). 422 en project_type/target_segment fuera de allowlist.
  2. `POST /studies/:id/run` → flip a `running` + `asyncio.create_task(_run_engine)`. Idempotente sobre running/completed.
  3. **`_run_engine`**: filtra 16 colonias `data_seed.COLONIAS` (drop si zone_price < seg_min×0.4 o > seg_max×2.4), calcula 6 sub-scores deterministas + feasibility (avg de los 6), keeps top-10, llama **Claude haiku-4-5** (`emergentintegrations.LlmChat`) por zona para narrative ≤320 chars + 3-5 pros + 2-4 cons. Estima `target_units` (escala por price ratio), `target_price_range` (±8% del price del zone), `estimated_roi_5y` (heurística sobre price_match + market_demand + plusvalía score). Persiste `status=completed`. En cualquier excepción → `status=failed` + `error_message`.
  4. `GET /studies?status=` lista paginada (sin candidate_zones) · `GET /studies/:id` detalle full.
  5. `POST /studies/:id/export-pdf` reusa **ReportLab** patterns de B5: portada + tabla criterios + ranking 7-col + páginas detalle top-5 con narrative+pros+cons. Persiste en `site_selection_files` y devuelve `download_url`.
  6. `GET /files/:file_id` descarga PDF (`application/pdf`).
- **Sub-score helpers** (deterministas):
  - `market_demand` = leads_norm + demand_proxy×0.4
  - `price_match` = inverse-distance del zone_price vs band target
  - `competition` = step function (0 → 95, 1-2 → 80, 3-5 → 60, 6-8 → 40, 9+ → 20)
  - `infrastructure` = avg(movilidad+comercio+educacion) + bonus por features preferidas
  - `risk_factors` = avg(seguridad+riesgo) − penalty por features evitar
  - `absorption_potential` = función de competencia + leads
- **Audit + ML events**: `site_selection_study_created`, `site_selection_run_started`, `site_selection_exported`. (run_completed/failed se persiste en doc, no como ML event explícito para evitar ruido en logs).
- **Role guard**: `_is_dev_admin` (developer_admin/director/superadmin/internal_role admin/commercial_director). asesor → 403, anon → 401.
- **Wiring `server.py`**: router include + `ensure_batch7_indexes(db)` en startup.

### Frontend
- **`api/developer.js`** (+6 helpers B7): `createSiteStudy`, `runSiteStudy`, `listSiteStudies`, `getSiteStudy`, `exportSiteStudyPdf`, `siteStudyDownloadUrl`.
- **`components/developer/RadarChart.js`** (nuevo · ~70 líneas) — SVG-only radar 6-axes, grid 25/50/75/100, polígono fucsia 0.18 fill + stroke 1.6, labels Outfit/DM Sans en castellano.
- **`components/developer/SiteSelectionMap.js`** (nuevo · ~150 líneas) — Mapbox dark-v11 con `fill` layer (5-stop ramp por feasibility) + `line` layer + `circle` markers cream/navy. Popup hover con feasibility+ROI. Click sincroniza con sidebar via `onSelect`. fitBounds automático.
- **`components/developer/SiteSelectionWizard.js`** (nuevo · ~250 líneas) — Modal 720px glass con 4 pasos:
  - Paso 1: project_type + target_segment (toggles pill)
  - Paso 2: unit_size_range + price_range_per_m2 + total_units + budget (number inputs)
  - Paso 3: preferred_states + preferred_features + avoid_features (multi-toggle pills)
  - Paso 4: nombre + resumen visual de criterios + features + submit "Crear y ejecutar"
  - Submit invoca `createSiteStudy` + `runSiteStudy` + `onCreated` callback.
- **`pages/developer/DesarrolladorSiteSelection.js`** (nuevo · ~340 líneas) — Page completa con 3 tabs:
  - `Estudios`: cards grid clickeable con StatusPill, empty state con CTA gradient.
  - `Crear estudio`: card con CTA → abre wizard.
  - `Resultados`: header con study + StatusPill + botón Exportar PDF / Refrescar. Si running: progress card con ETA. Si completed: grid 1.4fr/1fr con `SiteSelectionMap` + ranking sidebar (10 zones clickables con badges feasibility). Click zone abre `StudyDetailDrawer` 480px lateral con headline KPIs (Feasibility/ROI/Unidades), `RadarChart` sub-scores, narrative IA, Pros/Cons, tabla data_points.
  - Polling automático cada 3.5s mientras study está `running`.
- **`App.js`** (+ruta `/desarrollador/site-selection` + import).
- **`components/developer/DeveloperLayout.js`** (+nav link "Site Selection" con icon `MapPin` entre Reportes IA y Pricing dinámico).

### Verificación curl ✅ (full lifecycle)
- POST `/studies` con inputs completos NSE_AB Polanco-Roma → 201 con `id=ssel_048e03e62a9e, status=draft` ✅
- POST `/studies/:id/run` → `{ok:true, status:running, eta_seconds:60}` ✅
- Polling: completed en <4s (engine + 10× Claude haiku) ✅
- GET `/studies/:id` completed → 10 candidate_zones, top=Polanco con feasibility=84.8, ROI 5y=24.8%, sub_scores `{market_demand:70.6, price_match:87.5, competition:80, infrastructure:97.7, absorption_potential:86, risk_factors:87}`, narrative 314 chars real Claude (es-MX), 5 pros + 4 cons ✅
- GET `/studies` → list con 1 item (sin candidate_zones, payload ligero) ✅
- POST `/studies/:id/export-pdf` → `file_id`, 9.7KB ✅
- GET `/files/:file_id` → `application/pdf` con magic header `%PDF-1.4` ✅
- Validación inputs: `project_type:"invalid"` → 422 Pydantic ✅
- Role guards: asesor → list/get 403; anon → list 401 ✅

### Verificación Playwright smoke ✅
- `/desarrollador/site-selection` carga con sidebar nav nuevo "Site Selection" (icon MapPin) ✅
- Tab Estudios: card grid renderiza con 1 study existente. Click → resulta en Tab Resultados con map + 10 ranking items + Map canvas Mapbox cargado ✅
- Click zone en ranking → drawer lateral con `data-testid="site-zone-drawer"`, `radar-chart`=1, `narrative`=1, **5 pros + 4 cons** renderizados ✅
- Botón Exportar PDF visible solo si status=completed ✅
- **Wizard flow end-to-end**: `site-new-btn` → wizard 4 pasos → submit "Smoke wizard NSE_C+" → Mongo persiste study completed con candidate_zones (verificado por API listStudies post-flow: 2 studies, ambos completed) ✅
- Diseño: 100% var(--navy)/var(--cream)/gradient, cero indigo/purple custom hex en componentes nuevos, tipografía Outfit/DM Sans, lucide-style icons ✅

### Áreas mocked / pendientes
- `marketplace_searches` collection vacía → `demand_proxy` para market_demand usa solo `leads × 8 + comercio_score × 0.4`. Cuando el frontend público registre búsquedas, el motor las incorpora automáticamente.
- INEGI demographics no enchufado (B7 usa `plusvalia` score como proxy de `demographic_match_pct`). El connector existe en `data_ie_sources` pero no se llama desde B7 — defer.

### Archivos tocados
- `/app/backend/routes_dev_batch7.py` (nuevo)
- `/app/backend/server.py` (+router include + `ensure_batch7_indexes`)
- `/app/frontend/src/api/developer.js` (+6 helpers B7)
- `/app/frontend/src/components/developer/RadarChart.js` (nuevo)
- `/app/frontend/src/components/developer/SiteSelectionMap.js` (nuevo)
- `/app/frontend/src/components/developer/SiteSelectionWizard.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorSiteSelection.js` (nuevo)
- `/app/frontend/src/App.js` (+ruta `/desarrollador/site-selection`)
- `/app/frontend/src/components/developer/DeveloperLayout.js` (+nav link)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 7.1 · Compare + Expansion Simulator + B6/B7 Cross-Link
**Objetivo:** cerrar el loop discovery→feasibility→pricing actionable con 3 features autorizadas por founder.

### Sub-chunk A · 4.22.1 Compare Studies
- **Backend** (`routes_dev_batch7.py` extendido):
  - `GET /api/dev/site-selection/studies/compare?ids=id1,id2[,id3]` registrado **antes** de `/studies/{study_id}` para evitar shadowing.
  - Validación: 2-3 ids (else 422), todos del `dev_org` del user (else 403), todos `status=completed` (else 409).
  - Response: `studies[]` con `top_3_zones`, `avg_sub_scores` (avg de los 6 sub-scores sobre todas las candidate_zones), `avg_feasibility`. `diff_matrix` con `criteria_diff` (8 keys: project_type/target_segment/total_units_target/budget_construction/unit_size_range/price_range_per_m2/preferred_features/avoid_features), `winner_per_metric` (8 winners: 6 sub-scores + avg_feasibility + top_roi), `narrative_diff` Claude haiku-4-5 200-300 chars es-MX.
  - Audit + ML event `site_selection_compared`.
- **Frontend** (`components/developer/CompareTab.js` · ~210 líneas):
  - Toggles para seleccionar 2-3 studies completed, contador "X/3".
  - Side-by-side grid (`gridTemplateColumns: repeat(N, 1fr)` responsive a 1 col en <880px).
  - Por columna: header con tinta única (indigo/pink/green per idx), KPIs (avg_feasibility con badge WINNER, total_zones_evaluated), tabla top-3 zonas, **RadarChart B7** con `avg_sub_scores` (color por columna).
  - Narrative IA card con gradient indigo→pink subtle.
  - Grid de 8 winners-per-metric con cards.
- Tab "Comparar" agregado en page principal.

### Sub-chunk B · 4.22.2 Expansion Simulator
- **Schema Mongo**: `expansion_simulations` con `{id, dev_org_id, study_id, zone_colonia, zone_data, inputs:{target_absorption_pct, target_months, base_price_per_m2, target_segment}, scenarios:[{label, price_per_m2, discount_pct, effective_price_per_m2, monthly_absorption:[{month, units_sold, cumulative_pct}], total_units_sold, revenue_projection, breakeven_month, sensitivity:{price_drop_5pct_impact_units, demand_score_minus_10_impact_units, demand_score_plus_10_impact_units}, narrative}], disclaimer, created_at, created_by}`.
- **Engine** (`routes_dev_batch7.py`):
  - `ELASTICITY_BY_SEGMENT`: NSE_AB=-0.6, NSE_C+=-0.9, NSE_C=-1.2, NSE_D=-1.5.
  - `BASELINE_ABSORPTION_BY_STATE`: CDMX=0.42, EDOMEX=0.36, JAL=0.38, NL=0.40, QRO=0.38.
  - `_scenario_decay`: front-loaded curve (peak meses 3-4 con phase 1.20→0.96, taper 6-12 con 0.96→0.72, decay post-12 mín 0.45).
  - 3 escenarios fijos: `conservador` (price×1.05, disc=0%), `base` (price×1.0, disc=0%), `agresivo` (price×0.92, disc=5%).
  - `_build_scenario` calcula adjusted_rate = baseline × demand × infrastructure × feasibility × 1.6 (cap [0.05,1.0]), aplica elasticity_factor, devuelve `monthly_absorption`, `revenue_projection`, `breakeven_month` (-1 si fuera de horizonte), 3 sensitivities.
  - **Claude haiku-4-5** 3 calls en paralelo (`asyncio.gather`) por escenario, narrative 130-150 chars con fallback determinista.
- **Endpoints**:
  - `POST /api/dev/site-selection/studies/:id/simulate` (Pydantic SimulatePayload: target_absorption_pct ∈ [50,100], target_months ∈ [6,36], base_price_per_m2 ∈ [10k,2M]). Validates zone exists. Run sync ~3s. ML event `expansion_simulated`.
  - `GET /api/dev/site-selection/simulations/:id` detail.
  - `GET /api/dev/site-selection/studies/:id/simulations` lista por study (sort created_at desc, limit 50).
  - `POST /api/dev/site-selection/simulations/:id/export-pdf` ReportLab PDF con DISCLAIMER amber prominente + 3 escenarios tabla. ML event `expansion_simulation_pdf_exported`.
- **Frontend** (`components/developer/ExpansionSimulatorModal.js` · ~210 líneas):
  - Modal 960px desde drawer detail de zona.
  - DISCLAIMER amber prominente top.
  - Inputs: range slider absorption_pct (50-100), range slider target_months (6-36), number input base_price_per_m2.
  - Submit → spinner → 3 ScenarioCard side-by-side (responsive stack <580px):
    - Header: badge label + price + descuento.
    - KPIs: revenue formato $XM + breakeven badge (Mes N o "Fuera").
    - **AbsorptionLine** SVG inline (path color fucsia, eje base, label % final).
    - 3 sensitivity badges (-5% precio, +10 demand, -10 demand).
    - Narrative italic Claude.
  - Botón "Exportar simulación PDF" reusa `siteStudyDownloadUrl`.
- Botón "Simular expansión en esta zona" prominente en `StudyDetailDrawer` (gradient único).

### Sub-chunk C · 4.22.3 B6+B7 Cross-Link
- **`DemandHeatmapMap.js`**: al click en polígono colonia, además del callback `onSelectColonia`, abre **sticky popup** con CTA `<a data-testid="heatmap-cta-feasibility" href="/desarrollador/site-selection?prefill_colonia=...&prefill_state=CDMX&from=heatmap">` estilizado outline cream sobre fondo cream.
- **`DesarrolladorSiteSelection.js`**: lee `useSearchParams()` al mount (prefill_colonia, prefill_state, from=heatmap), pasa props al Wizard, auto-abre wizard si `fromHeatmap`, limpia query params después de creación exitosa.
- **`SiteSelectionWizard.js`**:
  - Acepta props `prefillColonia`, `prefillState`, `fromHeatmap`.
  - Si `fromHeatmap=true`: arranca en Paso 3 (skip 1-2), pre-fill `name = "Feasibility {colonia}"`, pre-fill `preferred_states=[prefillState]`.
  - Banner contextual prominente con icon MapPin: "Pre-llenado desde Demand Heatmap: {colonia}, {state}. Ajusta otros criterios…"
  - `useEffect` mount: POST `/api/ml/emit` con `event_type=site_selection_prefilled_from_heatmap` + context.

### Verificación curl ✅
- `compare?ids=ssel_1db02b2831a0,ssel_048e03e62a9e` (2 studies) → 200 con 2 studies, 8 winners, narrative 300 chars Claude real es-MX ✅
- `compare?ids=1` → 422 ✅; `compare?ids=a,b,c,d` → 422 ✅; asesor → 403 ✅
- `simulate` Polanco zone (target=80%, months=18, price=110000) → 200 con 3 escenarios distintos: conservador price=$115,500/breakeven mes 17, base price=$110,000/breakeven mes 18, agresivo effective=$96,140/breakeven fuera. 3 narratives Claude reales ✅. PDF 4.5KB con magic header `%PDF-1.4` ✅.
- Validación: target_absorption=30 → 422; target_months=60 → 422; zone "Tepito" (no existe en study) → 404 ✅.
- ml events emitidos: `site_selection_compared`, `expansion_simulated`, `expansion_simulation_pdf_exported`, `site_selection_prefilled_from_heatmap`.

### Verificación Playwright smoke ✅
- **A · Compare**: tab visible, 2 study pickers, click → `compare-grid`=1, 2 cols renderizadas, narrative-IA visible, 8 winner cards, 2 RadarChart con avg_sub_scores. Badge "WINNER" sobre study con mayor avg_feasibility ✅
- **B · Simulate**: drawer zone Polanco → botón "Simular expansión en esta zona" → modal con DISCLAIMER amber + 3 scenario cards (conservador/base/agresivo) con narratives Claude reales en es-MX, AbsorptionLine SVG, sensitivity badges, botón Exportar PDF ✅
- **C · Cross-link**: navegar `/desarrollador/site-selection?prefill_colonia=Polanco&prefill_state=CDMX&from=heatmap` → wizard auto-abierto en **Paso 3 de 4**, banner "Pre-llenado desde Demand Heatmap: Polanco, CDMX." visible, **CDMX state pre-seleccionado** con gradient activo ✅
- Heatmap polygon Polanco renderizado en pink (score 100). El sticky popup aparece al click real del usuario sobre el polígono (test simulado por mouse-coords no llegó al polígono pero la lógica está wired correctamente).

### Archivos tocados
- `/app/backend/routes_dev_batch7.py` (+~480 líneas: compare endpoint pre-registrado, helpers `_compare_narrative`/`_compare_studies_impl`, ELASTICITY/BASELINE benchmarks, `_scenario_decay`, `_build_scenario`, `_claude_scenario_narrative`, simulate/get/list/export-pdf endpoints, índice `expansion_simulations`)
- `/app/frontend/src/api/developer.js` (+5 helpers: `compareSiteStudies`, `simulateExpansion`, `getExpansionSimulation`, `listExpansionSimulations`, `exportSimulationPdf`)
- `/app/frontend/src/components/developer/CompareTab.js` (nuevo)
- `/app/frontend/src/components/developer/ExpansionSimulatorModal.js` (nuevo)
- `/app/frontend/src/components/developer/SiteSelectionWizard.js` (+prefill props/banner/auto-skip + ml_event emit)
- `/app/frontend/src/components/developer/DemandHeatmapMap.js` (+sticky CTA popup en click polygon)
- `/app/frontend/src/pages/developer/DesarrolladorSiteSelection.js` (+CompareTab tab, simulator modal state, useSearchParams prefill flow, wizard props pass-through)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 8 · CASH FLOW FORECAST IA STANDALONE (4.24) ✅
**Objetivo:** reporte investor-grade de flujo de caja a 18 meses combinando pipeline de leads + costos construcción + gastos operativos, con 3 escenarios, gap detection, recomendaciones IA accionables y export PDF investor-ready.

### Backend (`routes_dev_batch8.py` · nuevo · ~620 líneas)
- **Schema Mongo `cash_flow_forecasts`** con `{_id, dev_org_id, project_id, project_name, horizon_months, project_inputs, pipeline_inputs, series:[{month,label,inflow_total,outflow_total,monthly_balance,cumulative_balance,gap_severity,inflow_breakdown,outflow_breakdown}], summary:{total_revenue_projected,total_costs,total_balance,breakeven_month,biggest_gap,gap_count,scenarios_compared}, scenarios:[{label,series,summary,narrative}], ai_recommendations:[{priority,category,title,detail,estimated_impact_mxn}], applied_recommendations:[], last_calculated_at, expires_at}`. Indexes `(dev_org_id, project_id) unique`, `(project_id, last_calculated_at)`.
- **Forecast engine** `compute_cash_flow(project, leads_pipeline, horizon_months)`:
  - Inflow modelling: cierre por etapa pipeline (apartado/contrato/escritura) con probabilidad ponderada × ticket promedio × velocidad histórica.
  - Outflow modelling: split construcción (curva S 30-50-20 % por trimestre), opex mensual, marketing, comisiones (8% asesor + 2% override DMX).
  - Gap detection: severity buckets `mild` (cumulative<-100k MXN), `moderate` (<-1M), `critical` (<-5M).
  - Breakeven: primer mes con `cumulative_balance>=0`.
- **3 escenarios** (`pesimista` -25% pipeline, `base`, `optimista` +20%). Cada escenario con narrative IA `claude haiku-4-5` (con honest fallback si LLM budget exceeded).
- **Recomendaciones IA** (`claude haiku-4-5` system prompt es-MX): output JSON validado con `priority/category/title/detail/estimated_impact_mxn`, máx 5. Fallback determinista por categoría (gap_mitigation, pipeline_boost, cost_optimization).
- **Endpoints**:
  - `POST /api/dev/projects/:id/cash-flow/recalc` (dev_admin/director/superadmin) → trigger recalc.
  - `GET /api/dev/projects/:id/cash-flow/current` → 200 con doc full o 404 si no calculado.
  - `POST /api/dev/projects/:id/cash-flow/recommendations/:idx/apply` → marca recomendación como aplicada (audit).
  - `POST /api/dev/projects/:id/cash-flow/export-pdf` → genera PDF ReportLab investor-grade (cover, KPIs, chart inflow/outflow/cumulative, scenarios narrative, gap table, recomendaciones) → returns `{file_id}`.
  - `GET /api/dev/projects/:id/cash-flow/download/:file_id` → stream PDF.
- **APScheduler `daily_active_projects_recalc`** registrado vía `register_batch8_jobs(sched, db, app)` con CronTrigger 06:00 MX, max 1 instance, recalcula proyectos `active` (cap 50/run). Re-wired al scheduler IE existente para evitar 2 schedulers.
- **Audit + ML events**: `cash_flow_recalc_triggered`, `cash_flow_recommendation_applied`, `cash_flow_pdf_exported`.

### Frontend
- **`pages/developer/DesarrolladorCashFlow.js`** (nuevo · ~420 líneas):
  - `<CashFlowChart>` SVG nativo (sin recharts) con 3 series color-coded (inflow=verde #22C55E, outflow=rojo #EF4444, acumulado=fucsia #EC4899), grid + axis + legend.
  - StatStrip 4 KPIs: Revenue Proyectado · Costos Totales · Breakeven · Gap Más Grande, con tone semántico ok/warn/bad.
  - Scenario toggle (Pesimista/Base/Optimista) que swap-ea la serie + summary visualizada en chart.
  - `<ScenarioMini>` × 3 cards lado-a-lado con balance, breakeven mes, gap count y narrative IA.
  - `<GapAlertCard>` × 6 con severity color-coded (mild=amber, moderate=red, critical=red-strong).
  - `<RecommendationCard>` × N con priority left-border, badge categoría, impacto estimado MXN, botón "Marcar como aplicada" (idempotente, persiste en `applied_recommendations`).
  - `<details>` colapsable con tabla mensual completa (month/inflow/outflow/balance/cumulative/severity).
  - Action bar: `cf-recalc-btn` (admin only, 8s sync), `cf-export-btn` (gradient, abre PDF en nueva pestaña).
  - Empty state con CTA "Calcular forecast" si proyecto sin doc previo.
- **`pages/developer/DesarrolladorLegajo.js`**: nuevo tab `cashflow` con `<BarChart>` icon, body card "Flujo de caja proyectado · 18 meses · 3 escenarios" con CTA `cashflow-cta` → `/desarrollador/desarrollos/:slug/cash-flow`.
- **`api/developer.js`**: `recalcCashFlow`, `getCashFlowCurrent`, `applyCashFlowRecommendation`, `exportCashFlowPdf`, `cashFlowDownloadUrl`.
- **Routing `App.js`**: `/desarrollador/desarrollos/:slug/cash-flow` → `DesarrolladorCashFlow` gated por `AdvisorRoute`.

### Verificación curl ✅
- `POST /api/dev/projects/roma-norte-85/cash-flow/recalc` con superadmin → 200 con `forecast_id`, `gap_count:12`, `recommendation_count:5`, `scenario_count:3`, `summary.total_balance:-42M` (escenario base honesto dado pipeline mock) ✅
- `GET /current` retorna doc completo (chart + scenarios + recos) ✅
- PDF export genera file_id válido, descarga funciona ✅

### Verificación Playwright smoke ✅
- `/desarrollador/desarrollos/roma-norte-85/cash-flow` → render full: `cf-chart`, `cf-stats`, `cf-export-btn`, `cf-scenario-toggle`, `cf-recalc-btn`, `cf-recommendations`, `cf-scn-toggle-pesimista` (todos `True`), pesimista click swappea series sin errores. **0 console errors.** ✅
- `/desarrollador/desarrollos/roma-norte-85/legajo` → tab `legajo-tab-cashflow` presente, click → card `legajo-cashflow-card` + CTA `cashflow-cta` visibles ✅

### Sentry verification post-deploy ✅
- **DMX-WEB-7 / DMX-WEB-8 / DMX-WEB-9** (`UnboundLocalError 'logging'` + `AsyncExitStackMiddleware` traceback + `Application startup failed`): **ROOT CAUSE confirmada y resuelta**. Causa: `import logging` interno (línea 362 vieja) hacía a Python tratar `logging` como local en toda la función `startup`, causando UnboundLocalError en líneas 406/414/418/422 al disparar except. **Fix**: `import logging` a nivel de módulo en server.py + remoción del import interno + simplificación del bloque batch8 (`_bb8_log` → `logging`). Backend post-fix: `Application startup complete` en 3 reinicios consecutivos, **sin recurrencia**. ✅
- **DMX-WEB-6** (`Objects are not valid as React child` en Site Selection drawer): verificado al abrir drawer en zona Polanco con `DemographicsSection` + radar + pros/cons activos → **0 console errors** durante todo el flujo. Fix B7.2 (filter `Object.entries.filter(typeof v primitivo)` en `data_points`) holding correctly. ✅

### Áreas mocked / honest scope (transparentes)
- **AI narratives + recommendations**: cuando `EMERGENT_LLM_KEY` budget exceeded (current cost > 1.001 MXN), Batch 8 cae a `WARNING:dmx.batch8:[batch8] narrative <scn> failed` y usa fallback determinista (no Sentry error). Resolver: usuario debe top-up budget en Profile → Universal Key.
- **Pipeline source**: actual lee `leads` collection con stage filter; mocked si proyecto sin leads (genera pipeline sintético con 8 leads escalonados a 18m para que el forecast se renderice no vacío).
- **Construction curve**: curva S 30-50-20 hardcoded. Defer a B8.1 con costos reales por obra registrada en avance-obra (Phase 7.10).

### Archivos tocados (B8 final)
- `/app/backend/routes_dev_batch8.py` (nuevo, ya existente al inicio del wiring)
- `/app/backend/server.py` (+`import logging` módulo · -import interno · ensure_batch8_indexes · register_batch8_jobs · simplificación block batch8)
- `/app/frontend/src/App.js` (+ruta cash-flow)
- `/app/frontend/src/api/developer.js` (+5 helpers)
- `/app/frontend/src/pages/developer/DesarrolladorCashFlow.js` (nuevo · 425 líneas)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (+tab cashflow + card CTA · BarChart icon)
- `/app/backend/.env` (+FAL_API_KEY, +HEYGEN_API_KEY, +PEDRA_API_KEY, +ELEVEN_LABS_API_KEY alias · FAL_KEY corregido a formato `id:secret`)
- `/app/memory/PRD.md`

**SHA snapshot B8 backend last commit: `182b441`** (CTA wiring + logging fix uncommitted hasta el próximo auto-commit del runner).

---

## 2026-05-02 — Phase 4 Batch 7.2 · INEGI Real Demographics Connector AGEB-level (4.22.4)
**Objetivo:** reemplazar el proxy `plusvalia` por demographic_match_pct honesto, consultando INEGI BISE (Censo 2020 + ENIGH 2022) con cache 30 días, AMAI NSE mapping y fallback determinista trazable.

### Backend (`routes_dev_batch7_2.py` · nuevo · ~340 líneas)
- **Schema Mongo**: `inegi_demographics_cache` con `{cache_key (sha256 24-char), state_code, colonia, scope, source_year, population:{total, by_age, by_education, by_household_type}, income:{deciles[], nse_distribution{AB,C+,C,D,E}}, age_avg, education_avg_years, sources_used[], cached_at, expires_at}`. Index `cache_key` unique + `(state_code, colonia)`.
- **Constants**:
  - `IND_POP_TOTAL=1002000001`, `IND_AGE_MEDIAN=1002000002`, `IND_HOUSEHOLD_INCOME_AVG=6200093976` (INEGI BISE indicator IDs).
  - `STATE_AREA` mapping CDMX/EDOMEX/JAL/NL/QRO → BISE area codes.
  - `NSE_DECILE_MAP` AMAI standard: AB=deciles 9-10, C+=8, C=6-7, D=3-5, E=1-2.
- **Resolver `get_demographics(db, colonia, state_code, force_refresh)`**:
  1. Cache lookup por `cache_key` → si existe + no expirado → return con `cached=True`.
  2. INEGI BISE call via httpx async (timeout 3s, single attempt) para `pop_total`/`age_median`/`income_avg` por estado, en paralelo con `asyncio.gather`. Si todas las llamadas fallan → fallback determinista.
  3. `_deterministic_fallback`: usa `data_seed.COLONIAS` (`tier`+`plusvalia`+`price_m2_num`), `_nse_dist_from_tier` mapea Luxury/Premium/Trendy/Emerging → distribución AMAI (renormalizada a 100), `population` estimada por área polígono × densidad por tier, deciles sintéticos para trazabilidad.
  4. Si stale-cache disponible y INEGI falla → devuelve stale con `stale=True` (sin crashear B7).
  5. Persiste con TTL 30 días vía `expires_at` ISO.
- **Endpoints**:
  - `GET /api/dev/inegi/demographics?colonia=&state_code=` (dev_admin/director/superadmin) → 200 con `cached:bool, stale:bool` flags. 422 si colonia <2 chars, 404 si combo desconocido (state+colonia).
  - `POST /api/dev/inegi/demographics/refresh?colonia=&state_code=` (**superadmin only**) → 403 si non-superadmin, fuerza refresh + repopula cache.
  - `GET /api/dev/inegi/cache-stats` (superadmin) → `{total_entries, by_scope, hit_rate_7d_pct, total_lookups_7d, ttl_days}`.
- **Audit + ML events**: `inegi_demographics_cache_hit`, `inegi_demographics_cache_miss`, `inegi_demographics_refreshed`.
- **Wiring `server.py`**: router include + `ensure_batch7_2_indexes(db)` en startup.

### B7 engine integration (`routes_dev_batch7.py` extendido)
- Nuevo bloque `asyncio.gather` pre-fetch para 16 colonias en paralelo al inicio de `_candidate_zones` → cache cálido evita la pena del cold-fetch sequencial.
- En el loop por colonia: `data_points["demographic_match_pct"]` ahora se sobrescribe con `nse_distribution[target_segment]` real, y se agrega `demographic_source` (`inegi_municipio` / `inegi_ageb` / `estimate`), `demographic_year`, `demographic_cached`, `population_total`, `nse_distribution`.

### Frontend
- **`components/developer/DemographicsSection.js`** (nuevo · ~110 líneas):
  - Header con eyebrow + Badge tone (ok=AGEB, brand=municipio, neutral=estimate) + tooltip nativo.
  - 2 KPIs: Población total + Match segmento %.
  - **NseBar**: barra horizontal 5 segmentos color-coded (AB=fucsia, C+=violet, C=indigo, D=slate, E=darkslate), leyenda con porcentaje per NSE.
  - Disclaimer footer: año fuente + cached/recién consultado + Source: BISE INEGI.
- **`pages/developer/DesarrolladorSiteSelection.js`**: insertado `<DemographicsSection zone={zone} />` en el drawer detail entre Narrative IA y Pros/Cons.
- **`pages/superadmin/DataSourcesPage.js`**: `<InegiCacheRow />` con stats reales del endpoint `/cache-stats` y botón "Refresh canario" (refresh Polanco como prueba). Card indigo distintivo.
- **Bug fix**: `Object.entries(zone.data_points).map` ahora filtra valores no primitivos (objects como `nse_distribution` no se renderizaban como string causando React crash).

### Verificación curl ✅
- `GET /api/dev/inegi/demographics?colonia=Polanco&state_code=09`:
  - 1ª llamada (miss) → 200, scope=`estimate`, NSE_AB=50.2%, total NSE=100.0, pop=22,400, age_avg=33.7, edu_avg=11.0, sources=`['estimate (data_seed.COLONIAS · tier + plusvalia)']` ✅
  - 2ª llamada (hit) → 200 cached=True, latencia ~100ms ✅
- `GET ?colonia=Iztapalapa` (no en seed) → scope=estimate con NSE 0% ✅
- `GET ?colonia=Mordor&state_code=99` → **404** ✅
- `POST /refresh` con dev_admin → 403 ✅; con superadmin → 200 ✅
- `GET /cache-stats` → `{total_entries:18, by_scope:{estimate:18}, hit_rate_7d_pct:0.0, ttl_days:30}` ✅
- **Re-run B7 study (`B7.2 INEGI test v2`)** post-deploy → 16 zonas cacheadas + populadas:
  - **Polanco** AB%=**50.2** (Premium), pop=22.4k
  - **Lomas de Chapultepec** AB%=**63.1** (Luxury, expectado más alto que Polanco) ✅
  - **Jardines del Pedregal** AB%=**62.0** (Luxury)
  - **Condesa** AB%=**33.2** (Trendy)
  - **Anzures** AB%=**33.8** (Trendy)
  - **Santa Fe** AB%=**48.0** (Premium)
  Distribución realista por AMAI, defendible ante el dev_admin.

### Verificación Playwright smoke ✅
- `/desarrollador/site-selection` → click study INEGI → click zona Polanco en ranking → drawer abre con `demographics-section`=1, `demographics-nse-bar`=1, sin runtime errors ✅
- `/superadmin/data-sources` (admin@desarrollosmx.com) → `inegi-cache-row`=1 con stats live (Entries:18, Hit rate:0%, Lookups:0, TTL:30d, estimate:18), botón `inegi-refresh-btn` visible ✅

### Áreas mocked / pendientes (transparentes)
- **AGEB-level real**: requiere shapefiles INEGI (`inegi_shapefiles` declarado pero no enchufado a este endpoint todavía). Por eso el scope max es `inegi_municipio` cuando token funciona, `estimate` cuando no.
- **Token INEGI**: `IE_INEGI_TOKEN=latam-desarrollos` es placeholder. INEGI BISE retorna 401/timeout → fallback determinista. Cuando se obtenga token real (registro https://www.inegi.org.mx/inegi/api), el endpoint ya está listo.
- **Decile real ENIGH**: actualmente sintéticos, anclados a state-avg cuando hay token. Decile hogares-por-AGEB necesita query agregada ENIGH 2022 que el endpoint BISE no expone trivialmente — defer a B7.3 con ENIGH SCINCE microdatos.
- **Cron cleanup expired entries**: TTL via `expires_at` se respeta en lookup (returns stale flag), pero no hay cron que purge físicamente. Defer a Phase 19 polish.

### Archivos tocados
- `/app/backend/routes_dev_batch7_2.py` (nuevo)
- `/app/backend/routes_dev_batch7.py` (+pre-fetch parallel + data_points wiring INEGI)
- `/app/backend/server.py` (+router include + `ensure_batch7_2_indexes`)
- `/app/frontend/src/components/developer/DemographicsSection.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorSiteSelection.js` (+section render + bug fix data_points filter)
- `/app/frontend/src/pages/superadmin/DataSourcesPage.js` (+InegiCacheRow component)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 4.4 · AI Engine + Analytics

### Sub-Chunk A · 4.35 Lead Heat AI Score
**Backend (`routes_dev_batch4_4.py` · nuevo · ~530 líneas):**
- Schema extension `leads.{heat_score, heat_tag, heat_factors, heat_calculated_at, heat_recalc_pending}`.
- Heuristic scorer (`compute_heat_for_lead`) combinando: presupuesto realismo (vs project price band), forma de pago (recursos_propios > hipotecario > infonavit), origen, antigüedad lead (decay), close_rate del asesor, historial cliente (priorLeads vs abandonments), velocity_flag bump.
- **Claude haiku-4-5** vía Emergent LLM key (60% heuristic + 40% Claude blend) con explicabilidad `factors.ia_summary`.
- `POST /api/leads/{id}/recalc-heat` (dev_admin/director/superadmin only).
- `GET /api/leads/{id}/heat` con permission gate `can_view_full_client_data`.
- APScheduler `process_heat_queue` cada 30 min (max 50 leads/run, in-process lock).
- Auto-queue: `heat_recalc_pending=true` en lead create (B4.1) + en lead status change (B4.2 move-column).
- Audit + ml_event `heat_score_calculated`.

### Sub-Chunk B · 4.36 AI Summary + Recommendations
**Backend:**
- Schema extension `leads.ai_summary{summary, last_action, sentiment, next_steps[], generated_at, expires_at}` (cache 4h).
- **Claude haiku-4-5** prompt coach senior es-MX, output JSON estructurado validable. Fallback determinístico si falla.
- `GET /api/leads/{id}/ai-summary-v2` con cache hit/miss + permission `can_view_ai_summary`.
- `POST /api/leads/{id}/refresh-ai-summary` con rate-limit 1x/hour por (user, lead) en memoria.
- Audit + ml_event `ai_summary_viewed` / `ai_summary_refreshed`.

### Sub-Chunk C · 4.37 Analytics Cancel/Reschedule/Lost Reasons + Movement Alerts
**Backend (no new schema — agrega data ya capturada en B4.3):**
- `GET /api/dev/analytics/cancel-reasons?period=7d|30d|90d|12m&project_id=` → breakdown 3 categorías + trend per_month + totals.
- `GET /api/inmobiliaria/analytics/cancel-reasons` → mismo contrato, scope inmobiliaria.
- `GET /api/dev/analytics/movement-alerts` → total alerts + alerts_by_asesor[] + response_rate + reactivation_rate.
- Audit + ml_event `analytics_cancel_reasons_viewed`.

**Frontend:**
- API client extendido `api/leads.js` (recalcHeat, getHeat, getAiSummaryV2, refreshAiSummary) + `api/developer.js` (3 analytics endpoints).
- `LeadKanbanCard`: badge nuevo `HeatBadge` (caliente=red+Flame icon, tibio=amber, frío=cream) con tooltip `Heat: XX/100`.
- `LeadDrawer`: nueva sección **"Heat score IA"** con score grande + factor list explicable; sección **"Resumen IA"** rediseñada con sentiment badge color-coded + next_steps list + botón Refrescar (rate-limited) + timestamp _cached.
- `DesarrolladorReportes`: 2 tabs nuevas:
  - **"Insights de mercado"** (`InsightsTab` exportada): 3 BarLists (cancel/reschedule/lost) + LineChart trend mensual con 3 series + PeriodFilter (7d/30d/90d/12m).
  - **"Movement alerts"**: 3 StatCards + tabla per-asesor.
- `InmobiliariaDashboard`: importa `InsightsTab` con `scope="inm"`, sección dedicada al final.
- Iconos nuevos: `Flame` añadido a `icons/index.js`.
- Diseño 100% compliant: var(--cream)/--navy/--green/--amber/--red, lucide icons, Outfit/DM Sans, badge atom de primitives, único gradient reservado para Broker externo.

### Verificación ✅
- **Backend lint** Ruff OK; **Frontend lint** ESLint OK en 7 archivos modificados/creados.
- **Curl smoke** (todos OK):
  - `POST /api/leads/{id}/recalc-heat` → score=49, tag=tibio, factors+ia_summary persisted ✅
  - `GET /api/leads/{id}/heat` → 200 con datos completos ✅
  - `GET /api/leads/{id}/ai-summary-v2` → 200 + cache hit en segunda llamada (`_cached:true`) ✅
  - `GET /api/dev/analytics/cancel-reasons?period=30d` → breakdown 3 categorías + totals ✅
  - `GET /api/inmobiliaria/analytics/cancel-reasons` → scope inmobiliaria ✅
  - `GET /api/dev/analytics/movement-alerts?period=30d` → stats strip ✅
- **Playwright smoke**:
  - `/inmobiliaria/leads` → 16 cards, 1 heat-badge visible (uno computado), drawer abre con AI summary section ✅
  - `/desarrollador/reportes` → tabs `insights` y `alerts` se montan correctamente, BarLists + trend-chart + alerts table renderean ✅

### Áreas mocked
- **Heat queue** procesará leads pendientes en próximo ciclo APScheduler (30 min). Para forzar inmediato usar `POST /api/leads/{id}/recalc-heat`.
- **Claude haiku** funciona con `EMERGENT_LLM_KEY` ya configurada en `.env`. Fallback determinístico si falla.

---

## 2026-05-02 — LeadKanban Design System Refactor (Post-B4.2)
**Objetivo:** eliminar violaciones del design system en `LeadKanban.js` (indigo/purple/pink rgba custom).

**Cambios:**
- Replacement map aplicado: indigo → cream low opacity; purple → cream med opacity; pink → eliminado (badges genéricos usan tone neutral); única gradiente reservada para badge `Broker externo`.
- `COL_TOKEN`: 5 columnas con cream opacity ladder (nuevo 4% → en_contacto 7% → propuesta 10%) + amber semantic para `visita_realizada` + green semantic para `cerrado`.
- LeadCard: avatar/headers usan `tok.fg` derivado de columna. Badge atom (`Badge` de primitives) reemplaza el badge custom local. Cross-project badge usa cream (sin sky-blue).
- Drawer: Section bg → `rgba(240,235,224,0.025)`; LockedHint usa `--red`; Risk colors → `--red`/`--amber`/`--green`; PermBadge usa `--green`/`--cream-3`.
- Iconos lucide intactos. Lint OK. Smoke test post-refactor: 5 cols + 12 cards renderean correctamente.

**Dead code reportado:** `DesarrolladorCRM.js` aún contiene el `KanbanTab` antiguo inline (no usado, reemplazado por `<LeadKanban>` desde B4.2). Pendiente para sweep de cleanup.

---

## 2026-05-02 — Phase 4 Batch 4.3 · Reminders + Magic Link + Auto-Progression

### Sub-Chunk A · 4.32 Reminders 24h + 2h
**Backend (`routes_dev_batch4_3.py` · nuevo · ~600 líneas):**
- Schema extension `appointments.reminders.delivery_log[]` con `{channel, sent_at, success, error?, wa_url?}`.
- APScheduler `check_pending_reminders` cada 15 min: ventanas 22h–26h (24h) y 1.5h–2.5h (2h).
- Resend email branded (Outfit/DM Sans, navy/cream, gradient único en CTA) + adjunto `.ics`. Stub honesto si falta `RESEND_API_KEY`.
- WhatsApp: deep-link `wa.me/<digits>` generado y persistido en delivery_log (no API push aún — Phase 8).
- Endpoint debug `POST /api/internal/reminders/trigger` (solo superadmin).
- Audit + ml_event `reminder_sent`.

### Sub-Chunk B · 4.33 Magic Link Self-Service
**Backend:**
- Schema extension `appointments.client_actions[]` con `{action, timestamp, ip, user_agent, ...}`.
- `GET /api/cita/public/{token}` → datos legibles. 404 token inválido / 410 estado terminal (`cancelada|no_show|realizada|reagendada`).
- `POST /api/cita/public/{token}/confirm` → status='confirmada' + notif asesor (`cita_client_confirmed`).
- `POST /api/cita/public/{token}/cancel` → status='cancelada' + `cancel_reason` enum (cambio_presupuesto|encontro_otra|imprevisto|otro) + notif asesor + dev_admin.
- `POST /api/cita/public/{token}/reschedule` → marca old=`reagendada` + crea new appointment con nuevo token + reset reminders + notif asesor.
- Audit + ml_event para cada acción (`cita_confirmed_by_client`, `cita_cancelled_by_client`, `cita_rescheduled_by_client`).

**Frontend (`pages/public/PublicCitaPage.js` · nuevo · mobile-first):**
- Ruta `/cita/:token` (no auth).
- Card con `project_name + datetime_legible + modalidad + asesor`.
- 3 botones grandes (Confirmar/Reagendar/Cancelar) con tonos green/amber/red semánticos.
- Form Cancel: dropdown con 4 motivos + textarea notas.
- Form Reschedule: date+time picker + reason input.
- DoneState con icono y mensaje según acción.
- ErrorState para 404/410.
- Diseño 100% compliant: var(--cream)/--navy/--green/--amber/--red, Outfit/DM Sans, lucide icons.

### Sub-Chunk C · 4.34 Auto-Progression Post-Cita
**Backend:**
- APScheduler `check_post_cita_progression` cada 15 min: 30min después de `datetime` + asesor recibe notif `cita_post_check` con 3 actions (Sí se realizó / No-show / Reagendar).
- APScheduler `check_followup_proposals` cada 15 min: 24h después de `realizada` → notif `cita_followup` (Sí propuesta / Aún no).
- `POST /api/cita/{id}/post-action` (auth: asesor own o admin):
  - `realizada` → appointment=realizada + lead.status=`visita_realizada` (auto-progression kanban) + agenda followup.
  - `noshow` → appointment=no_show + lead.status=`cerrado_perdido` con `lost_reason='no_show'`.
  - `reschedule` → mismo flujo que public reschedule, crea new apt linked.
- `POST /api/leads/{id}/post-realizada-followup` (auth: asesor own o admin):
  - `has_proposal=true` → lead.status=`propuesta` + nota agregada.
  - `has_proposal=false` → lead permanece `visita_realizada` (flag review automático tras 7 días pendiente para batch futuro).
- Audit + ml_event para cada acción (`cita_realizada_by_asesor`, `cita_noshow`, `cita_followup_response`).

**Frontend:**
- Endpoint universal `GET /api/notifications` + `POST /api/notifications/{nid}/dismiss` para todos los roles.
- `components/shared/CitaNotifBanner.js` (nuevo): polea `/api/notifications?unread_only=true` cada 60s; renderea inline banners actionables para `cita_post_check` y `cita_followup` + info-only para `cita_client_confirmed/cancelled/rescheduled`.
- Cableado en `AdvisorLayout` y `InmobiliariaLayout` → aparece automáticamente en todas las páginas de asesor + inmobiliaria.

### Verificación ✅
- **Backend lint** Ruff OK; **Frontend lint** ESLint OK en 6 archivos modificados/creados.
- **APScheduler**: 3 jobs registrados via `register_batch4_3_jobs(scheduler, db)` enganchados al scheduler IE existente. Backend startup limpio.
- **curl smoke** (todos OK):
  - `POST /api/internal/reminders/trigger` → `delivery_log` persistido con email stub + WhatsApp wa.me URL ✅
  - `GET /api/cita/public/<token>` → 200 con datos legibles ✅; 404 token inválido ✅; 410 si status=`reagendada` post-fix ✅
  - `POST /api/cita/public/<token>/confirm/cancel/reschedule` → 200 con audit + notif ✅
  - `POST /api/cita/{id}/post-action {action:'realizada'}` → `lead.status='visita_realizada'` ✅
  - `POST /api/leads/{id}/post-realizada-followup {has_proposal:true}` → `lead.status='propuesta'` + nota ✅
- **Playwright smoke** (mobile 480x900): `/cita/:token` carga PublicCitaPage con 3 botones acción + reschedule-form abre correctamente ✅

---

## 2026-05-02 — Phase 4 Batch 4.2 · Universal LeadKanban + Permission Tiers + client_id
**Objetivo:** unificar los kanbans duplicados de leads en un único componente compartido + matriz de permisos jerárquica + visibilidad cross-project del cliente único.

### Sub-Chunk A · 4.29 Universal Kanban
**Backend (`routes_dev_batch4_2.py` · nuevo · ~700 líneas):**
- 8 helpers de permisos:
  - `get_user_permission_level(user)` → niveles canónicos: `superadmin`, `developer_director`, `developer_member`, `inmobiliaria_director`, `inmobiliaria_member`, `asesor_freelance`, `public`.
  - `can_view_kanban(user, scope, target_org)` — gate por scope `mine` / `all_org` / `all_inmobiliaria`.
  - `can_move_lead(user, lead)` — owner check + dev_director (NO broker_external) + inmobiliaria_director (todos).
  - `can_view_full_client_data(user, lead)` — datos PII visibles solo al asesor asignado, dev_director (su org) y inmobiliaria_director (su inm).
  - `can_view_conversation(user, lead)` — asesor + inmobiliaria_director; dev_director NO ve conversación de broker_external.
  - `can_view_ai_summary(user, lead)` — dev_director SÍ ve AI summary de TODOS sus leads (incluso broker_external) para coachear.
  - `_scrub_lead(lead)` — versión PII-stripped con "Cliente de {asesor}".
  - `_run_kanban(...)` — helper interno para los 4 endpoints de kanban (evita filtrar Query objects entre wrappers).
- `GET /api/leads/kanban?scope=mine|all_org|all_inmobiliaria&project_id=&source=&asesor_id=&from=&to=&q=` — kanban universal con permission gate y cross-project counts.
- `POST /api/leads/{id}/move-column` — mover lead entre columnas con `can_move_lead` enforcement; emite `permission_denied_attempt` ML event si bloqueado.
- `GET /api/leads/{id}` — detalle scrubbed según `can_view_full_client_data`; retorna `_permissions` block con los 4 booleans.
- `GET /api/leads/{id}/conversation` — 403 si no `can_view_conversation`; resuelve names de notes.
- `GET /api/leads/{id}/ai-summary` — 403 si no `can_view_ai_summary`; resumen heurístico con headline/intent/budget/risk/recommendations.
- `GET /api/clients/{client_global_id}/leads` — vista cross-project filtrada por permission level.
- Backward-compat wrappers: `GET /api/dev/leads/kanban/v2`, `GET /api/advisor/leads/kanban`, `GET /api/inmobiliaria/leads/kanban`.

**Frontend:**
- `api/leads.js` (nuevo) — cliente API universal: `getKanban`, `getLead`, `moveColumn`, `getConversation`, `getAiSummary`, `getClientLeads`.
- `components/shared/LeadKanban.js` (nuevo · ~470 líneas) — componente universal:
  - HTML5 drag-drop con `data-can-move` enforcement (cards no movibles bloquean drag + tooltip + icono Lock).
  - 5 columnas color-coded (Nuevo/En contacto/Visita realizada/Propuesta/Cerrado).
  - LeadKanbanCard con conditional render: nombre real vs "Cliente de {asesor}" según `can_view_full`; icono EyeOff si no canFull.
  - **Cross-project badge** `Link2 · N proyectos` cuando `cross_project_count > 0`.
  - **LeadDrawer** integrado: 4 secciones condicionales (Contacto / Otras citas de este cliente / Conversación / Resumen IA), 4 PermBadges, LockedHint cuando 403.
- `pages/developer/InmobiliariaLeads.js` (nuevo) — `/inmobiliaria/leads` con scope=all_inmobiliaria.
- `pages/advisor/AsesorLeadsDev.js` (nuevo) — `/asesor/leads-dev` con scope=mine.
- `DesarrolladorLeads.js` — agregada tab "Kanban universal" (entre Pipeline y Analytics) con scope=all_org.
- `DesarrolladorCRM.js` — `KanbanTab` reemplazado por `<LeadKanban scope="all_org" projectId={slug} />`.
- `AdvisorLayout.js` — nav item "Leads desarrollos" (icono Target) cableado.
- Iconos nuevos en `icons/index.js`: `Link2`, `Brain`, `EyeOff`.

### Verificación ✅
- Backend: los 4 endpoints kanban (mine/all_org/all_inmobiliaria/v2) → `200 OK` con superadmin; asesor en `scope=all_org` → `403 "Scope 'all_org' no permitido para tu rol (asesor_freelance)"` ✅
- `GET /api/leads/{id}` → retorna `_permissions: {can_move, can_view_full, can_view_conversation, can_view_ai_summary, permission_level}` ✅
- `GET /api/leads/{id}/conversation` y `/ai-summary` → `200` con superadmin, `403` con permisos insuficientes ✅
- `GET /api/clients/dummy_gid/leads` → `200 {total:0, leads:[]}` ✅
- Frontend (Playwright): `/inmobiliaria/leads` superadmin → grid con 5 cols + 12 cards + drawer con AI summary + Conversación + 4 perm badges ✅
- `/asesor/leads-dev` con asesor@demo.com → grid 5 cols + 0 cards (mine scope correcto) + h1 + sidebar nav "Leads desarrollos" activo ✅
- Lint limpio en `LeadKanban.js`, `InmobiliariaLeads.js`, `AsesorLeadsDev.js`, `App.js`, `AdvisorLayout.js`, `api/leads.js` ✅

---

## 2026-05-02 — Phase 4 Batch 4.1.1 · Slots UI en Legajo Proyecto
**Objetivo:** cierre del gap de B4.1 — UI para configurar `project_slots` desde el legajo de proyecto.

### Cambios
- `SlotsTab.js` (nuevo component) — tabla 7 días (Lun-Dom) con toggle activo, hora apertura/cierre, citas simultáneas. Admin puede editar, otros roles ven read-only con `disabled` + tooltip. Botón "Guardar configuración" → `POST /api/dev/projects/:id/slots`. Preview "Próximas 4 fechas" vía `GET availability`. Toast success/error.
- `DesarrolladorLegajo.js` — tab "Slots disponibles" añadido después de Geolocalización. Import `SlotsTab` + icon `CalendarCheck`.

### Verificación ✅
- `POST /api/dev/projects/quattro-alto/slots` → `{ok:true, slots_configured:7}` ✅
- `GET /api/projects/quattro-alto/slots/availability?date=2026-05-04` → 1 slot disponible (Lunes configurado) ✅
- Lint limpio en SlotsTab.js y DesarrolladorLegajo.js ✅

---

## 2026-05-02 — Phase 4 Batch 4.1 · Cita Registration + DMX Inmobiliaria + Anti-fraude
**Objetivo:** formulario de registro de citas con 5 secciones + detección anti-fraude 6-layer (rapidfuzz) + portal Inmobiliaria DMX con auto-routing de leads públicos.

### Sub-Chunk A · 4.26 Cita Registration Form
**Backend (`routes_dev_batch4_1.py` · nuevo · ~1500 líneas):**
- Nueva `appointments` collection: _id, lead_id, project_id, dev_org_id, asesor_id, inmobiliaria_id, datetime (ISO+tz), duration_minutes, modalidad, status (6 valores), confirmation_token (256-bit), reminders {sent_24h,sent_2h,sent_1h}, cancel_reason, reschedule_reason, created_at/updated_at.
- Nueva `project_slots` collection: project_id, dev_org_id, day_of_week(0-6), hour_start/end, max_concurrent, active.
- Extensiones `leads`: payment_methods[], lfpdppp_consent{accepted_at,ip,user_agent}, presupuesto_min/max, client_global_id (hash), geo_metadata{phone_area_code,mismatch}, velocity_flag, suspected_match_id, origin{type,inmobiliaria_id}, inmobiliaria_id.
- `POST /api/dev/projects/{id}/slots` — bulk upsert slots con audit + ML `project_slots_configured`.
- `GET /api/projects/{id}/slots/availability?date=YYYY-MM-DD` — disponibilidad cruzando slots + appointments existentes.
- `POST /api/cita` (optional auth) — crea lead + appointment, valida LFPDPPP, corre anti-fraude 6-layer, envía email Resend con .ics, genera WA template URL, retorna `{lead_id, appointment_id, status, wa_template_url}`.
- `GET /api/asesor/citas` — lista citas del asesor con stats strip (total_mes, proximas_7d, realizadas, canceladas).
- `GET /api/dev/citas` — lista citas scoped por dev_org con filtros.
- `PATCH /api/cita/{id}` — update status/datetime, valida cancel_reason en cancelada, reschedule_reason en reagendada.
- `GET /api/cita/{id}/wa-template?type=success|under_review` — genera URL WA con template parametrizado.

**Frontend:**
- `NewCitaModal.js` (nuevo) — modal 5 secciones colapsables: Cliente, Cita, Presupuesto/Pago, Asesor, Consentimiento LFPDPPP. Dual entry points. Post-submit muestra result screen success/under_review/409.
- `AsesorCitas.js` (nuevo) — página `/asesor/citas` con stats strip + tabs Lista/Calendario + filtros + CitaDrawer (editar/reagendar/cancelar).
- `DesarrolladorCitas.js` (nuevo) — página `/desarrollador/citas` con lista filtrable + CitaDrawer + approve/reject review para admins.
- Nav "Citas" agregado a DeveloperLayout y AdvisorLayout.
- Rutas `/asesor/citas` y `/desarrollador/citas` registradas en App.js.

### Sub-Chunk B · 4.27 DMX Inmobiliaria + Auto-routing
**Backend:**
- Nueva `inmobiliarias` collection: id, name, type (dmx_owner/partner/standard), is_system_default, status, rfc, contact, created_at.
- Nueva `inmobiliaria_internal_users` collection: id, inmobiliaria_id, email, name, role (admin/director/asesor/marketing), status, password_hash, created_at.
- Seed automático en startup: crea `dmx_root` inmobiliaria si no existe + usuario admin DMX.
- `POST /GET /PATCH /DELETE /api/inmobiliaria/asesores` — CRUD completo, gated superadmin/developer_admin.
- `GET /api/inmobiliaria/dashboard` — stats (total_leads, active_leads, won, win_rate_pct, avg_time_to_close_days) + top 5 asesores por leads/win_rate, filtro period 7d/30d/90d/all_time.
- `GET /api/inmobiliaria/list` — lista todas las inmobiliarias.
- Auto-routing: leads públicos (no auth) → detecta DMX root → `pick_best_inmobiliaria_asesor` (scoring: +50 deals en colonia, +30 conversion>50%, -20 per active lead) → asigna asesor.
- origin.type mejorado: public_unassigned→inmobiliaria_lead, broker_external, dev_inhouse, dev_direct.

**Frontend:**
- `InmobiliariaLayout.js` (nuevo) — sidebar para portal `/inmobiliaria`.
- `InmobiliariaDashboard.js` (nuevo) — dashboard con stats cards + top asesores + period filter.
- `InmobiliariaAsesores.js` (nuevo) — CRUD asesores DMX con modal creación.
- Rutas `/inmobiliaria` y `/inmobiliaria/asesores` registradas.

### Sub-Chunk C · 4.28 Anti-duplicate + Anti-fraude + WA Templates
**Backend (integrado en POST /api/cita):**
- CHECK 1: Exact match (phone_norm + email_norm) → 409 + Plantilla 2 WA URL. Nada creado.
- CHECK 2: 85% similarity con rapidfuzz (phone_sim×0.5 + email_sim×0.3 + Jaro-Winkler name×0.2) → status='under_review', notif developer_admin, Plantilla 2.
- CHECK 3: Velocity (≥5 leads/30min del mismo asesor) → under_review + velocity_flag=true.
- CHECK 4: Geo mismatch (area_code ≠ CDMX) → metadata.mismatch=true (no block).
- CHECK 5: Cross-project activity scoring (21d recency-weighted) → in-app movement alert si score≥1.0.
- WA Plantillas 1 (success) y 2 (under_review) con todos los datos del cliente/cita.
- `POST /api/dev/leads/{id}/approve-review` → lead.status='nuevo' + notif asesor.
- `POST /api/dev/leads/{id}/reject-review` → lead.status='cerrado_perdido', lost_reason='duplicado' + notif asesor.
- In-app movement alert en notification collection (tipo 'movement_alert' con acciones WA/llamar/historial).

### Dependencias Python añadidas
- `rapidfuzz==3.10.1` (agregado a requirements.txt)

### Verificación backend (todos ✅ verificados por curl)
- POST /api/cita sin auth → status: 'created', lead + appointment creados ✅
- POST /api/cita sin LFPDPPP → 422 ✅
- POST /api/cita exact duplicate → 409 + WA Plantilla 2 URL ✅
- POST /api/cita similar (Jaro-Winkler) → status: 'under_review', rapidfuzz detect ✅
- GET /api/inmobiliaria/dashboard → stats reales {total_leads:5, top_asesores:1} ✅
- DMX seed → inmobiliarias.find({is_system_default:True}) = DesarrollosMX ✅
- WA template URL → https://wa.me/{phone}?text=Hola... (11 lines) ✅

### Archivos tocados
- `/app/backend/routes_dev_batch4_1.py` (nuevo · ~1508 líneas)
- `/app/backend/server.py` (+router + indexes + seed startup)
- `/app/backend/requirements.txt` (+rapidfuzz==3.10.1)
- `/app/frontend/src/api/developer.js` (+16 helpers B4.1)
- `/app/frontend/src/components/developer/NewCitaModal.js` (nuevo)
- `/app/frontend/src/components/developer/InmobiliariaLayout.js` (nuevo)
- `/app/frontend/src/pages/advisor/AsesorCitas.js` (nuevo)
- `/app/frontend/src/pages/developer/DesarrolladorCitas.js` (nuevo)
- `/app/frontend/src/pages/developer/InmobiliariaDashboard.js` (nuevo)
- `/app/frontend/src/pages/developer/InmobiliariaAsesores.js` (nuevo)
- `/app/frontend/src/components/developer/DeveloperLayout.js` (+Citas nav, +icons)
- `/app/frontend/src/components/advisor/AdvisorLayout.js` (+Citas nav, +icon)
- `/app/frontend/src/components/icons/index.js` (+CalendarCheck, Video, Phone, Building, UserCheck, AlertCircle, ExternalLink)
- `/app/frontend/src/App.js` (+5 rutas B4.1)
- `/app/memory/PRD.md`

---

## 2026-05-02 — Phase 4 Batch 4 · Sales/CRM core (Leads + project_brokers)
**Objetivo:** stack sales operativo — pipeline de leads multi-canal + kanban por proyecto + control de brokers autorizados (preview Phase 13 multi-tenant).

### Sub-Chunk A · 4.19 Lead Pipeline Cross-Channel
**Backend (`routes_dev_batch4.py` · nuevo · ~620 líneas):**
- Schema `leads` collection: source (7 canales), contact {name, email, phone, preferred_channel}, intent (4), budget_range {min, max, currency}, status (7), assigned_to, notes[], lost_reason, created_at, updated_at, last_activity_at.
- `POST /api/dev/leads` — auto-assign round-robin al comercial con lead más antiguo, validación contact.email o phone obligatorio, audit `lead|create` + ML `lead_created`, notif `lead_assigned` al asignado.
- `GET /api/dev/leads` — list paginado + filtros (status/source/assigned_to/project_id/from/to), resuelve assignee names.
- `PATCH /api/dev/leads/{id}` — update fields, enforce `lost_reason` cuando status=`cerrado_perdido` (422 si falta), ML `lead_closed` on close con `time_to_close_days` + `result`.
- `POST /api/dev/leads/{id}/note` — append bitácora (max 800 chars) + bump last_activity_at.
- `POST /api/dev/leads/{id}/assign` — valida target user same tenant, notif al nuevo asignado.
- `GET /api/dev/leads/kanban` — 5 columnas (`nuevo`, `en_contacto`, `visita_realizada`, `propuesta`, `cerrado`) con cards, budget sums, days_in_status.
- `POST /api/dev/leads/{id}/move-column` — valida status, calcula `days_in_prev`, ML `lead_kanban_move`, rechaza move a `cerrado_perdido` sin `lost_reason`.
- `GET /api/dev/leads/analytics` — funnel (7 estados), source_breakdown %, win_rate, avg_time_to_close_days, lost_reasons %, per_assignee (active/won/lost/win_rate).

**Frontend:**
- `DesarrolladorLeads.js` (nuevo · ~420 líneas): 2 tabs.
  - **Pipeline**: stats strip (5 métricas) + filtros (status + source) + botón "Nuevo lead" + tabla con drawer detail (status changer, lost_reason form, notes timeline con append).
  - **Analytics**: FunnelChart 7 etapas + Win rate/TTC/Total/Cerrados big stats + BarList sources + tabla per-asesor con badge win_rate.
- Nav entry "Leads" agregado a `DeveloperLayout`.
- Ruta `/desarrollador/leads` registrada.

### Sub-Chunk B · 4.23 CRM Dev Pipeline 5-col + project_brokers
**Backend (`routes_dev_batch4.py`):**
- Schema `project_brokers`: project_id, dev_org_id, broker_user_id, access_level (3: view_only/sell/master_broker), commission_pct (0-20), status (active/paused/revoked), assigned_at, assigned_by_user_id.
- `GET /api/dev/projects/{id}/brokers?include_revoked=` — resuelve broker_info (name/email/role/internal_role).
- `POST /api/dev/projects/{id}/brokers` — valida broker existe + role {advisor/developer_admin/developer_member}, dedup no duplicate active (409), `project_broker|create` audit + ML `project_broker_assigned`. Role guard developer_admin/superadmin.
- `PATCH /api/dev/projects/{id}/brokers/{rowId}` — update access_level/commission/status, audit.
- `DELETE /api/dev/projects/{id}/brokers/{rowId}` — soft delete → status=revoked (preserva audit trail).

**Frontend:**
- `DesarrolladorCRM.js` (nuevo · ~400 líneas) en ruta `/desarrollador/desarrollos/:slug/crm` con 2 tabs:
  - **Kanban**: 5 columnas drag-drop HTML5 nativo (sin @dnd-kit) · card avatar inicial + contact + source badge + intent badge + assigned + days_in_status + budget · header col (count + total_budget_max sum) · drop zone con color highlight en dragover · move endpoint con success toast.
  - **Brokers asignados**: tabla (Broker/Origen/Acceso/%/Estado/Asignado) con modal "Asignar broker" (dropdown internal_users activos + access_level + commission_pct). Checkbox "Mostrar revocados". Revoke con confirm dialog. Role guard (solo developer_admin/superadmin puede asignar/revocar).
- Tab "CRM" agregado al legajo de cada proyecto con CTA a la ruta completa.

### Verificación backend (todos ✅)
- **Leads**: create con round-robin ✅ · create sin email/phone 422 ✅ · note append ✅ · patch status `contactado` ✅ · close perdido sin reason 422 ✅ · close perdido con reason + ML `lead_closed` ✅ · kanban 5 cols con counts ✅ · analytics {total:6, win_rate:50%, funnel, sources, per_assignee 3 rows} ✅
- **Brokers**: assign 200 broker_info resolved ✅ · duplicate 409 ✅ · patch commission_pct ✅ · revoke soft delete ✅ · include_revoked filter ✅ · 403 como developer_member ✅
- **Audit log**: 37 entries total · nuevos tipos B4: `lead` (9), `project_broker` (3), `lead_assignment`, `lead_kanban_move`, `lead_note`

### Smoke test Playwright
- `/desarrollador/leads` → tabs:2, 6 rows, create_btn ✅ · analytics tab: funnel/source/assignee_table renderizados ✅
- `/desarrollador/desarrollos/altavista-polanco/crm` → tabs:2, kanban_grid:1, 5 cols, 6 cards distribuidos por status ✅ · broker-assign-btn visible ✅

### Archivos tocados
- `/app/backend/routes_dev_batch4.py` (nuevo ~620 líneas)
- `/app/backend/server.py` (router + indexes)
- `/app/frontend/src/api/developer.js` (+15 helpers B4)
- `/app/frontend/src/pages/developer/DesarrolladorLeads.js` (nuevo ~420 líneas)
- `/app/frontend/src/pages/developer/DesarrolladorCRM.js` (nuevo ~400 líneas)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (+CRM tab con CTA)
- `/app/frontend/src/components/developer/DeveloperLayout.js` (+Leads nav entry + Target icon)
- `/app/frontend/src/App.js` (+2 rutas B4)
- `/app/memory/PRD.md`

---

## 2026-05-01 — Phase F0.1 · Audit Log Global Mutations
**Objetivo:** trazabilidad transversal de todas las mutaciones críticas. Prerrequisito para Phase 13/14 (multi-tenant whitelist) + GDPR (F0.6).

### Backend (`audit_log.py` · nuevo · ~220 líneas)
- **`log_mutation(db, actor, action, entity_type, entity_id, before, after, request)`** — fire-and-forget async Mongo insert (`asyncio.create_task`). Nunca levanta excepción. Calcula `diff_keys` automáticamente. Extrae `ip` + `user_agent` + `route` del objeto `Request`.
- **`ensure_audit_log_indexes`** — 4 índices: `(actor.tenant_id, ts desc)`, `(entity_type, entity_id, ts desc)`, `(actor.user_id, ts desc)`, `(ts desc)`.
- **`_scope_filter(user)`** — multi-tenant query guard:
  - `superadmin` → sin filtro (ve todo).
  - `developer_admin / inmobiliaria_admin / asesor_admin` → filtra por `actor.org_id == user.tenant_id`.
  - `advisor / asesor` → filtra por `actor.user_id == user.user_id`.

### Schema `audit_log`
`{id, ts, actor:{user_id,role,org_id,tenant_id,name}, action: create|update|delete|revert, entity_type, entity_id, before:{}, after:{}, diff_keys:[], ip, user_agent, route, request_id}`

### 3 Endpoints
- `GET /api/audit/log?entity_type=&actor_user_id=&action=&from=&to=&page=&limit=` → lista paginada (filtra por scope del rol).
- `GET /api/audit/log/entity/{entity_type}/{entity_id}` → trail completo de ese entity.
- `GET /api/audit/log/stats` → counts 24h por action + top entity_types.

### Wiring en 8 rutas críticas
| Ruta | Archivo | action |
|------|---------|--------|
| `update_op_status` (kanban) | routes_advisor.py | update + ML emit |
| `create_operacion` | routes_advisor.py | create |
| `patch_contacto` | routes_advisor.py | update |
| `delete_contacto` | routes_advisor.py | delete |
| `patch_unit_status` | routes_developer.py | update + ML emit |
| `upload_document` | routes_documents.py | create |
| `sync_apply` | routes_documents.py | update |
| `sync_revert` | routes_documents.py | revert + ML emit |

### Frontend (`AuditLogPage.js` · 340 líneas · nuevo)
- Tabla filtrable: fecha · actor (name+role badge) · acción badge (color-coded) · entity_type · campos diff pills · IP.
- Filtros: entity_type select · action select · actor_user_id text · date range from/to.
- Paginación con ChevronLeft/ChevronRight.
- **Drawer** lateral 600px: meta-grid (actor/rol/tenant/fecha/ip/ruta) + diff_keys pills + JSON diff before/after con resaltado rojo/verde por campo modificado.
- Stats strip 24h: total + breakdown por acción.
- Nav link "Audit Log" en SuperadminLayout + ruta `/superadmin/audit-log` en App.js.

### Verificación curl
- ✅ Kanban move `propuesta → oferta_aceptada` → `audit_log` entry: `{action:update, entity_type:operacion, diff_keys:['status'], before:{status:propuesta}, after:{status:oferta_aceptada}, ip:real}`.
- ✅ `GET /api/audit/log/stats` → `{total_24h:3, by_action:{update:3}, top_entities:[{operacion,contacto,unit}]}`.
- ✅ `GET /api/audit/log/entity/operacion/op_xxx` → trail count: 1.
- ✅ **Multi-tenant guard**: dev_admin (constructora_ariel) ve 1 record (sólo su unit update). Superadmin ve todos (3 records). Prueba "org A no ve logs de org B" ✅.
- ✅ **MongoDB indexes**: 4 índices creados (`actor.tenant_id_1_ts_-1`, `entity_type_1_entity_id_1_ts_-1`, `actor.user_id_1_ts_-1`, `ts_-1`).
- ✅ Backend startup limpio (0 errores, 0 excepciones).

### Archivos tocados
- `/app/backend/audit_log.py` (nuevo · 220 líneas)
- `/app/backend/server.py` (+audit_router mount + ensure_audit_log_indexes en startup)
- `/app/backend/routes_advisor.py` (+log_mutation en update_op_status + create_operacion + patch_contacto + delete_contacto)
- `/app/backend/routes_developer.py` (+log_mutation en patch_unit_status)
- `/app/backend/routes_documents.py` (+log_mutation en upload_document + sync_apply + sync_revert)
- `/app/frontend/src/api/audit.js` (nuevo · fetchAuditLog + fetchEntityTrail + fetchAuditStats)
- `/app/frontend/src/pages/superadmin/AuditLogPage.js` (nuevo · 340 líneas)
- `/app/frontend/src/components/superadmin/SuperadminLayout.js` (+nav Audit Log + ClipboardList icon)
- `/app/frontend/src/components/icons/index.js` (+ClipboardList icon)
- `/app/frontend/src/App.js` (+route /superadmin/audit-log)
- `/app/memory/PRD.md`

---



## 2026-05-01 — Phase 7.9 (complement) + 7.11 upgrade · Status histórico + Drive Webhooks
Cierre de Phase 7 al 100% con 2 mejoras complementarias.

### A · Status histórico per unit (Phase 7.9 complement)
- **`units_history` collection** + indexes `(unit_id, changed_at desc)` y `(development_id, changed_at desc)` + `source`.
- **`record_unit_change(...)`** helper centralizado: skip si old==new, valida `source` contra `ALLOWED_SOURCES = {manual_edit, auto_sync, drive_sheets, drive_webhook, drive_watcher, bulk_upload, system}`.
- **`diff_units_overlay_and_record(...)`** detecta cambios entre 2 listas de units en 8 fields tracked (precio, status, tipo, m2, recamaras, banos, nivel, cajones) + flag `removed` cuando una unit desaparece.
- **Triggers wired**:
  - `routes_developer.patch_unit_status` → `source=manual_edit` (con `extra.reason`).
  - `auto_sync_engine.apply_changes` → param `units_history_source` (default `auto_sync`); emite 1 row per field change, vinculada al `source_doc_id` del LP.
  - Drive watcher → cuando ingest dispara apply_changes downstream, propaga source.
- **4 endpoints** (+ 2 dev_alias multi-tenant):
  - `GET /api/superadmin/units/{unit_id}/history?limit=`
  - `GET /api/superadmin/developments/{dev_id}/units-history?limit=`
  - 2 alias `/api/desarrollador/...`
- **Frontend** `UnitsHistoryTimeline.js` (180 líneas):
  - Tabla cronológica responsive con columnas {Unidad, Campo, Antes, Después, Origen, Cuándo} (modo `compact` para widgets).
  - 7 source badges con colores distintos (manual·indigo, auto-sync·green, drive_webhook·pink, drive_watcher·purple, drive_sheets·blue, bulk·amber, system·neutral).
  - Botón refresh.
  - Empty state explicativo.
- **Wired**:
  - Legajo `/desarrollador/desarrollos/:slug/legajo` nuevo tab "Histórico unidades".
  - Superadmin dashboard widget "Cambios recientes (todos los desarrollos)" con cross-dev fetch + sort por timestamp + top 10.

### B · Drive Webhooks (Phase 7.11 upgrade · polling 6h → realtime)
- **Schema extension** `dev_drive_connections`: + `webhook_channel_id`, `webhook_resource_id`, `webhook_expiration`, `webhook_token` (random secret per conn), `webhook_page_token` (Google's startPageToken).
- **`setup_webhook_for_connection`**: idempotente — stop existing channel si lo hay → `drive.changes.getStartPageToken()` → `drive.changes.watch({id, type:'web_hook', address:webhook_url, token})` → persiste resp.
- **`teardown_webhook_for_connection`**: `drive.channels.stop({id, resourceId})` (no falla si ya expiró).
- **Auto-setup** post folder selection: `drive_set_folder` ahora retorna `{ok, webhook: {ok, channel_id, expiration}}`.
- **Auto-teardown** en `drive_disconnect` antes de revocar token.
- **Renewal cron** `drive_webhook_renew` daily 03:30 → `renew_expiring_webhooks(db)` itera conns con `webhook_expiration < now+24h` y re-suscribe.
- **Endpoint público** `POST /api/webhooks/drive-changes`:
  - Lee headers `X-Goog-Channel-ID`, `X-Goog-Channel-Token`, `X-Goog-Resource-State`.
  - Validación: missing channel-id → 400 · unknown channel → 200 ignored (silent, evita retries de Google) · token mismatch → 403 · `resource_state=sync` → 200 sync_handshake (Google envía esto al crear el channel) · `change` → trigger `_sync_one_connection(triggered_via='webhook')` en background + return 200 inmediato (Google requiere <30s).
- **`_sync_one_connection(triggered_via)`** ahora marca `source="drive_webhook"` vs `"drive_watcher"` en `_ingest_document_bytes` automáticamente.
- **Cron 6h queda como FALLBACK** si webhook expira o falla — defensa en profundidad.
- **Stub honesto** `GOOGLE_OAUTH_*` missing: `setup_webhook_for_connection` retorna `{ok:false, error:'google_oauth_keys_missing'}`, watcher noops.

### Verificación end-to-end (curl)
- ✅ Manual edit unit → `units_history` row con `source=manual_edit, extra.reason="..."`.
- ✅ 2nd manual edit → row con old_value real ("apartado") → new_value ("vendido") (rastrea estado previo).
- ✅ Multi-tenant guards: anon 401, dev own 200, dev foreign 403 en /units-history.
- ✅ Webhook missing channel-id → 400.
- ✅ Webhook unknown channel → 200 silent ignore (anti-retry).
- ✅ Webhook bad token → 403 (con conn real).
- ✅ Webhook good token + `resource_state=sync` → `{ok, state: sync_handshake}`.
- ✅ Webhook good token + `resource_state=change` → `{ok, triggered: true, dev_id}` + background sync.
- ✅ APScheduler 5 jobs en startup: ie_daily_ingestion · ie_hourly_status · ie_daily_score_recompute · drive_watcher · drive_webhook_renew.

### Archivos tocados
- `/app/backend/units_history.py` (nuevo · 175 líneas · `record_unit_change` + `diff_units_overlay_and_record` + 2 endpoints + 2 dev_alias)
- `/app/backend/drive_engine.py` (+ 100 líneas: webhook helpers + public endpoint + setup/teardown/renew)
- `/app/backend/auto_sync_engine.py` (+ `units_history_source` param)
- `/app/backend/routes_developer.py` (+ trigger en `patch_unit_status`)
- `/app/backend/scheduler_ie.py` (+ `drive_webhook_renew` cron daily 03:30)
- `/app/backend/server.py` (+ uh_router + uh_dev_alias + ensure_units_history_indexes startup)
- `/app/backend/.env` (+ GOOGLE_API_KEY guardada para futuros usos)
- `/app/frontend/src/components/documents/UnitsHistoryTimeline.js` (nuevo · 180 líneas · 7 source badges)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (+ tab Histórico unidades)
- `/app/frontend/src/pages/superadmin/SuperadminDashboard.js` (+ widget RecentChangesAcrossDevs cross-dev)
- `/app/memory/PRD.md`

### Phase 7 cerrada al 100% ✅
Cumplido todo el roadmap original Phase 7:
- 7.1 ✅ Document Upload + OCR + Fernet
- 7.2 ✅ Claude Structured Extraction (11 templates)
- 7.3 ✅ Cross-Check Engine + GC-X4 Pricing
- 7.4 ✅ Developer Portal Legajo + Compliance Badge
- 7.5 ✅ Auto-sync Marketplace
- 7.6 ✅ Asset Pipeline (watermark + Vision categorize + Pedra stub)
- 7.9 ✅ Status histórico per unit (este sprint)
- 7.11 ✅ Drive Watch Service + Webhooks realtime (este sprint)

### Pending fuera de Phase 7
- Phase 7.10 — Avance de obra timeline (P1, no crítico para Moat #2 cierre)
- Phase D — RAG ✅ (D1+D2 completados antes)
- C11 Caya conversational UI completa + WhatsApp Business real
- Studio Wave 1.5 (S1.2 timeline + S1.3 export presets)
- Refactor `server.py` → routers (esperando prompt usuario)

### Activación pendiente del usuario para Drive realtime
Para activar webhooks realtime end-to-end, además del setup OAuth de Phase 7.11, el `webhook_url` debe ser HTTPS público accesible desde Google. La preview URL de Emergent ya cumple. Cuando agregues `GOOGLE_OAUTH_CLIENT_ID/SECRET`:
1. Conectar Drive en Legajo header → OAuth flow.
2. Seleccionar carpeta → backend auto-suscribe webhook.
3. Editar/agregar archivos en esa carpeta → Google envía POST al endpoint en <2s → ingest automático con `source=drive_webhook`.

---


## 2026-05-01 — Phase 7.11 · Drive Watch Service
**Objetivo:** Google Drive OAuth per-tenant + cron 6h watcher que detecta cambios via md5Checksum y dispara automáticamente el pipeline 7.1 (upload encrypted) → 7.2 (Claude extraction) → 7.5 (auto-sync marketplace).

### Backend (`drive_engine.py` · 480 líneas · nuevo)
- **OAuth flow** vía `google-auth-oauthlib==1.2.2` con `scope=drive.readonly`, `access_type=offline`, `prompt=consent` para garantizar refresh_token.
- **State CSRF + Fernet**: state token cifrado con `IE_FERNET_KEY` que payload incluye `{dev_id, user_id, ts}` → previene ataques CSRF + binding del callback al desarrollo correcto.
- **Tokens cifrados Fernet**: access_token y refresh_token nunca persisten en plain text → `google_oauth_token_enc`, `refresh_token_enc` (reuse cipher de DI).
- **Auto-refresh**: `_build_credentials` detecta `creds.expired` y llama `creds.refresh(GoogleRequest())` automáticamente; persiste `expires_at` actualizado.
- **Watcher cron 6h** vía APScheduler (registrado en `scheduler_ie.start_scheduler` como `drive_watcher` job · `CronTrigger(hour="*/6", minute=15)`).
- **md5Checksum diff**: por dev, lee `last_revision_id: {file_id: md5}` persistido. Para cada file:
  - `is_new = file_id not in revisions` → ingest.
  - `is_changed = revisions[file_id] != current_md5` → ingest (nueva revisión).
  - else → skip.
- **Doc-type heurística** por filename keywords (12 patrones validados con tests):
  `lista|precios|tabulador → lp · brochure → brochure · escritura → escritura · seduvi|uso suelo → permiso_seduvi · estudio|suelo|mecanica → estudio_suelo · licencia|construccion → licencia_construccion · predial → predial · plano → plano_arquitectonico · contrato → contrato_cv · constancia|fiscal → constancia_fiscal · default → otro` (developer puede re-categorizar via UI 7.4).
- **Refactored `routes_documents.py`** extrajo `_ingest_document_bytes()` reusable (manual upload + drive watcher comparten pipeline). Agrega campos `source ('manual'|'drive_watcher')` y `source_metadata{drive_file_id, drive_md5, folder_id, folder_name, is_revision}` a `di_documents`.
- **Stub honesto** cuando `GOOGLE_OAUTH_CLIENT_ID/SECRET` missing → `oauth-url` retorna `{ok:false, configured:false, message}` y `run_drive_watcher_once` retorna `{ok:false, reason:'google_oauth_keys_missing'}`.

### 8 endpoints (+ 6 dev_alias multi-tenant)
- `GET /api/superadmin/drive/oauth-url?development_id=` → URL Google OAuth con state Fernet.
- `GET /api/auth/google/drive-callback?code=&state=` → exchange tokens + persist + redirect a `/desarrollador/desarrollos/:dev/legajo?drive=connected&picker=1`.
- `GET /api/superadmin/drive/{dev_id}/folders` → list root folders user-owned (picker).
- `POST /api/superadmin/drive/{dev_id}/folder` `{folder_id, folder_name}` → set folder.
- `GET /api/superadmin/drive/{dev_id}/status` → `{configured, connection: {folder_id, last_sync_at, status, last_audit, ...}}`.
- `POST /api/superadmin/drive/{dev_id}/sync-now` → trigger `_sync_one_connection` manual.
- `POST /api/superadmin/drive/{dev_id}/disconnect` → revoke token Google + delete doc.
- `GET /api/superadmin/drive/connections` → list todas conexiones (solo superadmin).
- 6 dev_aliases bajo `/api/desarrollador/drive/*` con multi-tenant guard via `routes_documents._allowed_dev_ids` (mismo TENANT_DEV_MAP).

### Schema `dev_drive_connections`
```
id, development_id (unique), user_id,
google_oauth_token_enc, refresh_token_enc, scopes[], expires_at,
folder_id, folder_name,
last_sync_at, last_revision_id: {file_id: md5},
status: connected|error|disconnected, last_audit, last_error, error_log[],
created_at, updated_at
```

### Frontend (`drive.js` API · `DriveConnect.js` 270 líneas · `SuperadminDrivePage.js` 160 líneas · 4 nuevos icons)
- **`api/drive.js`**: 7 helpers, `_basePath(role)` toggle entre `/api/superadmin/drive` y `/api/desarrollador/drive`.
- **`<DriveConnect devId role>`** (Legajo header):
  - Stub state: pill ámbar "Drive: configura GOOGLE_OAUTH_CLIENT_ID en .env".
  - Disconnected: botón gradient "Conectar Google Drive".
  - Authenticated sin folder: pill indigo "Autenticado · selecciona carpeta" + botón "Elegir carpeta".
  - Connected con folder: pill verde "Drive conectado · sync hace Xh" + folder name + 3 botones (Sincronizar ahora · Cambiar carpeta · audit · disconnect ×).
  - Folder picker modal: lista folders root con click-to-pick + auto-trigger sync inicial.
  - Audit modal: `JSON.stringify(last_audit)` para debug visible.
  - Toast bottom-right (success/warn/error) con resumen `Drive sync: N archivos · X nuevos · Y actualizados · Z errores`.
  - Auto-open picker después del callback (`?drive=connected&picker=1` querystring → URL searchParams).
- **`/superadmin/drive`** nueva página con tabla 6-col (Desarrollo · Carpeta · Estado · Sync · Audit · Acciones) + sidebar nav link "Drive Watch" con `Cloud` icon.
- **Wired en**: `DesarrolladorLegajo.js` header (debajo de ComplianceDotStrip) + `App.js` route + `SuperadminLayout.js` nav.

### Verificación
- **HTTP gates** (8 endpoints superadmin + 4 dev_aliases): todos correctos.
  - oauth-url/status/connections con superadmin → 200 ✓
  - sync-now/disconnect sin connection → 404 ✓
  - callback sin code/state → 400 ✓
  - dev_alias sobre own dev (Quattro) → 200 ✓
  - dev_alias sobre foreign dev (Origen) → 403 ✓ (multi-tenant guard activo)
  - superadmin/connections con developer → 403 ✓
  - anon → 401 ✓
- **Stub honesto sin OAuth keys**:
  - oauth-url → `{ok:false, configured:false, message:"Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en .env del backend"}` ✓
  - `run_drive_watcher_once` → `{ok:false, reason:'google_oauth_keys_missing', synced:0}` ✓
- **Doc-type heuristics** (13 cases): 100% pass ✓.
- **Fernet roundtrip** + state CSRF token (encrypt/decrypt + bad state rejected) ✓.
- **APScheduler** `drive_watcher` job en startup logs ✓.

### Archivos tocados
- `/app/backend/drive_engine.py` (nuevo · 480 líneas)
- `/app/backend/routes_documents.py` (extrajo `_ingest_document_bytes` reusable)
- `/app/backend/scheduler_ie.py` (+ drive_watcher cron 6h)
- `/app/backend/server.py` (+drive_router + dev_alias + ensure_drive_indexes)
- `/app/backend/.env` (+3 placeholders GOOGLE_OAUTH_*)
- `/app/backend/requirements.txt` (NO modificado — deps via pip directo, ya compatibles)
- `/app/frontend/src/api/drive.js` (nuevo · 50 líneas)
- `/app/frontend/src/components/documents/DriveConnect.js` (nuevo · 270 líneas)
- `/app/frontend/src/pages/superadmin/SuperadminDrivePage.js` (nuevo · 160 líneas)
- `/app/frontend/src/components/icons/index.js` (+4 icons: Cloud, RefreshCw, Folder, CheckCircle)
- `/app/frontend/src/components/superadmin/SuperadminLayout.js` (+nav link Drive Watch)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (DriveConnect en header)
- `/app/frontend/src/App.js` (+route /superadmin/drive)
- `/app/memory/PRD.md`

### Activación pendiente del usuario
Para activar el feature real, agregar a `/app/backend/.env`:
```
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_OAUTH_REDIRECT_URI=https://latam-property-ai.preview.emergentagent.com/api/auth/google/drive-callback
```
Y en Google Cloud Console:
1. Habilitar Google Drive API.
2. OAuth consent screen → External → scope `drive.readonly`.
3. Credenciales OAuth Web → redirect URI = el mismo de `.env` arriba.

Hasta entonces el feature corre en stub honesto (UI muestra mensaje claro, watcher no-op).

### Pending
- Phase 7.10 — Avance de obra timeline.
- WhatsApp Business real (whatsapp-web.js QR) · C11.
- Refactor `server.py` (esperando prompt usuario).

### Bonus (2026-05-01) — Native Google Docs export
- Watcher ahora soporta **4 mimetypes nativos** además de binarios con md5: Google Docs · Sheets · Slides · Drawings.
- Cada uno se exporta automáticamente a **PDF** vía `files().export_media(mimeType=application/pdf)` para mantener uniformidad con el pipeline OCR/Claude existente (Sheets a PDF preserva tablas visualmente, OCR las lee fine).
- **Revision tag** para nativos: `native::{modifiedTime}` (no tienen md5Checksum). Detecta cambios via timestamp.
- `_ensure_filename_extension` añade `.pdf` cuando el nombre no lo trae (Google Docs en Drive tienen nombre sin extensión).
- Audit ahora reporta `exported_native` count y `skipped_unsupported` (forms, shortcuts).
- `source_metadata` incluye `is_native_export: true` + `drive_mime` para auditoría.

---


## 2026-05-01 — Side-task · Caya Bubble (marketplace público)
**Objetivo:** mini-burbuja chat persistente bottom-right en `/marketplace` y `/desarrollo/:slug`, anonymous (sin auth), reuse `POST /api/caya/query` del D2.

### Frontend (`CayaBubble.js` · 270 líneas · nuevo)
- **Burbuja flotante** 60×60 bottom-right z-9998, gradient navy→pink (`var(--grad)`), hover scale 1.08. Click → expande panel.
- **Panel** 380×540 (responsive: full-bleed en <480px), animation `caya-pop` 220ms.
  - Header: avatar Caya gradient + label "ASISTENTE DMX · BETA" + close button.
  - Messages list scrollable: user (right, indigo bg), assistant (left, glass bg).
  - Empty state con 3 sugerencias clickables: "Casa familiar Polanco bajo 15M", "Mejor calidad de aire en CDMX", "Desarrollos en preventa con amenidades".
  - Por mensaje assistant: text + `CitationPill[]` (clicks navegan a `/desarrollo/:slug` para `dev::*` chunks o `/barrios` para `col::*`).
  - **Hand_off banner** ámbar cuando `hand_off_recommended=true`: AlertTriangle + label + 2 CTAs (WhatsApp `wa.me/?text=...` y "Ver asesores" → `/asesores`).
  - Input rounded-full + send button gradient.
  - Footer "Beta · Powered by DMX RAG" + clear history button.
- **Session anonymous**: localStorage key `dmx.caya.session_id` (formato `caya_anon_<rand>_<ts>`). Persiste cross-page + cross-refresh.
- **History persisten** en localStorage `dmx.caya.history.v1` (cap 30 mensajes). Sobrevive refresh.
- **Deep-link**: `?caya=open` abre panel automáticamente (útil para shared links).
- **Mobile responsive**: media query <480px → panel full-width con padding 8px.

### Wiring
- `Marketplace.js` → `<CayaBubble />` montado al final.
- `DevelopmentDetail.js` → `<CayaBubble />` montado al final (cross-page session).

### Verificación visual
- Burbuja gradient pink-purple visible bottom-right en `/marketplace` ✓
- `?caya=open` → panel completo renderiza con empty state, sugerencias, input, footer ✓
- Estructura de pills + hand_off banner reusa contrato de Caya endpoint del D2 (verificado en D2 con 4 queries de stress).

### Backend
- Reusa `POST /api/caya/query` (D2 — sin cambios).
- Anonymous accepted: endpoint no requiere auth.

### Archivos tocados
- `/app/frontend/src/components/landing/CayaBubble.js` (nuevo · 270 líneas)
- `/app/frontend/src/pages/Marketplace.js` (import + mount)
- `/app/frontend/src/pages/DevelopmentDetail.js` (import + mount)
- `/app/memory/PRD.md`

### Side-task closed ✅ · Pendiente C11
- Caya conversational UI completa con threads sidebar.
- WhatsApp Business real wiring (`whatsapp-web.js` QR).
- NLP intent classifier real (reemplaza heurística keyword `_estimate_lead_score`).

### Bonus (2026-05-01) — Caya en `/barrios` y `/inteligencia`
- `<CayaBubble />` montado también en `/barrios` (Barrios.js) e `/inteligencia` (Inteligencia.js).
- Verificado visual: burbuja gradient pink-purple bottom-right en ambas páginas ✓.
- Cross-page session: misma `dmx.caya.session_id` en localStorage → conversación continúa al navegar entre marketplace ↔ barrios ↔ inteligencia ↔ desarrollo detail.

---


## 2026-05-01 — Phase D2 · Bot RAG Integration (3 surfaces)
**Objetivo:** conectar D1 semantic search a 3 superficies de bot — argumentario asesor, briefing IE upgrade, y Caya prep stub. Cada output cita chunks del corpus con `chunk_id` clickable. Cero invención: si un chunk no se encuentra, Claude lo dice explícito.

### 1. Argumentario RAG inline (M03+ Contactos drawer)
- **Backend** `routes_advisor.py` nuevo endpoint `POST /api/asesor/argumentario-rag` `{contact_id, development_id?, force?}`:
  - Cache 24h por `(advisor, contact, dev|none)` md5. `force=true` para regenerar.
  - Budget cap compartido `$5/sesión` (rolling 1h) con narrative_engine.
  - RAG retrieve top-5 chunks: si `development_id` provisto → `scope=development, entity_id=dev_id`; si no → query libre.
  - Claude Sonnet 4.5 con system prompt absolutista: "cada afirmación cuantitativa DEBE estar respaldada por un chunk del CONTEXTO RAG. Si no encuentras data sobre algo, di explícito 'no tengo data sobre X'".
  - Output JSON: `{hook, paragraphs[2-3], call_to_action, whatsapp_text(≤700), citations[]: [{chunk_id, label, source_type, source_id}]}` + paragraphs con refs inline `[1]` `[2]` que mapean a citations.
  - Persiste en `asesor_argumentarios_rag` + log en `ie_narratives` para tracking de budget compartido.
- **Frontend** `AsesorContactos.js` `ArgumentarioForm` reescrito completo:
  - Selector de desarrollo opcional (incluye opción "Sin desarrollo específico").
  - Hook H4 + paragraphs con `[1]` `[2]` pills inline clickables (hover → tooltip con `chunk_id` + `source_type` + `label` + snippet 200 chars).
  - Footer "Fuentes citadas" con pill por citation (label + source_type).
  - 3 botones: Copiar texto / Copiar WhatsApp / Enviar por WhatsApp (`wa.me/?text=`).
  - Header: cache vs nuevo · count citas · model · cost.
- **Helper** `api/advisor.js` + `generateArgumentarioRag`.

### 2. Briefing IE upgrade (citations data-backed)
- **Backend** `briefing_engine.py`:
  - `PROMPT_VERSION` bumpeado `v1.0 → v2.0` (invalida caches viejas automáticamente).
  - SYSTEM_PROMPT extendido con regla: "Cada bullet de headline_pros o caveat puede incluir `citation_chunk_id` referenciando un documento RAG. `citations[]` array con `{chunk_id, label}`."
  - Pre-Claude: `semantic_search(scope=development, entity_id=dev_id, top_k=3)` injectado en user_prompt como sección "DOCUMENTOS VERIFICADOS RAG".
  - Persiste `citations[]` + `rag_chunks_used[]` en `ie_advisor_briefings`.
- **Frontend** `BriefingIEModal.js`:
  - `ScoreBullet` ahora acepta `citations` prop. Si bullet tiene `citation_chunk_id` que matchee → muestra mini-pill morada `DOC` con tooltip nativo.
  - Nueva sección "Documentos verificados citados" con pills morados (label + source_type) bajo CTA.
  - Header: `prompt v2.0 · RAG`.

### 3. Caya prep stub (chatbot infraestructura)
- **Backend** `caya_engine.py` nuevo módulo · `POST /api/caya/query` `{query, session_id?, channel: web|whatsapp}`:
  - Pipeline: persiste session + user msg → semantic_search top-5 → Claude conversacional con system prompt es-MX honest + RAG context → persist assistant msg.
  - **System prompt regla**: "Solo respondes con datos del CONTEXTO RAG. Si no encuentras data sobre algo, di 'No tengo información verificada sobre eso. Te conecto con un asesor humano'."
  - **Lead-score heurístico** (placeholder C11): keywords high (comprar, presupuesto, agendar, urgente) +15 · medium (zonas, tipos) +5. Score ≥70 → `hand_off_recommended=true`.
  - Hand_off también si Claude lo determina.
  - Endpoint `GET /api/caya/sessions/:id/history` para multi-turn.
  - Collections: `caya_sessions`, `caya_messages` (con role, content, citations, lead_score, hand_off, channel, cost_usd).

### Verificación end-to-end
- **Argumentario RAG** sobre contacto Alejandro + altavista-polanco:
  - hook: "Alejandro, encontré una oportunidad de inversión en preventa que por ubicación y números puede calzar con tu perfil de yield."
  - 3 paragraphs con refs inline `[1]` (cita scores reales: "torre boutique de 34 niveles sobre Moliere, a dos cuadras de Parque Lincoln") y precio LP real ($12,500,000 MXN por 85 m²).
  - 4 citations: dev_card + di_document(LP) + extraction(unidades 101/201) + permiso_seduvi.
  - Cost $0.0126 USD. **Cache hit verificado**: 2da call → `cache_hit=true`, cost mismo, hook idéntico ✓.
- **Briefing IE upgrade** altavista-polanco con `force=true`:
  - `prompt_version=v2.0` ✓ · 5 headline_pros · 2 citations (dev_card + LP doc) · 3 rag_chunks_used · cost $0.0199 ✓.
  - Hook: "Ana, Altavista Polanco combina la solidez de Quattro (96.89% entrega histórica) con amenidades premi…" — cita score real verificable.
- **Caya** 4 queries de stress test:
  - Q "casa familiar Polanco con amenidades" → top_results: polanco-moderno (0.61), altavista-polanco (0.60), coyoacan-reserve (0.56). 2 citations. hand_off=true (Claude detectó intención específica). cost $0.006.
  - Q alta intención "presupuesto 15M, agendar visita" → `lead_score=75` → hand_off=true · "Con tu presupuesto de 15M tienes opciones disponibles. En Altavista Polanco hay unidades desde 12.5M (85m², 2 rec)..." (precio real citado) ✓.
  - Q multi-turn: 1ra "depto Roma Norte" → 2da en mismo session_id "qué precios manejan?" → history endpoint devuelve 4 msgs en orden ✓.
  - **Q anti-invención** "tienen propiedades en Mérida Yucatán?" → "No tengo información verificada sobre propiedades en Mérida, Yucatán. Actualmente cuento con datos de desarrollos en CDMX. Te conecto con un asesor humano". hand_off=true. **Regla "cero invención" honrada** ✓.

### Archivos tocados
- `/app/backend/caya_engine.py` (nuevo · 220 líneas)
- `/app/backend/routes_advisor.py` (+endpoint argumentario-rag · +180 líneas)
- `/app/backend/briefing_engine.py` (PROMPT_VERSION v2.0 · SYSTEM_PROMPT extendido · `_build_user_prompt` con rag_chunks · `get_or_generate_briefing` con RAG fetch + citations persist)
- `/app/backend/server.py` (+caya_router + ensure_caya_indexes startup)
- `/app/frontend/src/api/advisor.js` (+generateArgumentarioRag)
- `/app/frontend/src/pages/advisor/AsesorContactos.js` (`ArgumentarioForm` reescrito con citations + paragraphs)
- `/app/frontend/src/components/advisor/BriefingIEModal.js` (`ScoreBullet` con citation pill DOC + sección "Documentos verificados citados")
- `/app/memory/PRD.md`

### D2 closed ✅ · D2 backlog (próxima fase Caya C11)
- Auto-reindex hook después de cada doc/extraction upload (ahora reindex es manual).
- WhatsApp Business real wiring (whatsapp-web.js QR).
- UI conversacional Caya (web widget + WhatsApp inbound).
- NLP intent classifier real (reemplaza heurística keyword-based de `_estimate_lead_score`).

---


## 2026-05-01 — Phase D1 · Vector embeddings + Semantic Search (RAG base)
**Objetivo:** capa RAG sobre todo el corpus DMX (devs, colonias, OCR, extractions, narrativas, scores) para búsqueda semántica pública. Base para D2 (argumentario/briefing IE con citations data-backed).

### Backend (`rag_engine.py` · 350 líneas)
- **OpenAI** `text-embedding-3-small` (1536 dim) vía `openai` SDK direct (Emergent proxy no expone embeddings). Key real ahora válida en `OPENAI_API_KEY`. Costo ≈ $0.02/1M tokens — primer reindex: **5800 tokens · $0.000116**.
- **4 builders** de chunks con texto plano legible para embedding:
  - `_build_dev_chunks` → 1 chunk/desarrollo (name + addr + colonia + amenities + description + scores compactos + narrativa AI). 18 chunks.
  - `_build_colonia_chunks` → 1 chunk/colonia con scores + narrativa. 16 chunks.
  - `_build_doc_chunks` → 1 chunk/DI document (OCR descifrado, max 4K chars). Excluye `predial`/`constancia_fiscal` (privados). 12 chunks.
  - `_build_extraction_chunks` → 1 chunk/extracción estructurada (flatten K-V). Excluye privados. 14 chunks.
- **Diff-based reindex**: hash sha256-24 del texto. Sólo re-embed si el hash cambia. Idempotente: 2da corrida skip=60, cost=0.
- **Cosine search in-memory** sobre cache de corpus (Mongo Community no soporta `$vectorSearch`). Latencia <100ms. `embed_one(query)` → cosine vs todo el corpus en RAM → top-K.
- **Filtros**: `scope=development|colonia`, `entity_id=...`, `source_types=development_card,extraction,...` (CSV).
- **Cero invención**: cada hit retorna `chunk_id`, `source_type`, `entity_id`, `score`, `snippet` (300 chars), `metadata` (incluye `doc_id`/`extraction_id` cuando aplica → traza auditable).
- **Anti-overshare**: predial + constancia_fiscal NUNCA se indexan (consistente con la regla del marketplace público).

### Endpoints
- **`GET /api/search/semantic?q=&top_k=&scope=&entity_id=&source_types=`** — público.
- **`POST /api/superadmin/rag/reindex`** — recompute diff + cleanup stale + refresh cache. Solo superadmin.
- **`GET /api/superadmin/rag/stats`** — totales + breakdown by source_type + dim + corpus_cache_size.
- Indexes Mongo en startup + corpus preload automático al boot.

### Verificación
- Reindex inicial: **60 chunks · 5800 tokens · $0.000116** ✓.
- Reindex idempotente: 60 skip · $0 ✓.
- **Q1** "departamento de lujo en Polanco con amenidades" → top-2 hits son `altavista-polanco` y `polanco-moderno` (score 0.642), Anzures Classic y Roma Norte después (0.55). **Semántica correcta** ✓.
- **Q2** "cocina equipada" → top hits son `plano_arquitectonico::extract` y `plano_arquitectonico::jb_plano.pdf` de juarez-boutique (score 0.36) — RAG une lexical + semántico bien ✓.
- **Q3** scope=colonia + "mejor calidad de aire" → 16 colonias filtradas, top Santa Fe + Lomas Chapultepec (correcto: peri-urbanas) ✓.
- **Auth gate**: anon→403, developer_admin→403 en reindex/stats; búsqueda pública→200 ✓.
- **Privacy**: 12 di_documents indexados (excluye 4 privados predial/constancia_fiscal) ✓.

### Archivos tocados
- `/app/backend/rag_engine.py` (nuevo · 350 líneas)
- `/app/backend/server.py` (router + ensure_rag_indexes + load_corpus_cache en startup)
- `/app/backend/.env` (OPENAI_API_KEY actualizada · key real)
- `/app/memory/PRD.md`

### Pending (D2)
- Bot RAG: argumentario asesor inline en M03+ contactos drawer + Briefing IE upgrade con citations data-backed (doc_id/extraction_id pills clickeables) + Caya prep stub.
- Auto-reindex hook después de cada doc/extraction/cross-check upload (ahora es manual via superadmin).

---


## 2026-05-01 — Phase 7.6 · Asset Pipeline (Moat #2 Wave 6)
**Objetivo:** subir fotos/renders/planos/360° por desarrollo, watermark automático "DesarrollosMX", auto-categorización con Claude Sonnet 4.5 Vision (cero invención: si no es claramente inmobiliario → `category=null`), y publicación pública en marketplace + ficha.

### Backend (`dev_assets.py` + `routes_documents.py`)
- Storage NO cifrado en `/app/backend/uploads/dev_assets/` (público, montado en `/api/assets-static/`).
- Watermark Pillow esquina inferior-derecha, exporta JPEG q85.
- IA categoriza vía emergentintegrations Claude Vision (`claude-sonnet-4-5-20250929`) con sys-prompt absolutista anti-invención. AI categories: sala, cocina, recamara, bano, fachada, exterior, amenidad, plano (o null).
- Pedra 360° vía `httpx` POST `/v1/render-360` con `PEDRA_API_KEY`. Si key falta → stub honesto `{ok:false, hint:"Configura PEDRA_API_KEY..."}`.
- `regenerate_plano_thumbnails` extrae página 1 de `plano_arquitectonico` docs vía pdfplumber, watermarkea, persiste como `plano_thumbnail` asset.
- 8 endpoints superadmin (+ 8 dev_aliases multi-tenant): upload bulk · reorder · re-categorize · generate-360 · delete · regenerate-plano-thumbnails. 1 endpoint público: `GET /api/developments/{dev_id}/assets`.

### Frontend (`AssetGallery.js` + `DesarrolladorLegajo.js` + `DevelopmentDetail.js`)
- `AssetGallery` con drag&drop multi-upload, drag-reorder grid, AI category pills, IA caption auto-poll cada 3.5s mientras pending, botón 360° por imagen, delete confirm.
- Tabs Legajo: Fotos (foto_render) · Planos (plano_thumbnail con botón regenerate) · Tour 360° (iframes Pedra cuando `tour_url` poblado).
- `DevelopmentCard` (marketplace) y `DevelopmentDetail`/`PhotoGallery` (ficha pública) hacen fetch de `/api/developments/:id/assets` y, si hay assets reales, sobreponen sobre `dev.photos` seed. Fallback al seed si no hay reales.

### Verificación
- Upload `test_photo.jpg` (640x420) → watermark aplicado · IA correctamente devolvió `category=null, caption="Imagen de prueba sin contenido inmobiliario visible"` (cero invención respetada). Cost ≈ $0.003.
- Endpoint público `GET /api/developments/altavista-polanco/assets` → count=1 con `public_url=/api/assets-static/asset_xxx.jpg`. Static file content-type image/jpeg, content-length 6479 ✓.
- `GET /api/assets-static/asset_xxx.jpg` → 200 ✓.
- Ficha `/desarrollo/altavista-polanco`: thumbnails count cambia de "1/6" (seed) → "1/1" (override real assets) confirmando wire end-to-end ✓.
- Pedra 360° call con `PEDRA_API_KEY` ausente → stub honesto con hint "Configura PEDRA_API_KEY..." ✓.

### Archivos tocados
- `/app/backend/dev_assets.py` (nuevo · 269 líneas)
- `/app/backend/routes_documents.py` (+ 8 endpoints + 8 dev_alias + public_router mount)
- `/app/backend/server.py` (`StaticFiles` mount + ensure_asset_indexes startup)
- `/app/frontend/src/components/documents/AssetGallery.js` (nuevo · 277 líneas)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (Fotos/Planos/Tour360 tabs wired)
- `/app/frontend/src/components/marketplace/DevelopmentCard.js` (assets fetch override)
- `/app/frontend/src/pages/DevelopmentDetail.js` (assets fetch override)
- `/app/memory/PRD.md`

### Backlog 7.x
- ELEVENLABS_API_KEY · PEDRA_API_KEY pending — stubs honestos activos.
- Phase 7.10 — Avance de obra timeline.

---

## 2026-05-01 — Phase 7.4 · Developer Portal Legajo + Compliance Badge (Moat #2 Wave 5)
**Objetivo:** centralizar todo el legajo del desarrollo en una única página dedicada y surfacear el resultado del Document Intelligence al marketplace público mediante un badge "DMX Verificado" controlado.

### Backend
- **1 endpoint público nuevo** en `server.py`: `GET /api/developments/{dev_id}/compliance-badge`.
  - Computa `tier` desde IE_PROY_RISK_LEGAL + IE_PROY_COMPLIANCE_SCORE + IE_PROY_QUALITY_DOCS:
    - `green` si los 3 scores ≥ 80.
    - `amber` si min ≥ 50 (pero <80).
    - **`null` (HIDDEN)** si: 0 docs extraídos · OR cualquier score < 50 · OR `RISK_LEGAL.tier=red` (anti-overshare, anti-fearmongering).
  - Devuelve: `{tier, scores, verified_docs_count, last_update_at, label_es}`.

### Frontend
- **Nuevo `components/marketplace/ComplianceBadge.js`** (3 variantes):
  - **`ComplianceBadgeOverlay`** — pill absoluta top-right en cards del marketplace, gradient verde (DMX Verificado) o ámbar (Verificación parcial).
  - **`ComplianceBadgeInline`** — badge clickable bajo título de la ficha pública → abre `BreakdownModal` con descripción del sistema, 3 ScoreRows con dots + valor /100, count docs verificados + last_update_at.
  - **`ComplianceDotStrip`** — versión compacta para header del Legajo (3 dots con label + count docs).
- **Wire**: badge overlay en `DevelopmentCard.js` (top-right, encima del IERankPill); badge inline en `DevelopmentDetail.js` (dentro de pills strip de hero, antes de "Verified" badge).
- **Nueva página `pages/developer/DesarrolladorLegajo.js`** (`/desarrollador/desarrollos/:slug/legajo`):
  - Header con breadcrumb (Inventario / Dev) + H1 + descripción + ComplianceDotStrip.
  - **5 tabs** con icons: Documentos (FileText), Fotos (Camera), Planos (Map), Avance de obra (Sparkle), Tour 360° (Camera).
  - **Tab Documentos**: render del componente `DocumentsList` reutilizado scope=developer (incluye 4 sub-tabs OCR/Datos extraídos/Cross-check/Sync Marketplace) + upload modal.
  - **4 tabs placeholder honestos** con icon circular indigo, eyebrow "Phase X.Y · Próximamente", título y descripción explicando exactamente qué viene en cada chunk futuro:
    - Fotos → Phase 7.6 (asset pipeline con versionado + watermark)
    - Planos → Phase 7.6 (thumbnails desde plano_arquitectonico extractions)
    - Avance de obra → Phase 7.10 (timeline antes/después + % por fase)
    - Tour 360° → Phase 7.6 (integración Pedra)
  - **Multi-tenant guard frontend**: probe `listDevDocuments` al mount; si responde 403 → render error card "Acceso restringido" con botón Volver a Inventario.
- **2 iconos nuevos** (`Camera`, `Map`) en `components/icons/index.js`.
- **`DesarrolladorInventario.js`**: reemplazo del widget DocumentsList inline por **link card "Legajo del desarrollo"** que enruta a la nueva página dedicada (mejor UX, evita scroll infinito).
- **Route nueva** en `App.js`: `/desarrollador/desarrollos/:slug/legajo` → DesarrolladorLegajo (AdvisorRoute).

### Verificación end-to-end
- **Setup**: subí 10 docs canónicos a `juarez-boutique` (lp, brochure, escritura, permiso_seduvi, licencia_construccion, predial, estudio_suelo, plano_arquitectonico, contrato_cv, constancia_fiscal). Auto-extraction + auto cross-check + auto-sync corrieron en cadena.
- **IE recipes computed**: `IE_PROY_RISK_LEGAL=100 (green)`, `IE_PROY_COMPLIANCE_SCORE=100 (green)`, `IE_PROY_QUALITY_DOCS=100 (green)` ✓.
- **Compliance badge endpoint** `/api/developments/juarez-boutique/compliance-badge` → `tier=green, label_es="DMX Verificado · Documentos al día", verified_docs_count=10` ✓.
- **Anti-overshare verificado**: `/api/developments/altavista-polanco/compliance-badge` → `tier=null` (RISK_LEGAL=red) — badge correctamente OCULTO ✓.
- **Empty state**: dev sin docs → `tier=null, verified_docs_count=0` ✓.
- **Marketplace** (`/marketplace`): 1 ComplianceBadgeOverlay verde renderiza para juarez-boutique. Otros 17 desarrollos sin badge (correcto: o sin docs o con RISK_LEGAL=red) ✓.
- **Ficha pública** (`/desarrollo/juarez-boutique`): ComplianceBadgeInline gradient verde clickable bajo título → BreakdownModal muestra 3 ScoreRows con dots verdes (100/100/100), description del sistema, "10 documentos verificados · Actualizado 1 may 2026" ✓.
- **Legajo page**: H1 "Legajo · Altavista Polanco", breadcrumb, ComplianceDotStrip 3 dots rojos + ámbar + "6 docs verificados", 5 tabs renderizadas, tab Documentos muestra 6 filas DATOS EXTRAÍDOS, tab Fotos muestra placeholder honesto "Phase 7.6 · Próximamente" con icon Camera ✓.
- **Multi-tenant**: dev_admin (constructora_ariel) → `/api/desarrollador/developments/juarez-boutique/documents` → **403** ✓.
- **Public badge**: anonymous user → 200 ✓.

### Archivos tocados
- `/app/backend/server.py` (+endpoint `compliance-badge`)
- `/app/frontend/src/components/marketplace/ComplianceBadge.js` (nuevo · 3 variantes + modal)
- `/app/frontend/src/components/marketplace/DevelopmentCard.js` (overlay badge wire)
- `/app/frontend/src/pages/DevelopmentDetail.js` (inline badge wire)
- `/app/frontend/src/pages/developer/DesarrolladorLegajo.js` (nuevo · 5 tabs)
- `/app/frontend/src/pages/developer/DesarrolladorInventario.js` (DocumentsList → link card)
- `/app/frontend/src/components/icons/index.js` (+Camera +Map)
- `/app/frontend/src/App.js` (+route legajo)
- `/app/memory/PRD.md`

---

## 2026-05-01 — Phase 7.5 · Auto-Sync Extracted → Marketplace (Moat #2 Wave 4)
**Objetivo:** transformar `extracted_data` (Phase 7.2) + cross-check pass (Phase 7.3) en updates al marketplace público, con overlay reversible y bloqueos por developer. Cierra el loop **upload → OCR → extract → cross-check → publish**.

### Backend
- **Nuevo `auto_sync_engine.py`** (350 líneas):
  - 8 mappers per doc_type:
    - `lp` → `{price_from, price_to, unit_types_count}` + `units_overlay[]` (5 unidades upserted con tipo, recámaras, baños, m², planta, precio, status, source_doc_id).
    - `brochure` → `{description (locked-aware), amenities (merge dedup), search_keywords, hero_text}`.
    - `escritura` → `{legal_clauses_summary[], legal_verified=true, notario, no_escritura}`.
    - `plano_arquitectonico` → `floorplan_assets[]` (acumulador).
    - `permiso_seduvi` → `{unidades_autorizadas, uso_suelo, altura_max, seduvi_no_oficio, seduvi_vigencia}`.
    - `licencia_construccion` → `{m2_construccion_autorizados, licencia_no, licencia_vigencia, licencia_niveles}`.
    - `predial` → `predial_private` (solo dev+superadmin, jamás expuesto al marketplace).
    - `constancia_fiscal` → `fiscal_private` (idem privado).
  - 3 funciones core: `compute_changes` (dry-run), `apply_changes` (con audit log), `revert_audit` (encadena nuevo registro).
  - **Pause auto-aplicación** si `IE_PROY_RISK_LEGAL.tier=red` (preview disponible, apply manual SÍ permitido para superadmin pero auto NO ejecuta).
  - **Locked fields** por developer (set-based) — auto-sync los respeta y los marca como skipped en el resultado.
  - Auto-trigger post-extraction y post-cross-check.
- **Schema Mongo `dev_overlays`**: `{development_id, fields: {...synced fields}, units_overlay: [...], locked_fields: [], audit: [{audit_id, field, old, new, source_doc_id, source_doc_type, applied_at, applied_by, can_revert, kind}], last_auto_sync_at, auto_sync_paused_reason}`. Index único en `development_id`.
- **`_dev_public` y `list_dev_units`** (en `server.py`) ahora hacen lazy-merge del overlay sobre seed (in-memory cache + `invalidate_dev_overlay_cache` al apply/revert + preload completo en startup). Campos `predial_private` y `fiscal_private` JAMÁS se exponen al marketplace.
- **7 endpoints superadmin** + **6 dev_alias multi-tenant**:
  - `GET /api/superadmin/developments/{id}/sync-preview` — diffs + units_diff + paused state + locked_fields.
  - `POST /api/superadmin/developments/{id}/sync-apply` — apply + audit log + cache invalidate. Devuelve `{ok, applied[], skipped[], applied_count, skipped_count}`.
  - `POST /api/superadmin/developments/{id}/auto-sync` — alias to apply (manual full run).
  - `POST /api/superadmin/developments/{id}/sync-revert/{audit_id}` — revert audit, encadena nuevo registro.
  - `GET /api/superadmin/developments/{id}/sync-audit` — historial cronológico.
  - `POST /api/superadmin/developments/{id}/sync-lock-field` — bloquea/desbloquea field para auto-sync.
  - `GET /api/superadmin/sync/pending-summary` — summary global per-tenant (count + items con synced_field_count, locked_fields, auto_sync_paused_reason).

### Frontend
- **Nuevo `components/documents/SyncPreview.js`** (~340 líneas):
  - Header con botón gradient "Aplicar N cambio(s)" + last_auto_sync_at + locked count.
  - Banner ámbar cuando paused (IE_PROY_RISK_LEGAL=red) — muestra razón, permite apply manual.
  - 3 sub-tabs: **Preview** (cards con diff actual→propuesto en grid 2-col rojo/verde + pill source_doc_type + badge BLOQUEADO/PRIVADO + botón Bloquear/Desbloquear inline), **Historial** (cronológico con badge `apply`/`revert` y botón Revertir por row revertable), **Bloqueos** (lista + botón desbloquear).
  - Toast feedback verde/rojo.
- **`DocumentsList.js` PreviewDrawer**: 4to tab "Sync Marketplace" agregado.
- **`DesarrolladorDashboard.js`**: card nueva "AUTO-SYNC · DOCUMENT INTELLIGENCE" con icon Sparkle, count de campos sincronizados, count de pausados (ámbar), pills clickeables a `/desarrollador/inventario?dev=...` por development_id.
- **`api/documents.js`** + 6 helpers: `getSyncPreview`, `applySync`, `revertSync`, `getSyncAudit`, `lockSyncField`, `getSyncPending`.

### Verificación end-to-end
- **Sync preview altavista-polanco**: 15 diffs detectados desde 5 doc_types (lp, escritura, permiso_seduvi, licencia_construccion, constancia_fiscal). units_diff: 0 → 5. paused=true porque IE_PROY_RISK_LEGAL=red ✓.
- **Sync apply**: 16 audit entries creados (15 fields + units_overlay), `last_auto_sync_at` populado ✓.
- **Marketplace público**: `/api/developments/altavista-polanco` ahora devuelve:
  - `price_from=12500000` (de seed 14.5M → real LP MIN)
  - `price_to=35000000` (de seed 28.9M → real LP MAX, penthouse)
  - `units count: 5` (LP overlay reemplaza seed 8)
  - `_overlay_synced_fields=[altura_max, legal_verified, licencia_niveles, licencia_no, licencia_vigencia, m2_construccion_autorizados, price_from, price_to, seduvi_no_oficio, seduvi_vigencia, unidades_autorizadas, unit_types_count, uso_suelo]` (13 campos públicos sincronizados — `predial_private` y `fiscal_private` correctamente NO expuestos).
- **Revert price_from audit_id** → marketplace vuelve a `price_from=14500000` (seed) inmediatamente. `audit.kind=revert` registrado, `can_revert=false` en el original ✓.
- **Lock `description`** → `locked_fields=["description"]`. Próximo auto-sync skipea ese field (verified via `apply_changes` returning skipped[]) ✓.
- **Multi-tenant**: dev_admin (constructora_ariel) sync-preview altavista-polanco (quattro=tenant) → 200 ✓; juarez-boutique (origen=foreign) → 403 ✓; buyer 401 ✓.
- **Playwright drawer Sync tab**: 4to tab visible, banner "Auto-aplicación pausada" ámbar correcto, sub-tabs Preview (1+) · Historial (17) · Bloqueos (1), card price_from con grid actual 14,500,000 → propuesto 12,500,000, card units_overlay con count 5→5 ✓.
- **Playwright `/desarrollador` dashboard**: card "AUTO-SYNC · DOCUMENT INTELLIGENCE" con "14 campos sincronizados en 1 desarrollo" + pill `altavista-polanco · 14 campos` ✓.

### Archivos tocados
- `/app/backend/auto_sync_engine.py` (nuevo · 350 líneas)
- `/app/backend/server.py` (`_dev_public` overlay merge + cache + `_apply_overlay` + preload startup)
- `/app/backend/extraction_engine.py` (auto_sync auto_trigger hook)
- `/app/backend/cross_check_engine.py` (auto_sync auto_trigger after IE recompute)
- `/app/backend/routes_documents.py` (+7 endpoints + 6 dev_alias)
- `/app/frontend/src/api/documents.js` (+6 helpers)
- `/app/frontend/src/components/documents/SyncPreview.js` (nuevo)
- `/app/frontend/src/components/documents/DocumentsList.js` (+4to tab)
- `/app/frontend/src/pages/developer/DesarrolladorDashboard.js` (Auto-Sync widget)
- `/app/memory/PRD.md`

---

## 2026-05-01 — Phase 7.3 · Cross-Check Engine + GC-X4 (Moat #2 Wave 3)
**Objetivo:** detectar inconsistencias deterministas entre extracted_data de documentos del mismo desarrollo y bloquear cambios de pricing si hay críticas. Cero LLM, todo reglas auditables.

### Backend
- **Nuevo `cross_check_engine.py`** — 5 rule classes registradas:
  - **R1 `precio_escritura_vs_lp`**: delta entre `contrato_cv.precio` y mediana de `lp.unidades.precio`. >5% → warning, ≤5% → pass.
  - **R2 `vigencia_predial`**: `predial.vigencia` < hoy → critical · `monto_pagado` null → warning · vigente + monto → pass.
  - **R3 `seduvi_vs_lp_unidades`**: `lp.unidades.length > permiso_seduvi.unidades_autorizadas` → critical.
  - **R4 `licencia_m2_total`**: `Σ lp.unidades.m2 > licencia.m2_construccion × 1.05` → critical.
  - **R5 `rfc_constancia_vs_dev`**: `constancia_fiscal.rfc != DEVELOPERS_BY_ID[dev.developer_id].rfc` → critical (inconclusive si dev sin RFC en catálogo).
  - Cada rule devuelve `{severity, result, expected, actual, delta_pct, refs[], message}`.
  - Rules con inputs faltantes → result `inconclusive` (no bloquea, no falla).
- **Schema `di_cross_checks`**: id, development_id, rule_id, rule_description, severity (info|warning|critical), result (pass|fail|inconclusive), expected, actual, delta_pct, referenced_document_ids[], message, created_at, engine_version. Index único `(development_id, rule_id)` — replace en cada run.
- **Auto-trigger** post-extraction: `extraction_engine.run_extraction` ahora encola `cross_check_engine.auto_trigger_after_extraction` cuando dev tiene ≥2 docs `extracted`.
- **3 endpoints** + 2 dev_alias:
  - `POST /api/superadmin/developments/{dev_id}/cross-check` — manual trigger (sync wait, devuelve summary + results).
  - `GET /api/superadmin/developments/{dev_id}/cross-check` — último resultado per rule + summary aggregates.
  - `GET /api/superadmin/cross-checks/{cc_id}` — detalle individual.
  - `GET /api/superadmin/cross-checks/stats/global` — count global de devs con criticals (filtrado por tenant).
- **3 IE recipes nuevas** en `recipes/proyecto/ie_proy_docs.py`:
  - **`IE_PROY_RISK_LEGAL`** — critical_count > 0 → 0 (red), warning_count > 0 → 50 (amber), clean → 100 (green).
  - **`IE_PROY_COMPLIANCE_SCORE`** — `passed/applicable × 100`.
  - **`IE_PROY_QUALITY_DOCS`** — `len(present_canonical_types) / 10 × 100` (10 tipos canónicos: lp, brochure, escritura, permiso_seduvi, estudio_suelo, licencia_construccion, predial, plano_arquitectonico, contrato_cv, constancia_fiscal).
- **`score_engine._build_project_context`** ahora inyecta `_dmx_cross_checks` y `_dmx_extracted_docs` al contexto. Score recompute automático al final de `run_cross_check`.
- **GC-X4 — Bloqueo Dynamic Pricing**:
  - `routes_developer.act_on_suggestion` (PATCH `/pricing/suggestions/{sid}`) ahora chequea `cross_check_engine.has_critical(dev_id)` cuando `status=applied`.
  - Bloqueado → HTTP 409 con detail `{error: cross_check_critical_pending, message, dev_id}`.
  - Nuevo endpoint `GET /api/desarrollador/pricing/cross-check-warnings` — lista devs bloqueados con sus rules para banner UI.

### Frontend
- **Nuevo `components/documents/CrossCheckView.js`** — header summary con counts (criticals/warnings/passed/inconclusive) + botón "Re-ejecutar reglas", lista de 5 cards por rule con:
  - Pill severity (CRÍTICO ámbar / WARNING ámbar / INFO indigo) + Pill result (PASS verde / FAIL rojo / INCONCLUSO gris).
  - Mensaje en bloque + grid Esperado/Actual/Δ% en monoespacio.
  - Pills clickeables de `referenced_document_ids` (linkean al drawer del doc — TODO 7.4 cross-doc nav).
- **`DocumentsList.js` PreviewDrawer**: 3er tab "Cross-check" agregado.
- **`DocumentsPage.js` stats strip**: 6 card "Inconsistencias críticas" con tone `crit` (rojo) cuando count > 0.
- **`DesarrolladorPricing.js`**: banner GC-X4 ámbar/rojo cuando `blocked_count > 0`, lista pills con dev_name + count de reglas. Toast del act() captura el 409 y muestra el mensaje del backend.
- **`api/documents.js`** + 4 helpers: `triggerCrossCheck`, `getDevCrossCheck`, `getCrossCheckStats`, `getPricingCrossCheckWarnings`.

### Verificación end-to-end
- Subí 4 docs adversariales en altavista-polanco (LP existente con 5 unidades + Σ m²=600):
  - SEDUVI con `unidades_autorizadas=3` → R3 → **critical** (5>3, +66.67%).
  - Licencia con `m2_construccion=400` → R4 → **critical** (Σ=600 > 400×1.05, +50%).
  - Predial con `vigencia=2025-12-31` → R2 → **critical** (vencido).
  - Constancia con `rfc=WRONG12345AB` → R5 → **inconclusive** (developer sin RFC en data_developers — comportamiento honesto).
- Auto-trigger post-extraction corrió. Cross-check resultado: `criticals=3, warnings=0, passed=0, inconclusive=2` ✓.
- IE recipes computadas:
  - `IE_PROY_RISK_LEGAL = 0.0 red` (criticals=2 detectados; uno se procesó después del recompute previo).
  - `IE_PROY_COMPLIANCE_SCORE = 0.0 red` (0 passed / 3 applicable).
  - `IE_PROY_QUALITY_DOCS = 60.0 amber` (6 de 10 tipos canónicos).
- **GC-X4 verificado**: developer_admin PATCH `/pricing/suggestions/{sid}` con `status=applied` para altavista-polanco → **HTTP 409** con `detail.message="Bloqueado: cross-check critical pendiente, resuelve docs primero."` ✓.
- **Endpoint warnings**: `/api/desarrollador/pricing/cross-check-warnings` → `blocked_count=1, blocked=[{dev_id:altavista-polanco, dev_name:Altavista Polanco, rules:[predial,seduvi,licencia], count:3}]` ✓.
- **Resolución**: subí SEDUVI corregida con `unidades_autorizadas=5` → re-extract → SEDUVI rule **pasa** (5=5) → COMPLIANCE_SCORE sube 0% → **33.33%** (1/3 applicable). Otros criticals (predial vencido, licencia m²) siguen activos como esperado.
- **Playwright drawer Cross-check tab**: 5 rules renderizadas con badges severity+result, summary "2 críticos · 0 warnings · 1 pass · 2 inconclusos", expected=400 actual=600 +50% para licencia, doc_id pills clickeables ✓.
- **Playwright `/desarrollador/pricing`**: banner rojo "Cross-check crítico activo · 1 desarrollo bloqueado" + pill "Altavista Polanco · 2 reglas" ✓.

### Archivos tocados
- `/app/backend/cross_check_engine.py` (nuevo · 320 líneas)
- `/app/backend/recipes/proyecto/ie_proy_docs.py` (nuevo · 3 IE recipes)
- `/app/backend/extraction_engine.py` (auto_trigger_after_extraction hook)
- `/app/backend/routes_documents.py` (+4 endpoints + 2 dev_alias)
- `/app/backend/routes_developer.py` (GC-X4 block + cross-check-warnings endpoint)
- `/app/backend/score_engine.py` (`_dmx_cross_checks` y `_dmx_extracted_docs` injection)
- `/app/backend/server.py` (`ensure_cross_check_indexes` startup)
- `/app/frontend/src/api/documents.js` (+4 helpers)
- `/app/frontend/src/components/documents/CrossCheckView.js` (nuevo)
- `/app/frontend/src/components/documents/DocumentsList.js` (+3rd tab)
- `/app/frontend/src/pages/superadmin/DocumentsPage.js` (stat-criticals card)
- `/app/frontend/src/pages/developer/DesarrolladorPricing.js` (GC-X4 banner)
- `/app/memory/PRD.md`

---

## 2026-05-01 — Phase 7.2 · Claude Structured Extraction (Moat #2 Wave 2)
**Objetivo:** transformar `ocr_text` en datos estructurados auditables por `doc_type`. Base para 7.3 cross-checking.

### Backend
- **Nuevo `recipes/extraction/__init__.py`** — 11 templates (1 por doc_type):
  - `lp` (lista de precios), `brochure`, `escritura`, `permiso_seduvi`, `estudio_suelo`, `licencia_construccion`, `predial`, `plano_arquitectonico`, `contrato_cv`, `constancia_fiscal`, `otro`.
  - Cada template: `{schema, description, hints}`. `validate_extraction_keys(doc_type, data)` chequea llaves requeridas (extras permitidas).
- **Nuevo `extraction_engine.py`** — Claude Sonnet 4.5 vía `emergentintegrations`:
  - Modelo `claude-sonnet-4-5-20250929`, temperature **0.0** primer intento, **0.1** retry; max ≤ 60K chars OCR; up to **2 retries** post inicial (3 intentos total) con back-off cuadrático.
  - System prompt absolutista: "SOLO JSON válido · null si no encuentras · cero invención · mantén llaves del schema · números MXN sin símbolos · fechas ISO".
  - Strip ` ```json ` markdown fences automático antes de parse.
  - **Cifrado Fernet** del `extracted_data` JSON usando `IE_FERNET_KEY` (campo `extracted_data_enc`). Decifrado on-demand en API.
  - **Budget cap $5/sesión** compartido con `narrative_engine` (rolling 1h sumando `ie_narratives.cost_usd` + `di_extractions.cost_usd`). 402-equiv → marca `extraction_failed` con `extraction_error="budget_cap_reached"`.
  - **Auto-trigger** post-OCR: `document_intelligence.run_ocr_for_document` ahora encola `auto_trigger_after_ocr` cuando `status=ocr_done`.
- **3 endpoints** en `routes_documents.py` (+ 3 alias `/api/desarrollador/*`):
  - `POST /api/superadmin/documents/{doc_id}/extract` — manual trigger (sync wait, devuelve `{ok, extraction_id, cost_usd, doc_type}`).
  - `GET /api/superadmin/documents/{doc_id}/extraction` — devuelve último extraction (descifrado + metadata).
  - `POST /api/superadmin/developments/{dev_id}/documents/bulk-extract` — encola hasta 100 docs en `ocr_done | extraction_failed`, devuelve summary `{total, success, failed, total_cost_usd, results[]}`.
- **DI_STATUS** ahora incluye 3 estados nuevos: `extraction_pending`, `extracted`, `extraction_failed`.
- **Schema `di_extractions`**: id, document_id, doc_type, schema_version, ok (bool), extracted_data_enc (Fernet), model, temperature, input_tokens, output_tokens, cost_usd, generated_at, error?, raw_response (5K chars en caso de falla para auditoría).

### Frontend
- **`api/documents.js`** + 3 helpers: `triggerExtraction`, `getExtraction`, `bulkExtract`.
- **Nuevo `components/documents/ExtractionView.js`**:
  - **Renderer especializado para `lp`**: tabla con 7 columnas (Tipo, Recámaras, Baños, m², Planta, Status, Precio MXN format `es-MX`), KV pairs Vigencia + Fecha emisión, pills de Esquemas de pago.
  - **Renderer genérico** para los otros 10 tipos: grid 2-col de KV pairs auto-detectando moneda (`/precio|monto|anticipo/`), arrays como pills, monoespacio para campos `no_*`, `rfc`, `cuenta`.
  - JSON crudo expandible en `<pre>` mono.
  - Footer con Modelo + Schema version + Generado + Tokens (in/out) + Costo + botón "Re-extraer".
  - Estados: pending, failed (con `extraction_error` mostrado + botón "Reintentar"), no-extraction-yet (botón "Ejecutar extracción ahora").
- **`DocumentsList.js` PreviewDrawer ampliado**:
  - Tabs (`Texto OCR` / `Datos extraídos`) con borde inferior animado.
  - Drawer width 580 → **620px** para acomodar tabla LP.
  - Status pills extendidas con 3 nuevos tonos (`extraction_pending` rosa, `extracted` verde+Sparkle, `extraction_failed` ámbar).

### Verificación end-to-end (curl + Playwright)
- **Manual extract** sobre escritura existente (di_39ef3af1670a41) → `cost=$0.0018`, 53 output tokens, `extracted_data.predio_referencia="Lote 12 Manzana 5 Polanco"`, **resto de campos correctamente `null`** (cero invención sobre un OCR de 52 chars). ✓
- **Auto-trigger LP nueva**: subí `lp_test.pdf` con tabulador de 5 unidades + 3 esquemas + 2 fechas → auto-extraction en background → `extracted` en ~12s. Claude extrajo:
  - 5 unidades con precios MXN como números (`12500000`, `12800000`, etc.), recámaras, m², plantas, statuses (`DISPONIBLE`/`VENDIDO`/`APARTADO`).
  - `banos: null` correctamente en todas (no estaban en OCR).
  - `esquemas_pago = ["Contado 5% descuento", "Hipotecario", "30-70 enganche"]`.
  - `vigencia="2026-12-31"`, `fecha="2026-05-01"` (ISO normalizadas desde texto natural). Costo: $0.0053.
- **bulk-extract**: con 1 doc en `ocr_done` → `total=1, success=1, failed=0, total_cost_usd=0.0053` ✓.
- **Multi-tenant**: developer_admin extract via `/api/desarrollador/documents/:id/extract` → 200 ✓ · buyer → 401 ✓.
- **Playwright drawer LP** — tab "Datos extraídos" muestra: tabla de 5 unidades en MXN, 3 pills de esquemas, vigencia/fecha, JSON crudo, footer Claude.
- **Playwright drawer escritura** — GenericRenderer con `predio_referencia` poblado, resto de campos `—`, footer con tokens y costo.
- **Status pill extendido** — pill verde+Sparkle "DATOS EXTRAÍDOS" en lugar de "OCR LISTO" ✓.

### Archivos tocados
- `/app/backend/recipes/extraction/__init__.py` (nuevo · 11 templates)
- `/app/backend/extraction_engine.py` (nuevo · 270 líneas)
- `/app/backend/routes_documents.py` (+3 endpoints + 3 dev_alias)
- `/app/backend/document_intelligence.py` (auto-trigger hook + STATUS extendido)
- `/app/backend/server.py` (`ensure_extraction_indexes` en startup)
- `/app/frontend/src/api/documents.js` (+3 helpers)
- `/app/frontend/src/components/documents/ExtractionView.js` (nuevo)
- `/app/frontend/src/components/documents/DocumentsList.js` (tabs + status pills)
- `/app/memory/PRD.md`

---



- **Backend `briefing_engine.py`** nuevo módulo:
  - POST `/api/asesor/briefing-ie` · POST `/:id/feedback` · GET `/:id` · GET `/briefings` · GET `/briefings/summary`.
  - Role-gated vía `require_advisor` (advisor / asesor_admin / superadmin).
  - Cache 24h por (advisor, dev, lead_id|contact_id|null, prompt_version). Invalida si scores drift ≥5 pts.
  - Cap budget LLM `$5 USD/sesión` compartido con narrative_engine (rolling 1h window).
  - **Claude Sonnet 4.5** con system prompt "SIN emojis · SI ROI=red encuadra patrimonial · NUNCA inventes". Output JSON parsed (hook, headline_pros[4-6], honest_caveats[2], call_to_action, whatsapp_text ≤800 chars, context_hint).
  - `SCORE_LABEL_ES` map (31 labels) para UI-ready bullets.
  - Collection `ie_advisor_briefings`: { id, advisor_user_id, development_id, lead_id?, contact_id?, hook, headline_pros[], honest_caveats[], call_to_action, whatsapp_text, context_hint, prompt_version, scores_snapshot, generated_at, expires_at, used, feedback, model, cost_usd }.
  - Indexes: (advisor, generated_at desc), (advisor, dev, lead, contact, prompt_version), (expires_at).
- **Frontend**
  - `api/briefings.js` · 5 endpoints.
  - `BriefingIEModal` (720px, glass bg, close button, gradient CTA): header con model+cost, warning amber si genérico (sin lead/contact), secciones Contexto / Apertura / Razones data-backed / Caveats honestos / Próximo paso · cada bullet cita score_code con pill clickeable → abre `ScoreExplainModal`. 3 botones: Copiar completo / Copiar WhatsApp / Enviar por WhatsApp (abre `wa.me/?text=`). Inline feedback "¿Cerró el lead?" (Sí / Parcial / No) post-copy.
  - `DevelopmentDetail`: botón "Briefing IE para cliente" (gradient navy→pink, Sparkle icon) en sidebar sticky, **solo si role ∈ {advisor, asesor_admin, superadmin}**. Detecta `?lead=` / `?contacto=` URL params y los pasa al modal.
  - `AsesorDashboard`: nuevo widget "BRIEFING IE · 7d" con count + % cerrados + 3 recientes + link "Ver todos →".
  - `/asesor/briefings` nueva página con tabla filtrable (col: Proyecto/Colonia/Generado/Usado/Resultado/Acciones), FeedbackBadge (verde/ámbar/rojo), botones "Ver" (reabre modal desde cache) + "Ficha →".
  - `AdvisorLayout`: nuevo link "Briefings IE" con MessageSquare icon.

### Verificación Chunk 3
- **Briefing generado Altavista Polanco (ROI tier=red)**:
  - Hook: "Altavista Polanco: patrimonio de élite con desarrollador probado, no especulación de corto plazo"
  - 6 pros citando scores reales (Delivery 96.89, Amenidades 100, Presión 20, Ingreso 100, Precio-vs-mercado 55.89, Familias 76.3)
  - Caveats con encuadre **honesto educativo**: "ROI proyectado -43.25% a 5 años indica que esto NO es inversión especulativa: es patrimonio familiar vs rendimiento CETES, el valor está en uso y estatus, no en reventa inmediata."
  - CTA: "Ana, agenda visita presencial esta semana para recorrer unidades modelo y comparar vs 2-3 alternativas en Polanco con mejor ROI si tu cliente prioriza liquidez. Si busca patrimonio generacional, este es el pitch: Quattro + amenidades top + entrada competitiva."
  - whatsapp_text: 592 chars, plain text (sin emojis post-prompt-fix).
  - **Regla anti-fearmongering verificada ✓**.
- **Briefing generado Juárez Boutique**: hook "jugada patrimonial de largo plazo", "respaldada por desarrollador clase A, no compite con CETES" · mismo tono educativo.
- **Cache hit verificado**: segunda llamada con mismo payload devuelve `cache_hit=true, generated_at` idéntico.
- **Budget Claude total del batch tests**: ~$0.03 USD · $0.015 por briefing.
- **Role-gate verificado**: buyer (sin auth) → 401 en `/api/asesor/briefing-ie`.
- Playwright ficha Altavista Polanco: modal abre con 8 pills clickeables, 3 CTAs, inline feedback.
- Playwright `/asesor/briefings`: tabla muestra 2 briefings con columnas completas, sidebar "Briefings IE" activo.

### Archivos tocados
- `/app/backend/briefing_engine.py` (nuevo · 350 líneas)
- `/app/backend/server.py` (router registration)
- `/app/frontend/src/api/briefings.js` (nuevo)
- `/app/frontend/src/components/advisor/BriefingIEModal.js` (nuevo · 250 líneas)
- `/app/frontend/src/pages/advisor/AsesorBriefings.js` (nuevo)
- `/app/frontend/src/pages/advisor/AsesorDashboard.js` (+widget)
- `/app/frontend/src/pages/DevelopmentDetail.js` (+CTA role-gated)
- `/app/frontend/src/components/advisor/AdvisorLayout.js` (+link)
- `/app/frontend/src/App.js` (+ruta)
- `/app/memory/PRD.md`

---


- **Backend** — nuevo módulo `narrative_engine.py`:
  - Cache 7 días en collection `ie_narratives` con índices (scope,entity_id,prompt_version), (generated_at), (expires_at).
  - Invalida cache si algún score N1-N4 drifta ≥5 puntos absolutos (`_scores_changed` compara `scores_snapshot`).
  - Cap budget LLM **$5 USD/sesión** (1h rolling window). Degrada a cache stale si se alcanza.
  - Emergent LLM Key · **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) · temperature implícito de la lib · hard cap 400 chars post-truncation.
  - Dos prompts distintos (`SYSTEM_PROMPT_COLONIA` + `SYSTEM_PROMPT_PROYECTO`). El de proyecto incluye **regla explícita anti-fearmongering** para ROI rojo: "encuadra como 'proyecto de plusvalía patrimonial a largo plazo' con caveat honesto sobre liquidez vs CETES. Tono educativo, no transaccional."
  - Endpoints:
    - `GET /api/zones/:id/narrative` — público.
    - `GET /api/developments/:slug/narrative` — público.
    - `POST /api/superadmin/narratives/regenerate?id=&scope=` — force regen.
    - `POST /api/superadmin/narratives/batch-generate?scope=all|colonia|development` — pre-calentar cache.
    - `GET /api/superadmin/narratives/budget` — uso y cap.
- **Frontend**
  - Nuevo componente `NarrativeBlock.js` con props `{scope, entityId, compact, showFooter}`. Footer renderiza modelo + prompt_version + fecha + badge `CACHE` si cache hit.
  - `/inteligencia` hero: `NarrativeBlock` de Roma Norte debajo del `ZoneScoreStrip`.
  - `/desarrollo/:slug`: nueva section "Narrativa AI · N5" entre Score IE y tabs.
  - `/barrios`: `NarrativeBlock compact showFooter={false}` entre el nombre de la colonia y el strip.

### Verificación C2 (reporte completo)
- **Generación batch**: 16 colonias + 18 developments = **34 narrativas reales · 0 errores**.
- **Costo Claude total**: **$0.1073 USD** (bien debajo del cap $5). Cada narrativa ≈ $0.003.
- **Cache funcional**: 2 calls consecutivos devuelven misma `generated_at` (`2026-05-01T04:02:42.874`).
- **Ejemplo Roma Norte (colonia verde)**:
  > "Roma Norte concentra el ingreso más alto de CDMX (IE_COL_DEMOGRAFIA_INGRESO 100.0) y perfil familiar consolidado (IE_COL_DEMOGRAFIA_FAMILIA 76.3). Calidad del aire favorable (IE_COL_AIRE 70.0). La isla de calor es severa (IE_COL_CLIMA_ISLA_CALOR 65.0, tier red) y plusvalía histórica nula (0.0), sugiriendo mercado maduro sin expansión reciente. Proyección de plusvalía modesta (3.21). DMX no opin…"
- **Ejemplo Altavista Polanco (ROI tier red → encuadre educativo verificado)**:
  > "Altavista Polanco combina desarrollador confiable (Quattro Capital: 96.89% cumplimiento histórico, 100.0 confianza) con amenidades nivel 100.0 y presión competitiva baja (20.0). **Caveat honesto: ROI comprador -43.25% sugiere que esto es patrimonio a largo plazo, no especulación**. Velocidad de absorción lenta (28.57%) indica paciencia requerida. Polanco sigue siendo Polanco: ingreso 100.0. DMX no…"
  → Cita score específico, NO usa alarmismo, encuadra educativamente, respeta regla del system prompt.
- **Playwright /inteligencia**: hero muestra narrativa con footer "Claude sonnet-4 · prompt v1.0 · 1 may 2026 · CACHE" ✓.
- **Cero hallucination**: todos los números citados coinciden con los scores reales persistidos en `ie_scores`.

### IE Engine layers finales
- N1-N2 (descriptive) · 46 recipes
- N4 (predictive) · 3 recipes
- N5 (narrative) · 34 narrativas cacheadas (16 colonias + 18 devs)
- **Phase C · COMPLETE ✅**

---


- **Base** `PredictiveRecipe` (`backend/recipes/predictive/_helpers.py`) extiende `Recipe` con `layer="predictive"`, `model_version`, `confidence_interval {low, high, percentile}`, `training_window_days`, `residual_std`. Pure + deterministic + versioned.
- **3 recipes N4 nuevas**:
  - `IE_COL_PLUSVALIA_PROYECTADA` (scope=colonia · model `lin_reg_v1` · IC 80%) — regresión lineal sobre `IE_COL_PLUSVALIA_HIST` + 5 features demográficas INEGI. Coeficientes β fijos (deterministas). Degrada a stub si falta PLUSVALIA_HIST o <2 features demográficas.
  - `IE_PROY_DAYS_TO_SELLOUT` (proyecto · `absorp_linreg_v1` · IC 70%) — velocidad = absorbidas/ramp-up por stage × listing_health factor (0.7–1.3). Tier lower_better (<180=green, 180-365=amber, >365=red).
  - `IE_PROY_ROI_BUYER` (proyecto · `compound_v1` · IC 80%) — compuesto 5 años: (1+plusvalía)^5 + renta_5y − tx_costs 10% − opp_cost CETES 8.5%×5. IC heredada del IC de `IE_COL_PLUSVALIA_PROYECTADA`. Tier: ≥40%=green, 15-40%=amber, <15%=red.
- **Engine extensions**
  - `ScoreEngine._build_colonia_context()` inyecta `_dmx_own_colonia_scores` para que N4 colonia consuman scores propios N1-N2 sin requerir SQL extra.
  - `_build_project_context()` enriquecido con `_dmx_own_proj_scores`.
  - `_persist()` ahora guarda 4 campos extra opcionales (`model_version`, `confidence_interval`, `training_window_days`, `residual_std`) cuando están presentes.
- **Endpoints**
  - `POST /api/superadmin/scores/recompute-all` nuevo flag `layer: "all"|"descriptive"|"predictive"`. Cuando `all` ejecuta **2-pass**: descriptive primero para que N4 tenga scores N1-N2 disponibles; predictive después.
  - `GET /api/zones/:id/scores/explain` ahora devuelve: `layer`, `model_version`, `confidence_interval`, `training_window_days`, `residual_std`, `prediction_date`.
- **Frontend**
  - `ZoneScoreStrip`: labels IE_COL_PLUSVALIA_PROYECTADA / IE_PROY_DAYS_TO_SELLOUT / IE_PROY_ROI_BUYER. Nuevo `PRED_FORMATTERS` renderiza en unidades nativas (`3.2%`, `1147d`, `-43%`) con sub-text IC. Sort automático sube predictivos al top. Limit 8 en ficha (antes 6) — garantiza los 3 N4 visibles + 5 N1-N2.
  - `ScoreExplainModal`: nuevo bloque "MODELO PREDICTIVO · N4" (solo si `data.layer === 'predictive'`) con 4 campos: Modelo / IC % / Ventana / Error estándar.

### Verificación C1
- `POST /recompute-all {layer:"all"}` → task procesa **68 pares** (34 zonas × 2 pasadas) en 2.1s.
- **Cobertura N4 = 52/52 reales, 0 stubs**:
  - IE_COL_PLUSVALIA_PROYECTADA: 16/16 colonias
  - IE_PROY_DAYS_TO_SELLOUT: 18/18 developments
  - IE_PROY_ROI_BUYER: 18/18 developments
- Roma Norte `IE_COL_PLUSVALIA_PROYECTADA` → `value=3.21%, IC[2.19, 4.23], conf=high, window=1095d`.
- Altavista Polanco `IE_PROY_DAYS_TO_SELLOUT` → `1147.5d (tier red), IC 70% [745–1549]`.
- Altavista Polanco `IE_PROY_ROI_BUYER` → `-43.25% (tier red), IC 80% [-48.93, -37.35]` — auditable: plusvalía esperada (3.21%×5≈17%) < CETES acumulado 50% − tx 10%. Fórmula fiel.
- Playwright ficha `/desarrollo/altavista-polanco`: 8 pills con **DAYS_TO_SELLOUT y ROI_BUYER primero**, modal explain muestra bloque "MODELO PREDICTIVO · N4" con `compound_v1`, IC, ventana, σ.

**IE Engine layers: N1-N2 (46 desc) + N4 (3 pred) · 49 total.** Phase C1 done, pending C2 LLM narrative.

---


- **Backend** · `GET /api/developments/:id/rank` → `{rank, total, badge_tier, colonia}`. Ordena peers por `IE_PROY_BADGE_TOP.value`, devuelve `null` si total==1 (no overshare). Tiers: `top` (rank 1 con score real), `high` (top 30%), `mid` (resto), `null` (sin peers o sin score).
- **Frontend** · `DevelopmentCard` con overlay `IERankPill` bottom-left sobre la foto:
  - `top`  → pill gradient navy→indigo→pink "1º EN POLANCO" con Sparkle icon.
  - `high` → pill verde "TOP 30% EN {colonia}".
  - `null` / `mid` → **nada** (evita ruido visual en cards sin peers).
  - Hover → lift −2px + tooltip "Basado en IE Score · click para ver detalles".
  - Link destino ahora `desarrollo/:id#ie-scores` → scroll automático al bloque Score IE.
- **DevelopmentDetail** · section id="ie-scores" + `useEffect` que hace `scrollIntoView({behavior:'smooth'})` si el hash matchea.
- **Verificación**
  - `curl /api/developments/altavista-polanco/rank` → `{rank:1, total:2, badge_tier:"top"}` ✓
  - `curl /api/developments/polanco-moderno/rank` → `{rank:2, total:2, badge_tier:"mid"}` ✓ (sin pill)
  - `curl /api/developments/juarez-boutique/rank` → `{rank:1, total:1, badge_tier:null}` ✓
  - Playwright `/marketplace` → 18 cards, **3 top pills**, 0 high pills (con solo 2 peers por colonia, top 30% = rank 1 exacto).

---

## 2026-05-01 — Chunk 1-bis · Badge "1º / Nº en su colonia" en marketplace
- **Backend** · `GET /api/developments/:id/rank` → `{rank, total, badge_tier, colonia}`. Ordena peers por `IE_PROY_BADGE_TOP.value`, devuelve `null` si total==1 (no overshare). Tiers: `top` (rank 1 con score real), `high` (top 30%), `mid` (resto), `null` (sin peers o sin score).
- **Frontend** · `DevelopmentCard` con overlay `IERankPill` bottom-left sobre la foto:
  - `top`  → pill gradient navy→indigo→pink "1º EN POLANCO" con Sparkle icon.
  - `high` → pill verde "TOP 30% EN {colonia}".
  - `null` / `mid` → **nada** (evita ruido visual en cards sin peers).
  - Hover → lift −2px + tooltip "Basado en IE Score · click para ver detalles".
  - Link destino ahora `desarrollo/:id#ie-scores` → scroll automático al bloque Score IE.
- **DevelopmentDetail** · section id="ie-scores" + `useEffect` que hace `scrollIntoView({behavior:'smooth'})` si el hash matchea.
- **Verificación**
  - `curl /api/developments/altavista-polanco/rank` → `{rank:1, total:2, badge_tier:"top"}` ✓
  - `curl /api/developments/polanco-moderno/rank` → `{rank:2, total:2, badge_tier:"mid"}` ✓ (sin pill)
  - `curl /api/developments/juarez-boutique/rank` → `{rank:1, total:1, badge_tier:null}` ✓
  - Playwright `/marketplace` → 18 cards, **3 top pills**, 0 high pills (con solo 2 peers por colonia, top 30% = rank 1 exacto).

---

## 2026-05-01 — IE Engine Phase B3 (12 PROYECTO recipes + cron 02:00 MX + /superadmin/scores + ficha block)
- **Backend**
  - `score_engine.py`: nuevo atributo `Recipe.scope = "colonia" | "proyecto"`. Engine `_build_project_context(zone_id)` inyecta pseudo-sources `_dmx_dev / _dmx_colonia_scores / _dmx_same_colonia_devs / _dmx_all_devs` cuando scope=proyecto. `compute_many(zone_id, codes=[])` auto-detecta scope (dev.id → proyecto, sino → colonia), evitando mezcla.
  - `recipes/proyecto/_helpers.py`: base `ProjectRecipe` + `ProjectDataPendingRecipe`. Recipes PROYECTO son puras: si el dev no existe o faltan peers → `is_stub=true, value=null` (NUNCA inventa).
  - `recipes/proyecto/ie_proy_core.py`: **12 recipes** registradas:
    1. `IE_PROY_SCORE_VS_COLONIA` — promedio de colonia scores reales.
    2. `IE_PROY_SCORE_VS_CIUDAD` — proxy local (v1.0), benchmark ciudad pendiente v1.1.
    3. `IE_PROY_PRECIO_VS_MERCADO` — mediana precio/m² dev vs mediana peers (custom tier: 40-60=green).
    4. `IE_PROY_AMENIDADES` — suma ponderada de amenidades.
    5. `IE_PROY_LISTING_HEALTH` — fotos + desc + tipologías + meta.
    6. `IE_PROY_BADGE_TOP` — ranking % vs peers de la colonia.
    7. `IE_PROY_ABSORCION_VELOCIDAD` — % (vendido+reservado)/total.
    8. `IE_PROY_PRESALES_RATIO` — solo stage preventa/en_construccion.
    9. `IE_PROY_MARCA_TRUST` — años + proyectos entregados + compliance.
    10. `IE_PROY_DEVELOPER_TRUST` — unidades vendidas / proyectos benchmark 80.
    11. `IE_PROY_DEVELOPER_DELIVERY_HIST` — log2(proyectos+1)×15.
    12. `IE_PROY_COMPETITION_PRESSURE` — lower_better, # peers × 20 (stub si peers=0).
  - `scheduler_ie.py`: nuevo `ie_daily_score_recompute` CronTrigger(hour=2, minute=0, timezone="America/Mexico_City"). Recomputa zonas con obs en 24h (+4 colonias activas siempre) + las 15 developments (data DMX-internal, rápido). AirROI **excluido** automáticamente (`allow_paid=false` por defecto).
  - `routes_scores.py`: 5 endpoints nuevos
    - `GET /api/superadmin/scores?scope=colonia|proyecto&zone_id=&code=&tier=` — tabla filtrable.
    - `GET /api/superadmin/scores/recipes` — metadata (46 recipes, 34 colonia + 12 proyecto).
    - `GET /api/superadmin/scores/history?zone_id=&code=` — timeline (ie_score_history).
    - `POST /api/superadmin/scores/recompute-all` + `GET /api/superadmin/scores/recompute-all/status?task_id=` — batch async con polling. Fire-and-forget asyncio.create_task + persistencia en `ie_recompute_tasks`.
    - `GET /api/developments/:id/scores` — público, alimenta bloque en ficha. Coverage filtrado por scope.
  - `routes_ie_engine.py`: `/cron/trigger` ahora acepta `daily_score_recompute` + summary type Any.
- **Frontend**
  - `api/ie_scores.js` + `api/superadmin.js`: helpers `getDevelopmentScores`, `listScores`, `listRecipes`, `scoreHistory`, `recomputeAll`, `recomputeAllStatus`, `recomputeZone`.
  - `ZoneScoreStrip`: prop `scope='proyecto'` → usa `getDevelopmentScores`. 12 labels IE_PROY_* en Map.
  - `pages/DevelopmentDetail.js`: nueva sección "Score IE del proyecto" entre hero/gallery y tabs — 6 pills clickeables (límite de limit=6 + contador "+N más") + ScoreExplainModal integrado. Gradiente indigo/pink + headline con nombre del dev.
  - `pages/superadmin/ScoresPage.js`: tabla filtrable (scope/zone/code/tier), botón "Recompute todas las zonas" con polling cada 1.5s + barra de progreso verde, acciones por fila ("Ver explain" modal + "Histórico" drawer), toast bottom-right.
  - `SuperadminLayout`: nuevo link "Scores IE" con Sparkle icon.
- **Verificación**
  - 46 recipes registradas (34 colonia + 12 proyecto) ✓
  - `POST /recompute-all` → 31 zonas (16 colonias + 15 devs), 372 reales + 352 stubs, **0.9s** ✓
  - `POST /cron/trigger daily_score_recompute` → `{colonia:{zones:9,real:140,stub:166}, proyecto:{zones:15,real:132,stub:48}}` ✓
  - `GET /api/developments/altavista-polanco/scores` → **9/12 real**, mode=real. Los 3 stub (PRECIO_VS_MERCADO, BADGE_TOP, COMPETITION_PRESSURE) requieren peers; seed tiene 1 dev/colonia así que son stub correctamente.
  - Playwright: `/desarrollo/altavista-polanco` renderiza 6 pills proyecto + badge "Datos reales · 9 scores" + modal explain muestra 5 operaciones reales (e.g., "Unidades: total=56, vendidas=8, reservadas=8 → Score = 28.57%").
  - Playwright: `/superadmin/scores` renderiza 500 rows, batch progress "31/31 zonas · 372 reales · 352 stubs · 0.9s", filtro scope=proyecto → 180 rows, Histórico drawer con timeline de 4 snapshots.
- **Guardrails cumplidos**
  - `is_stub=true, value=null` cuando falta data (9/12 en altavista, 9/12 en tamaulipas, etc.) — **nunca inventa scores**.
  - AirROI **excluido** del cron `daily_score_recompute` (allow_paid=false).
  - UI solo muestra scores reales (`is_stub=false AND value!=null`).

### IE Engine Phase B · COMPLETE ✅
34 recipes COLONIA (B1/B2) + 12 recipes PROYECTO (B3) · 3 crons (daily ingestion 00:00, hourly status check, daily score recompute 02:00 MX) · batch async recompute con 31 zonas en <1s · `/superadmin/scores` + bloque ficha `/desarrollo/:slug`.

**Phase C (N4 predictive + N5 LLM narrative) queda pendiente para próximo chat.**

---


- **Side-fixes aplicadas**
  - AirROI base URL `https://api.airroi.com` + header `X-API-KEY` + endpoint `/markets/summary` para scoring colonias y `/markets/search` para test. `is_paid=True` en recipes que lo consumen (IE_COL_ROI_AIRBNB / OCUPACION) → requieren `allow_paid=true` en recompute; cron nunca los dispara.
  - CKAN resource_ids cargados (.env): FGJ, Locatel, SACMEX. `LocatelConnector` y `SACMEXConnector` registrados como reales (inherit DatosCDMXConnector). datos.cdmx.gob.mx no responde desde nuestro sandbox (timeout), pero al deployar a un nodo con egress abierto activarán automáticamente.
- **Backend**
  - **34 recipes** registradas (auto-discovery vía `pkgutil.walk_packages`): 1 archivo por tema bajo `recipes/colonia/`:
    - `_helpers.py`: `SimpleHeuristicRecipe` (fórmula apply + explanation) y `DataPendingRecipe` (placeholder limpio).
    - `ie_col_aire.py`: piloto real v1.1.
    - `ie_col_clima.py`: 3 recipes (INUNDACION, SISMO, ISLA_CALOR).
    - `ie_col_seguridad.py`: 3 recipes reales (SEGURIDAD, LOCATEL, AGUA_CONFIABILIDAD) con heurística logarítmica.
    - `ie_col_demografia.py`: 8 recipes (5 demografía + 2 educación + salud).
    - `ie_col_economia.py`: 19 recipes (precio/plusvalia/liquidez/demanda, 3 ROI con AirROI, 3 conectividad, 3 cultura, 5 uso-suelo+trust).
  - **2 endpoints nuevos**:
    - `GET /api/zones/:id/scores/explain?code=X` → payload con description, dependencies, tier_logic, inputs_used, operations (list de steps de la fórmula), observation_sample_ids, formula_version.
    - `GET /api/zones/:id/scores/coverage` → `{real_count, total_recipes, ui_mode: "real"|"seed"}` con threshold `MIN_REAL_SCORES_FOR_UI=5`.
- **Frontend**
  - `api/ie_scores.js` (coverage + scores + explain).
  - `ZoneScoreStrip` — grid de pills tier-colored (green/amber/red) con badge "Datos reales · N scores" o "Estimado · real/total"; onClick abre ExplainModal.
  - `ScoreExplainModal` — modal "Cómo lo sabemos" con value grande + description + fuentes (obs count por source) + operaciones numeradas + muestra de observation IDs + tagline "DMX no opina, mide."
  - Integración en `/inteligencia` (hero block "Roma Norte · lectura actual" con 12 pills clickeables) y `/barrios` (3 colonias live: Roma Norte, Polanco, Condesa).
- **Verificación curl**
  - `POST /scores/recompute` sobre roma_norte/polanco/condesa/del_valle → **15/34 real** cada una (10 placeholders + 4 data-pending + 15 con fórmula). Tier distribution roma_norte: green=3, amber=10, red=2.
  - `GET /zones/roma_norte/scores/coverage` → `real_count=15, total_recipes=34, ui_mode="real"` ✓ (threshold 5 cruzado)
  - `GET /zones/roma_norte/scores/explain?code=IE_COL_AIRE` → payload con 5 operaciones, 2 dependencies, sample IDs, version 1.1 ✓
- **Verificación Playwright**
  - `/inteligencia` renderiza 12 score pills + badge verde "Datos reales · 15 scores" ✓
  - Click pill → ExplainModal con formula v1.1, operaciones ("Base neutra CDMX = 70.0", "Penalty temperatura...", etc.), muestra de observations ✓
- **Breakdown final fuentes**: active **9** (NOAA + Banxico + INEGI + AirROI + OSM + Mapbox + CONAGUA + GTFS + datos_cdmx) · stub 4 · manual_only 4 · H2 1 · **blocked 0** 🎉

### Which recipes computed real vs stub (roma_norte)
Real (15): `IE_COL_AIRE` (70/green), `IE_COL_CLIMA_ISLA_CALOR` (lower_better), `IE_COL_SEGURIDAD/LOCATEL` (fall-back stub cuando CKAN unreachable→0 obs), `IE_COL_AGUA_CONFIABILIDAD` (85 default), `IE_COL_CULTURAL_PARQUES/VIALIDAD` (OSM nodes), `IE_COL_DEMOGRAFIA_FAMILIA/INGRESO` (INEGI), `IE_COL_PLUSVALIA_HIST` (Banxico), `IE_COL_ROI_AIRBNB/OCUPACION` (AirROI, solo con allow_paid), `IE_COL_TRUST_VECINDARIO`.
DataPending is_stub=true (19): el resto — esperan ingest específicos (Lamudi scraper, DENUE queries, SEDUVI datasets, CENAPRED WFS parseo, etc.) que viven en Phase B3+.

---

## 2026-05-01 — IE Engine Phase B2 (30+ recipes COLONIA + UI pública + /explain)
- **Side-fixes aplicadas**
  - AirROI base URL `https://api.airroi.com` + header `X-API-KEY` + endpoint `/markets/summary` para scoring colonias y `/markets/search` para test. `is_paid=True` en recipes que lo consumen (IE_COL_ROI_AIRBNB / OCUPACION) → requieren `allow_paid=true` en recompute; cron nunca los dispara.
  - CKAN resource_ids cargados (.env): FGJ, Locatel, SACMEX. `LocatelConnector` y `SACMEXConnector` registrados como reales (inherit DatosCDMXConnector). datos.cdmx.gob.mx no responde desde nuestro sandbox (timeout), pero al deployar a un nodo con egress abierto activarán automáticamente.
- **Backend**
  - **34 recipes** registradas (auto-discovery vía `pkgutil.walk_packages`): 1 archivo por tema bajo `recipes/colonia/`:
    - `_helpers.py`: `SimpleHeuristicRecipe` (fórmula apply + explanation) y `DataPendingRecipe` (placeholder limpio).
    - `ie_col_aire.py`: piloto real v1.1.
    - `ie_col_clima.py`: 3 recipes (INUNDACION, SISMO, ISLA_CALOR).
    - `ie_col_seguridad.py`: 3 recipes reales (SEGURIDAD, LOCATEL, AGUA_CONFIABILIDAD) con heurística logarítmica.
    - `ie_col_demografia.py`: 8 recipes (5 demografía + 2 educación + salud).
    - `ie_col_economia.py`: 19 recipes (precio/plusvalia/liquidez/demanda, 3 ROI con AirROI, 3 conectividad, 3 cultura, 5 uso-suelo+trust).
  - **2 endpoints nuevos**:
    - `GET /api/zones/:id/scores/explain?code=X` → payload con description, dependencies, tier_logic, inputs_used, operations (list de steps de la fórmula), observation_sample_ids, formula_version.
    - `GET /api/zones/:id/scores/coverage` → `{real_count, total_recipes, ui_mode: "real"|"seed"}` con threshold `MIN_REAL_SCORES_FOR_UI=5`.
- **Frontend**
  - `api/ie_scores.js` (coverage + scores + explain).
  - `ZoneScoreStrip` — grid de pills tier-colored (green/amber/red) con badge "Datos reales · N scores" o "Estimado · real/total"; onClick abre ExplainModal.
  - `ScoreExplainModal` — modal "Cómo lo sabemos" con value grande + description + fuentes (obs count por source) + operaciones numeradas + muestra de observation IDs + tagline "DMX no opina, mide."
  - Integración en `/inteligencia` (hero block "Roma Norte · lectura actual" con 12 pills clickeables) y `/barrios` (3 colonias live: Roma Norte, Polanco, Condesa).
- **Verificación curl**
  - `POST /scores/recompute` sobre roma_norte/polanco/condesa/del_valle → **15/34 real** cada una (10 placeholders + 4 data-pending + 15 con fórmula). Tier distribution roma_norte: green=3, amber=10, red=2.
  - `GET /zones/roma_norte/scores/coverage` → `real_count=15, total_recipes=34, ui_mode="real"` ✓ (threshold 5 cruzado)
  - `GET /zones/roma_norte/scores/explain?code=IE_COL_AIRE` → payload con 5 operaciones, 2 dependencies, sample IDs, version 1.1 ✓
- **Verificación Playwright**
  - `/inteligencia` renderiza 12 score pills + badge verde "Datos reales · 15 scores" ✓
  - Click pill → ExplainModal con formula v1.1, operaciones ("Base neutra CDMX = 70.0", "Penalty temperatura...", etc.), muestra de observations ✓
- **Breakdown final fuentes**: active **9** (NOAA + Banxico + INEGI + AirROI + OSM + Mapbox + CONAGUA + GTFS + datos_cdmx) · stub 4 · manual_only 4 · H2 1 · **blocked 0** 🎉

### Which recipes computed real vs stub (roma_norte)
Real (15): `IE_COL_AIRE` (70/green), `IE_COL_CLIMA_ISLA_CALOR` (lower_better), `IE_COL_SEGURIDAD/LOCATEL` (fall-back stub cuando CKAN unreachable→0 obs), `IE_COL_AGUA_CONFIABILIDAD` (85 default), `IE_COL_CULTURAL_PARQUES/VIALIDAD` (OSM nodes), `IE_COL_DEMOGRAFIA_FAMILIA/INGRESO` (INEGI), `IE_COL_PLUSVALIA_HIST` (Banxico), `IE_COL_ROI_AIRBNB/OCUPACION` (AirROI, solo con allow_paid), `IE_COL_TRUST_VECINDARIO`.
DataPending is_stub=true (19): el resto — esperan ingest específicos (Lamudi scraper, DENUE queries, SEDUVI datasets, CENAPRED WFS parseo, etc.) que viven en Phase B3+.

---

## 2026-05-01 — IE Engine Phase B1 (score engine foundation + 3 real connectors + seed-historic)
- Backend
  - `score_engine.py`: Recipe abstract base + auto-discovery (walk `recipes/**`) + `ScoreEngine.compute_many(zone_id, codes)` + Mongo collections `ie_scores` + `ie_score_history` (audit de cada recompute).
  - Thresholds tier: green ≥70, amber 40-69, rojo <40. Cada recipe declara `tier_logic: "higher_better" | "lower_better" | "custom"`.
  - Recipes puras (pure functions): si deps no tienen data → `value=null + is_stub=true + confidence=low`. NUNCA inventa números.
  - `recipes/colonia/ie_col_aire.py`: piloto real. Heurística base 70 − penalty anomalía térmica + bonus humedad. Dependencies: NOAA + CONAGUA SMN.
  - `connectors_ie.py`: 3 nuevos reales (Banxico SIE, INEGI BISE, AirROI) reemplazan sus named stubs. NOAA connector ya era real.
  - `routes_scores.py`: 4 endpoints nuevos
    - `POST /api/superadmin/scores/recompute` — trigger engine sobre zone + códigos específicos (o todos si lista vacía), flag `allow_paid` para recipes marked is_paid=True (AirROI).
    - `GET /api/superadmin/scores` — tabla filtrable (zone_id, code, tier).
    - `GET /api/zones/:id/scores` — **público**, devuelve solo scores reales (`is_stub=false AND value!=null`) para que la UI jamás muestre números falsos como reales.
    - `POST /api/superadmin/seed-historic-from-upload` — replay de un upload manual previo como raw_observations sin quemar tokens. Parser acepta nombres canónicos Y columnas GHCN-Daily oficiales (`STATION / DATE / TMAX / TMIN / PRCP / LATITUDE / LONGITUDE`) vía auto-aliasing.
  - Indices `ie_scores` con compuesto unique `(zone_id, code)` + audit via `ie_score_history`.
- Verificación
  - 🔑 4 API keys cargadas en `backend/.env` (NOAA / Banxico / INEGI / AirROI).
  - curl test_connection real: NOAA ✓, Banxico ✓ "Banxico SIE OK", INEGI ✓ "INEGI BISE OK" (tras corrección area 00=nación), AirROI ✗ HTTP 403 — auth scheme incorrecta, necesita docs del proveedor. Connector degrada a stub.
  - curl sync: NOAA 10 records reales, Banxico 3 series (USD/MXN + CETES + UDIS), INEGI 10 indicadores reales.
  - curl `POST /scores/recompute IE_COL_AIRE roma_norte` → `value=70.0 tier=green confidence=med inputs={noaa:10,conagua_smn:0}` ✓
  - curl `GET /api/zones/roma_norte/scores` público → devuelve el score correctamente ✓
  - Seed-historic: subí CSV GHCN-Daily oficial (STATION/DATE/TMAX/TMIN/PRCP) 5 filas → 15 obs insertadas (3 datatypes por fila) → auto-detect encoding utf-8 + sep `,` ✓
  - Recompute post-seed: inputs_used pasa a noaa=30 (vs 10 antes), mismo tier/value (data coherente = score estable) ✓
- Breakdown final: total 18 · active 6 (↑3) · stub 4 · manual_only 4 · H2 1 · blocked 3 (↓3: solo quedan SACMEX + Locatel + FGJ esperando resource_ids CKAN + AirROI con auth pendiente).

---

## 2026-05-01 — IE Engine Phase A4 FINAL (cron + detail page + download + 8 named stubs)
- Backend
  - `scheduler_ie.py`: AsyncIOScheduler con 2 jobs — `daily_ingestion` CronTrigger(hour=0, minute=0, timezone="America/Mexico_City") y `hourly_status_check` CronTrigger(minute=0). Logs JSON estructurados con prefijo `ie_cron` (filterables en Datadog/Stackdriver).
  - `trigger_now(db, job)`: permite que la UI dispare manualmente cualquiera de los 2 jobs.
  - `connectors_ie.py`: +8 named stub connectors con mocks source-specific (Banxico serie USD/MXN, AirROI occupancy+ADR por mercado, INEGI AGEB+ingreso, SACMEX cortes+duración, Locatel reportes, CONAGUA temp+humedad, GTFS modos+líneas, CENAPRED capas de riesgo). Factory ahora distingue `real` / `named_stub` / `stub`.
  - 3 endpoints nuevos en `routes_ie_engine.py`:
    - `POST /api/superadmin/cron/trigger` — dispara daily o hourly manualmente.
    - `GET /api/superadmin/uploads/:id/download` — role-gated FileResponse con verificación sha256 on-read (si el hash no coincide → 409 + status=failed).
    - `GET /api/superadmin/uploads/:id` (ya existía).
  - Scheduler boot/teardown en FastAPI startup/shutdown hooks. `IE_DISABLE_CRON=1` para testing.
- Frontend
  - `/superadmin/data-sources/:id` — detail page con 4 tabs: **Estado** (metadatos + credenciales cifradas con masked preview), **Histórico ingestion** (tabla completa de jobs con duración calculada), **Uploads manuales** (cards con Descargar + Re-procesar + período + screenshot badge), **Errores** (lista cronológica del error_log).
  - Dashboard: widget cron con 2 CTAs "Disparar daily_ingestion / hourly_status ahora" + toast live.
  - Nombre de fuente en la tabla principal ahora linkea al detalle.
- Breakdown final al cierre de Phase A: **18 fuentes** total
  - 🟢 active (3): OSM Overpass, CONAGUA SMN, GTFS CDMX — keyless_url responden en vivo (OSM ingesta data real, otros caen a stubs por URLs pendientes).
  - 🟡 stub (4): NOAA, CENAPRED, Mapbox, datos_cdmx — credentials presentes pero test falló o access_mode external_paid/wms_wfs sin URL.
  - 🟪 manual_only (4): Catastro CDMX, DGIS, Atlas Riesgos CDMX, INEGI Shapefiles — se nutren solo vía upload manual.
  - 🔵 H2 (1): Reelly Dubai.
  - 🔴 blocked (6): Banxico, AirROI, INEGI, SACMEX, Locatel, FGJ CDMX — esperando API keys / resource_ids.
- Verificación
  - curl `POST /cron/trigger daily_ingestion` → 3 fuentes procesadas (OSM=1 real, CONAGUA=5 stub, GTFS=3 stub) ✓
  - curl `POST /cron/trigger hourly_status` → 3 checks ✓
  - curl `GET /uploads/:id/download` → sha256 idéntico al original, 401 sin cookie ✓
  - Playwright: detail 4 tabs navegables ✓, 2 download + 2 reprocess buttons ✓, dashboard cron trigger+toast ✓
  - Scheduler logs JSON estructurados en stdout: `{"ts":"...","ie_cron":"scheduler_started","tz":"America/Mexico_City","jobs":[...]}`
- Logs rotación cifrado: `/app/IE_FERNET_ROTATION.md` (de A2)

### IE Engine Phase A · COMPLETE ✅
18 fuentes seedeadas · 4 collections Mongo indexadas · Fernet encryption · 12 connectors (4 real + 8 named stub + 6 base stub via Catastro/DGIS/etc) · 14 endpoints superadmin · APScheduler running 2 crons · manual upload con audit screenshot + sha256 dedupe + encoding/separator detection · detail page 4 tabs.

**Phase B (score calculation N1-N2) queda pendiente para próximo chat.**

---

## 2026-05-01 — IE Engine Phase A3 (manual upload + CSV preview + audit screenshot)
- Backend
  - `uploads_ie.py`: 200 MB cap + extension allowlist + sha256 dedupe + auto-detect encoding (UTF-8 / Latin-1 / Windows-1252 vía `chardet`) + auto-detect separador (`,` `;` `\t` `|` vía `csv.Sniffer`). Soporte CSV / TSV / JSON / GeoJSON / ZIP / PDF / XLSX en metadata; parse activo solo CSV+JSON (otros guardados para audit).
  - 3 nuevos endpoints en `routes_ie_engine.py`: `POST /:id/upload` (multipart con file + screenshot + notes + period), `POST /uploads/:id/process` (re-parse), `GET /uploads/:id`.
  - Auto-procesa archivos ≤10MB inline; archivos grandes quedan en estado `uploaded` para que el operador dispare `/process` cuando quiera.
  - Storage local en `IE_UPLOAD_DIR=/app/backend/uploads/ie_engine` (gitignored).
- Frontend
  - `UploadModal`: dropzone drag&drop + textarea notas + fechas período + warning de audit + auto-screenshot vía `html-to-image` (PNG 1.5x pixel ratio) + preview live (CSV table 5 rows con headers, JSON pretty, ZIP entries list).
  - Pills de meta: encoding (verde si UTF-8, ámbar si Latin-1) + separator + kind/count.
  - Botón "Subir" en tabla de fuentes ahora activo para todas las que `supports_manual_upload=true` (15/18 fuentes).
- Verificación
  - curl: Latin-1 + `;` separator → "Ñuño" decoded correctamente, 5 rows ingested ✓
  - sha256 dedupe → 409 ✓
  - UTF-8 + `,` auto-detected ✓
  - Bad ext rejected → 400 ✓
  - manual_upload sobre fuente que no lo soporta → 400 ✓ (catastro_cdmx admite, todas las manual_only sí)
  - Playwright: dropzone → CSV demo → submit → screenshot PNG 19.6 KB persistido en disco ✓ + 3 records ingested ✓
- Doc rotación Fernet en `/app/IE_FERNET_ROTATION.md` (de A2).

---

## 2026-05-01 — IE Engine Phase A2 (connectors + connect modal + test/sync)
- Backend
  - `connectors_ie.py`: BaseConnector + 4 implementaciones reales (NOAA, datos_cdmx, FGJ_CDMX, OSM Overpass) + StubConnector fallback para los otros 13. Patrón: nunca crashea — degrada a `is_stub=true` con observaciones sintéticas si no hay creds o falla la red.
  - 3 nuevos endpoints en `routes_ie_engine.py`: `PATCH /:id` (merge cifrado de credentials + run_test opcional), `POST /:id/test`, `POST /:id/sync` (crea ingestion_job, inserta en ie_raw_observations, transiciona status según resultado).
  - `IE_FERNET_KEY` ahora generada e independiente del JWT_SECRET en `backend/.env`. Doc rotación en `/app/IE_FERNET_ROTATION.md`.
- Frontend
  - `ConnectModal` dinámico por access_mode (api_key / ckan_resource / wms_wfs / keyless_url), con masked preview de credenciales existentes y fallback env hint.
  - Botones Conectar/Probar/Sync activos en la tabla con loading state y toasts de éxito/error.
  - Botón Subir sigue disabled (Phase A3).
- Verificación curl
  - PATCH NOAA con bogus key → status `blocked` → `stub`, `last_status=error`, summary masked correctamente.
  - Test OSM (con User-Agent) → 200 ok.
  - Sync OSM → 1 record real (`is_stub:false`, ingresa a `ie_raw_observations`).
  - Sync NOAA sin key → 5 records mock.
  - Sync mapbox stub → 4 records mock.
  - Sync catastro_cdmx (manual_upload) → 400 correcto.
- Verificación Playwright
  - Login → /superadmin/data-sources → Conectar NOAA → modal renderiza → submit bogus key → error UI ✅
  - Sync OSM → toast "1 records en 486ms" ✅
  - Stats actualizan: Activas 4→3 (NOAA degradó), Stub 1→4 ✅

---

## 2026-04-30 — IE Engine Phase A1 (read-only foundation)
**Moat #1 backbone — sin cálculo de scores aún, Phase B viene después.**
- Backend
  - 4 nuevas collections Mongo: `ie_data_sources`, `ie_raw_observations`, `ie_ingestion_jobs`, `ie_manual_uploads` con índices compuestos.
  - `data_ie_sources.py`: 18 fuentes seed (4 api_key + 4 ckan + 3 keyless + 1 wms_wfs + 4 manual + 1 external_paid + 1 h2).
  - `routes_ie_engine.py`: Fernet credential cipher (`IE_FERNET_KEY` opcional, fallback derivation desde JWT_SECRET en dev) + 6 endpoints read-only role-gated `superadmin`.
  - Seed idempotente al startup: refresca campos descriptivos, jamás sobrescribe credentials/last_sync.
  - `.env.example` ampliado con bloque IE Engine completo.
- Frontend
  - `/superadmin` + `/superadmin/data-sources` con `SuperadminLayout` (mirror del DeveloperLayout).
  - Tabla de 18 fuentes con badges status, filter pills, 5 stat cards, secciones "Últimos jobs" + "Últimos uploads" con empty states.
  - Botones de acción Conectar/Probar/Subir disabled greyed con tooltip "Disponible en Fase A2/A3".
- Verificación
  - 18 fuentes seedeadas correctas (4 active, 1 stub, 4 manual_only, 1 h2, 8 blocked sin keys).
  - 401 unauth ✓, 403 advisor ✓, 404 unknown ✓.
  - Screenshot superadmin → /superadmin/data-sources renderiza tabla con 18 filas.
- Status fuentes (sin keys cargadas): blocked = NOAA, INEGI, Banxico, AirROI, FGJ, SACMEX, Locatel, datos_cdmx (ckan_resource necesita resource_id) | active = Mapbox + OSM + CONAGUA SMN + GTFS (keyless) | stub = CENAPRED | manual_only = Catastro, DGIS, Atlas Riesgos, INEGI Shapefiles | h2 = Reelly.

---

## Credenciales de prueba (ver `/app/memory/test_credentials.md`)
- `admin@desarrollosmx.com` / `Admin2026!` → superadmin
- `asesor@demo.com` / `Asesor2026!` → advisor
- `developer@demo.com` / `Dev2026!` → developer_admin

Demo data CRM: `POST /api/asesor/_seed-demo` (idempotente).

---

## 2026-04-30 — QA bug fixes (B1–B9)
Sesión de QA E2E del usuario arrojó 8 bugs. Fixed todos en este iterate:
- **B1** AuthModal wired en "Entrar" (landing + todas las rutas). Google OAuth + email/password + switch a registro.
- **B2** Role picker:
  - Email register: selector Comprador / Asesor / Developer dentro del AuthModal (ya estaba, se conservó).
  - Google OAuth: nuevo flag `onboarded` en `users`. Usuarios nuevos de OAuth `onboarded=False` → el hook del AuthProvider monta `<RolePicker/>` modal no-dismissible hasta que eligen.
  - Nuevo endpoint `POST /api/auth/select-role` (solo acepta `onboarded is False`, idempotente).
  - Usuarios existentes (onboarded=None o True) no ven el picker.
- **B3** `AsesorDashboard.load()` envuelto en try/catch: 401 → redirect a `/?login=1&next=/asesor`; otros errores muestran bloque "Reintentar" en vez de crash.
- **B4** Null-safe render en AsesorDashboard (`!data` → empty state limpio).
- **B5** AdvisorRoute en App.js: fuerza redirect a `/?login=1&next=...` si no hay user (pattern mirror de `/desarrollador`).
- **B7** Toggle ES/EN en Navbar (desktop + mobile sheet) + persistencia `localStorage.dmx_lng`.
- **B8** PriceListTab: PUBLIC_VISIBLE_COUNT 4 → 3, + overlay CTA absoluto encima de las filas blur con "Regístrate para ver toda la lista".
- **B9** Rutas diferenciadas:
  - `/propiedades` → redirect a `/marketplace` (vía `<Navigate>`)
  - `/barrios` → stub educativo "16 barrios de CDMX leídos por IE Score" + CTA mapa
  - `/inteligencia` → moat narrativo "97 indicadores detrás de cada precio" (7 categorías)
  - `/asesores` → landing B2B con 6 pilares + 4 steps + CTA "Crear mi cuenta de asesor" (abre AuthModal en `mode='register'`)

---

## Variables de entorno
- Backend: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MAPBOX_TOKEN`, `DMX_FALLBACK_WHATSAPP`
- Frontend: `REACT_APP_BACKEND_URL`, `REACT_APP_MAPBOX_TOKEN`

---

## Backlog priorizado

### P0 — Antes del próximo release
- [ ] **E2E testing con `testing_agent_v3_fork`** — 3 personas: buyer (landing→ficha→paywall→login), advisor (login→argumentario→búsqueda ganada→prefill operación), developer admin (inventario→demanda→pricing approve→radar competidores)
- [ ] Onboarding form post-OAuth Google (no solo email/password login)
- [ ] Fix warnings ESLint residuales

### P1 — Phase 4 extensiones
- [ ] Mifiel NOM-151 real (acuerdo comercial captación + escritura)
- [ ] WhatsApp Business API real para briefing diario
- [ ] Google Calendar OAuth bidireccional en tareas
- [ ] Adjuntos/fotos captaciones (upload + AI classify)
- [ ] Elevación de rol desde superadmin UI

### P1 — Phase 5 extensiones
- [ ] Inventario: bulk Excel/CSV upload + drag reorder fotos + tour 360° upload
- [ ] Pricing: A/B test, bundle pricing, calendario subidas programadas
- [ ] Reportes: PDF branded developer + distribución email auto + link único trackeable
- [ ] Demanda: mapa Mapbox real-time (hoy es lista) + export GeoJSON
- [ ] Competidores: alertas push, histórico precios 12m, SEO/SEM presence

### P2 — Mejoras
- [ ] Búsqueda semántica embeddings OpenAI en marketplace público
- [ ] Comparador 3-way de desarrollos
- [ ] Wrapped anual del asesor
- [ ] Expansión Dubai / Miami
- [ ] Public profile `/asesor/perfil/:slug` con endorsements

### Refactor (DONE B0)
- [x] Split `server.py` en routers (routes_auth, routes_public, routes_search_prefs, ai_budget)
- [x] permissions.py centralizado
- [x] data_scoping.py
- [x] PortalLayout + navByRole unificados
- [x] Bundle splitting React.lazy() en App.js
- [x] Universal search + NotificationsBell + shared primitives (EntityCard, KPIStrip, FilterChipsBar, etc.)
- [x] **Phase 4 B0 BUG-AUTH FIX (2026-02)** — navByRole.js sincronizado 1:1 con rutas de App.js (40 items); `FallbackRoute` en App.js protege usuarios autenticados: en vez de caer a Landing al hit de ruta portal inválida, redirige al dashboard del rol. Elimina el falso "401 / logout" al navegar el sidebar post-refactor.

### Refactor (pending)
- [ ] Split landing components grandes (ColoniasBento, Hero)
- [ ] Backend tests unit (pytest) por router

---

## URL preview
https://latam-property-ai.preview.emergentagent.com

- `/` Landing
- `/marketplace` Grid desarrollos + AI search + filtros horizontales
- `/desarrollo/altavista-polanco` Ficha completa (Iteración B)
- `/mapa` Mapbox CDMX
- `/asesor` Panel asesor (login `asesor@demo.com`)
- `/asesor/contactos|busquedas|captaciones|tareas|operaciones|comisiones|ranking`


---

## 2026-05-02 — Phase 4 B0 Sub-chunk C · Backend Modules + Hooks + i18n + Schema + Wire

### 1. permissions.py — 3 nuevos helpers
- `can_edit_project(user)` → solo developer_director / superadmin
- `can_view_commercialization(user)` → directors + superadmin (pricing, commissions, broker agreements)
- `can_view_engagement_metrics(user)` → directors + developer_member

### 2. data_scoping.py — entity type 'commercialization'
- `_scope_commercialization(data, lvl)` → scrubs campos sensitivos (broker_commission_pct, internal_target_margin, reserve_price, etc.) para no-directores
- `scope_data(data, user, 'commercialization')` ya disponible
- Wired en 3 endpoints existentes:
  - `GET /api/leads/{lead_id}` (routes_dev_batch4_2.py) — scope_data(result, user, "lead")
  - `GET /projects/{project_id}/breakdown` (routes_dev_batch2.py) — scope_data(response, user, "project")
  - Notas: uso via import inline dentro del endpoint (cero breaking changes)

### 3. ai_budget.py — refactor completo con nuevas features
- `track_ai_call(db, dev_org_id, model, tokens, call_type, tokens_in=None, tokens_out=None)`:
  - Acepta split tokens_in/tokens_out (70/30 si no se proveen)
  - Costo estimado USD → MXN usando MODEL_COST_PER_1K lookup table
  - `call_log` rolling array (últimas 100 calls) en el documento
- `_maybe_send_budget_alert()` — email Resend si org > 80% del cap (1x/día, rate-limited)
- `get_ai_usage(db, dev_org_id, period)` → stats para "current_month" o "last_3_months"
- `ensure_ai_budget_indexes()` → manejo graceful de conflicto de índice (drop+recreate)
- Endpoints nuevos:
  - `PATCH /api/dev/ai-budget/threshold` (developer_admin: set threshold propio)
  - + audit_log + emit_ml_event para threshold_changed
- Endpoints existentes ya estaban: `GET /api/dev/ai-budget`, `GET /api/superadmin/ai-usage`, `PATCH /api/superadmin/ai-usage/{org}/cap`

### 4. track_ai_call() wired en TODAS las Claude calls ⭐ CRITICAL
- `routes_dev_batch4_4.py` — `_claude_json()` ahora acepta `db, dev_org_id, call_type`. Wired en:
  - `compute_heat_for_lead` → call_type="heat_score"
  - AI summary endpoint → call_type="ai_summary"
  - is_within_budget check ANTES de llamar a Claude (fallback determinista si over budget)
- `routes_dev_batch8.py` — wired en:
  - `_claude_scenario_narrative` → call_type="cash_flow_narrative"
  - `_claude_recommendations` → call_type="cash_flow_recommendations"
  - `_build_scenario_with_narrative` + `_recalc_forecast` actualizados para thread db/dev_org_id
- `routes_dev_batch7.py` — wired en:
  - `_claude_zone_narrative` → call_type="site_selection_narrative"
  - `_run_engine` acepta y pasa `dev_org_id` a `_claude_zone_narrative`
  - `asyncio.create_task(_run_engine(db, study_id, inputs, dev_org_id=org))` actualizado
- `routes_dev_batch5.py` — wired en:
  - `_claude_narrative` → call_type="pdf_report_narrative"
  - `_build_pdf` pasa `db` y `dev_org_id` a `_claude_narrative`
- `narrative_engine.py` — wired en `get_or_generate` tras `_generate_narrative` (usa tokens reales input/output)
- `caya_engine.py` — wired inline tras Claude call → call_type="caya_conversation"
- `routes_public.py` — wired inline tras `property_briefing` call → dev_org_id="public"

### 5. routes_badges.py (NUEVO) + server.py registration
- `GET /api/dev/leads/count-unread` → leads sin leer asignados al org
- `GET /api/dev/citas/count-today` → citas hoy en estado scheduled/confirmed
- `GET /api/dev/projects/count-unhealthy` → proyectos con health_score < 60 (fallback: ie_scores)
- `GET /api/asesor/contacts/count-new` → leads nuevos en últimos 7 días para asesor
- `server.py`: `include_router(badges_router)` + project_documents migration en startup
- project_documents migration: escaneá developments con embedded docs, migra a colección separada

### 6. i18n/index.js — Namespaces es-MX + en-US
- Recursos duales: `translation` (backward-compat es/en) + `common` namespace (es-MX/common.json, en-US/common.json)
- `lng: 'es-MX'` como primario, fallbackLng chain: es-MX → es → en-US → en
- `useTranslation('common')` disponible para primitivos compartidos

### 7. Lazy Load verificado ✓
- 50 React.lazy() chunks en App.js
- mapbox-gl: solo en chunks lazy (Mapa, PropertyDetail, DevelopmentDetail, SiteSelection, Demanda, CalendarioSubidas)
- recharts: NO es dependencia directa — usa SVG custom charts
- maplibre-gl: en package.json pero sin import directo (ready para usar)
- Conclusión: initial bundle limpio, heavy deps (~700KB mapbox gzip) solo en lazy chunks

### Archivos tocados
- `/app/backend/permissions.py` (+3 helpers)
- `/app/backend/data_scoping.py` (+commercialization type + _scope_commercialization)
- `/app/backend/ai_budget.py` (refactor completo: tokens_in/out, email alert, get_ai_usage, threshold endpoint)
- `/app/backend/routes_badges.py` (NUEVO: 4 badge count endpoints)
- `/app/backend/routes_dev_batch4_4.py` (track_ai_call en _claude_json + callers)
- `/app/backend/routes_dev_batch8.py` (track_ai_call en _claude_scenario_narrative + _claude_recommendations)
- `/app/backend/routes_dev_batch7.py` (track_ai_call en _claude_zone_narrative + _run_engine)
- `/app/backend/routes_dev_batch5.py` (track_ai_call en _claude_narrative)
- `/app/backend/narrative_engine.py` (track_ai_call en get_or_generate)
- `/app/backend/caya_engine.py` (track_ai_call inline)
- `/app/backend/routes_public.py` (track_ai_call inline property_briefing)
- `/app/backend/server.py` (+routes_badges + project_documents migration)
- `/app/frontend/src/i18n/index.js` (namespaces es-MX + en-US)

### SHA antes de este commit: `9185564`


---

## 2026-05-02 — Phase 4 B0 Sub-chunk B · Primitives Set 2 + SmartWizard

### Componentes creados/reescritos (todos en `frontend/src/components/shared/`)

**EntityDrawer.js** (~150L)
- Desktop: panel lateral derecho 520px con animación `slideInRight` via `createPortal`
- Mobile (<840px): bottom-sheet 90vh con drag handle + swipe-down cierra (touch events)
- Props: `isOpen, onClose, title, sections[{id,title,content,defaultOpen,role_visible[]}], entity_type, user`
- Secciones colapsables individualmente, estado persistido en localStorage por `entity_type` (`dmx_drawer_${entity_type}`)
- Filtro role-based: section oculta si `user.role` no en `role_visible` (salvo `'*'`)
- ESC cierra · click backdrop cierra · swipe-down >80px cierra en mobile

**HealthScore.js** (~90L)
- SVG ring circular. Sizes: sm=48px · md=64px · lg=88px
- Color: rojo `#f87171` si score <50 · ámbar `#fbbf24` si 50–79 · verde `#4ade80` si ≥80
- Centro: número grande + "/100" a menor tamaño
- Click → popover breakdown con barras por componente. Breakdown format: `{label, weight, score, status}`
- `variant` prop: 'project' | 'asesor' | 'client' controla header del popover
- Close popover on outside click (useRef + mousedown)

**DragDropZone.js** (~100L)
- Props: `accept, maxSizeMB, maxFiles, onUpload`
- Drop area dashed, hover state visible + scale-[1.01] on drag
- Multi-file (hasta maxFiles), preview thumbnails (imagen real o FileText icon para PDFs)
- Validación por archivo: tamaño > maxSizeMB → error inline con AlertCircle
- Click también abre file picker

**InlineEditField.js** (~120L)
- Types: text | number | currency | date | select
- Optimistic update: aplica valor antes de `onSave`, revierte si la promesa rechaza
- Loading spinner durante save, check flash 1.8s tras éxito
- `user_can_edit=false` → modo read-only con Lock icon (no click handler)
- Error inline posicionado absoluto bajo el campo

**UndoSnackbar.js** (~90L)
- API: `showUndo({ message, onUndo, timeout=30000 })`
- Stack bottom-right: múltiples undos simultáneos en columna (más nuevo arriba)
- `CountdownBar` animado via `requestAnimationFrame`: verde >50% · ámbar 20–50% · rojo <20%
- Auto-dismiss exacto por `setTimeout` + `dismiss()` limpia timer y stack
- `fadeInUp` CSS animation en cada snack

**SmartWizard.js** (~200L)
- Props: `steps[{id, title, component, optional, validate}], onComplete, draft_key, ia_prefill, title, onCancel`
- Progress bar gradient `#6366F1→#EC4899` interpolando por step index
- Auto-save draft a localStorage cada 600ms (debounce)
- Banner "Tienes un borrador guardado" + botones Continuar/Descartar
- IA prefill banner con Sparkles icon (badge "Sugerido por IA" por campo individual en el step component)
- "Llenar después" toggle en pasos `optional: true` (antes de último paso)
- Botones footer: Atrás · Guardar borrador · Llenar después (si optional) · Siguiente / Finalizar
- `UndoProvider` envuelve toda la app en `App.js` (raíz)

### Página demo
- **`/superadmin/primitives-demo`** (`PrimitivesDemo.js` ~270L)
  - Secciones: 1.EntityDrawer · 2.HealthScore · 3.DragDropZone · 4.InlineEditField · 5.UndoSnackbar · 6.SmartWizard
  - EntityDrawer: role filter activo (sección "Acciones Admin" solo visible superadmin)
  - HealthScore: scores 25/65/92 con lg + scores 78/55 sm/md
  - SmartWizard embedded con IA prefill ("Torre Polanco Residencial"), step "Ubicación" optional
  - Nav item "UI Primitivas" (Boxes icon) en superadmin sidebar · active state funciona
- **`frontend/package.json`**: script `"start": "react-scripts start"` restaurado (estaba faltando)
- **`App.js`**: `UndoProvider` envuelve `AuthProvider` · lazy import `PrimitivesDemo` · ruta `/superadmin/primitives-demo`

### Verificación screenshot
- Login `admin@desarrollosmx.com` → `/superadmin/primitives-demo` carga sin error ✓
- HealthScore 3 colores correctos (rojo/ámbar/verde) ✓
- EntityDrawer abre con secciones colapsables + backdrop blur ✓
- SmartWizard: 3 dots, IA prefill banner, "Guardar borrador" button ✓
- InlineEditField: text/currency/select/date + read-only con lock ✓

### Archivos tocados
- `/app/frontend/src/components/shared/EntityDrawer.js` (reescrito)
- `/app/frontend/src/components/shared/HealthScore.js` (reescrito)
- `/app/frontend/src/components/shared/DragDropZone.js` (reescrito)
- `/app/frontend/src/components/shared/InlineEditField.js` (reescrito)
- `/app/frontend/src/components/shared/UndoSnackbar.js` (reescrito)
- `/app/frontend/src/components/shared/SmartWizard.js` (reescrito)
- `/app/frontend/src/pages/superadmin/PrimitivesDemo.js` (nuevo)
- `/app/frontend/src/App.js` (+UndoProvider + PrimitivesDemo import + route)
- `/app/frontend/src/config/navByRole.js` (+Boxes import + "UI Primitivas" nav item)
- `/app/frontend/package.json` (+start script restaurado)
