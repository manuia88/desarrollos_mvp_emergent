# HALLAZGOS — Auditoría Forense DMX

> ID único AUD-###. Severidad: BLOCKER / HIGH / MEDIUM / LOW. Estado: abierto / corregido / propuesto (N3).
> Toda afirmación con evidencia archivo:línea. Los fixes viven en la rama `auditoria/fixes-y-upgrades`.

| ID | Sev | Área | Hallazgo | Evidencia | Estado |
|---|---|---|---|---|---|
| AUD-001 | MEDIUM | Config | 185 de 227 env vars usadas NO documentadas en ningún .env.example → deploy a ciegas | `auditoria/ENV_VARS.csv` | abierto |
| AUD-002 | LOW | Docs↔código | 02_FEATURES.md dice 762 features; el parseo de sus tablas da 812 → índice del doc desactualizado | `auditoria/TRAZABILIDAD_FEATURES.csv` (812 filas) | abierto |
| AUD-003 | INFO | Inventario | 15 motores con 0 importadores (huérfanos preliminares) — confirmar 1×1 en Fase 1 | `auditoria/MOTORES.csv` | abierto |
| AUD-004 | LOW | Backend | `Optional` usado sin importar (F821, latente bajo `__future__ annotations`) | `backend/routes/comparable_alerts.py:22` | **corregido** `3f12866c` |
| AUD-005 | HIGH | Backend | Feature B19.5 MUERTA en silencio: `_build_pdf` referenciaba `org_id` inexistente → NameError tragado por `except` → el branding del org (logo/colores/tagline) jamás se aplicó a NINGÚN PDF de reportes | `backend/routes/dev_batch5.py:497` (fn en :481, except en :506) | **corregido** `114231ce` |
| AUD-006 | HIGH | Backend | Handler "fail-open" que CRASHEA: `import logging` local (línea ~1036) hacía a `logging` local en toda `patch_unit_status` → el `logging.getLogger` del except (línea 1024) = UnboundLocalError → si el audit-log fallaba, el cambio de estado de unidad devolvía 500 en vez de continuar | `backend/routes/developer.py:1024` (F823) | **corregido** `14b12cb4` |
| AUD-007 | MEDIUM | Backend | `timedelta` sin importar → NameError en runtime en la ventana de rate-limit del listing importer | `backend/studio_listing_importer.py:396` | **corregido** `d0d08e14` |
| AUD-008 | HIGH | Tests/portabilidad | 6 módulos hacían `mkdir('/app/...')` EN IMPORT → OSError fuera del contenedor Emergent → pytest interrumpido en colección: **0 tests corrían** (sin red de seguridad local/CI) | `backend/free_audit_engine.py:26`, `brochure_renderer.py:30`, `dev_assets.py:25`, `document_intelligence.py:56`, `state_of_cdmx_engine.py:16`, `tour_3dgs_engine.py:23` | **corregido** `f434050e` |
| AUD-009 | HIGH | Tests | 3 archivos ejecutaban I/O de red/DB A NIVEL MÓDULO (urlopen, asyncio.run(main) del redteam, assert de env) → cualquier colección de pytest moría | `backend/tests/test_api.py:10`, `tests/test_search_parser.py:55-65`, `backend/cerebro_redteam_test.py` (última línea) | **corregido** `7310c65e` |
| AUD-010 | MEDIUM | Tests | Test del simulador importaba símbolos eliminados (`MORTGAGE_RATE_ANNUAL`/`TIIE_RATE`/`SPREAD`, engine migró a banxico_rates) → ImportError → los tests del motor de inversión NUNCA corrían | `backend/tests/wave4/test_investment_simulator_engine_unit.py:19-22` | **corregido** `edcedf0d` |
| AUD-011 | HIGH | Tests | Línea base REAL post-desbloqueo: 1,663 tests · **1,189 pasan · 184 fallan · 288 errores** (mayoría httpx.ConnectError de e2e que exigen backend/DB vivos — mismo anti-patrón que AUD-009, a triagear en Fase 1) | `auditoria/baseline/pytest-postfix.txt` | abierto |
| AUD-012 | MEDIUM | Calidad | ruff: 1,590 errores en backend (514 auto-fixables); bandit: 4,611 issues high-confidence (triagear severidad real); ver baseline | `auditoria/baseline/ruff.txt`, `bandit.txt` | abierto |
