# Permissions Architecture · post-consolidación 2026-05-13

**Estado**: ✅ **CONSOLIDADO** · deuda dual-source resuelta.
**Última actualización**: 2026-05-13 (commit pendiente).

---

## Resumen ejecutivo

El backend separa permission helpers en **2 archivos** con responsabilidades **claras**:

| Archivo | Responsabilidad | Cuándo usar |
|---------|-----------------|-------------|
| `backend/permissions.py` | Role-level genérico (cross-portal · cross-feature) | `is_superadmin` · `can_edit_project` · `can_view_commercialization` · `can_manage_inmobiliaria` · `safe_path_param` · etc |
| `backend/routes/dev_batch4_2.py` | Lead-gates tenant-aware (CRM leads/kanban específico) | `can_view_kanban` · `can_move_lead` · `can_view_full_client_data` · `can_view_conversation` · `can_view_ai_summary` |

**Cero duplicación de funciones**. Cada helper vive en un solo archivo · sin overlap.

---

## Historia · por qué dos archivos

**Phase 4 (Q4 2025)**: helpers se construyeron en `routes/dev_batch4_2.py` (Universal LeadKanban · client_id cross-project · Permission Tiers).

**Phase 14 Batch 37 (Q1 2026)**: `permissions.py` se creó para extraer checks de role-level genéricos (in-house user roles · cross-org partnerships). Por mistake se duplicaron 5 funciones de leads con lógica más laxa (sin validación tenant_id).

**Resultado pre-consolidación**: 5 funciones zombie en `permissions.py` que NUNCA se usaron en producción (solo tests Wave 1 las importaban). Los endpoints reales siempre usaron `routes/dev_batch4_2.py`.

**Consolidación 2026-05-13** (Etapa 3 tech-debt cleanup):
- Eliminadas las 5 funciones zombie de `permissions.py`
- `tests/wave1/test_permissions_unit.py` actualizado: importa lead-gates desde `routes/dev_batch4_2.py`
- `tests/integration/test_tenant_isolation.py` actualizado: eliminados los 2 xfail markers (ahora los tests pasan canónicamente)
- Docstring `permissions.py` actualizado con scope claro

---

## Lead-gates canónicos (en `routes/dev_batch4_2.py`)

Estos validan **tenant + ownership** correctamente:

### `can_view_kanban(user, scope, target_org_id="")`
- `scope="mine"`: True para asesor freelance · inmobiliaria member/director · developer member/director
- `scope="all_org"`: True SOLO si `lvl=developer_director` AND `target_org_id == user.tenant_id`
- `scope="all_inmobiliaria"`: True SOLO si `lvl=inmobiliaria_director` AND `target_org_id == user.inmobiliaria_id`

### `can_move_lead(user, lead)`
- Owner check: `lead.assigned_to == user.user_id` OR `lead.created_by == user.user_id` → True
- Director: `lead.dev_org_id == user.tenant_id` AND `lead.origin.type in (dev_direct, dev_inhouse)` → True
- Inmobiliaria director: `lead.inmobiliaria_id == user.inmobiliaria_id` → True
- Otros → False

### `can_view_full_client_data(user, lead)`
- Superadmin → True
- Owner (`assigned_to/created_by == user_id`) → True
- Dev director con `lead.dev_org_id == user.tenant_id` → True
- Inm director con `lead.inmobiliaria_id == user.inmobiliaria_id` → True
- Otros → False

### `can_view_conversation(user, lead)` y `can_view_ai_summary(user, lead)`
Lógica similar · misma protección tenant-aware.

---

## Role-level helpers (en `permissions.py`)

Estos NO requieren contexto de lead específico · operan solo sobre el user:

- `is_superadmin(user)` · `is_dev_or_superadmin(user)`
- `can_edit_project(user)` · `can_view_full_project_data(user)`
- `can_view_commercialization(user)` · `can_view_engagement_metrics(user)`
- `can_manage_inmobiliaria(user, inmobiliaria_id)`
- `can_view_dev_inventory_exclusive(user, dev_org_id, is_authorized)`
- `can_view_org_internal_users(user, org_id)` · `can_invite_internal_user(user, org_id)`
- `can_manage_cross_partnership(user, org_id)`
- `safe_path_param(value)` (helper utilidad)
- Constantes: `DEV_IN_HOUSE_ROLES` · `INM_IN_HOUSE_ROLES`

---

## Regla para developers + emergent (post-consolidación)

**Para gates de acceso a LEADS** (kanban · lead detail · move · conversation · AI summary):
```python
from routes.dev_batch4_2 import can_view_full_client_data, can_move_lead
```

**Para checks de role genéricos** (project edit · commercialization · inmobiliaria management · superadmin gates):
```python
from permissions import is_superadmin, can_edit_project, can_view_commercialization
```

**Cero importación de lead-gates desde `permissions.py`** · ya no existen ahí.

---

## Tests cobertura

- `tests/wave1/test_permissions_unit.py` · 23 tests · cubre role-level helpers + lead-gates (importa desde fuente correcta)
- `tests/integration/test_tenant_isolation.py` · 30 tests · 20 vectores de ataque cross-tenant · sin xfail post-consolidación

---

## Validación post-consolidación

Si en el futuro alguien intenta importar `can_view_kanban` etc desde `permissions` → **ImportError inmediato**. Imposible introducir bug silencioso por importar la versión equivocada.
