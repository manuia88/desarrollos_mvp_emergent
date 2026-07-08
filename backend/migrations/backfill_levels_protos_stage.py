"""Backfill 07-08 (auditoría visual founder): datos derivados MAL o faltantes en lo ya ingerido.

1. UNIDADES: level desde el número de depto (803→8 · 1105→11 · GH01→0 · PH→nivel máximo) donde falte;
   prototype por TERMINACIÓN (validando configs — reusa _derive_prototypes) donde diga 'depto'.
2. DEV: stage='entrega' si delivery dice 'inmediata' (antes quedaba 'preventa' contradictorio);
   max_level = nivel máximo real; total_units = max(extraído, unidades reales en db).
3. Re-sync del átomo (position.piso ahora llena → IE_UNIT_NIVEL_PREMIUM computable).

Idempotente. Uso:  ../scripts/.venv/bin/python migrations/backfill_levels_protos_stage.py
"""
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


def _level_from_number(un: str, max_num_level: int) -> int | None:
    """'803'→8 · '1105'→11 · '103'→1 · 'GH01'→0 (planta baja) · 'PH02'→nivel máximo (arriba de todo)."""
    s = str(un or "").strip().upper()
    if s.startswith("GH"):
        return 0
    if s.startswith("PH"):
        return max_num_level if max_num_level > 0 else None
    m = re.fullmatch(r"(\d{3,4})[A-Z]?", re.sub(r"[^A-Z0-9]", "", s))
    if not m:
        return None
    d = m.group(1)
    return int(d[:-2])   # los últimos 2 dígitos son el depto; lo demás es el piso


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017")).desarrollosmx
    from bulk_ingest_engine import _derive_prototypes

    devs = [d async for d in db.developments.find({"source": "bulk_ingest"}, {"_id": 0})]
    lv_fix = pr_fix = st_fix = 0
    for d in devs:
        units = [u async for u in db.units.find({"development_id": d["id"]}, {"_id": 0})]
        if not units:
            continue
        # nivel numérico máximo presente (para ubicar PH arriba)
        nums = []
        for u in units:
            m = re.fullmatch(r"(\d{3,4})[A-Z]?", re.sub(r"[^A-Z0-9]", "", str(u.get("unit_number") or "").upper()))
            if m:
                nums.append(int(m.group(1)[:-2]))
        max_num = max(nums) if nums else 0
        # 1a · level faltante desde el número
        for u in units:
            if u.get("level") is None:
                lv = _level_from_number(u.get("unit_number"), max_num)
                if lv is not None:
                    u["level"] = lv
                    await db.units.update_one({"id": u["id"]}, {"$set": {"level": lv}})
                    lv_fix += 1
        # 1b · prototype por terminación donde quedó el placeholder 'depto' (configs validadas)
        pseudo = {"units": [{**u, "prototype": (None if u.get("prototype") in (None, "depto", "casa") else u.get("prototype")),
                             "size_m2": u.get("size_m2") or u.get("m2_privative"),
                             "m2_interior": u.get("m2_privative")} for u in units]}
        _derive_prototypes(pseudo)
        for u, pu in zip(units, pseudo["units"]):
            if pu.get("prototype") and u.get("prototype") in (None, "depto", "casa"):
                await db.units.update_one({"id": u["id"]}, {"$set": {"prototype": pu["prototype"]}})
                u["prototype"] = pu["prototype"]
                pr_fix += 1
        # 2 · dev: stage desde texto de entrega + max_level + total_units real
        patch = {}
        deliv = str(d.get("delivery_estimate") or "")
        if re.search(r"(?i)inmediata", deliv) and (d.get("stage") or "") != "entrega":
            patch["stage"] = "entrega"
            st_fix += 1
        levels = [u.get("level") for u in units if u.get("level") is not None]
        if levels and d.get("max_level") != max(levels):
            patch["max_level"] = max(levels)
        if len(units) > (d.get("total_units") or 0):
            patch["total_units"] = len(units)
        if patch:
            await db.developments.update_one({"id": d["id"]}, {"$set": patch})

    print(f"[backfill] niveles: {lv_fix} · prototipos: {pr_fix} · etapa corregida: {st_fix} devs")

    # 3 · re-sync átomo (piso ahora presente) — idempotente
    from dmx_cube_feed import sync_ingested_to_atom
    r = await sync_ingested_to_atom(db)
    print(f"[backfill] átomos re-sincronizados: {r.get('synced')}")

    # verificación Nupol
    d = await db.developments.find_one({"id": "dev_Ok0vj85JJ_tO_g"}, {"_id": 0, "stage": 1, "max_level": 1, "total_units": 1})
    print(f"[verify] Nupol: stage={d.get('stage')} max_level={d.get('max_level')} total_units={d.get('total_units')}")
    sample = [u async for u in db.units.find({"development_id": "dev_Ok0vj85JJ_tO_g", "unit_number": {"$in": ["103", "902", "803"]}},
                                             {"_id": 0, "unit_number": 1, "level": 1, "prototype": 1})]
    print(f"[verify] unidades: {sample}")


if __name__ == "__main__":
    asyncio.run(main())
