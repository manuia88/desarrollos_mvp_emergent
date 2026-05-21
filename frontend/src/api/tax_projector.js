// W5.x F6 Sub-C · Tax Projector API helpers · fetch wrappers contra /api/tax
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const getIsrVendedor = (payload) => post('/api/tax/isr-vendedor', payload);
export const getIsaiComprador = (payload) => post('/api/tax/isai-comprador', payload);
export const getPredialProjection = (payload) => post('/api/tax/predial-projection', payload);
export const getClosingCost = (payload) => post('/api/tax/closing-cost-total', payload);

export const getFullScenario = (params) => {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return j(`/api/tax/full-scenario?${qs.toString()}`);
};
