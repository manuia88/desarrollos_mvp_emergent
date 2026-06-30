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
import os
from typing import List

SUPERADMIN_ROLES = {"superadmin"}


def _demo_mode() -> bool:
    """En demo/dev (DMX_DEV_MODE=true) los fallbacks acotados mantienen viva la app con seed
    sin org_id. En producción NO aplican: el aislamiento es fail-closed (regla 5)."""
    return os.environ.get("DMX_DEV_MODE", "false").strip().lower() == "true"


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

    # (4) fallback: SOLO en demo (DMX_DEV_MODE) un slice acotado mantiene viva la app con seed
    #     sin org_id. En producción NIEGA (fail-closed, regla 5): sin tenant real → nada ajeno.
    if _demo_mode():
        return [d["id"] for d in DEVELOPMENTS[:2]]
    return []


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
        # Lead sin dueño: en demo no bloquea; en producción NIEGA (fail-closed, regla 5).
        if _demo_mode():
            return
        raise HTTPException(403, "Lead sin dueño asignado")
    if tenant_of(user) in owners or actor_id(user) in owners:
        return
    raise HTTPException(403, "Este lead es de otra cuenta")


async def assert_db_project_owner(db, user, project_id, *, not_found="Proyecto no encontrado"):
    """Db-aware: 403/404 si el proyecto (db.projects o db.developments) no es del tenant del
    usuario. Úsalo para proyectos creados en BD (wizard), donde assert_dev_project — que valida
    contra el SEED en memoria — daría falso 403 al dueño legítimo."""
    from fastapi import HTTPException
    if is_superadmin(user):
        return
    proj = await db.projects.find_one(
        {"id": project_id}, {"_id": 0, "dev_org_id": 1, "tenant_id": 1})
    if not proj:
        proj = await db.developments.find_one(
            {"id": project_id},
            {"_id": 0, "dev_org_id": 1, "tenant_id": 1, "developer_id": 1, "org_id": 1})
    if not proj:
        raise HTTPException(404, not_found)
    owners = {proj.get("dev_org_id"), proj.get("tenant_id"),
              proj.get("developer_id"), proj.get("org_id")}
    owners.discard(None)
    if not owners:
        if _demo_mode():
            return
        raise HTTPException(403, "Proyecto sin dueño asignado")
    if tenant_of(user) in owners:
        return
    raise HTTPException(403, "Este proyecto es de otra desarrolladora")


# ─── Eje INMOBILIARIA (paralelo al eje dev-org) ─────────────────────────────────
def inm_of(user) -> str:
    """Inmobiliaria del usuario. Punto único de resolución del eje inmobiliaria."""
    return (_field(user, "inmobiliaria_id") or _field(user, "tenant_id")
            or _field(user, "org_id") or "default")


def assert_inm_owner(user, inmobiliaria_id):
    """403 si el usuario no pertenece a esa inmobiliaria (o superadmin). Cierra el eje inmobiliaria
    (create/patch/delete/list de usuarios internos). En demo NO bloquea (un solo tenant dmx_root);
    en producción es fail-closed (regla 5)."""
    from fastapi import HTTPException
    if is_superadmin(user):
        return
    if inmobiliaria_id and inmobiliaria_id == inm_of(user):
        return
    if _demo_mode():
        return
    raise HTTPException(403, "Esta inmobiliaria es de otra cuenta")


# ─── Candado 2 (anti-parches) · filtro de tenant EXPLÍCITO y componible ─────────
# Qué campo(s) cargan al dueño en cada colección (un doc pertenece al tenant si CUALQUIERA empata).
_OWNER_FIELDS = {
    "leads": ("dev_org_id", "org_id", "inmobiliaria_id", "owner_id", "assigned_to"),
    "asesor_contactos": ("owner_id", "org_id", "dev_org_id", "assigned_to"),
    "asesor_busquedas": ("owner_id", "org_id", "dev_org_id"),
    "appointments": ("dev_org_id", "asesor_id"),
    "operaciones": ("dev_org_id", "owner_id", "asesor_id"),
    # asesor_operaciones (DINERO · comisiones/cierres por asesor) — el doc carga al dueño
    # en owner_id; los motores de health/coaching también lo escriben con asesor_user_id/asesor_id.
    "asesor_operaciones": ("owner_id", "asesor_user_id", "asesor_id", "dev_org_id"),
    "tareas": ("owner_id", "asesor_id", "dev_org_id"),
    "asesor_tareas": ("user_id", "owner_id", "asesor_id"),
    # weekly_briefs (BRIEF ejecutivo semanal) — pertenece a la inmobiliaria (tenant) y al usuario.
    "weekly_briefs": ("inmobiliaria_id", "org_id", "user_id"),
    "report_templates": ("dev_org_id",),
    "report_files": ("dev_org_id",),
    "tracking_links": ("asesor_id", "tenant_id", "dev_org_id"),
    "inmobiliaria_internal_users": ("inmobiliaria_id",),
    "developer_unit_overrides": ("dev_org_id", "dev_id"),
    "bulk_upload_jobs": ("dev_org_id",),
    "cash_flow_forecasts": ("dev_org_id",),
}

# Colecciones SENSIBLES cuya pertenencia es INDIRECTA (keyed por entity_type+entity_id, donde
# entity_id es un lead/asesor/project ajeno) — NO tienen owner-field propio. Registrarlas en
# _OWNER_FIELDS daría falsa seguridad (en prod fail-closed romperían toda lectura legítima). Sus
# lecturas SE ACOTAN aguas-arriba por el entity_id que el caller ya tiene autorizado (health_score,
# insights, copilot_context, team_aggregated acotan entity_id al pool del tenant). Listadas aquí
# para que el guard de CI sepa que su scope vive en el caller, no en tenant_filter().
_OWNER_BY_ENTITY = ("health_scores", "health_scores_snapshots")


def tenant_filter(user, collection: str) -> dict:
    """Devuelve el filtro Mongo que acota `collection` al tenant del usuario. superadmin → {} (god-view).

    La traducción HONESTA de "RLS siempre ON" a Mongo (NO un proxy mágico, que en Mongo deja fuera
    aggregate/bulk_write/count = falsa seguridad). Es EXPLÍCITO (se mete a mano en la query),
    AUDITEABLE (el audit del Candado 1 lo reconoce como guard), y COMPONE con todo:
        db.leads.find({**tenant_filter(user, "leads"), "status": "nuevo"})
        db.leads.aggregate([{"$match": tenant_filter(user, "leads")}, ...])
    Combina sobre los owner-fields de la colección (un doc pertenece si CUALQUIERA empata el tenant
    o el actor). Colección sin dueño conocido → {} (no rompe; el audit marca el acceso crudo)."""
    if is_superadmin(user):
        return {}
    fields = _OWNER_FIELDS.get(collection)
    if not fields:
        return {}
    vals = [v for v in (tenant_of(user), actor_id(user)) if v]
    if not vals:
        return {} if _demo_mode() else {"_tenant_no_match": True}  # prod fail-closed: no devuelve nada
    return {"$or": [{f: {"$in": vals}} for f in fields]}


# Conjunto canónico de colecciones SENSIBLES (PII/dinero/dashboards/briefs/métricas por tenant).
# Fuente única para el guard de CI: toda lectura de una de estas DEBE pasar por tenant_filter()
# (scope directo) o estar acotada aguas-arriba por un entity_id ya autorizado del tenant (las de
# _OWNER_BY_ENTITY). Mantener en sync al registrar una colección nueva en _OWNER_FIELDS.
SENSITIVE_COLLECTIONS = frozenset(_OWNER_FIELDS.keys()) | frozenset(_OWNER_BY_ENTITY)


def is_sensitive_collection(collection: str) -> bool:
    """¿La colección requiere scope de tenant? Helper para el guard de CI y auditorías."""
    return collection in SENSITIVE_COLLECTIONS


# ═══════════════════════════════════════════════════════════════════════════════
# REGLA DE CI · AISLAMIENTO MULTI-TENANT (Candado 2 · C3 — adopción de tenant_filter)
# ═══════════════════════════════════════════════════════════════════════════════
# INVARIANTE: toda lectura (find / find_one / count_documents / aggregate) sobre una colección
# SENSIBLE (ver SENSITIVE_COLLECTIONS / _OWNER_FIELDS) DEBE estar acotada al tenant del usuario.
# Dos formas válidas y sólo dos:
#   1. SCOPE DIRECTO — mezclar tenant_filter(user, "<col>") en el filtro de la query:
#          db.<col>.find({**tenant_filter(user, "<col>"), ...})
#          db.<col>.aggregate([{"$match": tenant_filter(user, "<col>")}, ...])
#   2. SCOPE POR ENTITY (sólo _OWNER_BY_ENTITY, p.ej. health_scores) — el filtro acota por un
#      entity_id que el caller YA autorizó como suyo (lead/asesor/project de su tenant). El scope
#      vive en el caller; tenant_filter NO aplica porque el doc no tiene owner-field propio.
# superadmin conserva god-view (tenant_filter → {} ). Fail-soft: colección sin dueño → no rompe.
# EXCEPCIÓN legítima: jobs de fondo/sin usuario (snapshots, reconcile, schedulers) que barren TODO
# por diseño; deben marcarse con un comentario explícito en el callsite.
#
# Cómo lo audita CI (grep en backend/routes + motores):
#   busca  db.<col>.(find|find_one|count_documents|aggregate)   para cada col en SENSITIVE_COLLECTIONS
#   y exige que el filtro contenga  tenant_filter(  ó  un campo de _OWNER_FIELDS[col] / entity_id.
# Falla la build si una lectura sensible corre SIN scope y SIN el comentario de excepción.
# (Excluidos por estar ya scopeados: routes/dev_batch14.py, routes/dev_batch15.py.)
