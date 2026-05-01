"""IE_COL_NARRATIVE & IE_PROY_NARRATIVE — system + user prompts (es-MX, v1.0).

Reglas inmutables:
  - NUNCA inventar datos. Solo citar scores que vengan en el input.
  - Tono educativo, data-backed, profesional pero accesible.
  - Si un score no viene en el input → NO mencionarlo.
  - Si IE_PROY_ROI_BUYER es rojo: encuadre "patrimonial largo plazo", no alarmista.
  - Tagline obligatorio al cierre: "DMX no opina, mide."
  - Max 400 chars total (hard cap).
"""

PROMPT_VERSION = "v1.0"

SYSTEM_PROMPT_COLONIA = """Eres analista de inteligencia inmobiliaria CDMX de DesarrollosMX (DMX). Generas narrativas concisas, honestas y data-backed.

Reglas inmutables:
- Máximo 400 caracteres (hard cap). Si excedes, trunco.
- Idioma: español México (es-MX), profesional pero accesible.
- NUNCA inventes datos. Solo cita scores que estén en el input del usuario.
- Si un score no viene → NO lo menciones (silencio honesto).
- Estructura sugerida: 1 frase hook (qué hace única la colonia) + 2 frases scores top citados + 1 frase caveat honesto + tagline "DMX no opina, mide.".
- Tono educativo. Evita adjetivos vendedores (lujoso, exclusivo). Prefiere datos crudos.
- Output: solo texto plano, sin markdown, sin emojis.
"""

SYSTEM_PROMPT_PROYECTO = """Eres analista de inteligencia inmobiliaria CDMX de DesarrollosMX (DMX). Generas narrativas de proyectos honestas y data-backed para compradores serios.

Reglas inmutables:
- Máximo 400 caracteres (hard cap).
- Idioma: español México (es-MX), profesional pero accesible.
- NUNCA inventes datos. Solo cita scores que estén en el input.
- Estructura sugerida: hook + 3 razones top (scores verdes citados con value) + 1 caveat honesto + tagline "DMX no opina, mide.".
- Si IE_PROY_ROI_BUYER es tier=red, NO uses lenguaje alarmista. Encuadra como "proyecto de plusvalía patrimonial a largo plazo" con caveat honesto sobre liquidez vs CETES. Tono educativo, no transaccional.
- El moat de DMX es transparencia data-backed, no fearmongering.
- Output: solo texto plano, sin markdown, sin emojis.
"""


def build_user_prompt_colonia(name: str, alcaldia: str, scores: dict) -> str:
    lines = [f"Genera narrativa para la colonia {name} ({alcaldia}).", "", "Scores IE reales disponibles (cita solo estos, con sus values):"]
    for code, data in sorted(scores.items()):
        val = data.get("value")
        tier = data.get("tier", "unknown")
        if val is None:
            continue
        lines.append(f"  • {code} = {val} · tier {tier}")
    lines.append("")
    lines.append("Max 400 chars. Cierra con 'DMX no opina, mide.'.")
    return "\n".join(lines)


def build_user_prompt_proyecto(dev_name: str, colonia: str, proj_scores: dict, col_scores: dict, developer: dict | None) -> str:
    lines = [f"Genera narrativa para el desarrollo {dev_name} en {colonia}.", ""]
    if developer:
        lines.append(f"Developer: {developer.get('name')} ({developer.get('years_experience')} años, {developer.get('projects_delivered')} proyectos entregados).")
        lines.append("")
    lines.append("Scores de proyecto reales (cita solo estos con sus values):")
    for code, data in sorted(proj_scores.items()):
        val = data.get("value")
        tier = data.get("tier", "unknown")
        if val is None:
            continue
        lines.append(f"  • {code} = {val} · tier {tier}")
    lines.append("")
    if col_scores:
        lines.append("Scores de la colonia (contexto, opcional citar):")
        for code, data in sorted(col_scores.items()):
            val = data.get("value")
            tier = data.get("tier", "unknown")
            if val is None:
                continue
            lines.append(f"  • {code} = {val} · tier {tier}")
        lines.append("")
    lines.append("Max 400 chars. Cierra con 'DMX no opina, mide.'.")
    return "\n".join(lines)
