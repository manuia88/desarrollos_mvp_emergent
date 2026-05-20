# Z.8 · Template Prompts (Canonical Index)

**Fecha**: 2026-05-20
**Status**: APPROVED founder · base para construcción Z.8.7
**Backend objetivo**: `backend/studio_copy_generator/prompts/*.py`

10 prompts LLM independientes · uno por template · cada uno auto-contenido con
identidad del copywriter, perfil del lector, código de lenguaje específico,
subset Hormozi/Brunson aplicable, anti-patterns, validaciones, schema de output,
few-shot examples y checklist pre-output.

## Archivos individuales

| # | Template | Archivo | Intent | Fit Brunson/Hormozi |
|---|---|---|---|---|
| 01 | Luxury | `Z8_PROMPT_01_LUXURY.md` | hybrid (default live) | ⭐⭐⭐⭐ 70% · código editorial Vogue |
| 02 | Investor | `Z8_PROMPT_02_INVESTOR.md` | invest_only | ⭐⭐⭐⭐⭐ 90% · código Bloomberg memorándum |
| 03 | Family | `Z8_PROMPT_03_FAMILY.md` | live_only | ⭐⭐⭐⭐ 70% · código emocional cálido |
| 04 | First-Home | `Z8_PROMPT_04_FIRST_HOME.md` | live_only | ⭐⭐⭐⭐⭐ 95% · Brunson puro · stack agresivo |
| 05 | Boutique | `Z8_PROMPT_05_BOUTIQUE.md` | live_only | ⭐⭐⭐ 50% · código revista cultural |
| 06 | Urgent | `Z8_PROMPT_06_URGENT.md` | hybrid (default invest) | ⭐⭐⭐⭐⭐ 95% · Brunson puro · countdown real |
| 07 | Social-proof | `Z8_PROMPT_07_SOCIAL_PROOF.md` | hybrid (default live) | ⭐⭐⭐⭐⭐ 90% · stack testimonial |
| 08 | Video-first | `Z8_PROMPT_08_VIDEO_FIRST.md` | hybrid (default live) | ⭐⭐⭐⭐⭐ 90% · VSL hero domina |
| 09 | Compare | `Z8_PROMPT_09_COMPARE.md` | hybrid (default invest) | ⭐⭐⭐⭐ 70% · tabla VS competidor |
| 10 | Scrollytelling | `Z8_PROMPT_10_SCROLLYTELLING.md` | hybrid (default live) | ⭐⭐⭐⭐ 70% · capítulos cinemáticos |

## Universal rules (aplican a los 10 · cada prompt referencia esto)

### Hormozi $100M Offers framework (subset por template)
- **Value Equation**: cada bullet del stack ataca uno de 4 multiplicadores
  (Dream Outcome / Perceived Likelihood / Time Delay / Effort & Sacrifice)
- **Grand Slam Offer**: stack + bonos + garantía calibrada por template
- **Naming del deal**: cada landing tiene nombre memorable
  ("El Programa {Project} Inversionista")
- **4 tipos de garantía**: unconditional · conditional · anti-guarantee · implied
- **Specificity numérica obsesiva**: "$4,287,000" no "$4.3M"

### Brunson Perfect Webinar / Sales Letter
- **Hook–Story–Offer** estructura macro
- **Star-Story-Solution** (protagonista varía por template)
- **Fascination bullets** (cantidad varía por template · 3-21)
- **3 Secrets revelados** (cuando aplica)
- **PS firmado** con nombre real
- **CTAs distribuidos** (cantidad varía por template · 1-10)
- **FAQ objection-handling** (cantidad varía · 6-12)
- **Yes-ladder** de micro-compromisos

### Cialdini scarcity (escasez REAL)
- Phases certificadas con cifras del proyecto
- Aumentos de precio justificados (costos obra · no estrategia comercial)
- "X de Y unidades" desde project_data
- **NUNCA** countdown fabricado (penalización Google + erosión trust)

### Specificity numérica (obligatorio universal)
- Toda cifra debe venir de `project_data` · NO inventar
- Citar fuente cuando aplica (BBVA Research · Softec · INEGI · NAR)
- Si falta cifra crítica: fallback "solicitar a asesor" o skip subsección

### Anti-patterns universales (cero excepción)
- Cero "Te veo adentro" / "Bienvenido a X" / "Haz clic ahora"
- Cero promesas vagas sin cifra detrás
- Cero "GARANTIZADO" en mayúsculas aislado
- Cero stock photos referenciadas en captions
- Cero scaled-content abuse (urgencia falsa · Google penaliza desde 03/2024)

### Buyer intent (hybrid templates)
Templates marcados como `hybrid` reciben `buyer_intent: "live" | "invest" | "mixed"`
del form y ajustan:
- Headlines · anti-objeciones · stack items · lead form fields · CTA copy

Templates `live_only` o `invest_only` ignoran este campo (defensive).

## Esquema general del prompt (cada archivo sigue esta estructura)

```
1. ROLE — identidad del copywriter calibrada
2. YOUR READER — perfil ultra-específico del lector
3. LANGUAGE CODE — qué SÍ y qué NO con ejemplos literales
4. HORMOZI/BRUNSON PATTERNS APLICABLES — tabla con forma específica
5. ANTI-PATTERNS — qué NO escribir nunca en este template
6. DATA INPUT — campos críticos de project_data
7. DATA VALIDATIONS — qué falla con qué fallback
8. OUTPUT SCHEMA — JSON exacto con campos y restricciones
9. FEW-SHOT EXAMPLES — 2 correctos + 2 incorrectos por sección clave
10. UNIVERSAL CHECKLIST PRE-OUTPUT — auto-validación antes de devolver
11. INPUT — placeholder para {project_data_json}
12. OUTPUT — instrucción de retorno (JSON puro)
```

## Rendering pipeline

```
broker rellena form ←→ studio_property_intakes (Mongo)
       ↓
broker selecciona template_key + (si hybrid) buyer_intent
       ↓
POST /api/studio/property-intake/{id}/generate-copy
       ↓
backend dispatch:
  prompt = load_prompt(template_key)
  llm_input = render(prompt, project_data, buyer_intent)
  llm_output = anthropic.messages.create(...)
  copy_json = parse(llm_output)
       ↓
guardar copy_json en studio_landings_copy collection
       ↓
frontend /landing/:slug
  → React renderiza <{TemplateKey}Template
       project_data={...} copy={copy_json}
    />
```

## Referencias cruzadas

- `memory/Z8_FORM_SCHEMA_FINAL.md` — 80 campos del form que alimenta los prompts
- `memory/Z8_BUYER_INTENT_DECISION.md` — decisión arquitectónica hybrid
- `memory/WAVE5_PLAN.md` — Z.8.7 SUB-A status
- `memory/STUDIO_MARKETING_RESEARCH.md` — research benchmark conversión inmobiliaria
- `memory/feedback_emergent_prompt_template.md` — template canónico para emergent

## Construcción posterior (W5.22 Z.8.7)

Una vez aprobados los 10 prompts, el prompt para emergent construye:
1. `backend/studio_property_intake_schema.py` (Pydantic 80 campos)
2. `backend/studio_copy_generator/router.py` + `prompts/*.py` (10 archivos)
3. `backend/routes/studio_property_intake.py` (4 endpoints)
4. `frontend/src/templates/landings/{TemplateKey}Template.js` × 10
5. `frontend/src/pages/portal/studio/PropertyIntakeForm.js` (form 14 secciones)
6. `frontend/src/pages/public/LandingPublic.js` update (dispatch por template_key)
7. Mongo migrations + indexes
8. Tests fixtures por template (1 propiedad de prueba por arquetipo)
