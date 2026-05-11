# Permissions Architecture · Dual-Source Documentation

**Estado**: deuda técnica conocida · resolución diferida post-launch.
**Última actualización**: 2026-05-11 · SHA descubrimiento `81800aa`.

---

## Resumen ejecutivo

El backend tiene **dos archivos** con funciones de permisos parcialmente duplicadas:

| Archivo | Naturaleza | Uso actual |
|---------|-----------|------------|
| `backend/permissions.py` | Moderna (Phase 13-18) | Checks de role genéricos + funciones únicas |
| `backend/routes/dev_batch4_2.py` | Legacy (Phase 4) | Endpoints de leads/kanban |

**Cero impacto operacional hoy**. **Riesgo medio a futuro** si nuevos endpoints importan la función equivocada.

---

## Funciones duplicadas (5)

Ambos archivos definen estas funciones con lógica DIFERENTE:

1. `can_view_kanban(user, scope, target_org_id)`
2. `can_move_lead(user, lead)`
3. `can_view_full_client_data(user, lead)`
4. `can_view_conversation(user, lead)`
5. `can_view_ai_summary(user, lead)`

Adicionalmente `get_user_permission_level(user)` también está duplicada.

### Diferencia clave

| Función | permissions.py (moderna) | routes/dev_batch4_2.py (legacy) |
|---------|-------------------------|--------------------------------|
| can_view_full_client_data | `lvl in (director+)` retorna True sin validar tenant_id | Valida `lead.dev_org_id == user.tenant_id` |
| can_move_lead | Director cross-tenant permitido | Director debe ser del mismo tenant + origin gate |
| get_user_permission_level | Mapeo explícito por role (developer_admin → developer_director · etc) | Usa `tenant_id` para inferir nivel + soporte `inmobiliaria_id` legacy |

---

## Regla obligatoria para developers + emergent

**Para gates de acceso a LEADS** (kanban, lead detail, lead move, conversation, AI summary):
```python
from routes.dev_batch4_2 import can_view_full_client_data, can_move_lead
```

**Para checks de role genéricos** (project edit, commercialization, inmobiliaria management, superadmin gates):
```python
from permissions import is_superadmin, can_edit_project, can_view_commercialization
```

**Si dudas**: revisar cómo lo hace `routes/dev_batch4_4.py:319` (modelo correcto · importa la versión estricta para gate de heat score).

---

## Funciones canónicas (solo en permissions.py)

Estas viven SOLO en `permissions.py` · usar siempre:

- `is_superadmin(user)`
- `is_dev_or_superadmin(user)`
- `can_edit_project(user)`
- `can_view_commercialization(user)`
- `can_manage_inmobiliaria(user, inmobiliaria_id)`
- `can_view_dev_inventory_exclusive(user, dev_org_id, is_authorized)`
- `can_view_engagement_metrics(user)`
- `can_invite_internal_user(user, org_id)`
- `can_modify_assigned_projects(user)`
- `can_view_org_internal_users(user, org_id)`
- `can_manage_cross_partnership(user, org_id)`
- `safe_path_param(value)`
- Constantes: `DEV_IN_HOUSE_ROLES`, `INM_IN_HOUSE_ROLES`

---

## Plan de consolidación post-launch (4-6h)

1. Decidir versión canónica:
   - Lógica de lead access → la estricta de `routes/dev_batch4_2.py`
   - Lógica de role mapping → la moderna de `permissions.py`
2. Mergear la mejor de ambas en `permissions.py`
3. `routes/dev_batch4_2.py`: eliminar las 6 funciones · agregar imports de `permissions.py`
4. Actualizar tests Wave 1 `test_permissions_unit.py` con asserts según versión canónica
5. Remover 2 xfail en `backend/tests/integration/test_tenant_isolation.py`
6. CI verde + dual-source warning eliminado de `permissions.py` docstring

**Pre-requisito antes de consolidar**:
- Tests integration completos que ejerciten endpoint `/api/leads/kanban` end-to-end con 2 tenants
- Validación manual UI kanban + lead detail + move en developer y inmobiliaria portal

---

## Vectores de bug si NO se consolida

1. Nuevo endpoint que use `can_view_full_client_data` para gate de leads:
   - Si importa de `permissions.py` (moderna laxa) → **leak cross-tenant** silencioso
   - Si importa de `routes/dev_batch4_2.py` (legacy estricta) → ✅ correcto

2. Refactor que mueva tools de leads de un módulo a otro:
   - Si el nuevo módulo usa imports más "modernos" (`from permissions import...`) → introduce bug

3. Tests Wave 1 (`test_permissions_unit.py`) verifican lógica laxa:
   - Si alguien "consolida" sin actualizar tests → tests rompen

---

## Mitigación activa (mientras no se consolida)

1. **Warning en `permissions.py` docstring** ✅ aplicado SHA TBD
2. **Regla en prompt template emergent** ✅ aplicado `memory/feedback_emergent_prompt_template.md`
3. **Test xfail** marcado en `tests/integration/test_tenant_isolation.py` ✅ aplicado SHA `81800aa`
4. **BACKLOG entry** ✅ persistido `memory/BACKLOG_ENHANCEMENTS.md`
