// W4.4D — What-if Simulator API client
const API = process.env.REACT_APP_BACKEND_URL;

async function _fetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function simulate({ project_id, scenario_type, inputs }) {
  return _fetch(`${API}/api/whatif/simulate`, {
    method: 'POST',
    body: JSON.stringify({ project_id, scenario_type, inputs }),
  });
}

export async function listScenarios({ project_id, scenario_type, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (project_id) params.set('project_id', project_id);
  if (scenario_type) params.set('scenario_type', scenario_type);
  if (limit) params.set('limit', String(limit));
  return _fetch(`${API}/api/whatif/scenarios?${params.toString()}`);
}

export async function getScenario(scenario_id) {
  return _fetch(`${API}/api/whatif/scenarios/${scenario_id}`);
}

export async function deleteScenario(scenario_id) {
  return _fetch(`${API}/api/whatif/scenarios/${scenario_id}`, { method: 'DELETE' });
}
