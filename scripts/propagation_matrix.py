#!/usr/bin/env python3
"""Matriz de PROPAGACIÓN cross-portal — ¿todo lo que pasa en MARKETPLACE se ve en asesor / dev / superadmin?

Hace UN journey de marketplace tagueado (señales + búsqueda + registro para un dev real) y verifica que aparece en
CADA superficie: datos, scores, engines, analítica. Cada fila = un eslabón de propagación (PASS) o un gap (FAIL).
Teardown cero-residuo.

Uso:  scripts/.venv/bin/python3 scripts/propagation_matrix.py
"""
import asyncio
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-prop"
VID = f"{TAG}-vid-1"
EMAIL = f"{TAG}@e2e.local"
_res = []


def chk(portal, name, ok, detail=""):
    _res.append(ok)
    print(f"  {'✅' if ok else '❌'} [{portal:10}] {name}" + (f" — {detail}" if detail else ""))


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from data_developments import DEVELOPMENTS
    dev = next((d for d in DEVELOPMENTS if d.get("colonia_id") or d.get("colonia")), DEVELOPMENTS[0])
    dev_id, col = dev["id"], (dev.get("colonia_id") or dev.get("colonia"))
    lead_id = None
    try:
        now = dt.datetime.utcnow()
        # ── ACCIÓN EN MARKETPLACE: señales anónimas + búsqueda + registro ──
        for t in ("ficha_view", "like"):
            await db.buyer_signals.update_one({"id": f"{TAG}-sig-{t}"},
                {"$set": {"id": f"{TAG}-sig-{t}", "visitor_id": VID, "type": t, "entity_id": dev_id, "active": True, "created_at_dt": now}}, upsert=True)
        await db.marketplace_searches.update_one({"visitor_id": VID},
            {"$set": {"visitor_id": VID, "colonia_id": col, "colonias": [col], "precio_max": 8_000_000, "recamaras_min": 2, "created_at_dt": now}}, upsert=True)
        from routes.buyer_signals import create_buyer_lead
        lead_id, _ = await create_buyer_lead(db, VID, name="Prop Test", email=EMAIL, phone="5500000777", dev_id=dev_id, source="test_prop")

        print(f"\nJourney marketplace → dev={dev_id} colonia={col} lead={lead_id}\n")

        # ── MARKETPLACE (origen) ──
        chk("marketplace", "señales registradas", await db.buyer_signals.count_documents({"visitor_id": VID, "type": "like"}) >= 1)
        chk("marketplace", "búsqueda registrada", await db.marketplace_searches.count_documents({"visitor_id": VID}) >= 1)
        chk("marketplace", "lead creado", bool(lead_id))

        # ── ASESOR (CRM + temperatura) ──
        contacto = await db.asesor_contactos.find_one({"source_lead_id": lead_id}, {"_id": 0}) if lead_id else None
        chk("asesor", "lead espejado en su CRM", bool(contacto))
        chk("asesor", "engagement/temperatura del lead", bool(contacto and (contacto.get("engagement_score") is not None or contacto.get("temperatura"))))

        # ── DEV (sus leads + demanda + percepción) ──
        leaddoc = await db.leads.find_one({"id": lead_id}, {"_id": 0}) if lead_id else None
        dev_sees_lead = bool(leaddoc and (leaddoc.get("development_id") == dev_id or leaddoc.get("project_id") == dev_id or (leaddoc.get("liked_devs") or []) and dev_id in leaddoc.get("liked_devs", [])))
        chk("dev", "el lead referencia su desarrollo", dev_sees_lead, f"dev_id={dev_id}")
        chk("dev", "DEMANDA: su colonia tiene la búsqueda", await db.marketplace_searches.count_documents({"colonia_id": col, "visitor_id": VID}) >= 1)
        chk("dev", "PERCEPCIÓN: interés (like) en su dev", await db.buyer_signals.count_documents({"entity_id": dev_id, "type": "like", "visitor_id": VID}) >= 1)

        # ── SUPERADMIN (cubo + auditoría) ──
        from cube_olap_engine import materialize_buyer_signals_to_cube
        cube = await materialize_buyer_signals_to_cube(db)
        chk("superadmin", "CUBO materializa (K-anon puede suprimir 1-visitante)", bool(cube.get("ok")), f"mat={cube.get('materialized')} k-anon={cube.get('suppressed_kanon')}")
        audit_hit = await db.audit_log.count_documents({"$or": [{"entity_id": lead_id}, {"after.assigned_to": {"$exists": True}, "actor.by_ai": True, "entity_id": lead_id}]}) if lead_id else 0
        chk("superadmin", "AUDITORÍA: la creación/ruteo del lead deja rastro", audit_hit >= 1, f"hits={audit_hit}")

        # ── SCORES / ENGINES ──
        from visitor_taste import build_visitor_taste
        taste = await build_visitor_taste(db, VID)
        chk("engine", "GUSTO: el taste refleja el like", bool(taste and (taste.get("resumen") or (taste.get("keys") or {}).get("features") or taste.get("zonas_gustan"))))
        from demand_twin_engine import build_demand_twin
        twin = await build_demand_twin(db, limit=200)
        chk("engine", "GEMELO DE DEMANDA: la colonia aparece", any(str(z.get("colonia", "")).lower() == str(col).lower() for z in twin), f"colonia={col}")

    finally:
        await db.buyer_signals.delete_many({"$or": [{"visitor_id": VID}, {"id": {"$regex": f"^{TAG}-sig-"}}]})
        await db.marketplace_searches.delete_many({"visitor_id": VID})
        if lead_id:
            await db.leads.delete_many({"id": lead_id})
            await db.asesor_contactos.delete_many({"$or": [{"source_lead_id": lead_id}, {"emails": {"$regex": "@e2e.local"}}]})
            await db.audit_log.delete_many({"entity_id": lead_id})
        await db.visitor_identity.delete_many({"visitors": VID})

    n = sum(1 for x in _res if x)
    print(f"\n{'='*54}\nPROPAGACIÓN — {n}/{len(_res)} eslabones visibles")
    sys.exit(0 if n == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
