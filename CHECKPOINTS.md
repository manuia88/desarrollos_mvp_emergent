# Checkpoints del Programa "DMX a Producción Impecable"

> **Por qué este archivo existe.** El entorno remoto de Claude Code empuja **solo** a la rama de
> la sesión (`claude/wizardly-galileo-p6tg41`); el proxy git devuelve **HTTP 403** a cualquier otra
> ref, incluidos los `refs/tags/*`. Por eso los checkpoints no pueden subirse como *tags* desde aquí.
> Este archivo (que SÍ se versiona en la rama) registra cada checkpoint → su commit SHA, para que
> nada se pierda y puedas crear los tags reales con un comando (abajo). Recuperable siempre por SHA.

## Mapa de checkpoints (nombre → commit)

| Tag propuesto | Commit | Marca |
|---|---|---|
| `checkpoint-f0-b0-ledger-20260612` | `5288ece7` | F0·B0 — Ledger de cobertura + Línea-Base + checklist |
| `checkpoint-f0-b1-seguridad-20260612` | `3053bc85` | F0·B1 — Seguridad: P0 (fuga RAG) + 3 P1 + 3 P2 cerrados |
| `checkpoint-f0-b2-tests-criticos-20260612` | `151f21da` | F0·B2 — Auditoría técnica + 33 tests críticos (33/33 verde) |
| `checkpoint-f0-b3-performance-20260612` | `b5f82fc2` | F0·B3 — Performance: índice units + N+1 house_pool + script SLA |
| `checkpoint-f0-b4-mkt1-20260612` | `ef629b4a` | F0·B4 — Marketplace público: estados honestos + ConfianzaPage sin datos falsos |
| `checkpoint-f0-b4-mkt3-20260612` | `87d09cd1` | F0·B4 — Despertar: live_pulse en ColoniaLanding + Barrios catálogo dinámico |
| `checkpoint-f0-b4-mkt3b-catalog-20260612` | `f0d2da95` | F0·B4 — Endpoint público /api/colonias/catalog sobre db.colonias + 4 tests (37/37) |
| `checkpoint-f0-b4-mkt4-robustez-20260612` | `(commit MKT-4)` | F0·B4 — Blindaje anti-crash ZoneScoreStrip/ScoreExplainModal (3 páginas públicas) |

## Cómo crear los tags reales (córrelo UNA vez, en tu máquina o donde tengas push completo)

Desde un clon del repo con credenciales completas (no el entorno de Claude):

```bash
git fetch origin claude/wizardly-galileo-p6tg41

git tag -a checkpoint-f0-b0-ledger-20260612      5288ece7 -m "F0 B0 · Ledger + Línea-Base + checklist"
git tag -a checkpoint-f0-b1-seguridad-20260612   3053bc85 -m "F0 B1 · Seguridad: P0/P1 cerrados"
git tag -a checkpoint-f0-b2-tests-criticos-20260612 151f21da -m "F0 B2 · Auditoría técnica + 33 tests críticos"

git push origin --tags
```

(Alternativa sin terminal: en github.com → Releases → "Draft a new release" → "Choose a tag" → escribe
el nombre → "Create new tag" → en *Target* pega el commit SHA. Una release crea el tag.)

## PROTOCOLO DE CHECKPOINT POR BLOQUE (convención fija · acordada con el founder 2026-06-12)

Al cerrar **cada** bloque del programa (B3, B4, …), la sesión de Claude DEBE, sin que el founder
lo pida:

1. **Commit + push** del cierre del bloque a la rama de sesión (única ref que el proxy permite).
2. **Registrar el SHA aquí**: añadir una fila a la tabla "Mapa de checkpoints" con
   `checkpoint-f0-bN-<slug>-AAAAMMDD → <commit-corto> → <qué marca>`.
3. **Crear la rama-checkpoint en el remoto vía la API de GitHub** (evita el 403 del proxy):
   herramienta `mcp__github__create_branch` con
   `branch = checkpoint/f0-bN-<slug>-AAAAMMDD`, `from_branch = claude/wizardly-galileo-p6tg41`.
   (La API solo crea en el *tip* de una rama; por eso se crea justo tras el push del cierre,
   cuando el tip ES el commit del checkpoint.)
4. **Reportar** el nombre del checkpoint + SHA en el resumen de cierre del bloque.

NO reintentar `git push --tags` ni `git push <otra-rama>`: el proxy responde **403** por diseño.
Los TAGS reales los crea el founder con el comando de arriba (o GitHub → Releases) cuando quiera;
el registro por SHA + la rama-checkpoint son el mecanismo durable entre tanto.
