# AUDIT FASE 5 — Cables rotos (front ↔ back, y back ↔ datos)
Fecha: 2026-06-10 · READ-ONLY · (evidencia: QA4/QA5 ejecución + barrido exhaustivo de nombres)

## RESUMEN EJECUTIVO
El **contrato API front↔back está limpio** (QA4 verificó 0 drifts en las pantallas nuevas F2–F5: cada llave que el front lee, el back la devuelve). El problema real está **del backend hacia los datos**: la clase "DENUE" — **nombres que apuntan a algo vacío/inexistente** — es masiva: **43 colecciones se leen y nadie las escribe**, **19 llamadas cross-módulo con firma rota** (incluido el pipeline ML completo), y campos leídos que no existen. Esto es el patrón clásico de vibecoding: piezas creadas en sesiones distintas y nunca enlazadas con el nombre correcto.

**Conteo:** P0: 3 · P1: 4 · P2: 5

### [P0] Pipeline ML completo inerte — `emit_ml_event` mal llamado en 16 sitios
- **Ubicación:** `observability.py emit_ml_event(db, *, event_type, …)` llamado con args POSICIONALES en documents.py:620, developer.py:900, dev_batch1.py:354, dev_batch10/11, diagnostic.py (×5), wizard.py (×2), b13.py (×3), search_prefs.py:172.
- **Evidencia:** firma exige keyword tras `*` → `TypeError`, tragado por try/except → `ml_accuracy_log`=0, `ml_training_events`=3. Verificado QA5.
- **Impacto:** TODA la telemetría de entrenamiento/accuracy del ML nunca se grabó → los modelos "que aprenden" no tienen de qué aprender; los dashboards de accuracy mienten.
- **Fix:** llamar con keywords; añadir test que falle si la firma cambia.

### [P0] Respuestas de WhatsApp nunca se clasifican — `classify_reply` no existe a nivel módulo
- **Ubicación:** `whatsapp_engine.py:221` importa `classify_reply` de `agentic_crm/reply_classifier_engine` pero ahí solo existe el MÉTODO de clase `classify_reply(self, …)` → ImportError tragado.
- **Impacto:** el clasificador de intención de respuestas de leads por WhatsApp nunca corre → el flujo agéntico de nurture/closer no reacciona.
- **Fix:** exponer función módulo-level o instanciar la clase.

### [P0] 43 colecciones leídas SIN escritor (la clase DENUE)
- **18 son typo/fork con gemelo LLENO** (fix = renombrar la lectura):
  `behavioral_tracking_events`→`behavioral_events`(47) · `zone_subscores`→`zone_scores`(168) · `ie_engine_scores`→`ie_scores`(3422) · `ie_scores_history`→`ie_score_history`(10266) · `properties`→`dmx_units`(496) · `zones`→`dim_zones`(51) · `asesor_leads`→`asesor_contactos` · `asesor_citas`→`appointments` · `scores`→`zone_scores` · `favoritos`→`buyer_favorites` · `dev_leads`→`leads` · `comparables`→`comparable_alerts` · `narratives`→`ie_narratives` · `tenants`→`organizations` · `asesores`→`inmobiliaria_internal_users` · `ie_unit_scores`→`ie_scores` · `market_bulletins`→`dmx_bulletins`.
  - **Impacto:** Live Pulse (señal view-volume), Battle Card (dim zona), colonia intelligence, briefing, director agent, brochure, etc. **leen vacío siempre** → features que parecen vivas devuelven 0/None silenciosamente.
- **25 inertes sin gemelo** (feature muerta por diseño): `marketplace_searches`, `matches`, `unit_engagement`, `buyer_assignments`, `buyer_history`, `engagement_events`, `site_studies`, `lead_attribution`, `phase_y_recommendations`, etc.
- **Fix:** renombrar las 18 lecturas a su colección real; cablear o eliminar las 25 inertes.

### [P1] Cable FE roto — RepliesInbox llama a ruta inexistente
- **Ubicación:** `frontend/src/components/agentic_crm/RepliesInbox.js:337/351/363/383` → `GET/POST /api/asesor/leads/{id}` y `/watchlist`. **No existe** `/api/asesor/leads/*` (advisor usa `/api/asesor/contactos/*`). 4 llamadas → 404 en runtime.
- **Fix:** apuntar a `/api/asesor/contactos/*`.

### [P1] Firmas cross-módulo rotas (más allá de ML)
- `score_inversion_engine.py:169` `stress_test(db, precio_entrada=…)` vs firma real `stress_test(bundle: dict)` → 10% del score de inversión congelado en 50.
- `wizard.py:666` `track_ai_call(...)` sin el arg requerido `tokens` → costos de IA del wizard nunca contabilizados.

### [P1] Estados de carga/error sin manejar (frontend)
- `DesarrolladorReportes.js`: `getForecast()` sin `.catch` (cuelga en "Cargando…"); `active.metrics.*`, `data.cancel_reasons_breakdown.map`, `alerts_by_asesor.length`, ListBox `items.map` sin optional chaining → **crash con respuesta parcial**.
- `DesarrolladorValorTerreno.js:360` `dd.secciones.filter` sin guard; `SuperadminIndices.js:182/384` `r.idm.valor` sin `?.`.
- 2 formularios (Templates/Distribuciones) sin `disabled` durante POST → doble-submit.
- **Fix:** optional chaining + `(x||[])` + estado de error + disabled async.

### [P1] Campos leídos que no existen (hermanos de score_total)
- `cube_aggregations.last_synced_at` (es `computed_at`) → API v1 reporta frescura None.
- `hedonic_models.coefficients/r_squared` (0/48 con available) → AVM explain + FSD degradan a stub siempre.
- `risk_scores_zone.score_letter/numeric/tier` (0/195; solo `components`) → widget/zona pública muestran riesgo None.
- `denue_zone_density.safety_score` (vive en `crime_zone_colonia`) → subscore de seguridad lee 0.

### [P2] Código huérfano / redundante (NO mueve aguja)
- 5 endpoints dev (`amenidades-ranker`, `cuota-recomendada`, `comercio-pb`, `perfil-zona`, `tono-marketing`) existen y están registrados pero ningún componente los llama directo (su salida sólo aparece embebida en el Estudio) → redundantes, no rotos.
- Test roto: `tests/wave3/test_denue_engine_unit.py` importa `denue_engine` (módulo borrado) → falla la colección de tests.

## LIMPIO (verificado)
- Contrato API de las pantallas nuevas F2–F5: **0 drifts** (QA4 ejecutó cada endpoint y comparó llaves). 
- 593 módulos backend importan sin error; 669 paths del front resuelven a ruta backend real (salvo el RepliesInbox de arriba); ~120 crons resuelven a funciones existentes.
