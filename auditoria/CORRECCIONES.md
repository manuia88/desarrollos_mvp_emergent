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

**Nota de deploy:** script único `backend/scripts/prod_db_hardening.py` (dry-run default · `--apply`) hace el paso de DB del checklist: aísla tenants (AUD-023b) + borra SOLO las 2 cuentas demo `@demo.com` (NUNCA el superadmin real `admin@desarrollosmx.io`). Ver `auditoria/DEPLOY_CHECKLIST.md`.
