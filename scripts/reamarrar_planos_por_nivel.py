"""Amarra cada lámina de piso a sus unidades leyendo los NÚMEROS DE DEPARTAMENTO impresos dentro.

POR QUÉ (auditoría A–Z, 2026-07-24): en varios desarrollos de GDC las láminas `planta_nivel_N.png`
están corridas — el archivo llamado `planta_nivel_5.png` contiene en realidad el nivel 4. Como el
amarre se hizo por el NOMBRE del archivo, cada comprador veía el plano del piso de abajo, y los de
los pisos bajos veían el lobby, el estacionamiento o el roof garden en lugar de su departamento.

EL MÉTODO, y por qué es este y no otro
--------------------------------------
Primero intenté leer el rótulo "NIVEL N" de la lámina. Funciona en algunos desarrollos (Vía Colón,
Icon San Ángel) pero NO en otros: en Casa Colón el rótulo está escrito en vertical y en gris claro,
y no hay combinación de rotación, contraste ni modo de OCR que lo lea. Dar esas láminas por
"ilegibles" me llevó a retirar 278 planos que eran perfectamente recuperables.

**Lección, y regla de aquí en adelante: "no pude leerlo" NO es "no lo tiene".** Confundir las dos
cosas borra datos buenos.

Lo que sí es robusto: los NÚMEROS DE DEPARTAMENTO impresos dentro del dibujo (401, 402, 403…).
Son grandes, oscuros y horizontales, y sobre todo son la evidencia DIRECTA del amarre: si la lámina
dice "402", esa lámina es de la unidad 402. No hay que inferir el piso ni confiar en ningún rótulo.
Y si una lámina no trae ningún número de departamento, es que no es un piso de departamentos
(lobby, amenidades, estacionamiento) y no debe amarrarse a nadie.

USO:
    python scripts/reamarrar_planos_por_nivel.py <dev_id> [--aplicar]
Sin `--aplicar` corre en seco y sólo muestra qué cambiaría.
"""
import asyncio
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

import motor.motor_asyncio

ASSET = os.environ.get("ASSET_UPLOAD_DIR", "")


def _ocr(path: str, psm: str) -> str:
    """OCR tolerante: tesseract escupe bytes no-utf8 en stderr y no debe tumbar la corrida."""
    try:
        r = subprocess.run(["tesseract", path, "-", "-l", "spa", "--psm", psm],
                           capture_output=True, timeout=120)
        return r.stdout.decode("utf-8", "replace").upper()
    except Exception:
        return ""


def nivel_impreso(png_path: str):
    """Nivel rotulado en la lámina ("NIVEL 4"). Señal secundaria: en algunos desarrollos es lo
    único legible; en otros no existe. Se prueban varias orientaciones porque hay rótulos verticales.
    """
    if not os.path.exists(png_path):
        return None
    for psm in ("6", "11"):
        m = re.findall(r"NIVEL\s*(\d{1,2})", _ocr(png_path, psm))
        if m:
            return int(max(set(m), key=m.count))
    return None


def deptos_impresos(png_path: str) -> set:
    """Números de departamento que la lámina dibuja. Vacío = no es un piso de departamentos.

    `--psm 11` (texto disperso) es el que encuentra las etiquetas sueltas dentro del dibujo;
    se prueban otros modos por si un plano tiene la numeración maquetada distinto.
    """
    if not os.path.exists(png_path):
        return set()
    for psm in ("11", "6", "12"):
        txt = _ocr(png_path, psm)
        nums = {n for n in re.findall(r"\b(\d{3,4})\b", txt) if 100 <= int(n) <= 5099}
        if nums:
            return nums
    return set()


async def main(dev_id: str, aplicar: bool):
    db = motor.motor_asyncio.AsyncIOMotorClient(
        os.environ["MONGO_URL"], serverSelectionTimeoutMS=8000)[os.environ["DB_NAME"]]

    assets = await db.dev_assets.find(
        {"development_id": dev_id, "asset_type": "plano_nivel"},
        {"_id": 0, "id": 1, "filename": 1, "nivel": 1}).to_list(300)
    if not assets:
        print(f"  {dev_id}: no tiene láminas de tipo plano_nivel — este script no aplica")
        return

    unidades = {}
    async for u in db.units.find({"development_id": dev_id},
                                 {"_id": 0, "id": 1, "unit_number": 1, "plano_url": 1}):
        unidades[str(u["unit_number"]).strip()] = u
    print(f"════ {dev_id} · {len(assets)} láminas · {len(unidades)} unidades ════")

    # lámina → unidades cuyo número aparece IMPRESO dentro
    # `identificadas` guarda, por lámina, a QUIÉN dibuja de verdad. Es lo único que autoriza a
    # retirar el plano de una unidad: si la lámina que tiene dibuja a otros, es evidencia en contra.
    asignacion, identificadas, sin_deptos, ruido_total = {}, {}, 0, 0
    for a in sorted(assets, key=lambda x: int(x.get("nivel") or 0)):
        nums = deptos_impresos(f"{ASSET}/{a['id']}.png")
        propias = sorted(n for n in nums if n in unidades)
        if not nums:
            sin_deptos += 1
            print(f"  {a['filename']:24} → sin números (no es piso de departamentos)")
            continue

        # FILTRO DE COHERENCIA: una lámina dibuja UN piso. Si entre los números leídos hay uno de
        # otro piso, es ruido de OCR (un '1304' leído como '1804', un '401' que en realidad es una
        # cota). Nos quedamos con el piso mayoritario y descartamos los intrusos: sin esto, un solo
        # error de lectura amarra una unidad al plano de otra — justo lo que venimos a arreglar.
        pisos = [n[:-2] for n in propias]
        if pisos:
            piso_dominante = max(set(pisos), key=pisos.count)
            ruido = [n for n in propias if n[:-2] != piso_dominante]
            propias = [n for n in propias if n[:-2] == piso_dominante]
            ruido_total += len(ruido)
        else:
            ruido = []

        print(f"  {a['filename']:24} → dibuja {sorted(nums)[:8]}"
              f"{' · de este dev: ' + str(propias[:6]) if propias else '  ⚠️ ninguno es de este dev'}"
              f"{'  · descartado por ser de otro piso: ' + str(ruido) if ruido else ''}")
        if propias:
            identificadas[a["id"]] = set(propias)
        for n in propias:
            asignacion.setdefault(n, a["id"])       # primera lámina que lo dibuja

    # SEÑAL SECUNDARIA: para las unidades que ninguna lámina nombró, se intenta el rótulo "NIVEL N".
    # Hay desarrollos donde los números de departamento no son legibles pero el rótulo sí (Vía Colón,
    # Icon San Ángel) y otros al revés (Casa Colón). Usar las dos señales cubre ambos casos.
    faltantes = [n for n in unidades if n not in asignacion]
    if faltantes:
        por_nivel = {}
        for a in assets:
            niv = nivel_impreso(f"{ASSET}/{a['id']}.png")
            if niv is not None:
                por_nivel.setdefault(niv, []).append(a["id"])
        # un nivel reclamado por dos láminas es ambiguo: se descarta antes que adivinar
        por_nivel = {k: v[0] for k, v in por_nivel.items() if len(v) == 1}
        rescatadas = 0
        for n in faltantes:
            piso = int(n[:-2]) if n.isdigit() and len(n) >= 3 else None
            if piso in por_nivel:
                asignacion[n] = por_nivel[piso]
                rescatadas += 1
        if por_nivel:
            print(f"  · rótulo de nivel legible en {len(por_nivel)} láminas → "
                  f"{rescatadas} unidades más amarradas por esa vía")

    ahora = datetime.now(timezone.utc).isoformat()
    cambian = coinciden = retirados = sin_certeza = 0
    for num, u in unidades.items():
        aid = asignacion.get(num)
        if aid:
            nueva = f"/api/assets-static/{aid}.png"
            if nueva == u.get("plano_url"):
                coinciden += 1
                continue
            cambian += 1
            if cambian <= 5:
                print(f"    {num:>7}: {(u.get('plano_url') or '—').split('/')[-1]} → {aid}.png")
            if aplicar:
                await db.units.update_one({"id": u["id"]}, {"$set": {
                    "plano_url": nueva, "plano_mime": "image/png",
                    "plano_fuente": "amarrado por el número de departamento IMPRESO dentro de la lámina",
                    "plano_verificado_at": ahora}})
        elif u.get("plano_url"):
            # REGLA DURA (aprendida a golpes el 07-25): NO se retira un plano porque no pudimos
            # identificarlo. "No lo pude leer" NO es "está mal". Sólo se retira con EVIDENCIA EN
            # CONTRA: que la lámina que tiene asignada haya sido identificada positivamente como
            # de OTRAS unidades. Si no sabemos, se deja como está y se reporta para revisión.
            aid_actual = (u.get("plano_url") or "").split("/")[-1].replace(".png", "")
            dueños = identificadas.get(aid_actual)
            if dueños and num not in dueños:
                retirados += 1
                if aplicar:
                    await db.units.update_one({"id": u["id"]}, {"$set": {
                        "plano_url": None,
                        "plano_fuente": f"la lámina asignada dibuja las unidades {sorted(dueños)[:4]}, no esta — se retira en vez de mostrar el plano de otra",
                        "plano_retirado_at": ahora}})
            else:
                sin_certeza += 1

    print(f"\n  {'APLICADO' if aplicar else 'SIMULACIÓN'} · corregidas: {cambian} · "
          f"ya correctas: {coinciden} · retiradas CON evidencia en contra: {retirados} · "
          f"sin certeza (se dejan como están): {sin_certeza} · "
          f"láminas sin departamentos: {sin_deptos} · números descartados por ruido: {ruido_total}")
    if not aplicar:
        print("  (corre otra vez con --aplicar para escribir)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    asyncio.run(main(sys.argv[1], "--aplicar" in sys.argv))
