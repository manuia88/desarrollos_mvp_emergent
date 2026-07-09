"""PASE LIMPIO FINAL (aprobado founder 07-08, "adelante con los 3 · 100% datos correctos").

5 casos que cubren los 6 modos de falla, en UNA corrida limpia con TODOS los fixes (multi-torre, rango,
brochure separado, listas mixtas, chunking paginado, auto-completado). Simulacro (dry_run), tope $48.
Salida → examen3/ para calificar vs las MISMAS fuentes ya descargadas → scorecard final antes/después.
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

OUT = ("/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent/"
       "71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad/examen3")
BUDGET = 48.0

CASOS = [
    ("CLASS", "https://drive.google.com/drive/folders/1Eq4LVHS8vB9aUulqcbI5SIJgTBis-9ki", "panorama"),       # multi-torre
    ("MORE_BILU", "https://drive.google.com/drive/folders/1URaxV6OnLhhGrHsQ33M3zqlgREmMfGsA", "xenter"),      # rango
    ("D3", "https://drive.google.com/drive/folders/1wXQW1ZRGLO2gJVkz5t-7XOGQKlZh8_S7", "terralia"),           # brochure-split
    ("GDC", "https://drive.google.com/drive/folders/1urTqVT6cw89b-CDVD4SfSktxbHch2y9K", "casa roma 151|unico coyoacan"),  # mixta + chunking
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _safe(n):
    return "".join(c if c.isalnum() or c in " _-" else "_" for c in n)[:60].strip()


async def main():
    os.makedirs(OUT, exist_ok=True)
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    tot = 0.0
    lines = []
    for fuente, url, filt in CASOS:
        if tot >= BUDGET:
            print(f"[examen3] TOPE ${BUDGET} → no corre {fuente}", flush=True)
            break
        jid = f"bij_ex3_{secrets.token_urlsafe(8)}"
        await db.bulk_ingest_jobs.insert_one({
            "id": jid, "drive_folder_url": url, "target_dev_org_id": None, "dry_run": True,
            "only_project": filt, "status": "pending", "max_mxn": max(6.0, BUDGET - tot),
            "items_total": 0, "items_auto_approved": 0, "items_pending_review": 0,
            "items_rejected": 0, "items_failed": 0, "started_at": _now()})
        print(f"[examen3] ▶ {fuente} · {filt}", flush=True)
        try:
            await bie.run(db, jid)
        except Exception as e:  # noqa: BLE001
            print(f"[examen3] ✖ {fuente}: {e}", flush=True)
        async for it in db.bulk_ingest_items.find({"job_id": jid}, {"_id": 0}):
            ex = it.get("extracted") or {}
            us = ex.get("units") or []
            c = float(it.get("ai_cost_mxn") or 0)
            tot += c
            v = it.get("validacion") or {}
            with open(os.path.join(OUT, f"{fuente}__{_safe(it.get('project_folder_name') or 'x')}.json"), "w") as f:
                json.dump({"fuente": fuente, "proyecto": it.get("project_folder_name"),
                           "decision": it.get("decision"), "validacion": v, "recon_plan": it.get("recon_plan"),
                           "ai_cost_mxn": c, "extracted": ex}, f, ensure_ascii=False, indent=1, default=str)
            npre = sum(1 for u in us if u.get("price_mxn") or u.get("price_min_mxn"))
            lines.append(f"{fuente:>9} · {(it.get('project_folder_name') or '')[:30]:<30} · {str(it.get('decision')):<12} "
                         f"· units={len(us):<3} (precio {npre}) · vio={ex.get('_total_en_lista')} "
                         f"· score={v.get('score')} crit={v.get('critical_fail')} · ${c:.2f}")
            print(f"[examen3]   {lines[-1]}", flush=True)
    print(f"\n[examen3] ═══ COSTO REAL ${tot:.2f} MXN", flush=True)
    with open(os.path.join(OUT, "_RESUMEN.txt"), "w") as f:
        f.write("\n".join(lines) + f"\n\nTOTAL ${tot:.2f} · tope ${BUDGET} · {_now()}\n")

asyncio.run(main())
