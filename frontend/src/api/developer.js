// Developer portal API helpers
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const patch = (url, body) => j(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const getDashboard = () => j('/api/desarrollador/dashboard');
export const listInventory = (devId) => j(`/api/desarrollador/inventario${devId ? `?dev_id=${devId}` : ''}`);
export const patchUnitStatus = (b) => patch('/api/desarrollador/inventario/unit-status', b);
export const getDemand = () => j('/api/desarrollador/demanda');
export const generateReport = (month) => post(`/api/desarrollador/reportes/generar${month ? `?month=${month}` : ''}`);
export const listReports = () => j('/api/desarrollador/reportes');
export const listPricing = () => j('/api/desarrollador/pricing/suggestions');
export const actPricing = (id, body) => patch(`/api/desarrollador/pricing/suggestions/${id}`, body);
export const getCompetitors = (devId, radius) => {
  const qs = new URLSearchParams({ ...(devId ? { dev_id: devId } : {}), ...(radius ? { radius_km: radius } : {}) }).toString();
  return j(`/api/desarrollador/competidores?${qs}`);
};
export const ackCompetitor = (b) => post('/api/desarrollador/competidores/alert-ack', b);
export const getAudit = () => j('/api/desarrollador/audit');
