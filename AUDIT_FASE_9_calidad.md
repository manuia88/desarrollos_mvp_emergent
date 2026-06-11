# AUDIT FASE 9 — Calidad de código y tests
Fecha: 2026-06-10 · READ-ONLY

## RESUMEN EJECUTIVO
**Ausencia de tipado estático** (Python sin type-checking forzado; frontend en JS, no TS) es la causa estructural de por qué los bugs de "campo mal leído" y "firma rota" (Fases 5/6) **no se atrapan en build** y solo aparecen en runtime — exactamente el patrón vibecoding. El build compila, pero la **cobertura de tests es baja en lo crítico** (motores de dinero y rutas superadmin sin test) y hay **duplicación de lógica crítica** (auth/tenant/validación reimplementada inconsistente), que es donde se cuelan los bugs de seguridad.

**Conteo:** P1: 2 · P2: 4 · P3: 1

### [P1] Sin red de tipos → mismatches solo en runtime
- Frontend en JavaScript (no TypeScript) → el front puede leer `data.score_total` que el back nunca manda y nadie lo atrapa hasta producción (Fase 5/6). Backend Python sin mypy en CI.
- **Impacto:** las 12+ lecturas de campo equivocado, 19 firmas rotas y el cable FE→`/api/asesor/leads` habrían sido errores de compilación con tipado. Hoy son bombas de runtime.
- **Fix:** mínimo, type hints + mypy en los engines de dinero; idealmente migrar el front crítico a TS o añadir validación de respuesta (Zod en el cliente).

### [P1] Cobertura de tests baja en lo crítico
- 47 archivos de test, pero SIN test: `bancabilidad_engine`, `terminal_mercado_engine`, `grafo_comprador_engine`, `payment_schemes`, `transaction_network`, `reverse_search`. **Las 12 rutas superadmin: 0 tests.** Test roto: `tests/wave3/test_denue_engine_unit.py` (importa módulo borrado → falla la colección).
- **Impacto:** lo que mueve dinero/decisiones no tiene red de seguridad; un refactor del fix de score_numeric podría romper sin aviso.
- **Fix:** tests de los engines de dinero + smoke de rutas superadmin (ningún 500); borrar el test muerto.

### [P2] Duplicación de lógica crítica (donde se cuelan los bugs)
- 7 implementaciones de `slugify`, ~8 `col_by_name` inline, ≥4 merges de unidad (override>overlay>seed), ≥5 fórmulas de absorción/velocidad, 3 extractores de precio, `is_sold` recopiado inline en 3 sitios, k-anon `K_MIN` 3 vs 5 en dominios distintos.
- **Impacto:** un fix en un lugar no se propaga a los gemelos → divergencia (el bug histórico de "vendido").
- **Fix:** centralizar en helpers públicos únicos (data_developments, colonias_catalog, anonymization_engine).

### [P2] Build / lint
- Frontend: compila (CRA) con **1 warning** (pre-existente, hook dep). Backend: 593 módulos importan sin error (QA4). No se corrió `eslint`/`mypy` completo en esta auditoría → recomendado.

### [P2] `getattr(user, "id")` repetido ×33 (anti-patrón propagado)
- El mismo error copiado en 33 sitios (atribución/ownership) — síntoma de copy-paste entre sesiones sin un helper de "actor actual".
- **Fix:** un helper `actor_id(user) -> user.user_id` y reemplazar.

### [P2] Marcadores de deuda
- No se inventarió exhaustivamente TODO/FIXME/HACK en esta ronda; QA4 detectó comentarios "stub/TODO/pending" en fuentes externas (Atlas "cache manual", GTFS "placeholder afluencia", CONAGUA "pivot pendiente"). Recomendado: `grep -rn "TODO\|FIXME\|HACK\|XXX"` para el inventario formal.

### [P3] Comentario stale
- `golden_calibration_engine.py:183` comentario `# 0.035` sobre `comision_pct=0.02` (el valor 2% es correcto por ruling founder; el comentario miente).

## LIMPIO
- El código nuevo F2–F5 es FAIL-OPEN consistente (16/16 engines degradan sin romper el request — QA1). Imports limpios. Crons resuelven. Patrón de auth como dependency central (no copiado) en la mayoría.
