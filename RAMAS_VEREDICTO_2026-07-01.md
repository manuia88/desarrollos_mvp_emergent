# Veredicto de Ramas — Auditoría 2026-07-01

> **Base de comparación:** `main` (rama por defecto). Análisis de solo-lectura: **no se borró ni fusionó nada**. Este doc es la recomendación; el founder ejecuta las acciones cuando quiera.
>
> **Método:** por cada rama se aisló su aporte real con `git diff main..<rama>` / `main...<rama>`, comparación de blob-hashes, conteo de líneas y grep de marcadores de código en `main`. Tres hallazgos críticos fueron **re-verificados a mano** en este repo (ver "Verificaciones ejecutadas" al final).
>
> **Total: 39 ramas** (30 locales+remotas de features, 9 solo-remotas). Veredicto global: la abrumadora mayoría ya está en `main` **y superada**; solo un cluster (stack F0) contiene valor no integrado.

---

## 1. Tabla consolidada (39 ramas)

| # | Rama | Commits únicos | Qué trae | Estado | vs main | Recomendación |
|---|------|:-:|----------|--------|---------|---------------|
| 1 | asesor-p2-t1-orchestrator | 1 | Orchestrator AI Agent Workforce + Prospector + Nurturer | terminado | superado | **DESCARTAR** |
| 2 | asesor-p2-t2-closer-analyst | 1 | Agentes Closer/Analyst + close_probability + pipeline_drift | terminado | superado | **DESCARTAR** |
| 3 | asesor-p2-t3-coach | 1 | Agente Coach + coaching_analysis | terminado | superado | **DESCARTAR** |
| 4 | asesor-p3-a-agents-cc | 1 | Sección Agentes IA + AgentTeamCard + close-probability endpoint | terminado | superado | **DESCARTAR** |
| 5 | asesor-p3-b-command-bar | 1 | Command Bar IA (Cmd+K → preguntar a Atlax) + /asistente/ask | terminado | superado | **DESCARTAR** |
| 6 | asesor-p5-a-autopilot | 1 | Modo Auto-piloto con guardrails + kill switch | terminado | superado | **DESCARTAR** |
| 7 | asesor-p5-b-ux | 1 | Bulk actions + pin leads + widgets configurables CC | terminado | superado | **DESCARTAR** |
| 8 | w5-10-social-ads-infra | 1 | Social/Ads Meta multi-tenant (tool #52) OAuth+vault | terminado | superado | **DESCARTAR** |
| 9 | w5-22-z4-video-standalone | 1 | Video Standalone end-to-end (tool #53) + cola robusta | terminado | superado | **DESCARTAR** |
| 10 | w5-22-z5-hook-predictor | 1 | Hook Predictor standalone (tool #49) LLM+cache | terminado | superado | **DESCARTAR** |
| 11 | w6-4-marketplace-templates | 1 | Marketplace de plantillas + revenue split 70/30 | terminado | superado | **DESCARTAR** |
| 12 | w6-as1-workflow | 3 | Workflow Builder visual (motor+cola+8 endpoints+tool #45) | terminado | superado | **DESCARTAR** |
| 13 | w6-mov1-soc-franchise | 1 | SOC Franchise scoring/niveles + leaderboard + badge | terminado | superado | **DESCARTAR** |
| 14 | w6-mov2-external-sources | 1 | Gov Data MX (INEGI/Banxico/DataMX/CENAPRED) + cron | terminado | superado | **DESCARTAR** |
| 15 | w6-mov3-reviews | 1 | Reviews Residentes + resumen IA + bloques ficha/zona | terminado | superado | **DESCARTAR** |
| 16 | w6-mov4-mcp | 1 | Marketing Distribution MCP + tool asistente | terminado | superado | **DESCARTAR** |
| 17 | w6-quick-wins | 2 | W6.5 duplicar proyectos + W6.11 fact-check + W6.AS.1 workflows | terminado | superado | **DESCARTAR** |
| 18 | w6-seed-synthetic | 1 | 7 scripts seed sintético W6 + orquestador + README | terminado | superado | **DESCARTAR** |
| 19 | backup-pre-f03-20260510-2223 | 1 | F0.3 parcial: CSV export Free Audit (superado por F0.3 full) | WIP | superado | **DESCARTAR** |
| 20 | w7-as1-lead-enrichment | 1 | Lead enrichment estilo Clay (motor+endpoints+panel) | terminado | superado | **DESCARTAR** |
| 21 | w7-as3-a-engine | 1 | Motor conversación IA (GHL) + 4 canales + playground | terminado | superado | **DESCARTAR** |
| 22 | w7-as3-b-intel | 1 | RAG+DISC+function-calling+Plan Venta playbook | terminado | superado | **DESCARTAR** |
| 23 | w7-as3-c-cycles | 1 | Cierre de ciclos: SOC/workflow/hook/enrichment desde convo | terminado | superado | **DESCARTAR** |
| 24 | w7-as3-d-ui | 1 | UI convo R2: Inbox+LiveTakeover+Sentiment+KB Gaps | terminado | superado | **DESCARTAR** |
| 25 | w7-as3-e-ml | 1 | 4 motores ML (self-tuning/drift/AB/confidence)+tests | terminado | superado | **DESCARTAR** |
| 26 | w7-as3-f-cost | 1 | Optimizador costo LLM 3-tier + dashboard superadmin | terminado | superado | **DESCARTAR** |
| 27 | w7-as3-g-abtest | 1 | UI A/B testing end-to-end + rutas + wire | terminado | superado | **DESCARTAR** |
| 28 | w7-as3-h-confidence | 1 | Wire confidence score + indicador en inbox | terminado | superado | **DESCARTAR** |
| 29 | w7-as3-i-drift | 1 | Dashboard Drift IA end-to-end | terminado | superado | **DESCARTAR** |
| 30 | w7-as6-reputation | 1 | Reputation Monitor (Brand24) + cron + sentiment LLM | terminado | superado | **DESCARTAR** |
| 31 | origin/checkpoint/f0-b2-tests-criticos-20260612 | 9 | Fixes seguridad B1 + 33 tests críticos + REPO_COBERTURA | terminado | **parcial** | **DECIDIR** |
| 32 | origin/checkpoint/f0-b3-performance-20260612 | 12 | b2 + índice units + batching N+1 house_pool + k6 | terminado | **parcial** | **DECIDIR** |
| 33 | origin/checkpoint/f0-b4-mkt1-20260612 | 14 | b3 + estados vacíos honestos marketplace público | terminado | superado | **DESCARTAR** |
| 34 | origin/checkpoint/f0-b4-mkt3-20260612 | 16 | mkt1 + live_pulse + catálogo Barrios dinámico | terminado | superado | **DESCARTAR** |
| 35 | origin/checkpoint/f0-b4-mkt3b-catalog-20260612 | 18 | mkt3 + endpoint /api/colonias/catalog + test | terminado | superado | **DESCARTAR** |
| 36 | origin/checkpoint/f0-b4-mkt4-robustez-20260612 | 20 | **PUNTA del stack F0** (superset: seguridad+tests+perf+mkt) | terminado | **parcial** | **DECIDIR** |
| 37 | origin/claude/dazzling-newton-9ya74t | 1 | Config .claude/settings.json (acceptEdits) — cero producto | terminado | novel-trivial | **DESCARTAR** |
| 38 | origin/claude/wizardly-galileo-p6tg41 | 23 | Punta b4-mkt4 + mockup HTML ficha desarrollo (9 pestañas) | terminado | **parcial** | **DECIDIR** |
| 39 | origin/conflict_110526_0125 | 54 | Scratch emergent W5.x/Z.8 (185 archivos) — todo ya en main | experimento | superado | **DESCARTAR** |

---

## 2. Agrupación por recomendación

### 🟢 MERGE — fusionar a main (valioso, no superado)
**Ninguna rama se recomienda mergear tal cual.** El único valor no-integrado vive en el stack F0, pero esas ramas están **~836 commits stale** → un merge directo garantiza conflictos masivos y **regresaría** el resto de `main`. Por eso ese valor se clasifica como **DECIDIR (extraer a mano)**, no MERGE. Ver §3.

### 🟡 DECIDIR — necesita criterio del founder (4 ramas)
Todas son el **mismo stack F0 cumulativo** + su punta con mockup. El contenido único real está **contenido en la punta** (b4-mkt4 / wizardly-galileo); b2 y b3 se listan como DECIDIR solo porque contienen los fragmentos originales, pero **no hay que tocarlas por separado**.

| Rama | Qué decidir |
|------|-------------|
| f0-b4-mkt4-robustez (**la punta — trabajar desde aquí**) | Re-aplicar a `main` los **3 fixes de seguridad** + **5 tests críticos**. El frontend (marketplace/barrios/blindaje) está superado por la deriva de main → **NO** re-aplicar. |
| f0-b2-tests-criticos | Origen de los fixes B1 + 33 tests. Redundante con la punta; solo referencia. |
| f0-b3-performance | Único aporte propio: batching N+1 en `house_pool_engine`. Verificar si main ya lo refactorizó antes de portar. |
| claude/wizardly-galileo-p6tg41 | Backend/tests **idénticos** a b4-mkt4 (misma extracción). Extra = `mockups/dev-ficha-desarrollo.html`; MEMORY indica que la ficha ya se rediseñó (FichaCockpit V3) → decidir si conservar el .html como artefacto o descartar. |

### 🔴 DESCARTAR — muerto/superado/trivial (35 ramas)
- **asesor-p2 (t1/t2/t3)** — split paralelo del AI Agent Workforce; todo en main con **bugfixes reales** que las ramas no tienen (BSON Date vs `.isoformat` en prospector/coach, pesos aprendidos M1, hardening `asistente_engine`). Mergear = regresión.
- **asesor-p3/p5 (a/b, a/b)** — integradas + main evolucionó (PremiumCard, cron autopiloto, **guardrails endurecidos**). Mergear P5.A = regresión de seguridad.
- **w5-10 / w5-22-z4 / w5-22-z5 / w6-4** — engines en main con fixes post-merge (A.2/F.89, G.101/G.103 aislamiento cache cross-tenant, F.68 PII author_email). z4-video byte-idéntico.
- **w6-as1 / w6-mov1..4 / w6-quick-wins / w6-seed** — Wave 6 consolidado; main superset con SSRF G.94, PII G.90, repunte de fuentes gov muertas, LLM independence. Seed byte-idéntico.
- **backup-pre-f03** — CSV export ya en main vía F0.3 full; lo único propio son URLs viejas `.com` (main ya migró a `.io`).
- **w7-as1 / w7-as3-a..i / w7-as6** — serie conversación IA totalmente absorbida; muchos byte-idénticos, main +548/+113/+1171 líneas donde difiere; deltas = versión vieja (EMERGENT_LLM_KEY, user.user_id). 2 componentes solo-en-rama (ChatWidget.js, LeadEnrichmentPanel.js) son **huérfanos** (nadie los importa, ni en su propia rama).
- **f0-b4-mkt1 / mkt3 / mkt3b** — eslabones intermedios del stack, redundantes con la punta; frontend muy divergido en main.
- **claude/dazzling-newton** — config trivial de Claude Code, cero producto.
- **conflict_110526_0125** — scratch emergent 1905 commits detrás; features W5.x/Z.8 todas en main (TemplateDispatcher byte-idéntico), rutas viejas ya reorganizadas.

---

## 3. Para las MERGE / DECIDIR: riesgo de conflicto y orden

No hay merges "limpios". El plan es **extraer, no fusionar**, sobre `main`, en este orden:

| Orden | Acción | Riesgo de conflicto | Nota |
|:-:|--------|---------------------|------|
| 1 | **RAG P0 — confinar scope público** en `backend/rag_engine.py` (`/api/search/semantic`) | Bajo-medio. main reescribió `semantic_search` con filtros F2 opcionales; portar `PUBLIC_SEARCH_SCOPES` + filtro `source_types` sobre esa firma nueva, no copiar el bloque viejo. | **Prioridad #1** (fuga cross-tenant a usuario NO autenticado). Verificado ausente en main hoy. |
| 2 | **B1-03 — helper `_verified_email`** en `backend/routes/comprador.py` | Bajo. main tiene los 4 JOINs crudos (líneas 104/123/181/207) intactos; reemplazar cada `{"email": user.email}` por el helper. | Account-takeover por email no verificado. Verificado ausente en main hoy. |
| 3 | **register `email_verified`/`auth_method`** en `backend/routes/auth.py` | Bajo. | Complemento de #2; el JOIN por email solo debe confiar en emails verificados. |
| 4 | **5 tests críticos** (`backend/tests/critical/`) | Muy bajo (archivos nuevos). Los motores que testean siguen en main. | Portar tal cual; correrlos para validar #1–#3. |
| 5 | **(opcional) batching N+1 house_pool** (b3) | Medio — verificar primero si main ya lo hizo. | Perf, no seguridad. Diferible. |

**Fuente de extracción:** `origin/checkpoint/f0-b4-mkt4-robustez-20260612` (backend/tests idénticos a `wizardly-galileo`). Usar **cherry-pick de archivos / re-aplicación manual**, NUNCA `git merge <rama>` (836 commits stale → conflicto masivo + regresión del frontend ya superado).

**Dependencias:** ninguna entre #1–#4; #3 refuerza #2. Hacer #1 primero por severidad.

---

## 4. Notas de proceso
- Ninguna rama es ancestro directo de `main` → `git branch -d` fallaría. El borrado requiere `git branch -D` local + `git push origin --delete <rama>` remoto. **No ejecutado** (solo-lectura); lo hace el founder.
- Las ramas locales y remotas deben limpiarse en ambos lados.
- `git cherry`/`git branch --no-merged` marcan estas ramas como "no fusionadas" porque se integraron por squash/re-commit (distinto patch-id), no por merge git. El **contenido** sí está en main.

### Verificaciones ejecutadas (evidencia dura, este repo, hoy)
- ✅ **B1-03 confirmado ausente en main:** `main:backend/routes/comprador.py` líneas 104/123/181/207 aún hacen `{"email": user.email}`; **no existe** `_verified_email` en main; **sí existe** en b4-mkt4 (línea 57).
- ✅ **RAG P0 confirmado ausente en main:** el endpoint público pasa `scope` sin whitelist ni filtro PII; b4-mkt4 tiene `PUBLIC_SEARCH_SCOPES` con `scope not in ...` (líneas 875-882).
- ✅ **DESCARTAR sólido (spot-check):** `workflow_engine.py` main=823 líneas vs rama=707; main tiene `_is_safe_webhook_url` (SSRF G.94), la rama **0**. Mergear regresaría seguridad.
