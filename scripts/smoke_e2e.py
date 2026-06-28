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

    n_pass = sum(1 for x in _results if x)
    print(f"\n{'='*48}\nRESULTADO: {n_pass}/{len(_results)} checks PASS")
    sys.exit(0 if n_pass == len(_results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
