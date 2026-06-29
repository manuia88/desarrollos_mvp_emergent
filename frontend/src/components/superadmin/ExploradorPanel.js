// Superadmin · EXPLORADOR (árbol) — abres un nodo (ciudad ▸ alcaldía ▸ colonia ▸ desarrollo ▸ unidad) y ves
// TODOS sus datos, CADA SEGMENTO INDEPENDIENTE (2rec es un dato, 3rec es otro), nunca un blob. Navegar = clic
// (abrir carpetas). Lo dominante: el GAP coloreado (verde = oportunidad / ámbar = sobreoferta). Cero dato inventado.
import React, { useEffect, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getExplorar } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };

const TIPO_LABEL = {
  ciudad: 'Ciudad', alcaldia: 'Alcaldía', colonia: 'Colonia', desarrollo: 'Desarrollo', unidad: 'Unidad',
};

const fmtN = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const fmtMX = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('es-MX')}`);

// estado del dato (registro canónico): real=verde · derivado=azul · latente=gris · por_crear=gris
function estadoTone(estado) {
  if (estado === 'real') return 'ok';
  if (estado === 'derivado') return 'brand';
  return 'neutral';
}
function estadoColor(estado) {
  if (estado === 'real') return '#1FA06A';
  if (estado === 'derivado') return '#6D4AFF';
  return '#888';
}

export default function ExploradorPanel() {
  const [nodo, setNodo] = useState({ tipo: 'ciudad', id: 'CDMX' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    getExplorar({ tipo: nodo.tipo, id: nodo.id, combinaciones: true })
      .then((d) => { if (alive) { if (d?.error) setError(d.error); setData(d); } })
      .catch((e) => { if (alive) { setError(e.message); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [nodo.tipo, nodo.id]);

  const go = (tipo, id) => { if (tipo && id != null) { setData(null); setError(null); setNodo({ tipo, id }); } };

  const ruta = data?.ruta || [{ tipo: 'ciudad', id: 'CDMX', nombre: 'CDMX' }];
  const actual = data?.nodo || { tipo: nodo.tipo, id: nodo.id, nombre: nodo.id };
  const hijos = data?.hijos || [];
  const segmentos = data?.segmentos || [];
  const combinaciones = data?.combinaciones || [];
  const caracteristicas = data?.caracteristicas || [];
  const r = data?.resumen || {};

  // resumen legible — solo piezas con dato (>0)
  const resumenPartes = [];
  if (r.hijos != null) resumenPartes.push(`${r.hijos} ${r.hijos === 1 ? 'hijo' : 'hijos'}`);
  if (r.datos_independientes != null) resumenPartes.push(`${r.datos_independientes} datos independientes`);
  if (r.fichas_tecnicas) resumenPartes.push(`${r.fichas_tecnicas} fichas técnicas`);

  return (
    <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
      {/* ── ENCABEZADO: breadcrumb + nodo actual + resumen ── */}
      <Card style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          {ruta.map((c, i) => (
            <React.Fragment key={`${c.tipo}:${c.id}:${i}`}>
              {i > 0 && <span style={{ color: '#555' }}>/</span>}
              <button onClick={() => go(c.tipo, c.id)}
                style={{ padding: '3px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: i === ruta.length - 1 ? 'var(--theme, #6366f1)' : 'transparent',
                  color: i === ruta.length - 1 ? '#fff' : '#bbb', fontWeight: i === ruta.length - 1 ? 700 : 500 }}>
                {c.nombre || c.id}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--cream, #eee)', letterSpacing: '-0.02em' }}>{actual.nombre || actual.id}</span>
            <Badge tone="neutral">{TIPO_LABEL[actual.tipo] || actual.tipo}</Badge>
          </div>
          {resumenPartes.length > 0 && <span style={{ fontSize: 12.5, color: '#aaa' }}>{resumenPartes.join(' · ')}</span>}
        </div>

        {data?.lectura && <div style={{ fontSize: 11.5, color: '#777', marginTop: 8, fontStyle: 'italic', lineHeight: 1.4 }}>{data.lectura}</div>}

        {actual.id != null && actual.tipo !== 'ciudad' && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => go('ciudad', 'CDMX')}
              style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              ↑ Volver a la cima (CDMX)
            </button>
          </div>
        )}
      </Card>

      {loading && <Card style={card}>Abriendo el nodo…</Card>}
      {error && <Card style={{ ...card, color: '#dc2626' }}>{error}</Card>}

      {data && !error && (
        <>
          {/* ── BAJAR A: los hijos (abrir = clic) ── */}
          {hijos.length > 0 && (
            <Card style={card}>
              <div style={lbl}>Bajar a · {hijos.length} {hijos.length === 1 ? 'nodo' : 'nodos'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {hijos.map((c) => (
                  <button key={`${c.tipo}:${c.id}`} onClick={() => go(c.tipo, c.id)}
                    style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#ddd',
                      display: 'flex', flexDirection: 'column', gap: 3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--theme, #6366f1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || c.id}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>
                      {c.tipo === 'unidad'
                        ? [c.precio != null ? fmtMX(c.precio) : null, c.m2 != null ? `${c.m2} m²` : null, c.recamaras != null ? `${c.recamaras} rec` : null, c.status]
                            .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)
                        : [c.n_unidades != null ? `${fmtN(c.n_unidades)} unidades` : null, c.n_devs != null ? `${c.n_devs} desarrollos` : null, c.desarrollador]
                            .filter(Boolean).join(' · ') || (TIPO_LABEL[c.tipo] || c.tipo)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ── SEGMENTOS: cada item es un dato INDEPENDIENTE — el gap es lo dominante ── */}
          {segmentos.map((g) => <SegmentoGrupo key={g.dimension} g={g} />)}

          {/* ── FICHAS TÉCNICAS (combinaciones) ── */}
          {combinaciones.length > 0 && <FichasTecnicas fichas={combinaciones} />}

          {/* ── CARACTERÍSTICAS (nivel unidad) ── */}
          {caracteristicas.length > 0 && <Caracteristicas items={caracteristicas} />}

          {/* vacío total */}
          {hijos.length === 0 && segmentos.length === 0 && combinaciones.length === 0 && caracteristicas.length === 0 && (
            <Card style={card}><span style={{ fontSize: 12.5, color: '#888' }}>Este nodo aún no tiene datos para mostrar.</span></Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Un grupo de segmentos (una dimensión) — cada item en su PROPIA fila, nunca se juntan valores ──
function SegmentoGrupo({ g }) {
  const items = g.items || [];
  if (items.length === 0) return null;
  const tone = estadoTone(g.estado);
  // escala de la mini-barra: el mayor entre oferta y demanda de todo el grupo
  const max = Math.max(1, ...items.flatMap((it) => [it.oferta || 0, it.demanda || 0]));
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={lbl}>{g.label}</div>
        <Badge tone={tone}>{g.estado}</Badge>
      </div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 10 }}>
        {items.length} {items.length === 1 ? 'dato independiente' : 'datos independientes'} — cada fila se lee sola
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {/* encabezado de columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1.4fr) 64px 64px minmax(150px, 1fr) minmax(170px, 1.2fr)', gap: 10, alignItems: 'center', fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: 0.4, paddingBottom: 2 }}>
          <span>Segmento</span>
          <span style={{ textAlign: 'right' }}>Oferta</span>
          <span style={{ textAlign: 'right' }}>Demanda</span>
          <span></span>
          <span>Gap</span>
        </div>
        {items.map((it, i) => <SegmentoFila key={`${it.segmento}:${i}`} it={it} max={max} />)}
      </div>
    </Card>
  );
}

// Una fila = UN dato independiente (su propia caja, su propio gap coloreado).
function SegmentoFila({ it, max }) {
  const oferta = it.oferta || 0;
  const demanda = it.demanda || 0;
  const gap = it.gap != null ? it.gap : (demanda - oferta);
  // gap>0 = falta oferta → oportunidad (verde) · gap<0 = sobra oferta (ámbar) · 0 = equilibrio (gris)
  const gapColor = gap > 0 ? '#1FA06A' : gap < 0 ? '#f59e0b' : '#888';
  const gapTexto = gap > 0 ? `falta ${fmtN(gap)} — oportunidad` : gap < 0 ? `sobra ${fmtN(-gap)} — sobreoferta` : 'en equilibrio';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(120px, 1.4fr) 64px 64px minmax(150px, 1fr) minmax(170px, 1.2fr)',
      gap: 10, alignItems: 'center', fontSize: 12.5,
      padding: '7px 10px', borderRadius: 9,
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
      borderLeft: `3px solid ${gapColor}`,
    }}>
      <span style={{ color: '#ddd', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(it.segmento)}</span>
      <span style={{ textAlign: 'right', color: '#22c55e', fontWeight: 700 }}>{fmtN(oferta)}</span>
      <span style={{ textAlign: 'right', color: '#a78bfa', fontWeight: 700 }}>{fmtN(demanda)}</span>
      {/* mini-barra: oferta (verde) vs demanda (morado) lado a lado */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#22c55e', opacity: 0.85, width: `${(oferta / max) * 100}%`, minWidth: oferta > 0 ? 2 : 0 }} />
        <div style={{ height: 6, borderRadius: 3, background: '#a78bfa', opacity: 0.85, width: `${(demanda / max) * 100}%`, minWidth: demanda > 0 ? 2 : 0 }} />
      </div>
      <span style={{ color: gapColor, fontWeight: 700, fontSize: 12 }}>{gapTexto}</span>
    </div>
  );
}

// ── FICHAS TÉCNICAS — cada combinación = un dato (barra por n) ──
function FichasTecnicas({ fichas }) {
  const max = Math.max(1, ...fichas.map((f) => f.n || 0));
  return (
    <Card style={card}>
      <div style={lbl}>Fichas técnicas · cada combinación = un dato</div>
      <div style={{ fontSize: 11, color: '#777', marginBottom: 10 }}>{fichas.length} combinaciones distintas (rec · baños · cajón · m² · extras)</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {fichas.map((f, i) => (
          <div key={`${f.ficha}:${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 48px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.ficha}</span>
            <div style={{ height: 8, borderRadius: 3, background: 'var(--theme, #6366f1)', opacity: 0.7, width: `${(f.n / max) * 100}%`, minWidth: 2 }} />
            <strong style={{ textAlign: 'right', color: 'var(--theme, #6366f1)' }}>{fmtN(f.n)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── CARACTERÍSTICAS (nivel unidad) — tabla simple característica → valor ──
function Caracteristicas({ items }) {
  return (
    <Card style={card}>
      <div style={lbl}>Características de la unidad · cada una un dato</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 18px' }}>
        {items.map((c, i) => (
          <div key={`${c.caracteristica}:${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ color: '#888' }}>{c.caracteristica}</span>
            <strong style={{ color: '#ddd', textAlign: 'right' }}>{String(c.valor)}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
