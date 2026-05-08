# DMX Build Standards (referenced by every batch prompt)

## ═══ EXECUTION RULES (CRITICAL — leer antes de cualquier acción) ═══

### NO PREGUNTAR — el prompt es la spec definitiva
- Toda la información necesaria está en el prompt + este standards file + el repo.
- NUNCA preguntar al founder "¿procedo con plan A o B?" cuando el prompt ya tiene la respuesta.
- Antes de plantear una pregunta: re-leer el prompt completo. Si la respuesta está ahí (aunque sea en otra sub-sección) → ejecutar sin preguntar.
- Si encuentras edge case GENUINAMENTE no cubierto: decisión conservadora + reportar en summary final. NO Q&A round-trip.
- Cada round-trip de pregunta = tokens desperdiciados del founder.

### Si archivo a crear YA EXISTE en repo → STOP
- ANTES de crear cualquier archivo nuevo: `ls {path}` o `git ls-files | grep {filename}`.
- Si existe → reportar en summary "el archivo X ya existía con N bytes, NO lo sobreescribí". NUNCA reemplazar con stub. NUNCA asumir "Sub-A no existía".
- Lección B21: emergent overwrote real Sub-A con stub porque asumió que no existía.

### NO TOCAR (off-limits files)
- `/app/memory/PRD.md`
- `/app/06_ROADMAP.md`
- `/app/05_DESIGN_SYSTEM.md`
- `/app/01_PRODUCT.md` · `02_FEATURES.md` · `03_INTELLIGENCE.md` · `04_UI_DATA_REF.md`
- `/app/test_credentials.md`

Tracking de batches lo maneja Claude Code (founder's PM). Tu output: código + summary con SHA.

### Output esperado per batch
1. Código completo per spec del prompt
2. Build limpio (`yarn build` pasa)
3. Save to GitHub
4. Summary con: SHA, archivos creados/editados, edge cases conservadores tomados

**NO incluir en output (Claude Code los hace post-push):**
- ❌ Tests pytest escritos por emergent — NO crear archivos `tests/test_batchXX.py`
- ❌ Pre-commit greps de design system
- ❌ Playwright smoke / E2E
- ❌ Lint runs (ruff, eslint) — solo asegurar que `yarn build` pasa

### IMPORTANT — sección "ACCEPTANCE CRITERIA" del prompt

Si el prompt tiene una sección **ACCEPTANCE CRITERIA** o **VERIFICACIÓN**, esos son **criterios MANUALES de aceptación** (lista de condiciones que la feature debe cumplir), NO son test cases para escribir como pytest.

**Cómo interpretarlos:**
- "POST /endpoint retorna shape exacto" = el endpoint debe funcionar manualmente cuando se llame
- "Permission denied → 403" = condición que el código debe garantizar (NO escribir test_permission_denied)
- "Filter period=7d filtra correctamente" = comportamiento de la lógica (NO escribir test_filter_period)

**Tu trabajo:** ASEGURAR que el código cumple esos criterios. Claude Code post-push los valida con pytest + curl + smoke.

**Excepción única:** si el prompt dice EXPLÍCITAMENTE "Crea pytest test_batch{N}.py con N tests específicos" → entonces sí escribir tests. Sino: NO crear archivos de tests.

## ═══ DESIGN SYSTEM (NO violations) ═══

### Tokens canónicos
- Colors: `--bg #06080F` · `--cream #F0EBE0` · `--indigo #6366F1` · `--rose #EC4899`
- Gradient único: `linear-gradient(90deg, #6366F1, #EC4899)` — NUNCA otros ángulos ni colores
- Fonts: Outfit (700, 800) display · DM Sans (400, 500, 600) body

### Reglas inviolables
- Buttons SIEMPRE `border-radius: 9999px` (rounded-full) — NUNCA rounded-lg/md/sm
- NO `shadow-2xl` → usar `border + backdrop-blur(24px) + bg(13,16,23,0.92)`
- Transforms SOLO `translateY` — NUNCA rotate, scale, translateX en mobile
- Cero emoji en UI · Animaciones ≤850ms · `once: true` viewport-triggered
- Atoms only: reusar `<Card>`, `<Badge>`, `<PageHeader>` de `components/advisor/primitives.js` y `components/icons/index.js`

### Keyboard shortcuts ya tomados (NO reusar)
- Cmd+K = UniversalSearch · Cmd+/ = ProjectSwitcher · Cmd+B = Toggle sidebar
- Cmd+N = Quick action · Esc = Close drawer · Cmd+Shift+P = Modo Presentación
- ? = Help dialog · g h/p/c/l = navigation
- NUNCA Cmd+P (rompe browser print nativo)

## ═══ Code patterns to reuse (no re-explanation needed) ═══

### audit_log
`await audit_log.log_mutation(db, entity_type, entity_id, before, after, actor, request, action='update'|'create'|'delete'|'read')` después de cada mutation. Fire-and-forget.

### emit_ml_event
`await emit_ml_event(db, event_type, user_id, org_id, role, context)` para ML training corpus. Mirror automático a PostHog con `dmx_ml_*` prefix.

### log_activity (B14)
`await log_activity(actor_id, action, entity_id, entity_type, metadata={})` en mutaciones críticas. Alimenta Activity Feed + Productividad metrics.

### Role guards
- Reusar `routes_dev_batch4_2.get_user_permission_level(user)` → canonical level: superadmin | developer_director | developer_member | inmobiliaria_director | inmobiliaria_member | asesor_freelance
- Reusar `can_view_kanban`, `can_move_lead`, `can_view_full_client_data`, `can_view_conversation`, `can_view_ai_summary` del mismo file

### Resend email
`await send_resend(to, subject, html, attachments?)`. Branded templates usan `dev_org.branding` (B19 helper `branding_helpers.py`) para logo + colors. Default es-MX.

### ai_budget gating (B0)
Antes de llamar Claude (Sonnet/Haiku): verificar `ai_budget.is_within_budget(org_id)`. Si exceeded → return null o cached. Cache 24h en `db.ai_suggestions` (B16).

### cookie tracking 30d (B13)
`set_ref_cookie(response, ref_slug, days=30)` para attribution multi-touch.

## ═══ Frontend structure ═══

- Components shared: `frontend/src/components/shared/`
- Per-portal: `frontend/src/components/{advisor,developer,inmobiliaria,public}/`
- Pages: `frontend/src/pages/{advisor,developer,inmobiliaria,public}/`
- API helpers: `frontend/src/api/{scope}.js` (extender existing si aplica, NO duplicar)
- i18n strings es-MX: `frontend/src/i18n/locales/es-MX/common.json`

## ═══ Conventions ═══

- New backend route file naming: `routes_{name}.py` o `routes_dev_batch{N}.py`
- Schema collections: snake_case
- Endpoints: `/api/{scope}/{resource}` (scope: dev/advisor/inmobiliaria/public)
- Spanish UI copy, English code identifiers
- Strings UI nuevas → siempre en es-MX common.json

## ═══ URL-Encoding rules (Wave 3 fix-pass) ═══

Path params con potenciales acentos: `zone_id`, `tier_id`, `alcaldia`, `colonia` (CDMX tiene Cuauhtémoc, Tláhuac, Álvaro Obregón, Coyoacán, Tlalpan).

**Frontend SIEMPRE**:
- `encodeURIComponent(zoneId)` antes de meter en URL path
- O usa `URLSearchParams({zone_id})` que auto-encoda

```javascript
// ✅ CORRECTO
fetch(`${BASE}/${encodeURIComponent(tier)}/${encodeURIComponent(tierId)}`)
const p = new URLSearchParams({ zone_id, tier });

// ❌ INCORRECTO — Cloudflare rechaza acentos raw
fetch(`${BASE}/${tier}/${tierId}`)
```

**Backend defensive** (importar desde permissions.py):
```python
from permissions import safe_path_param

@router.get("/zone/{zone_id}")
async def get_zone(zone_id: str):
    zone_id = safe_path_param(zone_id)  # normaliza acentos + lowercase + NFC unicode
    doc = await db.zones.find_one({"id": zone_id})
```

`safe_path_param()` hace: URL-decode si necesario · NFC unicode normalize · lowercase · trim. Es idempotente (no-op si ya viene clean de FastAPI).

## ═══ Reusable primitives by batch ═══

- B0: PortalLayout · EntityCard · EntityDrawer · KPIStrip · UniversalSearch · SmartWizard · NotificationsBell
- B14: HealthScoreWidget · ActivityFeed · SetupChecklist · FloatingQuickActions
- B16: AISuggestionCard · SmartEmptyState · `/lib/anonymize.js`
- B17: SortableList · InlineEditField · `useInlineSaver` · FilterChipsBar · FilterPresetsBar · UndoSnackbar
- B18: `useDensity` · `useIsMobile` (B18.5) · ProjectSwitcher
- B19: useTour · useKeyboardShortcuts · KeyboardHelpDialog · usePresentationMode · `branding_helpers.py`
