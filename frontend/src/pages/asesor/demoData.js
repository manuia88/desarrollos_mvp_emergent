// Datos DEMO hardcodeados · espejo EXACTO del mockup (asesor-leads-cockpit.html).
// ----------------------------------------------------------------------------
// Propósito: permitir EVALUAR el diseño al 100% sin depender de los motores de IA
// (score, DISC, enriquecimiento, señales) que aún no están cableados. Se activa
// SOLO con ?demo=1 en la URL de Leads → no contamina los datos reales del asesor.
// Cuando los motores estén cableados, estos mismos bloques se alimentan de la API
// y este archivo se elimina.

// ── Leads del kanban (1 representativo por etapa · como el mockup) ──────────────
export const DEMO_LEADS = [
  { id: 'demo-ana',   first_name: 'Ana',   last_name: 'Torres',    fuente: 'Referido', temperatura: 'frio',     etapa: 'nuevo',       buyer_score: { value: 24, tier: 'cold' }, phones: ['5512345678'], created_at: new Date().toISOString() },
  { id: 'demo-juan',  first_name: 'Juan',  last_name: 'Pérez',     fuente: 'Facebook', temperatura: 'tibio',    etapa: 'contactado',  buyer_score: { value: 54, tier: 'warm' }, phones: ['5512345678'], created_at: new Date().toISOString() },
  { id: 'demo-luis',  first_name: 'Luis',  last_name: 'Ramírez',   fuente: 'Web',      temperatura: 'caliente', etapa: 'visita',      buyer_score: { value: 72, tier: 'hot'  }, phones: ['5512345678'], created_at: new Date().toISOString() },
  { id: 'demo-maria', first_name: 'María', last_name: 'González',  fuente: 'Web',      temperatura: 'caliente', etapa: 'negociacion', buyer_score: { value: 87, tier: 'hot'  }, phones: ['5512345678'], created_at: new Date().toISOString(), active: true },
];

// zona · precio por lead (lo que LeadCard lee de `busquedas`).
export const DEMO_BUSQ = {
  'demo-ana':   [{ id: 'b-ana',  colonias: ['Roma'],    precio_max: 4000000 }],
  'demo-juan':  [{ id: 'b-juan', colonias: ['Condesa'], precio_max: 9000000, precio_min: 5000000 }],
  'demo-luis':  [{ id: 'b-luis', colonias: ['Reforma'] }],
  'demo-maria': [{ id: 'b-mar',  colonias: ['Polanco'], precio_max: 8000000 }],
};

// "→ próxima acción" por lead (lo que LeadCard lee de `nextAction`).
export const DEMO_ACTION = {
  'demo-ana':   { title: 'Calificar presupuesto' },
  'demo-juan':  { title: 'Reactivar por WhatsApp' },
  'demo-luis':  { title: 'Confirmar cita 4 pm' },
  'demo-maria': { title: 'Enviar oferta hoy' },
};

// línea inferior "N propiedades · antigüedad" por lead (texto literal del mockup).
export const DEMO_META = {
  'demo-ana':   { props: 'Sin propiedades aún',        aging: 'entró hoy' },
  'demo-juan':  { props: '2 propiedades enviadas',     aging: '9d sin contacto', agingWarn: true },
  'demo-luis':  { props: '3 propiedades · 1 cita',     aging: 'cita hoy' },
  'demo-maria': { props: '4 propiedades · 1 le gustó', aging: 'hace 2 días' },
};

// Conteo + intel por columna (header del kanban · como el mockup).
export const DEMO_COL = {
  nuevo:       { count: 3, intel: '2 entraron hoy' },
  contactado:  { count: 5, intel: '2 enfriándose' },
  visita:      { count: 2, intel: '1 cita hoy' },
  negociacion: { count: 4, intel: '$2.1M en juego', accent: true },
  cerrado:     { count: 2, intel: '$1.4M este mes', accent: true, empty: '2 cierres este mes' },
};

// Foco de hoy · 3 acciones priorizadas (las del mockup).
export const DEMO_FOCO = [
  { id: 'f-maria', lead_id: 'demo-maria', tone: 'hot',  who: 'María González', tag: 'cerrar',    bold: '87% lista para cerrar.', body: 'Lleva 2 días esperando — contáctala hoy antes de que se enfríe.', actions: ['wa', 'perfil'] },
  { id: 'f-juan',  lead_id: 'demo-juan',  tone: 'warm', who: 'Juan Pérez',     tag: 'reactivar', bold: '9 días sin contacto.',  body: 'Se está enfriando. Mándale las 3 nuevas de Condesa.', actions: ['wa', 'perfil'] },
  { id: 'f-luis',  lead_id: 'demo-luis',  tone: 'ok',   who: 'Luis Ramírez',   tag: 'cita hoy',  bold: 'Visita a las 4:00 pm', body: 'en Reforma 350. Llévale el comparativo de la zona.', actions: ['cita', 'comparativo'] },
];

// ── Perfil-hub completo (María · espejo del modal del mockup) ───────────────────
export const DEMO_PERFIL = {
  'demo-maria': {
    assignedToYou: true,
    brief: {
      strong: 'María, crédito aprobado',
      rest: ', busca 2 rec en Polanco hasta $8M. Ya vio 8 propiedades, le gustó la de Reforma y tiene cita el viernes 4 pm.',
      falta: 'Falta: confirmar la visita y meter oferta.',
    },
    copilot: ['Resumir', 'Redactar seguimiento', '¿Qué le ofrezco?'],
    datos: { phone: '55 1234 5678', email: 'maria.gonzalez@gmail.com', source: 'Llegó por Facebook Ads', consent: true },
    redes: [
      { color: '#0A66C2', text: 'LinkedIn · Directora de Marketing, Grupo Altavista' },
      { color: '#E1306C', text: 'Instagram · @maria.gonzalez' },
      { color: '#1877F2', text: 'Facebook · María González' },
    ],
    disc: { letter: 'I', name: 'Influyente', sub: 'cálida · social · decide con emoción', tips: ['Sé cercano y entusiasta, evita lo técnico', 'Usa historias y testimonios, no solo números', 'Dale opciones y hazla sentir especial'] },
    ready: { pct: 87, why: 'Crédito aprobado · busca activamente · respondió hace 2 días.', cta: 'Vale la pena darle seguimiento hoy.' },
    signals: [
      { label: 'Mejor momento', value: 'WhatsApp · 8–10 pm', sub: 'cuando más responde' },
      { label: 'Riesgo de enfriamiento', value: 'Bajo', sub: 'respondió hace 2 días', warn: true },
    ],
    criterios: [
      { l: 'Presupuesto', v: 'Hasta $8M' },
      { l: 'Zona', v: 'Polanco' },
      { l: 'Financiamiento', v: 'Crédito aprobado' },
      { l: 'Decide con', v: 'Su hermana' },
    ],
    pendientes: [
      { kind: 'task', title: 'Enviar comparativo de Polanco', sub: 'Tarea · vence hoy', cta: 'Completar' },
      { kind: 'cita', title: 'Visita a Reforma 350',          sub: 'Cita · viernes 4 pm', cta: 'Ver' },
      { kind: 'task', title: 'Meter oferta a la de Reforma',  sub: 'Tarea · sugerida por IA', cta: 'Completar' },
    ],
    auto: { on: true, title: 'Piloto automático activo', sub: 'El pipeline se mueve solo · seguimiento cada 3 días si no responde' },
    avance: [
      { l: 'Etapa', v: 'Negociación' },
      { l: 'Oferta', v: '$7.6M' },
      { l: 'Comisión est.', v: '$380k' },
      { l: 'Cierre est.', v: 'Junio' },
    ],
    oferta: 'Oferta sugerida: $7.4M · 82% de probabilidad de aceptación (según cierres comparables)',
    convCount: 2,
    actCount: 2,
    // Tab Propiedades · tablero por estatus + engagement del link + Tinder (mockup).
    engage: { text: 'Abrió el link hace 2h · sigue activa', views: 8, up: 3, down: 2 },
    board: [
      { key: 'dispo', label: 'Preguntando dispo.', dot: 'cold', count: 2,
        items: [{ price: '$7,800,000', title: 'Depto en Polanco', addr: 'Av. Horacio 1020', specs: ['2 rec', '2 baños', '1 est', '120 m²'], note: 'broker sin responder · 1d', tone: 'muted' }],
        reco: '+ IA sugiere 3 en Polanco (92%)' },
      { key: 'enviada', label: 'Enviada al cliente', dot: 'warm', count: 1,
        items: [{ price: '$6,900,000', title: 'Depto en Anzures', addr: 'Leibnitz 240', specs: ['2 rec', '1 baño', '1 est', '98 m²'] }] },
      { key: 'gusto', label: 'Le gustó / cita', dot: 'ok', count: 1,
        items: [{ price: '$8,000,000', title: 'Depto en Reforma', addr: 'Reforma 350', specs: ['2 rec', '2 baños', '2 est', '110 m²'], note: 'cita vie 4pm', thumb: 'up', tone: 'ok' }] },
      { key: 'descartada', label: 'Descartada', dot: 'hot', count: 1,
        items: [{ price: '$9,100,000', title: 'Depto en Lomas', addr: 'Sierra Madre 615', specs: ['3 rec', '3 baños', '2 est', '180 m²'], note: 'precio alto', thumb: 'down', tone: 'hot', dim: true }] },
    ],
    tinder: { title: 'Enviar link de propiedades a María', sub: 'Un link · desliza 👍/👎 y busca más en la Bolsa sin salir. Cada deslizada vuelve aquí.', cta: 'Crear y enviar' },
  },
};

// helpers
export const isDemo = (search) => new URLSearchParams(search || '').get('demo') === '1';
export const demoLeadById = (id) => DEMO_LEADS.find((l) => l.id === id) || null;
