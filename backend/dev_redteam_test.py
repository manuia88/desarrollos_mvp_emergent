"""
dev_redteam_test — Equipo rojo del portal Dev: verifica el AISLAMIENTO entre cuentas.
═══════════════════════════════════════════════════════════════════════════════
Patrón (reusa el de cerebro_redteam_test): dos desarrolladoras reales (orgA=quattro, orgB=lumbre).
orgB intenta ver/editar proyectos de orgA → DEBE bloquearse (403) y quedar registrado. orgA SÍ
puede con lo suyo (sanity). Es el candado de regresión: si una fuga vuelve, este test truena.

Correr:  scripts/.venv/bin/python backend/dev_redteam_test.py
(usa la DB real, etiqueta sus entradas con endpoint 'redteam:*' y las limpia al final).
"""
import asyncio
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(__file__))

from fastapi import HTTPException

import dev_guard
from tenant_scope import dev_can_access_project, user_dev_ids

_FAILS = []


def check(name: str, cond: bool):
    print(f"  {'✅' if cond else '❌'} {name}")
    if not cond:
        _FAILS.append(name)


def _user(tenant, uid):
    return SimpleNamespace(tenant_id=tenant, org_id=tenant, user_id=uid, role="developer_admin")


async def main():
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017")) \
        [os.environ.get("DB_NAME", "dmx_local")]

    A = _user("quattro", "uA")        # dueña de altavista-polanco / lomas-signature
    B = _user("lumbre", "uB")         # dueña de tamaulipas-89 / roma-norte-85 ...
    proj_A = "altavista-polanco"      # proyecto de A
    proj_B = "tamaulipas-89"          # proyecto de B

    print("\n── 1. Resolución de pertenencia (tenant_scope) ──")
    a_ids, b_ids = user_dev_ids(A), user_dev_ids(B)
    check("A ve su proyecto", proj_A in a_ids)
    check("B ve su proyecto", proj_B in b_ids)
    check("A NO ve el proyecto de B", proj_B not in a_ids)
    check("B NO ve el proyecto de A", proj_A not in b_ids)
    check("can_access(A, projA)=True", dev_can_access_project(A, proj_A))
    check("can_access(B, projA)=False", not dev_can_access_project(B, proj_A))

    print("\n── 2. Candado en mutación (IDOR) + bitácora ──")
    # B intenta editar una unidad del proyecto de A → debe lanzar 403 y registrar.
    blocked = False
    try:
        await dev_guard.guard_project(db, B, proj_A, "redteam:unit-status")
    except HTTPException as e:
        blocked = (e.status_code == 403)
    check("B bloqueada al tocar proyecto de A (403)", blocked)
    # A sí puede con lo suyo (no lanza).
    ok_self = True
    try:
        await dev_guard.guard_project(db, A, proj_A, "redteam:unit-status")
    except HTTPException:
        ok_self = False
    check("A pasa con su propio proyecto", ok_self)
    # El intento de B quedó en la bitácora.
    logged = await db.dev_access_log.count_documents(
        {"endpoint": "redteam:unit-status", "tenant": "lumbre", "allowed": False})
    check("intento de B registrado en la bitácora", logged >= 1)
    check("intento de A NO se registró (no es denegación)",
          await db.dev_access_log.count_documents({"endpoint": "redteam:unit-status", "tenant": "quattro"}) == 0)

    print("\n── 3. Resumen del dev (lo que ve A) ──")
    s = await dev_guard.dev_security_summary(db, A)
    check("A ve ≥1 intento bloqueado a SUS datos", s["intentos_bloqueados"] >= 1)
    check("A marcado como aislado", s["aislado"] is True)

    print("\n── 4. Centro de Seguridad (superadmin) ──")
    d = await dev_guard.cross_org_denials(db, days=1, limit=50)
    check("el Centro de Seguridad lista el intento", d["kpis"]["intentos_bloqueados"] >= 1)
    check("anomalía no inventada (verdicto presente)", "verdicto" in d["anomalia"])

    # Limpieza de las entradas de prueba.
    await db.dev_access_log.delete_many({"endpoint": {"$regex": "^redteam:"}})

    print("\n" + ("✅ TODOS LOS CANDADOS VERDES" if not _FAILS else f"❌ {len(_FAILS)} FALLA(S): {_FAILS}"))
    return 1 if _FAILS else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
