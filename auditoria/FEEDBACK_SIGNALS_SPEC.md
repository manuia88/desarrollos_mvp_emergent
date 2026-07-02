# SPEC · Señales de feedback estructuradas (Batch 7 · feature founder)

> Objetivo: capturar el feedback del proceso lead × desarrollo como **señales estructuradas** (enums de
> taxonomía cerrada) que alimentan analítica, índices, scores de mercado/cliente y la **retro del dev** —
> SIN exponer nunca la conversación. Implementado en `backend/feedback_signals.py` +
> `backend/routes/feedback_signals.py`. Relacionado: `AUTHZ_MODEL.md`.

## Principio de privacidad (por qué es seguro)
La IA del copiloto del asesor (que SÍ puede leer la conversación, es su herramienta) convierte el chat en
ETIQUETAS de una taxonomía cerrada. El dev / el mercado ven SOLO las etiquetas, nunca la conversación.
Todo pasa por `_valid_signals()` → descarta cualquier clave/valor fuera de la taxonomía (cero texto libre,
cero PII). Cada lead pertenece a UN desarrollo (`dev_org_id`) → la señal ya está acotada por proyecto.

## Taxonomía (7 ejes)
1. **Desenlace** — `outcome` (interesado/no_interesado/indeciso/follow_up/avanzo/cerrado_ganado/cerrado_perdido/no_show) + `drop_off_stage` (contacto/pre_cita/en_cita/post_cita/oferta/escritura).
2. **Objeción (motivo de no-avance)** — `objeciones:[{cat,sub}]` · cats: precio · producto · amenidad · ubicacion · entrega · financiamiento · timing_cliente · confianza · competencia (cada una con sub-motivos).
3. **Atractores** — `atractores:[]` (precio/ubicacion/amenidades/diseno/entrega/marca/tamano/financiamiento).
4. **Perfil del comprador** — `perfil:{tipo_comprador, uso, urgencia, forma_pago, composicion}`.
5. **Gap producto↔demanda** — `gap_producto:{recamaras_deseadas, m2_objetivo, precio_objetivo, amenidad_faltante}`.
6. **Competencia (anonimizada)** — `competencia_motivo` (mas_barato/mejor_ubicacion/entrega_mas_rapida/mejor_producto) — sin nombrar tenant.
7. **Calidad operativa** — (derivada de pipeline existente: response_time, #toques) — visible a la inmobiliaria, no cross-tenant.

## Qué alimenta cada eje
| Eje | Consumidor | Índice/score que produce |
|---|---|---|
| Desenlace + drop-off | dev (retro) · analítica | embudo/conversión por desarrollo |
| Objeción | dev · **mercado** | índice de objeción por colonia · elasticidad de precio |
| Atractores | dev · marketing | demanda por atributo (qué vende) |
| Perfil | score de cliente · demanda | buyer-persona por zona · segmentación |
| Gap producto | **mercado (moat)** | "qué construir": brecha oferta vs demanda por colonia |
| Competencia | posicionamiento | posición competitiva por zona (anónima) |

## API
- `POST /api/leads/{lead_id}/feedback-signals` — el asesor/inmobiliaria dueño registra señales
  (`{signals:{...}}`) o `{auto:true}` para que la IA las extraiga de la conversación. Gate:
  `assert_lead_owner` (role-aware) + el dev NO captura (no tiene la conversación).
- `GET /api/dev/feedback-index` — el dev ve el agregado de SUS desarrollos (objeciones/atractores/perfil/
  gap por colonia); superadmin ve todo. **k-anonimato** por colonia (`min_n=3`) → no expone celdas chicas.

## Retro del dev (resuelve el dolor del founder)
El dev NO pierde visibilidad tras la cita: su resumen (AUD-056) y el índice se arman de estas señales
ESTRUCTURADAS (etapa, resultado de visita, motivo, gap), nunca de la conversación. Ve "no interesó y por
qué" sin leer el chat ni los otros desarrollos que el cliente evalúa.

## Reuso (no se duplicó motor)
Alimenta el "Modelo del Mundo de la Demanda" existente (`demand_intelligence.py` agrega por colonia desde
`buyer_signals`); estas señales añaden el eje "resultado de interacción" que faltaba. Auto-tag reusa `llm_client`.

## Estado — COMPLETO (backend + frontend + wiring)
- **Backend:** `feedback_signals.py` + `routes/feedback_signals.py` · `tests/test_feedback_signals.py` (4 verdes).
- **Auto-tag automático:** al registrar el followup post-visita (`POST /api/leads/{id}/post-realizada-followup`)
  se dispara `auto_extract` best-effort → captura señales sin trabajo extra del asesor.
- **Frontend:** `api/feedbackSignals.js` (cliente + taxonomía es-MX) · `components/feedback/FeedbackCapture.js`
  (menús de captura del asesor + botón "Auto-etiquetar con IA") · `pages/developer/DesarrolladorFeedback.js`
  (dashboard "Retro de mercado" del dev, ruta `/desarrollador/feedback`). Todos parsean (babel-preset-react-app).
- Pendiente menor (a gusto del founder): montar `<FeedbackCapture>` en la ficha del lead del asesor donde
  prefiera, y agregar el link "Retro de mercado" al menú del portal dev.
