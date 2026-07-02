#!/usr/bin/env python3
"""[DEPLOY] Endurecimiento de la DB de PRODUCCIÓN en UN solo comando (idempotente · dry-run por defecto).

Hace las 2 acciones de base de datos del checklist de deploy post-auditoría:

  PASO A · [AUD-023b] Aislar developers antiguos sin tenant propio:
     developer_admin con tenant_id None/'default'/ausente → `org_{user_id}` (cierra el IDOR cross-tenant).

  PASO B · Borrar SOLO las 2 cuentas demo con password público (backdoor si la DB de prod se seedeó
     alguna vez con DMX_DEV_MODE=true): `asesor@demo.com` (user_asesor_0001) y `developer@demo.com`
     (user_dev_0001), + la fila del asesor demo en inmobiliaria_internal_users.
     NUNCA toca `admin@desarrollosmx.io`: ese es el SUPERADMIN REAL (default de ADMIN_EMAIL). Para
     ese, rota su contraseña por env (ADMIN_PASSWORD) — este script solo te lo recuerda.

SEGURIDAD: idempotente (correrlo 2 veces no cambia nada la 2ª). DRY-RUN por defecto; --apply para escribir.
Lee la conexión de las MISMAS env-vars que el server (MONGO_URL, DB_NAME) → córrelo en el shell de prod;
NO tienes que pasar secretos por ningún lado.

Uso (en el entorno de PRODUCCIÓN, con MONGO_URL/DB_NAME ya seteadas):
  python3 backend/scripts/prod_db_hardening.py            # dry-run: muestra qué haría
  python3 backend/scripts/prod_db_hardening.py --apply     # aplica
"""
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

APPLY = "--apply" in sys.argv

# Cuentas demo a borrar (email + user_id del seed, para máxima precisión). El admin NO está aquí a propósito.
DEMO_ACCOUNTS = [
    {"email": "asesor@demo.com", "user_id": "user_asesor_0001"},
    {"email": "developer@demo.com", "user_id": "user_dev_0001"},
]
ADMIN_EMAIL_DEFAULT = "admin@desarrollosmx.io"


async def paso_a_aislar_tenants(db) -> None:
    print("\n─── PASO A · aislar developers sin tenant propio (AUD-023b) ───")
    q = {"role": "developer_admin",
         "$or": [{"tenant_id": None}, {"tenant_id": "default"}, {"tenant_id": {"$exists": False}}]}
    n = await db.users.count_documents(q)
    print(f"  developer_admin sin tenant propio: {n}")
    if not n:
        print("  nada que aislar ✓")
        return
    migrated = 0
    async for u in db.users.find(q, {"_id": 0, "user_id": 1, "email": 1}):
        uid = u.get("user_id")
        if not uid:
            continue
        print(f"    {u.get('email','?')}  ->  tenant_id=org_{uid}")
        if APPLY:
            await db.users.update_one({"user_id": uid}, {"$set": {"tenant_id": f"org_{uid}"}})
            migrated += 1
    print(f"  {'aislados' if APPLY else 'se aislarían'}: {migrated if APPLY else n}")


async def paso_b_borrar_demo(db) -> None:
    print("\n─── PASO B · borrar cuentas demo con password público ───")
    for acc in DEMO_ACCOUNTS:
        found = await db.users.find_one(
            {"email": acc["email"], "user_id": acc["user_id"]}, {"_id": 0, "email": 1, "role": 1})
        if not found:
            print(f"  {acc['email']}: no existe ✓ (nada que borrar)")
            continue
        print(f"  {acc['email']} (role={found.get('role')}): BORRAR")
        if APPLY:
            await db.users.delete_one({"email": acc["email"], "user_id": acc["user_id"]})
            # limpiar la fila del roster del asesor demo (si aplica)
            r = await db.inmobiliaria_internal_users.delete_many({"user_id": acc["user_id"]})
            if r.deleted_count:
                print(f"      + {r.deleted_count} fila(s) en inmobiliaria_internal_users")
    # Recordatorio sobre el admin real (NO se borra)
    admin_email = os.environ.get("ADMIN_EMAIL", ADMIN_EMAIL_DEFAULT)
    admin = await db.users.find_one({"email": admin_email}, {"_id": 0, "email": 1, "role": 1})
    if admin:
        print(f"\n  ⚠ {admin_email} (role={admin.get('role')}) es tu SUPERADMIN REAL — NO se borra.")
        print(f"    Asegúrate de haber seteado ADMIN_PASSWORD en prod (el default 'Admin2026!' es público).")


async def main():
    uri = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = os.environ.get("DB_NAME", "desarrollosmx")
    print(f"[prod_db_hardening] db={dbname}  modo={'APPLY' if APPLY else 'DRY-RUN'}")
    db = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)[dbname]
    await paso_a_aislar_tenants(db)
    await paso_b_borrar_demo(db)
    if not APPLY:
        print("\n[prod_db_hardening] DRY-RUN — re-corre con --apply para escribir.")
    else:
        print("\n[prod_db_hardening] listo ✓")


if __name__ == "__main__":
    asyncio.run(main())
