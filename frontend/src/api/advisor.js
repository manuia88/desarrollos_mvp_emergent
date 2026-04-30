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

// Contactos
export const listContactos = (q = {}) => {
  const qs = new URLSearchParams(Object.entries(q).filter(([_, v]) => v)).toString();
  return j(`/api/asesor/contactos?${qs}`);
};
export const createContacto = (b) => post('/api/asesor/contactos', b);
export const getContacto = (id) => j(`/api/asesor/contactos/${id}`);
export const patchContacto = (id, b) => patch(`/api/asesor/contactos/${id}`, b);
export const addTimelineEntry = (id, b) => post(`/api/asesor/contactos/${id}/timeline`, b);

// Búsquedas
export const listBusquedas = () => j('/api/asesor/busquedas');
export const createBusqueda = (b) => post('/api/asesor/busquedas', b);
export const moveBusqueda = (id, stage) => patch(`/api/asesor/busquedas/${id}/stage`, { stage });
export const registerVisit = (id) => post(`/api/asesor/busquedas/${id}/visit`);
export const registerOffer = (id) => post(`/api/asesor/busquedas/${id}/offer`);
export const getMatches = (id) => j(`/api/asesor/busquedas/${id}/matches`);

// Captaciones
export const listCaptaciones = () => j('/api/asesor/captaciones');
export const createCaptacion = (b) => post('/api/asesor/captaciones', b);
export const moveCaptacion = (id, stage, payload) => patch(`/api/asesor/captaciones/${id}/stage`, { stage, payload });
export const getCaptacion = (id) => j(`/api/asesor/captaciones/${id}`);

// Tareas
export const listTareas = (scope) => j(`/api/asesor/tareas${scope ? `?scope=${scope}` : ''}`);
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

// Briefing
export const generateBriefing = () => post('/api/asesor/briefing/daily');

// Leaderboard + perfil público
export const getLeaderboard = () => j('/api/asesor/leaderboard');
export const getPublicProfile = (slug) => j(`/api/asesor/perfil-publico/${slug}`);

// Dev convenience
export const seedDemo = () => post('/api/asesor/_seed-demo');
