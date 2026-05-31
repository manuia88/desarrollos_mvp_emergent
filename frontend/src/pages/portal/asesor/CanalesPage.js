// Conectar canales · /portal/asesor/canales
// Omnicanal · el asesor ve qué canales están conectados y solicita activar los demás.
// Cuando un canal está conectado, Atlax puede responder ahí en automático (o el asesor toma el control).
import React, { useCallback, useEffect, useState } from 'react';
import PortalLayout from '../../../components/shared/PortalLayout';
import { FaWhatsapp, FaFacebookMessenger, FaInstagram, FaLinkedinIn, FaTiktok, FaYoutube, FaRobot } from 'react-icons/fa6';

const API = process.env.REACT_APP_BACKEND_URL || '';

function authHeaders() {
  const tk = localStorage.getItem('dmx_token') || localStorage.getItem('token');
  return tk ? { Authorization: `Bearer ${tk}` } : {};
}

const LOGO = {
  whatsapp: FaWhatsapp, messenger: FaFacebookMessenger, instagram: FaInstagram,
  linkedin: FaLinkedinIn, tiktok: FaTiktok, youtube: FaYoutube, ai: FaRobot,
};
const ACCENT = {
  whatsapp: '#25D366', messenger: '#0084FF', instagram: '#E1306C', linkedin: '#0A66C2',
  tiktok: '#010101', youtube: '#FF0000', ai: '#5B37E0',
};
const DESC = {
  whatsapp: 'Mensajes directos de WhatsApp Business',
  messenger: 'Mensajes de tu página de Facebook',
  instagram: 'DMs y respuestas de Instagram',
  linkedin: 'Mensajes de LinkedIn',
  tiktok: 'Mensajes y comentarios de TikTok',
  youtube: 'Comentarios y mensajes de YouTube',
  ai: 'El asistente que atiende a tus clientes en las landings',
};

function ChannelLogo({ ch, size = 20 }) {
  const Ico = LOGO[ch] || FaRobot;
  return <Ico size={size} color={ACCENT[ch] || 'var(--cream-2)'} />;
}

function StatusBadge({ state }) {
  const map = {
    connected: { t: 'Conectado', c: '#1FA06A', bg: 'rgba(31,160,106,0.12)' },
    requested: { t: 'Solicitado', c: '#E2982E', bg: 'rgba(226,152,46,0.12)' },
    off: { t: 'Sin conectar', c: 'var(--cream-3)', bg: 'var(--surface-2)' },
  };
  const s = map[state] || map.off;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, color: s.c, background: s.bg, letterSpacing: '0.02em' }}>
      {state === 'connected' ? '● ' : ''}{s.t}
    </span>
  );
}

function CanalesBody() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [justAsked, setJustAsked] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/asesor/channels`, { headers: authHeaders(), credentials: 'include' });
      if (r.ok) { const d = await r.json(); setChannels(Array.isArray(d.channels) ? d.channels : []); }
    } catch { /* no-op */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = useCallback(async (key) => {
    setBusy(key);
    try {
      const r = await fetch(`${API}/api/asesor/channels/${key}/connect-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include', body: JSON.stringify({}),
      });
      if (r.ok) { setJustAsked(key); await load(); }
    } catch { /* no-op */ } finally { setBusy(null); }
  }, [load]);

  const dm = channels.filter((c) => c.dm);
  const atlax = channels.find((c) => c.key === 'ai');
  const connectedCount = dm.filter((c) => c.connected).length;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '26px 20px 60px' }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0 }}>Conectar canales</h1>
        <p style={{ fontSize: 13.5, color: 'var(--cream-3)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Vincula tus canales para recibir todo en una sola Bandeja. Al conectar uno, <b style={{ color: 'var(--cream-2)' }}>Atlax</b> puede contestar ahí en automático — o tú tomas el control cuando quieras.
        </p>
      </div>

      {/* Resumen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '16px 0 18px', padding: '11px 14px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(109,74,255,0.08), rgba(255,92,168,0.05))', border: '1px solid rgba(109,74,255,0.18)' }}>
        <FaRobot size={16} color="#5B37E0" />
        <span style={{ fontSize: 12.5, color: 'var(--cream-2)' }}>
          {loading ? 'Cargando canales…' : `${connectedCount} de ${dm.length} canales conectados`} · el resto se activa al vincular tu cuenta.
        </span>
      </div>

      {/* Canales de mensajería */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dm.map((c) => {
          const state = c.connected ? 'connected' : c.requested ? 'requested' : 'off';
          const asked = c.requested || justAsked === c.key;
          return (
            <div key={c.key} style={{ borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px' }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0 }}>
                  <ChannelLogo ch={c.key} size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{c.label}</span>
                    <StatusBadge state={state} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{DESC[c.key] || ''}</div>
                </div>
                {c.connected ? (
                  <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: '#1FA06A' }}>✓ Listo</span>
                ) : asked ? (
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#E2982E' }}>Te avisamos</span>
                ) : (
                  <button type="button" onClick={() => connect(c.key)} disabled={busy === c.key}
                    style={{ flexShrink: 0, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: busy === c.key ? 'default' : 'pointer',
                      background: busy === c.key ? 'var(--surface-2)' : 'linear-gradient(135deg,#6D4AFF,#FF5CA8)', color: busy === c.key ? 'var(--cream-3)' : '#fff',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, fontWeight: 800, boxShadow: busy === c.key ? 'none' : '0 6px 16px rgba(109,74,255,0.28)' }}>
                    {busy === c.key ? '…' : 'Conectar'}
                  </button>
                )}
              </div>
              {asked && !c.connected && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'rgba(226,152,46,0.06)', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                  Solicitud registrada. En cuanto vinculemos {c.label} a tu cuenta, los mensajes entrarán a tu Bandeja y podrás activar a Atlax para que responda solo.
                </div>
              )}
            </div>
          );
        })}
        {!loading && dm.length === 0 && (
          <div style={{ padding: '30px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12 }}>
            No se pudieron cargar los canales.
          </div>
        )}
      </div>

      {/* Atlax · siempre disponible */}
      {atlax && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cream-3)', margin: '22px 0 9px' }}>Asistente</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(91,55,224,0.10)', border: '1px solid rgba(91,55,224,0.25)', flexShrink: 0 }}>
              <FaRobot size={22} color="#5B37E0" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>Atlax</span>
                <StatusBadge state="connected" />
              </div>
              <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>{DESC.ai}</div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: '#1FA06A' }}>✓ Listo</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function CanalesPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <CanalesBody />
    </PortalLayout>
  );
}
