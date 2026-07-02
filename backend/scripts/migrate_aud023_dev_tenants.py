#!/usr/bin/env python3
"""[AUD-023b] Migración idempotente: aísla devs auto-registrados que quedaron sin tenant propio.

CONTEXTO: antes del fix AUD-023, /api/auth/register creaba developer_admin con tenant_id=None →
tenant_of() cae al sentinel COMPARTIDO 'default' → todos esos devs se veían/tocaban datos entre sí
(IDOR cross-tenant). El fix ya provisiona org_{user_id} para NUEVOS devs; esta migración cierra el
hueco de los EXISTENTES: a cada developer_admin con tenant_id None/'default'/ausente le asigna su
tenant propio `org_{user_id}`.

SEGURIDAD: solo toca users con role=developer_admin y tenant vacío/'default' (NO toca devs que ya
tienen un tenant real, NI otros roles). Idempotente: correrla 2 veces no cambia nada la 2ª vez.
DRY-RUN por defecto; pasar --apply para escribir.

Uso:
  scripts/.venv/bin/python3 backend/scripts/migrate_aud023_dev_tenants.py          # dry-run
  scripts/.venv/bin/python3 backend/scripts/migrate_aud023_dev_tenants.py --apply   # aplica
"""
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

APPLY = "--apply" in sys.argv


async def main():
    uri = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = os.environ.get("DB_NAME", "desarrollosmx")
    db = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=4000)[dbname]
    q = {"role": "developer_admin",
         "$or": [{"tenant_id": None}, {"tenant_id": "default"}, {"tenant_id": {"$exists": False}}]}
    n = await db.users.count_documents(q)
    print(f"[migrate AUD-023b] developer_admin sin tenant propio: {n}  (modo: {'APPLY' if APPLY else 'DRY-RUN'})")
    if not n:
        print("  nada que migrar ✓")
        return
    migrated = 0
    async for u in db.users.find(q, {"_id": 0, "user_id": 1, "email": 1}):
        uid = u.get("user_id")
        if not uid:
            continue
        new_tenant = f"org_{uid}"
        print(f"  {u.get('email','?')}  ->  tenant_id={new_tenant}")
        if APPLY:
            await db.users.update_one({"user_id": uid}, {"$set": {"tenant_id": new_tenant}})
            migrated += 1
    if APPLY:
        print(f"[migrate AUD-023b] listo · {migrated} devs aislados a su tenant propio.")
    else:
        print("[migrate AUD-023b] DRY-RUN — re-corre con --apply para escribir.")


if __name__ == "__main__":
    asyncio.run(main())
