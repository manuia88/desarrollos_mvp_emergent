// W4.4E — Phase Y.1E · Asistente público API client
const API = process.env.REACT_APP_BACKEND_URL;

async function _fetch(url, opts = {}) {
  const res = await fetch(url, {
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

export async function startSession({ referral_source } = {}) {
  return _fetch(`${API}/api/asistente/sessions`, {
    method: 'POST',
    body: JSON.stringify({ referral_source: referral_source || null }),
  });
}

export async function sendMessage(session_token, message) {
  return _fetch(`${API}/api/asistente/sessions/${session_token}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function captureLead(session_token, { nombre, whatsapp, email, mensaje }) {
  return _fetch(`${API}/api/asistente/sessions/${session_token}/capture-lead`, {
    method: 'POST',
    body: JSON.stringify({ nombre, whatsapp, email, mensaje }),
  });
}
