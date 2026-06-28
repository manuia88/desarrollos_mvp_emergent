// AtlaxBackButton — "← Volver a Atlax" flotante. Aparece SOLO en una ficha abierta desde Atlax (?from=atlax) y
// regresa al buscador SIN perder el chat (AtlaxSurface restaura los mensajes desde sessionStorage). Montado global
// en App.js (como AtlaxApartado) para no tocar el componente pesado de la ficha. Tema claro explícito (vive fuera de
// LightScope). z-index por debajo del modal de vista rápida.
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkle } from '../icons';

export default function AtlaxBackButton() {
  const loc = useLocation();
  const nav = useNavigate();
  const params = new URLSearchParams(loc.search || '');
  const show = loc.pathname.startsWith('/desarrollo/') && params.get('from') === 'atlax';
  if (!show) return null;
  return (
    <button
      onClick={() => nav('/atlax')}
      style={{
        position: 'fixed', left: 18, bottom: 20, zIndex: 1500, display: 'inline-flex', alignItems: 'center', gap: 8,
        background: '#fff', color: '#1E2230', border: '1px solid #ECECEC', borderRadius: 999, padding: '11px 18px',
        fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 10px 30px rgba(99,102,241,0.22)',
      }}
    >
      <span style={{ color: '#6D4AFF', display: 'flex' }}><Sparkle size={16} /></span> ← Volver a Atlax
    </button>
  );
}
