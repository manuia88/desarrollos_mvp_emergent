import React, { useEffect, useState } from 'react';
import { Card, Badge, Empty } from '../advisor/primitives';

// HALLAZGO VIEW — presenta los datos como una historia legible, no como un sudoku.
// Estructura: título → "Lo más importante" (resumen ejecutivo) → tarjetas pregunta→respuesta con
// contexto (quién/dónde/proyectos), comparativo, acción sugerida, fuente y glosario.
// Pensado para que alguien que no sabe del tema lo entienda de inmediato.

// Cada señal lleva SIEMPRE su palabra (no sólo color/emoji): accesibilidad texto+color.
const SENAL = {
  falta: { c: '#22c55e', t: 'Oportunidad', emoji: '🟢' },
  sobra: { c: '#f59e0b', t: 'Sobreoferta', emoji: '🟡' },
  parejo: { c: '#a8a8b3', t: 'Equilibrado', emoji: '⚪' },
  info: { c: '#60a5fa', t: 'Dato', emoji: '🔵' },
};
const SENAL_TONE = { falta: 'ok', sobra: 'warn', parejo: 'neutral' };

// ── Skeleton de carga (pulso CSS, inyectado una vez, SSR-safe, dedup por id) ──
const SKELETON_STYLE_ID = 'hallazgoview-skeleton-keyframes';
function ensureSkeletonStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SKELETON_STYLE_ID;
  el.textContent = '@keyframes hvPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.85; } }';
  document.head.appendChild(el);
}
const skBlock = (w, h = 10, extra = {}) => ({
  width: w, height: h, borderRadius: 4,
  background: 'rgba(255,255,255,0.10)',
  animation: 'hvPulse 1.2s ease-in-out infinite',
  ...extra,
});
const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
};

// Tarjeta fantasma de un hallazgo (insinúa pregunta + frase + chips).
function SkeletonHallazgoCard() {
  return (
    <Card style={{ padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 9, borderLeft: '3px solid rgba(255,255,255,0.10)' }} aria-hidden="true">
      <div style={skBlock('45%', 10)} />
      <div style={skBlock('90%', 16)} />
      <div style={skBlock('70%', 16)} />
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <div style={skBlock(96, 20, { borderRadius: 9999 })} />
        <div style={skBlock(110, 20, { borderRadius: 9999 })} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={skBlock(120, 18, { borderRadius: 9999 })} />
        <div style={skBlock(140, 18, { borderRadius: 9999 })} />
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 2 }}>
        <div style={skBlock('55%', 9)} />
      </div>
    </Card>
  );
}

// Bloque de carga completo (resumen + grilla de tarjetas) con etiqueta accesible.
function HallazgoSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} role="status" aria-live="polite" aria-busy="true">
      <span style={SR_ONLY}>Cargando hallazgos…</span>
      <Card style={{ padding: '14px 18px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)' }} aria-hidden="true">
        <div style={skBlock(140, 11, { marginBottom: 12 })} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={skBlock('92%', 11)} />
          <div style={skBlock('78%', 11)} />
          <div style={skBlock('85%', 11)} />
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
        <SkeletonHallazgoCard />
        <SkeletonHallazgoCard />
        <SkeletonHallazgoCard />
        <SkeletonHallazgoCard />
      </div>
    </div>
  );
}

const fmtVal = (v, u) => {
  if (v == null) return '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(' · ');
  if (typeof v === 'string') return v;
  if (u === 'MXN') return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}k`;
  if (u === '%') return `${v}%`;
  return typeof v === 'number' ? v.toLocaleString('es-MX') : String(v);
};

function Chip({ icon, label, children }) {
  if (!children) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#c4c4cc',
      background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 9999 }}>
      {/* el icono es decorativo; la palabra ('label') da el significado sin depender del color */}
      <span aria-hidden="true" style={{ opacity: 0.8 }}>{icon}</span>
      {label && <span style={{ color: '#a8a8b3', fontWeight: 600 }}>{label}:</span>}
      {children}
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
      {/* semáforo + comparativo — ambos con PALABRA, no sólo color */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!h.latente && s.t && <Badge tone={SENAL_TONE[h.señal] || 'neutral'}>{s.emoji} {s.t}</Badge>}
        {h.comparativo?.texto && h.comparativo.vs_ciudad != null && (() => {
          // 'alta/baja vs ciudad' lleva su palabra explícita además del color.
          const cmpWord = h.comparativo.señal === 'alta' ? 'Alta' : h.comparativo.señal === 'baja' ? 'Baja' : 'Pareja';
          const cmpColor = h.comparativo.señal === 'alta' ? '#22c55e' : h.comparativo.señal === 'baja' ? '#f59e0b' : '#a8a8b3';
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: cmpColor, fontWeight: 600,
              background: 'rgba(255,255,255,0.05)', padding: '2px 9px', borderRadius: 9999 }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 10, fontWeight: 800 }}>{cmpWord}</span>
              <span style={{ color: '#c4c4cc', fontWeight: 500 }}>{h.comparativo.texto}</span>
            </span>
          );
        })()}
      </div>
      {/* contexto: quién / dónde / proyectos — cada chip nombra su categoría */}
      {!h.latente && (quien || (h.donde && h.donde.length) || (h.desarrollos && h.desarrollos.length)) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip icon="👤" label="Quién">{quien}</Chip>
          <Chip icon="📍" label="Dónde">{h.donde && h.donde.length ? h.donde.slice(0, 3).join(', ') : null}</Chip>
          <Chip icon="🏢" label="Proyectos">{h.desarrollos && h.desarrollos.length ? h.desarrollos.slice(0, 3).join(', ') : null}</Chip>
        </div>
      )}
      {/* acción sugerida (el "¿qué hago con esto?") */}
      {h.accion && <div style={{ fontSize: 12.5, color: s.c, fontWeight: 600 }}>{h.accion}</div>}
      {/* pie: qué es + fuente — el 'qué es' organiza, sube a gris legible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#a8a8b3',
        borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
        <span style={{ flex: 1, marginRight: 8 }}>{h.uso}</span>
        <button onClick={() => setFuente((v) => !v)} style={{ background: 'none', border: 'none', color: '#a8a8b3', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', textDecoration: 'underline' }}>
          {fuente ? 'ocultar' : 'de dónde sale'}
        </button>
      </div>
      {fuente && <div style={{ fontSize: 10.5, color: '#c4c4cc', background: 'rgba(255,255,255,0.03)', padding: '5px 8px', borderRadius: 5 }}>
        Fuente: {h.fuente} · {h.n != null ? `${h.n} datos` : ''} {h.confianza ? `· confianza ${h.confianza}` : ''}
      </div>}
    </Card>
  );
}

export default function HallazgoView({ data, busqueda = '', loading = false }) {
  const [verGlosario, setVerGlosario] = useState(false);
  useEffect(() => { ensureSkeletonStyle(); }, []);

  // El padre puede señalar carga (loading) o entregar data null mientras llega:
  // en ambos casos mostramos el esqueleto pulsante en vez de un hueco vacío.
  if (loading || !data) return <HallazgoSkeleton />;

  const q = busqueda.trim().toLowerCase();
  const indicadores = data.indicadores || [];
  const items = indicadores.filter((h) => !q ||
    (h.nombre + ' ' + (h.pregunta || '') + ' ' + (h.respuesta || '')).toLowerCase().includes(q));
  const glosario = data.glosario && Object.keys(data.glosario).length > 0 ? data.glosario : null;

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
                <div key={i} style={{ fontSize: 13, lineHeight: 1.45, display: 'flex', gap: 7, alignItems: 'baseline' }}>
                  {/* etiqueta de señal con PALABRA (no sólo emoji/color) */}
                  {s.t && (
                    <span aria-label={s.t} style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4,
                      color: s.c, border: `1px solid ${s.c}`, borderRadius: 9999, padding: '1px 7px', lineHeight: 1.6, opacity: 0.95 }}>
                      <span aria-hidden="true" style={{ marginRight: 3 }}>{s.emoji}</span>{s.t}
                    </span>
                  )}
                  <span>
                    {r.frase}
                    {r.accion && <span style={{ color: s.c, fontWeight: 600 }}> {r.accion}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* tarjetas de hallazgos */}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
          {items.map((h, i) => <HallazgoCard key={(h.nombre || '') + i} h={h} />)}
        </div>
      )}

      {/* estados vacíos — buscador sin resultados / sin indicadores */}
      {items.length === 0 && q && (
        <Empty
          title={`Sin resultados para “${busqueda}”`}
          sub="Prueba con otra palabra (una colonia, un atributo o un tipo de comprador), o borra la búsqueda para ver todos los hallazgos."
        />
      )}
      {items.length === 0 && !q && (
        <Empty
          title="Aún no hay hallazgos para mostrar"
          sub="Cuando haya suficientes señales de mercado, aquí aparecerán las preguntas con su respuesta, contexto y acción sugerida."
        />
      )}

      {/* glosario — sólo si hay términos (no rompe vacío) */}
      {glosario && (
        <div>
          <button
            onClick={() => setVerGlosario((v) => !v)}
            aria-expanded={verGlosario}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#c4c4cc', cursor: 'pointer', fontSize: 12, padding: '6px 12px', borderRadius: 8 }}
          >
            {verGlosario ? 'Ocultar' : '📖 Glosario'} — ¿qué significa cada término?
          </button>
          {verGlosario && (
            <Card style={{ padding: '12px 16px', marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))', gap: '6px 18px' }}>
              {Object.entries(glosario).map(([k, v]) => (
                <div key={k} style={{ fontSize: 12 }}><strong style={{ color: '#e6e6ec' }}>{k}:</strong> <span style={{ color: '#c4c4cc' }}>{v}</span></div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
