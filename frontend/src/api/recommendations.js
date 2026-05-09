// W4.1C — Recommendations API helper
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchTopRecommendation() {
  try {
    const r = await fetch(`${API}/api/recommendations/top`, { credentials: 'include' });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}
