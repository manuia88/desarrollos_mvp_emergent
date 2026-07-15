"""EXTRACTOR DE COTAS — los planos 'con cotas' → espacios MEDIDOS (el átomo habitación).

Del texto del plano: 'RECÁMARA PRINCIPAL 3.20 x 2.80' → {espacio, largo, ancho, m²}.
Se guarda en molde_programa.espacios_medidos (reservado desde Almina) y valida:
suma de espacios ≈ habitables (±20% por muros/circulación) = capa extra del cotejo.
Puro/testeable; el runner usa descarga_segura. $0.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List

ESPACIOS = ("RECAMARA PRINCIPAL", "RECAMARA", "ALCOBA", "ESTANCIA", "SALA", "COMEDOR",
            "COCINA", "BAÑO", "BANO", "VESTIDOR", "TERRAZA", "BALCON", "PATIO",
            "LAVADO", "SERVICIO", "ESTUDIO", "FLEX", "HALL", "ROOF")
_COTA = re.compile(r"(\d\.\d{1,2})\s*[xX×]\s*(\d\.\d{1,2})")


def _plano_texto_norm(t: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", t or "")
                if unicodedata.category(c) != "Mn")
    return s.upper()


def extraer_cotas(texto: str) -> List[Dict[str, Any]]:
    """Empareja nombre de espacio con la cota más cercana EN SU MISMA LÍNEA (o la
    siguiente). Nunca inventa: espacio sin cota en contexto = no se mide."""
    out: List[Dict[str, Any]] = []
    lineas = _plano_texto_norm(texto).split("\n")
    for i, ln in enumerate(lineas):
        for esp in ESPACIOS:
            if esp in ln:
                zona = ln + " " + (lineas[i + 1] if i + 1 < len(lineas) else "")
                m = _COTA.search(zona)
                if m:
                    a, b = float(m.group(1)), float(m.group(2))
                    if 0.5 < a < 15 and 0.5 < b < 15:
                        out.append({"espacio": esp.lower(), "largo": a, "ancho": b,
                                    "m2": round(a * b, 2)})
                break
    # dedupe por espacio (la primera medición gana)
    vistos, únicos = set(), []
    for e in out:
        if e["espacio"] not in vistos:
            vistos.add(e["espacio"])
            únicos.append(e)
    return únicos


def validar_contra_habitables(espacios: List[Dict[str, Any]],
                              m2_habitables: float) -> Dict[str, Any]:
    """Suma de espacios interiores ≈ habitables (±20%: muros y circulación no se cotan)."""
    interiores = [e for e in espacios if e["espacio"] not in
                  ("terraza", "balcon", "patio", "roof")]
    suma = round(sum(e["m2"] for e in interiores), 2)
    if not m2_habitables or not interiores:
        return {"valida": None, "suma_interiores": suma}
    ratio = suma / m2_habitables
    return {"valida": bool(0.55 <= ratio <= 1.05), "suma_interiores": suma,
            "ratio": round(ratio, 2),
            "nota": None if 0.55 <= ratio <= 1.05 else
            f"la suma de espacios ({suma}) no cuadra con habitables ({m2_habitables})"}
