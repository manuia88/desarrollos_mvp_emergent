"""Escribe `llms.txt` y `sitemap.xml` donde Google y las IAs de verdad los buscan.

EL PROBLEMA QUE RESUELVE (auditoría A–Z 2026-07-26). Había dos versiones de cada archivo:

  · una que se GENERA del catálogo, pero servida bajo `/api/seo/…` — y el propio `robots.txt` dice
    `Disallow: /api/`, así que ni Google ni ChatGPT pueden abrirla. La buena, encerrada.
  · una ESCRITA A MANO en `frontend/public/`, que es la que sí se sirve en la raíz del dominio…
    y llevaba meses sin tocarse: 16 direcciones institucionales, cero fichas.

O sea: el archivo correcto era inalcanzable y el alcanzable estaba congelado. Este script cierra el
círculo — pide la versión generada y la deja escrita en `frontend/public/`, que es la ruta que
anuncia `robots.txt` (`https://desarrollosmx.io/sitemap.xml`).

POR QUÉ ASÍ Y NO DE OTRA FORMA: podría servirse en vivo desde el backend, pero en producción el
frontend es un sitio estático servido aparte, así que la raíz del dominio NO pasa por el backend.
Un archivo en disco funciona en los dos mundos —hoy en la laptop, mañana en el servidor— y no le
cuesta una consulta a la base cada vez que pasa un robot.

Corre solo, todos los días, junto al respaldo. El catálogo crece y estos archivos crecen con él sin
que nadie tenga que acordarse.

USO:  python scripts/publicar_seo.py            (usa el backend local)
      python scripts/publicar_seo.py --base http://localhost:8000
"""
import os
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "http://localhost:8000"
for i, a in enumerate(sys.argv):
    if a == "--base" and i + 1 < len(sys.argv):
        BASE = sys.argv[i + 1]

DESTINO = Path(__file__).resolve().parent.parent / "frontend" / "public"

# Un archivo sano no puede ser diminuto: si el backend contesta un error o el catálogo viene vacío,
# preferimos NO escribir y dejar el archivo anterior. Un mapa del sitio vacío le dice a Google que
# ya no existes, y recuperar eso tarda semanas.
MINIMOS = {"llms.txt": 2000, "sitemap.xml": 4000}


def traer(ruta: str) -> str:
    with urllib.request.urlopen(f"{BASE}/api/seo/{ruta}", timeout=90) as r:
        return r.read().decode("utf-8")


def sano(archivo: str, texto: str) -> str | None:
    """Devuelve el motivo por el que NO hay que escribir, o None si el contenido es bueno.

    Se revisa el contenido, no solo el tamaño: un error del servidor puede pesar más que el mínimo
    y aun así ser basura. Un mapa del sitio roto es peor que uno viejo — Google lo interpreta como
    que el sitio se vació, y volver a subir tarda semanas.
    """
    if len(texto) < MINIMOS[archivo]:
        return f"salió con {len(texto)} bytes, muy poco"
    if texto.count("/desarrollo/") == 0:
        return "no menciona ni una ficha"
    if archivo.endswith(".xml"):
        try:
            ET.fromstring(texto)          # ¿es XML válido y está COMPLETO?
        except ET.ParseError as e:
            return f"el XML está roto o cortado ({e})"
    return None


def escribir_de_golpe(destino: Path, texto: str) -> None:
    """Escribe el archivo de forma que NUNCA quede a medias.

    POR QUÉ (founder, 07-26: "quiero que sea seguro, no importando qué pase"): escribir directo
    sobre el archivo bueno lo trunca ANTES de empezar a escribir. Si a media escritura se llena el
    disco, se corta la luz o alguien mata el proceso, el bueno ya no existe y el nuevo está a medias.
    Es exactamente el error que hoy destruyó el respaldo de la base.

    Aquí se escribe TODO a un archivo temporal en la misma carpeta, se obliga al sistema a bajarlo a
    disco de verdad (`fsync`), y solo entonces se pone en su lugar con `os.replace`, que es una
    operación única e indivisible: en cualquier instante, quien lea el archivo ve el viejo completo
    o el nuevo completo. Nunca una mezcla, nunca uno vacío. Si el proceso muere en cualquier punto,
    lo que queda en su lugar sigue siendo el archivo bueno anterior.
    """
    fd, tmp = tempfile.mkstemp(dir=str(destino.parent), prefix=f".{destino.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(texto)
            f.flush()
            os.fsync(f.fileno())          # a disco de verdad, no en la memoria del sistema
        os.replace(tmp, destino)          # el cambio ocurre de golpe o no ocurre
        tmp = None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)                # nunca dejar basura si algo falló


def main() -> int:
    fallos = 0
    for archivo in ("llms.txt", "sitemap.xml"):
        try:
            texto = traer(archivo)
        except Exception as e:  # noqa: BLE001
            print(f"  🚨 {archivo}: no pude generarlo ({e}) — se conserva el anterior")
            fallos += 1
            continue

        motivo = sano(archivo, texto)
        if motivo:
            print(f"  🚨 {archivo}: {motivo}. NO se escribe (el anterior sigue intacto).")
            fallos += 1
            continue

        try:
            escribir_de_golpe(DESTINO / archivo, texto)
        except Exception as e:  # noqa: BLE001
            print(f"  🚨 {archivo}: falló al escribir ({e}) — el anterior sigue intacto")
            fallos += 1
            continue

        print(f"  ✅ {archivo}: {len(texto):,} bytes · {texto.count('/desarrollo/')} fichas anunciadas")

    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
