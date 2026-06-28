#!/usr/bin/env python3
"""FASE A · E2E de COHORTE — prueba el JOURNEY completo a escala, tagueado, con teardown CERO-RESIDUO.

Por cada visitante sintético: señales anónimas (ficha_view + like) + búsqueda → REGISTRO (create_buyer_lead, el
conversor real del journey) → debe (a) crear el lead, (b) RUTEARLO a un asesor, (c) ESPEJARLO al CRM, (d) RE-ATRIBUIR
las señales anónimas al lead_id. Reconciliación: los conteos cuadran. Escala: N visitantes. Aislamiento: la guardia
sigue 13/13. Teardown: diff vs baseline = 0.

Uso:  scripts/.venv/bin/python3 scripts/e2e_cohort.py
"""
import asyncio
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-e2e"
N = 20
_COLLS = ("leads", "asesor_contactos", "buyer_signals", "marketplace_searches", "visitor_identity")
_res = []


def chk(name, ok, detail=""):
    _res.append(ok)
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


async def _teardown(db, lead_ids):
    rx = {"$regex": f"^{TAG}-vid-"}
    await db.buyer_signals.delete_many({"$or": [{"visitor_id": rx}, {"id": {"$regex": f"^{TAG}-sig-"}}]})
    await db.marketplace_searches.delete_many({"visitor_id": rx})
    await db.leads.delete_many({"visitor_id": rx})
    # contactos: por source_lead_id Y por el email de prueba (robusto ante crash mid-run)
    q = [{"emails": {"$regex": "@e2e.local"}}]
    if lead_ids:
        q.append({"source_lead_id": {"$in": lead_ids}})
    await db.asesor_contactos.delete_many({"$or": q})
    if lead_ids:
        for c in ("notifications", "asesor_lead_properties", "favoritos_board"):
            try:
                await db[c].delete_many({"$or": [{"lead_id": {"$in": lead_ids}}, {"entity_id": {"$in": lead_ids}}]})
            except Exception:
                pass
    await db.visitor_identity.delete_many({"visitors": rx})
    # audit_log del lead (create_buyer_lead loguea a audit_log; prefija el source con 'copiloto_' → regex) + lead_ids.
    _aq = [{"after.source": {"$regex": "test_e2e"}}]
    if lead_ids:
        _aq.append({"entity_id": {"$in": lead_ids}})
    await db.audit_log.delete_many({"$or": _aq})


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from routes.buyer_signals import create_buyer_lead
    from data_developments import DEVELOPMENTS
    dev_ids = [d["id"] for d in DEVELOPMENTS[:6]] or ["polanco-dev"]

    base = {c: await db[c].count_documents({}) for c in _COLLS}
    print(f"\n— Sembrando cohorte de {N} (journey real) —")

    created = routed = mirrored = reattr = errors = 0
    lead_ids = []
    try:
        for i in range(N):
            vid = f"{TAG}-vid-{i}"
            dev = dev_ids[i % len(dev_ids)]
            now = dt.datetime.utcnow()
            for t in ("ficha_view", "like"):
                await db.buyer_signals.update_one(
                    {"id": f"{TAG}-sig-{i}-{t}"},
                    {"$set": {"id": f"{TAG}-sig-{i}-{t}", "visitor_id": vid, "type": t, "entity_id": dev,
                              "active": True, "created_at_dt": now}}, upsert=True)
            await db.marketplace_searches.update_one(
                {"visitor_id": vid},
                {"$set": {"visitor_id": vid, "colonias": ["polanco"], "precio_max": 8_000_000, "created_at_dt": now}}, upsert=True)
            try:
                lid, _house = await create_buyer_lead(db, vid, name=f"E2E {i}", email=f"test-e2e-{i}@e2e.local",
                                                      phone=f"55{i:08d}", dev_id=dev, source="test_e2e")
            except Exception as e:  # noqa: BLE001
                errors += 1
                if errors <= 2:
                    print("    err:", str(e)[:90])
                continue
            if lid:
                created += 1
                lead_ids.append(lid)
                ld = await db.leads.find_one({"id": lid}, {"_id": 0, "assigned_to": 1})
                if (ld or {}).get("assigned_to"):
                    routed += 1
                if await db.asesor_contactos.count_documents({"source_lead_id": lid}):
                    mirrored += 1
                if await db.buyer_signals.count_documents({"visitor_id": vid, "lead_id": lid}):
                    reattr += 1

        print("\n— Journey (anónimo → lead → asesor → CRM → re-atribución) —")
        chk("registro crea el lead", created == N, f"{created}/{N} · errores={errors}")
        chk("RUTEO a un asesor", routed == created and created > 0, f"{routed}/{created}")
        chk("ESPEJO al CRM del asesor", mirrored == created and created > 0, f"{mirrored}/{created}")
        chk("RE-ATRIBUCIÓN de señales anónimas → lead", reattr == created and created > 0, f"{reattr}/{created}")

        print("\n— Reconciliación (los conteos cuadran) —")
        cohort_leads = await db.leads.count_documents({"visitor_id": {"$regex": f"^{TAG}-vid-"}})
        cohort_contactos = await db.asesor_contactos.count_documents({"source_lead_id": {"$in": lead_ids}})
        chk("leads en BD == registrados", cohort_leads == created, f"{cohort_leads}=={created}")
        chk("contactos espejados == leads", cohort_contactos == mirrored, f"{cohort_contactos}=={mirrored}")

        print("\n— Aislamiento de tenant a escala (sigue sólido) —")
        from tenant_isolation_probe import run_probe
        pr = await run_probe(db)
        chk(f"aislamiento {pr['passed']}/{pr['total']} colecciones", pr["ok"], f"fugas={len(pr['leaks'])}")
    finally:
        await _teardown(db, lead_ids)

    print("\n— Cero-residuo (diff vs baseline) —")
    after = {c: await db[c].count_documents({}) for c in _COLLS}
    diffs = {c: after[c] - base[c] for c in _COLLS if after[c] != base[c]}
    chk("teardown: árbol restaurado (0 residuo)", not diffs, str(diffs) if diffs else "todo en 0")

    n_pass = sum(1 for x in _res if x)
    print(f"\n{'='*52}\nFASE A — {n_pass}/{len(_res)} asserts PASS")
    sys.exit(0 if n_pass == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
