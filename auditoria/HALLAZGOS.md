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
