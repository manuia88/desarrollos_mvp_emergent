// W4.1D — Comparable Alerts fetch helper
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchComparableAlerts(devId) {
  const r = await fetch(`${API}/api/comparable-alerts/dev/${encodeURIComponent(devId)}`, {
    credentials: 'include',
  });
  if (!r.ok) return { alerts: [] };
  return r.json();
}
