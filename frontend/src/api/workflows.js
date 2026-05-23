// W6.AS.1 · Workflow Builder Visual · API wrappers
// 8 endpoints: list/create/get/update/delete/toggle/test/runs
const BASE = process.env.REACT_APP_BACKEND_URL || '';

function _authHeaders() {
  const token =
    localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function _handle(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listWorkflows() {
  const res = await fetch(`${BASE}/api/workflows`, {
    headers: _authHeaders(),
    credentials: 'include',
  });
  return _handle(res);
}

export async function createWorkflow(payload) {
  const res = await fetch(`${BASE}/api/workflows`, {
    method: 'POST',
    headers: _authHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return _handle(res);
}

export async function getWorkflow(id) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}`,
    { headers: _authHeaders(), credentials: 'include' },
  );
  return _handle(res);
}

export async function updateWorkflow(id, payload) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: _authHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    },
  );
  return _handle(res);
}

export async function deleteWorkflow(id) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: _authHeaders(),
      credentials: 'include',
    },
  );
  return _handle(res);
}

export async function toggleWorkflow(id) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}/toggle`,
    {
      method: 'POST',
      headers: _authHeaders(),
      credentials: 'include',
    },
  );
  return _handle(res);
}

export async function testWorkflow(id, payload = {}) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}/test`,
    {
      method: 'POST',
      headers: _authHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    },
  );
  return _handle(res);
}

export async function listWorkflowRuns(id, days = 30) {
  const res = await fetch(
    `${BASE}/api/workflows/${encodeURIComponent(id)}/runs?days=${days}`,
    { headers: _authHeaders(), credentials: 'include' },
  );
  return _handle(res);
}
