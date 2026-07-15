"""PROGRAMA ARQUITECTÓNICO — el átomo debajo del molde: qué espacios tiene el depa.

Fuente: el texto impreso en el plano del arquitecto (pdfplumber, $0, sin IA).
Del plano de CLASS/Almina se lee confiable: Área total, Terraza/Patio/Balcón, tipo
("3 RECÁMARAS"), niveles donde aplica ("NIVEL 3, 5, 7...") y QUÉ espacios existen
(cocina, estancia, alcoba, flex, servicio, vestidor...). Las MEDIDAS por espacio se
capturan aparte (lectura visual en sesión o plano a mayor escala) en espacios_medidos.

parse_texto_plano() es pura (testeable); extraer_programa_pdf() abre el archivo.
Colección: molde_programa (1 doc por molde). Consumidores: Cotejo + Expediente + buscador.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# espacios que un plano residencial CDMX nombra (presencia = filtro vendible)
ESPACIOS = {
    "cocina": r"COCINA", "estancia": r"ESTANCIA|SALA", "comedor": r"COMEDOR",
    "recamara_principal": r"REC[ÁA]MARA\s*PRINCIPAL|R\.?\s*PRINCIPAL",
    "alcoba": r"ALCOBA", "flex": r"FLEX", "estudio": r"ESTUDIO",
    "vestidor": r"VESTIDOR", "cuarto_servicio": r"SERVICIO",
    "lavado": r"LAVADO|LAVANDER", "terraza": r"TERRAZA", "balcon": r"BALC[ÓO]N",
    "patio": r"PATIO", "roof_privado": r"ROOF",
}

_AREA = re.compile(r"[ÁA]rea:?\s*([\d.,]+)\s*m2", re.I)
_TERRAZA = re.compile(r"Terraza:?\s*([\d.,]+)", re.I)
_PATIO = re.compile(r"Patio:?\s*([\d.,]+)", re.I)
_BALCON = re.compile(r"Balc[óo]n:?\s*([\d.,]+)", re.I)
# header limpio "3 RECÁMARAS" (con espacio y plural) — el texto encimado del
# esquemático genera falsos "0RECAMARA"; solo confiamos en el encabezado
_RECAMARAS = re.compile(r"\b([1-4])\s+REC[ÁA]MARAS\b", re.I)
_NIVELES = re.compile(r"NIVEL(?:ES)?\s*((?:\d+\s*,?\s*)+)", re.I)
_TORRE = re.compile(r"Torre\s+([AB])\b", re.I)


def _num(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_texto_plano(texto: str) -> Dict[str, Any]:
    """Lee lo CONFIABLE del texto de un plano (lo demás es lectura visual, no se inventa)."""
    t = texto or ""
    esp = sorted(k for k, pat in ESPACIOS.items() if re.search(pat, t, re.I))
    niveles: List[int] = []
    mn = _NIVELES.search(t)
    if mn:
        niveles = [int(x) for x in re.findall(r"\d+", mn.group(1))]
    mr = _RECAMARAS.search(t)
    torres = sorted(set(m.upper() for m in _TORRE.findall(t)))
    return {
        "area_plano_m2": _num((_AREA.search(t) or [None, None])[1]),
        "terraza_plano_m2": _num((_TERRAZA.search(t) or [None, None])[1]),
        "patio_plano_m2": _num((_PATIO.search(t) or [None, None])[1]),
        "balcon_plano_m2": _num((_BALCON.search(t) or [None, None])[1]),
        "recamaras_plano": int(mr.group(1)) if mr else None,
        "niveles_plano": niveles,
        "torres_plano": torres,
        "espacios": esp,
    }


def extraer_programa_pdf(ruta_pdf: str) -> Dict[str, Any]:
    """Abre el PDF del plano y parsea su texto. Fail-soft: sin texto → programa vacío."""
    try:
        import pdfplumber
        with pdfplumber.open(ruta_pdf) as pdf:
            texto = "\n".join((p.extract_text() or "") for p in pdf.pages)
        return parse_texto_plano(texto)
    except Exception:  # noqa: BLE001 — un plano ilegible no tira nada
        return parse_texto_plano("")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def guardar_programa(db, development_id: str, prototype_id: str,
                           programa: Dict[str, Any], fuente: str = "plano") -> None:
    """Upsert del programa de un molde. espacios_medidos (lectura visual) se conserva
    si ya existía — el parser de texto nunca lo pisa."""
    doc = {"development_id": development_id, "prototype_id": prototype_id,
           "fuente": fuente, "extraido_at": _now_iso(), **programa}
    await db.molde_programa.update_one(
        {"prototype_id": prototype_id},
        {"$set": doc, "$setOnInsert": {"espacios_medidos": []}}, upsert=True)
