# Surgical Work Protocol · Asesor Redesign (2026-05-26)

**Regla canónica establecida tras founder ruling pre-F1:**

> "Necesito que este trabajo sea quirúrgico · doble revisión Sr Dev + Master Dev + PM · no podemos olvidar ni romper cosas ya construidas."

Aplica a TODO el rediseño asesor (6 fases · 16 terminales) y futuros redesigns críticos.

---

## 1 · Los 3 Roles · 3 Pases por Terminal CC

Cada terminal CC debe hacer 3 pases ANTES de `git push`:

### Pase 1 · Sr Dev (technical correctness)
- [ ] Código compila (`py_compile` backend · `yarn build` frontend)
- [ ] Tests existentes siguen PASS (pytest)
- [ ] Firma de funciones no cambia sin update callsites
- [ ] Imports correctos · types/schemas consistentes
- [ ] 0 React-hooks warnings en archivos del round
- [ ] Console.log no quedan en components nuevos

### Pase 2 · Master Dev (architectural integrity)
- [ ] Sigue patrones repo:
  - FAIL-OPEN per módulo
  - audit_immutable_engine.log per acción crítica
  - ai_budget.track_ai_call post-LLM
  - stub-aware sin secrets externos
- [ ] NO ORPHANS (regla `feedback_no_orphan_features.md`)
- [ ] Cierra ciclos prometidos en prompt (lista explícita)
- [ ] Multi-tenant isolation preservada
- [ ] Cron jobs NO chocan con los 11 registrados
- [ ] Race conditions cubiertas (atomic ops · idempotency keys)
- [ ] Diff=0 en archivos críticos NO requeridos por scope:
  - `backend/audit_immutable_engine.py`
  - `backend/feature_registry.py`
  - `backend/feature_gate.py`
  - `backend/routes/auth.py` (salvo si scope explícito)
  - `backend/conversation_engine.py` líneas que NO son del scope
- [ ] memory/* diff=0 (founder rule)

### Pase 3 · PM (product correctness)
- [ ] Scope 100% del prompt cubierto
- [ ] End-to-end smoke real (no solo unit tests)
- [ ] UX coherente con resto del producto
- [ ] es-MX correcto (no jerga tech expuesta a asesor)
- [ ] Aurora design:
  - var(--theme-*) tokens · NO hex hardcoded
  - rounded-full · sin emoji en JSX (excepto iconos lucide)
- [ ] Acceptance criteria 100% checked
- [ ] Commit message documenta TODO lo que cambió

---

## 2 · Pase 4 · Pre-Merge (Claude main session)

Antes de hacer merge custom + push a main, Claude main valida:

### Diff inspection 5 puntos
| Categoría | Esperado |
|---|---|
| memory/* | diff=0 (founder rule) |
| backend críticos | diff=0 salvo wires explícitos |
| superadmin | Edit puntual permitido · NO reescribir SuperadminLayout |
| frontend shared owner único | Solo 1 terminal owner shared per fase |
| Cron colisión horaria | Verificar 11+ crones no chocan |

### Tests integration
- pytest 38/38 PASS (todos los tests acumulados)
- yarn build limpio + 0 warnings archivos del round
- `python3 -c "import <todos los módulos modificados>"` OK
- `python3 -c "import ast; ast.parse(open('backend/server.py').read())"` OK

### Regression sweep
- Login post-CORS fix funciona
- W7.AS.3 endpoints respond 200/4xx coherente
- Workflow tick 60s sigue corriendo
- Drift compute retorna shape correcto
- ai_budget tracking activo
- Cookies con DMX_DEV_MODE=true funcionan en localhost

---

## 3 · Post-Merge · Audit forense doble-pase

Mismo standard que W7.AS.3 R2/R3:

### Audit 1
- 60-80 checks por fase
- Categoría: 🔴 ALTO · 🟡 MEDIO · 🟢 BAJO
- Aplica fixes inmediato (founder ruling 0 backlog)
- Verifica: pytest + build + imports

### Audit 2 (recheck)
- Valida fixes del audit 1
- Busca regresiones POR los fixes
- Edge cases missed
- Cross-module side effects
- Aplica fixes finales

### Commit final post-audit + push main

---

## 4 · Estrategia de aislamiento · rollback trivial

| Mecanismo | Cómo · cuándo |
|---|---|
| **Aditivo NO reemplaza** | F1 crea `navByRoleV2.js` y `AsesorSidebarV2.js` (V1 intacto) |
| **Feature flag** | `REACT_APP_SIDEBAR_V2='true'` activa V2 · 'false' restaura V1 instant |
| **Tag pre-fase** | `git tag pre-asesor-f1` antes de cada fase · `git tag pre-asesor-f2` etc |
| **Worktree aislado** | Cada terminal en `/tmp/<fase>-worktree` cero contaminación cruzada |
| **NO borrar código viejo** | Hasta que TODO el redesign valide 5 días + piloto OK |
| **Checkpoint commit** | Antes de arrancar fase nueva si hay cambios uncommitted |

---

## 5 · 10 Invariantes Críticas (NO romper)

| # | Invariante | Por qué crítico |
|---|---|---|
| 1 | Login/auth flow | Acabamos de fixear CORS + cookies dev · regresión rompe TODO |
| 2 | URLs existentes (34 asesor + N superadmin) | Usuarios tienen bookmarks · marketing links · etc |
| 3 | Tenant isolation cross-tenant | F1 R1 lección · leak = 🔴 ALTO inmediato |
| 4 | Conversation Agent W7.AS.3 (19 features) | Última pieza compleja shipped · 5 audits clean |
| 5 | Workflow Builder W6.AS.1 (cron 60s) | Automation core · DAG executor |
| 6 | Studio bundle (8 features Z.1-Z.8) | Z.2 Z.4 Z.8 carrusel/video/landings integradas |
| 7 | 11 crones registrados (sin choque) | lun02 · lun03 · dom04 · dom04:30 · dia1-05 · diario04:45 · diario05 · diario06 · diario08mx · tick60s · dom04:30 (self-tuning) |
| 8 | audit_immutable_engine append-only | Invariante chain auditoría legal |
| 9 | i18n keys previos (8 namespaces) | common + conversation_round1 + round2_ui + cost + ab_testing + confidence + drift |
| 10 | ai_budget.track_ai_call | Cost monitoring per LLM call · todas las features ML |

---

## 6 · Aplicación en prompts CC

Cada prompt F1-F6 (y futuros) DEBE incluir al final:

```
## Protocolo Quirúrgico (memory/SURGICAL_WORK_PROTOCOL.md)
Antes de push, valida los 3 pases:

[Pase 1 Sr Dev]
- [ ] Compila · tests · firma callsites · imports · 0 warnings · sin console.log

[Pase 2 Master Dev]
- [ ] FAIL-OPEN · audit · ai_budget · NO ORPHANS · tenant isolation · cron · diff=0 críticos

[Pase 3 PM]
- [ ] Scope 100% · smoke real · UX coherente · es-MX · aurora · acceptance criteria

[10 invariantes NO romper] (lista acortada en prompt)

Si falla cualquier check → arregla antes de push. NO push con checklist roto.
```

---

## 7 · Roles en cada momento del workflow

| Momento | Quién hace qué |
|---|---|
| Plan diseño | Claude (Master Dev + PM) propone · founder approves |
| Build cada terminal CC | CC ejecutor + auto-valida 3 pases |
| Pre-merge | Claude main (Sr Dev + Master Dev pre-flight) |
| Merge custom | Claude main ejecuta + valida diff 5 puntos |
| Post-merge audit | CC separada (audit forense doble-pase) |
| Fix findings | Claude main (founder ruling 0 backlog) |
| Docs update | Claude main (WAVE_PROGRESS + CHANGELOG) |
| Decisión rollback | Founder · trigger feature flag o git revert tag |

---

## 8 · Reglas operativas

- **NUNCA** push sin los 3 pases completados
- **NUNCA** merge sin pre-flight 5 puntos limpio
- **NUNCA** cierra fase sin audit forense doble-pase
- **SIEMPRE** tag `pre-asesor-fX` antes de arrancar fase
- **SIEMPRE** checkpoint commit si hay uncommitted antes de fase nueva
- **SIEMPRE** feature flag para features con riesgo medio+ (default ON para validar, OFF disponible para rollback)
