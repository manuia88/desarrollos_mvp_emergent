// Fase C · Loop 2 visible — "Cómo aprende tu pipeline".
// Cada cierre (ganado/perdido) alimenta al coach del Cerebro: resuelve las predicciones,
// re-afina los motores (close_probability) y se auto-califica honesto. Este panel surfacea
// ese aprendizaje en el CRM (reusa /api/cerebro/learning). Read-only · fail-open.
import React, { useEffect, useState } from 'react';
import { getCerebroLearning } from '../../api/cerebro';

export default function CrmLearningPanel() {
  const [d, setD] = useState(null);
  useEffect(() => { getCerebroLearning().then(setD).catch(() => setD({ lessons: [], retrains: [], calibration: [] })); }, []);
  if (!d) return null;
  const cal = (d.calibration || []).filter(c => c && c.label);
  const lessons = d.lessons || [];
  const retrains = d.retrains || [];
  const nada = cal.every(c => !c.n) && !lessons.length && !retrains.length;

  return (
    <div data-testid="crm-learning" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
        Cada lead que cierras (ganado o perdido) entrena al sistema: re-afina el % de cierre y se califica honesto. Aquí ves cómo va.
      </div>

      {/* Calibración honesta — ¿qué tan atinado va? */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>¿Qué tan atinado voy?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cal.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 700, fontFamily: 'DM Sans,sans-serif' }}>{c.label}</span>
              <span style={{ fontSize: 11, color: 'var(--cream-2)', textAlign: 'right', maxWidth: '70%' }}>{c.summary}{c.n ? ` · ${c.n} casos` : ''}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reentrenos disparados por cierres */}
      {retrains.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>Reentrené con tus cierres</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {retrains.slice(0, 4).map((r, i) => (
              <div key={i} style={{ fontSize: 11.5, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--ok, #1FA06A)', fontWeight: 700 }}>↻ {(r.engines || []).join(', ')}</span>
                {r.trigger ? ` · ${r.trigger}` : ''}{r.summary ? ` — ${r.summary}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lecciones humanas */}
      {lessons.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 6 }}>Lo que aprendí</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {lessons.slice(0, 3).map((l, i) => (
              <div key={i} style={{ fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.4 }}>💡 {l.text || l.summary || ''}</div>
            ))}
          </div>
        </div>
      )}

      {nada && (
        <div style={{ fontSize: 11.5, color: 'var(--cream-3)' }}>Aún arranco con valores por defecto. Conforme cierres leads, me afino y verás aquí qué aprendí.</div>
      )}
    </div>
  );
}
