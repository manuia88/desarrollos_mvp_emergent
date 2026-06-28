#!/usr/bin/env python3
"""Simulación de CONCURRENCIA — ~1000 usuarios al mismo tiempo en direcciones diversas (marketplace escribe · asesor/dev/
superadmin leen). Caza races, idempotencia, consistencia y mide throughput. Tagueado + teardown cero-residuo.

Fases:
  1) 1000 señales concurrentes (1000 visitantes distintos) → todas aterrizan, sin corrupción.
  2) RACE de idempotencia: 50 registros CONCURRENTES del MISMO visitante → debe quedar 1 lead (no 50).
  3) 100 registros concurrentes DISTINTOS + lecturas cross-portal en paralelo (asesor/dev/superadmin) → sin errores,
     todos ruteados+espejados, sin doble-contacto.
Uso:  scripts/.venv/bin/python3 scripts/concurrent_load.py
"""
import asyncio
import datetime as dt
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-conc"
_res = []


def chk(name, ok, detail=""):
    _res.append(ok)
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


async def _teardown(db):
    rx = {"$regex": f"^{TAG}-"}
    await db.buyer_signals.delete_many({"$or": [{"visitor_id": rx}, {"id": rx}]})
    await db.marketplace_searches.delete_many({"visitor_id": rx})
    await db.leads.delete_many({"visitor_id": rx})
    await db.asesor_contactos.delete_many({"emails": {"$regex": "@conc.local"}})
    await db.visitor_identity.delete_many({"visitors": rx})
    # audit_log del lead usa entity_id=lead_xxx (no TEST-conc-) → limpiar por el source del test (after.source, que
    # create_buyer_lead prefija con 'copiloto_' → usar regex).
    await db.audit_log.delete_many({"$or": [{"entity_id": rx}, {"after.source": {"$regex": "test_conc"}}]})


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from routes.buyer_signals import create_buyer_lead, donde_vivir  # noqa: F401
    from data_developments import DEVELOPMENTS
    dev_ids = [d["id"] for d in DEVELOPMENTS[:6]] or ["polanco-dev"]
    base = {c: await db[c].count_documents({}) for c in ("leads", "asesor_contactos", "buyer_signals", "marketplace_searches", "visitor_identity")}
    await _teardown(db)  # por si quedó residuo de una corrida previa

    try:
        # ── FASE 1: 1000 señales concurrentes (1000 visitantes) ──
        now = dt.datetime.utcnow()
        async def _sig(i):
            await db.buyer_signals.insert_one({"id": f"{TAG}-s-{i}", "visitor_id": f"{TAG}-v-{i}", "type": "like",
                                               "entity_id": dev_ids[i % len(dev_ids)], "active": True, "created_at_dt": now})
        t0 = time.monotonic()
        r = await asyncio.gather(*[_sig(i) for i in range(1000)], return_exceptions=True)
        dt1 = time.monotonic() - t0
        errs = sum(1 for x in r if isinstance(x, Exception))
        landed = await db.buyer_signals.count_documents({"id": {"$regex": f"^{TAG}-s-"}})
        print(f"\n— Fase 1: 1000 señales concurrentes en {dt1*1000:.0f}ms ({1000/dt1:.0f}/s) —")
        chk("1000 señales aterrizan sin error", errs == 0 and landed == 1000, f"landed={landed} errs={errs}")

        # ── FASE 2: RACE de idempotencia — 50 registros CONCURRENTES del MISMO visitante ──
        same = f"{TAG}-same"
        async def _reg_same():
            try:
                return await create_buyer_lead(db, same, name="Race", email="race@conc.local", phone="5512340000",
                                               dev_id=dev_ids[0], source="test_conc")
            except Exception as e:
                return e
        rr = await asyncio.gather(*[_reg_same() for _ in range(50)], return_exceptions=True)
        n_same = await db.leads.count_documents({"visitor_id": same})
        n_contactos_same = await db.asesor_contactos.count_documents({"source_lead_id": {"$regex": f"^lead_"}, "emails": "race@conc.local"})
        print("\n— Fase 2: RACE idempotencia (50 registros concurrentes del MISMO visitante) —")
        chk("MISMO visitante → 1 solo lead (no duplica)", n_same == 1, f"{n_same} leads")
        chk("MISMO visitante → 1 solo contacto en CRM", n_contactos_same <= 1, f"{n_contactos_same} contactos")

        # ── FASE 3: 100 registros distintos concurrentes + lecturas cross-portal en paralelo ──
        async def _reg(i):
            try:
                return await create_buyer_lead(db, f"{TAG}-v-{i}", name=f"C{i}", email=f"c{i}@conc.local",
                                               phone=f"55{i:08d}", dev_id=dev_ids[i % len(dev_ids)], source="test_conc")
            except Exception as e:
                return e
        # lecturas concurrentes (direcciones diversas): dev demanda · superadmin cubo · engine ranking · asesor leen
        async def _read_dev():
            return await db.marketplace_searches.count_documents({"colonia_id": {"$exists": True}})
        async def _read_super():
            from cube_olap_engine import materialize_buyer_signals_to_cube
            return await materialize_buyer_signals_to_cube(db)
        async def _read_engine():
            from visitor_taste import score_devs
            return await score_devs(db, f"{TAG}-v-0", DEVELOPMENTS[:5])
        async def _read_asesor():
            return await db.asesor_contactos.count_documents({})
        t0 = time.monotonic()
        ops = [_reg(i) for i in range(100)] + [_read_dev() for _ in range(20)] + [_read_engine() for _ in range(20)] + [_read_asesor() for _ in range(20)] + [_read_super()]
        res3 = await asyncio.gather(*ops, return_exceptions=True)
        dt3 = time.monotonic() - t0
        reg_errs = sum(1 for x in res3[:100] if isinstance(x, Exception))
        read_errs = sum(1 for x in res3[100:] if isinstance(x, Exception))
        n_leads = await db.leads.count_documents({"visitor_id": {"$regex": f"^{TAG}-v-"}})
        n_routed = await db.leads.count_documents({"visitor_id": {"$regex": f"^{TAG}-v-"}, "assigned_to": {"$nin": [None, ""]}})
        n_mirror = await db.asesor_contactos.count_documents({"emails": {"$regex": "@conc.local"}, "source_lead_id": {"$ne": None}})
        print(f"\n— Fase 3: 100 registros + 61 lecturas cross-portal concurrentes en {dt3*1000:.0f}ms —")
        chk("100 registros concurrentes sin error", reg_errs == 0, f"errs={reg_errs}")
        chk("lecturas cross-portal sin error bajo carga", read_errs == 0, f"errs={read_errs}")
        chk("todos los leads distintos ruteados", n_routed == n_leads and n_leads >= 100, f"{n_routed}/{n_leads}")
        chk("todos espejados al CRM (sin doble-contacto)", n_mirror >= 100, f"contactos={n_mirror}")
    finally:
        await _teardown(db)

    after = {c: await db[c].count_documents({}) for c in base}
    diffs = {c: after[c] - base[c] for c in base if after[c] != base[c]}
    print("\n— Cero-residuo —")
    chk("teardown restaura el árbol", not diffs, str(diffs) if diffs else "todo en 0")

    n = sum(1 for x in _res if x)
    print(f"\n{'='*54}\nCONCURRENCIA — {n}/{len(_res)} PASS")
    sys.exit(0 if n == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
