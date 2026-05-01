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
