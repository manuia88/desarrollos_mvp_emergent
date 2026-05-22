// W5.x F5 frontend · Reverse Search API wrapper
const API = process.env.REACT_APP_BACKEND_URL;

export const postReverseSearch = async (body) => {
  const r = await fetch(`${API}/api/reverse-search`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw Object.assign(new Error(data.detail || r.statusText), { status: r.status, body: data });
  }
  return r.json();
};
