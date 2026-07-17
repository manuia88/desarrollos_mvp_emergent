"""Orientación de planos (07-16, founder): un plano debe poder leerse HORIZONTAL, sin girar
la cabeza. Muchas láminas vienen de PDFs apaisados guardados de lado (p.ej. las láminas
ALMINA_ARQ salían giradas 90°).

Detección con tesseract OSD (binario local, $0, sin IA): `Rotate: N` = grados que hay que
girar la imagen EN SENTIDO HORARIO para enderezar el texto. Convención validada visualmente
el 07-16 (lámina Almina Rotate:270 → PIL ROTATE_90 → quedó derecha).

Umbral de confianza: bajo el umbral NO se gira (dejar una lámina como está es mejor que
girarla mal). Solo imágenes; los PDF no se tocan (sus previews PNG sí pasan por aquí).
"""
from __future__ import annotations

import os
import re
import subprocess
from typing import Optional

UMBRAL_CONF = 1.0
_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}


def es_imagen(path: str) -> bool:
    return os.path.splitext(str(path or ""))[1].lower() in _IMG_EXT


def osd(path: str, timeout: int = 90) -> Optional[dict]:
    """{'rotate': 0|90|180|270, 'conf': float} según tesseract OSD. None si no pudo leer."""
    if not path or not os.path.exists(path):
        return None
    try:
        r = subprocess.run(["tesseract", str(path), "stdout", "--psm", "0"],
                           capture_output=True, text=True, timeout=timeout)
    except Exception:  # noqa: BLE001
        return None
    txt = (r.stdout or "") + (r.stderr or "")
    m = re.search(r"Rotate:\s*(\d+)", txt)
    if not m:
        return None
    c = re.search(r"Orientation confidence:\s*([\d.]+)", txt)
    return {"rotate": int(m.group(1)) % 360, "conf": float(c.group(1)) if c else 0.0}


def giro_necesario(path: str, umbral: float = UMBRAL_CONF) -> int:
    """Grados (horario) que hay que girar el archivo; 0 = dejarlo (derecho o sin señal clara)."""
    if not es_imagen(path):
        return 0
    o = osd(path)
    if not o or o["rotate"] % 360 == 0 or o["conf"] < umbral:
        return 0
    return o["rotate"] % 360


def enderezar_archivo(path: str, rotate_cw: int) -> bool:
    """Gira la imagen `rotate_cw` grados en sentido horario, EN SITIO. True si giró."""
    rotate_cw = rotate_cw % 360
    if rotate_cw == 0 or not es_imagen(path):
        return False
    from PIL import Image
    t = {90: Image.ROTATE_270, 180: Image.ROTATE_180, 270: Image.ROTATE_90}.get(rotate_cw)
    if t is None:
        return False
    im = Image.open(path)
    fmt = im.format or "PNG"
    im = im.transpose(t)
    if fmt == "JPEG":
        im.save(path, format=fmt, quality=92)
    else:
        im.save(path, format=fmt)
    return True


def score_texto(path: str, timeout: int = 60) -> float:
    """Cuánto texto LEGIBLE hay en la imagen tal como está (suma de confianza de palabras
    reales del OCR). Una lámina de lado o de cabeza da score bajo; derecha, alto."""
    try:
        r = subprocess.run(["tesseract", str(path), "stdout", "tsv"],
                           capture_output=True, text=True, timeout=timeout)
    except Exception:  # noqa: BLE001
        return 0.0
    total = 0.0
    for line in (r.stdout or "").splitlines()[1:]:
        campos = line.split("\t")
        if len(campos) < 12:
            continue
        conf, palabra = campos[10], campos[11].strip()
        try:
            c = float(conf)
        except ValueError:
            continue
        if c > 40 and len(palabra) >= 3 and any(ch.isalpha() for ch in palabra):
            total += c * len(palabra)
    return total


def mejor_angulo_por_ocr(path: str, margen: float = 1.5, minimo: float = 400.0) -> int:
    """Prueba 0/90/180/270 y devuelve el giro horario que produce MÁS texto legible.
    0 si la imagen ya gana, si no hay texto suficiente (recortes sin letras) o si no hay
    margen claro — en la duda, no girar."""
    if not es_imagen(path):
        return 0
    import tempfile
    from PIL import Image
    base = Image.open(path)
    scores = {0: score_texto(path)}
    t_map = {90: Image.ROTATE_270, 180: Image.ROTATE_180, 270: Image.ROTATE_90}
    with tempfile.TemporaryDirectory() as tmp:
        for ang, t in t_map.items():
            p = os.path.join(tmp, f"r{ang}.png")
            base.transpose(t).save(p, format="PNG")
            scores[ang] = score_texto(p)
    mejor = max(scores, key=lambda k: scores[k])
    if mejor == 0 or scores[mejor] < minimo or scores[mejor] < margen * max(scores[0], 1.0):
        return 0
    return mejor


def enderezar_si_hace_falta(path: str, umbral: float = UMBRAL_CONF) -> int:
    """Detecta y endereza en un paso (hook de ingesta). OSD confiable manda; si no hay señal
    clara, decide el score de texto en 4 ángulos. Devuelve los grados girados (0 = nada)."""
    g = giro_necesario(path, umbral)
    if not g:
        g = mejor_angulo_por_ocr(path)
    if g:
        enderezar_archivo(path, g)
    return g
