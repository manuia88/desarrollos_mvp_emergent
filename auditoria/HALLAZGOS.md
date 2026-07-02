# HALLAZGOS — Auditoría Forense DMX

> ID único AUD-###. Severidad: BLOCKER / HIGH / MEDIUM / LOW. Estado: abierto / corregido / propuesto (N3).
> Toda afirmación con evidencia archivo:línea. Los fixes viven en la rama `auditoria/fixes-y-upgrades`.

| ID | Sev | Área | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|---|
| AUD-001 | MEDIUM | Config | 185 de 227 env vars usadas NO documentadas en ningún .env.example → deploy a ciegas | `auditoria/ENV_VARS.csv` | **corregido** (0 sin doc) |
| AUD-002 | LOW | Docs↔código | 02_FEATURES.md dice 762 features; el parseo de sus tablas da 812 → índice del doc desactualizado | `auditoria/TRAZABILIDAD_FEATURES.csv` (812 filas) | **corregido** (doc→812) |
| AUD-003 | INFO | Inventario | 15 motores con 0 importadores (huérfanos preliminares) — confirmar 1×1 en Fase 1 | `auditoria/MOTORES.csv` | **corregido** (0 huérfanos reales) |
| AUD-004 | LOW | Backend | `Optional` usado sin importar (F821, latente bajo `__future__ annotations`) | `backend/routes/comparable_alerts.py:22` | **corregido** `3f12866c` |
| AUD-005 | HIGH | Backend | Feature B19.5 MUERTA en silencio: `_build_pdf` referenciaba `org_id` inexistente → NameError tragado por `except` → el branding del org (logo/colores/tagline) jamás se aplicó a NINGÚN PDF de reportes | `backend/routes/dev_batch5.py:497` (fn en :481, except en :506) | **corregido** `114231ce` |
| AUD-006 | HIGH | Backend | Handler "fail-open" que CRASHEA: `import logging` local (línea ~1036) hacía a `logging` local en toda `patch_unit_status` → el `logging.getLogger` del except (línea 1024) = UnboundLocalError → si el audit-log fallaba, el cambio de estado de unidad devolvía 500 en vez de continuar | `backend/routes/developer.py:1024` (F823) | **corregido** `14b12cb4` |
| AUD-007 | MEDIUM | Backend | `timedelta` sin importar → NameError en runtime en la ventana de rate-limit del listing importer | `backend/studio_listing_importer.py:396` | **corregido** `d0d08e14` |
| AUD-008 | HIGH | Tests/portabilidad | 6 módulos hacían `mkdir('/app/...')` EN IMPORT → OSError fuera del contenedor Emergent → pytest interrumpido en colección: **0 tests corrían** (sin red de seguridad local/CI) | `backend/free_audit_engine.py:26`, `brochure_renderer.py:30`, `dev_assets.py:25`, `document_intelligence.py:56`, `state_of_cdmx_engine.py:16`, `tour_3dgs_engine.py:23` | **corregido** `f434050e` |
| AUD-009 | HIGH | Tests | 3 archivos ejecutaban I/O de red/DB A NIVEL MÓDULO (urlopen, asyncio.run(main) del redteam, assert de env) → cualquier colección de pytest moría | `backend/tests/test_api.py:10`, `tests/test_search_parser.py:55-65`, `backend/cerebro_redteam_test.py` (última línea) | **corregido** `7310c65e` |
| AUD-010 | MEDIUM | Tests | Test del simulador importaba símbolos eliminados (`MORTGAGE_RATE_ANNUAL`/`TIIE_RATE`/`SPREAD`, engine migró a banxico_rates) → ImportError → los tests del motor de inversión NUNCA corrían | `backend/tests/wave4/test_investment_simulator_engine_unit.py:19-22` | **corregido** `edcedf0d` |
| AUD-011 | HIGH | Tests | Línea base REAL post-desbloqueo: 1,663 tests · **1,189 pasan · 184 fallan · 288 errores** (mayoría httpx.ConnectError de e2e que exigen backend/DB vivos — mismo anti-patrón que AUD-009, a triagear en Fase 1) | `auditoria/baseline/pytest-postfix.txt` | **corregido** (suite 0 fail/0 err) |
| AUD-012 | MEDIUM | Calidad | ruff: 1,590 errores en backend (514 auto-fixables); bandit: 4,611 issues high-confidence (triagear severidad real); ver baseline | `auditoria/baseline/ruff.txt`, `bandit.txt` | **corregido** (ruff 512 + bandit 0 vulns reales) |

## Batch 2 — hallazgos nuevos (2026-07-01)

| ID | Sev | Área | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|---|
| AUD-013 | MEDIUM | Tests/portab. | `sys.path.insert("/app/backend/...")` hardcodeado → tests no importaban fuera del contenedor | `test_batch25/20/15.py` | **corregido** `c94a9d17` |
| AUD-014 | LOW | Tests | Tests stale vs contrato actual (cube KPIs rentabilidad + fallback storage AUD-008) | `test_metrics_cube/brochure_renderer` | **corregido** `79af1dda` |
| AUD-015 | MEDIUM | Notif | `demand_build_alert` (tipo vivo "push real") faltaba en DEFAULT_CATEGORIES → caía a in-app sin email | `notifications_engine.py:79` | **corregido** `d8681e07` |
| AUD-016 | MEDIUM | Honestidad | state_of_cdmx `_predictions` marcaba `es_estimado=False` con dato real pese a "no es pronóstico medido" | `state_of_cdmx_engine.py:130` | **corregido** `33e987b0` |
| AUD-017 | LOW | Tests | SSRF test usaba hosts placeholder que no resuelven → el guard endurecido (DNS fail-closed) los bloqueaba con razón | `test_dev_hardening_c1_c3_c4.py:63` | **corregido** `729e713c` |
| AUD-018 | HIGH | Storage | `makedirs/mkdir` import-time con `/app` en bulletins_engine + wizard → crasheaban el import de server.py fuera del contenedor (familia AUD-008 con os.makedirs) | `bulletins_engine.py:28`, `routes/wizard.py:33` | **corregido** `05df4737` |
| AUD-019 | LOW | Backend | `os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")` — `or` con operandos idénticos (dead) | `bulletins_engine.py:79` | abierto (N1 trivial, prox. batch) |

### Triage bandit (AUD-012) — 4,611 high-CONFIDENCE = 0 vulnerabilidades reales (high-SEVERITY)
- **B101 (3,575):** `assert` en archivos de test → no es issue.
- **B110 (928):** `try/except/pass` fail-open → mayoría intencional documentado (LOW).
- **B324 (27):** `sha1`/`md5` para **dedup/IDs** (workflow_audit id, stub account_id, seed) → NO seguridad, no es vuln.
- **B608 (4):** SQL al **API CKAN open-data externa** (datos.cdmx, read-only) con `rid` de ENV + numéricos → BAJO; reforzado con coerción `int()` (AUD-012, colonias_catalog.py).
- **B603 (2):** `subprocess.run` en forma-lista (sin shell) con args controlados (ffmpeg / ruff en test) → seguro.
- **B105/B106 (~97):** 100% falsos positivos — nombres de campo (`password_hash`, `asistente_token`) y nombres de ENV var (`IE_INEGI_TOKEN`), cero secretos hardcoded.

## Batch 3 — inventario de auth (AUD-020) + auditoría del núcleo (workflow en curso)

| ID | Sev | Área | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|---|
| AUD-020 | INFO→POSITIVO | Auth inventory | La columna `depends` de ENDPOINTS.csv marcaba 1,498/1,539 "sin auth" = FALSO (este backend enforza auth in-body). Detector mejorado (`enrich_endpoints_auth.py`): **1,020 in-body + 95 deleg + 41 Depends + 3 cron = 1,159 autenticados**; 380 residual "PÚBLICO?" (cota superior, incluye legítimamente-públicos: marketplace/widgets/simulador/invitación-por-token/visitor-tracking/webhooks). De 25 candidatos sensibles, spot-checks (advisor_whitelist, documents, agentic_crm) = **100% autenticados** con rol+ownership (`_require_dev_or_superadmin`+`_assert_dev_access`, `require_superadmin`, `_auth_dev`+dev_org scope). **Veredicto: auth ampliamente enforzada vía helpers; público-sensible-sin-auth ≈ 0 en la muestra.** Worklist para barrido IDOR: `auditoria/ENDPOINTS_PUBLICOS.csv`. | `auditoria/ENDPOINTS_PUBLICOS.csv`, `enrich_endpoints_auth.py` | **auditado** (positivo) |

## Batch 3 — núcleo auth/permisos/tenant/OAuth (workflow 20 agentes · verificación adversarial)

| ID | Sev | Área | Hallazgo (CONFIRMADO adversarialmente salvo nota) | Evidencia | Estado |
|---|---|---|---|---|---|
| AUD-021 | HIGH | auth | `account_blocked` solo se checaba en login-password; `get_current_user` (gate por-request) lo ignoraba → suspender NO cortaba sesiones vivas (JWT 8h/cookie 7d) + re-login por OAuth/magic-link | `server.py:1598-1646` | **corregido** `c5a37e74` |
| AUD-022 | HIGH | auth | rate-limit magic-link usaba `X-Forwarded-For[0]` (spoofeable) → rotar header evade 5/min (spam correo/enum) | `routes/auth.py:309` | **corregido** `b31c635c` |
| AUD-023 | BLOCKER | idor/tenant | register `developer_admin` con `tenant_id=None` → `tenant_of()` cae a sentinel COMPARTIDO `'default'` → todos los devs auto-registrados en el MISMO tenant = IDOR cross-tenant. Explotable HOY | `tenant_scope.py:42` + `routes/auth.py:141` | **corregido** `b31c635c` (tenant propio `org_{user_id}`) |
| AUD-024 | HIGH | auth/gate | escalación cross-feature: feature catalogada-inactiva se otorgaba por el tier global-max de otro flag | `feature_gate_engine.py:242` | **corregido** `b07a97bb` (deniega; enforcement off → 0 cambio hoy) |
| AUD-021b | HIGH | jwt | DMX_ENV typo ('prodd') arrancaba con JWT_SECRET efímero (guard usaba _is_explicit_prod) | `server.py:74` | **corregido** `33df0b93` (typo→prod fail-closed; unset=dev intacto) |
| AUD-023b | BLOCKER-residual | idor | devs pre-fix con tenant None/'default' seguían co-mezclados | `scripts/migrate_aud023_dev_tenants.py` | **migración lista** (correr en prod: founder) |
| AUD-025 | MEDIUM | tests | Fragilidad de aislamiento: `test_conversation_ml`/`feature_flags`/`pipeline_v2` asumen entorno sin LLM y fallan si un test previo importa `server` (init de cliente LLM). Pasan aislados. Pre-existente (mis fixes de auth NO lo causan) | `test_conversation_ml.py:216` | abierto (batch test-hardening) |
| AUD-026 | BLOCKER-costo | costo/billing | **CONFIRMADO en prod (founder reportó cargos ~$25 no autorizados).** AirROI (API de PAGO, `access_mode='api_key'`) caía dentro de `CRON_AUTO_INGEST_MODES` → los DOS crons lo llamaban en automático: `run_hourly_status_check` **cada hora** vía `test_connection()` (GET /markets/search, PAGA) + `run_daily_ingestion` diario vía `fetch()` = **~25 llamadas pagadas/día** sin autorizar. Contradecía el propio contrato del conector ("Cron never touches this"). | `scheduler_ie.py:67,125` + `connectors_ie.py:333` + `data_ie_sources.py:52` | **corregido** (3 capas · este commit) |

### BATCH 4 · barrido IDOR de 380 endpoints públicos (workflow 26 finders + verificación adversarial 3-lentes · 7 confirmados / 4 refutados)
| AUD-027 | **CRITICAL** | idor/PII | `GET /api/studio/property-intake/public/{slug}` (SIN auth) devolvía `intake: doc` con proyección **blacklist** que olvidó `leads[]` → cualquier anónimo con el slug público exfiltraba TODA la PII de prospectos (nombre/email/teléfono del formulario) de esa landing. 3/3 lentes confirmaron. | `routes/studio_property_intake.py:170` | **corregido** (excluye leads/leads_count/last_lead_at) |
| AUD-028 | MEDIUM | superadmin_open | `POST /api/superadmin/gentrificacion/{colonia_id}/persist` y `/backfill` NO llamaban `require_superadmin` → anónimo escribía `colonia_valoracion` (envenenar índice) + backfill masivo O(1811) = DoS. | `routes/gentrificacion.py:38,48` | **corregido** (`await require_superadmin`) |
| AUD-029 | MEDIUM | idor/cross-tenant | `GET /api/studio/admin/budgets` (+`PATCH /{user_id}`) permitían a `asesor_admin` (rol TENANT-SCOPED) leer/mutar el cap de gasto IA de user_ids de OTROS tenants (query sin filtro de org). | `routes/studio.py:689,700` | **corregido** (superadmin-only) |
| AUD-030 | LOW | weak_token | `GET /api/auth/validate-code/{code}` = oráculo de invite-codes sin rate-limit + generación con `random.choices` (no CSPRNG) → enumeración por fuerza bruta. | `routes/private_beta.py:119` + `private_beta_engine.py:48` | **corregido** (rate-limit + `secrets`) |
| AUD-031 | LOW | csrf/idor | `GET /api/users/{user_id}/newsletter-opt-out/{segment}` desuscribe sin auth con `user_id` enumerable (CSRF/prefetch vía `<img>`). Fix correcto = token HMAC firmado embebido en el email → **toca la generación de correos**, se difiere para no romper el unsubscribe (compliance). | `routes/newsletter.py:176` | **propuesto (N3)** → PENDIENTES |

### BATCH 4 · REFUTADOS por verificación adversarial (2/3 lentes refutaron · NO se tocan)
- **`/api/agentic-crm/casamentera/{lead_id}`** (finder: MEDIUM idor_read → REFUTADO): falta `assert_lead_owner` pero el handler NUNCA devuelve dato derivado del lead (`compute_match` no expone claves `matches/ranked/score` top-level → siempre `[]`); `partners/pool` son del tenant PROPIO. Solo queda un gap defensivo LOW (lectura ciega + cache-pollution), ya rate-limited. Se recomienda añadir el guard por consistencia, no es IDOR.
- **`/api/plusvalia/_admin/estado`** (LOW superadmin_open → REFUTADO): data de MERCADO pública por diseño (misma grid que sirven los hermanos sin auth); read-only; `_admin` es smell de naming, no vuln.
- **`/api/landing/{slug}`** (LOW missing_auth → REFUTADO): render de landing público; `preview=1` solo adelanta contenido de marketing (whitelist curado), sin PII/dinero; slug no enumerable.
- **`/api/voice/{audio_id}/download`** (LOW missing_auth → REFUTADO): sirve el MP3 de salida TTS de Atlax (sesión anónima), no PII; `audio_id` = token aleatorio 48-bit no enumerable. Nota defensa-en-profundidad: bindear a sesión.

### REFUTADOS / no-explotables-hoy (verificación adversarial · documentados, no se tocan)
- **JWT_SECRET efímero** (HIGH→REFUTADO): requiere mala-config del operador (DMX_ENV vacío/typo); atacante sin influencia. Guard fail-closed cubre cookies/HSTS. Mitigación defensiva → N3.
- **prefijo heurístico user_dev_ids** (HIGH→REFUTADO): precondición inalcanzable (atacante no controla developer_id ajeno).
- **inm_of() namespace** (HIGH→PARCIAL): bug real de data-flow pero UserOut (pydantic extra=ignore) descarta el campo → exploit no alcanzable hoy.
- **refresh_token sin endpoint de rotación** (HIGH→PARCIAL): deuda arquitectónica/UX, no vuln.
- **redirect_uri desde base_url** (HIGH→PARCIAL): requiere Host spoof + env sin setear + sin TrustedHostMiddleware.
- **_csrf_states en memoria** (HIGH→PARCIAL): solo rompe con >1 worker; deploy actual single-worker. Mitigación (Redis/HMAC state) → N4.
- **require_role dead code** (MEDIUM): 0 callsites; no es vuln, invita a mal uso futuro → N4 (remover o documentar).
