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


def tenant_of(user) -> str:
    """Org/tenant del usuario. Punto ÚNICO de resolución (antes: _tenant en N archivos)."""
    return (getattr(user, "tenant_id", None)
            or getattr(user, "org_id", None)
            or "default")


def is_superadmin(user) -> bool:
    return getattr(user, "role", None) in SUPERADMIN_ROLES


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
