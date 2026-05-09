// W4.2C — qrExport.js
// Download a QR code PNG for a given URL via the DMX backend.
const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Download a QR code PNG for the given URL.
 * @param {string} url     - URL to encode in the QR
 * @param {string} filename - download filename (default "dmx-qr.png")
 */
export async function downloadQrFor(url, filename = 'dmx-qr.png') {
  const endpoint = `${API}/api/exports/qr?url=${encodeURIComponent(url)}`;
  const r = await fetch(endpoint, { credentials: 'include' });
  if (!r.ok) throw new Error(`QR generation failed: HTTP ${r.status}`);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
