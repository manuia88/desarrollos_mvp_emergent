# Onboarding Tour Audit — DesarrollosMX
Generado: 2026-02-05

---

## 1. Estado de targets (data-testid) por tour

### Tour: `dev_first_login` (role: developer_admin / developer_member)

| Step | Target selector | ¿Existe en DOM? |
|------|----------------|-----------------|
| 1 | `[data-testid="portal-layout"]` | SI — PortalLayout.js:311 |
| 2 | `[data-testid="portal-sidebar"]` | SI — PortalLayout.js:405 |
| 3 | `[data-testid="nav-item-proyectos"]` | SI — navByRole key:"proyectos", genera testid via NavItem |
| 3 | `[data-testid="nav-item-mis_proyectos"]` | NO — key es "proyectos" no "mis_proyectos" (navByRole.js:28) |
| 4 | `[data-testid="nuevo-proyecto-btn"]` | SI — confirmado en grep |
| 4 | `[data-testid="search-trigger-btn"]` | SI — PortalLayout topbar |
| 5 | `[data-testid="nav-item-crm"]` | SI — navByRole.js:29 |
| 5 | `[data-testid="nav-item-leads"]` | SI — inmobiliaria nav (comparte con asesor admin) |
| 6 | `[data-testid="diagnostic-widget"]` | NO — no existe. Fallback: portal-topbar |
| 6 | `[data-testid="portal-topbar"]` | SI — PortalLayout.js header |
| 7 | `[data-testid="search-trigger-btn"]` | SI |

**Gaps**: `nav-item-mis_proyectos` (usar solo `nav-item-proyectos`) y `diagnostic-widget` (sin impacto por fallback `portal-topbar`).

---

### Tour: `asesor_first_login` (role: advisor / asesor_admin)

| Step | Target selector | ¿Existe en DOM? |
|------|----------------|-----------------|
| 1 | `[data-testid="portal-layout"]` | SI |
| 2 | `[data-testid="nav-item-busquedas"]` | SI — navByRole.js:71 |
| 2 | `[data-testid="nav-item-contactos"]` | SI — navByRole.js:70 |
| 3 | `[data-testid="nav-item-citas"]` | SI — navByRole.js:72 |
| 3 | `[data-testid="nav-item-configuracion"]` | SI — navByRole.js:54 |
| 4 | `[data-testid="nav-item-contactos"]` | SI |
| 5 | `[data-testid="portal-topbar"]` | SI |

**Gaps**: Ninguno crítico.

---

### Tour: `inmobiliaria_first_login` (role: inmobiliaria_admin / inmobiliaria_member)

| Step | Target selector | ¿Existe en DOM? |
|------|----------------|-----------------|
| 1 | `[data-testid="portal-layout"]` | SI |
| 2 | `[data-testid="nav-item-dashboard"]` | SI — navByRole.js:105 |
| 2 | `[data-testid="portal-topbar"]` | SI |
| 3 | `[data-testid="nav-item-asesores"]` | SI — navByRole.js:118 |
| 3 | `[data-testid="portal-sidebar"]` | SI |
| 4 | `[data-testid="portal-main"]` | SI — PortalLayout.js main |
| 5 | `[data-testid="nav-item-reportes"]` | NO para inmobiliaria (no tiene este nav item). Fallback: portal-topbar |
| 5 | `[data-testid="portal-topbar"]` | SI |

**Gaps**: `nav-item-reportes` no existe en nav de inmobiliaria. Sin impacto crítico (fallback `portal-topbar`).

---

### Tour: `comprador_first_login` (role: buyer)

| Step | Target selector | ¿Existe en DOM? |
|------|----------------|-----------------|
| 1 | `body` | SI |
| 2 | `[data-testid="search-bar"]` | NO — Marketplace.js no tiene este testid |
| 2 | `[data-testid="marketplace-search"]` | NO — AGREGADO en este batch (Marketplace.js) |
| 3 | `[data-testid="property-card"]` | NO — no existe |
| 3 | `[data-testid="development-card"]` | NO — AGREGADO en este batch (Marketplace.js) |
| 4 | `[data-testid="portal-topbar"]` | NO para buyers (no usan PortalLayout) |
| 4 | `body` | SI (fallback) |

**Gaps críticos**: `marketplace-search`, `development-card` — AGREGADOS en este batch.
**Gap structural**: Buyers usan Marketplace.js, NO PortalLayout. Joyride en PortalLayout nunca dispara para compradores.
**Fix**: TourLauncher global en App.js cubre este gap (fuera de PortalLayout).

---

### Tour: `dev_post_first_project` (role: developer_admin, trigger manual)

| Step | Target selector | ¿Existe en DOM? |
|------|----------------|-----------------|
| 1 | `[data-testid="portal-main"]` | SI |
| 2 | `[data-testid="nav-item-reportes"]` | SI — navByRole.js:40 (developer tiene "reportes") |
| 2 | `[data-testid="portal-sidebar"]` | SI |
| 3 | `[data-testid="nav-item-crm"]` | SI |
| 3 | `[data-testid="nav-item-leads"]` | SI |
| 4 | `[data-testid="search-trigger-btn"]` | SI |

**Gaps**: Ninguno crítico.

---

## 2. OnboardingGate — uso actual

- **SÍ está siendo usado**: `/app/frontend/src/components/advisor/AdvisorLayout.js` línea 73
- Activa cuando `profile` existe pero aún no tiene `full_name`, bloqueando el portal asesor.
- **NO está montado en otros portales** (developer, inmobiliaria, buyer). Es exclusivo del flujo de asesor.

---

## 3. TourCompletionAnalytics — disponibilidad para superadmin

- **SÍ está montado** en `/app/frontend/src/pages/developer/MetricasEquipo.js` línea 67.
- **Ruta accesible**: `/desarrollador/crm/metricas-equipo` (sólo developer_admin).
- **NO estaba accesible para superadmin** antes de este batch.
- **Fix aplicado**: Ruta `/superadmin/onboarding-analytics` + nav item añadidos en este batch.

---

## 4. Campo `tour_completions` en /api/preferences/me

- **Campo correcto**: `tours_completed` (no `tour_completions` — plural + guión bajo)
- **Confirmado** en `dev_batch18.py` línea 34: `"tours_completed": []`
- `dev_batch18.py` GET endpoint retorna `tours_completed` y `tours_dismissed` ✓
- `dev_batch19.py` POST `/tour-complete` usa `$addToSet` en `tours_completed` ✓
- `dev_batch19.py` POST `/tour-dismiss` usa `$addToSet` en `tours_dismissed` ✓
- **Gap**: No existe endpoint para resetear `tours_completed: []`. PATCH /preferences/me no incluye este campo.
- **Workaround**: Botón "Reiniciar tour" usa `localStorage.setItem('dmx_restart_tour', '1')` + `window.location.reload()`. TourLauncher detecta el flag y fuerza el tour independientemente del estado backend.
