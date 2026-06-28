#!/usr/bin/env python3
"""DEV PUBLICA → MARKETPLACE — verifica que un proyecto del wizard (db.projects) aparece en el marketplace público
(listado + detalle) con el gate de calidad/publicación, y que el superadmin puede despublicarlo. Cero-residuo.

Uso:  scripts/.venv/bin/python3 scripts/dev_publish_marketplace.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

TAG = "TEST-pub"
PID = f"{TAG}-proj"
_res = []


def chk(name, ok, detail=""):
    _res.append(ok)
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


async def main():
    db = AsyncIOMotorClient("mongodb://localhost:27017").desarrollosmx
    from routes.public import _published_wizard_cards, _project_to_dev_card
    base_projects = await db.projects.count_documents({})
    try:
        # ── proyecto INCOMPLETO (sin precio) → NO debe publicarse (gate de calidad) ──
        await db.projects.update_one({"id": f"{TAG}-incompleto"},
            {"$set": {"id": f"{TAG}-incompleto", "name": "Incompleto", "colonia_id": "roma_norte",
                      "created_via": "wizard"}}, upsert=True)
        cards = await _published_wizard_cards(db)
        chk("proyecto SIN precio NO aparece (gate de calidad)", not any(c["id"] == f"{TAG}-incompleto" for c in cards))

        # ── proyecto COMPLETO del wizard → debe aparecer en el marketplace ──
        await db.projects.update_one({"id": PID},
            {"$set": {"id": PID, "name": "Torre Test Wizard", "colonia": "Roma Norte", "colonia_id": "roma_norte",
                      "municipio": "Cuauhtémoc", "stage": "preventa", "tipo_proyecto": "departamentos",
                      "price_from": 4_200_000, "total_units": 30, "dev_org_id": f"{TAG}-org",
                      "created_via": "wizard"}}, upsert=True)
        cards = await _published_wizard_cards(db)
        card = next((c for c in cards if c["id"] == PID), None)
        chk("proyecto COMPLETO del wizard aparece en el marketplace", bool(card))
        chk("la tarjeta trae los campos que usan listado+filtros", bool(card and card.get("colonia_id") and card.get("price_from") and card.get("property_type") and card.get("stage")),
            f"colonia={card.get('colonia_id') if card else None} precio={card.get('price_from') if card else None} tipo={card.get('property_type') if card else None}")
        chk("marcado source='wizard' + verified=False (distinto del catálogo curado)", bool(card and card.get("source") == "wizard" and card.get("verified") is False))

        # ── detalle: la ficha pública resuelve el proyecto del wizard ──
        proj = await db.projects.find_one({"id": PID, "marketplace_published": {"$ne": False}}, {"_id": 0})
        detail = _project_to_dev_card(proj) if proj else None
        chk("la ficha pública del detalle resuelve el proyecto del wizard", bool(detail and detail.get("name") == "Torre Test Wizard"))

        # ── superadmin DESPUBLICA → desaparece del marketplace ──
        await db.projects.update_one({"id": PID}, {"$set": {"marketplace_published": False}})
        cards = await _published_wizard_cards(db)
        chk("superadmin puede DESPUBLICAR (gate de control)", not any(c["id"] == PID for c in cards))
    finally:
        await db.projects.delete_many({"id": {"$regex": f"^{TAG}-"}})

    after = await db.projects.count_documents({})
    chk("cero-residuo", after == base_projects, f"{after}=={base_projects}")

    n = sum(1 for x in _res if x)
    print(f"\n{'='*52}\nDEV PUBLICA → MARKETPLACE — {n}/{len(_res)} PASS")
    sys.exit(0 if n == len(_res) else 1)


if __name__ == "__main__":
    asyncio.run(main())
