# Auditoría de conexiones, huérfanos y seguridad — 2026-06-16

Síntesis de 5 agentes paralelos (read-only, regla "verificar antes de reportar"). Rama `dev-redesign-tandas`.

**Veredicto:** la auditoría formal `AUDIT_FASE_0..12` (2026-06-10) está en su gran mayoría **resuelta y verificada en código** (~25 fixes P0/P1 confirmados). Esos docs ya están obsoletos. Lo que sigue abajo es lo que GENUINAMENTE falta, hallado en un barrido fresco. Fable5 canónico = `desarrollosmx-mvp` (CLAUDE.md 17 reglas, 328 líneas).

---

## ✅ RESUELTO en este batch (commits fd5d1e4d · ed06465e · b8f706d1 · 17a47ab9)
- 🔴 **#1 IDOR lead-review** → `assert_dev_org` en approve/reject (dev_batch4_1.py).
- 🔴 **#2 fuga PDF report** → `assert_dev_org`+`assert_dev_project` en generate_report (dev_batch5.py).
- 🔴 **#3 kill-switch IA** → `llm_killswitch.py` parcha `LlmChat.send_message` al arranque; `AI_DISABLED` ahora corta los ~45 motores (verificado: corta antes de la red).
- 🟡 **#5 chat público** → pasa por `within_budget(db,"__public__")` (kill-switch + tope).
- 🟡 **#4 cables (3 de 6)** → asset role, units, generateScript apuntan al endpoint real.
- 🟡 **citas** → `asesor_citas`→`appointments` (verificado por campos: contacto_id/created_at).
- 🟡 **anti-scraping** → `robots.txt` (bloquea crawlers de IA) + `X-Robots-Tag` en /api/.
- 🟡 **dedup .env.local** (local) → quitado el bloque DB/auth duplicado (causa del lío dmx_local↔desarrollosmx).

**Reclasificación honesta (NO eran "typos", son features a medio construir — NO se renombraron a ciegas):**
- `ie_unit_scores`/`ie_scores_history`/`ie_engine_scores`/`market_bulletins`/`dev_leads`/`asesor_leads`: la colección destino tiene OTRA forma (ie_score_history sin timestamp/delta; dmx_bulletins con zone_id/tier/period no alcaldia/scope). Renombrar fingiría un fix. → quedan documentadas aquí; necesitan construir el pipeline/forma esperada, no un rename.

**Cables NO arreglados (decisión, no descuido):**
- `studio-video tasks`/`getTask`: no tienen backend; el front ya degrada a `[]` sin romper.
- `CitasPolicies` picker de asesores: no existe endpoint dev-scoped de asesores → necesita diseño (un endpoint nuevo), no es un typo.

---

## 🔴 CRÍTICO — arreglar antes de producción (verificados explotables)

| # | Hallazgo | Archivo:línea | Riesgo | Fix |
|---|---|---|---|---|
| 1 | IDOR mutación cross-tenant en revisión de leads (approve/reject) — valida rol, no tenant | `routes/dev_batch4_1.py:1491,1520` | Dev A reactiva/mata leads de Dev B | `assert_dev_org` tras fetch (espejo de `disputes.py:95`) |
| 2 | Fuga cross-tenant en reporte PDF — fetch de template por id sin assert | `routes/dev_batch5.py:797` | A descarga PDF con datos de B | `assert_dev_org(user, template.dev_org_id)` |
| 3 | Kill-switch de IA (`AI_DISABLED`) NO corta ~30 motores LLM (llaman `chat.send_message()` directo) | `conversation_engine.py:832`, `lead_enrichment_engine.py:328`, `cma_engine.py:333`, +27 | Apagar IA no apaga la IA → costo/abuso | enrutar por `send_with_timeout`/`within_budget` |
| 4 | 6 cables rotos que dan 404 en flujos vivos | ver abajo | Botones que fallan en silencio | corregir path o crear endpoint |
| 5 | Chat público anónimo (widget landings) sin tope de presupuesto IA | `routes/conversation.py:192` | LLM público sin budget ni kill-switch | `check_quota_or_raise` también en path anónimo |

**Cables rotos (404 en vivo):**
- `ContenidoTab.js:159` → `PATCH /api/desarrollador/developments/{id}/assets/{aid}/role` (real: `/api/dev/projects/...`)
- `ProyectoDetail.js:742` → `GET /api/marketplace/development/{slug}` (real: plural `/developments`)
- `api/studioVideo.js:47,78,93` → `/api/studio-video/{generate-script,tasks,tasks/{id}}` (no existen)
- `CitasPolicies.js:331` → `GET /api/superadmin/users?role=asesor` (no existe)

---

## 🟡 IMPORTANTE — bugs silenciosos y deuda de doctrina

**Colecciones mal nombradas (leen vacío → feature muerta en silencio):**
| Lee | Debería ser | Archivo:línea |
|---|---|---|
| `ie_unit_scores` | `ie_scores` | `director_agent_engine.py:302` |
| `ie_scores_history` | `ie_score_history` | `director_memory_engine.py:531` |
| `ie_engine_scores` | `ie_scores` | `services/colonia_intelligence.py:186` |
| `asesor_citas` | `appointments` | `health_score.py:241`, `dev_batch14.py:334` |
| `market_bulletins` | `dmx_bulletins` | `dev_batch2.py:389` |
| `dev_leads` | `leads` | `search_prefs.py:138` |
| `asesor_leads` | `asesor_contactos`/`leads` | `briefing_engine.py:240` |

**Doctrina Fable5 no aplicada a emergent (gaps reales):**
- 🔴/🟡 Sin capa central de tenant-scoping (RLS-equivalente) — el filtro es ad-hoc por endpoint (raíz de los IDOR #1/#2).
- 🟡 Sin anti-scraping: falta `robots.txt` (bloquear GPTBot/ClaudeBot/CCBot), `X-Robots-Tag`, rate-limit por ruta.
- 🟡 RBAC inconsistente: `require_role` existe pero `Depends(require_role)` se usa 0 veces; chequeos inline por router.
- 🟡 Sin flag de disclosure `data_quality('real'|'seeded'|'placeholder')` + píldora visual (la seed convive con dato real).
- 🟡 Secretos sin fail-closed total: `ADMIN_PASSWORD` default `Admin2026!`, `JWT_SECRET` efímero (rompe sesiones al reiniciar).
- 🟡 `.env.local` con claves DUPLICADAS (`DB_NAME` 2× → `dmx_local` y `desarrollosmx`; gana el último). Dedup.
- 🟡 Prompt-injection: `llm_safety` existe pero solo 2 motores lo usan; conversation/argumentario/director meten input crudo.
- 🟢 Sin quality gates pre-commit (husky/lint/typecheck); frontend 0 tests; sin `audit:dead-ui` en CI.

---

## 🧹 LIMPIEZA — huérfanos verificados (borrar o cablear)

- **Motores backend huérfanos: 0** — los 149 `*_engine.py` están importados/usados. (Confirma que el viejo reporte "15 motores sin API" era ~87% falso positivo.)
- **Endpoints legacy/duplicados sin caller (~16):** v1 del simulador de inversión, `/api/maps/colonias`, variantes kanban v2, `studio/video/*` viejo, `whatsapp/*` no-superadmin, etc. → borrar.
- **Endpoints superadmin de ops nunca expuestos (~15):** `agent-workforce/stats`, `*/usage`, `*/cache-stats`, `subagents/*/runs`, `director/memory/*` → cablear en un panel superadmin o borrar.
- **Componentes frontend sin importador (17):** `ChatWidget`, `SocLeaderboard`, `LeadEnrichmentPanel`, `LeadJourneyTimeline`, `FilterPresetsBar`, 3× `studio/Landing*`, `RiskWatchlist`, etc. (varios = W5.x esperando host page).
- **Página sin ruta (1):** `studio/MoodBoardSection.js`.
- **Flags muertas:** `REACT_APP_DEVELOPER_DIRECTOR` (0 usos), PostHog sin keys en ningún entorno (analytics apagado), `REACT_APP_LFPDPPP_SALT` muerto en bundle.

---

## ⚙️ NO-CÓDIGO (founder/infra — el roadmap los admite)
- 🔴 Verificación final en STAGING nunca corrida (`scripts/preflight_staging.py` + load-test).
- 🔴 Backups / point-in-time recovery de Mongo (panel Atlas).
- 🟡 Credencial Mongo de solo-lectura para superficies públicas (defensa en profundidad).
- En `emergent.sh`: setear los `resource_id` de fuentes + correr la carga + recompute una vez (los scores nuevos viven en la BD local, el código ya está en GitHub).
