"""Mina las listas DECA restantes (idempotente: salta las 13 ya hechas). Fondo real, sin límite de tiempo."""
import asyncio
import os

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    conn = await bie._resolve_drive_conn(db, None)
    from historic_miner import mine
    URL = "https://drive.google.com/drive/folders/1wNGvwGlzHPtAqZy-3zyslQQOiSY-h-oF"
    res = await mine(db, conn, URL, plan_only=False, max_listas=24)
    print(f"[deca-rest] minadas={res.get('listas_minadas')} eventos_precio={res.get('eventos_precio_retro')} "
          f"ventas={res.get('ventas_retro')}", flush=True)
    n = await db.lista_snapshots.count_documents({"retro": True})
    print(f"[deca-rest] total snapshots retro ahora: {n}", flush=True)

asyncio.run(main())
