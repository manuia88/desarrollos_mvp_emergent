// W5.3 Parte 2A Sub-B — Forecast accuracy API helpers (superadmin).
const API = process.env.REACT_APP_BACKEND_URL;

function authHeaders() {
  const t = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const init = () => ({ credentials: 'include', headers: authHeaders() });

export async function fetchForecastAccuracySummary() {
  const r = await fetch(`${API}/api/superadmin/forecast-accuracy/summary`, init());
  if (!r.ok) throw new Error(`fa_summary_${r.status}`);
  return r.json();
}

export async function fetchForecastAccuracyPerZone(horizon = 12, limit = 50) {
  const r = await fetch(`${API}/api/superadmin/forecast-accuracy/per-zone?horizon=${horizon}&limit=${limit}`, init());
  if (!r.ok) throw new Error(`fa_perzone_${r.status}`);
  return r.json();
}

export async function triggerForecastBacktest() {
  const r = await fetch(`${API}/api/superadmin/forecast-accuracy/run-backtest`, {
    method: 'POST', credentials: 'include', headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`fa_backtest_${r.status}`);
  return r.json();
}
