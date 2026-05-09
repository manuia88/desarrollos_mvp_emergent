// W3.8 — Cross-sell API (buyer-facing)
const API = process.env.REACT_APP_BACKEND_URL;

export async function getCrossSellOffers(property_id) {
  const params = property_id ? `?property_id=${encodeURIComponent(property_id)}` : '';
  const r = await fetch(`${API}/api/comprador/cross-sell/offers${params}`, {
    credentials: 'include',
  });
  if (!r.ok) return { offers: [], count: 0 };
  return r.json();
}

export async function clickOffer(offer_id) {
  const r = await fetch(`${API}/api/comprador/cross-sell/offers/${encodeURIComponent(offer_id)}/click`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error');
  return data;
}

export async function fillOffer(offer_id, formData) {
  const r = await fetch(`${API}/api/comprador/cross-sell/offers/${encodeURIComponent(offer_id)}/fill`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || 'Error al enviar solicitud');
  return data;
}

export async function getMyOffers() {
  const r = await fetch(`${API}/api/comprador/cross-sell/my-offers`, {
    credentials: 'include',
  });
  if (!r.ok) return { items: [], count: 0 };
  return r.json();
}
