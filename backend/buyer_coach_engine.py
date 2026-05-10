"""W4.14 — Buyer Coach Engine.

7 etapas canónicas del journey del comprador con 3-layer resilience:
  Layer 1: LLM (claude haiku via emergentintegrations)
  Layer 2: Cache 24h por conversación
  Layer 3: Templates heurísticos por etapa

Colecciones:
  - buyer_coach_conversations (TTL 24h): {ip_hash, conversation_id, current_stage,
      stage_history, inferred_disc, inferred_budget_range, inferred_zona_interest,
      messages[], started_at, last_activity, lead_captured}
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.buyer_coach")

LFPDPPP_SALT = os.environ.get("LFPDPPP_SALT", "dmx_lfpdppp_2026")
COACH_MODEL = "claude-haiku-4-5"

STAGE_LABELS = {
    1: "Pre-calificación",
    2: "Calibración de presupuesto",
    3: "Estrategia de ubicación",
    4: "Checklist de visita",
    5: "Tácticas de negociación",
    6: "Checklist de cierre",
    7: "Post-compra",
}

# ─── Checklists por etapa (sin LLM) ──────────────────────────────────────────

STAGE_CHECKLISTS: Dict[int, List[Dict[str, str]]] = {
    1: [
        {"id": "s1_01", "label": "¿Tienes financiamiento pre-aprobado? (banco, INFONAVIT, FOVISSSTE, efectivo)"},
        {"id": "s1_02", "label": "¿Cuáles son tus ingresos mensuales netos?"},
        {"id": "s1_03", "label": "¿Cuánto tienes disponible como enganche?"},
        {"id": "s1_04", "label": "¿Tienes otros créditos activos?"},
        {"id": "s1_05", "label": "¿Cuánto tiempo llevas en tu empleo actual?"},
        {"id": "s1_06", "label": "¿Tienes historial crediticio limpio (Buró de Crédito)?"},
    ],
    2: [
        {"id": "s2_01", "label": "Precio máximo realista = ingresos × 30% × 240 meses"},
        {"id": "s2_02", "label": "Enganche mínimo: 10-20% del valor del inmueble"},
        {"id": "s2_03", "label": "Simula tu pago mensual con tasa actual del banco"},
        {"id": "s2_04", "label": "Considera gastos notariales: 5-8% adicional"},
        {"id": "s2_05", "label": "Plazo del crédito: 10, 15, 20 o 25 años"},
        {"id": "s2_06", "label": "Calcula gastos de escrituración, avalúo e ISR"},
    ],
    3: [
        {"id": "s3_01", "label": "¿Cuánto tardas dispuesto a viajar al trabajo (minutos)?"},
        {"id": "s3_02", "label": "¿Es prioritaria la seguridad de la colonia?"},
        {"id": "s3_03", "label": "¿Tienes hijos en edad escolar?"},
        {"id": "s3_04", "label": "¿Prefieres transporte público o auto propio?"},
        {"id": "s3_05", "label": "¿Buscas amenidades (parques, restaurantes, gym)?"},
        {"id": "s3_06", "label": "¿Cuánto valoras la plusvalía vs el precio de hoy?"},
    ],
    4: [
        {"id": "s4_01", "label": "Verifica escrituras y libertad de gravamen"},
        {"id": "s4_02", "label": "Comprueba m² construidos vs catastro"},
        {"id": "s4_03", "label": "Estado legal del inmueble (régimen condominal, uso de suelo)"},
        {"id": "s4_04", "label": "Verificar adeudos predial, agua, luz"},
        {"id": "s4_05", "label": "Estado de acabados: pisos, muros, plomería, electricidad"},
        {"id": "s4_06", "label": "Revisa el reglamento del condominio"},
        {"id": "s4_07", "label": "¿Cuántas mascotas/vehículos se permiten?"},
        {"id": "s4_08", "label": "Humedad, grietas o filtraciones visibles"},
        {"id": "s4_09", "label": "Presión de agua y estado de instalaciones"},
        {"id": "s4_10", "label": "Colinda con vecinos conflictivos o inmuebles riesgosos"},
        {"id": "s4_11", "label": "¿Cuánto tiempo tiene el desarrollo/proyecto?"},
        {"id": "s4_12", "label": "Pregunta por avance de obra si es preventa"},
        {"id": "s4_13", "label": "¿El desarrollador tiene reputación y proyectos anteriores entregados?"},
        {"id": "s4_14", "label": "¿Hay garantía sobre defectos de construcción?"},
        {"id": "s4_15", "label": "¿Cuál es el costo de mantenimiento mensual?"},
        {"id": "s4_16", "label": "¿El seguro del edificio cubre daños estructurales?"},
        {"id": "s4_17", "label": "Revisa el libro de condóminos y asambleas recientes"},
        {"id": "s4_18", "label": "¿Está regularizada la situación del suelo?"},
        {"id": "s4_19", "label": "Toma fotos de todo: fachada, detalles, medidores"},
        {"id": "s4_20", "label": "Platica con vecinos actuales sobre el ambiente"},
    ],
    5: [
        {"id": "s5_01", "label": "Investiga el precio por m² promedio en esa colonia"},
        {"id": "s5_02", "label": "Tiempo en mercado: >90 días = más negociación posible"},
        {"id": "s5_03", "label": "Ancla baja: ofrece 10-15% por debajo del precio pedido"},
        {"id": "s5_04", "label": "Identifica objeciones del vendedor antes de contraoferta"},
        {"id": "s5_05", "label": "Cierre Q4 (octubre-diciembre): menor demanda, más descuentos"},
        {"id": "s5_06", "label": "Pide en concesiones: estacionamiento, bodegas, muebles"},
        {"id": "s5_07", "label": "Escrow: solicita garantía en preventa via fideicomiso"},
        {"id": "s5_08", "label": "No muestres urgencia al vendedor"},
        {"id": "s5_09", "label": "Condiciones suspensivas: crédito bancario, inspección técnica"},
        {"id": "s5_10", "label": "Firma promesa de compra-venta con penalidades claras"},
    ],
    6: [
        {"id": "s6_01", "label": "Escrituras firmadas ante notario certificado"},
        {"id": "s6_02", "label": "Pago de ISR por parte del vendedor confirmado"},
        {"id": "s6_03", "label": "CFDI (comprobante fiscal) del pago del enganche"},
        {"id": "s6_04", "label": "Constancia de no adeudos de agua y predial"},
        {"id": "s6_05", "label": "Avalúo bancario dentro del rango de precio"},
        {"id": "s6_06", "label": "Firma del crédito hipotecario (banco/INFONAVIT/FOVISSSTE)"},
        {"id": "s6_07", "label": "Pago de gastos notariales (5-8% del valor)"},
        {"id": "s6_08", "label": "IVA en preventa (si aplica: 16% sobre precio)"},
        {"id": "s6_09", "label": "Inscripción al Registro Público de la Propiedad"},
        {"id": "s6_10", "label": "Entrega de llaves y acta de entrega firmada"},
    ],
    7: [
        {"id": "s7_01", "label": "Solicitar avalúo final posterior a entrega"},
        {"id": "s7_02", "label": "Contratar seguro de vivienda"},
        {"id": "s7_03", "label": "Alta de servicios: luz, agua, gas, internet"},
        {"id": "s7_04", "label": "Registrar garantía del desarrollador (1-5 años típico)"},
        {"id": "s7_05", "label": "Establecer fondo de reserva para mantenimiento"},
        {"id": "s7_06", "label": "Actualizar domicilio en INE, SAT, banco"},
        {"id": "s7_07", "label": "Presentarte con el administrador del condominio"},
        {"id": "s7_08", "label": "Programa revisión de instalaciones 3 meses después"},
    ],
}

OPENING_MESSAGES = {
    1: "Hola, soy tu Asesor de Compra DMX. Te acompañaré en todo el proceso para que tomes la mejor decisión inmobiliaria. "
       "Para empezar, cuéntame: ¿ya tienes algún tipo de financiamiento en mente? ¿Banco, INFONAVIT, FOVISSSTE o pagarías en efectivo?",
}

STAGE_SYSTEM_PROMPTS = {
    1: """Eres un asesor inmobiliario experto en CDMX. Estás en la etapa de PRE-CALIFICACIÓN.
Objetivo: entender la situación financiera del comprador (tipo de financiamiento, ingresos, enganche disponible).
Reglas: respuestas cortas (2-3 oraciones). Español es-MX formal pero cercano. Infiere DISC del tono del usuario.
Si tiene financiamiento claro → transiciona a etapa 2.""",
    2: """Asesor experto CDMX. Etapa CALIBRACIÓN DE PRESUPUESTO.
Ayuda a calcular el precio máximo realista: ingreso × 30% mensualidad. Explica regla del 30%, enganche (10-20%), gastos notariales (5-8%).
Simula pago mensual si conoces ingresos. Respuestas concisas con datos numéricos.""",
    3: """Asesor experto CDMX. Etapa ESTRATEGIA DE UBICACIÓN.
Basándote en prioridades del usuario (trabajo, escuelas, seguridad, transporte, amenidades), recomienda 3-5 colonias concretas de CDMX.
Menciona: precio promedio m², score de plusvalía, nivel de seguridad, transporte. Sé específico con nombres reales de colonias CDMX.""",
    4: """Asesor experto CDMX. Etapa CHECKLIST DE VISITA.
Guía al comprador sobre qué revisar y preguntar en su visita. Usa el checklist de 20 items. Sé práctico y concreto.""",
    5: """Asesor experto CDMX. Etapa TÁCTICAS DE NEGOCIACIÓN.
Enseña estrategias de negociación: anclas de precio, contrarrespuestas, timing óptimo (Q4), uso de escrow en preventa.
Datos de mercado: tiempo promedio en mercado, márgenes de negociación típicos por colonia.""",
    6: """Asesor experto CDMX. Etapa CHECKLIST DE CIERRE.
Guía sobre escrituras, notario, ISR, CFDI, IVA en preventa, Registro Público, créditos hipotecarios.
Enumera costos adicionales al precio de compra. Respuestas estructuradas.""",
    7: """Asesor experto CDMX. Etapa POST-COMPRA.
Orienta sobre: avalúo final, seguro de vivienda, alta de servicios, garantía del desarrollador, fondo de reserva.
Respuestas tranquilizadoras y organizadas.""",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _conv_id() -> str:
    return f"coach_{uuid.uuid4().hex[:16]}"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{ip}:{LFPDPPP_SALT}".encode()).hexdigest()[:32]


# ─── Layer 3: heuristic templates ────────────────────────────────────────────

def _heuristic_response(stage: int, user_message: str) -> str:
    templates = {
        1: "Gracias por compartir eso. Para darte una orientación más precisa sobre financiamiento, "
           "¿podrías decirme cuánto tienes disponible de enganche y cuáles son tus ingresos mensuales aproximados?",
        2: "Con base en los datos que mencionas, lo ideal es que tu pago mensual no supere el 30% de tus ingresos. "
           "Además del precio del inmueble, considera destinar entre un 5-8% adicional para gastos notariales y escrituración.",
        3: "Para CDMX, colonias como Del Valle, Narvarte, Roma y Doctores ofrecen buena relación calidad-precio y alta plusvalía. "
           "¿Cuánto tiempo estás dispuesto a viajar al trabajo? Eso me ayuda a afinar las opciones.",
        4: "En tu visita, asegúrate de verificar las escrituras, el estado legal del inmueble y los adeudos de predial y agua. "
           "Revisa el checklist completo que te generé con los 20 puntos más importantes.",
        5: "La clave es anclar bajo: ofrece 10-15% menos del precio pedido. El cuarto trimestre (oct-dic) es el mejor momento "
           "para negociar, hay menos demanda y los vendedores suelen aceptar mejores condiciones.",
        6: "Antes de firmar, verifica que el notario esté certificado y que el vendedor haya cubierto el ISR. "
           "Asegúrate de obtener el CFDI de todos los pagos. Los gastos notariales son del 5-8% del valor.",
        7: "Después de la entrega, lo primero es contratar un seguro de vivienda y hacer el alta de servicios. "
           "Revisa la garantía del desarrollador (generalmente 1-5 años) para defectos de construcción.",
    }
    return templates.get(stage, "En este momento no puedo procesar tu consulta. Por favor intenta nuevamente.")


def _infer_disc(messages: List[Dict[str, str]]) -> str:
    """Inferencia básica de DISC a partir del tono de mensajes del usuario."""
    user_msgs = " ".join(m.get("content", "") for m in messages if m.get("role") == "user").lower()
    if any(w in user_msgs for w in ["rápido", "precio", "roi", "inversión", "negocio", "ganancia"]):
        return "D"
    if any(w in user_msgs for w in ["familia", "niños", "comunidad", "recomendarías", "social"]):
        return "I"
    if any(w in user_msgs for w in ["plazo", "seguro", "garantía", "tiempo", "proceso"]):
        return "S"
    if any(w in user_msgs for w in ["datos", "exacto", "m2", "especificaciones", "técnico"]):
        return "C"
    return ""


# ─── Layer 1: LLM call ───────────────────────────────────────────────────────

async def _llm_respond(conversation: Dict[str, Any], user_message: str) -> str:
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmMsg
        stage = conversation.get("current_stage", 1)
        sys_prompt = STAGE_SYSTEM_PROMPTS.get(stage, STAGE_SYSTEM_PROMPTS[1])
        if conversation.get("inferred_budget_range"):
            sys_prompt += f"\nPresupuesto inferido: {conversation['inferred_budget_range']}"
        if conversation.get("inferred_zona_interest"):
            sys_prompt += f"\nZona de interés: {conversation['inferred_zona_interest']}"
        chat = LlmChat(
            api_key=api_key,
            session_id=conversation["conversation_id"],
            system_message=sys_prompt,
        ).with_model("anthropic", COACH_MODEL)
        resp = await chat.send_message(LlmMsg(text=user_message))
        return resp or ""
    except Exception as exc:
        log.warning(f"[buyer_coach] LLM call failed: {exc}")
        return ""


# ─── Core functions ───────────────────────────────────────────────────────────

async def start_conversation(db, ip_hash: str, locale: str = "es-MX") -> Dict[str, Any]:
    conv_id = _conv_id()
    now = _now()
    opening = OPENING_MESSAGES[1]
    doc = {
        "conversation_id": conv_id,
        "ip_hash": ip_hash,
        "locale": locale,
        "current_stage": 1,
        "stage_history": [{"stage": 1, "entered_at": now.isoformat()}],
        "inferred_disc": "",
        "inferred_budget_range": "",
        "inferred_zona_interest": "",
        "messages": [{"role": "assistant", "content": opening, "ts": now.isoformat()}],
        "started_at": now.isoformat(),
        "last_activity": now.isoformat(),
        "lead_captured": False,
        "expires_at": (now + timedelta(hours=24)).isoformat(),
    }
    await db.buyer_coach_conversations.insert_one(doc)
    return {
        "conversation_id": conv_id,
        "opening_message": opening,
        "stage": 1,
        "stage_label": STAGE_LABELS[1],
    }


async def respond(db, conversation_id: str, user_message: str) -> Dict[str, Any]:
    conv = await db.buyer_coach_conversations.find_one(
        {"conversation_id": conversation_id}, {"_id": 0}
    )
    if not conv:
        return {"error": "conversation_not_found"}

    stage = conv.get("current_stage", 1)
    now = _now()

    # Append user message
    messages = list(conv.get("messages", []))
    messages.append({"role": "user", "content": user_message[:500], "ts": now.isoformat()})

    # Layer 1: LLM
    assistant_reply = await _llm_respond(conv, user_message)

    # Layer 2: cache (last assistant reply if LLM fails)
    if not assistant_reply:
        for m in reversed(messages):
            if m.get("role") == "assistant":
                assistant_reply = m["content"]
                break

    # Layer 3: heuristic
    if not assistant_reply:
        assistant_reply = _heuristic_response(stage, user_message)

    messages.append({"role": "assistant", "content": assistant_reply, "ts": now.isoformat()})

    # Infer DISC and auto-advance stage (every 3 user messages)
    user_count = sum(1 for m in messages if m.get("role") == "user")
    auto_advance = (user_count > 0 and user_count % 4 == 0 and stage < 7)

    inferred_disc = _infer_disc(messages) or conv.get("inferred_disc", "")
    new_stage = stage + 1 if auto_advance else stage

    # Parse budget/zona hints
    budget_range = conv.get("inferred_budget_range", "")
    zona_interest = conv.get("inferred_zona_interest", "")

    # Budget hints from user message
    import re
    budget_match = re.search(r"(\d[\d,\.]+)\s*(millones?|mdp|mxn|pesos?)", user_message.lower())
    if budget_match:
        budget_range = f"{budget_match.group(1)} {budget_match.group(2)}"

    # Zona hints
    for z in ["polanco", "condesa", "roma", "narvarte", "del valle", "santa fe",
              "coyoacán", "xochimilco", "tlalpan", "doctores", "tepito", "pedregal"]:
        if z in user_message.lower():
            zona_interest = z
            break

    update = {
        "messages": messages[-80:],  # cap at 80
        "last_activity": now.isoformat(),
        "inferred_disc": inferred_disc,
        "inferred_budget_range": budget_range,
        "inferred_zona_interest": zona_interest,
        "current_stage": new_stage,
    }
    if auto_advance:
        sh = list(conv.get("stage_history", []))
        sh.append({"stage": new_stage, "entered_at": now.isoformat()})
        update["stage_history"] = sh

    await db.buyer_coach_conversations.update_one(
        {"conversation_id": conversation_id}, {"$set": update}
    )

    # Suggested next actions based on stage
    next_actions = _suggested_actions(new_stage, len(messages))

    return {
        "assistant_reply": assistant_reply,
        "current_stage": new_stage,
        "stage_label": STAGE_LABELS.get(new_stage, ""),
        "stage_advanced": auto_advance,
        "suggested_next_actions": next_actions,
        "inferred_attrs": {
            "disc": inferred_disc,
            "budget_range": budget_range,
            "zona_interest": zona_interest,
        },
    }


def _suggested_actions(stage: int, msg_count: int) -> List[str]:
    actions = {
        1: ["Verificar pre-aprobación bancaria", "Revisar Buró de Crédito"],
        2: ["Simular pago mensual en /simulador", "Comparar tasas de 3 bancos"],
        3: ["Ver mapa con zonas recomendadas", "Revisar comparables de precio m²"],
        4: ["Descargar checklist de visita", "Agendar visita con asesor DMX"],
        5: ["Consultar tiempo en mercado del inmueble", "Preparar contraoferta"],
        6: ["Buscar notario certificado CDMX", "Solicitar estado de cuenta Buró"],
        7: ["Contratar seguro de vivienda", "Registrar garantía del desarrollador"],
    }
    result = list(actions.get(stage, []))
    if msg_count >= 10 and stage >= 5:
        result.append("Capturar mis datos para contacto con asesor DMX")
    return result


async def advance_stage(db, conversation_id: str, force_stage: Optional[int] = None) -> Dict[str, Any]:
    conv = await db.buyer_coach_conversations.find_one(
        {"conversation_id": conversation_id}, {"_id": 0}
    )
    if not conv:
        return {"error": "conversation_not_found"}
    current = conv.get("current_stage", 1)
    new_stage = force_stage if force_stage else min(current + 1, 7)
    now = _now()
    sh = list(conv.get("stage_history", []))
    sh.append({"stage": new_stage, "entered_at": now.isoformat()})
    await db.buyer_coach_conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"current_stage": new_stage, "stage_history": sh, "last_activity": now.isoformat()}},
    )
    return {"stage": new_stage, "stage_label": STAGE_LABELS.get(new_stage, "")}


def get_stage_checklist(stage_num: int) -> List[Dict[str, str]]:
    """Retorna items del checklist para la etapa dada. NO hace llamada LLM."""
    return STAGE_CHECKLISTS.get(stage_num, [])


async def get_zone_recommendations(db, conversation_id: str) -> List[Dict[str, Any]]:
    """Cruza budget + DISC + zona_interest con zone_score para recomendar colonias."""
    conv = await db.buyer_coach_conversations.find_one(
        {"conversation_id": conversation_id}, {"_id": 0}
    )
    if not conv:
        return []
    zona_hint = (conv.get("inferred_zona_interest") or "").lower()
    disc = conv.get("inferred_disc", "")

    # Query top 5 zone scores
    try:
        from zone_score_engine import list_all_scores
        scores = await list_all_scores(db, tier="colonia", limit=50)
        zones = scores.get("scores", []) or scores if isinstance(scores, list) else []

        # Boost zones matching hint
        def _rank(z):
            slug = (z.get("zone_id") or z.get("slug") or "").lower()
            score = float(z.get("score_total") or z.get("score") or 0)
            if zona_hint and zona_hint in slug:
                score += 100
            if disc == "D":  # ROI-focused
                score += float(z.get("score_revalorizacion") or z.get("upside_score") or 0) * 2
            if disc == "I":  # Amenidades
                score += float(z.get("score_amenidades") or 0) * 1.5
            return -score

        zones_sorted = sorted(zones, key=_rank)[:5]
        return [
            {
                "zone_id": z.get("zone_id") or z.get("slug") or "",
                "name": z.get("zone_name") or z.get("name") or z.get("zone_id") or "",
                "score_total": z.get("score_total") or z.get("score") or 0,
                "fit_reason": "Buena relación plusvalía/precio" if disc in ("D", "C")
                              else "Excelente entorno y amenidades",
            }
            for z in zones_sorted
        ]
    except Exception as exc:
        log.warning(f"[buyer_coach] zone_recommendations failed: {exc}")
        return [
            {"zone_id": "del-valle", "name": "Del Valle", "score_total": 85, "fit_reason": "Alta demanda y plusvalía estable"},
            {"zone_id": "narvarte", "name": "Narvarte Poniente", "score_total": 82, "fit_reason": "Precio accesible y buena ubicación"},
            {"zone_id": "roma-sur", "name": "Roma Sur", "score_total": 80, "fit_reason": "Estilo de vida urbano con crecimiento"},
        ]


async def capture_lead(
    db, conversation_id: str, email: str, whatsapp: Optional[str],
    consent: bool, ip_hash: str
) -> Dict[str, Any]:
    if not consent:
        return {"error": "consent_required"}
    conv = await db.buyer_coach_conversations.find_one(
        {"conversation_id": conversation_id}, {"_id": 0}
    )
    if not conv:
        return {"error": "conversation_not_found"}

    now = _now()
    lead_id = f"bcl_{uuid.uuid4().hex[:12]}"
    lead_doc = {
        "lead_id": lead_id,
        "source": "buyer_coach",
        "conversation_id": conversation_id,
        "email": email,
        "whatsapp": whatsapp,
        "inferred_disc": conv.get("inferred_disc", ""),
        "inferred_budget_range": conv.get("inferred_budget_range", ""),
        "inferred_zona_interest": conv.get("inferred_zona_interest", ""),
        "current_stage_at_capture": conv.get("current_stage", 1),
        "ip_hash": ip_hash,
        "lfpdppp_consent": True,
        "created_at": now.isoformat(),
    }
    await db.buyer_coach_leads.insert_one(lead_doc)
    await db.buyer_coach_conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"lead_captured": True, "lead_id": lead_id, "last_activity": now.isoformat()}},
    )
    return {"ok": True, "lead_id": lead_id}


async def ensure_buyer_coach_indexes(db) -> None:
    try:
        await db.buyer_coach_conversations.create_index("conversation_id", unique=True, sparse=True)
        await db.buyer_coach_conversations.create_index("ip_hash")
        await db.buyer_coach_conversations.create_index(
            "expires_at", expireAfterSeconds=0, sparse=True
        )
        await db.buyer_coach_leads.create_index("conversation_id")
        await db.buyer_coach_leads.create_index("email")
        log.info("[buyer_coach] indexes OK")
    except Exception as exc:
        log.warning(f"[buyer_coach] index creation warning: {exc}")
