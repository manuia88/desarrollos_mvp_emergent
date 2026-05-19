"""W5.22 Z.2 Sub-A — Studio Buyer-angle Copy Engine.

Genera copy marketing personalizado por persona compradora (7) + DISC (4) + idioma (2).
LLM: Claude Sonnet via EMERGENT_LLM_KEY. Fallback OpenAI si Claude timeout 30s.

Collections:
    studio_copy_jobs: {id, tenant_id, user_id, project_id, buyer_angle, disc_profile,
                       language, context_input, output_text, output_variants, status,
                       error, created_at}
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.studio_buyer_copy")

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
OPENAI_MODEL = "gpt-4o-mini"

# ─── 7 Personas LATAM ────────────────────────────────────────────────────────
PERSONAS: Dict[str, Dict[str, Any]] = {
    "inversor": {
        "nombre": "Inversor patrimonial",
        "enfoque": "ROI, cash flow, plusvalía, tasa de capitalización, flujo mensual proyectado",
        "objeciones_clave": "rendimiento vs CETES, liquidez, riesgo inquilino",
        "cta": "Descarga proyección",
        "tono": "Analítico, directo, basado en números. Sin adjetivos vacíos.",
    },
    "familia": {
        "nombre": "Familia en crecimiento",
        "enfoque": "Espacio vivible, número de recámaras, escuelas cercanas, seguridad de zona, comunidad",
        "objeciones_clave": "presupuesto ajustado, plazo de entrega, servicios para niños",
        "cta": "Agenda tu visita",
        "tono": "Cálido, enfocado en bienestar y futuro familiar.",
    },
    "first_buyer": {
        "nombre": "Primer comprador",
        "enfoque": "Crédito hipotecario, enganche mínimo, INFONAVIT/FOVISSSTE, mensualidad accesible",
        "objeciones_clave": "miedo al proceso, documentación, historial crediticio",
        "cta": "Calcula tu crédito",
        "tono": "Didáctico, tranquilizador. Elimina tecnicismos.",
    },
    "exec": {
        "nombre": "Ejecutivo / Alto directivo",
        "enfoque": "Estatus, amenidades premium, privacidad, ubicación top, servicio personalizado",
        "objeciones_clave": "tiempo disponible, proceso ágil, exclusividad",
        "cta": "Tour privado VIP",
        "tono": "Sofisticado, conciso, exclusivo.",
    },
    "extranjero": {
        "nombre": "Comprador extranjero / Expat",
        "enfoque": "Visado, fideicomiso, proceso bilingüe, seguridad jurídica, lifestyle CDMX",
        "objeciones_clave": "desconocimiento legal, tipo de cambio, manejo a distancia",
        "cta": "Habla con asesor bilingüe",
        "tono": "Bilingüe (incluye frases en inglés), claro y tranquilizador.",
    },
    "jubilado": {
        "nombre": "Jubilado / Adulto mayor",
        "enfoque": "Quietud, accesibilidad, servicios médicos cerca, comunidad de confianza, bajo mantenimiento",
        "objeciones_clave": "movilidad, condominio activo, renta fija",
        "cta": "Conoce tu nuevo hogar",
        "tono": "Cálido, pausado, empático. Sin prisa.",
    },
    "empty_nester": {
        "nombre": "Nido vacío (hijos independizados)",
        "enfoque": "Downsizing inteligente, plusvalía del actual, espacios funcionales, nueva etapa de vida",
        "objeciones_clave": "vender primero, transición emocional, tamaño adecuado",
        "cta": "Descubre tu próxima etapa",
        "tono": "Empático, positivo sobre la transición, práctico.",
    },
}

# ─── DISC Adaptation ─────────────────────────────────────────────────────────
DISC: Dict[str, Dict[str, str]] = {
    "D": {
        "estilo": "Dominante / Decisor",
        "ajuste": (
            "Mensajes directos, énfasis en resultados y beneficios concretos. "
            "Números específicos, fechas, ventaja competitiva. Evitar dilaciones. "
            "Cierre de acción claro al final. Brevedad sobre elocuencia."
        ),
    },
    "I": {
        "estilo": "Influyente / Social",
        "ajuste": (
            "Tono entusiasta, menciona lifestyle e imagen social. Incluye testimonios "
            "o prueba social implícita. Activa imaginación del futuro. Más emocional."
        ),
    },
    "S": {
        "estilo": "Estable / Analítico lento",
        "ajuste": (
            "Énfasis en seguridad, garantías, proceso paso a paso. Lenguaje de apoyo "
            "y comunidad. Evitar presión de tiempo. Menciona soporte post-venta."
        ),
    },
    "C": {
        "estilo": "Concienzudo / Analítico",
        "ajuste": (
            "Datos verificables, proceso detallado, métricas y fuentes. Respuestas "
            "a objeciones técnicas. Permite comparar. Rigor sobre simplicidad."
        ),
    },
}


def _build_prompt(
    persona_key: str,
    disc: Optional[str],
    language: str,
    context_extra: str,
) -> str:
    persona = PERSONAS.get(persona_key)
    if not persona:
        raise ValueError(f"Persona desconocida: {persona_key}")

    disc_block = ""
    if disc and disc.upper() in DISC:
        d = DISC[disc.upper()]
        disc_block = f"\n\nAdaptación DISC ({d['estilo']}): {d['ajuste']}"

    lang_instruction = (
        "Genera el copy en español (es-MX), natural y directo."
        if language == "es-MX"
        else "Generate the copy in English (US), natural and direct."
    )

    return f"""Eres un experto en marketing inmobiliario LATAM. Genera copy de ventas para un carrusel de redes sociales.

PERSONA TARGET: {persona['nombre']}
ENFOQUE: {persona['enfoque']}
OBJECIONES CLAVE: {persona['objeciones_clave']}
CTA SUGERIDO: {persona['cta']}
TONO: {persona['tono']}{disc_block}

CONTEXTO ADICIONAL DEL PROYECTO:
{context_extra or "Desarrollo residencial en CDMX, precio medio-alto, entrega 2025-2026."}

INSTRUCCIONES:
- Genera un copy principal (hook) de máximo 2 líneas impactantes
- Genera 3 variaciones del cuerpo del copy (para A/B testing), cada una de 2-4 oraciones
- Incluye el CTA al final de cada variación
- {lang_instruction}
- NO uses clichés como "el hogar de tus sueños" o "no lo pierdas"
- Sé específico, no genérico

FORMATO DE RESPUESTA (JSON estricto):
{{
  "hook": "...",
  "variants": [
    {{"copy": "...", "cta": "..."}},
    {{"copy": "...", "cta": "..."}},
    {{"copy": "...", "cta": "..."}}
  ]
}}"""


async def _call_llm(prompt: str, job_id: str, provider: str = "anthropic") -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY no configurado")
    model = CLAUDE_MODEL if provider == "anthropic" else OPENAI_MODEL
    chat = LlmChat(
        api_key=api_key,
        session_id=f"copy_{job_id}_{provider}",
        system_message="Eres un experto en marketing inmobiliario LATAM. Siempre responde con JSON válido.",
    ).with_model(provider, model)
    return await chat.send_message(LlmUserMsg(text=prompt))


async def _call_with_fallback(prompt: str, job_id: str) -> str:
    try:
        return await asyncio.wait_for(_call_llm(prompt, job_id, "anthropic"), timeout=30.0)
    except (asyncio.TimeoutError, Exception) as e:
        log.warning(f"[copy] Claude failed ({e}), fallback OpenAI")
        return await asyncio.wait_for(_call_llm(prompt, job_id, "openai"), timeout=30.0)


async def generate_copy_job(
    db,
    *,
    tenant_id: str,
    user_id: str,
    buyer_angle: str,
    disc: Optional[str],
    language: str,
    context_extra: str,
    project_id: Optional[str] = None,
) -> str:
    """Crea job, dispara generacion en background, retorna job_id."""
    job_id = f"cj_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    await db.studio_copy_jobs.insert_one({
        "id": job_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "project_id": project_id,
        "buyer_angle": buyer_angle,
        "disc_profile": disc,
        "language": language,
        "context_input": context_extra,
        "output_text": None,
        "output_variants": None,
        "status": "pending",
        "error": None,
        "created_at": now,
    })
    asyncio.create_task(_run_job(db, job_id, buyer_angle, disc, language, context_extra))
    return job_id


async def _run_job(db, job_id: str, buyer_angle: str, disc: Optional[str], language: str, context_extra: str):
    try:
        prompt = _build_prompt(buyer_angle, disc, language, context_extra)
        raw = await _call_with_fallback(prompt, job_id)
        import json, re
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {"hook": raw, "variants": []}
        await db.studio_copy_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "output_text": data.get("hook", ""),
                "output_variants": data.get("variants", []),
                "status": "done",
            }},
        )
        log.info(f"[copy] job {job_id} done")
    except Exception as exc:
        log.warning(f"[copy] job {job_id} failed: {exc}")
        await db.studio_copy_jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "failed", "error": str(exc)}},
        )


async def get_job(db, job_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    doc = await db.studio_copy_jobs.find_one(
        {"id": job_id, "user_id": user_id}, {"_id": 0}
    )
    return doc


async def list_jobs(db, user_id: str, limit: int = 20, skip: int = 0) -> List[Dict[str, Any]]:
    cursor = db.studio_copy_jobs.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit)
    return await cursor.to_list(limit)


async def ensure_indexes(db) -> None:
    await db.studio_copy_jobs.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.studio_copy_jobs.create_index("id", unique=True, background=True)
    log.info("[studio_copy] indexes OK")
