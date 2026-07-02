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

    # LLM-GND-01 · candado anti-invención. Este copy es marketing PÚBLICO que ve el
    # comprador → inventar amenidades/precios/m2/fechas es engaño y riesgo legal.
    # Cuando NO hay contexto real del proyecto, NO sembramos un placeholder con cifras
    # concretas (precio/entrega): degradamos a copy SIN números para no inducir alucinación.
    _ctx_real = (context_extra or "").strip()
    if _ctx_real:
        contexto_block = _ctx_real
        no_data_rule = ""
    elif language == "es-MX":
        contexto_block = "(Sin datos verificados del proyecto. Escribe copy de valor SIN cifras concretas.)"
        no_data_rule = (
            "\n- NO se proporcionaron datos del proyecto: NO menciones precios, mensualidades, "
            "m2, número de recámaras, fechas de entrega ni amenidades específicas. "
            "Escribe sobre el beneficio/estilo de vida en términos generales."
        )
    else:
        contexto_block = "(No verified project data. Write value-driven copy WITHOUT concrete figures.)"
        no_data_rule = (
            "\n- No project data was provided: do NOT mention prices, monthly payments, "
            "square meters, number of bedrooms, delivery dates or specific amenities. "
            "Write about the benefit/lifestyle in general terms."
        )

    return f"""Eres un experto en marketing inmobiliario LATAM. Genera copy de ventas para un carrusel de redes sociales.

REGLA INVIOLABLE (copy público al comprador): Usa EXCLUSIVAMENTE los datos provistos abajo; NO inventes amenidades, precios, m2 ni fechas. Si un dato no aparece en el contexto, NO lo afirmes.

PERSONA TARGET: {persona['nombre']}
ENFOQUE: {persona['enfoque']}
OBJECIONES CLAVE: {persona['objeciones_clave']}
CTA SUGERIDO: {persona['cta']}
TONO: {persona['tono']}{disc_block}

CONTEXTO ADICIONAL DEL PROYECTO:
{contexto_block}

INSTRUCCIONES:
- Genera un copy principal (hook) de máximo 2 líneas impactantes
- Genera 3 variaciones del cuerpo del copy (para A/B testing), cada una de 2-4 oraciones
- Incluye el CTA al final de cada variación
- {lang_instruction}
- NO uses clichés como "el hogar de tus sueños" o "no lo pierdas"
- Sé específico, no genérico, PERO solo con datos del contexto provisto{no_data_rule}

FORMATO DE RESPUESTA (JSON estricto):
{{
  "hook": "...",
  "variants": [
    {{"copy": "...", "cta": "..."}},
    {{"copy": "...", "cta": "..."}},
    {{"copy": "...", "cta": "..."}}
  ]
}}"""


# ─── W5.22 Z.2.2 · Mock determinístico (FAIL-SOFT cuando LLM key ausente) ────
MOCK_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "inversor": {
        "es-MX": {
            "title": "Inversión inmobiliaria con plusvalía comprobada",
            "subtitle_base": "ROI proyectado +18% en 5 años · cash-flow mensual desde día 1.",
            "cta": "Descarga proyección financiera",
            "stats": [
                {"label": "Plusvalía 5 años", "value": "+18%"},
                {"label": "Renta bruta anual", "value": "7.2%"},
                {"label": "Días en mercado", "value": "<14"},
            ],
        },
        "en-US": {
            "title": "Real estate investment with proven appreciation",
            "subtitle_base": "Projected ROI +18% in 5 years · monthly cash-flow from day 1.",
            "cta": "Download financial projection",
            "stats": [
                {"label": "5-year appreciation", "value": "+18%"},
                {"label": "Gross rental yield", "value": "7.2%"},
                {"label": "Days on market", "value": "<14"},
            ],
        },
    },
    "familia": {
        "es-MX": {
            "title": "El hogar que tu familia merece",
            "subtitle_base": "Espacios pensados para crecer · escuelas top a 10 min · zona segura.",
            "cta": "Agenda visita en familia",
            "stats": [
                {"label": "Recámaras", "value": "3-4"},
                {"label": "Escuelas top 1km", "value": "5+"},
                {"label": "Áreas verdes", "value": "2,400 m²"},
            ],
        },
        "en-US": {
            "title": "The home your family deserves",
            "subtitle_base": "Spaces designed for growth · top schools within 10 min · safe area.",
            "cta": "Book a family tour",
            "stats": [
                {"label": "Bedrooms", "value": "3-4"},
                {"label": "Top schools <1km", "value": "5+"},
                {"label": "Green areas", "value": "2,400 m²"},
            ],
        },
    },
    "first_buyer": {
        "es-MX": {
            "title": "Tu primera casa · más cerca de lo que crees",
            "subtitle_base": "Crédito INFONAVIT · enganche desde 5% · proceso 100% acompañado.",
            "cta": "Calcula tu crédito",
            "stats": [
                {"label": "Enganche desde", "value": "5%"},
                {"label": "Mensualidad desde", "value": "$9,800"},
                {"label": "Plazo", "value": "30 años"},
            ],
        },
        "en-US": {
            "title": "Your first home · closer than you think",
            "subtitle_base": "Mortgage from 5% down · 100% guided process · pre-approval in 48h.",
            "cta": "Calculate your mortgage",
            "stats": [
                {"label": "Down payment from", "value": "5%"},
                {"label": "Monthly from", "value": "$9,800"},
                {"label": "Term", "value": "30 years"},
            ],
        },
    },
    "exec": {
        "es-MX": {
            "title": "Exclusividad y conectividad · el estándar que mereces",
            "subtitle_base": "Amenidades premium · 12 min al corredor financiero · concierge 24/7.",
            "cta": "Tour privado VIP",
            "stats": [
                {"label": "Al CBD", "value": "12 min"},
                {"label": "Amenidades", "value": "14"},
                {"label": "Concierge", "value": "24/7"},
            ],
        },
        "en-US": {
            "title": "Exclusivity & connectivity · the standard you deserve",
            "subtitle_base": "Premium amenities · 12 min to business district · 24/7 concierge.",
            "cta": "VIP private tour",
            "stats": [
                {"label": "To CBD", "value": "12 min"},
                {"label": "Amenities", "value": "14"},
                {"label": "Concierge", "value": "24/7"},
            ],
        },
    },
    "extranjero": {
        "es-MX": {
            "title": "Compra inmuebles en CDMX con seguridad jurídica",
            "subtitle_base": "Proceso bilingüe · fideicomiso · soporte legal especializado para extranjeros.",
            "cta": "Habla con asesor bilingüe",
            "stats": [
                {"label": "Días al cierre", "value": "30-45"},
                {"label": "Idioma", "value": "ES/EN"},
                {"label": "Fideicomiso", "value": "Incluido"},
            ],
        },
        "en-US": {
            "title": "Buy property in Mexico City with legal certainty",
            "subtitle_base": "Bilingual process · fideicomiso trust · specialized legal support for foreigners.",
            "cta": "Talk to a bilingual advisor",
            "stats": [
                {"label": "Days to close", "value": "30-45"},
                {"label": "Language", "value": "ES/EN"},
                {"label": "Trust setup", "value": "Included"},
            ],
        },
    },
    "jubilado": {
        "es-MX": {
            "title": "Tu nuevo hogar para la mejor etapa",
            "subtitle_base": "Bajo mantenimiento · servicios médicos a 5 min · comunidad tranquila y cercana.",
            "cta": "Conoce tu nuevo hogar",
            "stats": [
                {"label": "Hospitales <5min", "value": "3"},
                {"label": "Accesibilidad", "value": "Total"},
                {"label": "Mantenimiento", "value": "Bajo"},
            ],
        },
        "en-US": {
            "title": "Your new home for the best chapter",
            "subtitle_base": "Low maintenance · medical services within 5 min · quiet, welcoming community.",
            "cta": "Discover your new home",
            "stats": [
                {"label": "Hospitals <5min", "value": "3"},
                {"label": "Accessibility", "value": "Full"},
                {"label": "Maintenance", "value": "Low"},
            ],
        },
    },
    "empty_nester": {
        "es-MX": {
            "title": "Downsizing inteligente · libertad sin renunciar al confort",
            "subtitle_base": "Espacio funcional · plusvalía del cambio · ubicación que abre tu nueva etapa.",
            "cta": "Descubre tu próxima etapa",
            "stats": [
                {"label": "m² funcionales", "value": "85-110"},
                {"label": "Plusvalía proyectada", "value": "+22%"},
                {"label": "Walk score", "value": "92"},
            ],
        },
        "en-US": {
            "title": "Smart downsizing · freedom without sacrificing comfort",
            "subtitle_base": "Functional space · upside from the move · location that opens your next chapter.",
            "cta": "Discover your next chapter",
            "stats": [
                {"label": "Functional m²", "value": "85-110"},
                {"label": "Projected upside", "value": "+22%"},
                {"label": "Walk score", "value": "92"},
            ],
        },
    },
}

DISC_SUBTITLE_MODIFIER: Dict[str, Dict[str, str]] = {
    "D": {"es-MX": " Decisión clara · resultados medibles.", "en-US": " Clear decision · measurable results."},
    "I": {"es-MX": " Únete a una comunidad que ya lo vive.", "en-US": " Join a community already living it."},
    "S": {"es-MX": " Proceso seguro · soporte continuo.", "en-US": " Secure process · continuous support."},
    "C": {"es-MX": " Datos verificables · ROI auditable.", "en-US": " Verifiable data · auditable ROI."},
}

DEFAULT_DISCLAIMER_ES = "Renders ilustrativos. Especificaciones sujetas a cambio sin previo aviso."
DEFAULT_DISCLAIMER_EN = "Illustrative renders. Specifications subject to change without prior notice."


def _looks_like_placeholder(key: str) -> bool:
    """True si la key es nula, vacía o un placeholder evidente."""
    if not key:
        return True
    k = key.strip()
    if not k:
        return True
    placeholders = {
        "YOUR_KEY", "REPLACE_ME", "REPLACE_WITH_EMERGENT_LLM_KEY",
        "sk-placeholder", "none", "null", "TODO",
    }
    if k in placeholders or k.upper() in placeholders:
        return True
    # Una key real arranca con "sk-" o tiene >=30 chars
    if not k.startswith("sk-") and len(k) < 30:
        return True
    return False


def _should_use_mock() -> bool:
    """True si EMERGENT_LLM_KEY no está configurada (mock determinístico FAIL-SOFT)."""
    return _looks_like_placeholder(os.environ.get("ANTHROPIC_API_KEY", ""))


def _generate_mock_copy(
    buyer_angle: str,
    disc: Optional[str],
    language: str,
    project_id: Optional[str],
    context: str,
) -> Dict[str, Any]:
    """Mock determinístico · retorna copy real coherente sin depender de LLM.

    Shape compatible con CarruselesPage.js (pages_data.hero.title / cta / stats).
    """
    lang = language if language in ("es-MX", "en-US") else "es-MX"
    persona_pack = MOCK_TEMPLATES.get(buyer_angle) or MOCK_TEMPLATES["inversor"]
    pack = persona_pack.get(lang) or persona_pack["es-MX"]

    subtitle = pack["subtitle_base"]
    if disc and disc.upper() in DISC_SUBTITLE_MODIFIER:
        subtitle = subtitle + DISC_SUBTITLE_MODIFIER[disc.upper()][lang]
    if context:
        ctx_label = "Detalles" if lang == "es-MX" else "Details"
        subtitle = f"{subtitle} {ctx_label}: {context[:140]}".strip()

    return {
        "pages_data": {
            "hero": {"title": pack["title"], "subtitle": subtitle},
            "stats": list(pack["stats"]),
            "cta": {"text": pack["cta"], "url": "https://desarrollosmx.io/contacto"},
            "disclaimer": DEFAULT_DISCLAIMER_ES if lang == "es-MX" else DEFAULT_DISCLAIMER_EN,
        },
        "language": lang,
        "buyer_angle": buyer_angle,
        "disc_profile": (disc or None),
        "project_id": project_id,
        "model_used": "mock_v1",
    }


async def _call_llm(prompt: str, job_id: str, provider: str = "anthropic") -> str:
    from llm_client import LlmChat, UserMessage as LlmUserMsg
    api_key = os.environ.get("ANTHROPIC_API_KEY")
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
    # W5.22 Z.2.2 · FAIL-SOFT mock si LLM key ausente · sin warnings spam
    if _should_use_mock():
        # Fetch project_id stored at job creation
        try:
            existing = await db.studio_copy_jobs.find_one({"id": job_id}, {"_id": 0, "project_id": 1})
        except Exception:
            existing = None
        project_id = (existing or {}).get("project_id")
        mock = _generate_mock_copy(buyer_angle, disc, language, project_id, context_extra)
        hero_title = mock["pages_data"]["hero"]["title"]
        await db.studio_copy_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "output_text": hero_title,
                "output_variants": [],
                "pages_data": mock["pages_data"],
                "model_used": mock["model_used"],
                "status": "ready",
            }},
        )
        log.info(f"[copy] mock_v1 generated for {buyer_angle}/{disc or '-'}/{language} (LLM unavailable)")
        return

    try:
        prompt = _build_prompt(buyer_angle, disc, language, context_extra)

        # ── F2 Sub-D · RAG context helper + cross-feature memory ──────────
        _rag_context_text = ""
        _job_meta = {}
        try:
            _job_meta = await db.studio_copy_jobs.find_one(
                {"id": job_id},
                {"_id": 0, "tenant_id": 1, "user_id": 1, "project_id": 1},
            ) or {}
        except Exception:
            _job_meta = {}
        _tenant_id_sb = _job_meta.get("tenant_id") or "default"
        _user_id_sb = _job_meta.get("user_id")
        _project_id_sb = _job_meta.get("project_id")
        try:
            from rag_context_helper import (
                get_property_context, get_external_context, get_rag_context,
            )
            _rag_blocks = []
            if _project_id_sb:
                _pc = await get_property_context(db, _project_id_sb, tenant_id=_tenant_id_sb)
                if _pc:
                    _rag_blocks.append("## CONTEXTO DE LA PROPIEDAD\n" + _pc)
            _ec = await get_external_context(db)
            if _ec:
                _rag_blocks.append("## CONTEXTO MACRO\n" + _ec)
            _gc = await get_rag_context(
                db, f"copy marketing {buyer_angle} {language}",
                scope="all", tenant_id=_tenant_id_sb, top_k=3, max_chars=1200,
            )
            if _gc:
                _rag_blocks.append("## CONTEXTO RAG\n" + _gc)
            if _user_id_sb:
                try:
                    from director_memory_engine import DirectorMemoryEngine
                    _dme = DirectorMemoryEngine(db, _tenant_id_sb)
                    _mems = await _dme.retrieve_for_user(
                        _user_id_sb, query=f"copy {buyer_angle}", top_k=3,
                    )
                    if _mems:
                        _mem_block = "\n".join([
                            f"- {m.get('content_summary') or m.get('content_text') or ''}"
                            for m in _mems
                        ])
                        _rag_blocks.append("## MEMORIA RECIENTE DEL ASESOR\n" + _mem_block)
                except Exception:
                    pass
            _rag_context_text = "\n\n".join(_rag_blocks)
        except Exception as _rag_exc:
            import logging as _logging
            _logging.getLogger("dmx.f2_rag_wiring").warning(f"[rag_wiring studio_copy] failed silent: {_rag_exc}")
            _rag_context_text = ""

        # P1.14 · el RAG es contenido NO confiable → frontera explícita (datos, no instrucciones).
        if _rag_context_text:
            try:
                from llm_safety import wrap_untrusted
                prompt = f"{prompt}{wrap_untrusted(_rag_context_text, 'contexto de mercado')}"
            except Exception:
                prompt = f"{prompt}\n\n{_rag_context_text}"

        # P1.14 · TOPE de presupuesto ANTES de llamar al LLM (antes studio_copy no gateaba → costo sin límite).
        try:
            from ai_budget import is_within_budget
            _job0 = await db.studio_copy_jobs.find_one({"id": job_id}, {"_id": 0, "tenant_id": 1}) or {}
            _tenant0 = _job0.get("tenant_id") or "default"
            if not await is_within_budget(db, _tenant0):
                log.warning(f"[studio_copy] presupuesto IA agotado para {_tenant0} · job {job_id}")
                return {"ok": False, "error": "budget_exceeded",
                        "mensaje": "Se alcanzó el tope mensual de IA. Inténtalo el próximo periodo o sube tu plan."}
        except Exception:
            pass

        raw = await _call_with_fallback(prompt, job_id)

        # ── AI cost tracking (best-effort, fire-and-forget) ────────────
        # NOTE: _call_with_fallback may run claude OR openai fallback; we cannot
        # distinguish here, so we attribute to CLAUDE_MODEL (primary path).
        try:
            from ai_budget import track_ai_call
            _job_doc = await db.studio_copy_jobs.find_one({"id": job_id}, {"_id": 0, "tenant_id": 1}) or {}
            _tenant = _job_doc.get("tenant_id") or "default"
            _in_tokens = max(1, len(prompt) // 4)
            _out_tokens = max(1, len(raw or "") // 4)
            await track_ai_call(
                db=db,
                dev_org_id=_tenant,
                model=CLAUDE_MODEL,
                tokens=_in_tokens + _out_tokens,
                tokens_in=_in_tokens,
                tokens_out=_out_tokens,
                call_type="studio_buyer_copy",
                feature_key="studio_buyer_copy",
            )
        except Exception as _exc:
            log.warning(f"[track_ai_call] failed silent: {_exc}")

        import json
        import re
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        data = json.loads(m.group(0)) if m else {"hook": raw, "variants": []}
        # Build pages_data shape from LLM output when parseable · fallback to legacy fields
        pages_data = data.get("pages_data") if isinstance(data, dict) else None
        if not pages_data:
            # Best-effort: pack hook + variants into pages_data shape so frontend dropdown works
            mock_shell = _generate_mock_copy(buyer_angle, disc, language, None, "")
            mock_shell["pages_data"]["hero"]["title"] = data.get("hook") or mock_shell["pages_data"]["hero"]["title"]
            pages_data = mock_shell["pages_data"]
        await db.studio_copy_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "output_text": data.get("hook", "") or pages_data.get("hero", {}).get("title", ""),
                "output_variants": data.get("variants", []),
                "pages_data": pages_data,
                "model_used": "claude-sonnet-4-5",
                "status": "ready",
            }},
        )
        log.info(f"[copy] job {job_id} ready (LLM)")

        # ── F2 Sub-D · Cross-feature memory ingest (best-effort) ──────────
        try:
            from director_memory_engine import DirectorMemoryEngine
            if _user_id_sb:
                _dme_ing = DirectorMemoryEngine(db, _tenant_id_sb)
                # hook_score not computed at this point in Studio copy pipeline · pass 0
                # template_key uses buyer_angle (with optional disc suffix) as canonical key
                _tpl_key = f"{buyer_angle}_{disc or 'X'}_{language}"
                _intake_id_ing = _project_id_sb or job_id
                await _dme_ing.ingest_studio_copy_generated(
                    _intake_id_ing, _user_id_sb, _tpl_key, 0,
                )
        except Exception as _ing_exc:
            import logging as _logging
            _logging.getLogger("dmx.f2_rag_wiring").warning(f"[ingest studio_copy] failed silent: {_ing_exc}")
    except Exception as exc:
        log.warning(f"[copy] job {job_id} LLM path failed: {exc} · falling back to mock")
        try:
            existing = await db.studio_copy_jobs.find_one({"id": job_id}, {"_id": 0, "project_id": 1})
        except Exception:
            existing = None
        project_id = (existing or {}).get("project_id")
        mock = _generate_mock_copy(buyer_angle, disc, language, project_id, context_extra)
        await db.studio_copy_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "output_text": mock["pages_data"]["hero"]["title"],
                "output_variants": [],
                "pages_data": mock["pages_data"],
                "model_used": "mock_v1_fallback",
                "status": "ready",
            }},
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
