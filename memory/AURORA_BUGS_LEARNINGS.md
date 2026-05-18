# Aurora Bugs · Learnings + Regla anti-recurrencia

**Última actualización**: 2026-05-18 (post W5.FF3 emergent rollback · 5to bug consecutivo)

**Doc canónico** que documenta los 5 bugs aurora recurrentes de emergent en archivos críticos superadmin · y la regla preventiva para evitar bug #6.

---

## 0 · Por qué este doc existe

Emergent ha generado **5 bugs aurora consecutivos** en 5 batches que tocan UI superadmin (W5.11 P2 · W5.12 P2 · W5.5 P2 · W5.15 P2 · W5.FF3 INTENTO 1). Cada bug requirió fix Claude Code · costó ~30-60 min cada vez. **Patrón claro**: emergent NO respeta archivos críticos aurora.

Este doc establece la regla preventiva para que el bug #6 NO ocurra.

---

## 1 · Track record · 5 bugs documentados

| # | Batch | Fecha | Qué pasó | SHA fix |
|---|---|---|---|---|
| 1 | W5.11 P2 | 2026-05-17 | 32 hex hardcoded en 3 pages · falta `sectionFromPath` para duplicates/fraud-patterns/audit-chain | `0d92469` |
| 2 | W5.12 P2 | 2026-05-17 | 10 hex hardcoded en 4 archivos · falta `sectionFromPath` knowledge-graph | `babacae` |
| 3 | W5.5 P2 | 2026-05-17 | 68 hex hardcoded en 7 archivos · emergent reportó "var(--theme) NO existe" (afirmación FALSA · existe en main) | `d9d538e` |
| 4 | W5.15 P2 | 2026-05-18 | 16 rgba(124,47,255) hardcoded en FsdDistributionTab + SuperadminAvmAccuracy tab nav | `0ae93dc` |
| 5 | **W5.FF3 INTENTO 1** | 2026-05-18 | **SuperadminLayout.js REESCRITO COMPLETO** · destruyó 7 secciones aurora · inventó paleta · syntax error variable `section` duplicada · build FAIL · **ROLLBACK NUNCA mergeado a main** | rollback a `59a5f4ea` |

**Costo total cumulativo**: ~3-4 horas de fix Claude Code · tokens emergent gastados en bugs · founder pierde confianza en sistema.

---

## 2 · Patrones recurrentes detectados

### Patrón A · Hex hardcoded en lugar de var(--theme*)
Emergent persiste en usar #6366F1 · #a5b4fc · #7c3aed · #EC4899 · rgba(124,47,255) literal · ignorando que `var(--theme)` existe.

**Verificación post-merge obligatoria** (Master Dev):
```bash
grep -cE "#6366F1|#a5b4fc|#A5B4FC|#7c3aed|#EC4899|rgba\(124, ?47, ?255|rgba\(99, ?102, ?241" frontend/src/pages/superadmin/*.js frontend/src/components/superadmin/*.js | grep -v ":0$"
```
Si >0 · fix obligatorio antes de mergear.

### Patrón B · sectionFromPath() NO extendido
Cada batch añade rutas nuevas `/superadmin/*` pero emergent olvida actualizar el regex.

**Verificación obligatoria**:
```bash
grep -n "sectionFromPath\|inteligencia\|operacion" frontend/src/components/superadmin/SuperadminLayout.js | head -10
```
Confirmar que todos los paths nuevos están en el regex correcto (color sección).

### Patrón C · Reescritura completa archivos críticos
**Bug #5 (W5.FF3 INTENTO 1) ejemplo extremo**: emergent reescribió `SuperadminLayout.js` completo · eliminó las 7 secciones aurora · inventó su propia paleta de 4 secciones.

**Verificación obligatoria**:
```bash
# Antes/después comparar líneas archivo crítico
git diff origin/conflict_branch frontend/src/components/superadmin/SuperadminLayout.js | wc -l
```
Si >20 líneas modificadas en SuperadminLayout.js · ALERTA · revisar manualmente · probablemente reescritura no autorizada.

### Patrón D · navByRole tier renumeración
Emergent reorganiza tiers (mueve tier 1 a tier 3 · cambia labels) cuando solo debería añadir 1 item.

**Verificación obligatoria**:
```bash
git diff origin/conflict_branch frontend/src/config/navByRole.js
```
Confirmar que cambio es solo `+1 item` · no `tier renumbered` · no `section_key cambiado`.

### Patrón E · Reportes incorrectos
Emergent dice "var(--theme*) no existe" cuando SÍ existe (Bug #3 W5.5 P2). O reporta "11 archivos editados" cuando son 14. Sus self-reports no son confiables.

**Verificación obligatoria**: Master Dev hace **audit independiente** vs claim emergent · NUNCA confiar solo en su summary.

---

## 3 · Regla preventiva · futuro

### Para batches superadmin (cualquier W5.x P2 que toca UI superadmin):

**REGLA #1 · Decisión arquitectónica**: emergent NO toca superadmin a menos que founder lo apruebe explícitamente. Reservado para Claude Code terminal con prompt ULTRA-defensivo.

**REGLA #2 · Prompt emergent (si excepcionalmente se usa)** debe incluir literal:
- "PROHIBIDO REESCRIBIR · solo Edit puntual"
- "OLD STRING + NEW STRING exactos para regex sectionFromPath (1 sola palabra añadida)"
- "OLD STRING + NEW STRING exactos para navByRole (1 sola línea item añadida)"
- "Cero hex hardcoded · var(--theme*) tokens"
- "Si encuentras blocker · DETENTE y reporta · NO inventes paleta nueva"

**REGLA #3 · Audit post-merge obligatorio** (5 puntos):
1. grep hex hardcoded archivos nuevos
2. grep sectionFromPath cubre path nuevo
3. git diff SuperadminLayout.js < 20 líneas modificadas
4. git diff navByRole.js solo `+1 item` (no renumeración)
5. yarn build OK · no syntax errors

Si CUALQUIER punto falla · NO mergear a main · rollback al pre-checkpoint tag.

### Para Claude Code terminal (recommended path forward):

Prompt ULTRA-defensivo template ya documentado en sesión 2026-05-18. Pattern: solo Edit puntual con OLD/NEW string literal · NUNCA reescritura · build verification incremental cada sub-chunk.

---

## 4 · Estado actual aurora (2026-05-18 post-rollback)

| Componente | Estado |
|---|---|
| `SuperadminLayout.js` sectionFromPath | ✅ 7 secciones aurora intactas · paleta canónica |
| `navByRole.js` SUPERADMIN_NAV | ✅ 7 secciones · 45 items (sidebar restaurado completo) |
| 22 features superadmin shipped | ✅ todos descubribles vía sidebar |
| `superadmin-aurora.css` | ✅ intacto · NO tocado por ningún batch (bien) |
| Bug #5 W5.FF3 INTENTO 1 | ✅ rollback completo · NUNCA mergeado a main |

---

## 5 · Próximo paso (W5.FF3 INTENTO 2)

- Claude Code terminal con prompt ULTRA-defensivo
- pre-checkpoint `pre-W5.FF3-matrix-20260518-1101` activo
- Solo Edit puntual de 1 línea regex + 1 línea navByRole item
- Audit post-merge obligatorio 5 puntos

Si bug #6 ocurre · escalar: deferir UI Matrix superadmin hasta tener arquitectura aurora más resistente a touch externo.
