// B2.1 · Lo que el desarrollador configuró, en lenguaje del comprador.
// Servicios + Sistema constructivo (sello de respaldo) + Sello legal de confianza.
// Fail-open: si no hay `config`, no renderiza nada (la ficha queda igual).
import React from 'react';

// ─── Etiquetas en lenguaje de persona normal ──────────────────────────────────
// Llaves alineadas al catálogo real del dev (B1.1): gas/agua/energia/agua_caliente/drenaje/internet/cisterna.
const SERVICE_META = {
  gas: { icon: '🔥', label: 'Gas', values: { natural: 'Natural (de red)', lp: 'LP', estacionario: 'Estacionario (tanque)', mixto: 'Mixto' } },
  agua: { icon: '💧', label: 'Agua', values: { red: 'De la red municipal', pozo: 'Pozo propio', ambos: 'Red + pozo', mixta: 'Red + pozo' } },
  energia: { icon: '⚡', label: 'Luz', values: { cfe: 'CFE', paneles: 'Paneles solares', hibrido: 'CFE + paneles', subterranea: 'Cableado subterráneo', planta: 'Con planta de emergencia' } },
  agua_caliente: { icon: '♨️', label: 'Agua caliente', values: { boiler: 'Boiler', solar: 'Calentador solar', instantaneo: 'Calentador instantáneo' } },
  drenaje: { icon: '🚿', label: 'Drenaje', values: { municipal: 'Municipal', planta: 'Planta de tratamiento', fosa: 'Fosa séptica' } },
  internet: { icon: '🛜', label: 'Internet', values: { fibra: 'Fibra óptica', cable: 'Cable', preinstalado: 'Preinstalado' } },
  cisterna: { icon: '🪣', label: 'Cisterna', values: {} },
};
const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Card({ children, accent }) {
  return (
    <div style={{
      background: accent || 'rgba(var(--cream-rgb),0.03)',
      border: '1px solid var(--border)', borderRadius: 16, padding: '22px 24px',
    }}>{children}</div>
  );
}
function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0, letterSpacing: '-0.01em' }}>{children}</h3>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginTop: 4, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

// ─── Servicios ────────────────────────────────────────────────────────────────
function Servicios({ servicios }) {
  const entries = Object.entries(servicios || {}).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <Card>
      <SectionTitle sub="Lo que ya está resuelto en el edificio.">Servicios de la casa</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {entries.map(([k, v]) => {
          const meta = SERVICE_META[k] || { icon: '•', label: humanize(k), values: {} };
          const valLabel = meta.values[v] || humanize(v);
          return (
            <div key={k} data-testid={`servicio-${k}`} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(var(--cream-rgb),0.03)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{meta.icon}</span>
              <div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{meta.label}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{valLabel}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Construcción con respaldo (sistema_constructivo + sello_constructivo) ─────
const SISTEMA_LABEL = {
  cajon: 'Cimentación de cajón', losa: 'Losa de cimentación', pilotes: 'Pilotes', zapatas: 'Zapatas',
  concreto: 'Estructura de concreto armado', acero: 'Estructura de acero', mixta: 'Estructura mixta',
};
function Construccion({ sistema, sello }) {
  const cfg = sello && sello.configured;
  const sis = sistema || {};
  const hasSistema = sis.cimentacion || sis.estructura;
  if (!cfg && !hasSistema) return null;
  const badges = (cfg && sello.badges) ? sello.badges : [
    sis.cimentacion && { label: 'Cimentación', value: sis.cimentacion },
    sis.estructura && { label: 'Estructura', value: sis.estructura },
  ].filter(Boolean);
  return (
    <Card accent="linear-gradient(180deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>🛡️</span>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>
          {cfg && sello.titulo ? sello.titulo : 'Construcción con respaldo'}
        </h3>
      </div>
      {cfg && sello.descripcion && (
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 16px' }}>{sello.descripcion}</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {badges.map((b, i) => (
          <div key={i} data-testid={`construccion-badge-${i}`} style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            padding: '10px 16px', borderRadius: 12,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.28)',
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b.label}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
              {SISTEMA_LABEL[b.value] || humanize(b.value)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Sello legal de confianza ──────────────────────────────────────────────────
const TIER_TONE = {
  green: { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.30)', text: '#86efac', icon: '✅' },
  gold: { bg: 'rgba(250,204,21,0.08)', border: 'rgba(250,204,21,0.30)', text: '#fde68a', icon: '🏅' },
  gray: { bg: 'rgba(var(--cream-rgb),0.03)', border: 'var(--border)', text: 'var(--cream-3)', icon: '📄' },
};
function SelloLegal({ sello }) {
  if (!sello) return null;
  const tone = TIER_TONE[sello.tier] || TIER_TONE.gray;
  const configured = sello.configured;
  return (
    <Card accent={`linear-gradient(180deg, ${tone.bg}, transparent)`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>{tone.icon}</span>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>
          {sello.titulo || (configured ? 'Documentación legal verificada' : 'Documentación pendiente')}
        </h3>
      </div>
      <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: '0 0 14px' }}>
        {sello.descripcion || (configured
          ? 'El desarrollador cargó documentos legales que nuestro equipo revisa.'
          : 'Aún no se cargan documentos legales para este desarrollo.')}
      </p>
      {configured && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div data-testid="legal-docs-count">
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: tone.text }}>{sello.docs ?? 0}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>documentos cargados</div>
          </div>
          <div data-testid="legal-verificados-count">
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: tone.text }}>{sello.verificados ?? 0}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>revisados por DMX</div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────
export default function DevConfigSections({ config }) {
  if (!config) return null; // fail-open: dev no configuró nada
  const hasServicios = config.servicios && Object.values(config.servicios).some(Boolean);
  const hasConstruccion = (config.sello_constructivo && config.sello_constructivo.configured) ||
    (config.sistema_constructivo && (config.sistema_constructivo.cimentacion || config.sistema_constructivo.estructura));
  const hasLegal = !!config.sello_legal;
  if (!hasServicios && !hasConstruccion && !hasLegal) return null;
  return (
    <div data-testid="dev-config-sections" style={{ display: 'grid', gap: 18, marginTop: 20 }}>
      {hasServicios && <Servicios servicios={config.servicios} />}
      {hasConstruccion && <Construccion sistema={config.sistema_constructivo} sello={config.sello_constructivo} />}
      {hasLegal && <SelloLegal sello={config.sello_legal} />}
    </div>
  );
}
