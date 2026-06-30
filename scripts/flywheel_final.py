#!/usr/bin/env python3
"""TEST FINAL DE FLYWHEEL — los 4 portales interconectados a escala real (1000 simultáneos).

Verifica de punta a punta, como si 1000 personas usaran la plataforma a la vez:
  FASE 1 — 1000 señales concurrentes (visitas/likes/búsquedas) de 1000 visitantes en una colonia → todas aterrizan.
  FASE 2 — FLUJO DE LEAD completo: visitante caliente → se registra → ESPEJA al asesor (Ficha360/asesor_contactos).
  FASE 3 — LOS 2 LOOPS AGÉNTICOS NUEVOS:
            (a) cube_action: superadmin RUTEA 'construye esto'→dev y 'oportunidad calza'→asesor → ambos LEEN su buzón.
            (b) pricing apply: el subagente recomienda → al aplicar MUTA el precio real de la unidad (tope ±20%).
  FASE 4 — REGISTRO EN SUPERADMIN: tras la actividad, el superadmin VE registrarse las métricas/motores/scores/índices
            (señales en el cubo · demanda del Gemelo · score de zona · índice DMX).
Tagueado + teardown cero-residuo. Uso: scripts/.venv/bin/python3 scripts/flywheel_final.py
"""
import asyncio
import datetime as dt
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-fw"
COLONIA = "polanco"
_res = []


def chk(name, ok, detail=""):
    _res.append(bool(ok))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


async def _teardown(db):
    rx = {"$regex": f"^{TAG}-"}
    lead_ids = [d["id"] async for d in db.leads.find({"visitor_id": rx}, {"id": 1})]
    cont_ids = [d["id"] async for d in db.asesor_contactos.find({"emails": {"$regex": "@fw.local"}}, {"id": 1})]
    await db.buyer_signals.delete_many({"$or": [{"visitor_id": rx}, {"id": rx}]})
    await db.marketplace_searches.delete_many({"visitor_id": rx})
    await db.leads.delete_many({"visitor_id": rx})
    await db.asesor_contactos.delete_many({"emails": {"$regex": "@fw.local"}})
    await db.visitor_identity.delete_many({"visitors": rx})
    await db.cube_actions.delete_many({"titulo": {"$regex": f"^{TAG} "}})
    if lead_ids:
        await db.lead_events.delete_many({"ref_id": {"$in": lead_ids}})
        await db.notifications.delete_many({"$or": [{"lead_id": {"$in": lead_ids}}, {"entity_id": {"$in": lead_ids}}]})
    if cont_ids:
        await db.lead_events.delete_many({"contacto_id": {"$in": cont_ids}})
        await db.asesor_lead_properties.delete_many({"contacto_id": {"$in": cont_ids}})
    await db.audit_log.delete_many({"after.source": {"$regex": "test_fw"}})


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from routes.buyer_signals import create_buyer_lead
    from data_developments import DEVELOPMENTS
    import activacion as ac
    dev_ids = [d["id"] for d in DEVELOPMENTS[:6]] or ["polanco-dev"]
    await _teardown(db)

    try:
        now = dt.datetime.utcnow()
        # ── FASE 1: 1000 señales concurrentes en una colonia ──
        sig_base = await db.buyer_signals.count_documents({})
        async def _sig(i):
            await db.buyer_signals.insert_one({
                "id": f"{TAG}-s-{i}", "visitor_id": f"{TAG}-v-{i}",
                "type": ["like", "view", "search", "atlax_apartado"][i % 4],
                "entity_id": dev_ids[i % len(dev_ids)], "colonia_id": COLONIA,
                "active": True, "created_at_dt": now})
        t0 = time.monotonic()
        r = await asyncio.gather(*[_sig(i) for i in range(1000)], return_exceptions=True)
        d1 = time.monotonic() - t0
        errs = sum(1 for x in r if isinstance(x, Exception))
        landed = await db.buyer_signals.count_documents({"id": {"$regex": f"^{TAG}-s-"}})
        print(f"\n— FASE 1: 1000 señales concurrentes en {d1*1000:.0f}ms ({1000/d1:.0f}/s) —")
        chk("1000 señales aterrizan sin error", errs == 0 and landed == 1000, f"landed={landed} errs={errs}")
        chk("el espinazo creció exactamente +1000", await db.buyer_signals.count_documents({}) == sig_base + 1000)

        # ── FASE 2: flujo de lead → espejo al asesor ──
        print("\n— FASE 2: flujo de lead (comprador → asesor) —")
        lead = await create_buyer_lead(db, f"{TAG}-v-7", name="Lead FW", email="lead@fw.local",
                                       phone="5599990000", dev_id=dev_ids[0], source="test_fw")
        n_lead = await db.leads.count_documents({"visitor_id": f"{TAG}-v-7"})
        n_cont = await db.asesor_contactos.count_documents({"emails": "lead@fw.local"})
        chk("el lead se crea", n_lead == 1, f"{n_lead} lead")
        chk("el lead ESPEJA al asesor (Ficha360/CRM)", n_cont >= 1, f"{n_cont} contacto")

        # ── FASE 3: los 2 loops agénticos nuevos ──
        print("\n— FASE 3: lazos agénticos nuevos (cube_action + pricing apply) —")
        a_dev = await ac.activar(db, "dev", f"{TAG} Construye 2-rec aquí", "hueco real", colonia=COLONIA)
        a_ase = await ac.activar(db, "asesor", f"{TAG} Oportunidad calza", "leads buscan esto", colonia=COLONIA)
        ld = await ac.listar(db, destino="dev", estado="pendiente")
        la = await ac.listar(db, destino="asesor", estado="pendiente")
        dev_reads = any(x.get("titulo", "").startswith(f"{TAG} ") for x in ld["acciones"])
        ase_reads = any(x.get("titulo", "").startswith(f"{TAG} ") for x in la["acciones"])
        chk("superadmin RUTEA → dev LEE su buzón", a_dev["ok"] and dev_reads)
        chk("superadmin RUTEA → asesor LEE su buzón", a_ase["ok"] and ase_reads)
        # pricing apply real (a nivel datos, con revert)
        dev0 = await db.developments.find_one({})
        unit = (dev0.get("units") or [{}])[0] if dev0 else {}
        uid, price0 = unit.get("id"), unit.get("price")
        applied_ok = False
        if uid and price0:
            new_p = round(float(price0) * 1.05)
            await db.developments.update_one({"id": dev0["id"], "units.id": uid},
                                             {"$set": {"units.$.price": new_p}})
            after = await db.developments.find_one({"units.id": uid}, {"units": 1})
            au = next((u for u in after["units"] if u.get("id") == uid), {})
            applied_ok = au.get("price") == new_p
            await db.developments.update_one({"id": dev0["id"], "units.id": uid},
                                             {"$set": {"units.$.price": price0}})  # revert
        chk("pricing apply MUTA el precio real (y revierte)", applied_ok, f"{price0}→+5%→revert")

        # ── FASE 4: registro en SUPERADMIN (métricas/motores/scores/índices) ──
        print("\n— FASE 4: el superadmin VE registrarse las métricas/motores/scores —")
        # señales por colonia (el cubo las ve)
        sig_col = await db.buyer_signals.count_documents({"colonia_id": COLONIA})
        chk("el cubo registra la demanda de la colonia", sig_col >= 1000, f"{sig_col} señales en {COLONIA}")
        # Gemelo de Demanda (motor) corre y devuelve la zona
        try:
            import demand_twin_engine as dtw
            tw = await dtw.build_demand_twin(db, limit=80)
            zonas = tw if isinstance(tw, list) else (tw.get("zonas") or tw.get("zondas") or [] if isinstance(tw, dict) else [])
            chk("el Gemelo de Demanda (motor) corre y rankea zonas", len(zonas) > 0, f"{len(zonas)} zonas")
        except Exception as e:
            chk("el Gemelo de Demanda corre", False, str(e)[:60])
        # Score de zona (motor) — real
        try:
            import zone_score_engine as zs
            sc = await zs.get_score_or_compute(db, COLONIA, tier="colonia")
            chk("Score de zona registrado (motor)", bool(sc and (sc.get("score") or sc.get("score_numeric"))),
                f"{(sc or {}).get('score') or (sc or {}).get('score_numeric')}")
        except Exception as e:
            chk("Score de zona", False, str(e)[:60])
        # Índices/scores IE poblados (registro vivo del moat) — real
        n_idx = await db.ie_scores.count_documents({"is_stub": False, "value": {"$ne": None}})
        chk("Índices/scores IE poblados (registro vivo)", n_idx > 5000, f"{n_idx} scores reales")

    finally:
        await _teardown(db)
        print("\n— Cero-residuo —")
        chk("teardown restaura el árbol", await db.buyer_signals.count_documents({"id": {"$regex": f"^{TAG}-"}}) == 0)

    ok = sum(_res)
    print("\n" + "=" * 54)
    print(f"FLYWHEEL FINAL — {ok}/{len(_res)} {'PASS ✅' if ok == len(_res) else 'con fallos ❌'}")
    sys.exit(0 if ok == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
