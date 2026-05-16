// OnboardingGate — blocks the advisor portal until profile is completed on first login
//
// Bug-fix 2026-05-15: el wizard tiene zIndex 400 pero Joyride tour (useTour) monta con
// zIndex 9000 y captura clicks. Solución: marcar `body.dmx-onboarding-blocking` mientras
// el wizard está abierto para que useTour espere a que se cierre antes de lanzar el tour.
import React, { useEffect, useState } from 'react';
import * as api from '../../api/advisor';

const COLONIAS_SUGERIDAS = ['polanco', 'condesa', 'roma-norte', 'santa-fe', 'lomas-chapultepec', 'coyoacan', 'del-valle-centro', 'juarez', 'narvarte-poniente', 'escandon', 'san-miguel-chapultepec', 'san-rafael', 'doctores', 'anzures', 'pedregal', 'roma-sur'];

// Bug-fix 2026-05-15: display nombres oficiales (Title Case + acentos + preposiciones)
// Keys son slugs internos · NO cambiar para preservar compat con backend.
const COLONIA_DISPLAY = {
  'polanco': 'Polanco',
  'condesa': 'Condesa',
  'roma-norte': 'Roma Norte',
  'santa-fe': 'Santa Fe',
  'lomas-chapultepec': 'Lomas de Chapultepec',
  'coyoacan': 'Coyoacán',
  'del-valle-centro': 'Del Valle Centro',
  'juarez': 'Juárez',
  'narvarte-poniente': 'Narvarte Poniente',
  'escandon': 'Escandón',
  'san-miguel-chapultepec': 'San Miguel Chapultepec',
  'san-rafael': 'San Rafael',
  'doctores': 'Doctores',
  'anzures': 'Anzures',
  'pedregal': 'Pedregal',
  'roma-sur': 'Roma Sur',
};

const IDIOMAS = [
  { k: 'es-MX', l: 'Español' },
  { k: 'en-US', l: 'Inglés' },
  { k: 'pt-BR', l: 'Portugués' },
  { k: 'fr-FR', l: 'Francés' },
  { k: 'it-IT', l: 'Italiano' },
  { k: 'de-DE', l: 'Alemán' },
  { k: 'zh-CN', l: 'Mandarín' },
];

export default function OnboardingGate({ profile, onDone }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({
    full_name: profile?.full_name || '',
    brokerage: profile?.brokerage || '',
    brokerage_type: 'independent',
    license_ampi: profile?.license_ampi || '',
    years_experience: 3,
    colonias: profile?.colonias || [],
    languages: profile?.languages || ['es-MX'],
    bio: profile?.bio || '',
  });
  const [sub, setSub] = useState(false);
  const [err, setErr] = useState(null);

  // Body class para que useTour sepa que el wizard bloquea la pantalla
  useEffect(() => {
    document.body.classList.add('dmx-onboarding-blocking');
    return () => document.body.classList.remove('dmx-onboarding-blocking');
  }, []);

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  // Step 2: si es Independiente NO requiere nombre · si es Inmobiliaria/Desarrolladora SÍ
  const canProceed = {
    1: f.full_name.trim().length >= 3,
    2: f.brokerage_type === 'independent' || f.brokerage.trim().length >= 2,
    3: true, // AMPI optional
    4: f.colonias.length >= 1 && f.colonias.length <= 5,
    5: f.languages.length >= 1,
  }[step];

  const submit = async () => {
    setSub(true); setErr(null);
    try {
      await api.updateProfile({
        full_name: f.full_name,
        brokerage: f.brokerage_type === 'independent' ? '' : f.brokerage,
        brokerage_type: f.brokerage_type,
        license_ampi: f.license_ampi,
        colonias: f.colonias,
        languages: f.languages,
        bio: f.bio,
      });
      onDone();
    } catch (e) {
      console.error('[OnboardingGate] submit failed', e);
      setErr('No se pudo guardar. Intenta de nuevo.');
    }
    finally { setSub(false); }
  };

  const toggleArr = (key, val, max) => {
    setF(old => {
      const cur = old[key];
      if (cur.includes(val)) return { ...old, [key]: cur.filter(x => x !== val) };
      if (max && cur.length >= max) return old;
      return { ...old, [key]: [...cur, val] };
    });
  };

  return (
    <div data-testid="onboarding-gate" style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'linear-gradient(180deg, #06080F, #0A0D16)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, overflow: 'auto',
    }}>
      <div style={{
        width: 560, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)', borderRadius: 24,
        padding: 34,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', background: 'rgba(var(--theme-rgb),0.12)', border: '1px solid rgba(var(--theme-rgb),0.26)', borderRadius: 9999, marginBottom: 16 }}>
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5, color: 'var(--indigo-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Paso {step} de 5 · Configuración inicial
          </span>
        </div>

        {/* progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 22 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 9999, background: n <= step ? 'var(--grad)' : 'var(--border-2)' }} />
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.022em', margin: '0 0 10px', lineHeight: 1.15 }}>
              Antes de entrar al CRM, cuéntanos quién eres.
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 22 }}>
              Esta información se usa para generar argumentarios IA con tu voz y aparecer en el marketplace de asesores verificados.
            </p>
            <label><div style={lblStyle}>Nombre completo *</div>
              <input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} style={inputStyle} data-testid="ob-name" placeholder="Como aparece en tu cédula" />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.022em', margin: '0 0 10px', lineHeight: 1.15 }}>
              ¿Cómo operas?
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 14 }}>
              Elige tu modalidad principal. Si trabajas con varias, indica la que más usas.
            </p>
            <div style={{ marginBottom: 14 }}>
              <div style={lblStyle}>Modalidad *</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { k: 'independent', l: 'Independiente' },
                  { k: 'inmobiliaria', l: 'Inmobiliaria' },
                  { k: 'desarrolladora', l: 'Desarrolladora' },
                ].map(o => (
                  <button key={o.k} onClick={() => setF({ ...f, brokerage_type: o.k, brokerage: o.k === 'independent' ? '' : f.brokerage })} data-testid={`ob-type-${o.k}`}
                    className={`filter-chip${f.brokerage_type === o.k ? ' active' : ''}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {f.brokerage_type === 'independent' && (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.6, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
                Operas por cuenta propia · sin inmobiliaria ni desarrolladora. Puedes continuar.
              </p>
            )}
            {f.brokerage_type === 'inmobiliaria' && (
              <label><div style={lblStyle}>Nombre de la inmobiliaria *</div>
                <input value={f.brokerage} onChange={e => setF({ ...f, brokerage: e.target.value })} style={inputStyle} data-testid="ob-brokerage" placeholder="Ej. Coldwell Banker, RE/MAX, Century 21" />
              </label>
            )}
            {f.brokerage_type === 'desarrolladora' && (
              <label><div style={lblStyle}>Nombre de la desarrolladora *</div>
                <input value={f.brokerage} onChange={e => setF({ ...f, brokerage: e.target.value })} style={inputStyle} data-testid="ob-brokerage" placeholder="Ej. ICA, GICSA, Inmobiliaria Vinte" />
              </label>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.022em', margin: '0 0 10px', lineHeight: 1.15 }}>
              Credenciales profesionales
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 14 }}>
              La licencia AMPI es opcional pero suma +50 puntos a tu trust score y te verifica en el marketplace.
            </p>
            <label><div style={lblStyle}>Licencia AMPI (opcional)</div>
              <input value={f.license_ampi} onChange={e => setF({ ...f, license_ampi: e.target.value })} style={inputStyle} data-testid="ob-ampi" placeholder="Ej. AMPI-CDMX-00000" />
            </label>
            <label style={{ display: 'block', marginTop: 14 }}><div style={lblStyle}>Años de experiencia</div>
              <input type="number" min={0} max={60} value={f.years_experience} onChange={e => setF({ ...f, years_experience: +e.target.value })} style={inputStyle} data-testid="ob-years" />
            </label>
          </>
        )}
        {step === 4 && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.022em', margin: '0 0 10px', lineHeight: 1.15 }}>
              ¿Dónde operas con más profundidad?
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6, marginBottom: 14 }}>
              Selecciona 1 a 5 colonias de especialización. Los matchmakers priorizan asesores que conocen la zona.
            </p>
            <div data-testid="ob-colonias-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {COLONIAS_SUGERIDAS.map(col => {
                const active = f.colonias.includes(col);
                const disabled = !active && f.colonias.length >= 5;
                return (
                  <button key={col} onClick={() => toggleArr('colonias', col, 5)} disabled={disabled} data-testid={`ob-col-${col}`}
                    className={`filter-chip${active ? ' active' : ''}`} style={{ opacity: disabled ? 0.4 : 1, justifyContent: 'flex-start' }}>
                    {COLONIA_DISPLAY[col] || col.replace(/-/g, ' ')}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 10 }}>
              {f.colonias.length} / 5 seleccionadas
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', letterSpacing: '-0.022em', margin: '0 0 10px', lineHeight: 1.15 }}>
              Idiomas que manejas con clientes
            </h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              {IDIOMAS.map(i => {
                const active = f.languages.includes(i.k);
                return (
                  <button key={i.k} onClick={() => toggleArr('languages', i.k)} data-testid={`ob-lang-${i.k}`}
                    className={`filter-chip${active ? ' active' : ''}`}>
                    {i.l}
                  </button>
                );
              })}
            </div>
            <label><div style={lblStyle}>Bio (opcional — 140 chars max)</div>
              <textarea value={f.bio} onChange={e => setF({ ...f, bio: e.target.value.slice(0, 140) })} rows={3} data-testid="ob-bio"
                style={{ ...inputStyle, borderRadius: 14, fontFamily: 'DM Sans', resize: 'vertical' }}
                placeholder="Tu pitch en 1 frase. Ej: Especialista en preventa Polanco y Lomas con 8 años." />
            </label>
            {err && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', marginTop: 10 }}>{err}</div>}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
          {step > 1 && <button onClick={() => setStep(step - 1)} data-testid="ob-back" className="btn btn-glass" style={{ flex: 1, justifyContent: 'center' }}>← Atrás</button>}
          {step < 5 && <button onClick={() => setStep(step + 1)} disabled={!canProceed} data-testid="ob-next" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: canProceed ? 1 : 0.5 }}>Siguiente →</button>}
          {step === 5 && <button onClick={submit} disabled={!canProceed || sub} data-testid="ob-submit" className="btn btn-primary" style={{ flex: 2, justifyContent: 'center', opacity: (!canProceed || sub) ? 0.5 : 1 }}>
            {sub ? 'Guardando…' : 'Completar y entrar al CRM'}
          </button>}
        </div>
      </div>
    </div>
  );
}
