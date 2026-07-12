// W1.4 ZZ.1 — Bulk Ingest API
const API = process.env.REACT_APP_BACKEND_URL;

const h = () => ({
  'Content-Type': 'application/json',
});

async function _j(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); msg = d.detail || d.message || msg; } catch {}
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

const BASE = `${API}/api/superadmin/bulk-ingest`;

export async function startIngest(driveFolderUrl, targetDevOrgId) {
  return _j(await fetch(`${BASE}/start`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ drive_folder_url: driveFolderUrl, target_dev_org_id: targetDevOrgId || null }),
  }));
}

export async function listJobs(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return _j(await fetch(`${BASE}/jobs?${qs.toString()}`, { headers: h(), credentials: 'include' }));
}

export async function getJob(jobId) {
  return _j(await fetch(`${BASE}/jobs/${jobId}`, { headers: h(), credentials: 'include' }));
}

export async function listJobItems(jobId, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, v); });
  return _j(await fetch(`${BASE}/jobs/${jobId}/items?${qs.toString()}`, { headers: h(), credentials: 'include' }));
}

export async function approveItem(itemId) {
  return _j(await fetch(`${BASE}/items/${itemId}/approve`, { method: 'POST', headers: h(), credentials: 'include' }));
}

export async function rejectItem(itemId, reason) {
  return _j(await fetch(`${BASE}/items/${itemId}/reject`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify({ reason }),
  }));
}

export async function mergeItem(itemId, targetDevId) {
  return _j(await fetch(`${BASE}/items/${itemId}/merge`, {
    method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify({ target_dev_id: targetDevId }),
  }));
}

export async function bulkApproveJob(jobId, threshold = 0.65) {
  return _j(await fetch(`${BASE}/jobs/${jobId}/bulk-approve?threshold=${threshold}`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function getStats() {
  return _j(await fetch(`${BASE}/stats`, { headers: h(), credentials: 'include' }));
}

// W1.5 — Inline edit / Diff / Recompute / Force-match
export async function patchItem(itemId, patch) {
  return _j(await fetch(`${BASE}/items/${itemId}`, {
    method: 'PATCH', headers: h(), credentials: 'include',
    body: JSON.stringify({ patch }),
  }));
}

export async function getItemDiff(itemId, targetDevId) {
  const qs = targetDevId ? `?target_dev_id=${encodeURIComponent(targetDevId)}` : '';
  return _j(await fetch(`${BASE}/items/${itemId}/diff${qs}`, {
    headers: h(), credentials: 'include',
  }));
}

export async function recomputeExtraction(itemId) {
  return _j(await fetch(`${BASE}/items/${itemId}/recompute-extraction`, {
    method: 'POST', headers: h(), credentials: 'include',
  }));
}

export async function forceMatch(itemId, targetDevId, mode = 'merge') {
  return _j(await fetch(`${BASE}/items/${itemId}/force-match`, {
    method: 'POST', headers: h(), credentials: 'include',
    body: JSON.stringify({ target_dev_id: targetDevId, mode }),
  }));
}
