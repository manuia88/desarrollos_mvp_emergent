"""EXAMEN · paso 2 (GRATIS): baja los documentos fuente de cada proyecto examinado
para calificar la extracción campo-por-campo. Solo descargas de Drive — cero IA.

Por proyecto: TREE.txt (árbol completo de archivos — para juzgar el recon y el
anti-fantasma) + las fuentes clave que el recon eligió (listas, brochure, fichas,
planos muestra), con tope de tamaño.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend"))
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend"))

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local", override=True)

from motor.motor_asyncio import AsyncIOMotorClient

BASE = ("/private/tmp/claude-501/-Users-manuelacosta-Developer-desarrollos-mvp-emergent/"
        "71957709-de6c-409e-8543-2c59c1c9cf67/scratchpad/examen")

EXAMEN = [
    ("CLASS", "1Eq4LVHS8vB9aUulqcbI5SIJgTBis-9ki", ["splendor", "illinois", "panorama"]),
    ("GDC", "1urTqVT6cw89b-CDVD4SfSktxbHch2y9K",
     ["casa roma 151", "icon hamburgo", "unico coyoacan", "casa roma 350", "torre bell"]),
    ("DECA", "1wNGvwGlzHPtAqZy-3zyslQQOiSY-h-oF", ["avc1525", "bolivar 577", "providencia"]),
    ("MORE_BILU", "1URaxV6OnLhhGrHsQ33M3zqlgREmMfGsA", ["bilú", "more escandon", "xenter"]),
    ("D3", "1wXQW1ZRGLO2gJVkz5t-7XOGQKlZh8_S7", ["amsterdam", "campeche", "terralia"]),
]

MAX_BYTES = 15 * 1024 * 1024


def _safe(name):
    return "".join(c if c.isalnum() or c in " _-" else "_" for c in name)[:60].strip()


async def main():
    db = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))["desarrollosmx"]
    import bulk_ingest_engine as bie
    conn = await bie._resolve_drive_conn(db, None)

    for fuente, fid, filtros in EXAMEN:
        files = await bie._list_folder_recursive(conn, fid)
        groups = bie._group_by_project(files, fid)
        for g in groups.values():
            pname = g["parent_folder_name"] or ""
            if not any(f in pname.lower() for f in filtros):
                continue
            pdir = os.path.join(BASE, "fuentes", f"{fuente}__{_safe(pname)}")
            os.makedirs(pdir, exist_ok=True)
            # árbol completo (nombres) — para juzgar recon y anti-fantasma
            with open(os.path.join(pdir, "TREE.txt"), "w") as f:
                for x in g["files"]:
                    f.write(f"{x.get('immediate_folder') or '(raíz)'}/{x.get('name')}\n")
            # fuentes clave según el plan del recon guardado en el dump del examen
            dump_path = os.path.join(BASE, f"{fuente}__{_safe(pname)}.json")
            pick_names = []
            if os.path.exists(dump_path):
                with open(dump_path) as f:
                    dump = json.load(f)
                plan = dump.get("recon_plan") or {}
                pick_names = ((plan.get("listas_precios") or [])[:3] + (plan.get("brochure") or [])[:2]
                              + (plan.get("fichas_por_depto") or [])[:3]
                              + (plan.get("planos_prototipo") or [])[:4] + (plan.get("planos_nivel") or [])[:2])
            else:
                print(f"[fuentes] SIN DUMP: {dump_path}")
            # el plan guarda NOMBRES (linaje) → cruzar contra los archivos reales del proyecto
            by_name = {}
            for x in g["files"]:
                by_name.setdefault(x.get("name"), x)
            for nm_pick in pick_names:
                fmeta = by_name.get(nm_pick)
                if not fmeta:
                    continue
                try:
                    data, mime = await bie._download_file_bytes(conn, fmeta["id"], fmeta.get("mimeType") or "")
                    if not data or len(data) > MAX_BYTES:
                        continue
                    nm = _safe(nm_pick)
                    if not nm.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".csv")):
                        nm += ".pdf"
                    with open(os.path.join(pdir, nm), "wb") as f:
                        f.write(data)
                except Exception as e:  # noqa: BLE001
                    print(f"[fuentes] {pname} / {nm_pick}: {e}")
            n = len(os.listdir(pdir)) - 1
            print(f"[fuentes] ✓ {fuente} · {pname[:40]} · {n} fuentes + TREE")

asyncio.run(main())
