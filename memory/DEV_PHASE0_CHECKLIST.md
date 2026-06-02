# FASE 0 Dev · Checklist COMPLETO de Rediseño (módulo por módulo, tab por tab)

## ⭐ RESPUESTA a "¿construir de cero, conectar lo nuevo y eliminar lo viejo sin romper?"
**SÍ — es la forma correcta y segura. Es exactamente como hicimos "Mis Leads" (LEADS_V2).**
Patrón **"strangler fig" (construir al lado, verificar, retirar):**

> **El backend es el contrato. La FASE 0 es SOLO UI — NO se tocan endpoints ni motores**
> (esos se endurecen en Fases 1-4). Si lo nuevo llama a los MISMOS endpoints, la arquitectura
> NO se puede romper.

**Receta por módulo (5 pasos, repetibles):**
1. **CHECKPOINT** — git tag `dev-v2-<modulo>-pre` antes de empezar.
2. **SNAPSHOT del contrato** — listar los endpoints/props que el componente viejo usa HOY
   (el "contrato de conectores" — abajo doy el de cada módulo).
3. **CONSTRUIR NUEVO** — componente fresco con arquitectura limpia, llamando a los **MISMOS
   endpoints** (mismo contrato). Vive en paralelo (`XxxV2.js`).
4. **FLAG + CONVIVENCIA** — `REACT_APP_DEV_V2` (default OFF). Viejo y nuevo coexisten; usuarios
   reales siguen viendo V1 hasta verificar.
5. **VERIFICAR → RETIRAR** — correr `qa_journey_dev` + barrido de rutas + el "test de contrato"
   (que V2 pega a los mismos endpoints con las mismas formas). Si verde → prender flag → borrar V1.

**Por qué NO rompe:** (a) los conectores no cambian (mismo backend), (b) el flag permite A/B +
rollback instantáneo, (c) cada módulo es independiente (se migra de a uno), (d) build verde +
QA por módulo antes de retirar el viejo, (e) candado de tema evita regresión visual.

═══════════════════════════════════════════════════════════════════
## SETUP GLOBAL DE FASE 0 (una vez, antes de los módulos)
═══════════════════════════════════════════════════════════════════
☐ Tema claro único `.portal-dev` en PortalLayout + tokens (reusar patrón asesor-aurora) + candado `check-dev-theme.sh`.
☐ Flag `REACT_APP_DEV_V2` (gitignored, default OFF · igual que LEADS_V2/SIDEBAR_V2).
☐ Hub de navegación nuevo (navByRoleV2 dev) agrupando los 11 módulos de abajo.
☐ "Test de contrato" base: snapshot de los ~50 endpoints que el portal dev usa hoy (para verificar que V2 no pierde ninguno).
☐ Página centro = **Proyectos** (el equivalente al "Mis Leads").

═══════════════════════════════════════════════════════════════════
## LOS 11 MÓDULOS (consolida 34 páginas) · checklist por módulo
═══════════════════════════════════════════════════════════════════
Para CADA módulo aplicar los 5 pasos de arriba. Conectores = lo que hay que preservar.

### M1 · Dashboard / Panel
☐ Páginas: `DesarrolladorDashboard` (+ `InmobiliariaDashboard` por rol).
☐ Conectores: `/api/panel/weekly-brief`, `/api/panel/setup-progress`, `/api/notifications`.
☐ Rediseño: un dashboard por rol (dev vs inmobiliaria) · KPIs + brief + setup-progress.

### M2 · Proyectos (CENTRO) — con tabs internos
☐ Páginas: `MisProyectos` · `NuevoProyecto` · `ProyectoDetail` (5 endpoints, el más rico).
☐ Conectores: projects CRUD, `/api/projects/{id}/slots/availability`, branding.
☐ Tabs de ProyectoDetail (rediseñar cada uno): **Resumen · Inventario · Pricing · Demanda/IE · Landing · Leads-del-proyecto**.
☐ Es el módulo ancla → migrar primero y con más cuidado.

### M3 · Inventario / Unidades
☐ Página: `DesarrolladorInventario`. Conectores: units, holds, availability.
☐ Rediseño: grid de unidades + estado (disponible/apartada/vendida) + holds. (Ojo races: Fase 2.)

### M4 · Pricing  (CONSOLIDAR 2→1)
☐ Páginas: `DesarrolladorPricing` (2 endpoints) + `DesarrolladorPricingLab`.
☐ Conectores: `/api/dev/pricing-experiments`. Rediseño: un Pricing con tabs **Tabla · Lab/Experimentos**.

### M5 · Inteligencia (Demanda · Scores · Competencia · Battle Card) — tabs
☐ Páginas: `DesarrolladorDemanda` · `DesarrolladorIEDetail` · `DesarrolladorCompetidores` · `DeveloperBattleCard`.
☐ Conectores: demanda, IE scores, battle card. Rediseño: un módulo "Inteligencia" con 4 tabs.
☐ Verificar: que Demanda use data real (en asesor el heatmap era random) y Battle Card cuente bien (era datetime).

### M6 · CRM / Leads  (CONSOLIDAR 4→1)
☐ Páginas: `DesarrolladorCRM` · `DesarrolladorCRMShell` · `CrmFunnel` · `DesarrolladorLeads`.
☐ Conectores: leads, `/move-column`, `/heat`, `/conversation`, `/mark-lost`, attribution.
☐ Rediseño: un CRM con tabs **Embudo · Leads · Ficha** (reusar aprendizajes del board de asesor).

### M7 · Citas / Agenda  (CONSOLIDAR 3→1)
☐ Páginas: `DesarrolladorCitas` · `CitasPolicies` (6 endpoints) · `DesarrolladorCalendarioSubidas`.
☐ Conectores: appointments, `/api/appointments/policy/{id}`. Rediseño: tabs **Agenda · Políticas · Calendario subidas**.

### M8 · Red Comercial / Equipo  (CONSOLIDAR 6→1)
☐ Páginas: `AsesoresMetrics` · `MetricasEquipo` · `InmobiliariaAsesores` · `DesarrolladorRedComercial` · `AutoAssignments` · `DesarrolladorCrossPartnerships`.
☐ Conectores: `/api/inmobiliaria/asesores`, `/api/oauth/advisor-pool`, cross-partnerships, auto-assignments.
☐ Rediseño: un "Red Comercial" con tabs **Asesores · Inmobiliarias · Asignación auto · Cross-partnerships · Métricas**.

### M9 · Reportes / Finanzas — tabs
☐ Páginas: `DesarrolladorReportes` (2) + `DesarrolladorCashFlow`.
☐ Conectores: `/api/dev/reports/templates`, `/api/dev/reports/distributions`. Tabs **Reportes · CashFlow**.

### M10 · Operación (revisar exponer/esconder, como en asesor)
☐ Páginas: `DesarrolladorSolicitudes` · `DesarrolladorDisputas` (3) · `DesarrolladorLegajo` (4) · `DesarrolladorMiniMarket`.
☐ Decisión por página: ¿se expone, se renombra o se esconde? (en asesor eliminamos 3, renombramos 6).

### M11 · Configuración
☐ Páginas: `DesarrolladorConfiguracion` (3) · `DesarrolladorUsuarios` · `DesarrolladorSiteSelection` · branding/logo · OAuth Google.
☐ Conectores: settings, usuarios, `/api/orgs/me/branding`, `/api/oauth/*`. Tabs **General · Usuarios · Branding · Integraciones · Site Selection**.

═══════════════════════════════════════════════════════════════════
## GATES DE VERIFICACIÓN (antes de retirar CUALQUIER página vieja)
═══════════════════════════════════════════════════════════════════
☐ `yarn build` verde.
☐ El "test de contrato": V2 pega a los MISMOS endpoints que V1 (ningún conector perdido).
☐ Barrido de rutas (ningún 500 nuevo).
☐ `qa_journey_dev` (día del desarrollador) pasa con V2 encendido.
☐ Aislamiento: un 2º dev NO ve nada del primero (se valida en Fase 2, pero el flag permite probarlo).
☐ git tag `dev-v2-<modulo>-done` + commit. SOLO entonces borrar el componente viejo.

## ORDEN SUGERIDO de migración (de menor a mayor riesgo)
1. M1 Dashboard → 2. M9 Reportes → 3. M11 Config → 4. M4 Pricing → 5. M5 Inteligencia →
6. M3 Inventario → 7. M7 Citas → 8. M8 Red Comercial → 9. M6 CRM/Leads → 10. M2 Proyectos (ancla, al final con todo aprendido) → 11. M10 Operación (decidir exponer/esconder).

**Regla de oro:** un módulo a la vez · viejo y nuevo conviven tras el flag · NO se borra lo viejo
hasta que lo nuevo pase los gates · el backend NO se toca en Fase 0 (eso es Fases 1-4).
