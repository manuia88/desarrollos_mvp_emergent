"""Calidad de renders (07-16, founder): un render de galería debe ser una imagen de la
PROPIEDAD (fachada/interior/amenidad), NO una slide en BLANCO ni una foto de PERSONAS
(stock de estilo de vida que a veces se cuela al extraer del deck de presentación).

es_render_malo(path) → True si la imagen es blanca/casi-vacía o tiene una persona prominente.
Se usa al ingerir renders (filtro de entrada). $0, sin IA.

OJO (auditoría 07-16): como señal de PURGA el detector de caras alucina — 27 de 29 flags
fueron falsos positivos (costales de box, maquetas, muebles = "caras"). Regla: es_render_malo
sirve para FILTRAR EN INGESTA y para MARCAR candidatos; borrar lo ya cargado requiere
verificación visual humana, nunca purga automática.

07-17 (juez de galería, galeria_judex.py): densidad_texto (flyer/lona colada como foto),
hash_perceptual + es_duplicado (mismo render repetido). Mismo contrato: $0, sin IA, y
NUNCA purga automática — solo marcar para ojos humanos.
"""
from __future__ import annotations

import os
from typing import Optional

_BLANCO_MIN = 0.90     # fracción casi-blanca a partir de la cual = slide vacía
_CARA_PCT_MIN = 1.5    # % del área que ocupa una cara para considerarla persona prominente
_casc = None

# ─── Texto (flyer/lona) — calibrado 07-17 contra assets REALES del catálogo ──
# Renders de galería reales (24 muestreados, CLASS+GDC): 0.0 palabras/MP.
# Imágenes con texto del mismo pipeline (planos con cotas / slides): 6.4–44 palabras/MP.
# Umbral 4.0 = margen amplio sobre el 0.0 de los renders y debajo del peor texty real.
ES_FLYER_MIN = 4.0     # palabras OCR por megapíxel a partir de las cuales = flyer/lona
_OCR_LADO_MAX = 1200   # se normaliza a este lado mayor: OCR rápido y densidad comparable
_OCR_CONF_MIN = 40     # confianza mínima de tesseract para contar una palabra


def _cascade():
    global _casc
    if _casc is None:
        import cv2
        _casc = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    return _casc


def metricas(path: str) -> Optional[dict]:
    """Fracción casi-blanca + variación + cara más grande (% del área). None si no abre."""
    import cv2
    import numpy as np
    from PIL import Image
    try:
        a = np.asarray(Image.open(path).convert("RGB"))
    except Exception:  # noqa: BLE001
        return None
    h, w = a.shape[:2]
    blanco = float((a.min(axis=2) > 232).mean())
    std = float(a.std())
    gris = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    caras = _cascade().detectMultiScale(
        gris, 1.1, 5, minSize=(max(1, int(w * 0.06)), max(1, int(h * 0.06))))
    cara_pct = max((cw * ch for (_x, _y, cw, ch) in caras), default=0) / (w * h) * 100
    return {"blanco": blanco, "std": std, "cara_pct": cara_pct}


def es_negra_o_texto(path: str) -> bool:
    """Slides negras (mapas B/N, logos, portadas con texto) — regla founder 07-16: la galería
    es SOLO renders. Un render real casi nunca es ≥60% píxeles oscuros."""
    try:
        import numpy as np
        from PIL import Image
        a = np.asarray(Image.open(path).convert("RGB"))
    except Exception:  # noqa: BLE001
        return False
    oscuro = float((a.max(axis=2) < 45).mean())
    return oscuro >= 0.55


def es_render_malo(path: str) -> bool:
    """¿Esta imagen NO sirve como render de galería? (blanca/vacía, persona prominente,
    o slide negra de texto/mapa/logo — auditoría visual GDC 07-16)."""
    if not path or not os.path.exists(path):
        return True
    m = metricas(path)
    if m is None:
        return True
    if m["blanco"] >= _BLANCO_MIN:          # slide en blanco / casi vacía
        return True
    if m["cara_pct"] >= _CARA_PCT_MIN:       # persona prominente = stock de estilo de vida
        return True
    if es_negra_o_texto(path):               # mapa negro / logo / portada de deck
        return True
    return False


def densidad_texto(path: str) -> float:
    """Palabras OCR legibles (conf > 40, ≥2 caracteres) por megapíxel, con la imagen
    normalizada a lado mayor 1200 px (rápido y comparable entre resoluciones).
    Un flyer/lona da alto (≥ ES_FLYER_MIN); un render normal da ~0. $0, sin IA."""
    try:
        import pytesseract
        from PIL import Image
        im = Image.open(path).convert("L")
    except Exception:  # noqa: BLE001 — sin tesseract/imagen ilegible = sin señal, no truena
        return 0.0
    w, h = im.size
    if max(w, h) > _OCR_LADO_MAX:
        r = _OCR_LADO_MAX / max(w, h)
        im = im.resize((max(1, int(w * r)), max(1, int(h * r))))
    try:
        d = pytesseract.image_to_data(im, lang="spa", output_type=pytesseract.Output.DICT)
    except Exception:  # noqa: BLE001
        return 0.0
    palabras = sum(
        1 for conf, txt in zip(d.get("conf", []), d.get("text", []))
        if str(txt).strip() and len(str(txt).strip()) >= 2 and float(conf) > _OCR_CONF_MIN)
    mp = (im.width * im.height) / 1e6
    return palabras / mp if mp else 0.0


def es_flyer(path: str) -> bool:
    """¿Parece flyer/lona (texto denso) colado como foto de galería? Señal para MARCAR
    y revisar con ojos — regla dura: NUNCA purga automática."""
    return densidad_texto(path) >= ES_FLYER_MIN


def hash_perceptual(path: str) -> Optional[int]:
    """dHash de 64 bits con PIL puro (sin dependencias nuevas): gris 9×8 y se compara
    cada píxel con su vecino derecho. Robusto a re-encode/resize/leves ajustes de brillo.
    None si la imagen no abre."""
    try:
        from PIL import Image
        im = Image.open(path).convert("L").resize((9, 8), Image.LANCZOS)
    except Exception:  # noqa: BLE001
        return None
    px = im.tobytes()   # modo L: un byte por píxel, en orden raster (sin APIs deprecadas)
    bits = 0
    for fila in range(8):
        for col in range(8):
            i = fila * 9 + col
            bits = (bits << 1) | (1 if px[i] > px[i + 1] else 0)
    return bits


def es_duplicado(h1: Optional[int], h2: Optional[int], umbral_bits: int = 6) -> bool:
    """¿Dos dHash son (casi) la misma imagen? ≤ umbral_bits de distancia Hamming.
    None (imagen ilegible) nunca es duplicado de nada."""
    if h1 is None or h2 is None:
        return False
    return bin(h1 ^ h2).count("1") <= umbral_bits


async def purgar_renders(db, dev_id: str) -> dict:
    """Borra los renders malos (blanco/personas) de un dev. Devuelve conteo."""
    borrados = 0
    async for a in db.dev_assets.find(
            {"development_id": dev_id, "asset_type": {"$in": ["foto_hero", "foto_galeria"]}},
            {"_id": 0, "id": 1, "storage_path": 1}):
        if es_render_malo(a.get("storage_path", "")):
            await db.dev_assets.delete_one({"id": a["id"]})
            try:
                os.unlink(a["storage_path"])
            except Exception:  # noqa: BLE001
                pass
            borrados += 1
    # asegurar que quede un hero (el 1º por order_index)
    resto = await db.dev_assets.find_one(
        {"development_id": dev_id, "asset_type": "foto_hero"}, {"_id": 0, "id": 1})
    if not resto:
        primero = await db.dev_assets.find_one(
            {"development_id": dev_id, "asset_type": "foto_galeria"},
            {"_id": 0, "id": 1}, sort=[("order_index", 1)])
        if primero:
            await db.dev_assets.update_one({"id": primero["id"]},
                                           {"$set": {"asset_type": "foto_hero"}})
    return {"borrados": borrados}
