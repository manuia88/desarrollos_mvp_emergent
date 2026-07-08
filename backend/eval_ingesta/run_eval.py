"""GATE DE REGRESIÓN de la ingesta (pipeline spec §6 · golden set).

Compara el estado REAL en db.units contra los casos dorados (golden/*.json = listas de precios verificadas
a mano por el founder). Mide exactitud CAMPO POR CAMPO y truena (exit 1) si baja del umbral — así ningún
cambio de prompt/modelo entra a producción si rompe la extracción.

Uso:  ../scripts/.venv/bin/python eval_ingesta/run_eval.py [--umbral 0.95]
Loop cerrado: cada corrección humana en la cola de revisión se convierte en un nuevo golden/*.json.
"""
import argparse
import asyncio
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

# Tolerancias por campo: precio/pagos/ints exactos · m² ±0.02 (redondeo)
_M2_FIELDS = {"m2_privative", "m2_total", "m2_balcony", "m2_terrace", "m2_roof_garden", "patio_m2"}


def _match(field, expected, got):
    if expected is None:
        return got in (None, 0, False) if field in _M2_FIELDS else got in (None, False)
    if field in _M2_FIELDS:
        try:
            return got is not None and abs(float(got) - float(expected)) <= 0.02
        except (TypeError, ValueError):
            return False
    if field == "bodega":
        return bool(got) == bool(expected)
    if field == "status":
        return (got or "").strip().lower() == expected
    try:
        return got is not None and float(got) == float(expected)
    except (TypeError, ValueError):
        return got == expected


async def eval_golden(db, path):
    g = json.load(open(path))
    dev = await db.developments.find_one({"name": {"$regex": g["project_name_regex"], "$options": "i"}},
                                         {"_id": 0, "id": 1, "name": 1})
    if not dev:
        return {"golden": os.path.basename(path), "error": "proyecto no encontrado en db.developments"}
    import re as _re
    _k = lambda s: _re.sub(r"[^A-Z0-9]", "", str(s or "").upper())   # "B 1402" == "B1402"
    units = {}
    async for u in db.units.find({"development_id": dev["id"]}, {"_id": 0}):
        units[_k(u.get("unit_number"))] = u

    total = ok = 0
    fallas = []
    for exp in g["unidades_esperadas"]:
        un = _k(exp["unit_number"])
        real = units.get(un)
        if not real:
            fallas.append(f"  ✗ {un}: NO EXISTE en db.units (esperado en la lista)")
            total += len([k for k in exp if not k.startswith("_") and k != "unit_number"])
            continue
        for field, val in exp.items():
            if field.startswith("_") or field == "unit_number":
                continue
            total += 1
            got = real.get(field)
            if _match(field, val, got):
                ok += 1
            else:
                fallas.append(f"  ✗ {un}.{field}: esperado {val!r} · extraído {got!r}")
    # regla de ausencia → vendido
    for un in g.get("vendidas_por_ausencia", []):
        total += 1
        real = units.get(_k(un))
        if real is None or (real.get("status") or "").lower() == "vendido":
            ok += 1
        else:
            fallas.append(f"  ✗ {un}: ausente de la lista → debía ser 'vendido', está '{real.get('status')}'")

    # hechos del EDIFICIO (dev_esperado) — max_level/total_units/torres desde el mapa de planos
    ddoc = await db.developments.find_one({"id": dev["id"]}, {"_id": 0})
    for field, val in (g.get("dev_esperado") or {}).items():
        total += 1
        got = ddoc.get(field)
        if got == val or (isinstance(val, list) and sorted(got or []) == sorted(val)):
            ok += 1
        else:
            fallas.append(f"  ✗ dev.{field}: esperado {val!r} · extraído {got!r}")
    # anti-fantasma: la lista trae N — más unidades en db = inventario inventado
    if g.get("unidades_maximas"):
        total += 1
        if len(units) <= g["unidades_maximas"]:
            ok += 1
        else:
            fallas.append(f"  ✗ FANTASMAS: {len(units)} unidades en db, la lista solo trae {g['unidades_maximas']}")
    return {"golden": os.path.basename(path), "dev": dev["name"], "campos": total, "correctos": ok,
            "exactitud": round(ok / total, 4) if total else 0.0, "fallas": fallas}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--umbral", type=float, default=0.95)
    args = ap.parse_args()
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017")).desarrollosmx
    results = []
    for path in sorted(glob.glob(os.path.join(HERE, "golden", "*.json"))):
        results.append(await eval_golden(db, path))
    print("═" * 64)
    print("GATE DE REGRESIÓN · INGESTA — golden set")
    print("═" * 64)
    peor = 1.0
    for r in results:
        if r.get("error"):
            print(f"\n{r['golden']}: ⚠ {r['error']}")
            peor = 0.0
            continue
        icono = "✅" if r["exactitud"] >= args.umbral else "❌"
        print(f"\n{icono} {r['golden']} ({r['dev']}): {r['correctos']}/{r['campos']} campos · exactitud {r['exactitud']:.1%}")
        for f in r["fallas"]:
            print(f)
        peor = min(peor, r["exactitud"])
    print("\n" + "═" * 64)
    if peor < args.umbral:
        print(f"GATE: ❌ FALLA — exactitud mínima {peor:.1%} < umbral {args.umbral:.0%}. NO promover este cambio.")
        sys.exit(1)
    print(f"GATE: ✅ PASA — exactitud mínima {peor:.1%} ≥ umbral {args.umbral:.0%}.")


if __name__ == "__main__":
    asyncio.run(main())
