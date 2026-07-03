# CORRECCIONES — fixes aplicados (N1/N2)

> Un hallazgo = un fix = un commit `[AUD-###]` en `auditoria/fixes-y-upgrades`.
> Test de regresión del batch: `backend/tests/test_aud_batch1_regressions.py` (3 tests, verdes).

| AUD | Nivel | Commit | Test | Antes → Después |
|---|---|---|---|---|
| AUD-004 | N1 | `3f12866c` | ruff-gate en test_aud_batch1 | `Optional` indefinido (latente) → importado |
| AUD-005 | N2 | `114231ce` | test_aud_005_branding_deriva_org_del_template | branding org jamás aplicado a PDFs (NameError tragado) → deriva de `template.dev_org_id`, B19.5 vive |
| AUD-006 | N1 | `14b12cb4` | ruff-gate (F823=0) | handler fail-open crasheaba el endpoint (UnboundLocalError) → usa el logging del módulo |
| AUD-007 | N1 | `d0d08e14` | ruff-gate | NameError timedelta en rate-limit del importer → importado |
| AUD-008 | N2 | `f434050e` | test_aud_008_modulos_importan_sin_app_dir | import crasheaba sin /app (0 tests corrían) → `fs_fallback.dir_or_tmp` (Emergent idéntico, local/CI cae a tmp) |
| AUD-009 | N2 | `7310c65e` | colección: 1,663 tests, 0 errores | I/O red/DB a nivel módulo en 3 archivos → `__main__` + skip honesto |
| AUD-010 | N2 | `edcedf0d` | test_mortgage_rate_desde_fuente_oficial | ImportError símbolos muertos → contrato actual banxico_rates (TIIE<hipoteca, rangos MX) |

**Impacto medible del batch 1:** pytest pasó de "Interrumpido: 9 errores de colección · 0 tests" → **1,663 recolectados · 1,189 pasan**. F821/F823: 5 → 0.

## Batch 2 (AUD-011..019) — cierre de los 5 abiertos + 6 nuevos

| AUD | Nivel | Commit | Antes → Después |
|---|---|---|---|
| AUD-011 | N2 | `0adecc46`+`772555a8` | pytest 184 fail+288 err → **0/0** (hook skip honesto de integración sin infra) |
| AUD-012 | N1 | `672b3600` + colonias_catalog | ruff 1591→1079 (512 safe fixes) · bandit triage: 0 vulns reales · +cast int defensivo B608 |
| AUD-013 | N2 | `c94a9d17` | tests con `/app` hardcoded → path portable |
| AUD-014 | N2 | `79af1dda` | tests stale → contrato actual (cube KPIs + storage fallback) |
| AUD-015 | N2 | `d8681e07` | demand_build_alert sin routing default → in_app+email |
| AUD-016 | N2 | `33e987b0` | es_estimado=False con dato derivado → True (honestidad) |
| AUD-017 | N2 | `729e713c` | SSRF test hosts no-resolvibles → IPs públicas deterministas |
| AUD-018 | N2 | `05df4737` | makedirs/mkdir import-time /app en bulletins+wizard → fs_fallback (server importa limpio) |
| AUD-019 | N1 | (este commit) | `or` con operandos idénticos → colapsado |
| AUD-001 | N1 | (este commit) | 185 env vars sin doc → 0 (167 backend + 18 frontend, con archivo de uso) |
| AUD-002 | N1 | (este commit) | doc 762 → 812 (Sección B tenía 100, no 50) |
| AUD-003 | N1 | (este commit) | 15 "huérfanos" → 0 (detector arreglado: imports con punto + carga por string) |

**Línea base final Batch 2:** pytest **1191 passed · 473 skipped · 0 failed · 0 errors** · ruff 512 fixed · bandit 0 vulns reales · backend importa 100% sin /app.

| AUD-026 | N2 | (este commit) | `test_aud026_airroi_cost_guard.py` (5 tests) | AirROI (API de pago) llamada ~25×/día por 2 crons → **3 capas de defensa**: (1) `PAID_CONNECTORS={'airroi'}` excluido de las 2 queries de cron; (2) kill-switch `AIRROI_ENABLED=false` corta fetch+test_connection; (3) `_fetch_source('airroi')` delega en el candado único `_airroi_zone` (1/zona/mes + cap 400/mes). **Incidente de costo cerrado.** |
| AUD-027 | N3 | (este commit) | `test_aud_batch4_idor.py::test_aud027` | **[CRÍTICO]** property-intake público devolvía `leads[]` (PII de prospectos) → proyección excluye leads/leads_count/last_lead_at |
| AUD-028 | N3 | (este commit) | `test_aud_batch4_idor.py::test_aud028` | gentrificación persist+backfill abiertos a anónimo → `await require_superadmin(request)` |
| AUD-029 | N3 | (este commit) | `test_aud_batch4_idor.py::test_aud029` | studio budgets admin (list+patch) fuga/mutación cross-tenant (asesor_admin tenant-scoped) → superadmin-only |
| AUD-030 | N3 | (este commit) | `test_aud_batch4_idor.py::test_aud030` | oráculo validate-code sin rate-limit + `random` → rate-limit por IP + `secrets` (CSPRNG) |

**Batch 4 (barrido IDOR · workflow 26 finders + verif adversarial 3-lentes):** 380 endpoints públicos analizados → **11 candidatos → 7 confirmados** (1 CRITICAL + 4 MEDIUM/LOW corregidos aquí + AUD-031 LOW diferido en PENDIENTES) · **4 refutados** (casamentera/plusvalia-estado/landing-slug/voice-download). Test: `test_aud_batch4_idor.py` (4 tests, verdes).

| AUD-032 | N3 | (este commit) | `test_aud032_ssrf.py` (3 tests) | **[CRÍTICO SSRF]** `/api/public/search/by-url` traía la URL cruda del usuario → metadata de nube/servicios internos. Fix: detección por hostname real + guard canónico `services.url_guard.assert_safe_url` (REUSO, ya lo usa parallax) + `follow_redirects=False` |

**Batch 5 (barrido inyección/SSRF · workflow 10 finders + verif adversarial 3-lentes):** 31 objetivos (SSRF/traversal/upload/cmd/NoSQL) → **1 confirmado** (AUD-032 SSRF crítico, corregido) · **1 refutado** (voice-download traversal). El resto (upload, subprocess parallax con lista, NoSQL) salió limpio. Test: `test_aud032_ssrf.py` (3 verdes).

| AUD-033 | N3 | (este commit) | `test_aud_batch6_tenant.py::test_aud033` | **[CRÍTICO]** Atlax público (RAG) exponía PII de leads de todos los tenants → `semantic_search` acotado a PUBLIC_SEARCH_SCOPES (no-PII) |
| AUD-034 | N3 | (este commit) | `::test_aud034` | **[CRÍTICO]** ai_suggestions leía lead/appointment/project/asesor ajeno por id → gate `_authorize_entity` (assert_lead_owner/assert_db_project_owner + tenant) |
| AUD-035 | N3 | (este commit) | `::test_aud035` | tracking_links list_links fail-open → `tenant_filter` fail-closed |
| AUD-036 | N3 | (este commit) | `::test_aud036` | team-aggregated saltaba scope sin tenant → sentinel cero-match |
| AUD-037 | N3 | (este commit) | `::test_aud037` | briefing-ie leía contacto/búsqueda ajenos → `tenant_filter` en ambas lecturas |
| AUD-038 | N3 | (este commit) | `::test_aud038` | visit-prep + casamentera + visit-briefing leían lead/cita ajenos → `assert_lead_owner`/`_assert_appointment_owner` |
| AUD-039 | N3 | (este commit) | `::test_aud039` | Cerebro enrich leía lead ajeno → `assert_lead_owner` (degrada seguro) |
| AUD-040 | N3 | (este commit) | `::test_aud040` | `_comportamiento` god-view con dev_ids=[] → chequeo `is None` |
| AUD-041 | N3 | (este commit) | `::test_aud041` | disputes oráculo 404/409 → check de dueño antes del status |
| AUD-042 | N3 | (este commit) | `::test_aud042` | workflow test filtraba atributos del lead ajeno → `assert_lead_owner` |

**Batch 6 (aislamiento multi-tenant · workflow 36 finders + verif adversarial 3-lentes):** 143 archivos / 451 lecturas sensibles → **21 fugas confirmadas / 3 refutadas**. **15 corregidas** aquí (AUD-033..042 + 2 cubiertas de paso: ai_suggestions project/asesor por 034, casamentera→lead_to_asesor_match por 038); **6 diferidas** (PENDIENTES). Test: `test_aud_batch6_tenant.py` (10 verdes). Patrón dominante: fail-open cuando `tenant_id` es None/vacío + lecturas de PII con id del cliente sin `assert_lead_owner` (misma clase que AUD-023).

| AUD-043 | N3 | (este commit) | `test_aud043` | Kanban cross_project_count exacto cross-tenant → **decisión founder: señal anonimizada** (`cross_project_active` booleano, sin número) |
| AUD-045 | N3 | (este commit) | `test_aud045` | índice de demanda con datos de todos los tenants → **decisión founder: solo superadmin** (dev ya no ve el agregado de mercado) |
| AUD-046 | N3 | (este commit) | `test_aud046` | conteo público de leads por proyecto → **decisión founder: login + rango** (sells_complete exige sesión; conteo bucketizado) |
| AUD-047 | N2 | (este commit) | `test_aud047` | probe exponía timestamp de weekly_briefs ajeno → booleano `has_recent_brief` (higiene) |
| AUD-048 | N2 | (este commit) | `test_aud048` | _build_pdf con org='default' no filtraba → SIEMPRE filtra `dev_org_id` (template 'default' = solo datos de la casa) |

**Batch 6 · decisiones de producto (founder):** de los 6 diferidos, 5 resueltos aquí (AUD-043/045/046/047/048). Queda **AUD-044** (red comercial: mostrar volumen del socio) pendiente de aclaración → PENDIENTES. Test: `test_aud_batch6_tenant.py` (15 verdes).

| AUD-049 | N3 | (este commit) | `test_aud049` | casamentera cross-org APAGADA (410) — el founder canceló compartir compradores entre orgs |
| AUD-050 | N3 | (este commit) | `test_aud050` | red-comercial ya NO expone KPIs derivados de leads del socio (solo branding de la alianza) |
| AUD-051 | N3 | (este commit) | `test_aud051` (comportamiento) | **RAÍZ**: `assert_lead_owner` role-aware — asesor plano=solo SUS leads · inmobiliaria=su tenant · superadmin=todo |
| AUD-052 | N3 | (cascada 051) | `test_aud051` | `/api/asesor/leads/{id}` GET/PATCH/watchlist heredan el candado role-aware |
| AUD-053 | N3 | (este commit) | `test_aud053` | conversation get/list con scope per-asesor (asesor no lee el chat del lead de un compañero) |
| AUD-054 | N3 | (este commit) | `test_aud051` | lead_enrichment `_assert_lead_owner`: quita el bypass de tenant para asesor plano |
| AUD-055 | N3 | (este commit) | `test_aud055` | insights bloquea a los devs (expone conversación) + propiedad role-aware al resto |
| AUD-056 | N3 | (este commit) | `test_aud056` | resumen IA (v1+v2) SOLO de pipeline estructurado, nunca texto de notas → el dev conserva retro sin conversación |
| AUD-057 | N3 | (este commit) | `test_aud057` | `send_message` gatea mensajes de staff por dueño del hilo (no inyección cross-org/anon) |

| AUD-059 | N2 | (este commit) | `test_aud059` | create_hold apartaba unidad de otro dev → `_assert_unit_in_dev` (unidad debe ser del dev del caller) |
| AUD-060 | N2 | (este commit) | `test_aud060` | release_hold liberaba unidad de otro dev → `_assert_unit_in_dev` |
| AUD-061 | N2 | (este commit) | `test_aud061` | operación cerraba (cerrado_ganado) el lead de otro asesor → contacto owner-scoped + `assert_lead_owner` + validación en create_operacion |

**Batch 8 (escrituras cross-tenant · workflow 10 chunks + verif adversarial):** 100 escrituras sin-scope-aparente sobre colecciones sensibles → **3 confirmadas / 0 refutadas · 3 corregidas** (AUD-059/060/061). Las 97 restantes ya estaban protegidas (candado role-aware AUD-051, owner-fields en el filtro, o crons de sistema). Test `test_aud_batch8_writes.py` (3 verdes). Suite 1238 passed.

**Batch 7 (modelo de autorización · workflow 7 chunks + verif adversarial):** 12 violaciones confirmadas → **12 corregidas** (con OK del founder que fijó el modelo canónico en `AUTHZ_MODEL.md`). Patrón raíz = `assert_lead_owner` daba alcance por-tenant sin distinguir rol. Test `test_aud_batch7_authz.py` (9 tests, incl. comportamiento del candado + re-registro). El dev conserva su retro vía señales estructuradas (etapa/visit_outcome/lost_reason), sin conversación.

| AUD-058 | N2 | (este commit) | `test_aud058` | candado de re-registro de asesor: bloquea alta en otra inmobiliaria si sigue en un roster activo/suspendido hasta baja o 3 meses (`invite_internal_user`) |

**Feature · Señales de feedback estructuradas (Batch 7 · founder):** taxonomía cerrada de 7 ejes (desenlace/objeción/atractores/perfil/gap-producto/competencia/calidad) → `backend/feedback_signals.py` + `routes/feedback_signals.py` (POST captura owner-scoped/auto-tag IA · GET índice de mercado por dev con k-anonimato). La IA convierte la conversación en etiquetas; el dev/mercado ven solo etiquetas, nunca la conversación. Doc `FEEDBACK_SIGNALS_SPEC.md`. Test `test_feedback_signals.py` (4). AUD-044 resuelto vía AUD-050.

**Nota de deploy:** script único `backend/scripts/prod_db_hardening.py` (dry-run default · `--apply`) hace el paso de DB del checklist: aísla tenants (AUD-023b) + borra SOLO las 2 cuentas demo `@demo.com` (NUNCA el superadmin real `admin@desarrollosmx.io`). Ver `auditoria/DEPLOY_CHECKLIST.md`.

---

## Batch 9 · Frontend UX/UI (workflow 32 archivos · 46 confirmados)

**Tanda 1 · P0 + P1 (lo que rompe/confunde) — ✅ 9/9 corregidas:**
| # | Sev | Fix |
|---|-----|-----|
| FE-01 | P0 | `DevelopmentDetail.js` breadcrumb: `[dev.colonia, dev.alcaldia,'CDMX'].filter(Boolean).map(...toUpperCase).join(' · ')` — ya no crashea con colonia/alcaldía null |
| FE-02 | P1 | `DevelopmentDetail.js`: estado `loadErr` → branch de error con "Reintentar" antes del loading |
| FE-03 | P1 | `PropertyDetail.js`: estado `loadErr` + branch de error + cancelación (`alive`) en el useEffect (cubre también el P2:51 de cleanup) |
| FE-04 | P1 | `Inteligencia.js`: `<TopColoniasByScore/>` movido DENTRO de `<main>`, antes del footer |
| FE-05 | P1 | `AsesorContactos.js` (Legacy + V2): `catch` en `load` → `loadErr` → `<Empty>` con "Reintentar" en vez de enmascarar el fallo como bandeja vacía |
| FE-06 | P1 | `ConversationInbox.js`: `sendAsAsesor` devuelve boolean; el composer solo limpia la caja en éxito, muestra aviso + conserva el texto si falla (estados `sending`/`sendErr`) |
| FE-07 | P1 | `CompradorChat.js`: branch de `error` renderizado con "Reintentar" + `setError(null)` al reintentar |
| FE-08 | P1 | `CompradorChat.js` + `index.css`: clases `.comprador-chat-split`/`.comprador-chat-threadlist` + media query `max-width:640px` → apila en móvil (no desborda) |
| FE-09 | P1 | `CompradorFavoritos.js`: `handleDelete` con try/catch → `load()` siempre resincroniza |

Verificación: `NODE_ENV=development babel react-app` parsea los 7 archivos OK.

**Tanda 2 · P2 + P3 (accesibilidad + pulido) — ✅ 37/37 corregidas** (19 archivos):
- **Accesibilidad (18):** `aria-label`/`<label>` en inputs/selects sin etiqueta (`Inteligencia` colonia, `Mapa` búsqueda, `SuperadminMetricsCube`, `SalaDeControl` emoji/nombre, `Favoritos` nota/fecha/nombre/WhatsApp, `ConversationInbox` búsqueda) · `aria-label` en icon-buttons (`FichaCockpit` ✕, `SuperadminTenants` impersonar, `SalaDeControl` cerrar, `Mapa` limpiar) · `aria-label`+`aria-expanded`+`aria-controls` en menús (`ToolNav` dropdown+hamburguesa, `PortalLayout` `id="mobile-sidebar"` que faltaba) · `<Card>`/`<span>` clickeables → `role="button"`+`tabIndex`+`onKeyDown` (`FichaCockpit` ubicación) y `<button>` (`FichaCockpit` track record) · `role="status"`/`aria-live` en avisos (`SalaDeControl` trabajando/toast) · `SuperadminTenants` select de estado con label.
- **Estado (9):** error≠vacío en bandeja (`ConversationInbox` `listErr`+reintentar), tours 3D (`ProyectoDetail` `scanErr`), favoritos con filtro sin resultados (`Favoritos`) · loading con texto (`DevelopmentDetail`/`PropertyDetail` "Cargando…" en vez de "…").
- **bug_render (8):** guard `Piso ${unit.level}` → filter+join (`FichaDesarrollo`) · stale-closure en `loadThreads` → functional update (`CompradorChat`) · race del copiloto → `askLeadCopilot(overrideQ)` sin `setTimeout` (`ConversationInbox`) · borde alpha 0.97→0.28 (`SalaDeControl`).
- **feedback_alert (6):** `alert()` → aviso inline (`ProyectoDetail` borrar tour) · `e.message` crudo → mensaje amable + `console.error` (`SalaDeControl`, `DesarrolladorFeedback`) · `clipboard.writeText` con try/catch + feedback "✓ Copiado/No se pudo copiar" (`AsesorContactos`) · `attachProp` chequea `res.ok` (`ConversationInbox`).
- **responsive (1):** tabla de 11 columnas envuelta en `overflow-x:auto`+`min-width` (`AsesorContactos`).
- **ui_muerta (1):** click en desarrollo del mapa `window.location.href` → `navigate()` SPA (`Mapa`).
- **consistencia (2):** cursor nativo oculto SOLO con clase `custom-cursor-on` que pone `CustomCursor` al montar (respeta `prefers-reduced-motion`) → si el JS no corre, hay cursor · `color-scheme: light` scopeado a `.theme-light-scope`/`.tool-surface` (controles nativos claros en superficies claras).
- **P3 menores:** `TabBtn` inline → función `tabBtn` (no remonta, no pierde foco); WhatsApp `type="tel"`+`inputMode`; devs fetch Legacy con `.catch`; `CreateContactForm` botón dinámico "Crear lead/contacto".

Verificación: `NODE_ENV=development babel react-app` parsea los 18 `.js` OK · CSS con llaves balanceadas · sin refs colgantes a `TabBtn`.

---

## Batch 10 · Correctness de motores (9 bugs de cálculo) — ✅ 9/9
Ver tabla COR-01..09 en HALLAZGOS.md. Fixes en 7 motores (inversion_v4_tax/finance, composite_metrics, hedonic, absorcion, risk_score, health_score). Test `tests/test_audit_correctness.py` (9 verdes · impuestos por ejecución real). Suite 1248 passed.

## Batch 11 · Rendimiento — índices seguros aplicados (resto = backlog en MEJORAS.md)
Workflow 18 archivos → 43 anti-patrones (verificación adversarial CAÍDA por rate-limits → tratados como backlog, no confirmados). Sin tráfico en prod → no urge; NO se reescribieron N+1 (riesgo sin beneficio). **Aplicado:** 4 índices seguros en `dev_scale_indexes.py` (idempotentes, background): `colonias.id` (FALTANTE confirmado · 2,788 docs · hot), `buyer_signals (type, created_at_dt)`, `marketplace_searches (created_at_dt)`, `asistente_messages (role, created_at)`. Verificados creándose contra el Mongo vivo. Backlog completo (43, priorizado, con corrección por hallazgo) + resumen de dependencias en `auditoria/MEJORAS.md`.

## Batch 12 · Auditoría motores fiscales de la calculadora de inversión (ISR/ISAI/hipoteca) — ✅ (2026-07-03)
Workflow de auditoría (4 agentes + verificación adversarial, python real) sobre los motores de cálculo. Corregido:
- **ISR venta unificado a art.126 (single source of truth).** La calc de inversión usaba tarifa art.152 propia (~$97k) mientras el Proyector usa art.126 (~$170k) y la UI decía "el mismo motor". Se extrajo `tax_projector_engine._isr_art126_core`; `inversion_v4_tax.isr_venta` lo reusa con INPC **proxy** a futuro (la venta es a N años). Preserva exención casa-habitación + rama persona moral. La comisión de venta sale de la base del ISR (se resta en "neto al vender", sin doble conteo).
- **Bug art.126 (afectaba también al Proyector):** `int(días/365.25)` contaba 5 años de calendario exactos (1826 días con bisiesto) como 4 → ahora años de calendario completos (semántica SAT). Golden vs PDF SAT sigue verde.
- **ISAI/escrituración:** el desglose usaba 8% plano + reparto inventado (ISAI 5% plano vs 5.67% real, notario +50%, RPP +140% off) → ahora `calculate_closing_cost_total` (ISAI progresivo CDMX real). El ISAI de la calc **coincide al peso** con el del Proyector ($328,664 = $328,664).
- **Salvaguarda renta≤0** (evita el análisis basura "$6/mes", cap −0.52%) + **Airbnb sin tarifa** → estima por cap rate típico y marca `renta_estimada`.
- **CAT hipotecario** irreal (+0.55pp) → +1.5–3pp (seguro 0.5%→1%, comisión amortizada al plazo REAL, gastos); el pago expone `seguro_mensual`/`pago_total_mensual` y el DTI se evalúa CON seguro (antes podía marcar "viable" un crédito que no lo es).
- Correctos y sin cambios (verificados): PMT francés, split capital/interés, DSCR, debt yield, cobertura, TIR, MIRR, VPN, cap rate, equity multiple.

Verificación: `tests/test_audit_correctness.py` actualizado + suite backend **1258 passed, 0 failures** · verificado en vivo en la ficha (`?venta=1`) y `/simulador`. Doc de decisión: memoria `tax-engine-canonical`.

## Batch 13 · Captura hiper-segmentada del comprador (fugas de señal en la ficha DEFAULT) — ✅ (2026-07-03)
Auditoría de conectividad + captura de métricas del comprador (40 agentes, verificación adversarial). Veredicto: arquitectura sólida (espinazo señal→demand_intelligence→superadmin end-to-end, page-view central, Atlax/buscador-IA capturan bien); **el problema eran fugas de captura**, agravadas al volver FichaVenta la ficha default. Corregido:
- **Gate `VALID` (`buyer_signals.py`):** FichaVenta emitía 8 tipos que el backend RECHAZABA (apartar/crédito/cierre/plan/save/agendar/phone/favorito) → se perdían en silencio (fail-open). Se agregaron `credit_selected`/`cierre_computed`/`phone_click` y se renombraron los demás a los canónicos ya válidos en el front.
- **Meta = máxima granularidad:** antes la meta solo se persistía para un whitelist; ahora se guarda para CUALQUIER señal que la traiga (sanitizada, ≤24 claves) → se conservan banco/tasa/cat/enganche/plazo/precio/recámaras/feature/sección/intención, no solo colonia+unidad.
- **Bug de segmentación (front):** el wrapper `signal()` mandaba los datos financieros al top-level (que el backend ignora) en vez de a `meta` → se perdían aunque el tipo fuera válido. Helper central `fvSignal()` los rutea a `meta`.
- **Señales que no existían:** `section_view` (cada tab), `unit_view` (elegir unidad), `share`, `phone_click`, filtro de recámaras — cableadas.
- **Buscador estructurado (`public.py`):** los filtros de chips NO escribían `marketplace_searches` → quien filtra por chips era invisible a demanda. Ahora escribe `source=filtro_estructurado` fire-and-forget, deduplicado por visitante+criterios+día.
- **Consumo superadmin (`demand_intelligence.py`):** los 4 tipos calientes entran a `_ENGAGE` y la vista financiera reporta `eligieron_credito`/`calcularon_cierre`/`bancos_preferidos`.

Pendiente (backlog, no bloqueante): conectar avance-de-obra dev→ficha (el dev edita `project_construction_progress` pero el endpoint público lee el SEED), memoria de acabados/ficha técnica sin write-path del dev, y reemplazar placeholders (mapa Ubicación, StandbyPanels del ModeloModal, foto/URL search).

Verificación: suite backend **1258 passed** · señales antes rechazadas ahora `{ok:true}` y persisten con meta · front en vivo emitiendo con segmentación (section_view+colonia+lens, save, share).
