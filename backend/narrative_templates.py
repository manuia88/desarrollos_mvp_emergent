"""W5.x F4 Sub-B · Narrative Layer · 7 audience profiles + 4 DISC overlays.

Cada perfil define tone, opening hook, structure outline, signature phrases,
closing template y tax close template (Tax Projector F6 integration).
DISC overlays modifican el system prompt aplicando ajustes de estilo.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


# ─── 7 Audience profiles ─────────────────────────────────────────────────────
AUDIENCE_PROFILES: Dict[str, Dict[str, Any]] = {
    "investor": {
        "tone": "Bloomberg memo · analitico · neutral · datos primero",
        "opening_hook": "Empieza con el numero mas potente (ROI, cap rate, yield).",
        "structure_outline": "1) tesis de inversion · 2) ROI/cap rate/yield citados · 3) comparables y DRPI · 4) cierre net-after-tax",
        "signature_phrases": [
            "yield neto",
            "cap rate",
            "rendimiento esperado",
            "tesis",
            "due diligence",
            "compresion de cap",
        ],
        "closing_template": "Cierre con tesis numerica y proximo paso (visita o data room).",
        "tax_close_template": "Utilidad neta post-ISR estimada: ${utilidad_neta_post_tax:,.0f} · ROI neto {roi_neto_pct:.1f}% [Tax Projector F6]",
    },
    "family": {
        "tone": "Calido · cercano · enfocado en hogar, hijos y comunidad",
        "opening_hook": "Empieza con la escena de un sabado en familia en la zona.",
        "structure_outline": "1) hook emocional · 2) escuelas/parques/hospitales con distancias · 3) seguridad y comunidad · 4) cierre sense of home",
        "signature_phrases": [
            "tu familia",
            "para tus hijos",
            "a 5 minutos caminando",
            "primer dia de escuela",
            "comunidad cercana",
            "sabado por la manana",
        ],
        "closing_template": "Cierre con invitacion calida a visitar en sabado familiar.",
        "tax_close_template": "Costo total de adquisicion ${closing_total:,.0f} · predial primer anio ~${predial_y1:,.0f} [Tax Projector F6]",
    },
    "first_home": {
        "tone": "Brunson agresivo · math claro · urgencia honesta · sin paternalismo",
        "opening_hook": "Empieza con math block renta vs credito · cifra cruda.",
        "structure_outline": "1) renta vs credito · 2) Infonavit/Fovissste explicado · 3) 3 secretos del primer credito · 4) cierre urgencia honesta",
        "signature_phrases": [
            "deja de pagar renta",
            "construir patrimonio",
            "primer credito",
            "tu enganche real",
            "Infonavit habla",
            "honest math",
        ],
        "closing_template": "Cierre con CTA agresiva pero honesta · acompaniamiento gratis.",
        "tax_close_template": "Costo total de adquisicion ${closing_total:,.0f} · predial primer anio ~${predial_y1:,.0f} [Tax Projector F6]",
    },
    "luxury": {
        "tone": "Vogue editorial · serif · ritmo lento · craft sobre datos",
        "opening_hook": "Empieza con una frase atemporal sobre el arquitecto o el material.",
        "structure_outline": "1) historia del proyecto · 2) materiales y craft · 3) servicios privados · 4) cierre privacidad e invitacion curada",
        "signature_phrases": [
            "el arquitecto concibio",
            "piedra original",
            "edicion limitada",
            "vision atemporal",
            "discrecion",
            "por invitacion",
        ],
        "closing_template": "Cierre con invitacion privada · solo X visitas al mes.",
        "tax_close_template": "Inversion total incluyendo cierre ${closing_total:,.0f} · ISR proyectado a 10 anios ${isr_estimado:,.0f} [Tax Projector F6]",
    },
    "boutique": {
        "tone": "Curador cultural · historia del barrio · ritmo medio",
        "opening_hook": "Empieza con un detalle historico del barrio o la calle.",
        "structure_outline": "1) historia del barrio · 2) materiales restaurados · 3) tres detalles curatoriales · 4) cierre comunidad",
        "signature_phrases": [
            "restaurado pieza a pieza",
            "el barrio que recuerdas",
            "atelier vecino",
            "patrimonio vivo",
            "cafe en la esquina",
            "comunidad curada",
        ],
        "closing_template": "Cierre con visita curada · 4 visitas semanales maximas.",
        "tax_close_template": "Costo total de adquisicion ${closing_total:,.0f} · predial primer anio ~${predial_y1:,.0f} [Tax Projector F6]",
    },
    "urgent": {
        "tone": "Punzante · countdown REAL (no fake) · escasez basada en datos",
        "opening_hook": "Empieza con la unidades restantes o la fecha exacta de cierre de fase.",
        "structure_outline": "1) escasez con cifra · 2) fase actual vs siguiente · 3) stack de bonos · 4) CTA hoy",
        "signature_phrases": [
            "ultimas unidades",
            "cierra fase",
            "esta semana",
            "aparta hoy",
            "valor stack",
            "decision pendiente",
        ],
        "closing_template": "Cierre con CTA fuerte y deadline real.",
        "tax_close_template": "Costo total estimado de cierre ${closing_total:,.0f} [Tax Projector F6]",
    },
    "neutral": {
        "tone": "Balanceado · informativo · sin sesgo emocional · default",
        "opening_hook": "Empieza con el dato mas distintivo del proyecto.",
        "structure_outline": "1) overview · 2) caracteristicas distintivas · 3) ubicacion y zona · 4) cierre con next steps",
        "signature_phrases": [
            "destaca por",
            "se ubica en",
            "ofrece",
            "ideal para",
            "proximos pasos",
            "agenda visita",
        ],
        "closing_template": "Cierre con next steps claros (visita, brochure, llamada).",
        "tax_close_template": "Estimado de cierre comprador ${closing_total:,.0f} [Tax Projector F6]",
    },
}


# ─── 4 DISC overlays ─────────────────────────────────────────────────────────
DISC_OVERLAYS: Dict[str, str] = {
    "D": "+20% datos numericos y orientacion a resultados · -20% adjetivos suaves · oraciones cortas y directas.",
    "I": "+30% storytelling y lenguaje emocional moderado · referencias a personas y momentos · ritmo fluido.",
    "S": "+30% pruebas sociales y seguridad (testimonios, reviews, certificaciones) · ritmo pausado y reassurance.",
    "C": "+40% fuentes citadas explicitamente · specs tecnicos y verificables · cero hyperbole.",
}

LANGUAGE_LABEL: Dict[str, str] = {
    "es-MX": "espanol (es-MX) · usar terminos del mercado mexicano",
    "en-US": "ingles (en-US) · neutral · convertir cifras a MXN cuando aplique",
}


def _fmt_facts(facts: Dict[str, Any]) -> str:
    """Renderiza facts en una lista compacta key: value [source] para incluirla en el user_prompt."""
    if not facts:
        return "(sin datos crudos disponibles)"
    lines = []
    for k, v in facts.items():
        if isinstance(v, dict) and "value" in v:
            src = v.get("source", "fuente interna")
            lines.append(f"- {k}: {v['value']} [{src}]")
        else:
            lines.append(f"- {k}: {v}")
    return "\n".join(lines)


def _fmt_tax_block(tax_block: Dict[str, Any]) -> str:
    if not tax_block:
        return "(sin datos fiscales · omite el bloque tax_close al cerrar)"
    lines = []
    for k, v in tax_block.items():
        if k == "source":
            continue
        if isinstance(v, (int, float)):
            lines.append(f"- {k}: {v:,.2f}")
        else:
            lines.append(f"- {k}: {v}")
    source = tax_block.get("source", "Tax Projector F6")
    return "\n".join(lines) + f"\n(fuente: {source})"


def build_prompt(
    audience: str,
    disc: Optional[str],
    facts: Dict[str, Any],
    tax_block: Optional[Dict[str, Any]],
    language: str = "es-MX",
) -> Dict[str, str]:
    """Construye system_prompt y user_prompt para el LLM.

    Retorna {system_prompt, user_prompt} ambos strings non-empty.
    """
    profile = AUDIENCE_PROFILES.get(audience) or AUDIENCE_PROFILES["neutral"]
    disc_mod = DISC_OVERLAYS.get(disc) if disc else None
    lang_note = LANGUAGE_LABEL.get(language, LANGUAGE_LABEL["es-MX"])

    sig = " · ".join(profile["signature_phrases"])
    system_prompt = (
        "Eres un copywriter inmobiliario senior especializado en CDMX.\n"
        f"AUDIENCIA: {audience}\n"
        f"TONO: {profile['tone']}\n"
        f"HOOK: {profile['opening_hook']}\n"
        f"ESTRUCTURA: {profile['structure_outline']}\n"
        f"FRASES SIGNATURE: {sig}\n"
        f"CIERRE: {profile['closing_template']}\n"
        f"TAX CLOSE TEMPLATE: {profile['tax_close_template']}\n"
        f"IDIOMA: {lang_note}\n"
        + (f"DISC OVERLAY ({disc}): {disc_mod}\n" if disc_mod else "")
        + "\nREGLAS NO NEGOCIABLES:\n"
          "- Cada afirmacion numerica DEBE llevar la fuente entre corchetes ej '[Atlas DRPI · 2026-Q1]'.\n"
          "- NO inventes datos · si un dato no esta en facts, omitelo en lugar de fabricarlo.\n"
          "- Cero emoji · cero hyperbole sin sustento.\n"
          "- Si tax block esta presente, cierra narrative_long con la tax_close_template aplicando substitucion.\n"
          "- Devuelve EXCLUSIVAMENTE JSON valido con la siguiente shape:\n"
          '  {"narrative_long": str, "narrative_medium": str, "narrative_short": str,\n'
          '   "citations": [{"claim": str, "source": str}], "confidence": float}\n'
          "  - narrative_long: 200-300 palabras (web).\n"
          "  - narrative_medium: 80-100 palabras (email).\n"
          "  - narrative_short: <=280 caracteres (WhatsApp).\n"
          "  - citations: 1 entry por afirmacion numerica con fuente.\n"
          "  - confidence: 0-1 reflejando cuanto se apoya en datos reales vs inferencia.\n"
    )

    user_prompt = (
        "FACTS DISPONIBLES (key: value [source]):\n"
        f"{_fmt_facts(facts)}\n\n"
        "TAX BLOCK (Tax Projector F6):\n"
        f"{_fmt_tax_block(tax_block or {})}\n\n"
        "INSTRUCCION: Genera los 3 outputs (long/medium/short) en una sola respuesta JSON. "
        "Cierra narrative_long con tax_close_template aplicando los valores del tax block; si tax block esta vacio, omite la seccion tax sin error. "
        "Responde SOLO el JSON, sin prefacios."
    )
    return {"system_prompt": system_prompt, "user_prompt": user_prompt}
