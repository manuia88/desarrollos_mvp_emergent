"""RE-EXAMEN de los reprobados (aprobado founder 07-08, "adelante").

Corre en SIMULACRO (dry_run, cero escrituras) los 11 proyectos que fallaron/salieron débiles en el
examen 1, ahora con los 7 fixes + los 7 hallazgos de la revisión adversarial. Captura COSTO REAL por
tokens (FIX 6) y tope de presupuesto (max_mxn) que corta la corrida si se pasa. Cubre los 6 modos de falla:

  cascarón-vacío  → Terralia, Casa Roma 151, Unico Coyoacan   (FIX 1/2)
  multi-torre     → Splendor, Panorama                         (FIX 2)
  building map    → Casa Roma 350                              (FIX 3)
  listas de rango → Bilú, Xenter                               (FIX 4)
  bajo score      → Bolívar 577, Amsterdam, More Escandón      (varios)

Dump por proyecto → scratchpad/examen2/ para re-calificar contra las MISMAS fuentes ya descargadas.
"""
import asyncio
import json
import os
import secrets
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient

OUT_DIR = ("/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent/"
           "71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad/examen2")
BUDGET_MXN = 70.0   # tope duro: la corrida se detiene si lo alcanza (FIX 6)

REEXAMEN = [
    ("CLASS", "https://drive.google.com/drive/folders/1Eq4LVHS8vB9aUulqcbI5SIJgTBis-9ki",
     "splendor|panorama"),
    ("GDC", "https://drive.google.com/drive/folders/1urTqVT6cw89b-CDVD4SfSktxbHch2y9K",
     "casa roma 151|casa roma 350|unico coyoacan"),
    ("DECA", "https://drive.google.com/drive/folders/1wNGvwGlzHPtAqZy-3zyslQQOiSY-h-oF",
     "bolivar 577"),
    ("MORE_BILU", "https://drive.google.com/drive/folders/1URaxV6OnLhhGrHsQ33M3zqlgREmMfGsA",
     "bilú|more escandon|xenter"),
    ("D3", "https://drive.google.com/drive/folders/1wXQW1ZRGLO2gJVkz5t-7XOGQKlZh8_S7",
     "amsterdam|terralia"),
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe(name):
    return "".join(c if c.isalnum() or c in " _-" else "_" for c in name)[:60].strip()


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie

    total_cost = 0.0
    resumen = []
    for fuente, url, filtros in REEXAMEN:
        if total_cost >= BUDGET_MXN:
            print(f"[re-examen] TOPE ${BUDGET_MXN} alcanzado → no se corre {fuente}", flush=True)
            break
        job_id = f"bij_reexam_{secrets.token_urlsafe(8)}"
        await db.bulk_ingest_jobs.insert_one({
            "id": job_id, "drive_folder_url": url, "target_dev_org_id": None,
            "dry_run": True, "only_project": filtros, "status": "pending",
            "max_mxn": max(5.0, BUDGET_MXN - total_cost),   # presupuesto que le queda a esta fuente
            "items_total": 0, "items_auto_approved": 0, "items_pending_review": 0,
            "items_rejected": 0, "items_failed": 0, "started_at": _now(),
            "exam": True, "exam_fuente": fuente,
        })
        print(f"[re-examen] ▶ {fuente} · {filtros}", flush=True)
        try:
            await bie.run(db, job_id)
        except Exception as e:  # noqa: BLE001
            print(f"[re-examen] ✖ {fuente}: {e}", flush=True)

        async for it in db.bulk_ingest_items.find({"job_id": job_id}, {"_id": 0}):
            name = (it.get("project_folder_name") or "sin_nombre").strip()
            cost = float(it.get("ai_cost_mxn") or 0)
            total_cost += cost
            ex = it.get("extracted") or {}
            with open(os.path.join(OUT_DIR, f"{fuente}__{_safe(name)}.json"), "w") as f:
                json.dump({"fuente": fuente, "proyecto": name, "decision": it.get("decision"),
                           "validacion": it.get("validacion"), "anchored": it.get("anchored"),
                           "recon_plan": it.get("recon_plan"), "ai_cost_mxn": cost,
                           "ai_usage": ex.get("_ai_usage"), "extracted": ex, "error": it.get("error")},
                          f, ensure_ascii=False, indent=1, default=str)
            n_units = len(ex.get("units") or [])
            n_precio = sum(1 for u in (ex.get("units") or []) if u.get("price_mxn") or u.get("price_min_mxn"))
            score = (it.get("validacion") or {}).get("score")
            crit = (it.get("validacion") or {}).get("critical_fail")
            resumen.append(f"{fuente:>9} · {name[:34]:<34} · {str(it.get('decision')):<12} · units={n_units:<3} "
                           f"(precio {n_precio}) · score={score} crit={crit} · ${cost:.2f}")
            print(f"[re-examen]   {resumen[-1]}", flush=True)

    print(f"\n[re-examen] ═══ COMPLETO · COSTO REAL ${total_cost:.2f} MXN · {len(resumen)} items", flush=True)
    with open(os.path.join(OUT_DIR, "_RESUMEN.txt"), "w") as f:
        f.write("\n".join(resumen) + f"\n\nTOTAL REAL ${total_cost:.2f} MXN · tope ${BUDGET_MXN} · {_now()}\n")

asyncio.run(main())
