═══════════════════════════════════════════════════════════
INSTRUCCIONES DE EJECUCIÓN (obligatorias, leer antes de cualquier acción)
═══════════════════════════════════════════════════════════

- Toda la información, scope, schemas, endpoints, UI, paths, decisiones técnicas y criterios de aceptación están definidos COMPLETAMENTE en este prompt.
- NO preguntes nada adicional al founder. Si crees que falta info, re-lee el prompt — la respuesta está ahí.
- NO te detengas a confirmar planes, alternativas, o "¿procedo con A o B?". El prompt es la spec definitiva.
- NO pidas validación intermedia. Ejecuta de principio a fin sin pausas.
- Si encuentras un edge case GENUINAMENTE no cubierto: toma la decisión MÁS CONSERVADORA y reporta en el summary final. NO Q&A round-trip.
- Si un archivo a crear ya existe en el repo: NO lo sobreescribas con stub. Reportar en summary "el archivo X ya existía con N bytes, lo extendí/reemplacé porque…".
- NO escribas pytest tests salvo que el prompt lo pida EXPLÍCITAMENTE. Claude Code valida post-push.
- NO toques: PRD.md · 06_ROADMAP.md · prompt_standards.md · BACKLOG_ENHANCEMENTS.md · WAVE_PROGRESS.md · WAVE5_PLAN.md · WAVE6_PLAN.md · WAVE7_PLAN.md · 05_DESIGN_SYSTEM.md · 01_PRODUCT.md · 02_FEATURES.md · 03_INTELLIGENCE.md · 04_UI_DATA_REF.md · test_credentials.md · REDESIGN_ASESOR_*.md.
- Sigue las reglas de `/app/memory/prompt_standards.md` (design system tokens, atoms only, keyboard shortcuts tomados, code patterns reusables).
- Output final: código + `yarn build` limpio + push a main (rebase primero) + summary con SHA + archivos editados + edge cases conservadores.

═══════════════════════════════════════════════════════════

# W5.1 — AVM ML productionization (Hedonic público) (~26h · 5 sub-chunks · NO ship parcial)

═══ FILES MAP ═══
✨ NEW backend: /app/backend/avm_retrain_cron.py · /app/backend/routes/avm_accuracy.py · /app/backend/golden_avm_data.py · /app/backend/avm_explain_engine.py · /app/backend/avm_cache.py
✏️ EDIT backend: /app/backend/server.py (registrar cron + router) · /app/backend/avm_public_engine.py (cache + explainability) · /app/backend/routes/avm_public.py (nuevos endpoints) · /app/backend/hedonic_regression_engine.py (función promote_model)
✨ NEW frontend: /app/frontend/src/pages/superadmin/SuperadminAvmAccuracy.js · /app/frontend/src/pages/public/ValorColonia.js · /app/frontend/src/components/widgets/AvmWidget.js · /app/frontend/src/pages/widgets/AvmWidgetPage.js · /app/frontend/src/components/avm/ExplainabilityCard.js · /app/frontend/src/api/avm.js
✏️ EDIT frontend: /app/frontend/src/App.js (3 rutas) · /app/frontend/src/pages/public/Valores.js (explainability) · /app/frontend/src/i18n/locales/es-MX/common.json (strings nuevas)
❌ NO TOCAR: memory/PRD.md · 06_*.md · 05_DESIGN_SYSTEM.md · 01-04_*.md · test_credentials.md · WAVE5_PLAN.md
🔁 REUSAR: APScheduler patrón `cron_heartbeat.py` · `scheduler_asesor_snapshots.py` · `predict_price` hedonic_regression_engine · primitives Card/Stat/Badge advisor · SuperadminLayout patrón

═══ DESIGN SYSTEM (NON-NEGOTIABLE) ═══
- Colors: --bg #06080F · --cream #F0EBE0 · --indigo #6366F1 · --rose #EC4899
- Gradient único: linear-gradient(90deg, #6366F1, #EC4899)
- Buttons SIEMPRE rounded-full · NUNCA rounded-lg/md/sm
- NO shadow-2xl → border + backdrop-blur(24px) + bg(13,16,23,0.92)
- Transforms: SOLO translateY · cero emoji · animaciones ≤850ms
- Fonts: Outfit display · DM Sans body

═══ STANDING RULES ═══
NO preguntas · construir COMPLETO · edge case → conservador + reporta summary
Si archivo a crear YA EXISTE → STOP + reporta (NUNCA sobreescribir con stub)
Strings UI nuevas en i18n es-MX · Save GitHub + reportar SHA al cierre

═══ CONTEXTO TÉCNICO (estado actual) ═══
- `hedonic_regression_engine.predict_price()` YA se usa en `avm_quick_async` con sanity guards (r² ≥ 0.20 · ratio bounds 0.30-3.0x heuristic baseline) · fallback heurístico cuando model rechaza
- `pricing_model: "hedonic_regression" | "heuristic"` ya en response shape de `/api/avm-public/quick`
- Colección `hedonic_models` tiene `available: true` flag + `r_squared` + `fit_at_dt` · sort -1 toma latest
- APScheduler ya inicializado en `server.py` (ver patrón `cron_heartbeat`)
- Frontend `Valores.js` consume `/api/avm-public/quick` · muestra estimate + range + comparables · NO muestra explainability

═══ SUB-CHUNK A — Nightly retraining cron + auto-promotion (~6h) ═══

SCHEMA:
- hedonic_models extiende: `training_sample_size: int · feature_set: list[str] · mape_test: float · promoted_at: datetime?`
- hedonic_promotion_log nueva: `{id · old_model_id · new_model_id · old_r2 · new_r2 · promoted_at · reason}`

BACKEND:
- NEW `avm_retrain_cron.py`: función `retrain_nightly()` corre 03:00 UTC daily vía APScheduler
- Pasos: (1) fetch últimos 90 días `unit_price_history` (2) train/test split 80/20 estratificado por colonia (3) fit hedonic vía `hedonic_regression_engine.fit_model(features=[m2,recamaras,banos,antiguedad_anos,colonia_score])` (4) compute r² + MAPE sobre test set (5) si r² mejora >5pp vs current available model O current sin model → flip available flag + log promotion
- EDIT `hedonic_regression_engine.py`: añadir `promote_model(db, new_model_id, reason: str) → log + flip flags`
- EDIT `server.py`: registrar cron 03:00 UTC + log boot "[w5.1] avm retrain cron scheduled @ 03:00 UTC"
- API: ninguna (cron silencioso · superadmin observa via dashboard Sub-B)

ACCEPTANCE CRITERIA Sub-A:
- Cron registrado en boot logs visible · APScheduler job_id="avm_retrain_nightly"
- Promotion log inserta row cuando r² mejora >5pp · `available: true` flip atomic
- Si train falla (insufficient data) → log warning + skip · no break del cron

═══ SUB-CHUNK B — Accuracy dashboard superadmin (~5h) ═══

BACKEND:
- NEW `routes/avm_accuracy.py` permisos superadmin only:
  - GET `/api/superadmin/avm-accuracy/summary` → `{current_model: {id, r2, mape, sample_size, fit_at}, history_last_30: [{id, r2, mape, fit_at, was_promoted}], drift_per_colonia: [{slug, name, samples, mape, r2}]}`
  - GET `/api/superadmin/avm-accuracy/promotions` → list `hedonic_promotion_log` últimas 30
  - POST `/api/superadmin/avm-accuracy/trigger-retrain` → manual trigger (admin-only · idempotent via lock)

UI:
- NEW `/superadmin/avm-accuracy` route (registrar `SuperadminLayout` con sección "Inteligencia"):
  - KPIs strip: r² actual · MAPE actual · sample_size · días desde fit · botón "Retrain ahora" (rounded-full · gradient)
  - Card "Histórico 30d": tabla 30 filas (model_id corto · r² · MAPE · fit_at · promoted badge si aplica)
  - Card "Drift por colonia": tabla top 20 colonias por sample · columnas (colonia · samples · MAPE · r²) · highlight MAPE >25% en rose
  - Card "Promotion log": últimas 10 promociones con razón

ACCEPTANCE CRITERIA Sub-B:
- 401/403 si no superadmin · endpoints retornan shape exacto con seed N=3 modelos
- Botón "Retrain ahora" llama trigger endpoint · toast "Retrain iniciado" · refresh data tras 5s
- Tabla drift filtra colonias con sample_size < 5 (sin datos suficientes excluidos)

═══ SUB-CHUNK C — Public AVM widget embeddable + landing SEO (~6h) ═══

BACKEND:
- EDIT `routes/avm_public.py`: nuevos endpoints
  - GET `/api/avm-public/widget-config/{colonia_slug}?theme=dark|light` → response light shape para widget (estimate range + r² confidence + 3 comparables · sin PII)
  - GET `/api/avm-public/landing/{colonia_slug}` → SEO metadata `{title, description, og_image_url, schema_org_jsonld}` + datos colonia

UI:
- NEW `/widgets/avm/:slug` route (similar a `/widgets/score/:slug`):
  - Iframe-ready · sin navbar · fondo translúcido · theming via `?theme=dark|light&primary={color}`
  - Form mínimo: m² (slider 30-400) · recámaras (1-5) · baños (1-5) · antigüedad (slider 0-50)
  - Result card: estimate · range CI · comparables · "Powered by DMX" link
- NEW `/valor/:slug` route SEO landing:
  - SSR-friendly meta tags + Schema.org JSON-LD `RealEstateListing`
  - H1 "Valor estimado en {Colonia Name}"
  - Form completo + ejemplos pre-cargados (60m² 2rec 2ban 5años / 90m² 3rec 2ban 10años / 120m² 3rec 3ban 0años)
  - Sección "¿Cómo calculamos esto?" linka a `/metodologia-avm`
  - Bottom CTA "Habla con un asesor DMX" → `/asesores`

ACCEPTANCE CRITERIA Sub-C:
- Widget renderiza en iframe `<iframe src="/widgets/avm/roma-norte?theme=light" />` sin navbar visible
- Landing `/valor/roma-norte` tiene `<title>` + `<meta description>` + JSON-LD válido (parsea Google Rich Results test mentally)
- Form sliders responden y llaman `/api/avm-public/quick` con debounce 400ms

═══ SUB-CHUNK D — Explainability (feature contribution) (~5h) ═══

BACKEND:
- NEW `avm_explain_engine.py`: función `compute_contributions(model_coefs, features) → {m2_pct, recamaras_pct, banos_pct, antiguedad_pct, colonia_pct, intercept_pct}` (suma 100%)
  - Algoritmo simple: para cada feature `f_i`, contribution = `coef_i * value_i / (sum |coef_j * value_j| + |intercept|)` · normalizar a %
- EDIT `avm_public_engine.py:avm_quick_async`: cuando `pricing_model == "hedonic_regression"`, fetch `hedonic_models[id].coefficients` + compute contributions → añadir a response `explainability: {contributions: {...}, narrative: "El precio se explica principalmente por X (Y%) y Z (W%)"}`
- Si heuristic fallback → `explainability: null`

UI:
- NEW `components/avm/ExplainabilityCard.js`: stacked horizontal bar chart con 5 barras + narrative debajo · colores `--indigo` / `--rose` / `--cream-2` alternando
- EDIT `Valores.js`: si `data.explainability` presente → render `<ExplainabilityCard />` debajo del estimate card
- Mismo card embebido en `/valor/:slug` (sub-chunk C) bajo "¿Cómo calculamos esto?"

ACCEPTANCE CRITERIA Sub-D:
- Contributions suman 100% (±0.5% tolerancia float)
- Si hedonic → card renderiza · si heuristic → card oculto · transición suave (no flicker)
- Narrative i18n: "{f1_name} contribuye {pct1}% · {f2_name} {pct2}%" auto-genera top-2

═══ SUB-CHUNK E — Cache layer + golden dataset (~4h) ═══

BACKEND:
- NEW `avm_cache.py`: in-memory LRU 1000 entries · TTL 6h · key=`f"{colonia_slug}|{m2}|{rec}|{ban}|{age}"`
- EDIT `avm_quick_async`: check cache antes de query DB · si hit return cached + `cache_hit: true` field
- Invalidación: cuando cron promotes new model (sub-A) → flush cache entero · log "[avm] cache flushed post-promotion"
- NEW `golden_avm_data.py`: hardcoded list 30 propiedades CDMX con precio "real" (mix de listings históricos representativos · founder valida post-ship). Helper `validate_against_golden() → {mape, items_within_15pct, items_total}`
- EDIT `routes/avm_accuracy.py`: añadir endpoint GET `/api/superadmin/avm-accuracy/golden-validation` → corre validate_against_golden y retorna métricas

ACCEPTANCE CRITERIA Sub-E:
- Cache hit ratio visible en `/superadmin/avm-accuracy` (nuevo KPI strip · hits/total última hora)
- Golden validation MAPE < 18% (target · ship si <25% por dataset limitado · founder ajusta post-ship)
- Cache invalidate atomic cuando cron promote · no race condition (lock asyncio)

═══ ENTREGABLES ═══
1. Backend: 5 archivos nuevos (`avm_retrain_cron`, `routes/avm_accuracy`, `golden_avm_data`, `avm_explain_engine`, `avm_cache`) + edits `server.py`, `avm_public_engine.py`, `routes/avm_public.py`, `hedonic_regression_engine.py`
2. Frontend: 6 archivos nuevos (`SuperadminAvmAccuracy`, `ValorColonia`, `AvmWidget`, `AvmWidgetPage`, `ExplainabilityCard`, `api/avm.js`) + edits `App.js` (3 rutas), `Valores.js`, `common.json`
3. Cron registrado · dashboard render · widget iframe-ready · landing SEO · explainability card · cache + golden validation
4. Build limpio · SHA reportado · summary archivos + edge cases conservadores
