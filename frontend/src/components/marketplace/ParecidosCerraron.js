// Prueba social por CIERRES (el moat del flywheel): "compradores con tu perfil ya cerraron en estos desarrollos".
// Reusa /api/buyer/parecidos-cerraron (copiloto_closings). Null-safe: si no hay cierres parecidos, no renderiza nada.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { visitorId } from '../../lib/buyerSignal';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ParecidosCerraron() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/buyer/parecidos-cerraron?visitor_id=${encodeURIComponent(visitorId())}`)
      .then((r) => r.json()).then((d) => { if (alive) setItems(d?.parecidos_cerraron || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (!items || items.length === 0) return null;   // sin cierres parecidos → cero ruido

  return (
    <section data-testid="parecidos-cerraron" style={{ maxWidth: 1440, margin: '0 auto', padding: '8px 32px 0' }}>
      <div style={{ background: 'linear-gradient(120deg, rgba(16,185,129,0.06), rgba(99,102,241,0.05))', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }}>
        <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>
          Compradores como tú ya cerraron aquí
        </div>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 12 }}>
          Desarrollos donde personas con tu búsqueda (zona y presupuesto) sí compraron — no solo vieron.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.map((it) => (
            <Link key={it.dev_id} to={`/desarrollo/${it.dev_id}`} style={{ textDecoration: 'none' }}>
              <div className="dmx-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-card, #fff)' }}>
                <span style={{ fontSize: 18 }}>🤝</span>
                <div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{it.name || it.dev_id}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11.5, color: 'var(--cream-3)' }}>
                    {it.colonia ? `${it.colonia} · ` : ''}{it.cierres} {it.cierres === 1 ? 'cierre parecido' : 'cierres parecidos'}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
