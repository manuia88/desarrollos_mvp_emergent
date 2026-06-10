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

export const dueDiligence = (body) =>
  j('/api/dev/valor-residual/due-diligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

export const detectarNorma3 = (body) =>
  j('/api/dev/valor-residual/norma3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

// F1.5 · una sola llamada: veredicto + las 3 herramientas sintetizadas.
export const analizarLote = (body) =>
  j('/api/dev/valor-residual/analizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

// F2.2 · Generador de Producto ("qué construir" calibrado por la demanda real del Grafo)
export const getGeneradorProducto = ({ terreno_m2, colonia_id, categoria }) => {
  const qs = new URLSearchParams({ terreno_m2: String(terreno_m2 || 0) });
  if (colonia_id) qs.set('colonia_id', colonia_id);
  if (categoria) qs.set('categoria', categoria);
  return j(`/api/dev/generador-producto?${qs.toString()}`);
};
