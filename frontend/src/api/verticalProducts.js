/** W3.6 — Vertical Data Products client (white-label widgets + superadmin). */
const API = process.env.REACT_APP_BACKEND_URL;

const j = (r) => {
  if (!r.ok) return r.json().then((b) => Promise.reject(b)).catch(() => Promise.reject({ status: r.status }));
  return r.json();
};

/** Public widget call — uses Bearer API key from URL param.
 *  Returns the JSON output (tier-filtered server-side). */
export async function callVertical(vertical, body, apiKey) {
  return fetch(`${API}/api/v1/verticals/${vertical}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body || {}),
  }).then(j);
}

export const callBankAvm        = (b, k) => callVertical('bank-avm', b, k);
export const callInsuranceRisk  = (b, k) => callVertical('insurance-risk', b, k);
export const callNotariaTitle   = (b, k) => callVertical('notaria-title-check', b, k);
export const callInvestorYield  = (b, k) => callVertical('investor-yield', b, k);
