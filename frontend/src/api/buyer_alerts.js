/**
 * api/buyer_alerts.js — Phase 4 Batch 29
 * Helpers para Alertas del Comprador.
 */
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchAlerts() {
  const r = await fetch(`${API}/api/comprador/alerts`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar alertas');
  return r.json();
}

export async function createAlert({ type, channel, conditions, frequency }) {
  const r = await fetch(`${API}/api/comprador/alerts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, channel, conditions, frequency }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al crear alerta');
  }
  return r.json();
}

export async function updateAlert(alertId, updates) {
  const r = await fetch(`${API}/api/comprador/alerts/${alertId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al actualizar alerta');
  }
  return r.json();
}

export async function deleteAlert(alertId) {
  const r = await fetch(`${API}/api/comprador/alerts/${alertId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al eliminar alerta');
  return r.json();
}

export async function fetchDeliveries(limit = 50) {
  const r = await fetch(`${API}/api/comprador/alerts/deliveries?limit=${limit}`, {
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al cargar historial');
  return r.json();
}
