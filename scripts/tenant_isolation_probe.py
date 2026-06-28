#!/usr/bin/env python3
"""Probe ADVERSARIAL de aislamiento de tenant (upgrade C) — la red contra el cross-tenant recurrente.

CONTEXTO: no hay RLS; el aislamiento depende de que cada acceso use la guardia central `tenant_scope.tenant_filter`.
Las fugas pasan cuando una función NO la usa. Este probe verifica SISTEMÁTICAMENTE, para CADA colección
tenant-scoped (`_OWNER_FIELDS`), que la guardia central:
  (a) NO es god-view para un no-superadmin con tenant (si devuelve {} → fuga),
  (b) EXCLUYE un doc de OTRA org,
  (c) INCLUYE el doc de la PROPIA org (no rompe el caso legítimo).
Tagueado `TEST-tenant-probe` + teardown. Importable (`run_probe`) para el harness, o standalone.

Uso:  scripts/.venv/bin/python3 scripts/tenant_isolation_probe.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-tenant-probe"
_ORGA = "ORGA-probe"
_ORGB = "ORGB-probe"


class _User:
    """Usuario mínimo no-superadmin para probar la guardia (tenant_of lee tenant_id/org_id; actor_id lee user_id)."""
    def __init__(self, tenant, uid):
        self.role = "developer_admin"
        self.tenant_id = tenant
        self.org_id = tenant
        self.user_id = uid


async def run_probe(db) -> dict:
    from tenant_scope import tenant_filter, _OWNER_FIELDS
    userA = _User(_ORGA, f"{_ORGA}-user")
    userB = _User(_ORGB, f"{_ORGB}-user")
    results, leaks, skipped = [], [], []
    for coll, fields in _OWNER_FIELDS.items():
        # doc 100% de ORGA (todos los owner-fields = ORGA) + id único (colecciones con índice unique en id)
        doc = {"id": f"{TAG}-{coll}", "_probe_tag": TAG, **{f: _ORGA for f in fields}}
        try:
            await db[coll].delete_many({"_probe_tag": TAG})   # limpia residuo previo si lo hubo
            await db[coll].insert_one(dict(doc))
            fB = tenant_filter(userB, coll)
            fA = tenant_filter(userA, coll)
            godview = (fB == {})                                   # (a) no debe ser god-view
            seen_by_b = 1 if godview else await db[coll].count_documents({"_probe_tag": TAG, **fB})
            seen_by_a = await db[coll].count_documents({"_probe_tag": TAG, **fA})
            ok = (not godview) and (seen_by_b == 0) and (seen_by_a >= 1)
            results.append(ok)
            if not ok:
                leaks.append({"coll": coll, "godview": godview, "B_ve": seen_by_b, "A_ve": seen_by_a})
        except Exception as e:  # noqa: BLE001
            skipped.append({"coll": coll, "err": str(e)[:80]})
        finally:
            try:
                await db[coll].delete_many({"_probe_tag": TAG})
            except Exception:  # noqa: BLE001
                pass
    return {"ok": len(leaks) == 0, "passed": sum(results), "total": len(_OWNER_FIELDS),
            "leaks": leaks, "skipped": skipped}


async def _main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    r = await run_probe(db)
    print(f"\nAISLAMIENTO DE TENANT — {r['passed']}/{r['total']} colecciones OK")
    for lk in r["leaks"]:
        print(f"  ❌ FUGA · {lk['coll']}: godview={lk['godview']} B_ve={lk['B_ve']} A_ve={lk['A_ve']}")
    if r.get("error"):
        print("  error:", r["error"])
    sys.exit(0 if r["ok"] else 1)


if __name__ == "__main__":
    asyncio.run(_main())
