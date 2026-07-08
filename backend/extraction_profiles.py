"""HUELLA DE EXTRACCIÓN POR DRIVE (idea #4 founder 07-08).

Cada corrección manual en la cola de revisión (patch_item) es una LECCIÓN sobre cómo ese
desarrollador estructura su información ("en este drive la terraza viene en la columna X",
"los cajones vienen como rango"). Este módulo la captura y la re-inyecta:

  1. CAPTURA — apply_inline_patch llama a record_correction(): se agrega el campo corregido al
     perfil del drive (db.extraction_profiles, keyed por folder raíz) con conteo por FAMILIA
     de campo (m2_desglose, precio, estacionamiento, estatus, prototipo, amenidades, ...).
  2. RE-INYECCIÓN — en la siguiente ingesta de ese mismo drive, profile_hints() devuelve una
     línea de advertencia que se pega al prompt del RECON: "en corridas previas de este drive
     se corrigieron manualmente: m2_desglose (3x), estacionamiento (1x) — pon atención especial".

Cero costo extra (texto al prompt que ya se manda) · fail-open (si falla, la ingesta sigue igual).
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.extraction_profiles")

# familia de campo ← qué parte del path del patch se corrigió (hipergranular pero agregable)
_FAMILIAS = [
    (re.compile(r"(?i)balcon|terraza|roof|patio|jardin|m2_"), "m2_desglose"),
    (re.compile(r"(?i)price|precio"), "precio"),
    (re.compile(r"(?i)parking|cajon|estacionamiento"), "estacionamiento"),
    (re.compile(r"(?i)status|estatus"), "estatus"),
    (re.compile(r"(?i)prototype|prototipo"), "prototipo"),
    (re.compile(r"(?i)amenit"), "amenidades"),
    (re.compile(r"(?i)level|nivel|piso"), "nivel"),
    (re.compile(r"(?i)bedroom|recamara|bathroom|bano"), "recamaras_banos"),
    (re.compile(r"(?i)colonia|address|direccion|lat|lng"), "ubicacion"),
    (re.compile(r"(?i)stage|etapa|delivery|entrega"), "etapa_entrega"),
]


def _familia(campo: str) -> str:
    for rx, fam in _FAMILIAS:
        if rx.search(campo):
            return fam
    return "otros"


async def record_correction(db, folder_key: str, project_name: str, patch: Dict[str, Any]) -> None:
    """Suma cada campo corregido al perfil del drive. Fail-open."""
    if not folder_key or not isinstance(patch, dict):
        return
    try:
        incs: Dict[str, int] = {}
        for campo in patch.keys():
            fam = _familia(str(campo))
            incs[f"correcciones.{fam}"] = incs.get(f"correcciones.{fam}", 0) + 1
        if not incs:
            return
        from bulk_ingest_engine import _iso
        await db.extraction_profiles.update_one(
            {"folder_key": folder_key},
            {"$inc": {**incs, "total_correcciones": sum(incs.values())},
             "$set": {"updated_at": _iso(), "ultimo_proyecto": project_name},
             "$setOnInsert": {"folder_key": folder_key, "created_at": _iso()}},
            upsert=True)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[extraction_profiles] record: {e}")


async def profile_hints(db, folder_key: str) -> Optional[str]:
    """Línea de advertencia para el prompt del recon (None si el drive no tiene historia)."""
    if not folder_key:
        return None
    try:
        prof = await db.extraction_profiles.find_one({"folder_key": folder_key}, {"_id": 0})
        if not prof or not prof.get("correcciones"):
            return None
        partes = [f"{fam} ({n}x)" for fam, n in
                  sorted(prof["correcciones"].items(), key=lambda kv: -kv[1]) if n > 0][:6]
        if not partes:
            return None
        return ("HUELLA DE ESTE DRIVE: en corridas previas se corrigieron manualmente estos campos: "
                + ", ".join(partes) + ". Pon ATENCIÓN ESPECIAL en extraerlos bien esta vez "
                "(verifica columna/etiqueta exacta en la fuente).")
    except Exception as e:  # noqa: BLE001
        log.warning(f"[extraction_profiles] hints: {e}")
        return None
