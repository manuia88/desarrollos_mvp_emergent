import React, { useState } from 'react';
import { Card, Badge } from '../advisor/primitives';

// HALLAZGO VIEW — presenta los datos como una historia legible, no como un sudoku.
// Estructura: título → "Lo más importante" (resumen ejecutivo) → tarjetas pregunta→respuesta con
// contexto (quién/dónde/proyectos), comparativo, acción sugerida, fuente y glosario.
// Pensado para que alguien que no sabe del tema lo entienda de inmediato.

const SENAL = {
  falta: { c: '#22c55e', t: 'Oportunidad', emoji: '🟢' },
  sobra: { c: '#f59e0b', t: 'Sobreoferta', emoji: '🟡' },
  parejo: { c: '#888', t: 'Equilibrado', emoji: '⚪' },
  info: { c: '#60a5fa', t: '', emoji: '🔵' },
};

const fmtVal = (v, u) => {
  if (v == null) return '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(' · ');
  if (typeof v === 'string') return v;
  if (u === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`;
  if (u === '%') return `${v}%`;
  return typeof v === 'number' ? v.toLocaleString('es-MX') : String(v);
};

function Chip({ icon, children }) {
  if (!children) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#bbb',
      background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 9999 }}>
      <span style={{ opacity: 0.8 }}>{icon}</span>{children}
    </span>
  );
}

function HallazgoCard({ h }) {
  const [fuente, setFuente] = useState(false);
  const s = SENAL[h.señal] || SENAL.info;
  const quien = h.quien ? `${h.quien.invertir}% invertir · ${h.quien.vivir}% vivir` : null;
  return (
    <Card style={{ padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 9, opacity: h.latente ? 0.7 : 1,
      borderLeft: `3px solid ${s.c}` }}>
      {/* pregunta */}
      <div style={{ fontSize: 12, color: '#9aa', fontWeight: 600 }}>{h.pregunta || h.nombre}</div>
      {/* RESPUESTA grande (la frase) */}
      <div style={{ fontSize: 15, lineHeight: 1.45, color: '#f0f0f2' }}>{h.respuesta || fmtVal(h.valor, h.unidad)}</div>
      {/* semáforo + comparativo */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!h.latente && s.t && <Badge tone={h.señal === 'falta' ? 'ok' : h.señal === 'sobra' ? 'warn' : 'neutral'}>{s.emoji} {s.t}</Badge>}
        {h.comparativo?.texto && h.comparativo.vs_ciudad != null && (
          <span style={{ fontSize: 12, color: h.comparativo.señal === 'alta' ? '#22c55e' : h.comparativo.señal === 'baja' ? '#f59e0b' : '#888', fontWeight: 600 }}>
            {h.comparativo.texto}
          </span>
        )}
      </div>
      {/* contexto: quién / dónde / proyectos */}
      {!h.latente && (quien || (h.donde && h.donde.length) || (h.desarrollos && h.desarrollos.length)) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip icon="👤">{quien}</Chip>
          <Chip icon="📍">{h.donde && h.donde.length ? h.donde.slice(0, 3).join(', ') : null}</Chip>
          <Chip icon="🏢">{h.desarrollos && h.desarrollos.length ? h.desarrollos.slice(0, 3).join(', ') : null}</Chip>
        </div>
      )}
      {/* acción sugerida (el "¿qué hago con esto?") */}
      {h.accion && <div style={{ fontSize: 12.5, color: s.c, fontWeight: 600 }}>{h.accion}</div>}
      {/* pie: qué es + fuente */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#777',
        borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
        <span style={{ flex: 1, marginRight: 8 }}>{h.uso}</span>
        <button onClick={() => setFuente((v) => !v)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', textDecoration: 'underline' }}>
          {fuente ? 'ocultar' : 'de dónde sale'}
        </button>
      </div>
      {fuente && <div style={{ fontSize: 10.5, color: '#999', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: 5 }}>
        Fuente: {h.fuente} · {h.n != null ? `${h.n} datos` : ''} {h.confianza ? `· confianza ${h.confianza}` : ''}
      </div>}
    </Card>
  );
}

export default function HallazgoView({ data, busqueda = '' }) {
  const [verGlosario, setVerGlosario] = useState(false);
  if (!data) return null;
  const q = busqueda.trim().toLowerCase();
  const items = (data.indicadores || []).filter((h) => !q ||
    (h.nombre + ' ' + (h.pregunta || '') + ' ' + (h.respuesta || '')).toLowerCase().includes(q));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* título */}
      {data.titulo && <div style={{ fontSize: 17, fontWeight: 700 }}>{data.titulo}</div>}

      {/* LO MÁS IMPORTANTE (resumen ejecutivo) */}
      {data.resumen && data.resumen.length > 0 && !q && (
        <Card style={{ padding: '14px 18px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--theme,#818cf8)', marginBottom: 8, letterSpacing: 0.3 }}>LO MÁS IMPORTANTE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.resumen.map((r, i) => {
              const s = SENAL[r.señal] || SENAL.info;
              return (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ marginRight: 6 }}>{s.emoji}</span>{r.frase}
                  {r.accion && <span style={{ color: s.c, fontWeight: 600 }}> {r.accion}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* tarjetas de hallazgos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        {items.map((h, i) => <HallazgoCard key={(h.nombre || '') + i} h={h} />)}
      </div>
      {items.length === 0 && <Card style={{ padding: 16, color: '#888' }}>Sin resultados para “{busqueda}”.</Card>}

      {/* glosario */}
      {data.glosario && Object.keys(data.glosario).length > 0 && (
        <div>
          <button onClick={() => setVerGlosario((v) => !v)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#aaa', cursor: 'pointer', fontSize: 12, padding: '6px 12px', borderRadius: 8 }}>
            {verGlosario ? 'Ocultar' : '📖 Glosario'} — ¿qué significa cada término?
          </button>
          {verGlosario && (
            <Card style={{ padding: '12px 16px', marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: '6px 18px' }}>
              {Object.entries(data.glosario).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12 }}><strong style={{ color: '#ccc' }}>{k}:</strong> <span style={{ color: '#999' }}>{v}</span></div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
