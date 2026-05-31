// Advisor portal API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail?.message || body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const patch = (url, body) => j(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const del = (url) => j(url, { method: 'DELETE' });

// Profile
export const getProfile = () => j('/api/asesor/profile');
export const updateProfile = (b) => patch('/api/asesor/profile', b);

// Dashboard
export const getDashboard = () => j('/api/asesor/dashboard');

// P1 · Command Center — completar / descartar / archivar acciones (la queue viene en getDashboard)
// payload opcional = la card (para persistir acciones sintéticas la 1ra vez)
export const completeAction = (id, payload) => post(`/api/asesor/command-center/action/${id}/complete`, payload);
export const dismissAction = (id, payload) => post(`/api/asesor/command-center/action/${id}/dismiss`, payload);
export const archiveAction = (id, payload) => post(`/api/asesor/command-center/action/${id}/archive`, payload);
export const restoreAction = (id) => post(`/api/asesor/command-center/action/${id}/restore`);
export const getArchivedActions = () => j('/api/asesor/command-center/archived');

// Contactos
export const listContactos = (q = {}) => {
  const qs = new URLSearchParams(Object.entries(q).filter(([_, v]) => v)).toString();
  return j(`/api/asesor/contactos?${qs}`);
};
export const createContacto = (b) => post('/api/asesor/contactos', b);
export const getContacto = (id) => j(`/api/asesor/contactos/${id}`);
export const patchContacto = (id, b) => patch(`/api/asesor/contactos/${id}`, b);
export const addTimelineEntry = (id, b) => post(`/api/asesor/contactos/${id}/timeline`, b);
// B1 · Agregador de actividad del lead (timeline unificado · alimenta el tab Actividad del perfil-hub).
export const getContactoOverview = (id) => j(`/api/asesor/contactos/${id}/overview`);
// B2 · Inteligencia del lead (DISC · riesgo de enfriamiento · brief) desde motores reales · FAIL-OPEN.
export const getContactoIntel = (id) => j(`/api/asesor/contactos/${id}/intel`);
// B2 · Insights de conversación (ánimo/sentiment + próxima acción) · reusa compute_client_insights.
export const getLeadInsights = (id) => j(`/api/asesor/lead/${id}/insights`);

// Búsquedas
export const listBusquedas = () => j('/api/asesor/busquedas');
export const createBusqueda = (b) => post('/api/asesor/busquedas', b);
export const moveBusqueda = (id, stage) => patch(`/api/asesor/busquedas/${id}/stage`, { stage });
export const registerVisit = (id) => post(`/api/asesor/busquedas/${id}/visit`);
export const registerOffer = (id) => post(`/api/asesor/busquedas/${id}/offer`);
export const getMatches = (id) => j(`/api/asesor/busquedas/${id}/matches`);

// B5.1 · Tablero de propiedades por lead (Tab Propiedades del perfil-hub)
export const getLeadBoard = (cid) => j(`/api/asesor/contactos/${cid}/board`);
export const addLeadBoardItem = (cid, b) => post(`/api/asesor/contactos/${cid}/board`, b);
export const patchLeadBoardItem = (itemId, b) => patch(`/api/asesor/board/${itemId}`, b);
export const deleteLeadBoardItem = (itemId) => del(`/api/asesor/board/${itemId}`);
// B5.2 · Crea/reusa el link Tinder público del lead (+ texto WhatsApp)
export const createSwipeLink = (cid) => post(`/api/asesor/contactos/${cid}/swipe-link`);
// B5.3 · Recomendador — inventario rankeado por match para el lead (excluye lo que ya está en tablero)
export const getLeadSuggestions = (cid) => j(`/api/asesor/contactos/${cid}/suggestions`);
// B5.4 Capa 6 · El norte — inteligencia agregada de prospectos (gusto/rechazos/conversión por dev)
export const getProspectIntel = () => j('/api/asesor/intel/prospects');
// B5.5 · WhatsApp real con el lead (hilo + enviar · aislado por asesor vía WAEngine)
export const getLeadWhatsapp = (cid) => j(`/api/asesor/contactos/${cid}/whatsapp`);
export const sendLeadWhatsapp = (cid, text) => post(`/api/asesor/contactos/${cid}/whatsapp`, { text });
// B5.5 Upgrade A · el mensaje se escribe solo (perfil de gusto + brief → WhatsApp personalizado)
export const draftLeadWhatsapp = (cid) => post(`/api/asesor/contactos/${cid}/whatsapp/draft`);
// B5.5 Upgrade B · lo que el cliente responde, el modelo lo aprende (extrae preferencias)
export const logLeadWhatsappInbound = (cid, text) => post(`/api/asesor/contactos/${cid}/whatsapp/inbound`, { text });

// Captaciones
export const listCaptaciones = () => j('/api/asesor/captaciones');
export const createCaptacion = (b) => post('/api/asesor/captaciones', b);
export const moveCaptacion = (id, stage, payload) => patch(`/api/asesor/captaciones/${id}/stage`, { stage, payload });
export const getCaptacion = (id) => j(`/api/asesor/captaciones/${id}`);

// Tareas · scope (comportamiento previo) o contacto_id (perfil-hub · additive)
export const listTareas = (arg) => {
  // Compat: listTareas('client') sigue funcionando; listTareas({ contacto_id }) filtra por lead.
  const params = typeof arg === 'string' ? { scope: arg } : (arg || {});
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return j(`/api/asesor/tareas${qs ? `?${qs}` : ''}`);
};
export const createTarea = (b) => post('/api/asesor/tareas', b);
export const completeTarea = (id) => patch(`/api/asesor/tareas/${id}/done`);
export const deleteTarea = (id) => del(`/api/asesor/tareas/${id}`);

// Operaciones
export const listOperaciones = (status) => j(`/api/asesor/operaciones${status ? `?status=${status}` : ''}`);
export const createOperacion = (b) => post('/api/asesor/operaciones', b);
export const updateOpStatus = (id, status, reason) => patch(`/api/asesor/operaciones/${id}/status`, { status, reason });
export const getOperacion = (id) => j(`/api/asesor/operaciones/${id}`);

// Comisiones
export const getComisiones = () => j('/api/asesor/comisiones');

// Operación prefill desde búsqueda ganada
export const getOpPrefill = (bid) => j(`/api/asesor/busquedas/${bid}/op-prefill`);

// Argumentario AI
export const generateArgumentario = (b) => post('/api/asesor/argumentario', b);
export const generateArgumentarioRag = (b) => post('/api/asesor/argumentario-rag', b);

// Briefing
export const generateBriefing = () => post('/api/asesor/briefing/daily');

// P4 · Voice Briefing (reusa voice synthesize · FAIL-OPEN {ok:false} si TTS no disponible)
export const briefingVoice = () => post('/api/asesor/briefing/voice');

// P4 · Smart Digest (preview / send-now / prefs · reusa email+whatsapp+prefs)
export const getDigestPreview = () => j('/api/asesor/digest/preview');
export const sendDigestNow = () => post('/api/asesor/digest/send-now');
export const getDigestPrefs = () => j('/api/asesor/digest/prefs');
export const setDigestPrefs = (body) => patch('/api/asesor/digest/prefs', body);

// P5.A · Auto-pilot (config opt-in por tipo + kill switch + log + run-now)
export const getAutopilotConfig = () => j('/api/asesor/autopilot/config');
export const setAutopilotConfig = (body) => patch('/api/asesor/autopilot/config', body);
export const getAutopilotLog = (days = 7) => j(`/api/asesor/autopilot/log?days=${days}`);
export const pauseAutopilot = (paused) => post('/api/asesor/autopilot/pause', { paused });
export const runAutopilotNow = () => post('/api/asesor/autopilot/run-now');

// P5.B · Bulk + Pin (contactos)
export const bulkContactos = (ids, action, payload) => post('/api/asesor/contactos/bulk', { ids, action, payload });
export const pinContacto = (id) => post(`/api/asesor/contactos/${id}/pin`);

// P5.B · Custom widgets config (Command Center)
export const getWidgetsConfig = () => j('/api/asesor/dashboard/widgets-config');
export const patchWidgetsConfig = (b) => patch('/api/asesor/dashboard/widgets-config', b);

// P5.B · Recent items (visto recientemente · TTL 30d)
export const trackRecent = (b) => post('/api/asesor/recent', b);
export const getRecent = (limit = 5) => j(`/api/asesor/recent?limit=${limit}`);

// P3.A · Agent Workforce (consume endpoints P2 · agent_workforce diff=0)
export const getAgents = () => j('/api/agent-workforce/agents');
export const getAgentWorkforceStatus = () => j('/api/agent-workforce/status');
export const runAgentsNow = () => post('/api/agent-workforce/run-now');

// P3.A · Close probability por lead (reusa close_probability P2 · endpoint advisor nuevo · FAIL-OPEN)
export const getCloseProbability = (id) => j(`/api/asesor/contactos/${id}/close-probability`);

// B1 · Conversaciones IA del lead (reusa /api/conversation · alimenta el tab Conversaciones del perfil-hub)
export const getLeadConversations = (id) => j(`/api/conversation/lead/${id}/conversations`);

// Leaderboard + perfil público
export const getLeaderboard = () => j('/api/asesor/leaderboard');
export const getPublicProfile = (slug) => j(`/api/asesor/perfil-publico/${slug}`);

// Dev convenience
export const seedDemo = () => post('/api/asesor/_seed-demo');
