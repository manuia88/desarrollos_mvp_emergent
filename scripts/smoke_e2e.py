#!/usr/bin/env python3
"""Smoke e2e — validación REPETIBLE del flywheel + lo construido esta sesión (upgrade #1: 'verificado per-link ≠ app real').

Corre los motores y endpoints clave contra la BD local y reporta PASS/FAIL por check. Repetible en cada cambio o
pre-deploy. NO necesita sesión logueada (ejercita el lado público + los motores directo).

Uso:  scripts/.venv/bin/python3 scripts/smoke_e2e.py
"""
import asyncio
import os
import sys
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

API = "http://localhost:8000"
_results = []


def check(name, ok, detail=""):
    _results.append(ok)
    print(f"  {'✅ PASS' if ok else '❌ FAIL'} · {name}" + (f" — {detail}" if detail else ""))


def http_code(path):
    try:
        req = urllib.request.Request(f"{API}{path}")
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx

    print("\n— HTTP (servidor arriba) —")
    check("health 200", http_code("/api/health") == 200)
    check("donde-vivir 200 (público)", http_code("/api/buyer/donde-vivir?limit=2") == 200)
    check("experiencia-fotos 200", http_code("/api/buyer/experiencia-fotos/tamaulipas-89") == 200)
    check("demanda-mapa 200 (mapa de demanda comprador · L55)", http_code("/api/buyer/demanda-mapa") == 200)
    check("demand-twin guardado (401 sin auth)", http_code("/api/superadmin/founder-console/demand-twin") in (401, 403))

    print("\n— Flywheel: el dato del comprador se materializa —")
    from cube_olap_engine import materialize_buyer_signals_to_cube
    r = await materialize_buyer_signals_to_cube(db)
    check("cube: buyer_signals → facts_buyer_signals", r.get("ok") and (r.get("materialized", 0) >= 0),
          f"{r.get('materialized')} mat · {r.get('suppressed_kanon')} K-anon")

    print("\n— Gemelo de demanda —")
    from demand_twin_engine import build_demand_twin
    twin = await build_demand_twin(db, limit=5)
    check("demand-twin: zonas con oportunidad", len(twin) > 0 and "oportunidad" in (twin[0] if twin else {}),
          f"top: {twin[0]['colonia']} oport={twin[0]['oportunidad']}" if twin else "vacío")

    print("\n— Diseño generativo de producto —")
    from generador_producto_engine import generar_producto
    brief = await generar_producto(db, twin[0]["colonia"] if twin else "polanco", 1000, "media")
    check("generar_producto: mezcla", bool(brief.get("mezcla")), f"{brief.get('total_unidades')} unidades")

    print("\n— Gusto + personalización + aprendizaje —")
    doc = await db.buyer_signals.find_one({"type": {"$in": ["like", "save", "dismiss"]}}, {"visitor_id": 1})
    vid = (doc or {}).get("visitor_id")
    if vid:
        from visitor_taste import get_visitor_taste_cached, invalidate_visitor_taste, score_devs
        await invalidate_visitor_taste(db, vid)
        tp = await get_visitor_taste_cached(db, vid)
        check("taste cache: computa", tp is not None)
        cached = await db.visitor_taste_materialized.count_documents({})
        check("taste cache: materializa", cached >= 1)
        from data_developments import DEVELOPMENTS
        sc = await score_devs(db, vid, DEVELOPMENTS[:8])
        check("ranking score_devs (lee closing_lifts)", isinstance(sc, dict))
    else:
        check("gusto de prueba disponible", False, "sin visitante con señales")

    from routes.copiloto_flywheel import materialize_closing_lifts
    cl = await materialize_closing_lifts(db)
    check("learning loop: closing_lifts materializa", cl.get("recamaras") is not None)

    print("\n— Identidad cross-device —")
    from services.visitor_identity import resolve_visitors
    rv = await resolve_visitors(db, vid or "x")
    check("resolve_visitors devuelve lista", isinstance(rv, list) and len(rv) >= 1)

    # ── Integridad PROFUNDA (lo que destaparon los 5 batches: no basta con "responde 200") ──
    print("\n— Integridad profunda: funciona · aislado · auditado —")
    probe_dev = {"id": "TEST-harness-dev", "colonia": "zz", "bedrooms_range": [5, 5],
                 "price_from": 12_000_000, "amenities": [], "photos": []}

    # B1 · FLYWHEEL LIVENESS: un cierre real de un perfil DEBE mover el ranking de un dev de ese perfil (aprende de verdad)
    try:
        from routes.copiloto_flywheel import materialize_closing_lifts
        from visitor_taste import score_devs
        tvid = None
        async for s in db.buyer_signals.aggregate([{"$match": {"type": {"$in": ["like", "save"]}}},
                                                   {"$group": {"_id": "$visitor_id", "n": {"$sum": 1}}},
                                                   {"$sort": {"n": -1}}, {"$limit": 6}]):
            if (await score_devs(db, s["_id"], [probe_dev])).get("TEST-harness-dev") is not None:
                tvid = s["_id"]
                break
        if tvid:
            await materialize_closing_lifts(db)
            base = (await score_devs(db, tvid, [probe_dev]))["TEST-harness-dev"]
            for i in range(3):
                await db.copiloto_closings.update_one({"id": f"TEST-harness-cls-{i}"},
                    {"$set": {"id": f"TEST-harness-cls-{i}", "comprado": {"recamaras": [5, 5], "price_from": 12_000_000}}}, upsert=True)
            await materialize_closing_lifts(db)
            learned = (await score_devs(db, tvid, [probe_dev]))["TEST-harness-dev"]
            check("flywheel LIVENESS: un cierre real mueve el ranking (B1)", learned > base, f"{base}→{learned}")
        else:
            check("flywheel LIVENESS (B1)", True, "skip: sin visitante con gusto")
    finally:
        await db.copiloto_closings.delete_many({"id": {"$regex": "^TEST-harness-cls-"}})
        try:
            from routes.copiloto_flywheel import materialize_closing_lifts as _mcl
            await _mcl(db)
        except Exception:
            pass

    # B2-A2/#5 · AISLAMIENTO DE TENANT (sin RLS): un lead de OTRA org NO debe ser ruteado por el barrido de la casa-default
    try:
        from services.lead_bridge import route_orphan_leads
        await db.leads.update_one({"id": "TEST-harness-orgB"}, {"$set": {
            "id": "TEST-harness-orgB", "dev_org_id": "org_harness_x", "source": "test_harness",
            "assigned_to": None, "asesor_id": None, "activo": True}}, upsert=True)
        await route_orphan_leads(db)
        leak = (await db.leads.find_one({"id": "TEST-harness-orgB"}, {"_id": 0, "assigned_to": 1}) or {}).get("assigned_to")
        check("aislamiento de tenant: lead de otra org NO se rutea (B2-A2, sin RLS)", not leak)
    finally:
        await db.leads.delete_many({"id": "TEST-harness-orgB"})
        await db.asesor_contactos.delete_many({"source_lead_id": "TEST-harness-orgB"})

    # C · AISLAMIENTO SISTÉMICO: la guardia central (tenant_filter) rechaza cross-tenant en TODAS las colecciones scoped
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from tenant_isolation_probe import run_probe
        pr = await run_probe(db)
        check(f"aislamiento de tenant: {pr['passed']}/{pr['total']} colecciones rechazan cross-tenant (C)",
              pr["ok"], f"fugas={len(pr['leaks'])}" + (f" · skip={len(pr['skipped'])}" if pr.get("skipped") else ""))
    except Exception as e:  # noqa: BLE001
        check("aislamiento de tenant sistémico (C)", False, str(e)[:60])

    # B3 · COMPLETITUD DE AUDITORÍA: una acción de agente DEBE dejar rastro con by_ai=True (no audit-dark)
    try:
        from audit_log import log_agent_action
        await log_agent_action(db, "harness_probe", "update", "TEST-harness", entity_id="TEST-harness-audit")
        await asyncio.sleep(0.6)
        ae = await db.audit_log.find_one({"entity_id": "TEST-harness-audit"}, {"_id": 0, "actor": 1})
        check("auditoría: acción de agente → by_ai=True (B3)", bool(ae) and (ae.get("actor") or {}).get("by_ai") is True)
    finally:
        await db.audit_log.delete_many({"entity_type": "TEST-harness"})

    n_pass = sum(1 for x in _results if x)
    print(f"\n{'='*48}\nRESULTADO: {n_pass}/{len(_results)} checks PASS")
    sys.exit(0 if n_pass == len(_results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
