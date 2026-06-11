---
name: dev-portal-audit
description: Auditoría 2026-06-10 · el portal Dev ya está ~85% construido · cockpit Inicio existe · net-new ≈ wrappers de motores latentes + 1 pieza data-dependiente · NO rebuildear
metadata:
  type: project
---

Auditoría del portal Desarrollador (2 agentes Explore, front+back) — 2026-06-10. Motivo: founder pidió "revisar lo ya hecho para no duplicar ni sobre-ingenierizar" antes de retomar roadmap. **Veredicto: ~85% construido y funcional. NO rebuildear — surface > build.**

**Front (frontend/src/pages/developer/ · ~38 páginas):** El Inicio (`DesarrolladorDashboard.js`, 552 líneas) YA es un cockpit cross-proyecto completo: Weekly Brief IA · "Tus Jugadas de Hoy" (getDevPlays) · "Tu Asistente" (Cerebro E0-E6: status/tasks/learning/recommendations/approve/reject) · PortfolioReading · PortfolioCockpit (filtrable todo/zona/proyecto) · Market Doorway · alertas. Flag `REACT_APP_DEV_V2` reorganiza menú (navByRoleV2: 7 hubs vs 34 links planos), agrega DevSidebarV2 + FichaHome (corona "jugada de hoy" + 4 secciones, spec [[DEV_FICHA_HOME_SPEC]]). MisProyectos = galería con stage/stats/salud/score. Todo wired a endpoints reales.

**Back (19 endpoints wired + 6 motores latentes):** routes/developer.py (dashboard, portfolio-reading [el cockpit IA real], leads-cockpit, comportamiento, red-salud, pricing-inteligente, reporte-ejecutivo, ciclo-renta, indices, demanda, bancabilidad, competidores…) + dev_batch10.py (`/api/dev/projects/plays` = 3 jugadas top rankeadas por $, `_compute_health_score`). Cerebro: routes/cerebro.py (status/detect-market/tasks/run/approve/reject/config E2.5) + recommendations.py + coach.py — COMPLETO, apagado por flag CEREBRO_ENABLED (prender = deploy founder).

**Net-new REAL (≈18h · el resto es cableware):**
1. **Dinero cobrado real** (~8h) — hoy "cobrado" = suma de units `is_sold()` (estático); falta colección de pagos/transactions viva + reconciliación cobrado-vs-esperado + cash-runway. → DATA-DEPENDIENTE (backlog hasta tener flujo de pagos real).
2. Envolver `absorcion_engine.meses_agotar` en endpoint dev (~2h · motor existe, no expuesto).
3. Battle-card scoped a dev (~4h · `battle_card_engine` existe, solo wired para inmobiliaria).
4. Alertas predictivas filtradas por proyecto (~3h · `predictive_alerts_engine` existe, sin endpoint de listado dev).
5. Surface what-if (`simulador_palancas`) al cockpit dev (~1h · existe en /api/whatif).
6. (opcional) agregador `/api/desarrollador/inicio` = 1 call en vez de 7 (perf).

**Huecos cosméticos:** Sala de Control UI puede refinarse · "Configurar mi Cerebro" panel dev (E2.5 spec listo, sin UI) · Live Pulse no expuesto en Inicio · captura proactiva dev no existe. Relacionado: [[DEV_INICIO_BUILD_SCOPE]] (mismo veredicto: surface>build) · [[DEV_VALUE_THESIS]] · [[CEREBRO_DMX_ROADMAP]].
