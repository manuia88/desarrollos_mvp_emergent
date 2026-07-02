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
