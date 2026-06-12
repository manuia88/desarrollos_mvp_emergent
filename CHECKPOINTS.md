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

## Nota para sesiones futuras de Claude
No reintentar `git push --tags` desde el entorno remoto: el proxy responde 403 por diseño (solo
permite la rama de la sesión). Registrar el checkpoint AQUÍ por SHA es el mecanismo durable.
