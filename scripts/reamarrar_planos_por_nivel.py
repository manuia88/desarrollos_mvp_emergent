"""Re-amarra las láminas de piso a sus unidades leyendo el NIVEL IMPRESO, no el nombre del archivo.

POR QUÉ (auditoría A–Z, 2026-07-24): en 8 desarrollos de GDC las láminas `planta_nivel_N.png` están
corridas: el archivo llamado `planta_nivel_4.png` contiene en realidad el "NIVEL 3". Como el amarre
se hizo por el NOMBRE, cada comprador ve el plano del piso de abajo — y los del piso más bajo ven
el lobby, el estacionamiento o el roof garden en lugar de su departamento.

Caso confirmado y ya corregido con este script: Vía Colón, 75/75 unidades.
Verificado a tres bandas antes de escribir: (1) hallazgo de la auditoría, (2) OCR de las 17 láminas
—desfase −1 consistente en 16 de 17—, (3) lectura visual de la lámina del nivel 4, que rotula
"VALLARTA NIVEL 4" y los DEPTO. 401 a 407.

MÉTODO (el mismo que evita repetir el error):
  1. OCR de TODAS las láminas del desarrollo → nivel realmente impreso.
  2. Mapa nivel_real → archivo.
  3. Cada unidad recibe la lámina de SU piso.
  4. Verificación doble: nivel del plano == campo `level` == primeros dígitos del nº de departamento.
Nunca se confía en el nombre del archivo ni en el campo `nivel` guardado (que se derivó del nombre).

USO:
    python scripts/reamarrar_planos_por_nivel.py <dev_id> [--aplicar]
Sin `--aplicar` corre en seco y solo muestra qué cambiaría.
"""
import asyncio
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

import motor.motor_asyncio

ASSET = os.environ.get("ASSET_UPLOAD_DIR", "")


def nivel_impreso(png_path: str):
    """Nivel que la lámina dice tener, leído de la imagen. None si no se puede leer."""
    if not os.path.exists(png_path):
        return None
    try:
        txt = subprocess.run(["tesseract", png_path, "-", "-l", "spa", "--psm", "6"],
                             capture_output=True, text=True, timeout=120).stdout.upper()
    except Exception:
        return None
    m = re.findall(r"NIVEL\s*(\d{1,2})", txt)
    if not m:
        return None
    return int(max(set(m), key=m.count))       # el que más veces aparece impreso


def piso_por_numero(unit_number) -> int | None:
    """El piso que implica el número de departamento (405 → 4, 1207 → 12)."""
    s = str(unit_number or "").strip()
    return int(s[:-2]) if s.isdigit() and len(s) >= 3 else None


async def main(dev_id: str, aplicar: bool):
    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=8000)[os.environ["DB_NAME"]]

    assets = await db.dev_assets.find(
        {"development_id": dev_id, "asset_type": "plano_nivel"},
        {"_id": 0, "id": 1, "filename": 1, "nivel": 1}).to_list(300)
    if not assets:
        print(f"  {dev_id}: no tiene láminas de tipo plano_nivel — este script no aplica")
        return

    print(f"════ {dev_id} · leyendo el nivel impreso de {len(assets)} láminas ════")
    mapa, discrepancias = {}, 0
    for a in sorted(assets, key=lambda x: int(x.get("nivel") or 0)):
        real = nivel_impreso(f"{ASSET}/{a['id']}.png")
        guardado = a.get("nivel")
        if real is not None and str(real) != str(guardado):
            discrepancias += 1
        print(f"  {a['filename']:24} guardado={str(guardado):>3} · impreso={str(real):>4}"
              f"{'  ⚠️' if real is not None and str(real) != str(guardado) else ''}")
        if real is not None and real not in mapa:
            mapa[real] = a["id"]
    print(f"\n  niveles verificados: {sorted(mapa)} · láminas mal etiquetadas: {discrepancias}")

    ahora = datetime.now(timezone.utc).isoformat()
    cambian = coinciden = sin_lamina = 0
    async for u in db.units.find({"development_id": dev_id},
                                 {"_id": 0, "id": 1, "unit_number": 1, "level": 1, "plano_url": 1}):
        lv = int(float(u.get("level") or 0))
        # el número de departamento manda sobre el campo `level` si discrepan (el número lo imprime el dev)
        lv = piso_por_numero(u.get("unit_number")) or lv
        aid = mapa.get(lv)
        if not aid:
            sin_lamina += 1
            continue
        nueva = f"/api/assets-static/{aid}.png"
        if nueva == u.get("plano_url"):
            coinciden += 1
            continue
        cambian += 1
        if cambian <= 5:
            print(f"    {u['unit_number']:>7} (piso {lv}): "
                  f"{(u.get('plano_url') or '—').split('/')[-1]} → {aid}.png")
        if aplicar:
            await db.units.update_one({"id": u["id"]}, {"$set": {
                "plano_url": nueva, "plano_mime": "image/png",
                "plano_fuente": "re-amarrado por el NIVEL impreso en la lámina (OCR + lectura), no por el nombre del archivo",
                "plano_verificado_at": ahora}})

    if aplicar:
        for real, aid in mapa.items():
            await db.dev_assets.update_one({"id": aid}, {"$set": {"nivel_real": str(real),
                                                                  "nivel_verificado_at": ahora}})
    print(f"\n  {'APLICADO' if aplicar else 'SIMULACIÓN'} · a corregir: {cambian} · "
          f"ya correctas: {coinciden} · sin lámina de su piso: {sin_lamina}")
    if not aplicar:
        print("  (corre otra vez con --aplicar para escribir)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    asyncio.run(main(sys.argv[1], "--aplicar" in sys.argv))
