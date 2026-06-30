// Superadmin · MEMORÁNDUM — el reporte grado-institucional auto-generado de una colonia.
// Ensambla lo que ya existe (entity_atlas + explorador.oportunidades + lookalike) en una historia
// lista para comité: resumen, oferta, demanda, tensión, inversión/riesgo, comparables y recomendación.
// Cero dato inventado: TODO viene de la respuesta. Las cifras 's/d' (sin dato) se dejan tal cual (son honestas).
// Reusa el endpoint /memorandum (getMemorandum). NO crea motor nuevo.
import React, { useState, useCallback, useEffect } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getMemorandum } from '../../api/superadminDemandIntel';
import ColoniaPicker from './ColoniaPicker';

// ── tokens de tema oscuro (idénticos a ScreenerPanel) ───────────────────────
const card = { padding: '18px 22px' };
const muted = '#888';
const cream = 'var(--cream, #e8e6df)';
const theme = 'var(--theme, #6366f1)';

const btnStyle = {
  padding: '9px 20px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: theme, color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
};
const btnGhost = {
  padding: '7px 14px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
  background: 'rgba(255,255,255,0.05)', color: '#bbb', fontSize: 12, fontWeight: 600,
};

// Formatea un valor según su unidad (espejo del helper de ScreenerPanel). 's/d' y strings pasan intactos.
function fmtVal(v, unidad) {
  if (v == null) return '—';
  if (typeof v !== 'number') return String(v); // deja 's/d' tal cual
  const u = unidad || '';
  if (u === '$/m²') return `$${Math.round(v / 1000)}k/m²`;
  if (u === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString('es-MX')}`;
  if (u === '%') return `${Number.isInteger(v) ? v : +v.toFixed(1)}%`;
  if (u === 'x') return `${+v.toFixed(2)}x`;
  if (u === 'idx') return `${+v.toFixed(2)}`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return Number.isInteger(v) ? v.toLocaleString('es-MX') : (+v.toFixed(1)).toLocaleString('es-MX');
}

// ── Fuente al pie de cada sección (chico, gris) ─────────────────────────────
function Fuente({ children }) {
  if (!children) return null;
  return (
    <div style={{ marginTop: 12, fontSize: 11, color: muted, fontStyle: 'italic', letterSpacing: 0.2 }}>
      Fuente: {children}
    </div>
  );
}

// ── Mini-tarjeta de un dato (medida → valor + unidad) ───────────────────────
function DatoCard({ d }) {
  const medida = d?.medida || d?.label || d?.id || '—';
  const unidad = d?.unidad || '';
  const valTxt = fmtVal(d?.valor, unidad);
  const showUnidad = unidad && typeof d?.valor === 'number' && !['$/m²', 'MXN', '%', 'x', 'idx'].includes(unidad);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 11, padding: '11px 14px', minWidth: 130, flex: '1 1 130px',
    }}>
      <div style={{ fontSize: 10.5, color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
        {medida}
      </div>
      <div style={{ fontSize: 19, color: cream, fontWeight: 800, lineHeight: 1.1 }}>
        {valTxt}{showUnidad ? <span style={{ fontSize: 12, color: '#9a9a9a', fontWeight: 600 }}> {unidad}</span> : null}
      </div>
      {d?.n != null && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>n={d.n}</div>
      )}
    </div>
  );
}

// ── Una sección del memorándum ──────────────────────────────────────────────
function Seccion({ seccion, index, destacada }) {
  if (!seccion) return null;
  const { titulo, texto, fuente, datos, lista } = seccion;
  return (
    <Card
      style={{
        ...card,
        position: 'relative',
        ...(destacada
          ? {
              borderLeft: `3px solid ${theme}`,
              background: 'linear-gradient(180deg, rgba(99,102,241,0.06), rgba(255,255,255,0.02))',
              boxShadow: '0 8px 28px -16px rgba(99,102,241,0.55)',
            }
          : {}),
      }}
    >
      {/* encabezado de sección: número + título (+ badge "el so-what" si destacada) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: texto || datos || lista ? 12 : 0, flexWrap: 'wrap' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: destacada ? theme : 'rgba(255,255,255,0.06)',
          color: destacada ? '#fff' : '#aaa',
          fontSize: 12.5, fontWeight: 800,
        }}>
          {index}
        </span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: cream, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          {titulo}
        </h3>
        {destacada && <Badge tone="brand">el so-what</Badge>}
      </div>

      {/* párrafo legible */}
      {texto && (
        <p style={{ margin: 0, fontSize: 13.5, color: '#c8c6bf', lineHeight: 1.62 }}>{texto}</p>
      )}

      {/* mini-tarjetas de datos */}
      {Array.isArray(datos) && datos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: texto ? 14 : 0 }}>
          {datos.map((d, i) => <DatoCard key={d?.id || i} d={d} />)}
        </div>
      )}

      {/* lista de viñetas */}
      {Array.isArray(lista) && lista.length > 0 && (
        <ul style={{ margin: texto || datos ? '14px 0 0' : 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {lista.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: '#c0bdb6', lineHeight: 1.55 }}>
              <span style={{ color: theme, flexShrink: 0, fontWeight: 800, marginTop: 1 }}>›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <Fuente>{fuente}</Fuente>
    </Card>
  );
}

export default function MemorandumPanel({ zona = '', onZona } = {}) {
  // colonia local = el contexto compartido como semilla; el usuario puede cambiarla con el picker.
  const [colonia, setColonia] = useState(zona || '');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const generar = useCallback((q) => {
    const term = (q != null ? q : colonia).trim();
    if (!term) { setErr('Elige una colonia.'); return; }
    setLoading(true); setErr(null);
    getMemorandum({ colonia: term })
      .then((d) => setData(d))
      .catch((e) => { setData(null); setErr(e.message || 'No se pudo generar el memorándum.'); })
      .finally(() => setLoading(false));
  }, [colonia]);

  // Adopta la zona compartida si cambia desde afuera (otra tab eligió colonia).
  useEffect(() => {
    if (zona && zona !== colonia) setColonia(zona);
  }, [zona]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si entramos con una zona heredada y aún no se ha generado nada, auto-carga su memorándum.
  useEffect(() => {
    if (zona && !data && !loading && !err) generar(zona);
  }, [zona]); // eslint-disable-line react-hooks/exhaustive-deps

  // El usuario eligió en el picker → actualiza estado local + propaga al contexto compartido.
  const onPick = (id) => {
    setColonia(id);
    if (onZona) onZona(id);
  };

  const secciones = Array.isArray(data?.secciones) ? data.secciones : [];
  const isReco = (s) => (s?.titulo || '').toLowerCase().startsWith('recomend');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* ── BUSCADOR ──────────────────────────────────────────────────────── */}
      <Card className="memo-no-print" style={{ ...card, borderLeft: `3px solid ${theme}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#eee', marginBottom: 6 }}>
          Memorándum de colonia
        </div>
        <div style={{ fontSize: 12.5, color: '#aaa', lineHeight: 1.55, marginBottom: 14 }}>
          Un reporte grado-institucional, listo para comité, ensamblado de dato real — cada sección con su fuente.
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); generar(); }}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <ColoniaPicker
            value={colonia}
            onChange={onPick}
            placeholder="Elige una colonia"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="submit" style={btnStyle} disabled={loading}>
            {loading ? 'Generando…' : 'Generar memorándum'}
          </button>
        </form>
      </Card>

      {/* ── ERROR ─────────────────────────────────────────────────────────── */}
      {err && (
        <Card style={{ ...card, borderLeft: '3px solid #dc2626', color: '#f3b4b4', fontSize: 13 }}>
          {err}
        </Card>
      )}

      {/* ── VACÍO (sin búsqueda aún) ──────────────────────────────────────── */}
      {!data && !err && !loading && (
        <Card style={{ ...card, textAlign: 'center', color: muted, fontSize: 13, padding: '40px 22px' }}>
          Elige una colonia y genera su memorándum institucional.
        </Card>
      )}

      {/* ── LOADING ───────────────────────────────────────────────────────── */}
      {loading && !data && (
        <Card style={{ ...card, textAlign: 'center', color: '#aaa', fontSize: 13, padding: '40px 22px' }}>
          Ensamblando el memorándum…
        </Card>
      )}

      {/* ── REPORTE ───────────────────────────────────────────────────────── */}
      {data && (
        <div id="memo-report" style={{ display: 'grid', gap: 16 }}>
          {/* Encabezado de reporte */}
          <Card style={{ ...card, padding: '26px 26px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Badge tone="brand">grado institucional</Badge>
                <h1 style={{ margin: '12px 0 8px', fontSize: 30, fontWeight: 800, color: cream, letterSpacing: '-0.02em', lineHeight: 1.08 }}>
                  {data.nombre || data.colonia || 'Memorándum'}
                </h1>
                {data.lectura && (
                  <p style={{ margin: 0, fontSize: 13.5, color: '#aba9a2', lineHeight: 1.55, maxWidth: 640 }}>
                    {data.lectura}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                style={btnGhost}
                className="memo-no-print"
                title="Imprimir o guardar como PDF"
              >
                Imprimir / PDF
              </button>
            </div>
          </Card>

          {/* Secciones, en el orden que devuelve el backend */}
          {secciones.map((s, i) => (
            <Seccion key={i} seccion={s} index={i + 1} destacada={isReco(s)} />
          ))}

          {/* Pie del reporte: de qué se generó + nota */}
          <Card style={{ ...card, padding: '16px 22px', background: 'rgba(255,255,255,0.015)' }}>
            {Array.isArray(data.generado_de) && data.generado_de.length > 0 && (
              <div style={{ fontSize: 11.5, color: '#9a9a9a' }}>
                Ensamblado de:{' '}
                <span style={{ color: '#bbb', fontWeight: 600 }}>{data.generado_de.join(', ')}</span>
              </div>
            )}
            {data.nota && (
              <div style={{ fontSize: 11, color: muted, marginTop: 7, fontStyle: 'italic', lineHeight: 1.5 }}>
                {data.nota}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Al imprimir: oculta los controles, deja solo el reporte */}
      <style>{`@media print { .memo-no-print { display: none !important; } }`}</style>
    </div>
  );
}
