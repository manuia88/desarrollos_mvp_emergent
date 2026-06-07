# Plan de Trabajo GRANULAR — Módulo Desarrollador (Dev)
Mismo proceso que Asesor (ver `MODULE_HARDENING_PLAYBOOK.md` + `ASESOR_CAMPAIGN_DETAILED_LOG.md`),
aterrizado a la superficie REAL de Dev: **34 páginas · 208 rutas**. Fase por fase, items concretos.

Riesgo central de Dev (distinto a asesor): es **multi-tenant por dev_org** → el vector #1 es
**aislamiento entre desarrolladoras** (que un dev NO vea proyectos/unidades/leads/pricing/reportes de otro).

═══════════════════════════════════════════════════════════════════
## FASE 0 · REDISEÑO UI (como asesor: tema claro único + hub + consolidar disperso)
═══════════════════════════════════════════════════════════════════
**0.1 Theming fuente única** — `.portal-dev` en PortalLayout + tokens (reusar patrón asesor-aurora) + candado `check-dev-theme.sh`. Superadmin oscuro NO se toca.
**0.2 Hub de navegación** — agrupar las 34 páginas en motores claros (Proyectos · Inventario · Pricing · Demanda/Inteligencia · CRM · Competencia · Red Comercial · Reportes · Config).
**0.3 Consolidar DUPLICADOS/dispersos** (lo que en asesor fueron las 8→2 / agenda unificada):
  - Pricing: `DesarrolladorPricing` + `DesarrolladorPricingLab` → ¿uno con tabs?
  - CRM: `DesarrolladorCRM` + `DesarrolladorCRMShell` + `CrmFunnel` + `DesarrolladorLeads` → un solo centro.
  - Equipo: `AsesoresMetrics` + `MetricasEquipo` + `InmobiliariaAsesores` + `DesarrolladorRedComercial` → unificar.
  - Citas: `DesarrolladorCitas` + `CitasPolicies` + `DesarrolladorCalendarioSubidas` → agenda+políticas.
  - Dashboard: `DesarrolladorDashboard` + `InmobiliariaDashboard` → ¿por rol?
**0.4 Página centro** = Mis Proyectos (`MisProyectos`/`ProyectoDetail`) como el "Mis Leads" del dev.
**0.5 Quitar/renombrar** lo que confunde (Mini Market, Legajo, Solicitudes, Disputas → revisar si se exponen o esconden).

═══════════════════════════════════════════════════════════════════
## ✅ FASE 1 + 2.1 HECHO (2026-06-06): auditoría arquitectura + AISLAMIENTO cross-dev-org cerrado.
Triage automatizado 91 endpoints con id de recurso → 9 fugas reales cerradas con candado reusable
`tenant_scope.assert_dev_org/assert_dev_project` (superadmin bypass): reports download · pricing PATCH+results ·
units {dev_id} ×3 · prototypes reorder · assets role · appointments policy GET+PUT · lead recalc-heat
(+ get_lead_detail en Bloque 1.2). Verificado en vivo (ajeno→403, propio→200). Falsos positivos: público/
dato-de-mercado/ya-protegido (can_view_ai_summary). ✅ FASE 2.4 ATOMICIDAD HECHO (2026-06-06): índice único PARCIAL anti doble-reserva en unit_holds
{unit_id}@active y appointments {asesor_id,datetime}@confirmed + DuplicateKeyError→409. Verificado
(2º insert bloqueado · re-apartar tras release OK · hold#1=200/#2=409 live). ✅ FASE 2.3 HECHO (2026-06-06): rate-limit en 6 públicos (check_rate: book 5/min · availability/slots 30/min ·
cita token-actions 10/min · verificado 429) + barrido 100 GET dev → CERO 500 (86×200/7×422/3×404/2×403-candados/
1×429/1×307). ✅ FASE 4 QA HECHO (2026-06-06): scripts/qa_journey_dev.py (arnés reusable, pega al backend vivo) →
20/20 verde: journey 8/8 (dashboard+7 upgrades) · aislamiento 7/7 (red-team cross-dev-org) · atomicidad 2/2
(doble-apartado→409) · cohesión 2/2. **DEV MÓDULO FASE 1-4 COMPLETO** (rediseño Paso C + endurecimiento
aislamiento/atomicidad/rate-limit/sin-500 + QA). Pendiente menor opcional: canonizar vocabulario dev_org/
project · load test N proyectos. SIGUE: recap de upgrades por batch al founder.

## FASE 1 · AUDITORÍA DE ARQUITECTURA (mapa de flujos + cables)
═══════════════════════════════════════════════════════════════════
**1.1 Mapear el flujo natural del desarrollador** (el "viaje" para el QA después):
  Crear proyecto → unidades/inventario → pricing → publicar/landing → recibe leads → demanda/scores → battle card vs competidores → reportes/cashflow → red comercial (asignar asesores/inmobiliarias) → políticas de cita.
**1.2 Cables rotos a buscar** (como los 8 de asesor):
  - ¿`NuevoProyecto`→`ProyectoDetail`→unidades→landing pública→leads conectado punta a punta?
  - dev↔asesor↔inmobiliaria: ¿AutoAssignments / RedComercial / CrossPartnerships realmente cablean? (la regla DMX vive aquí).
  - Demanda/IEDetail: ¿usan data real o stub? (en asesor el heatmap era random → demand_engine real).
  - Battle Card / Competidores: ¿data real? (en asesor contaba leads mal por datetime).
  - Reportes/Distributions/CashFlow: ¿se generan/envían o son huérfanos?
**1.3 Inventario de huérfanos:** cuáles de las 34 páginas NO tienen ruta en App.js · endpoints sin caller · colecciones write-never-read (mismo barrido que asesor).

═══════════════════════════════════════════════════════════════════
## FASE 2 · AUDITORÍA DE PRODUCCIÓN (las 8 familias aplicadas a Dev)
═══════════════════════════════════════════════════════════════════
**2.1 🔴 AISLAMIENTO cross-dev-org (el más crítico de Dev)** — para CADA endpoint que recibe project_id/lead_id/unit_id/report_id: ¿filtra por el dev_org del que llama? Un dev NO debe ver/editar proyectos, unidades, leads, pricing, reportes ni branding de OTRA desarrolladora. (En asesor fueron 8 IDOR; aquí la superficie es mayor.)
**2.2 Funciones apagadas** — páginas/features construidas sin exponer (como Bandeja IA en asesor).
**2.3 Bugs latentes** — barrido de las 208 rutas GET (ningún 500) · grep de `except: pass` en rutas de dinero/pricing.
**2.4 Atomicidad/carreras Dev-específicas:**
  - **Unit holds / disponibilidad**: ¿dos compradores reservan la MISMA unidad a la vez? (CAS en el hold · el cron unit_holds_release).
  - **Pricing experiments**: integridad del experimento (no doble-aplicar / no resultados corruptos).
  - **Booking público** (`/api/public/projects/{id}/book`): doble-reserva del mismo slot (índice único / CAS).
**2.5 Modelo de datos (el MISMO fork):**
  - `dev_org_id` vs `developer_id` vs `org_id` — ¿consistente? (en asesor fue tenant_id vs dev_org_id vs inmobiliaria_id).
  - `project_id` vs `development_id` (alias visto en b13) — ¿se usan ambos? canonizar.
  - status de unidad/proyecto/lead — ¿vocabulario único? · índices en proyectos/unidades/leads por dev_org.
**2.6 Config/secretos** — branding logo **upload** (validar tipo/tamaño/path), OAuth Google (tokens cifrados), envíos de reportes (Resend dominio .io).
**2.7 Resiliencia** — error boundary ya global (heredado) · fallos silenciosos en crons de reportes/pricing → visibles.

═══════════════════════════════════════════════════════════════════
## FASE 3 · REPARACIÓN (mismo orden; mucho HEREDADO de asesor)
═══════════════════════════════════════════════════════════════════
Orden: aislamiento cross-dev-org → bugs del barrido → índices+vocabulario dev_org/project canónico → atomicidad (unit holds/booking CAS+único) → rate-limit públicos (booking/availability — reusar `rate_limit.py`) → config (upload/oauth/reportes) → resiliencia.
**Ya heredado (no rehacer):** rate_limit.py · ErrorBoundary global · observability/before_send · patrón resolver+backfill+reconcile · CAS/índice único parcial/compensación · 118 motores compartidos ya endurecidos.

═══════════════════════════════════════════════════════════════════
## FASE 4 · QA (7 olas re-apuntadas a Dev + "día del desarrollador")
═══════════════════════════════════════════════════════════════════
Reusar `scripts/qa_*.py` cambiando seed/rutas a Dev. **Día del desarrollador (qa_journey_dev):**
1. Crea desarrolladora + proyecto (`NuevoProyecto`) → 2. carga unidades/inventario → 3. fija pricing →
4. publica landing → 5. **llega un lead** (público→este dev) → aparece en su CRM/Funnel →
6. demanda/scores del proyecto → 7. battle card vs competidor → 8. reserva pública de unidad (sin doble-booking) →
9. asigna asesor (red comercial) → 10. reporte/cashflow → 11. **cohesión**: el proyecto/lead coherente en
Dashboard + CRM + Demanda + Reportes · **aislamiento**: un 2º dev NO ve nada de esto.
Olas específicas Dev: **red-team de aislamiento cross-dev-org** (el más importante) · barrido de 208 rutas ·
concurrencia en unit-holds/booking · carga con N proyectos/unidades.

═══════════════════════════════════════════════════════════════════
## POR QUÉ DEV SERÁ MÁS RÁPIDO QUE ASESOR (estimación)
═══════════════════════════════════════════════════════════════════
- Proceso, orden de arreglo y 7 olas de QA ya definidos (no se descubren).
- Infra compartida hecha (rate-limit, error boundary, observabilidad, resolver, índices).
- El fork de datos ya conocido (dev_org_id/project_id) — mapear primero, no descubrir tarde.
- Arneses re-apuntables · BD aislada (dmx_qa_sim) lista.
- **Foco principal de Dev = aislamiento cross-dev-org** (más superficie que asesor) → ahí va el mayor esfuerzo.

(Superadmin: salta FASE 0. Solo FASES 1-4, con énfasis EXTREMO en FASE 2.1 — es el rol más privilegiado.)
