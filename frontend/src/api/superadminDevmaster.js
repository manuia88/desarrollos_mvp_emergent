// api/superadminDevmaster.js — Portal Dev-Master del superadmin
const API = process.env.REACT_APP_BACKEND_URL;
export const ASSET_BASE = API;

export async function fetchDevmasterProjects(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/projects${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el catálogo de desarrollos');
  return r.json();
}

export async function fetchDevmasterProject(projectId) {
  const r = await fetch(`${API}/api/superadmin/devmaster/project/${projectId}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar la ficha del desarrollo');
  return r.json();
}

export async function fetchDondeConstruir(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/donde-construir${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar dónde construir');
  return r.json();
}

export async function fetchGustoMercado(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/gusto-mercado${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el gusto del mercado');
  return r.json();
}

export async function fetchComportamiento(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/comportamiento${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el comportamiento del comprador');
  return r.json();
}

export async function fetchStockSoldout(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/stock-soldout${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar stock y sold-out');
  return r.json();
}

export async function fetchMacroCiudad(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/macro-ciudad${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar macro y ciudad');
  return r.json();
}

export async function fetchCompetenciaRed(filters = {}) {
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v != null && v !== '')).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/competencia-red${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar competencia y red');
  return r.json();
}

export async function fetchObservabilidadIA() {
  const r = await fetch(`${API}/api/superadmin/devmaster/observabilidad-ia`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar la observabilidad de la IA');
  return r.json();
}

export async function activarModelo(modelo) {
  const r = await fetch(`${API}/api/superadmin/devmaster/activar-modelo/${modelo}`, { method: 'POST', credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo activar el modelo');
  return r.json();
}

// Equipo en riesgo · asesores/usuarios que se enfrían (reusa el motor de churn). FAIL-OPEN en backend.
export async function fetchEquipoEnRiesgo(umbral = 50, limite = 50) {
  const qs = new URLSearchParams({ umbral, limite }).toString();
  const r = await fetch(`${API}/api/superadmin/devmaster/equipo-en-riesgo?${qs}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el equipo en riesgo');
  return r.json();
}
