"""Calidad de renders (07-16, founder): un render de galería debe ser una imagen de la
PROPIEDAD (fachada/interior/amenidad), NO una slide en BLANCO ni una foto de PERSONAS
(stock de estilo de vida que a veces se cuela al extraer del deck de presentación).

es_render_malo(path) → True si la imagen es blanca/casi-vacía o tiene una persona prominente.
Se usa al ingerir renders (filtro de entrada) y para purgar lo ya cargado. $0, sin IA.
"""
from __future__ import annotations

import os
from typing import Optional

_BLANCO_MIN = 0.90     # fracción casi-blanca a partir de la cual = slide vacía
_CARA_PCT_MIN = 1.5    # % del área que ocupa una cara para considerarla persona prominente
_casc = None


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


def es_render_malo(path: str) -> bool:
    """¿Esta imagen NO sirve como render de galería? (blanca/vacía o persona prominente)."""
    if not path or not os.path.exists(path):
        return True
    m = metricas(path)
    if m is None:
        return True
    if m["blanco"] >= _BLANCO_MIN:          # slide en blanco / casi vacía
        return True
    if m["cara_pct"] >= _CARA_PCT_MIN:       # persona prominente = stock de estilo de vida
        return True
    return False


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
