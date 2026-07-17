"""Amarre de planos por lámina (07-16, founder): una lámina 'Tipo de departamento' se amarra
a una unidad SOLO si pasan TRES candados:

  1. TORRE  — la torre que declara la lámina ADENTRO (no el nombre del archivo) debe coincidir
              con la torre de la unidad (prefijo del número: 'A-1104' → A). Bug real: las láminas
              ALMINA_ARQ decían TORRE B adentro y estaban amarradas a unidades de Torre A.
  2. DEPTO  — el número de la unidad debe estar en la lista de deptos de la lámina (el nombre
              de archivo 'Copia de A-304,504,...,1304.pdf' la trae explícita).
  3. ÁREA   — el área de la lámina debe cuadrar con la lista de precios (±tolerancia), directa,
              +terraza o contra m² totales. Bug real: 'Copia de A-107.pdf' adentro es el stack
              x07 (117 m²), no el PB 107 (176 m²) — el nombre del archivo miente, el contenido no.

Si torre+depto pasan pero el área NO cuadra → NO se amarra y se reporta como conflicto (un
plano equivocado es peor que ningún plano). La lectura de torre/área es por OCR (tesseract)
sobre el preview PNG de la lámina.
"""
from __future__ import annotations

import re
import subprocess
from typing import Optional

TOLERANCIA_M2 = 3.5


def ocr_texto(path: str, timeout: int = 60) -> str:
    try:
        r = subprocess.run(["tesseract", str(path), "stdout"],
                           capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:  # noqa: BLE001
        return ""


def torre_de_lamina(texto: str) -> Optional[str]:
    m = re.search(r"TORRE\s+([A-Z])\b", texto.upper())
    return m.group(1) if m else None


def area_de_lamina(texto: str) -> Optional[float]:
    """'Área: 117.00 m2' (o 'A= 113 M2' del rótulo CAD). None si no aparece."""
    t = texto.upper()
    m = re.search(r"[ÁA]REA:?\s*([\d]+(?:[.,]\d+)?)\s*M2", t) or \
        re.search(r"\bA\s*=\s*([\d]+(?:[.,]\d+)?)\s*M2", t)
    return float(m.group(1).replace(",", ".")) if m else None


def terraza_de_lamina(texto: str) -> Optional[float]:
    m = re.search(r"TERRAZA:?\s*([\d]+(?:[.,]\d+)?)", texto.upper())
    return float(m.group(1).replace(",", ".")) if m else None


def deptos_de_archivo(filename: str) -> tuple[list[str], Optional[int]]:
    """Deptos que el NOMBRE del archivo declara + variante de recámaras si la trae.
    'Copia de A-304,504,704.pdf' → (['304','504','704'], None) · 'Copia de A-108 2 rec.pdf' → (['108'], 2)
    'ALMINA_ARQ_N 3,5,7,9,11,13-304.pdf' → niveles×stack → (['304','504',...,'1304'], None)."""
    f = str(filename or "")
    m = re.match(r"Copia de [A-Z]-(.+?)(?:\s+(\d)\s*rec)?\.pdf", f, re.I)
    if m:
        return [d.strip() for d in m.group(1).split(",") if d.strip().isdigit()], \
            (int(m.group(2)) if m.group(2) else None)
    # familia 'N <niveles>-<stack>': la lista de deptos es niveles × stack (3,5,...-304 → 304..1304)
    m = re.search(r"N(?:IVEL(?:ES)?)?\s+([\d,\s]+)-(\d)?(\d{2})\.pdf$", f, re.I)
    if m:
        niveles = [n.strip() for n in m.group(1).split(",") if n.strip().isdigit()]
        stack = m.group(3)
        return [f"{n}{stack}" for n in niveles], None
    m = re.search(r"-(\d{3,4})\.pdf$", f)
    if m:
        return [m.group(1)], None
    return [], None


def recamaras_de_lamina(texto: str) -> Optional[int]:
    m = re.search(r"(\d)\s*REC[ÁA]MARAS", texto.upper())
    return int(m.group(1)) if m else None


def torre_de_unidad(unit_number: str) -> Optional[str]:
    m = re.match(r"^([A-Z])[\s\-]", str(unit_number or "").strip().upper())
    return m.group(1) if m else None


def area_cuadra(area: Optional[float], terraza: Optional[float],
                m2_priv: Optional[float], m2_total: Optional[float],
                tol: float = TOLERANCIA_M2) -> bool:
    """¿El área de la lámina explica los m² de la lista? (directa, +terraza, o vs totales)."""
    if area is None:
        return False
    objetivos = [m2 for m2 in (m2_priv, m2_total) if m2]
    for m2 in objetivos:
        if abs(area - m2) <= tol:
            return True
        if terraza is not None and abs((area + terraza) - m2) <= tol:
            return True
    return False


def lamina_cuadra_con_unidad(area: Optional[float], terraza: Optional[float],
                             rec_lamina: Optional[int], rec_unidad,
                             m2_priv: Optional[float], m2_total: Optional[float],
                             tol: float = TOLERANCIA_M2) -> bool:
    """Candado área+recámaras completo. FLEX (Almina): si las recámaras difieren (lámina 3
    REC, lista 2 rec) solo vale cuando el área DIRECTA cuadra — misma huella, alcoba flex.
    El empate 'área+terraza' exige recámaras iguales (así 'Copia de A-107' 117+59=176/2REC
    NO se amarra a la unidad A-107 de 3 rec: nombre de archivo miente, contenido no)."""
    if area is None:
        return False
    objetivos = [m2 for m2 in (m2_priv, m2_total) if m2]
    directa = any(abs(area - m2) <= tol for m2 in objetivos)
    con_terraza = terraza is not None and any(abs((area + terraza) - m2) <= tol for m2 in objetivos)
    rec_ok = rec_lamina is None or rec_unidad is None or int(rec_unidad) == rec_lamina
    return directa if not rec_ok else (directa or con_terraza)
