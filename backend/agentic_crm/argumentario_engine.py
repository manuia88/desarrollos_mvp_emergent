"""W4.7 Y.4C — Argumentario Tone Behavioral-Driven Engine.

Genera scripts personalizados para el asesor adaptados al perfil DISC del lead,
Atlax Persona del org, historial de intención y replies previos.

Collection: argumentario_scripts (UNIQUE por org_id+lead_id)

3-Layer resilience:
  Layer 1 (LLM):       claude-sonnet con 5 data-tools pre-fetched → full prompt
  Layer 2 (cached):    argumentarios <14d con lead de mismo DISC+segment+budget
  Layer 3 (heuristic): 36 templates estáticos (4 DISC × 3 budget × 3 segment)

Phase Y guard: master_switch + tier argumentario_adaptive ≥ T1
Caps: 30 args/min/org · 100/día T1 · ilimitado T3+ · refresh 1/12h/lead
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.agentic_crm.argumentario")

# ─── DISC closing technique mapping ───────────────────────────────────────────
DISC_CLOSING: Dict[str, str] = {
    "D": "assumptive",
    "I": "summary",
    "S": "empathy",
    "C": "evidence",
    "MIX": "balance",
}

DISC_LABELS: Dict[str, str] = {
    "D": "Dominante (Directo/Resultados)",
    "I": "Influyente (Social/Entusiasta)",
    "S": "Estable (Paciente/Seguridad)",
    "C": "Concienzudo (Analítico/Datos)",
    "MIX": "Mixto/Balanceado",
}

OBJECTION_TYPES = [
    "precio_alto",
    "timing",
    "pareja_decide",
    "prefiero_otra_zona",
    "necesito_pensarlo",
    "financiamiento_complicado",
]

CLOSING_TECHNIQUES: Dict[str, Dict[str, str]] = {
    "assumptive": {
        "name": "Assumptive Close (Cierre por asunción)",
        "rationale": "Para perfiles D: asumen ya la decisión tomada y facilitan el siguiente paso sin preguntar.",
        "script": "Le asigno la unidad X hoy mismo para que no pierda disponibilidad. ¿Le llegó bien la propuesta que le envié?",
    },
    "summary": {
        "name": "Summary Close (Cierre por resumen)",
        "rationale": "Para perfiles I: recapitulan beneficios emocionales y sociales, crean momentum.",
        "script": "Entonces tenemos: ubicación top en la zona que le gustó, vecindario premium, y entrega en el tiempo que necesita. Todo listo para que empiece su nueva etapa. ¿Agendamos la firma esta semana?",
    },
    "empathy": {
        "name": "Empathy Close (Cierre por empatía)",
        "rationale": "Para perfiles S: sin presión, refuerzan seguridad y acompañamiento a largo plazo.",
        "script": "Entiendo que es una decisión importante. Estoy aquí para acompañarle en cada paso. ¿Qué necesitaría para sentirse completamente seguro/a antes de avanzar?",
    },
    "evidence": {
        "name": "Evidence Close (Cierre por evidencia)",
        "rationale": "Para perfiles C: aportan datos comparativos, ROI, rendimiento histórico para justificar la decisión.",
        "script": "Comparando con los 3 proyectos similares que analizamos: este tiene la mejor relación plusvalía/precio en la zona (datos últimos 18 meses adjuntos). ¿Procedemos con la reserva?",
    },
    "balance": {
        "name": "Balance Close (Pros y contras)",
        "rationale": "Para perfiles MIX: presenta pros/cons de forma neutral para facilitar la decisión.",
        "script": "Hagamos un ejercicio rápido: los pros son X, Y, Z. Los puntos a considerar son A y B. En balance, ¿qué le parece?",
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Heuristic Templates (Layer 3) ────────────────────────────────────────────
def _build_heuristic_argumentario(
    disc_type: str,
    budget_band: str,
    segment: str,
    lead_name: str,
    zone: str = "CDMX",
) -> Dict[str, Any]:
    """36-combo heuristic: 4 DISC × 3 budget × 3 segment.

    DISC-type es la dimensión principal. budget y segment ajustan pitch y preguntas.
    """
    dt = disc_type.upper() if disc_type else "MIX"
    if dt not in DISC_CLOSING:
        dt = "MIX"

    name = lead_name or "prospecto"
    budget = (budget_band or "medio").lower()
    seg = (segment or "residencial").lower()

    # ── Budget-sensitive pitch vars ──────────────────────────────────────────
    budget_pitch = {
        "bajo":  f"con excelente relación precio-valor y acceso a financiamiento INFONAVIT/FOVISSSTE",
        "medio": f"con plusvalía comprobada en la zona y condiciones de pago flexibles",
        "alto":  f"con ROI proyectado del 12-15% anual y amenidades de nivel premium",
    }.get(budget, "con condiciones competitivas en el mercado actual")

    segment_pitch = {
        "interes_social": "accesible para familias que buscan su primer patrimonio",
        "residencial":    "en una zona con alta demanda y servicios consolidados",
        "premium":        "exclusivo para un estilo de vida aspiracional en CDMX",
        "residencial_medio": "en el segmento más dinámico del mercado capitalino",
    }.get(seg, "con alta demanda en el mercado")

    # ── Per-DISC opening scripts ───────────────────────────────────────────
    openings: Dict[str, Dict[str, str]] = {
        "D": {
            "call":      f"Hola {name}, te llamo directo al punto: tengo la oportunidad que cumple exactamente tus criterios. ¿Tienes 3 minutos?",
            "whatsapp":  f"Hola {name}, sin rodeos: encontré la unidad que cierra todos tus requisitos. Disponibilidad hasta el viernes. ¿Vemos hoy?",
            "email":     f"Estimado/a {name}: adjunto la opción que maximiza su inversión en {zone}. ROI estimado y comparables incluidos.",
        },
        "I": {
            "call":      f"¡Hola {name}! ¿Cómo estás? Tengo algo increíble que mostrarte — un proyecto que están eligiendo las familias más top de la zona. ¿Tienes un momento?",
            "whatsapp":  f"¡{name}! Mira lo que encontré para ti 🏠 Este proyecto es exactamente lo que describes. ¡Mis clientes lo están amando! ¿Te cuento?",
            "email":     f"¡Hola {name}! Estoy emocionado/a de compartirte esta oportunidad en {zone} — uno de los proyectos más buscados del momento.",
        },
        "S": {
            "call":      f"Hola {name}, ¿cómo te encuentras? Sin prisa — solo quería compartirte una opción que creo se alinea muy bien con lo que buscas para tu familia.",
            "whatsapp":  f"Hola {name}, espero estés bien. Cuando tengas un momento, me gustaría mostrarte este proyecto — creo que se ajusta a lo que buscas, sin compromiso.",
            "email":     f"Estimado/a {name}: Tomándome el tiempo para entender bien lo que busca, quiero compartirle esta opción que creo podría ser la adecuada para usted.",
        },
        "C": {
            "call":      f"Hola {name}, le llamo porque tengo datos concretos que quiero compartirle: comparables, m² precio y proyección de plusvalía. ¿Le parece si repasamos los números?",
            "whatsapp":  f"Hola {name}, le comparto el análisis comparativo que solicitó: 3 proyectos similares en la zona con métricas clave. Favor de revisar.",
            "email":     f"Estimado/a {name}: Adjunto análisis detallado: precio por m², comparables activos, histórico de plusvalía {zone} últimos 24 meses, y proyección de ROI.",
        },
        "MIX": {
            "call":      f"Hola {name}, le llamo para compartirle una opción en {zone} que creo se ajusta a lo que busca. ¿Tiene un momento?",
            "whatsapp":  f"Hola {name}, tengo una opción que puede interesarle. ¿Cuándo le viene bien hablar?",
            "email":     f"Estimado/a {name}: Le comparto una oportunidad inmobiliaria en {zone} que consideramos relevante para sus criterios.",
        },
    }

    # ── Per-DISC value pitch ───────────────────────────────────────────────
    pitches: Dict[str, str] = {
        "D": f"Este proyecto en {zone} es la opción con mayor retorno en el segmento {seg}. Entrega garantizada, developer de trayectoria comprobada. {budget_pitch.capitalize()}. Esto no espera.",
        "I": f"Este es el proyecto que todo el mundo está buscando en {zone} — {segment_pitch}. {budget_pitch.capitalize()}. La comunidad y el ambiente son únicos. ¡Y aún tienes tiempo de elegir la mejor unidad!",
        "S": f"Este proyecto en {zone} está pensado para quienes buscan estabilidad y calidad de vida a largo plazo — {segment_pitch}. {budget_pitch.capitalize()}. Puedes tomar tu tiempo para decidir con confianza.",
        "C": f"Análisis comparativo muestra que este proyecto en {zone} supera en 3 indicadores clave: precio/m² (-8% vs competencia), plusvalía proyectada (+12% a 3 años), y ratio amenidades/costo (+15%). {budget_pitch.capitalize()}.",
        "MIX": f"Proyecto en {zone} con equilibrio entre precio, ubicación y calidad. {segment_pitch}. {budget_pitch.capitalize()}. Opción sólida en el mercado actual.",
    }

    # ── Per-DISC objection responses ──────────────────────────────────────
    objections: Dict[str, Dict[str, str]] = {
        "D": {
            "precio_alto":               "El costo refleja el retorno: en 3 años el diferencial de precio lo recupera en plusvalía. Le paso los números.",
            "timing":                    "Esperar le cuesta: el precio sube en promedio 8% al año en esta zona. Cuánto antes, mejor inversión.",
            "pareja_decide":             "Perfecto. ¿Qué información necesita su pareja para decidir rápido? Le preparo un resumen ejecutivo.",
            "prefiero_otra_zona":        "Comparemos: en la zona que prefiere, ¿tiene disponibilidad similar? Aquí sí. ¿Le paso el comparativo?",
            "necesito_pensarlo":         "Claro, pero la disponibilidad es limitada. ¿Cuánto tiempo necesita? Le reservo 48h sin compromiso.",
            "financiamiento_complicado": "Tenemos 3 esquemas: crédito bancario, INFONAVIT, o financiamiento directo developer. ¿Cuál le aplica mejor?",
        },
        "I": {
            "precio_alto":               "Entiendo, y mira — muchos de mis clientes pensaron lo mismo, y hoy están felicísimos con su decisión. Además, con el esquema de pagos que tenemos, se siente menos. ¿Quieres que te explico?",
            "timing":                    "¡Lo entiendo perfectamente! Pero te cuento — mis clientes que esperaron lamentaron haberse tardado. Este proyecto está volando. ¿No querrías que te lo cuenten ellos?",
            "pareja_decide":             "¡Genial! Les encantará verlo juntos. ¿Cuándo podemos agendar para que vengan los dos? Va a ser una visita increíble.",
            "prefiero_otra_zona":        "¡Ah, entiendo! ¿Qué tiene esa zona que te gusta? Porque lo que describes lo tiene este proyecto y más — te cuento.",
            "necesito_pensarlo":         "¡Por supuesto! Es una decisión importante. ¿Qué parte te genera más duda? Me encantaría ayudarte a resolverla.",
            "financiamiento_complicado": "No te preocupes — tenemos a alguien que se encarga de todo el proceso contigo. Ha ayudado a muchísimas familias. ¿Lo contactamos?",
        },
        "S": {
            "precio_alto":               "Entiendo perfectamente que es una inversión importante. Veamos juntos todas las opciones de pago disponibles — quiero que se sienta cómodo/a con la decisión.",
            "timing":                    "Sin ningún apuro. Tómese el tiempo que necesite. Solo le comento que la disponibilidad puede cambiar — ¿quiere que le avise si hay movimiento?",
            "pareja_decide":             "Por supuesto, es una decisión familiar. ¿Quiere que organicemos una visita donde puedan verlo juntos con toda calma?",
            "prefiero_otra_zona":        "Totalmente válido. ¿Qué es lo que más valora de esa zona? Quiero asegurarme de que lo que le muestro realmente le funcione.",
            "necesito_pensarlo":         "Claro que sí. Sin presión. ¿Hay algo en especial que le genera duda? Estoy aquí para resolverla cuando quiera.",
            "financiamiento_complicado": "Lo entiendo muy bien. Tenemos un asesor financiero que lo acompañaría en todo el proceso, sin costo. ¿Le gustaría hablar con él?",
        },
        "C": {
            "precio_alto":               "Comprendo. Comparemos datos: precio/m² de este proyecto vs 3 alternativas en la zona. El diferencial se justifica por [datos adjuntos]. ¿Le comparto el análisis?",
            "timing":                    "Dato histórico: el precio en esta zona subió 8.3% en 2023 y 11.2% en 2024. Cada mes de espera tiene un costo de oportunidad calculable. ¿Le paso la proyección?",
            "pareja_decide":             "Perfecto. Puedo prepararles un dossier técnico completo: especificaciones, comparables, proyección financiera a 5 años. ¿Se los envío?",
            "prefiero_otra_zona":        "Interesante. ¿Le parece si hacemos una comparativa objetiva? Precio/m², acceso a servicios, historial de plusvalía. Los datos hablan por sí solos.",
            "necesito_pensarlo":         "Por supuesto. ¿Qué información adicional necesita para tomar una decisión fundamentada? Puedo prepararle lo que requiera.",
            "financiamiento_complicado": "Le detallo las 4 opciones disponibles con tasas y condiciones exactas. También tengo el análisis de costo-beneficio de cada una. ¿Le parece?",
        },
        "MIX": {
            "precio_alto":               "Entiendo la preocupación. Tenemos opciones de financiamiento que hacen más accesible la inversión. ¿Le cuento?",
            "timing":                    "Válido totalmente. La disponibilidad es limitada, pero podemos explorar juntos el mejor momento para usted.",
            "pareja_decide":             "Con gusto les preparamos información completa para que decidan juntos.",
            "prefiero_otra_zona":        "¿Qué valora de esa zona? Así me aseguro de mostrarle opciones que realmente le funcionen.",
            "necesito_pensarlo":         "Sin problema. ¿Hay algo que le genere duda? Con gusto lo resolvemos.",
            "financiamiento_complicado": "Tenemos varias opciones de financiamiento. Le ayudamos a encontrar la que mejor se ajuste a su situación.",
        },
    }

    # ── Per-DISC discovery questions ──────────────────────────────────────
    base_questions: Dict[str, List[str]] = {
        "D": [
            f"¿Cuál es su plazo máximo para tomar la decisión?",
            f"¿Qué ROI mínimo espera de esta inversión en los próximos 3 años?",
            f"¿Qué factor haría que decidiera hoy mismo?",
            f"¿Ya tiene identificadas las alternativas con las que nos compara?",
            f"¿Quién más en su organización o familia tiene voz en esta decisión?",
        ],
        "I": [
            f"¿Cómo se imagina su vida cotidiana en este espacio?",
            f"¿Qué comentaron sus conocidos sobre la zona?",
            f"¿Qué es lo que más emocionalmente le conecta con este tipo de proyecto?",
            f"¿Ha compartido esta búsqueda con alguien cercano cuya opinión le importe?",
            f"¿Cómo se sentiría mostrando este espacio a sus amigos o familia?",
        ],
        "S": [
            f"¿Para cuántos miembros de su familia están buscando este espacio?",
            f"¿Qué cambio en su vida cotidiana espera al mudarse?",
            f"¿Cuáles son sus preocupaciones principales antes de tomar esta decisión?",
            f"¿Qué servicios cercanos son indispensables para usted: escuelas, hospitales, transporte?",
            f"¿Ha vivido en esta zona antes o sería una experiencia nueva?",
        ],
        "C": [
            f"¿Ha revisado el historial de plusvalía de esta zona en los últimos 5 años?",
            f"¿Qué métricas específicas utiliza para comparar propiedades?",
            f"¿Cuántos proyectos similares está evaluando actualmente?",
            f"¿Cuál es su criterio de decisión más importante: precio/m², ubicación o ROI?",
            f"¿Le interesa ver los estados financieros del desarrollador y el avance de obra?",
        ],
        "MIX": [
            f"¿Cuál es su prioridad principal: inversión o uso personal?",
            f"¿Tiene un presupuesto definido o es flexible?",
            f"¿Cuándo le gustaría mudarse o comenzar a rentar?",
            f"¿Qué zona le parece más conveniente para su estilo de vida?",
            f"¿Ha considerado el financiamiento o prefiere contado?",
        ],
    }

    # ── Per-DISC followup cadence ─────────────────────────────────────────
    cadences: Dict[str, Dict[str, Any]] = {
        "D":   {"first": "24h", "second": "3d",  "third": "7d",  "rationale": "Perfiles D responden a presión de tiempo y urgencia — seguimiento cercano."},
        "I":   {"first": "24h", "second": "3d",  "third": "5d",  "rationale": "Perfiles I requieren calidez y consistencia — mantener el entusiasmo activo."},
        "S":   {"first": "3d",  "second": "7d",  "third": "14d", "rationale": "Perfiles S necesitan espacio para reflexionar — seguimiento paciente sin presión."},
        "C":   {"first": "48h", "second": "5d",  "third": "10d", "rationale": "Perfiles C necesitan tiempo para analizar datos — cada follow-up debe traer info nueva."},
        "MIX": {"first": "48h", "second": "5d",  "third": "10d", "rationale": "Perfil mixto — cadencia equilibrada adaptable a señales de interés."},
    }

    disc_key = dt if dt in DISC_CLOSING else "MIX"

    return {
        "opening_script": openings.get(disc_key, openings["MIX"]),
        "value_pitch": pitches.get(disc_key, pitches["MIX"]),
        "objection_responses": objections.get(disc_key, objections["MIX"]),
        "closing_technique": {
            **CLOSING_TECHNIQUES.get(DISC_CLOSING[disc_key], CLOSING_TECHNIQUES["balance"]),
            "recommended": DISC_CLOSING[disc_key],
        },
        "discovery_questions": base_questions.get(disc_key, base_questions["MIX"]),
        "followup_cadence": cadences.get(disc_key, cadences["MIX"]),
    }


# ─── Engine ───────────────────────────────────────────────────────────────────
class ArgumentarioEngine:
    """Genera argumentario DISC-adaptativo por lead × asesor."""

    REFRESH_MIN_INTERVAL_HOURS = 12
    PER_ORG_RATE_CAP = 30  # /min
    PER_DAY_T1_CAP = 100
    TTL_DAYS = 60

    def __init__(self, db, org_id: str):
        self.db = db
        self.org_id = org_id

    # ── Phase Y guard ──────────────────────────────────────────────────────────
    async def _validate_phase_y(self) -> Tuple[str, bool]:
        """Returns (tier, sim_mode). Raises 403-style exception if disabled."""
        try:
            from routes.phase_y_controls import get_phase_y_settings
            s = await get_phase_y_settings(self.db, self.org_id)
            if not s.get("agentic_enabled", False):
                raise ArgumentarioDisabledError("Phase Y master switch desactivado")
            tier_raw = (s.get("feature_tiers") or {}).get("argumentario_adaptive", "off")
            if not tier_raw or tier_raw == "off":
                raise ArgumentarioDisabledError("argumentario_adaptive desactivado (tier off)")
            sim = bool(s.get("simulation_mode", False))
            return tier_raw, sim
        except ArgumentarioDisabledError:
            raise
        except Exception as exc:
            log.warning(f"[argumentario] phase_y validation failed: {exc}")
            raise ArgumentarioDisabledError(f"Phase Y check error: {exc}")

    def _tier_num(self, tier: str) -> int:
        if not tier or tier in ("off", "disabled"):
            return 0
        try:
            return int(tier.replace("T", ""))
        except (ValueError, AttributeError):
            return 0

    # ── Data fetch helpers ────────────────────────────────────────────────────
    async def _fetch_lead(self, lead_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.leads.find_one(
            {"id": lead_id, "org_id": self.org_id}, {"_id": 0},
        )
        if not doc:
            doc = await self.db.leads.find_one(
                {"id": lead_id}, {"_id": 0},
            )
        return doc

    async def _fetch_disc(self, lead_id: str) -> Optional[Dict[str, Any]]:
        return await self.db.disc_profiles.find_one(
            {"lead_id": lead_id, "org_id": self.org_id},
            {"_id": 0, "scores": 1, "predominant_type": 1,
             "communication_preferences": 1, "recommended_approach_text": 1},
        )

    async def _fetch_intent_history(self, lead_id: str) -> List[str]:
        """Últimos 15 mensajes del lead en Atlax/Asistente."""
        msgs = []
        for coll_name in ("atlax_messages", "asistente_messages"):
            try:
                cur = self.db[coll_name].find(
                    {"lead_id": lead_id}, {"_id": 0, "content": 1, "role": 1},
                ).sort("created_at", -1).limit(8)
                async for m in cur:
                    if m.get("role") == "user":
                        msgs.append(str(m.get("content", ""))[:200])
            except Exception:
                pass
        return msgs[:15]

    async def _fetch_recent_replies(self, lead_id: str) -> List[Dict[str, Any]]:
        """Últimas 5 replies clasificadas."""
        replies = []
        try:
            cur = self.db.email_replies.find(
                {"lead_id": lead_id, "org_id": self.org_id},
                {"_id": 0, "classification": 1, "next_best_action_type": 1, "created_at": 1},
            ).sort("created_at", -1).limit(5)
            async for r in cur:
                replies.append(r)
        except Exception:
            pass
        return replies

    async def _fetch_visit_prep(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Dossier de visita más reciente."""
        try:
            doc = await self.db.visit_prep_dossiers.find_one(
                {"lead_id": lead_id, "org_id": self.org_id},
                {"_id": 0, "content.likely_objections": 1, "content.talking_points": 1},
                sort=[("generated_at", -1)],
            )
            return doc
        except Exception:
            return None

    async def _fetch_atlax_persona(self) -> Optional[Dict[str, Any]]:
        """Persona configurada del org."""
        try:
            doc = await self.db.atlax_personas.find_one(
                {"org_id": self.org_id}, {"_id": 0},
            )
            return doc
        except Exception:
            return None

    # ── generate_argumentario ─────────────────────────────────────────────────
    async def generate_argumentario(
        self, lead_id: str, asesor_id: str,
    ) -> Dict[str, Any]:
        """Entry point principal. Ejecuta 3-layer resilience."""
        tier, sim_mode = await self._validate_phase_y()

        # Check existing (not stale, not expired)
        existing = await self._get_existing(lead_id)
        if existing and existing.get("status") == "active":
            return existing

        # Fetch all context data upfront
        lead = await self._fetch_lead(lead_id) or {}
        disc = await self._fetch_disc(lead_id)
        disc_type = (disc or {}).get("predominant_type") or "MIX"

        lead_name = (
            (lead.get("contact") or {}).get("name") or
            lead.get("name") or lead_id
        )
        budget_band = lead.get("budget_band") or "medio"
        segment = lead.get("segment") or lead.get("property_type") or "residencial"
        zone = lead.get("zone") or lead.get("zona") or "CDMX"

        if sim_mode:
            content = _build_heuristic_argumentario(disc_type, budget_band, segment, lead_name, zone)
            return await self._persist(lead_id, asesor_id, content, disc_type,
                                        layer="heuristic", tokens=0, cost=0.0,
                                        data_quality="simulated")

        # Layer 1 — LLM
        result = None
        layer_used = "heuristic"
        tokens = 0
        cost = 0.0

        try:
            result, tokens, cost = await self._layer_llm(
                lead, lead_id, asesor_id, disc, disc_type, budget_band, segment, zone, lead_name,
            )
            layer_used = "llm"
        except Exception as exc:
            log.warning(f"[argumentario] LLM layer failed ({lead_id}): {exc}")

        # Layer 2 — cached similar
        if result is None:
            try:
                result = await self._layer_cache_similar(disc_type, segment, budget_band, lead_name, zone)
                if result:
                    layer_used = "cache"
            except Exception as exc:
                log.warning(f"[argumentario] cache layer failed ({lead_id}): {exc}")

        # Layer 3 — heuristic
        if result is None:
            result = _build_heuristic_argumentario(disc_type, budget_band, segment, lead_name, zone)
            layer_used = "heuristic"

        return await self._persist(lead_id, asesor_id, result, disc_type,
                                    layer=layer_used, tokens=tokens, cost=cost)

    async def refresh_argumentario(self, lead_id: str, asesor_id: str) -> Dict[str, Any]:
        """Invalida cache y regenera. Rate-limited: 1/12h/lead."""
        existing = await self._get_existing(lead_id)
        if existing:
            gen_at = existing.get("generated_at")
            if gen_at:
                if isinstance(gen_at, str):
                    try:
                        gen_at = datetime.fromisoformat(gen_at.replace("Z", "+00:00"))
                    except Exception:
                        gen_at = None
                if gen_at:
                    gen_at_aware = gen_at.replace(tzinfo=timezone.utc) if gen_at.tzinfo is None else gen_at
                    hours = (_now() - gen_at_aware).total_seconds() / 3600
                    if hours < self.REFRESH_MIN_INTERVAL_HOURS:
                        raise ArgumentarioRateLimitError(
                            f"Rate limit: puedes refrescar después de "
                            f"{self.REFRESH_MIN_INTERVAL_HOURS}h. "
                            f"Próximo refresh en {self.REFRESH_MIN_INTERVAL_HOURS - hours:.1f}h"
                        )
        # Invalidate and regenerate
        await self.db.argumentario_scripts.delete_many(
            {"org_id": self.org_id, "lead_id": lead_id},
        )
        return await self.generate_argumentario(lead_id, asesor_id)

    async def mark_used(self, lead_id: str, asesor_id: str) -> Dict[str, Any]:
        """Marca argumentario como usado. Downstream tracking."""
        await self.db.argumentario_scripts.update_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"$set": {"status": "used", "used_at": _now().isoformat(), "used_by": asesor_id}},
        )
        try:
            from log_activity import log_activity
            await log_activity(self.db, {
                "type": "argumentario.mark_used",
                "org_id": self.org_id,
                "lead_id": lead_id,
                "asesor_id": asesor_id,
                "created_at": _now(),
            })
        except Exception:
            pass
        result = await self._get_existing(lead_id)
        return result or {"ok": True, "status": "used"}

    # ── Layer 1 — LLM ─────────────────────────────────────────────────────────
    async def _layer_llm(
        self,
        lead: Dict[str, Any],
        lead_id: str,
        asesor_id: str,
        disc: Optional[Dict[str, Any]],
        disc_type: str,
        budget_band: str,
        segment: str,
        zone: str,
        lead_name: str,
    ) -> Tuple[Optional[Dict[str, Any]], int, float]:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise Exception("EMERGENT_LLM_KEY no configurado")

        model = os.environ.get("ARGUMENTARIO_MODEL", "claude-sonnet-4-5-20250929")

        # Pre-fetch tool data
        intent_history = await self._fetch_intent_history(lead_id)
        replies = await self._fetch_recent_replies(lead_id)
        visit_prep = await self._fetch_visit_prep(lead_id)
        persona = await self._fetch_atlax_persona()

        disc_summary = ""
        if disc:
            cp = disc.get("communication_preferences") or {}
            disc_summary = (
                f"DISC: tipo predominante={disc_type}, "
                f"scores={json.dumps(disc.get('scores', {}))}, "
                f"tono={cp.get('tone','warm')}, longitud={cp.get('length_preference','medium')}, "
                f"enfoque recomendado: {disc.get('recommended_approach_text','')[:300]}"
            )
        else:
            disc_summary = f"DISC: no inferido aún. Asumir tipo MIX (balanced)."

        persona_summary = ""
        if persona:
            persona_summary = (
                f"Persona org: nombre={persona.get('persona_name','Atlax')}, "
                f"tono={persona.get('tone','cercano')}, "
                f"brand_keywords={persona.get('brand_voice_keywords',[])}, "
                f"forbidden_topics={persona.get('forbidden_topics',[])}"
            )

        intent_txt = "\n".join(f"  - {m}" for m in intent_history[:8]) or "  (sin historial)"
        replies_txt = "\n".join(
            f"  - clasificación={r.get('classification')} action={r.get('next_best_action_type')}"
            for r in replies[:3]
        ) or "  (sin replies)"
        vp_objections = []
        if visit_prep:
            vp_objections = (visit_prep.get("content") or {}).get("likely_objections") or []
        obj_txt = "\n".join(f"  - {o}" for o in vp_objections[:4]) or "  (sin datos)"

        system_prompt = """Eres el copiloto AI de DesarrollosMX (DMX), especialista en argumentarios de venta inmobiliaria para asesores en CDMX. Generas scripts personalizados adaptados al perfil DISC del comprador y al tono de marca del desarrollador.

REGLAS ESTRICTAS:
- Output SOLO JSON válido, sin texto extra, sin markdown, sin explicaciones.
- Respeta SIEMPRE el tono DISC del comprador.
- Adapta el lenguaje según el brand voice del org.
- Las objections_responses deben tener tono DISC-coherente (D=directo/rápido · I=entusiasta/social · S=empático/tranquilo · C=datos/lógica).
- Los 6 tipos de objeción son fijos: precio_alto, timing, pareja_decide, prefiero_otra_zona, necesito_pensarlo, financiamiento_complicado.
- El output JSON debe tener EXACTAMENTE estos campos: opening_script, value_pitch, objection_responses, closing_technique, discovery_questions, followup_cadence."""

        user_prompt = f"""Genera el argumentario completo para este asesor inmobiliario:

CONTEXTO DEL LEAD:
- Nombre: {lead_name}
- ID: {lead_id}
- Zona de interés: {zone}
- Presupuesto: {budget_band}
- Segmento: {segment}
- {disc_summary}

HISTORIAL DE INTENCIÓN (mensajes al asistente Atlax):
{intent_txt}

REPLIES CLASIFICADOS:
{replies_txt}

OBJECIONES CONOCIDAS DE VISITA PREP:
{obj_txt}

{persona_summary}

OUTPUT JSON REQUERIDO:
{{
  "opening_script": {{
    "call": "script llamada telefónica (2-3 oraciones, tono DISC: {disc_type})",
    "whatsapp": "script WhatsApp (1-2 oraciones, informal DISC-aware)",
    "email": "asunto + cuerpo email corto (3-4 oraciones, profesional DISC-aware)"
  }},
  "value_pitch": "3-4 oraciones con propuesta de valor adaptada a DISC={disc_type}, budget={budget_band}, zona={zone}",
  "objection_responses": {{
    "precio_alto": "respuesta DISC-aware (2-3 oraciones)",
    "timing": "respuesta DISC-aware (2-3 oraciones)",
    "pareja_decide": "respuesta DISC-aware (2-3 oraciones)",
    "prefiero_otra_zona": "respuesta DISC-aware (2-3 oraciones)",
    "necesito_pensarlo": "respuesta DISC-aware (2-3 oraciones)",
    "financiamiento_complicado": "respuesta DISC-aware (2-3 oraciones)"
  }},
  "closing_technique": {{
    "recommended": "assumptive|summary|empathy|evidence|balance",
    "name": "nombre de la técnica",
    "rationale": "por qué esta técnica para este DISC (1-2 oraciones)",
    "script": "script exacto de cierre DISC-aware (2-3 oraciones)"
  }},
  "discovery_questions": [
    "pregunta 1 DISC-adaptive",
    "pregunta 2",
    "pregunta 3",
    "pregunta 4",
    "pregunta 5"
  ],
  "followup_cadence": {{
    "first": "24h|48h|3d",
    "second": "3d|5d|7d",
    "third": "7d|10d|14d",
    "rationale": "por qué esta cadencia para DISC={disc_type} (1 oración)"
  }}
}}"""

        # ── F2 Sub-D · RAG context helper + cross-feature memory ──────────
        _rag_context_text = ""
        try:
            from rag_context_helper import (
                get_lead_context, get_external_context, get_rag_context,
            )
            _rag_blocks = []
            _lc = await get_lead_context(self.db, lead_id, tenant_id=self.org_id)
            if _lc:
                _rag_blocks.append("## CONTEXTO DEL LEAD\n" + _lc)
            _ec = await get_external_context(self.db, zone=zone if zone and zone != "CDMX" else None)
            if _ec:
                _rag_blocks.append("## CONTEXTO MACRO\n" + _ec)
            # Argumentario-relevant RAG (objection handling, scripts)
            _gc = await get_rag_context(
                self.db, f"argumentario objeciones venta {segment} {zone}",
                scope="all", tenant_id=self.org_id, top_k=3, max_chars=1200,
            )
            if _gc:
                _rag_blocks.append("## CONTEXTO RAG\n" + _gc)
            # Cross-feature memory of asesor
            if asesor_id:
                try:
                    from director_memory_engine import DirectorMemoryEngine
                    _dme = DirectorMemoryEngine(self.db, self.org_id or "default")
                    _mems = await _dme.retrieve_for_user(
                        asesor_id, query=f"objeciones {segment} {zone}", top_k=3,
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
            _logging.getLogger("dmx.f2_rag_wiring").warning(f"[rag_wiring argumentario] failed silent: {_rag_exc}")
            _rag_context_text = ""

        # Augment user_prompt (append RAG block; never replace)
        if _rag_context_text:
            user_prompt = f"{user_prompt}\n\n{_rag_context_text}"

        from emergentintegrations.llm.chat import LlmChat, UserMessage as LlmUserMsg
        session_id = f"arg_{uuid.uuid4().hex[:10]}"
        chat = LlmChat(
            api_key=api_key, session_id=session_id, system_message=system_prompt,
        ).with_model("anthropic", model)

        raw = await chat.send_message(LlmUserMsg(text=user_prompt))
        raw = (raw or "").strip()

        # Extract JSON
        parsed = None
        for attempt in [raw, raw.split("```json")[-1].split("```")[0] if "```" in raw else raw]:
            try:
                parsed = json.loads(attempt.strip())
                break
            except Exception:
                pass

        if not parsed:
            raise Exception(f"LLM output no parseable: {raw[:200]}")

        # Normalize content
        content = _normalize_content(parsed)

        # Rough cost estimate
        tok_in = max(1, (len(system_prompt) + len(user_prompt)) // 4)
        tok_out = max(1, len(raw) // 4)
        cost = round((tok_in * 3.0 + tok_out * 15.0) / 1_000_000, 8)

        # ── AI cost tracking (best-effort, fire-and-forget) ────────────────
        try:
            from ai_budget import track_ai_call
            await track_ai_call(
                db=self.db,
                dev_org_id=self.org_id or "default",
                model=model,
                tokens=tok_in + tok_out,
                tokens_in=tok_in,
                tokens_out=tok_out,
                call_type="argumentario",
                feature_key="argumentario",
            )
        except Exception as _exc:
            import logging as _logging
            _logging.getLogger("dmx.argumentario").warning(f"[track_ai_call] failed silent: {_exc}")

        # ── F2 Sub-D · Cross-feature memory ingest (best-effort) ──────────
        try:
            from director_memory_engine import DirectorMemoryEngine
            _dme_ing = DirectorMemoryEngine(self.db, self.org_id or "default")
            # Use the first objection_response as representative text (precio_alto is canonical)
            _obj_text = "objeciones argumentario generado"
            _resp_text = ""
            try:
                _or_dict = (content or {}).get("objection_responses") or {}
                if isinstance(_or_dict, dict) and _or_dict:
                    _first_key = next(iter(_or_dict.keys()))
                    _obj_text = _first_key
                    _resp_text = str(_or_dict.get(_first_key) or "")[:280]
            except Exception:
                pass
            await _dme_ing.ingest_argumentario_query(
                lead_id, asesor_id, _obj_text, _resp_text,
            )
        except Exception as _ing_exc:
            import logging as _logging
            _logging.getLogger("dmx.f2_rag_wiring").warning(f"[ingest argumentario] failed silent: {_ing_exc}")

        return content, tok_in + tok_out, cost

    # ── Layer 2 — cached similar ───────────────────────────────────────────────
    async def _layer_cache_similar(
        self, disc_type: str, segment: str, budget_band: str,
        lead_name: str, zone: str,
    ) -> Optional[Dict[str, Any]]:
        """Busca argumentarios <14d con lead de mismo DISC+segment+budget."""
        since = _now() - timedelta(days=14)
        try:
            doc = await self.db.argumentario_scripts.find_one(
                {
                    "org_id": self.org_id,
                    "disc_type": disc_type,
                    "budget_band": budget_band,
                    "segment": segment,
                    "generated_at": {"$gte": since.isoformat()},
                    "status": {"$ne": "stale"},
                },
                {"_id": 0, "content": 1},
                sort=[("generated_at", -1)],
            )
            if doc and doc.get("content"):
                return doc["content"]
        except Exception as exc:
            log.warning(f"[argumentario] cache similar failed: {exc}")
        return None

    # ── Persistence ───────────────────────────────────────────────────────────
    async def _get_existing(self, lead_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.argumentario_scripts.find_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"_id": 0},
        )
        if not doc:
            return None
        # Check TTL
        exp = doc.get("expires_at")
        if exp:
            if isinstance(exp, str):
                try:
                    exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                except Exception:
                    exp = None
            if exp:
                exp_aware = exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp
                if _now() > exp_aware:
                    await self.db.argumentario_scripts.update_one(
                        {"org_id": self.org_id, "lead_id": lead_id},
                        {"$set": {"status": "stale"}},
                    )
                    return None
        return doc

    async def _persist(
        self,
        lead_id: str,
        asesor_id: str,
        content: Dict[str, Any],
        disc_type: str,
        layer: str,
        tokens: int,
        cost: float,
        data_quality: str = "real",
    ) -> Dict[str, Any]:
        now = _now()
        lead = await self._fetch_lead(lead_id) or {}
        doc = {
            "id": f"arg_{uuid.uuid4().hex[:12]}",
            "org_id": self.org_id,
            "lead_id": lead_id,
            "asesor_id": asesor_id,
            "disc_type": disc_type,
            "budget_band": lead.get("budget_band") or "medio",
            "segment": lead.get("segment") or "residencial",
            "generated_at": now.isoformat(),
            "expires_at": (now + timedelta(days=self.TTL_DAYS)).isoformat(),
            "content": content,
            "layer_used": layer,
            "tokens": tokens,
            "cost_usd": cost,
            "status": "active",
            "data_quality": data_quality,
        }
        await self.db.argumentario_scripts.update_one(
            {"org_id": self.org_id, "lead_id": lead_id},
            {"$set": doc},
            upsert=True,
        )
        return doc


# ─── Content normalizer ────────────────────────────────────────────────────────
def _normalize_content(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Asegura shape estable del content (defaults seguros para todos los campos)."""
    opening = raw.get("opening_script") or {}
    if isinstance(opening, str):
        opening = {"call": opening, "whatsapp": opening, "email": opening}

    obj = raw.get("objection_responses") or {}
    for ot in OBJECTION_TYPES:
        if ot not in obj:
            obj[ot] = "Entiendo su punto. Déjeme mostrarle cómo podemos resolverlo."

    ct = raw.get("closing_technique") or {}
    if isinstance(ct, str):
        ct = {"recommended": ct, "name": ct, "rationale": "", "script": ""}

    dq = raw.get("discovery_questions") or []
    if len(dq) < 5:
        dq = dq + ["¿Qué le gustaría saber?"] * (5 - len(dq))

    cadence = raw.get("followup_cadence") or {}
    if isinstance(cadence, str):
        cadence = {"first": "24h", "second": "5d", "third": "10d", "rationale": cadence}

    return {
        "opening_script": {
            "call":      str(opening.get("call", "")[:600]),
            "whatsapp":  str(opening.get("whatsapp", "")[:600]),
            "email":     str(opening.get("email", "")[:800]),
        },
        "value_pitch":         str(raw.get("value_pitch", ""))[:500],
        "objection_responses": {k: str(obj.get(k, ""))[:400] for k in OBJECTION_TYPES},
        "closing_technique": {
            "recommended": str(ct.get("recommended", "balance")),
            "name":        str(ct.get("name", ""))[:100],
            "rationale":   str(ct.get("rationale", ""))[:300],
            "script":      str(ct.get("script", ""))[:400],
        },
        "discovery_questions": [str(q)[:200] for q in dq[:5]],
        "followup_cadence": {
            "first":    str(cadence.get("first", "24h")),
            "second":   str(cadence.get("second", "5d")),
            "third":    str(cadence.get("third", "10d")),
            "rationale": str(cadence.get("rationale", ""))[:250],
        },
    }


# ─── Error types ──────────────────────────────────────────────────────────────
class ArgumentarioDisabledError(Exception):
    """Phase Y off o tier insuficiente."""


class ArgumentarioRateLimitError(Exception):
    """Rate limit de refresh excedido."""


# ─── Indexes ──────────────────────────────────────────────────────────────────
async def ensure_argumentario_indexes(db) -> None:
    """Índices para argumentario_scripts."""
    try:
        await db.argumentario_scripts.create_index(
            [("org_id", 1), ("lead_id", 1)],
            unique=True, name="idx_arg_org_lead_unique", background=True,
        )
        await db.argumentario_scripts.create_index(
            [("asesor_id", 1), ("generated_at", -1)],
            name="idx_arg_asesor_time", background=True,
        )
        await db.argumentario_scripts.create_index(
            "expires_at", expireAfterSeconds=0,
            name="idx_arg_ttl", background=True,
        )
        await db.argumentario_scripts.create_index(
            [("org_id", 1), ("disc_type", 1), ("segment", 1), ("budget_band", 1)],
            name="idx_arg_disc_segment_budget", background=True,
        )
        log.info("[argumentario] indexes OK")
    except Exception as exc:
        log.warning(f"[argumentario] ensure_indexes failed: {exc}")
