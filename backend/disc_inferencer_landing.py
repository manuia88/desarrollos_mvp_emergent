"""W5.22 Z.8.5 — DISC inferencer para leads de landings.

Analiza nombre/mensaje/source/campos extra del lead para inferir DISC profile.
NO requiere LLM externo · usa heuristicas keyword-based en es-MX.

DISC primario:
  D (Dominant)    · directos · "comprar ya" · "ROI" · "valor"
  I (Influential) · sociales · "familia" · "amigos" · "lifestyle"
  S (Steady)      · cautos   · "seguro" · "tiempo" · "tranquilo"
  C (Conscientious) · datos · "verificar" · "documentos" · "garantia"
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# Keyword buckets per DISC dimension (lower-case · es-MX)
DISC_KEYWORDS: Dict[str, List[str]] = {
    "D": [
        "comprar", "ya", "ahora", "rapido", "urgente", "roi", "rentabilidad",
        "inversion", "ganar", "valor", "rendimiento", "negocio", "decidido",
        "cierro", "cerrar", "directo", "necesito ya", "lo mas pronto",
    ],
    "I": [
        "familia", "hijos", "amigos", "social", "diversion", "fiesta",
        "experiencia", "encantador", "ambiente", "comunidad", "lifestyle",
        "feliz", "padres", "hermanos", "calidad de vida",
    ],
    "S": [
        "seguro", "tranquilo", "tiempo", "pensarlo", "consultar", "estable",
        "calma", "pacientemente", "estabilidad", "esperar", "evaluando",
        "considerar", "futuro", "decision importante",
    ],
    "C": [
        "datos", "documentos", "verificar", "garantia", "compliance", "legal",
        "escrituras", "notario", "comprobante", "soporte", "evidencia",
        "comparar", "analizar", "informacion", "due diligence", "auditoria",
    ],
}


def infer_disc_from_lead(lead_data: Dict[str, Any]) -> Optional[str]:
    """Returns 'D' | 'I' | 'S' | 'C' or None si insuficiente data.

    Suma scores por dimension contando keyword matches en:
      - payload.nombre · payload.mensaje · payload.message · payload.notes
      - source · zona · campos extra que sean strings
    """
    if not lead_data:
        return None

    text_parts: List[str] = []
    for k in ("nombre", "name", "mensaje", "message", "notes", "comments", "interes", "zona", "zone_interest", "source"):
        v = lead_data.get(k)
        if isinstance(v, str):
            text_parts.append(v.lower())

    # Add presupuesto value as hint (high budget · D tendency)
    presup = lead_data.get("presupuesto") or lead_data.get("budget")
    if isinstance(presup, str):
        text_parts.append(presup.lower())

    if not text_parts:
        return None

    text = " ".join(text_parts)
    scores: Dict[str, int] = {"D": 0, "I": 0, "S": 0, "C": 0}
    for dim, kws in DISC_KEYWORDS.items():
        for kw in kws:
            if kw in text:
                scores[dim] += 1

    # Budget hint: presupuesto > $10M → +D bias
    if isinstance(presup, str) and any(t in presup for t in ("> $10m", "> 10m", "$10m", "10m+", "10 millones")):
        scores["D"] += 1

    total = sum(scores.values())
    if total == 0:
        return None

    # Pick highest scoring dimension · tie-break alphabetical
    best = max(scores.items(), key=lambda x: (x[1], -ord(x[0])))
    return best[0]


def disc_label(disc: Optional[str]) -> str:
    """Devuelve label es-MX user-facing."""
    return {
        "D": "Directo · decidido",
        "I": "Social · influyente",
        "S": "Estable · cauteloso",
        "C": "Analitico · meticuloso",
    }.get(disc or "", "Sin perfil DISC")


def disc_score_explanation(lead_data: Dict[str, Any]) -> Dict[str, Any]:
    """Debug helper: scores por dimension + winning dim + razones."""
    text_parts: List[str] = []
    for k in ("nombre", "name", "mensaje", "message", "notes", "comments", "interes", "zona", "zone_interest"):
        v = lead_data.get(k)
        if isinstance(v, str):
            text_parts.append(v.lower())
    text = " ".join(text_parts)

    scores: Dict[str, int] = {"D": 0, "I": 0, "S": 0, "C": 0}
    matched: Dict[str, List[str]] = {"D": [], "I": [], "S": [], "C": []}
    for dim, kws in DISC_KEYWORDS.items():
        for kw in kws:
            if kw in text:
                scores[dim] += 1
                matched[dim].append(kw)

    winner = infer_disc_from_lead(lead_data)
    return {
        "scores": scores,
        "matched_keywords": matched,
        "winner": winner,
        "label": disc_label(winner),
        "text_analyzed_chars": len(text),
    }
