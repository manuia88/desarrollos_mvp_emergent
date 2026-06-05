/**
 * sistemaConstructivoUI — selector de sistema constructivo + sello de confianza.
 * Presentacional sobre estado local (ficha AvanceObraTab ↔ wizard StepSistema, sin duplicar · B1.5).
 */
import React from 'react';

/** Rejilla de categorías (cimentación/estructura): editable o solo-lectura. */
export function SistemaPicker({ catalog, value, onPick, readOnly }) {
  const cats = catalog || {};
  const catKeys = Object.keys(cats);
  if (!catKeys.length) return null;
  const cur = value || {};
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
      {catKeys.map(cat => {
        const sel = cur[cat];
        const selOpt = cats[cat].options.find(o => o.value === sel);
        return (
          <div key={cat}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme)', marginBottom: 8 }}>{cats[cat].label}</div>
            {!readOnly ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cats[cat].options.map(o => {
                  const on = sel === o.value;
                  return (
                    <button key={o.value} type="button" data-testid={`sistema-${cat}-${o.value}`} onClick={() => onPick(cat, o.value)}
                      style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${on ? 'var(--theme)' : 'var(--border)'}`,
                        background: on ? 'rgba(var(--theme-rgb),0.06)' : '#fff' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: on ? 'var(--cream)' : 'var(--cream-2)' }}>{o.label}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--cream-3)', marginTop: 2, lineHeight: 1.3 }}>{o.hint}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="dmx-card" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px' }}>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Outfit', color: selOpt ? 'var(--cream)' : 'var(--cream-3)' }}>{selOpt?.label || 'No especificado'}</div>
                {selOpt?.hint && <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 3 }}>{selOpt.hint}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Sello de confianza que verá el comprador (lo genera el backend; aquí solo se muestra). */
export function SelloConfianza({ sello }) {
  if (!sello || !sello.configured) return null;
  return (
    <div className="dmx-card" data-testid="sello-confianza" style={{ background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.06), rgba(198,63,174,0.04))', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 15 }}>🛡️</span>
        <b style={{ fontSize: 12.5, color: 'var(--cream)' }}>{sello.titulo || 'Construcción con respaldo'}</b>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cream-3)' }}>· así lo verá el comprador</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>{sello.descripcion}</p>
      {(sello.badges || []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
          {sello.badges.map((b, i) => (
            <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.09)', padding: '3px 9px', borderRadius: 999 }}>
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
