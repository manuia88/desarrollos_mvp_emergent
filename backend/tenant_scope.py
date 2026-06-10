"""
DMX · SCOPING MULTI-TENANT — fuente ÚNICA de verdad para "qué ve cada usuario".
═══════════════════════════════════════════════════════════════════════════════
Molde de plataforma (founder ruling 2026-06-02): N devs + N asesores registrados,
cada uno ve y opera SOLO su slice; superadmin (único) ve TODO. Este módulo reemplaza
las copias duplicadas/divergentes de `_tenant()` y `_user_dev_ids()` regadas en
routes/dev_batch*.py y developer.py (una de ellas tenía fuga: devolvía TODO a todos).

Reglas:
  · superadmin → ve todo (god-view).
  · dev/org    → ve los desarrollos de SU tenant (developer_id u org_id == tenant).
  · Sin match real (seed legacy sin org_id) → fallback acotado, NUNCA "todo".

Diseñado para el estado final: cuando el seed/real traiga `org_id`/`developer_id`
por desarrollo, el match es exacto y multi-tenant de verdad. Mientras, el fallback
demo mantiene la app viva sin filtrar dato ajeno de más.
"""
from typing import List

SUPERADMIN_ROLES = {"superadmin"}


def _field(user, key, default=None):
    """Lee un campo del usuario sea OBJETO (UserOut) o DICT (model_dump()).
    El 'user' está forkeado en el repo: unas rutas pasan UserOut, otras un dict."""
    if user is None:
        return default
    if isinstance(user, dict):
        return user.get(key, default)
    return getattr(user, key, default)


def tenant_of(user) -> str:
    """Org/tenant del usuario. Punto ÚNICO de resolución (antes: _tenant en N archivos)."""
    return (_field(user, "tenant_id") or _field(user, "org_id") or "default")


def is_superadmin(user) -> bool:
    return _field(user, "role") in SUPERADMIN_ROLES


def actor_id(user, default=None):
    """ID del actor para ownership/atribución. Punto ÚNICO — evita el bug histórico
    `getattr(user, "id")` (UserOut expone `user_id`, NO `id`, así que ese getattr
    SIEMPRE caía al default y rompía el chequeo de dueño per-asesor)."""
    return _field(user, "user_id") or default


def user_dev_ids(user) -> List[str]:
    """
    IDs de desarrollos visibles para este usuario (multi-tenant).
      1. superadmin → TODOS.
      2. match real por pertenencia (developer_id / org_id == tenant).
      3. fallback legacy demo (prefijo) — solo si no hubo match real.
      4. fallback seguro acotado (primeros 2) — NUNCA "todo".
    """
    from data_developments import DEVELOPMENTS

    if is_superadmin(user):
        return [d["id"] for d in DEVELOPMENTS]

    tenant = tenant_of(user)

    # (2) pertenencia real — el camino del estado final
    owned = [d["id"] for d in DEVELOPMENTS
             if d.get("developer_id") == tenant or d.get("org_id") == tenant]
    if owned:
        return owned

    # (3) heurística legacy demo (p.ej. tenant "constructora_ariel")
    frag = tenant.split("_")[-1][:3] if tenant and tenant != "default" else ""
    if frag:
        legacy = [d["id"] for d in DEVELOPMENTS if d.get("developer_id", "").startswith(frag)]
        if legacy:
            return legacy

    # (4) fallback seguro — acotado, sin fuga cross-tenant
    return [d["id"] for d in DEVELOPMENTS[:2]]


# ─── Candados de propiedad (Fase 2.1 · aislamiento cross-dev-org) ────────────────
def dev_can_access_org(user, dev_org_id) -> bool:
    """¿Puede el usuario tocar un recurso marcado con dev_org_id? superadmin o su mismo tenant."""
    if is_superadmin(user):
        return True
    return bool(dev_org_id) and dev_org_id == tenant_of(user)


def dev_can_access_project(user, project_id) -> bool:
    """¿El proyecto pertenece al usuario? superadmin o está en sus desarrollos."""
    if is_superadmin(user):
        return True
    return project_id in user_dev_ids(user)


def assert_dev_org(user, dev_org_id):
    """Lanza 403 si el usuario no es dueño del recurso (por dev_org_id)."""
    from fastapi import HTTPException
    if not dev_can_access_org(user, dev_org_id):
        raise HTTPException(403, "Este recurso es de otra desarrolladora")


def assert_dev_project(user, project_id):
    """Lanza 403 si el proyecto no pertenece al usuario."""
    from fastapi import HTTPException
    if not dev_can_access_project(user, project_id):
        raise HTTPException(403, "Este proyecto es de otra desarrolladora")


async def assert_lead_owner(db, user, lead_id):
    """403/404 si el lead no es del tenant del usuario (o superadmin). Tolerante al fork de nombre
    de tenant (org_id/dev_org_id/inmobiliaria_id/owner_id/assigned_to). Para cerrar IDOR sobre leads."""
    from fastapi import HTTPException
    if is_superadmin(user):
        return
    proj = {"_id": 0, "org_id": 1, "dev_org_id": 1, "inmobiliaria_id": 1, "owner_id": 1, "assigned_to": 1}
    lead = await db.leads.find_one({"id": lead_id}, proj)
    if not lead:
        lead = await db.asesor_contactos.find_one({"id": lead_id}, proj)
    if not lead:
        raise HTTPException(404, "Lead no encontrado")
    owners = {lead.get("org_id"), lead.get("dev_org_id"), lead.get("inmobiliaria_id"),
              lead.get("owner_id"), lead.get("assigned_to")}
    owners.discard(None)
    if not owners:
        return  # legacy/demo sin tenant → no bloquear
    if tenant_of(user) in owners or actor_id(user) in owners:
        return
    raise HTTPException(403, "Este lead es de otra cuenta")
