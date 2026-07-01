#!/usr/bin/env python3
"""seed_far_predios.py — FAR (intensidad de construcción) + VINTAGE (edad del parque) del catastro.

Del roadmap de métricas institucionales: land intelligence "¿dónde hay potencial de desarrollo?".

Qué hace
--------
1) PREDIO: escribe `far_aprovechado = sup_construccion / sup_terreno` en cada doc de
   catastro_predios (más `far_es_estimado=False`, `far_fuente`). far bajo = predio SUBUTILIZADO
   (construyó poco de su terreno) = potencial de desarrollo.
2) COLONIA: rollup a colonia_catastro_byid (MERGE con $set, NO pisa valor_suelo_m2/predios):
   far_medio, far_mediana, pct_subutilizado, edad_media_parque, anio_medio/mediana_parque, *_n.

REUSA la fórmula del engine (backend/catastro_sig_engine.py): far_of + rollup_far_vintage + year_int
→ CERO divergencia entre lo sembrado y lo que lee far_vintage_colonia() en vivo.

DOCTRINA DEL DATO: nada inventado. Si el predio no trae superficie/año, no cuenta (fuente/confianza/
es_estimado por celda). Fuente única: Catastro SIGCDMX 2021 (oficial).

Uso
---
  # DEFAULT: siembra 1 colonia (muestra) + su rollup — seguro, rápido, verificable.
  python3 scripts/seed_far_predios.py

  # una colonia IECM concreta:
  python3 scripts/seed_far_predios.py --colonia san-bartolo-ameyalco-pblo-alvaro-obregon

  # FULL (las 1.06M predios + rollup de las ~1,788 colonias). Documentado; correr a propósito:
  python3 scripts/seed_far_predios.py --full

Idempotente (upsert por catastro_id / colonia_id). Recalcula al re-correr.
"""
import argparse
import os
import sys

from pymongo import MongoClient, UpdateOne

# Reusar la fórmula canónica del engine (misma que lee far_vintage_colonia en vivo).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from catastro_sig_engine import far_of, rollup_far_vintage, year_int, YEAR_NOW  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")
BATCH = 5000
FAR_FUENTE = "Catastro SIGCDMX 2021 (oficial)"


def seed_predio_far(db, colonia_filter=None, batch=BATCH):
    """Escribe far_aprovechado en cada predio (sup_construccion/sup_terreno). Solo predios con terreno>0.
    colonia_filter=None → TODAS (modo --full). dict → una colonia (muestra)."""
    q = {"sup_terreno": {"$gt": 0}}
    if colonia_filter:
        q.update(colonia_filter)
    cur = db.catastro_predios.find(
        q, {"_id": 0, "catastro_id": 1, "sup_construccion": 1, "sup_terreno": 1}
    )
    ops, written, skipped = [], 0, 0
    for d in cur:
        far = far_of(d.get("sup_construccion"), d.get("sup_terreno"))
        if far is None:
            skipped += 1
            continue
        ops.append(UpdateOne(
            {"catastro_id": d["catastro_id"]},
            {"$set": {"far_aprovechado": round(far, 3),
                      "far_es_estimado": False, "far_fuente": FAR_FUENTE}},
        ))
        if len(ops) >= batch:
            db.catastro_predios.bulk_write(ops, ordered=False)
            written += len(ops); ops = []
    if ops:
        db.catastro_predios.bulk_write(ops, ordered=False)
        written += len(ops)
    return {"far_escritos": written, "sin_dato": skipped}


def rollup_colonia(db, colonia_id):
    """Rollup FAR+vintage de UNA colonia IECM → $set en colonia_catastro_byid (merge, no pisa nada más)."""
    cur = db.catastro_predios.find(
        {"colonia_iecm": colonia_id, "sup_terreno": {"$gt": 0}},
        {"_id": 0, "sup_construccion": 1, "sup_terreno": 1, "anio": 1},
    )
    roll = rollup_far_vintage(cur)
    if roll.get("far_medio") is None:
        return None
    roll["far_fuente"] = FAR_FUENTE
    roll["far_es_estimado"] = False
    db.colonia_catastro_byid.update_one(
        {"colonia_id": colonia_id}, {"$set": roll}, upsert=True
    )
    return roll


def rollup_all_colonias(db):
    """Rollup de TODAS las colonias IECM presentes en el catastro (modo --full)."""
    ids = db.catastro_predios.distinct("colonia_iecm", {"colonia_iecm": {"$exists": True}})
    done = 0
    for cid in ids:
        if cid and rollup_colonia(db, cid):
            done += 1
    return {"colonias_rollup": done, "colonias_totales": len(ids)}


def pick_sample_colonia(db):
    """Colonia IECM con más predios usables (terreno+construcción) → muestra representativa."""
    pipe = [
        {"$match": {"colonia_iecm": {"$exists": True},
                    "sup_terreno": {"$gt": 0}, "sup_construccion": {"$gt": 0}}},
        {"$group": {"_id": "$colonia_iecm", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}}, {"$limit": 1},
    ]
    r = list(db.catastro_predios.aggregate(pipe, allowDiskUse=True))
    return r[0]["_id"] if r else None


def main():
    ap = argparse.ArgumentParser(description="Siembra FAR + vintage por predio y rollup por colonia.")
    ap.add_argument("--full", action="store_true", help="Todas las colonias (1.06M predios). Documentado.")
    ap.add_argument("--colonia", help="colonia_id IECM concreto (default: muestra automática).")
    args = ap.parse_args()

    db = MongoClient(MONGO_URL)[DB_NAME]

    if args.full:
        print(f"[FULL] escribiendo far_aprovechado en TODOS los predios (ref año {YEAR_NOW})…")
        r = seed_predio_far(db, colonia_filter=None)
        print(f"  predios: {r['far_escritos']:,} con FAR · {r['sin_dato']:,} sin dato")
        print("[FULL] rollup FAR+vintage de todas las colonias → colonia_catastro_byid…")
        rr = rollup_all_colonias(db)
        print(f"  colonias: {rr['colonias_rollup']:,}/{rr['colonias_totales']:,}")
        return

    # DEFAULT: 1 colonia (muestra) — segura y verificable
    cid = args.colonia or pick_sample_colonia(db)
    if not cid:
        print("Sin colonias IECM en catastro_predios. ¿Falta el spatial_join?"); return
    print(f"[MUESTRA] colonia = {cid}  (ref año {YEAR_NOW})")
    r = seed_predio_far(db, colonia_filter={"colonia_iecm": cid})
    print(f"  predios con far_aprovechado: {r['far_escritos']:,} · sin dato: {r['sin_dato']:,}")
    roll = rollup_colonia(db, cid)
    if not roll:
        print("  sin FAR agregable (revisa superficies)."); return
    print("  rollup → colonia_catastro_byid:")
    for k in ("far_medio", "far_mediana", "pct_subutilizado", "edad_media_parque",
              "anio_medio_parque", "far_n", "vintage_n"):
        print(f"    {k}: {roll.get(k)}")
    print("\nFULL: python3 scripts/seed_far_predios.py --full  (siembra las 1.06M + todas las colonias)")


if __name__ == "__main__":
    main()
