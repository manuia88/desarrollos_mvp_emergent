"""Carga Sennse Liverpool al catálogo — proyecto PILOTO de Estrategia Urbana.

Piloto a propósito: se valida el patrón con UN proyecto antes de los otros 8 (playbook §1.5,
"nunca big-bang"). Lo que aquí funcione se repite; lo que falle se corrige una vez.

FUENTES Y QUÉ MANDA EN CADA CAMPO (jerarquía D2):
  · unidades, precios, m², vista, nivel  → `130726 Liverpool Lista de precios comparativo.pdf`
    (V16). Es la fuente más granular: trae los 4 esquemas MÁS Nivel/Interiores/Balcón/Roof, que
    las listas sueltas no tienen.
  · totales del edificio, dirección, amenidades → el brochure `270526 PDV-LIVERPOOL 108.pdf`.
    Regla del founder: la LISTA son los disponibles; el BROCHURE dice cuántos son en total.
  · verificación independiente → la lista suelta `contado.pdf`: 23 de 23 departamentos coinciden
    al peso con la columna "90% 10%" del comparativo. Dos archivos distintos dicen lo mismo.

ESTATUS HONESTO: el brochure dice 66 departamentos y la lista trae 23 → 43 no aparecen. Por la
regla del founder (07-25) eso NO es "bloqueado": si desapareció de la lista, se cuenta como
colocado. El motor de agregados ya lo calcula solo (`units_sold_por_ausencia`).

USO:  python scripts/cargar_liverpool.py [--aplicar]
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
import motor.motor_asyncio  # noqa: E402
from extraer_estrategia_urbana import a_unidad, leer_comparativo  # noqa: E402

DEV_ID = "dev_eu_sennse_liverpool"
ORG = "org_estrategia_urbana"

# Del brochure (leído, no supuesto): "Liverpool 108, Col. Juárez, 06600, Ciudad de México",
# "12 Niveles", "66 Departamentos", "1 y 2 Recámaras".
BROCHURE = {
    "name": "Sennse Liverpool",          # con la marca: sin ella choca con otros edificios (L22)
    "address": "Liverpool 108, Col. Juárez, 06600, Ciudad de México",
    "colonia": "Juárez", "alcaldia": "Cuauhtémoc", "city": "Ciudad de México", "cp": "06600",
    "total_units": 66,
    "levels": 12,
    "amenities": ["Gimnasio", "Garden", "Asadores", "Roof Garden", "Roof Office",
                  "Lavandería", "Bici estacionamiento", "Lobby", "Roof top común"],
    "fuente": "270526 PDV-LIVERPOOL 108.pdf (brochure del dev, leído 2026-07-26)",
}


async def main(aplicar: bool) -> int:
    pdf = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith(".pdf") else os.environ.get("LISTA_PDF")
    if not pdf:
        print("falta la ruta del comparativo (argumento o LISTA_PDF)")
        return 2
    r = leer_comparativo(pdf)
    unidades = [a_unidad(u, r["esquemas"], r["archivo"]) for u in r["unidades"]]
    deptos = [u for u in unidades if u["type"] == "depto"]

    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)[os.environ["DB_NAME"]]

    ahora = datetime.now(timezone.utc)
    dev = {
        "id": DEV_ID, "developer_id": ORG, "dev_org_id": ORG,
        **{k: v for k, v in BROCHURE.items() if k != "fuente"},
        "marca": "SENNSE",
        "stage": "preventa",
        "source": "ingesta_en_sesion",
        "total_units_fuente": BROCHURE["fuente"],
        "lista_fuente": r["archivo"],
        "lista_periodo": r["periodo"], "lista_version": r["version"],
        # Se publica solo cuando el founder lo apruebe (playbook §1.7: su clic es la única puerta)
        "marketplace_published": "pending", "published": False,
        "created_at": ahora, "updated_at": ahora,
    }

    esquemas_doc = {
        "project_id": DEV_ID,
        "schemes": [{k: v for k, v in e.items() if k != "etiqueta_fuente"} for e in r["esquemas"]],
        "fuente": r["archivo"], "actualizado": ahora,
    }

    print(f"════ {'APLICANDO' if aplicar else 'SIMULACIÓN'} · {BROCHURE['name']} ════")
    print(f"  {BROCHURE['address']}")
    print(f"  {BROCHURE['total_units']} departamentos en total (brochure) · {len(deptos)} en la lista"
          f" → {BROCHURE['total_units'] - len(deptos)} ya colocados")
    print(f"  + {len(unidades) - len(deptos)} roof gardens a la venta por separado")
    print(f"  {len(r['esquemas'])} esquemas de pago · {len(BROCHURE['amenities'])} amenidades")

    if not aplicar:
        print("\n  (simulación · no se escribió nada)")
        return 0

    await db.developments.update_one({"id": DEV_ID}, {"$set": dev}, upsert=True)
    await db.dev_payment_schemes.update_one({"project_id": DEV_ID}, {"$set": esquemas_doc}, upsert=True)
    await db.units.delete_many({"development_id": DEV_ID})   # recarga limpia del piloto
    for i, u in enumerate(unidades):
        u.update({"id": f"unit_eu_liv_{u['unit_number'].replace(' ', '').replace('-', '')}",
                  "development_id": DEV_ID, "developer_id": ORG,
                  "source": "ingesta_en_sesion", "created_at": ahora, "listed_at": ahora})
    await db.units.insert_many(unidades)

    print(f"\n  ✅ desarrollo creado · {len(unidades)} unidades · {len(r['esquemas'])} esquemas")
    print("  ⏸️  queda SIN publicar hasta tu visto bueno")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--aplicar" in sys.argv)))
