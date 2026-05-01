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
- `server.py` — core: auth, public marketplace, Claude briefing/parser (973 líneas)
- `routes_advisor.py` — **nuevo Fase 4**: CRUD contactos/búsquedas/captaciones/tareas/operaciones/comisiones + argumentario AI + briefing + leaderboard
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
- Phase 7.10 ⏳ Avance de obra timeline


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

### Refactor (no blocker)
- [ ] Split `server.py` en routers (auth/marketplace/developments/briefings/ai-search)
- [ ] Split landing components grandes (ColoniasBento, Hero)
- [ ] Backend tests unit (pytest) por router

---

## URL preview
https://propiedades-next.preview.emergentagent.com

- `/` Landing
- `/marketplace` Grid desarrollos + AI search + filtros horizontales
- `/desarrollo/altavista-polanco` Ficha completa (Iteración B)
- `/mapa` Mapbox CDMX
- `/asesor` Panel asesor (login `asesor@demo.com`)
- `/asesor/contactos|busquedas|captaciones|tareas|operaciones|comisiones|ranking`
