"""EXAMEN DE EFICIENCIA DEL PIPELINE (aprobado por founder 07-08).

Founder: "que cada drive pase por las 5 estructuras de prueba, a 3 proyectos de cada
drive... y vemos la eficiencia del modelo. si consideras subir a 5 para mejorar la data, hazlo."

17 proyectos NUNCA usados para afinar (anti-contaminación), 5 fuentes, pipeline COMPLETO
(recon + brochures + planos + listas + cruces + candado) en modo SIMULACRO (dry_run:
CERO escrituras a la plataforma). GDC va con 5 por ser el drive más complejo
(3 contenedores por etapa + casas + torres + vendidos + etapa-en-carpeta).

Salida: un JSON por proyecto en el scratchpad para calificación campo-por-campo
(% crudo + % post-candado, por familia). Costo estimado: ~$60 MXN.
"""
import asyncio
import json
import os
import secrets
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend"))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient

OUT_DIR = os.environ.get(
    "EXAM_OUT",
    "/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent/"
    "71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad/examen")

# fuente → (url, filtros de proyecto separados por |)
EXAMEN = [
    ("CLASS", "https://drive.google.com/drive/folders/1Eq4LVHS8vB9aUulqcbI5SIJgTBis-9ki",
     "splendor|illinois|panorama"),
    ("GDC", "https://drive.google.com/drive/folders/1urTqVT6cw89b-CDVD4SfSktxbHch2y9K",
     "casa roma 151|icon hamburgo|unico coyoacan|casa roma 350|torre bell"),
    ("DECA", "https://drive.google.com/drive/folders/1wNGvwGlzHPtAqZy-3zyslQQOiSY-h-oF",
     "avc1525|bolivar 577|providencia"),
    ("MORE_BILU", "https://drive.google.com/drive/folders/1URaxV6OnLhhGrHsQ33M3zqlgREmMfGsA",
     "bilú|more escandon|xenter"),
    ("D3", "https://drive.google.com/drive/folders/1wXQW1ZRGLO2gJVkz5t-7XOGQKlZh8_S7",
     "amsterdam|campeche|terralia"),
]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie

    total_cost = 0.0
    resumen = []
    for fuente, url, filtros in EXAMEN:
        job_id = f"bij_exam_{secrets.token_urlsafe(8)}"
        await db.bulk_ingest_jobs.insert_one({
            "id": job_id, "drive_folder_url": url, "target_dev_org_id": None,
            "dry_run": True, "only_project": filtros, "status": "pending",
            "items_total": 0, "items_auto_approved": 0, "items_pending_review": 0,
            "items_rejected": 0, "items_failed": 0, "started_at": _now(),
            "exam": True, "exam_fuente": fuente,
        })
        print(f"[examen] ▶ {fuente} · filtros: {filtros}", flush=True)
        try:
            await bie.run(db, job_id)
        except Exception as e:  # noqa: BLE001
            print(f"[examen] ✖ {fuente}: {e}", flush=True)

        async for it in db.bulk_ingest_items.find({"job_id": job_id}, {"_id": 0}):
            name = (it.get("project_folder_name") or "sin_nombre").strip()
            safe = "".join(c if c.isalnum() or c in " _-" else "_" for c in name)[:60].strip()
            cost = float(it.get("ai_cost_mxn") or 0)
            total_cost += cost
            dump = {
                "fuente": fuente, "proyecto": name, "decision": it.get("decision"),
                "validacion": it.get("validacion"), "anchored": it.get("anchored"),
                "recon_plan": it.get("recon_plan"), "ai_cost_mxn": cost,
                "extracted": it.get("extracted"), "error": it.get("error"),
            }
            path = os.path.join(OUT_DIR, f"{fuente}__{safe}.json")
            with open(path, "w") as f:
                json.dump(dump, f, ensure_ascii=False, indent=1, default=str)
            ex = it.get("extracted") or {}
            n_units = len(ex.get("units") or [])
            score = (it.get("validacion") or {}).get("score")
            resumen.append(f"{fuente:>9} · {name[:38]:<38} · {it.get('decision'):<14} "
                           f"· units={n_units:<3} · score={score} · ${cost:.1f}")
            print(f"[examen]   {resumen[-1]}", flush=True)

    print(f"\n[examen] ═══ COMPLETO · costo total ${total_cost:.1f} MXN · {len(resumen)} items", flush=True)
    with open(os.path.join(OUT_DIR, "_RESUMEN.txt"), "w") as f:
        f.write("\n".join(resumen) + f"\n\nTOTAL ${total_cost:.1f} MXN · {_now()}\n")

asyncio.run(main())
