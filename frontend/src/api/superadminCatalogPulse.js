// api/superadminCatalogPulse.js — Pulso del catálogo (B3.2)
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchCatalogPulse() {
  const r = await fetch(`${API}/api/superadmin/catalog-pulse/dashboard`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar el pulso del catálogo');
  return r.json();
}

// Ficha completa (vista de dios) de un proyecto: comprador + interno + operación.
export async function fetchCatalogProject(projectId) {
  const r = await fetch(`${API}/api/superadmin/catalog-pulse/project/${projectId}`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo cargar la ficha del proyecto');
  return r.json();
}

export const ASSET_BASE = API;
