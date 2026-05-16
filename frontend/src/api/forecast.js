// W5.3 Parte 1 Sub-C — API helper para forecast multi-horizonte.
const API = process.env.REACT_APP_BACKEND_URL;

export async function fetchZoneForecast(slug, horizons = '6,12,24') {
  const r = await fetch(`${API}/api/forecast-public/zone/${encodeURIComponent(slug)}?horizons=${encodeURIComponent(horizons)}`);
  if (!r.ok) {
    if (r.status === 404) {
      const body = await r.json().catch(() => ({}));
      const err = new Error('forecast_unavailable');
      err.reason = body.detail?.reason || body.reason || 'insufficient_history';
      err.code = 404;
      throw err;
    }
    throw new Error(`forecast_zone_${r.status}`);
  }
  return r.json();
}

export async function fetchPropertyForecast({ colonia, m2, recamaras, banos, antiguedadAnos, horizons = '6,12,24' }) {
  const params = new URLSearchParams({
    colonia,
    m2: String(m2),
    rec: String(recamaras),
    ban: String(banos),
    age: String(antiguedadAnos),
    horizons,
  });
  const r = await fetch(`${API}/api/forecast-public/property?${params}`);
  if (!r.ok) {
    if (r.status === 404) {
      const body = await r.json().catch(() => ({}));
      const err = new Error('forecast_unavailable');
      err.reason = body.detail?.reason || body.reason || 'insufficient_history';
      err.code = 404;
      throw err;
    }
    throw new Error(`forecast_property_${r.status}`);
  }
  return r.json();
}
