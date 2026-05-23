"""W6 seed · reviews_residents.

Seeds 60 mock reviews mixed sentiment across 12 zonas + 8 developments,
3 sources (google · foursquare · atlas). Marks with _seed_synthetic=True.

Usage:
    python backend/scripts/seed_w6_reviews_residents.py [--count 60] [--clean]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

try:
    from dotenv import load_dotenv  # noqa: E402
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")

SEED_FLAG = "_seed_synthetic"
EXT_PREFIX = "seed-w6-rv-"

ZONES = ["polanco", "roma-norte", "condesa", "doctores", "coyoacan", "del-valle",
         "santa-fe", "cuauhtemoc", "juarez", "anzures", "napoles", "escandon"]
DEVELOPMENTS = ["dev-polanco-01", "dev-roma-02", "dev-condesa-03", "dev-santafe-04",
                "dev-coyoacan-05", "dev-delvalle-06", "dev-juarez-07", "dev-napoles-08"]
SOURCES = ["google", "foursquare", "atlas"]

POSITIVE_TEXTS = [
    "Excelente ubicación · muy cerca de transporte público y restaurantes",
    "Amenidades premium · gimnasio y alberca en muy buen estado",
    "La atención del asesor fue impecable · resolvió todas mis dudas",
    "Calidad de acabados muy buena · materiales de primera",
    "Zona segura y tranquila · ideal para familia",
]
NEUTRAL_TEXTS = [
    "Ubicación buena pero faltan opciones de estacionamiento visitas",
    "El edificio cumple lo prometido · nada extraordinario",
    "Tiempo de entrega aceptable · sin retrasos significativos",
]
NEGATIVE_TEXTS = [
    "Ruido constante del tráfico exterior · ventanas no aislan bien",
    "Hubo retrasos en la entrega de 3 meses · poca comunicación",
    "Acabados con detalles a corregir post-entrega",
]

THEMES_BY_SENTIMENT = {
    "positive": [["ubicacion", "transporte"], ["amenidades", "gimnasio"], ["atencion", "asesor"],
                 ["calidad", "acabados"], ["seguridad", "zona"]],
    "neutral":  [["ubicacion", "estacionamiento"], ["cumple", "estandar"], ["entrega", "tiempo"]],
    "negative": [["ruido", "trafico"], ["retraso", "entrega"], ["acabados", "defectos"]],
}


def _now():
    return datetime.now(timezone.utc)


def _make_review(idx: int) -> dict:
    rng = random.Random(EXT_PREFIX + str(idx))
    sentiment = rng.choices(["positive", "neutral", "negative"], weights=[60, 25, 15])[0]
    text = rng.choice({"positive": POSITIVE_TEXTS, "neutral": NEUTRAL_TEXTS,
                       "negative": NEGATIVE_TEXTS}[sentiment])
    themes = rng.choice(THEMES_BY_SENTIMENT[sentiment])

    rating = {"positive": rng.choice([4, 5, 5]), "neutral": 3,
              "negative": rng.choice([1, 2, 2])}[sentiment]

    is_zone = rng.random() < 0.5
    entity_type = "zone" if is_zone else "development"
    entity_id = rng.choice(ZONES) if is_zone else rng.choice(DEVELOPMENTS)
    src = rng.choice(SOURCES)

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "source": src,
        "external_id": f"{EXT_PREFIX}{idx:04d}",
        "author": f"Usuario {idx:04d}",
        "rating": float(rating),
        "text": text,
        "language": "es",
        "place_name": entity_id.replace("-", " ").title(),
        "sentiment": sentiment,
        "themes": themes,
        "confidence": round(rng.uniform(0.7, 0.95), 2),
        "reported_at": _now() - timedelta(days=rng.randint(1, 365)),
        "ingested_at": _now(),
        "version": "seed-w6",
        SEED_FLAG: True,
    }


async def run_seed(db, count: int) -> dict:
    inserted = 0
    skipped = 0
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    for i in range(count):
        doc = _make_review(i)
        existing = await db.reviews_residents.find_one({"external_id": doc["external_id"]}, {"_id": 1})
        if existing:
            skipped += 1
            continue
        await db.reviews_residents.insert_one(doc)
        inserted += 1
        counts[doc["sentiment"]] += 1

    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "seed-script", "role": "system"},
            action="seed.w6.reviews_residents",
            entity_type="seed_batch",
            entity_id=f"reviews-{_now().isoformat()}",
            before=None,
            after={"inserted": inserted, "skipped": skipped, "sentiment_breakdown": counts},
        )
    except Exception as exc:
        print(f"  [warn] audit log skipped: {exc}")

    return {"inserted": inserted, "skipped": skipped, "sentiment_breakdown": counts}


async def run_clean(db) -> dict:
    rv = await db.reviews_residents.delete_many({"external_id": {"$regex": f"^{EXT_PREFIX}"}})
    return {"reviews_deleted": rv.deleted_count}


async def main():
    parser = argparse.ArgumentParser(description="Seed W6 reviews residents")
    parser.add_argument("--count", type=int, default=60)
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    if args.clean:
        print("Cleaning W6 reviews seeds...")
        res = await run_clean(db)
        print(f"  cleaned: {res}")
    else:
        print(f"Seeding W6 reviews · count={args.count}...")
        res = await run_seed(db, args.count)
        print(f"  done: {res}")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
