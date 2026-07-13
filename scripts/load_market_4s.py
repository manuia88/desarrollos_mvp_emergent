#!/usr/bin/env python3
"""Carga el dato real de mercado 4S a Mongo. Cero costo de API. Idempotente.

Uso:  scripts/.venv/bin/python scripts/load_market_4s.py [mongo_url] [db_name]
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


async def main():
    from motor.motor_asyncio import AsyncIOMotorClient
    from market_4s_loader import load_market_4s

    mongo = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    dbname = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("DB_NAME", "desarrollosmx")
    db = AsyncIOMotorClient(mongo)[dbname]
    summary = await load_market_4s(db)
    print("Cargado a Mongo:", summary)


if __name__ == "__main__":
    asyncio.run(main())
