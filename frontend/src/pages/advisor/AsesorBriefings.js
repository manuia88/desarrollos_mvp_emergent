// /asesor/briefings — listado de briefings IE del asesor (Phase C · Chunk 3).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import * as api from '../../api/briefings';
import BriefingIEModal from '../../components/advisor/BriefingIEModal';
import { Sparkle } from '../../components/icons';

const fmt = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function FeedbackBadge({ fb }) {
  if (!fb?.result) return <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>—</span>;
  const tone = fb.result === 'closed_lead'
    ? { bg: 'rgba(34,197,94,0.14)', fg: '#86efac', label: 'Cerrado' }
    : fb.result === 'partial'
    ? { bg: 'rgba(245,158,11,0.14)', fg: '#fcd34d', label: 'Parcial' }
    : { bg: 'rgba(239,68,68,0.10)', fg: '#fca5a5', label: 'No cerró' };
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 9999,
      background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}33`,
      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>{tone.label}</span>
  );
}

export default function AsesorBriefings({ user, onLogout }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [openDoc, setOpenDoc] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(await api.listBriefings(onlyMine));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyMine]);

  return (
    <AdvisorLayout user={user} onLogout={onLogout} active="briefings">
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkle size={10} /> BRIEFING IE · HISTÓRICO
            </div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', margin: '4px 0 2px', letterSpacing: '-0.02em' }}>
              Tus briefings generados
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: 0 }}>
              {docs.length} briefings · cache 24h por dev + lead
            </p>
          </div>
          {user?.role && user.role !== 'advisor' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
              <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />
              Solo míos
            </label>
          )}
        </div>

        {err && <div style={{ padding: 12, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5 }}>{err}</div>}

        <div style={{ background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <table data-testid="briefings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', textAlign: 'left' }}>
                {['Proyecto', 'Colonia', 'Generado', 'Usado', 'Resultado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600, color: 'var(--cream-3)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && !loading && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)' }}>
                  Aún no has generado briefings. Abre cualquier ficha desde una búsqueda o contacto para empezar.
                </td></tr>
              )}
              {docs.map(d => (
                <tr key={d.id} data-testid={`briefing-row-${d.id}`} style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', fontWeight: 500 }}>{d.development_name || d.development_id}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>{d.development_colonia || '—'}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{fmt(d.generated_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {d.used ? <span style={{ padding: '2px 10px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sí</span>
                       : <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>no</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}><FeedbackBadge fb={d.feedback} /></td>
                  <td style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                    <button onClick={() => setOpenDoc(d)} data-testid="briefing-reopen" style={{
                      padding: '5px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.34)',
                      color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>Ver</button>
                    <Link to={`/desarrollo/${d.development_id}${d.lead_id ? `?lead=${d.lead_id}` : ''}`} style={{
                      padding: '5px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, textDecoration: 'none',
                    }}>Ficha →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openDoc && (
        <BriefingIEModal
          open={!!openDoc}
          development={{ id: openDoc.development_id, name: openDoc.development_name }}
          leadId={openDoc.lead_id}
          contactId={openDoc.contact_id}
          onClose={() => { setOpenDoc(null); load(); }}
        />
      )}
    </AdvisorLayout>
  );
}
