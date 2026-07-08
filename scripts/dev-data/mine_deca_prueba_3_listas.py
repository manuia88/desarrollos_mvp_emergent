"""PRUEBA APROBADA POR EL FOUNDER (07-08): minar 3 listas históricas del drive DECA.

Founder: "solo deca, empieza por prueba y si sale bien, avanzamos con los demas."
Costo estimado: ~$2 MXN (3 listas × ~$0.6). Corre historic_miner.mine() sobre
3 proyectos vendidos de épocas distintas: Canarias 1117 (2025), AVC 1129 (2023),
Asturias 188 (2019). Escribe lista_snapshots + comparables de zona retro.
NO crea fichas públicas ni toca developments.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient

DECA_URL = "https://drive.google.com/drive/folders/1wNGvwGlzHPtAqZy-3zyslQQOiSY-h-oF"
PRUEBA = ("canarias 1117", "avc 1129", "asturias 188")


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    conn = await bie._resolve_drive_conn(db, None)
    from historic_miner import mine
    for proj in PRUEBA:
        res = await mine(db, conn, DECA_URL, only_project=proj, plan_only=False, max_listas=1)
        print(f"── {proj}: minadas={res.get('listas_minadas')} "
              f"eventos_precio={res.get('eventos_precio_retro')} ventas_retro={res.get('ventas_retro')}")
    # mostrar lo extraído para validación del founder
    async for s in db.lista_snapshots.find({"retro": True}, {"_id": 0, "units": {"$slice": 60}}):
        print(f"\n═══ {s['dev_name']} · {s['fecha']} · {s['source_file']}")
        print(f"    cerrado={s.get('cerrado')} colonia_id={s.get('colonia_id')} "
              f"$/m² mediano={s.get('price_m2_median')}")
        for u in s.get("units", []):
            print(f"    {str(u.get('unit_number')):>8} · ${u.get('price'):>12,} · {u.get('status')}"
                  if u.get("price") else f"    {str(u.get('unit_number')):>8} · s/precio · {u.get('status')}")

asyncio.run(main())
