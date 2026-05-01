// /superadmin/documents — Phase 7.1 Document Intelligence
// Superadmin: pick development from list → see encrypted documents + upload + OCR preview.
import React, { useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import DocumentsList from '../../components/documents/DocumentsList';
import { FileText, Database } from '../../components/icons';

const API = process.env.REACT_APP_BACKEND_URL;

export default function DocumentsPage({ user, onLogout }) {
  const [developments, setDevelopments] = useState([]);
  const [activeDevId, setActiveDevId] = useState(null);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, byStatus: {}, byType: {} });

  useEffect(() => {
    fetch(`${API}/api/developments`).then(r => r.json()).then(d => {
      setDevelopments(d || []);
      if (d?.length && !activeDevId) setActiveDevId(d[0].id);
    });
    // global doc stats (filtered by tenant on backend)
    fetch(`${API}/api/superadmin/documents`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const docs = d.documents || [];
        const byStatus = {};
        const byType = {};
        docs.forEach(x => {
          byStatus[x.status] = (byStatus[x.status] || 0) + 1;
          byType[x.doc_type] = (byType[x.doc_type] || 0) + 1;
        });
        setStats({ total: docs.length, byStatus, byType });
      })
      .catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  const filtered = useMemo(() => {
    if (!search) return developments;
    const q = search.toLowerCase();
    return developments.filter(d =>
      d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)
    );
  }, [developments, search]);

  const activeDev = developments.find(d => d.id === activeDevId);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div>
        <div style={{ marginBottom: 22 }}>
          <div className="eyebrow">Moat #2 · Phase 7.1</div>
          <h1 data-testid="documents-h1" style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)',
            letterSpacing: '-0.028em', margin: '4px 0 6px',
          }}>
            Document Intelligence
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
            Repositorio cifrado de documentos legales y comerciales por desarrollo. Cada archivo se almacena con
            cifrado Fernet en disco y el texto OCR queda cifrado en Mongo. Pipeline base para extracción
            estructurada (7.2) y cross-checking (7.3).
          </p>
        </div>

        {/* Stats strip */}
        <div data-testid="documents-stats" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 22,
        }}>
          <Stat label="Documentos" value={stats.total} />
          <Stat label="OCR listos" value={stats.byStatus.ocr_done || 0} tone="ok" />
          <Stat label="En proceso" value={(stats.byStatus.pending || 0) + (stats.byStatus.ocr_running || 0)} tone="info" />
          <Stat label="Fallidos" value={stats.byStatus.ocr_failed || 0} tone="warn" />
          <Stat label="Tipos distintos" value={Object.keys(stats.byType).length} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18 }} className="docs-grid">
          {/* Sidebar: developments list */}
          <aside data-testid="docs-dev-sidebar" style={{
            background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14,
            padding: 12, height: 'fit-content', position: 'sticky', top: 20,
          }}>
            <div className="eyebrow" style={{ marginBottom: 8, padding: '0 4px' }}>Desarrollos</div>
            <input data-testid="docs-dev-search" type="search" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{
              width: '100%', padding: '8px 12px', marginBottom: 10,
              background: '#0A0D16', border: '1px solid var(--border)', color: 'var(--cream)',
              borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12,
            }} />
            <div style={{ maxHeight: 540, overflowY: 'auto' }}>
              {filtered.map(d => (
                <button key={d.id} data-testid={`docs-dev-${d.id}`} onClick={() => setActiveDevId(d.id)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 10px', borderRadius: 10, marginBottom: 2,
                  background: activeDevId === d.id ? 'rgba(99,102,241,0.14)' : 'transparent',
                  border: '1px solid', borderColor: activeDevId === d.id ? 'rgba(99,102,241,0.3)' : 'transparent',
                  color: activeDevId === d.id ? 'var(--cream)' : 'var(--cream-2)',
                  fontFamily: 'DM Sans', fontWeight: 500, fontSize: 12.5, cursor: 'pointer',
                }}>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2 }}>
                    {d.colonia_id} · {d.id}
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                  Sin resultados.
                </div>
              )}
            </div>
          </aside>

          {/* Main: documents table for active dev */}
          <main>
            {activeDev ? (
              <DocumentsList devId={activeDev.id} devName={activeDev.name} scope="superadmin" />
            ) : (
              <div style={{ padding: 60, textAlign: 'center', background: '#0D1118', border: '1px solid var(--border)', borderRadius: 14 }}>
                <FileText size={32} color="var(--cream-3)" />
                <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: 'var(--cream-2)', marginTop: 12 }}>
                  Selecciona un desarrollo a la izquierda
                </div>
              </div>
            )}
          </main>
        </div>

        <style>{`@media (max-width: 880px) { .docs-grid { grid-template-columns: 1fr !important; } .docs-grid > aside { position: relative !important; } }`}</style>
      </div>
    </SuperadminLayout>
  );
}

function Stat({ label, value, tone = 'neutral' }) {
  const tones = {
    neutral: { fg: 'var(--cream)', bg: '#0D1118' },
    ok:      { fg: '#86efac',      bg: 'rgba(34,197,94,0.06)' },
    info:    { fg: '#a5b4fc',      bg: 'rgba(99,102,241,0.06)' },
    warn:    { fg: '#fca5a5',      bg: 'rgba(239,68,68,0.06)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <div style={{
      padding: '14px 16px', background: t.bg, border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: t.fg, marginTop: 4, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );
}
