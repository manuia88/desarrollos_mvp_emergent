# Mapa de Granularidad del Embudo (Cliente + Broker) · 2026-06-05

Origen: founder pidió "mirada amplia a TODO el flujo (registro, presupuesto, formas de pago, zonas,
perfilamiento, objeciones, citas, ofertas, negociaciones), lado broker Y lado cliente; las métricas
actuales son mediocres". Grounding: agente mapeó lo que YA captura el backend (mucho, latente).

## TESIS
NO somos pobres de datos — somos pobres de SURFACE. El backend ya event-sourcea el embudo
(`lead_journey_engine`: 16 step types · `funnel_events` marketing · `pipeline_engine` V2 con gates ·
`emit_ml_event` por transición) y tiene ~18 motores de perfilado/predicción. La granularidad extrema
es agregar+cruzar lo que ya existe, no construir de cero. Riesgo #1: DOS universos de leads
(`db.leads` comprador vs `db.asesor_contactos` asesor) unidos por JOIN frágil email/tel → unificar primero.

## LA MATRIZ: cada etapa × cada dimensión
Dimensiones de corte (todas combinables): **canal** (in-house/broker) · **asesor** · **proyecto** ·
**prototipo/tamaño** · **zona** · **rango de presupuesto** · **forma de pago** · **fuente/UTM** · **en el tiempo**.

### Por etapa — qué se puede medir (y qué campo real lo respalda)
1. **Registro**: leads por fuente (portal/landing/referido/broker/FB/quiz), por UTM completo, por zona de
   interés, por proyecto. Velocidad de entrada. (`db.leads.source/origin/utm_*`, `lead_capture_engine`, `funnel_events`)
2. **Perfilamiento**: distribución de **presupuesto** (precio_min/max), **forma de pago preferida**
   (contado/crédito/infonavit/cofinavit), **motivo** (inversión/vivir), tamaño/recámaras buscadas, zonas,
   no-negociables, urgencia, **DISC** (D/I/S/C), **buyer_score** (hot/warm/cold), **taste/gusto visual**.
   (`db.asesor_busquedas`, `disc_profiles`, `buyer_scores`, `asesor_taste_profile`)
3. **Contacto/Nurturing**: **tiempo de 1ª respuesta** (SLA real), # de toques, canal (WA/llamada/email),
   sentiment de la conversación, engagement. (`first_response_at`, `asesor_contacto_timeline`, `conversations`)
4. **Citas**: agendadas / asistidas / **no-show** / reagendadas, qué unidad vio, feedback de visita,
   visit_outcome. (`db.appointments` status incl. no_show, `asesor_lead_properties`)
5. **Objeciones**: YA categorizadas — **precio · ubicación · financiamiento · tiempo · competencia · duda**.
   Frecuencia por proyecto/prototipo/asesor. (`asesor_copilot_events kind=objecion`, `reply_classifier` off)
6. **Ofertas/Cotizaciones**: forma de pago elegida, unidad cotizada. (GAP: cotización formal con precio/descuento)
7. **Negociación**: en negociación, valor de cierre vs sugerido. (GAP: rondas/contraofertas)
8. **Cierre/Pérdida**: ganados, **razón de pérdida** (hoy texto libre — GAP taxonomía + competidor ganador),
   tiempo total a cierre. (`status_v2`, `asesor_operaciones`, `pass_reason`)
9. **Post-venta**: referido/reseña/recompra (GAP — diferido B5.7; hooks: `workflow_engine lead.custom_event`, `cross_sell_engine`)

## CROSS-FEATURES (lo poderoso — donde 2 señales valen 10x)
- **Presupuesto × forma de pago**: "los de $20M+ van a contado; los de $10M a crédito 20%" → qué planes ofrecer y a quién.
- **Objeción × prototipo/precio**: "40% de las objeciones del PH son por precio" → reposiciona o ajusta ESE prototipo.
- **Zona de interés × tu inventario**: demanda por colonia vs lo que tienes → dónde te falta producto (demand-gap ya existe).
- **Forma de pago × velocidad de cierre**: qué plan cierra más rápido → empújalo.
- **Presupuesto × prototipo (match producto-cliente)**: el lead promedio que entra vs lo que vendes → desalineación.
- **Asesor × perfil de lead (EL MATCH ÓPTIMO)**: qué asesor cierra mejor cada perfil (presupuesto×zona×prototipo×DISC)
  → al entrar un lead, sugiere a quién asignarlo. Lo ejecuta el Cerebro. Apex del moat.
- **Objeción × razón de pérdida**: qué objeción NO atendida termina en pérdida → script/acción que tapa la fuga.
- **DISC × canal/script**: qué tono cierra qué personalidad (argumentario ya existe, off).
- **Fuente/UTM × calidad (cierre)**: qué campaña/portal trae leads que SÍ cierran, no solo volumen → CAC real por fuente.

## EL "+ MÁS INFO" DE LA LISTA DE PRECIOS = EXPEDIENTE POR UNIDAD (cross-feature por unidad)
Hoy el "+info" de cada unidad muestra price-history/comparables/AVM sueltos. El upgrade: fusionar TODO lo
que toca esa unidad en una historia accionable:
- **Historial de precio** de la unidad (price_events) + **días en mercado**.
- **Quién la cotizó** (# cotizaciones) + **qué descuento pidieron** + **objeciones sobre ELLA**.
- **Vistas/engagement** de la unidad + **AVM/valor justo** + **comparables**.
- **Ofertas/negociaciones** sobre la unidad.
→ Veredicto: "Esta unidad: 3 cotizaciones, todas piden −5%, 140 días listada, AVM dice +8% sobre mercado →
baja precio o cambia estrategia". Convierte la tabla de precios en un tablero de decisión por-unidad.

## MOTORES YA EXISTENTES QUE LO ALIMENTAN (no construir de cero)
buyer_score · close_probability (self-tuning) · DISC (quiz + inferencer) · taste model (6 capas) ·
lead_match · hook_predictor · reply_classifier (objeciones) · smart_routing · argumentario · churn ·
predictive_alerts (8 reglas cross-feature) · mood_engine · coaching · Agent Workforce (prospector/
nurturer/closer/analyst/coach) · Cerebro E0-E6 (apagado por flag). Muchos APAGADOS por flag.

## GAPS REALES (captura estructurada, etapas 6-9)
1. Cotización formal (precio cotizado + descuento pedido + forma de pago, por cotización).
2. Taxonomía de razón de pérdida + competidor ganador (hoy texto libre).
3. Rondas de negociación (contraofertas).
4. Unificar los DOS universos de leads (db.leads ↔ asesor_contactos) — habilita TODA analítica cross-etapa.
5. Dispositivo, demografía estructurada, post-venta (referido/reseña/recompra).

## CIMIENTO RECOMENDADO
`lead_journey_engine` (steps event-sourced) + `funnel_events` + `emit_ml_event` ya capturan transiciones.
Construir: (a) unificación de leads, (b) captura estructurada 6-9, (c) un agregador de embudo por
las dimensiones de la matriz, (d) surface en Canales (embudo por asesor/canal) + en el "+info" por unidad.
