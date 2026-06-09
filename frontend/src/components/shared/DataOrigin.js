/**
 * DataOrigin — F1.1 · Doctrina de Datos (componente compartido por los 4 portales).
 * Etiqueta el origen de cualquier número (dato/índice/cálculo/estimado/supuesto) + un
 * explicador "Cómo leemos los datos" que cualquier pantalla puede abrir.
 * Fuente única en backend: /api/doctrine (data_doctrine.py).
 */
import React, { useState, useEffect } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

// color canónico (backend) → estilo del badge
const COLOR = {
  verde: { bg: '#1FA06A', fg: '#fff' },
  azul:  { bg: '#6D4AFF', fg: '#fff' },
  ambar: { bg: '#C77F12', fg: '#fff' },
  gris:  { bg: 'rgba(148,163,184,0.18)', fg: '#cbd5e1' },
};

const LABELS = {
  dato: { label: 'Dato real', color: 'verde' },
  benchmark: { label: 'Índice oficial', color: 'verde' },
  calculo: { label: 'Cálculo', color: 'azul' },
  estimado: { label: 'Estimado', color: 'ambar' },
  supuesto: { label: 'Supuesto', color: 'gris' },
};

/** Badge de origen. `origen` ∈ dato|benchmark|calculo|estimado|supuesto. `fuente` opcional → tooltip. */
export function DataOrigin({ origen = 'supuesto', label, fuente, size = 'sm' }) {
  const meta = LABELS[origen] || LABELS.supuesto;
  const c = COLOR[meta.color] || COLOR.gris;
  const pad = size === 'sm' ? '3px 9px' : '4px 11px';
  const fs = size === 'sm' ? 10 : 11;
  return (
    <span
      title={fuente ? `${meta.label} · Fuente: ${fuente}` : meta.label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: pad, borderRadius: 9999,
        background: c.bg, color: c.fg, fontWeight: 800, fontSize: fs,
        textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
      }}
    >
      {label || meta.label}
    </span>
  );
}

/** Botón discreto "Cómo leemos los datos" + modal explicativo (carga /api/doctrine al abrir). */
export function DoctrineButton({ style }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
          border: '1px solid rgba(148,163,184,0.3)', borderRadius: 9999, padding: '5px 12px',
          color: '#94a3b8', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...style,
        }}
      >
        <span style={{ fontWeight: 800 }}>?</span> Cómo leemos los datos
      </button>
      {open && <DoctrineModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DoctrineModal({ onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/doctrine`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,6,23,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto',
          background: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 16,
          padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#f1f5f9' }}>
              {data?.titulo || 'Cómo leemos los datos'}
            </div>
            {data?.intro && (
              <div style={{ fontSize: 13.5, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>{data.intro}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#64748b', fontSize: 22,
            cursor: 'pointer', lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 13, marginTop: 16 }}>No se pudo cargar la guía.</div>}

        {data && (
          <>
            {/* Tipos de origen */}
            <div style={{ marginTop: 20 }}>
              <SectionTitle>Las etiquetas que verás</SectionTitle>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                {data.origenes.map(o => (
                  <div key={o.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, marginTop: 1 }}><DataOrigin origen={o.id} /></div>
                    <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.45 }}>{o.definicion}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7 reglas */}
            <div style={{ marginTop: 22 }}>
              <SectionTitle>Nuestras 7 reglas</SectionTitle>
              <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
                {data.reglas.map(r => (
                  <div key={r.n} style={{ display: 'flex', gap: 10 }}>
                    <span style={{
                      flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: 'rgba(109,74,255,0.18)',
                      color: '#a5b4fc', fontWeight: 800, fontSize: 11, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>{r.n}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{r.titulo}</div>
                      <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.45, marginTop: 1 }}>{r.texto}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Madurez */}
            {data.madurez && (
              <div style={{ marginTop: 22 }}>
                <SectionTitle>Qué tan maduro es cada motor</SectionTitle>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {data.madurez.map(m => (
                    <div key={m.id} style={{ fontSize: 12.5, color: '#cbd5e1' }}>
                      <b style={{ color: '#e2e8f0' }}>{m.label}:</b> {m.texto}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>{children}</div>
  );
}

export default DataOrigin;
