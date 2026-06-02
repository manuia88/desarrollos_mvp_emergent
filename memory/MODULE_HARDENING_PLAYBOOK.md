# Playbook de Remodelación + Auditoría + QA de un Módulo
**Aprendido del módulo Asesor (2026-06) · reutilizable para Dev y Superadmin**

Objetivo: que la próxima remodelación (Dev) y los próximos endurecimientos (Dev,
Superadmin) sean **más rápidos y predecibles**, porque ya sabemos QUÉ buscar, EN QUÉ
ORDEN arreglarlo, y tenemos las herramientas hechas.

---

## PARTE 1 · RETROSPECTIVA — qué encontramos en Asesor (taxonomía de hallazgos)
Todo módulo grande tiene las mismas FAMILIAS de problemas. Búscalas siempre:

| Familia | Qué es | Ejemplos reales en asesor |
|---|---|---|
| **Funciones apagadas/ocultas** | construido pero no expuesto en UI | Bandeja IA, métricas, agentes existían pero no se veían |
| **Cables sueltos/muertos/huérfanos** | endpoint sin caller, componente sin ruta, colección write-never-read | ~9 endpoints muertos, ~16 componentes FE sin ruta, accuracy_snapshots |
| **Bugs latentes escondidos** | `except: pass` traga errores → solo aparecen bajo carga/ataque | 7 reales: logging sin import, emit_ml_event firma, status_v2 ausente, activo en kanban, cross-sell KeyError, buyer-by-id, receptora sin activar |
| **Seguridad / IDOR** | endpoints sin candado de dueño/tenant, auth débil | register-superadmin, 8 IDOR, Atlax 56 tools sin allow-list, sin rate-limit, CORS, secretos en disco, salt en bundle |
| **Atomicidad / carreras** | doble-escritura sin candado | doble-XP al cerrar, cita huérfana, dedup en carrera, idempotencia conversación |
| **Modelo de datos forkeado** | mismo concepto, nombres distintos (o ninguno) | owner/asesor_id/assigned_to · tenant_id/dev_org_id/inmobiliaria_id · status/status_v2/etapa · created_at tipo mixto · CERO índices |
| **Config fail-open** | defaults inseguros, env sin setear = abierto | budget fail-open, demo accounts en prod, Fernet/salt débil |
| **Resiliencia** | sin error boundary, fallos invisibles, sin auto-reparación | pantalla blanca, leads invisibles sin reintento |

**LECCIÓN CLAVE:** el modelo de datos forkeado (nombres de campo inconsistentes) es la
RAÍZ que reaparece en muchos bugs. **Mapéalo PRIMERO** (concepto → variantes de nombre).

---

## PARTE 2 · CÓMO LO RESOLVIMOS (patrones reutilizables)
- **Reparar, no parchar:** arreglar la FAMILIA/causa raíz, no la instancia.
- **Campo canónico + resolver + backfill + reconcile** (auto-sanable): un solo nombre,
  una función que resuelve el enredo, migración en arranque que sana lo existente.
  (ej. `inmobiliaria_id` + `resolve_user_inmobiliaria` + `backfill_lead_inmobiliaria`).
- **Atomicidad sin transacciones** (Mongo standalone): **CAS** (update con filtro de
  estado actual + check modified_count), **índice único parcial** (`$type:"string"`,
  nunca `$exists` que matchea null), **compensación** (revertir si falla un paso).
- **Allow-list chokepoint** para superficie pública (Atlax): lista blanca dura en el
  punto de ejecución, no confiar en el prompt/JSON del LLM.
- **Fail-closed + visible:** estado desconocido NO autoriza; `log.error` → Sentry.
- **Auto-reparable > alertar:** el founder no lee alertas → marca `*_pending` + reintento
  en arranque para que el sistema se arregle solo.
- **Length-caps + Pydantic** frenan inyección/abuso en la capa de validación.

## Orden de arreglo (prioridad probada)
1. Secretos + auth (registro-rol) + presupuesto fail-closed.
2. Bugs propios introducidos en construcción previa.
3. Índices + un solo vocabulario de estados (+ backfills).
4. Atomicidad (CAS/único/compensación).
5. Seguridad IDOR (candados owner/tenant).
6. Rate-limit públicos + allow-list asistente.
7. Config (CORS/demo/Fernet) + prompt-injection/XSS.
8. Resiliencia (error boundary + observabilidad + auto-reparable).

---

## PARTE 3 · QA — olas en orden (cada una caza algo distinto)
1. **E2E funcional** (auth, CRUD, flujos felices) — `qa_sim.py`.
2. **Concurrencia real + escala + integridad + fuzz + viaje** — `qa_sim2.py`.
3. **Carga/estrés** (10k docs, ráfaga concurrente, churn) — `qa_load.py`.
4. **Red team / pentest** (NoSQL, IDOR, mass-assign, JWT, webhook, prompt-inj) — `qa_redteam.py`.
5. **Crons + features + métricas + barrido de TODAS las rutas + idempotencia + contrato** — `qa_sim3.py`.
6. **Destructivo/chaos** (datos extremos, refs colgantes, ML adversarial, misma-entidad) — `qa_destructive.py`.
7. **Día en la vida / flujo completo + scorecard de producción** — `qa_journey_full.py`.

**Gotchas del QA (nos atoraron — evítalos):**
- Muchos hallazgos de auditoría estaban **STALE** (ya arreglados): VERIFICA el código
  actual antes de tocar; no confíes en el número de línea del reporte.
- **Higiene del arnés:** BD de prueba aislada (`dmx_qa_sim`, NUNCA `dmx_local`), datos
  únicos por corrida, limpiar restos (receptoras/dedup), un cliente sin cookies para
  probar 401. Varias "fallas" eran artefactos del arnés, no bugs.
- El app NO bootea local por rutas `/app` hardcodeadas → redirige 11 envs de storage a `/tmp`.
- Sabe cuándo PARAR de auditar: cuando las rondas CONVERGEN (confirman, no encuentran clases nuevas).

---

## PARTE 4 · ASSETS REUTILIZABLES (ya hechos → Dev/Superadmin heredan)
- **Arneses** `scripts/qa_*.py` (7): cambiar rutas/seed al módulo nuevo y correr.
- **Infra compartida**: `rate_limit.py`, `lead_bridge.resolve_*`, ErrorBoundary (global,
  ya envuelve toda la app), `observability` (Sentry init + before_send filtro KG),
  índices canónicos, `_sentry_before_send`.
- **118 motores compartidos** ya endurecidos en parte por los arreglos transversales.
- **Patrón de arnés ASGI**: bootear el app real vs Mongo local con storage→/tmp.

---

## PARTE 5 · PLAN DE TRABAJO

### A) DEV / DESARROLLADOR (rediseño + auditoría + QA) — superficie: 208 rutas, 35 páginas
1. **Rediseño UI** (como asesor): tema claro único, hub de navegación, páginas centro,
   colapsar/renombrar lo disperso. (Reutiliza tokens + patrón de theming de asesor.)
2. **Auditoría de arquitectura** (1 pase multi-agente): mapa de flujos dev (proyectos,
   unidades, demanda, battle card, scores, landing, studio) + cables sueltos/huérfanos.
3. **Auditoría de producción** (seguridad/perf/datos/observabilidad) — misma taxonomía.
4. **Arreglo por patrones** (mismo orden) — muchos ya resueltos por ser código compartido.
5. **QA** (correr las 7 olas apuntando a rutas dev + un "día del desarrollador":
   crear proyecto → unidades → publicar → recibir leads → demanda/scores → battle card).

### B) SUPERADMIN (SOLO auditoría + QA, sin rediseño) — superficie: 156 endpoints, 71 páginas
1. **Auditoría de arquitectura + producción** (mismas taxonomías; ojo: superadmin oscuro
   NO se toca el tema, solo se audita).
2. **Arreglo por patrones**.
3. **QA**: barrido de TODOS los endpoints superadmin (ningún 500) + red-team específico
   (superadmin es el rol más privilegiado → IDOR/escalación/cross-tenant son críticos) +
   crons/observabilidad/data-sources/KG + idempotencia de arranque.

### Por qué será MÁS RÁPIDO que asesor
- Las 7 olas de QA ya existen (solo re-apuntar seed + rutas).
- Los patrones de arreglo están definidos (CAS, allow-list, canónico+backfill, self-heal).
- La infra compartida (rate_limit, error boundary, observability, resolver) ya está.
- Ya sabemos QUÉ familias buscar y EN QUÉ ORDEN — sin descubrir el proceso desde cero.
- El fork de datos (la raíz lenta) ya se mapeó en parte (campos compartidos).

**Regla de oro aprendida:** mapear el modelo de datos forkeado PRIMERO + tener BD de QA
aislada desde el inicio = se evita el 80% de los atascos que tuvimos en asesor.
