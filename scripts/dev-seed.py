#!/usr/bin/env python3
"""
DMX · dev-seed.py
Crea data demo MINIMA en Mongo local para "picar botones" sin pantallas vacías.

Uso (con backend ya levantado):
  source scripts/.venv/bin/activate
  python3 scripts/dev-seed.py

Idempotente: si encuentra data demo previa, NO duplica.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

# Cargar .env.local
from dotenv import load_dotenv  # type: ignore
load_dotenv(ROOT / "backend" / ".env.local")

from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "dmx_local")

SEED_TAG = "demo_seed_v1"  # marca todos los docs de seed para limpiar si quieres


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


# ---------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------
TENANTS = [
    {
        "id": "demo_inm_polanco",
        "name": "Inmobiliaria Polanco Demo",
        "type": "inmobiliaria",
        "status": "active",
        "rfc": "POL260101AAA",
        "brokers_count": 5,
        "founded_year": 2020,
        "contact": {"email": "ops@polanco-demo.local", "phone": "+525511110001"},
    },
    {
        "id": "demo_inm_condesa",
        "name": "Inmobiliaria Condesa Demo",
        "type": "inmobiliaria",
        "status": "active",
        "rfc": "CON260101BBB",
        "brokers_count": 3,
        "founded_year": 2022,
        "contact": {"email": "ops@condesa-demo.local", "phone": "+525511110002"},
    },
]

PROJECTS = [
    {
        "id": "demo_proj_torre_polanco",
        "name": "Torre Polanco Demo",
        "inmobiliaria_id": "demo_inm_polanco",
        "city": "Ciudad de México",
        "colonia": "Polanco",
        "status": "active",
        "price_min": 8_500_000,
        "price_max": 22_000_000,
        "units_total": 48,
        "units_available": 31,
        "amenities": ["alberca", "gimnasio", "roof_garden"],
        "lat": 19.4326,
        "lng": -99.1962,
    },
    {
        "id": "demo_proj_lofts_condesa",
        "name": "Lofts Condesa Demo",
        "inmobiliaria_id": "demo_inm_condesa",
        "city": "Ciudad de México",
        "colonia": "Condesa",
        "status": "active",
        "price_min": 4_200_000,
        "price_max": 9_800_000,
        "units_total": 24,
        "units_available": 12,
        "amenities": ["gimnasio", "co_working"],
        "lat": 19.4118,
        "lng": -99.1719,
    },
    {
        "id": "demo_proj_residencial_sur",
        "name": "Residencial Sur Demo",
        "inmobiliaria_id": "demo_inm_polanco",
        "city": "Ciudad de México",
        "colonia": "Coyoacán",
        "status": "active",
        "price_min": 6_000_000,
        "price_max": 14_500_000,
        "units_total": 36,
        "units_available": 20,
        "amenities": ["alberca", "salon_eventos"],
        "lat": 19.3499,
        "lng": -99.1617,
    },
]

LEADS = [
    {"name": "Ana López", "email": "ana.lopez@demo.local", "phone": "+525540001001", "status": "new",       "project": "demo_proj_torre_polanco",      "presupuesto_max": 12_000_000},
    {"name": "Carlos Ruiz", "email": "carlos.ruiz@demo.local", "phone": "+525540001002", "status": "contacted", "project": "demo_proj_lofts_condesa",      "presupuesto_max": 6_500_000},
    {"name": "Sofía Pérez", "email": "sofia.perez@demo.local", "phone": "+525540001003", "status": "qualified", "project": "demo_proj_residencial_sur",    "presupuesto_max": 10_000_000},
    {"name": "Diego Martín", "email": "diego.martin@demo.local", "phone": "+525540001004", "status": "visit",  "project": "demo_proj_torre_polanco",      "presupuesto_max": 18_000_000},
    {"name": "Laura Torres", "email": "laura.torres@demo.local", "phone": "+525540001005", "status": "won",    "project": "demo_proj_lofts_condesa",      "presupuesto_max": 8_000_000},
]

CONTACTS = [
    {"name": f"Contacto Demo {i+1}", "email": f"contact{i+1}@demo.local", "phone": f"+5255700{i:05d}",
     "tenant": "demo_inm_polanco" if i % 2 == 0 else "demo_inm_condesa"}
    for i in range(10)
]


# ---------------------------------------------------------------------
async def upsert(coll, key: dict, doc: dict, label: str):
    existing = await coll.find_one(key, {"_id": 0, "id": 1})
    if existing:
        print(f"  · {label} ya existe · skip ({key})")
        return False
    await coll.insert_one(doc)
    print(f"  ✓ {label} creado")
    return True


async def main():
    print(f"[seed] Conectando a {MONGO_URL} · db={DB_NAME}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Ping
    try:
        await db.command("ping")
    except Exception as e:
        print(f"[seed ERROR] No se pudo conectar a Mongo: {e}")
        print("[seed] ¿Levantaste ./scripts/dev-up.sh primero?")
        sys.exit(1)

    print("\n[seed] Tenants (inmobiliarias)")
    for t in TENANTS:
        doc = {**t, "_seed": SEED_TAG, "created_at": now_iso()}
        await upsert(db.inmobiliarias, {"id": t["id"]}, doc, t["name"])

    print("\n[seed] Projects (developments)")
    for p in PROJECTS:
        doc = {**p, "_seed": SEED_TAG, "created_at": now_iso(), "updated_at": now_iso()}
        # Insertar en ambas colecciones para compatibilidad UI (developments + projects)
        await upsert(db.developments, {"id": p["id"]}, doc, f"developments::{p['name']}")
        await upsert(db.projects, {"id": p["id"]}, doc, f"projects::{p['name']}")

    print("\n[seed] Leads")
    for i, l in enumerate(LEADS):
        lid = f"demo_lead_{i+1:03d}"
        doc = {
            "id": lid,
            "name": l["name"],
            "email": l["email"],
            "phone": l["phone"],
            "status": l["status"],
            "project_id": l["project"],
            "inmobiliaria_id": "demo_inm_polanco",
            "presupuesto_max": l["presupuesto_max"],
            "presupuesto_min": int(l["presupuesto_max"] * 0.7),
            "origin": {"type": "manual", "inmobiliaria_id": "demo_inm_polanco"},
            "_seed": SEED_TAG,
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "last_activity_at": now_iso(),
        }
        await upsert(db.leads, {"id": lid}, doc, f"{l['name']} ({l['status']})")

    print("\n[seed] Contacts (contactos genéricos)")
    for i, c in enumerate(CONTACTS):
        cid = f"demo_contact_{i+1:03d}"
        doc = {
            "id": cid,
            "name": c["name"],
            "email": c["email"],
            "phone": c["phone"],
            "inmobiliaria_id": c["tenant"],
            "_seed": SEED_TAG,
            "created_at": now_iso(),
        }
        await upsert(db.contacts, {"id": cid}, doc, c["name"])

    print("\n[seed] OK · data demo lista")
    print("[seed] Login: admin@local.dmx.io / localdev")
    print(f"[seed] Limpiar data demo: db.<coll>.deleteMany({{_seed: '{SEED_TAG}'}})")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
