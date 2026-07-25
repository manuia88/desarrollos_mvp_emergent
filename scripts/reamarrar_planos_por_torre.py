"""Amarra planos por TORRE/ALA + número de departamento, leyendo el nombre real del archivo.

POR QUÉ (auditoría A–Z 2026-07-24): en tres desarrollos el plano se asignó ignorando la torre o el
ala, así que el comprador ve el departamento de la torre de al lado — con otros metros:
  · Splendor Coyoacán — 33 de 36 unidades traen el plano de otra ala; los correctos están sin usar.
  · Panorama Lindavista — la torre F completa muestra los planos de la torre G (12 m² menos).
  · Zereniti — las torres A y B están intercambiadas.

MÉTODO: aquí el nombre del archivo SÍ es fiable porque codifica torre + departamento
(`D402A.pdf` = depto 402 del ala A · `F-301.pdf` = torre F depto 301 · `PLANO 1701 Y 1702 TORRE A`).
Se construye la clave exacta y se exige coincidencia; nunca se aproxima.

REGLA HEREDADA de reamarrar_planos_por_nivel.py, aprendida a golpes: **sólo se retira un plano con
evidencia EN CONTRA** (que el archivo asignado pertenezca demostrablemente a otra unidad). Si no se
puede identificar, se deja como está y se reporta. "No pude comprobarlo" NO es "está mal".

USO:  python scripts/reamarrar_planos_por_torre.py [--aplicar]
"""
import asyncio
import os
import re
import sys

import motor.motor_asyncio


def clave_splendor(unit_number: str):
    """'A 402' → 'D402A'  ·  'A PB 01' → 'DPB01A'."""
    m = re.match(r"^([A-C])\s+(.+)$", str(unit_number).strip())
    if not m:
        return None
    ala, num = m.group(1), m.group(2).replace(" ", "")
    return f"D{num}{ala}"


def clave_panorama(unit_number: str):
    """'F-301' o 'A 602' → 'F-301' / 'A-602' (torre-número, formato del archivo)."""
    m = re.match(r"^([A-G])[\s-]+(\d{3})$", str(unit_number).strip())
    return f"{m.group(1)}-{m.group(2)}" if m else None


def zereniti_candidatos(unit_number: str):
    """('B', '0401') → (torre, número sin ceros). Los archivos nombran rangos: '301 Y 302 AL 801 Y 802'."""
    m = re.match(r"^([AB])\s+(.+)$", str(unit_number).strip())
    if not m:
        return None, None
    return m.group(1), m.group(2).lstrip("0") or m.group(2)


def zereniti_cubre(filename: str, torre: str, num: str) -> bool:
    """¿Ese archivo cubre esa unidad de esa torre? Exige que la TORRE coincida."""
    f = filename.upper()
    if f"TORRE {torre}" not in f:
        return False
    if num.upper().startswith("PH"):
        return "PH" in f
    if not num.isdigit():
        return False
    n = int(num)
    nums = [int(x) for x in re.findall(r"\b(\d{3,4})\b", f)]
    if not nums:
        return False
    if n in nums:                      # el archivo lo nombra explícitamente
        return True
    if " AL " in f and len(nums) >= 2:  # rango "301 Y 302 AL 801 Y 802": cubre los pisos intermedios
        return min(nums) <= n <= max(nums) and (n % 100) in {x % 100 for x in nums}
    return False


CONFIG = {
    "dev_splendor_coyoacan": ("Splendor Coyoacán", "splendor"),
    "dev_panorama_lindavista": ("Panorama Lindavista", "panorama"),
    "dev_zereniti": ("Zereniti Interlomas", "zereniti"),
}


async def procesar(db, dev_id, nombre, modo, aplicar):
    from datetime import datetime, timezone
    ahora = datetime.now(timezone.utc).isoformat()

    assets = await db.dev_assets.find(
        {"development_id": dev_id, "asset_type": "plano"},
        {"_id": 0, "id": 1, "filename": 1, "mime_type": 1}).to_list(600)
    # el .png ya renderizado se sirve mejor que el PDF; se prefiere si existe
    previews = {}
    async for p in db.dev_assets.find({"development_id": dev_id, "asset_type": "plano_preview"},
                                      {"_id": 0, "id": 1, "filename": 1}):
        previews[(p.get("filename") or "").replace(".png", "")] = p["id"]

    por_clave = {}
    for a in assets:
        fn = (a.get("filename") or "")
        base = fn.replace(".pdf", "")
        if modo == "splendor":
            k = base.upper()
        elif modo == "panorama":
            k = base.upper()
        else:
            k = None
        if k:
            por_clave.setdefault(k, a)

    unidades = await db.units.find({"development_id": dev_id},
                                   {"_id": 0, "id": 1, "unit_number": 1, "plano_url": 1}).to_list(400)
    corr = igual = sin = 0
    for u in unidades:
        un = u["unit_number"]
        elegido = None
        if modo == "splendor":
            k = clave_splendor(un)
            elegido = por_clave.get((k or "").upper())
        elif modo == "panorama":
            k = clave_panorama(un)
            elegido = por_clave.get((k or "").upper())
        else:
            torre, num = zereniti_candidatos(un)
            if torre:
                for a in assets:
                    if zereniti_cubre(a.get("filename") or "", torre, num):
                        elegido = a
                        break
        if not elegido:
            sin += 1
            continue
        # servir el PNG renderizado si existe (el PDF no se pinta en la ficha)
        aid = previews.get(elegido.get("filename") or "", elegido["id"])
        ext = "png" if aid != elegido["id"] else ("pdf" if (elegido.get("mime_type") or "").endswith("pdf") else "png")
        nueva = f"/api/assets-static/{aid}.{ext}"
        if nueva == u.get("plano_url"):
            igual += 1
            continue
        corr += 1
        if corr <= 4:
            print(f"    {un:>10}: {(u.get('plano_url') or '—').split('/')[-1]} → {elegido.get('filename')}")
        if aplicar:
            await db.units.update_one({"id": u["id"]}, {"$set": {
                "plano_url": nueva,
                "plano_mime": "application/pdf" if ext == "pdf" else "image/png",
                "plano_fuente": f"amarrado por TORRE/ALA + número desde «{elegido.get('filename')}»",
                "plano_verificado_at": ahora}})
    print(f"  {nombre}: corregidas {corr} · ya correctas {igual} · sin archivo propio {sin} "
          f"(se dejan como están, no se borran)")


async def main(aplicar: bool):
    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=8000)[os.environ["DB_NAME"]]
    print(f"════ {'APLICANDO' if aplicar else 'SIMULACIÓN'} · planos por torre/ala ════")
    for dev_id, (nombre, modo) in CONFIG.items():
        print(f"\n── {nombre} ──")
        await procesar(db, dev_id, nombre, modo, aplicar)
    if not aplicar:
        print("\n  (corre otra vez con --aplicar para escribir)")


if __name__ == "__main__":
    asyncio.run(main("--aplicar" in sys.argv))
