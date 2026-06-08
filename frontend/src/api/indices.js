// Índices DMX (I04) — API client
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include' });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};

// Superadmin · terminal de los 5 índices por colonia
export const listIndices = ({ tier, limit } = {}) => {
  const qs = new URLSearchParams();
  if (tier) qs.set('tier', tier);
  if (limit) qs.set('limit', String(limit));
  const q = qs.toString();
  return j(`/api/superadmin/indices${q ? `?${q}` : ''}`);
};

// Público (tier-gated) · índices de una zona
export const getZoneIndices = (zoneId) => j(`/api/indices/zona/${encodeURIComponent(zoneId)}`);

// Superadmin · cobertura de colonias por ciudad
export const getColoniasCoverage = () => j('/api/superadmin/colonias/coverage');

// Superadmin · cargar el catálogo oficial de colonias de una ciudad (EX.1)
export const ingestColonias = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/ingest?city=${encodeURIComponent(city)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · calcular scores REALES por colonia desde el dato (EX.2)
export const computeColoniasScores = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/compute-scores?city=${encodeURIComponent(city)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · sincronizar densidad real de comercios por colonia + recalcular (cierra ciclo dato→score)
// source: 'osm' (gratis, default) | 'denue' (respaldo)
export const syncComercios = async (city = 'CDMX', source = 'osm') => {
  const r = await fetch(`${API}/api/superadmin/colonias/sync-comercios?city=${encodeURIComponent(city)}&source=${encodeURIComponent(source)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · sincronizar seguridad real por colonia (FGJ) + recalcular (cierra ciclo dato→score)
export const syncSeguridad = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/sync-seguridad?city=${encodeURIComponent(city)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · llenar un lote de colonias (comercios + seguridad + scores). El cron sigue solo.
export const fillChunk = async (city = 'CDMX', chunk = 40) => {
  const r = await fetch(`${API}/api/superadmin/colonias/fill-chunk?city=${encodeURIComponent(city)}&chunk=${chunk}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · valor catastral OFICIAL del suelo ($/m²) por colonia desde el WFS de la SIG CDMX.
export const syncCatastro = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/sync-catastro?city=${encodeURIComponent(city)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · recalibra el modelo del valor del suelo al valor comercial (ING.2 · aprende de ventas reales).
export const recalibrarComercial = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/recalibrate-comercial?city=${encodeURIComponent(city)}`, {
    method: 'POST', credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · estado del modelo suelo→comercial (coeficientes, fiabilidad, muestras).
export const getCalibracionComercial = async (city = 'CDMX') => {
  const r = await fetch(`${API}/api/superadmin/colonias/calibracion-comercial?city=${encodeURIComponent(city)}`, {
    credentials: 'include',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · plusvalía oficial SHF por alcaldía (5 propias + promedio CDMX).
export const getShf = async () => {
  const r = await fetch(`${API}/api/superadmin/shf`, { credentials: 'include' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};

// Superadmin · refresca SHF desde el XLSX oficial (trimestral · snapshot + serie por alcaldía).
export const refreshShf = async () => {
  const r = await fetch(`${API}/api/superadmin/shf/refresh`, { method: 'POST', credentials: 'include' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  return body;
};
