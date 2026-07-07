// Gemelo de Demanda — el "SimCity de la demanda de MX" (moonshot brújula). Modelo vivo, consultable, por zona:
// qué se pide · cuánto · qué hay de oferta · qué falta · oportunidad. Reusa /demand-twin (4 señales ya existentes).
import React, { useEffect, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getDemandTwin } from '../../api/superadminFounderConsole';
import { TrendingUp } from 'lucide-react';

const HEAD = "'Outfit',sans-serif";
const SANS = 'DM Sans, sans-serif';
const tc = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n) => (n ? (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString('es-MX')}`) : '—');

const COLS = [
  { k: 'oportunidad', label: 'Oportunidad' },
  { k: 'demanda_total', label: 'Demanda' },
  { k: 'oferta_devs', label: 'Oferta' },
];

export default function SuperadminGemeloDemanda({ user, onLogout, embedded }) {
  const [rows, setRows] = useState(null);
  const [sort, setSort] = useState('oportunidad');
  useEffect(() => { getDemandTwin(80).then((d) => setRows(d.zonas || [])).catch(() => setRows([])); }, []);
  const sorted = rows ? [...rows].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)) : null;

  const th = { fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.5)', textAlign: 'left', padding: '0 8px' };
  const grid = '1.2fr 90px 1.1fr 0.9fr 1.6fr 1.8fr';

  return (
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
      <div data-testid="gemelo-demanda">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <TrendingUp size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Gemelo de Demanda</h1>
        </div>
        <p style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(240,235,224,0.7)', margin: '0 0 18px', maxWidth: 760, lineHeight: 1.5 }}>
          El modelo vivo de la demanda habitacional de MX, por zona: <b>qué</b> se pide, <b>cuánto</b>, qué hay de oferta y qué <b>falta</b>.
          La <b>oportunidad</b> = mucha demanda · poca oferta · con hueco = dónde conviene construir. Dato que ningún portal del mercado tiene.
        </p>

        {!sorted ? (
          <div style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(240,235,224,0.6)', padding: 24 }}>Cargando el modelo de demanda…</div>
        ) : sorted.length === 0 ? (
          <div style={{ fontFamily: SANS, fontSize: 13, color: 'rgba(240,235,224,0.6)', padding: 24 }}>Aún sin demanda suficiente para modelar. Se llena conforme entra actividad.</div>
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={th}>Colonia</span>
              {COLS.map((c) => (
                <button key={c.k} onClick={() => setSort(c.k)} style={{ ...th, cursor: 'pointer', border: 'none', background: 'none', color: sort === c.k ? 'var(--theme)' : 'rgba(240,235,224,0.5)' }}>{c.label}{sort === c.k ? ' ↓' : ''}</button>
              ))}
              <span style={th}>Lo que piden</span>
              <span style={th}>Falta (hueco)</span>
            </div>
            {sorted.map((z, i) => (
              <div key={z.colonia} data-testid={`twin-${z.colonia}`} style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '11px 16px', alignItems: 'center', borderBottom: i < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: 'var(--cream)' }}>{tc(z.colonia)}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, color: 'var(--theme, #6D4AFF)' }}>{z.oportunidad}</span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{z.demanda_total} <span style={{ color: 'rgba(240,235,224,0.45)', fontSize: 11 }}>· {z.demanda_busquedas} búsq · {z.compradores} compr</span></span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{z.oferta_devs} dev{z.oferta_devs === 1 ? '' : 's'}{z.oferta_precio_desde ? <span style={{ color: 'rgba(240,235,224,0.45)', fontSize: 11 }}> · desde {money(z.oferta_precio_desde)}</span> : ''}</span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: 'var(--cream-2)' }}>{[z.spec.recamaras ? `${z.spec.recamaras} rec` : '', z.spec.precio_max_prom ? money(z.spec.precio_max_prom) : '', z.spec.m2 ? `${z.spec.m2}m²` : ''].filter(Boolean).join(' · ') || '—'}</span>
                <span style={{ fontFamily: SANS, fontSize: 12.5, color: (z.falta || []).length ? '#E0A33E' : 'rgba(240,235,224,0.4)', fontWeight: (z.falta || []).length ? 600 : 400 }}>{(z.falta || []).join(' · ') || 'oferta cubre'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
