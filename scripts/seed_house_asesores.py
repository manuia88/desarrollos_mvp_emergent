"""
Seed DEMO · asesores de la casa + solicitudes de visita de marketplace
======================================================================
Da de alta 2 asesores de MI inmobiliaria (dmx_root) + 3 solicitudes de visita de
marketplace y corre el reparto round-robin para VER el balanceo funcionando.

Todo va marcado con seed_tag="house_demo" → limpiable. Idempotente (upsert por email).

Uso (desde la raíz del repo):
  cd backend && set -a && source .env.local && set +a && \
    ../scripts/.venv/bin/python ../scripts/seed_house_asesores.py          # sembrar
  ... ../scripts/seed_house_asesores.py --clean                            # limpiar
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

SEED_TAG = "house_demo"
DEMO_PASSWORD = "DemoCasa2026!"
# Cobertura de zona distinta para VER el reparto por zona + carga + cierres:
#   Polanco lo cubren los DOS con la MISMA carga → desempata CIERRES (Dos tiene más → gana).
#   Pedregal solo Uno; Lomas solo Dos.
ASESORES = [
    {"email": "casa1@desarrollosmx.io", "name": "Asesor Casa Uno",
     "colonias": ["Polanco", "Jardines del Pedregal"], "cierres": 2},
    {"email": "casa2@desarrollosmx.io", "name": "Asesor Casa Dos",
     "colonias": ["Lomas de Chapultepec", "Polanco"], "cierres": 5},
]


async def _db():
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return cli, cli[os.environ.get("DB_NAME", "desarrollosmx")]


async def clean(db):
    emails = [a["email"] for a in ASESORES]
    a = await db.users.delete_many({"seed_tag": SEED_TAG})
    p = await db.asesor_profiles.delete_many({"_seed_email": {"$in": emails}})
    o = await db.asesor_operaciones.delete_many({"seed_tag": SEED_TAG})
    v = await db.visit_requests.delete_many({"seed_tag": SEED_TAG})
    print(f"Limpiado: {a.deleted_count} asesores + {p.deleted_count} perfiles + {o.deleted_count} cierres + {v.deleted_count} solicitudes demo.")


async def seed(db):
    from server import hash_password
    from house_pool_engine import DMX_HOUSE_ORG, assign_house_lead
    from data_developments import DEVELOPMENTS

    # 1 · 2 asesores de la casa (role advisor · tenant None = casa · login-ables) + su perfil con zonas
    ids = []
    for a in ASESORES:
        existing = await db.users.find_one({"email": a["email"]}, {"_id": 0, "user_id": 1})
        uid = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"
        await db.users.update_one(
            {"email": a["email"]},
            {"$set": {"user_id": uid, "email": a["email"], "name": a["name"],
                      "password_hash": hash_password(DEMO_PASSWORD), "role": "advisor",
                      "tenant_id": None, "onboarded": True, "seed_tag": SEED_TAG,
                      "created_at": datetime.now(timezone.utc)}},
            upsert=True)
        # perfil con cobertura de zona (asesor_profiles.colonias = lo que usa el reparto por zona)
        await db.asesor_profiles.update_one(
            {"user_id": uid},
            {"$set": {"user_id": uid, "full_name": a["name"], "brokerage": "DesarrollosMX",
                      "colonias": a["colonias"], "profile_completed": True,
                      "_seed_email": a["email"]}},
            upsert=True)
        # cierres (asesor_operaciones cerradas = el ranking que desempata)
        await db.asesor_operaciones.delete_many({"owner_id": uid, "seed_tag": SEED_TAG})
        for _ in range(a.get("cierres", 0)):
            await db.asesor_operaciones.insert_one(
                {"id": "op_" + uuid.uuid4().hex[:10], "owner_id": uid, "status": "cerrada",
                 "fecha_cierre": datetime.now(timezone.utc).isoformat(), "seed_tag": SEED_TAG})
        ids.append((uid, a["name"]))
        print(f"  {a['name']}: cubre {', '.join(a['colonias'])} · {a.get('cierres', 0)} cierres")
    print(f"(password de ambos: {DEMO_PASSWORD})")

    # 2 · 3 solicitudes de visita de marketplace (dueño = mi inmobiliaria) + reparto
    props = DEVELOPMENTS[:3]
    print("\nReparto por ZONA + CARGA:")
    for i, p in enumerate(props):
        vid = "visit_" + uuid.uuid4().hex[:12]
        await db.visit_requests.insert_one({
            "id": vid, "user_id": f"demo_buyer_{i+1}", "email": f"comprador{i+1}@demo.mx",
            "property_id": p["id"], "property_name": p.get("name"),
            "about_developer_id": p.get("developer_id"), "about_dev_org_id": p.get("dev_org_id"),
            "owner_org": DMX_HOUSE_ORG, "assigned_asesor_id": None,
            "status": "requested", "source": "marketplace", "seed_tag": SEED_TAG,
            "created_at": datetime.now(timezone.utc).isoformat()})
        aid = await assign_house_lead(db, vid)
        who = next((n for u, n in ids if u == aid), aid or "POOL")
        doc = await db.visit_requests.find_one({"id": vid}, {"_id": 0, "assigned_by": 1})
        crit = (doc or {}).get("assigned_by", "—")
        print(f"  • {p.get('name'):<26} ({p.get('colonia'):<22}) → {who:<16} [{crit}]")

    # 3 · resumen del balanceo
    print("\nCarga por asesor:")
    for uid, name in ids:
        n = await db.visit_requests.count_documents(
            {"seed_tag": SEED_TAG, "assigned_asesor_id": uid})
        print(f"  • {name}: {n} visita(s)")


async def main():
    cli, db = await _db()
    try:
        if "--clean" in sys.argv:
            await clean(db)
        else:
            await seed(db)
    finally:
        cli.close()


if __name__ == "__main__":
    asyncio.run(main())
