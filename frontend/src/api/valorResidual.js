// F1.2 · Motor de Valor Residual del Terreno — API client (dev)
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

export const getCategorias = () => j('/api/dev/valor-residual/categorias');

export const buscarColonias = (q = '', city = 'CDMX') => {
  const qs = new URLSearchParams({ city, limit: '40' });
  if (q && q.trim()) qs.set('q', q.trim());
  return j(`/api/dev/valor-residual/colonias?${qs.toString()}`);
};

export const calcularResidual = (body) =>
  j('/api/dev/valor-residual/calcular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
