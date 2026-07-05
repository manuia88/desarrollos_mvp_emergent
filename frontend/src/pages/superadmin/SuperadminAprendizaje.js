/**
 * SuperadminAprendizaje — el DASHBOARD DE APRENDIZAJE (F5 del rebuild del cubo).
 *
 * Una sola casa para "¿cómo aprende el modelo?": predicción vs realidad (MAPE), qué tan calibrado está,
 * y el acceso unificado a las 4 vistas de precisión que vivían dispersas (AVM · Forecast · FSD · Calibración).
 * Cadencia distinta al Hub de Mercado (semanal, no diaria) → página propia. Honesto: si no hay muestra
 * suficiente, lo dice ("datos acumulándose"), nunca inventa una precisión.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getMetaDashboard } from '../../api/accuracy';
import { Brain, TrendingUp, Gauge, Activity, ArrowRight, AlertCircle } from 'lucide-react';

const SUBVISTAS = [
  ['/superadmin/avm-accuracy', 'Precisión del AVM', 'Qué tan bien estima el valor de una propiedad', TrendingUp],
  ['/superadmin/forecast-accuracy', 'Precisión del pronóstico', 'Qué tan bien predice a dónde va el precio', TrendingUp],
  ['/superadmin/fsd-accuracy', 'Desviación del pronóstico (FSD)', 'Qué tan confiable es cada predicción', Gauge],
  ['/superadmin/calibracion', 'Calibración', 'Cuando dice 70%, ¿pasa el 70%?', Activity],
];

export default function SuperadminAprendizaje({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    // getMetaDashboard devuelve el sobre {ok, status, body} — el payload real vive en .body.
    // (Antes se guardaba el sobre entero → data.state/mape siempre undefined → panel mudo.)
    getMetaDashboard()
      .then((r) => { if (!alive) return; if (r && r.ok) setData(r.body); else setErr('No se pudo cargar la precisión del modelo.'); })
      .catch((e) => { if (alive) setErr(e?.message || 'Error.'); });
    return () => { alive = false; };
  }, []);

  const insufficient = data && data.state === 'insufficient_data';
  // el backend expone el MAPE como global_mape_30d (no mape_pct)
  const mape = data && data.global_mape_30d != null ? Number(data.global_mape_30d) : null;
  const hit = data && (data.hit_rate != null ? Number(data.hit_rate) : null);
  const mapeColor = mape == null ? 'rgba(240,235,224,0.4)' : mape < 8 ? '#4ADE80' : mape < 15 ? '#FCD34D' : '#F87171';

  const stat = (label, value, sub, color) => (
    <div className="dmx-card" style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 160, flex: 1 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.6)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: color || 'var(--cream)', marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.5)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-aprendizaje">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Brain size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Aprendizaje del modelo</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.72)', margin: '0 0 20px', maxWidth: 640 }}>
          Qué tan bien predice el sistema y cómo mejora con cada cierre real. Cuanto más bajo el error, más confías en los números del cubo.
        </p>

        {err && <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}><AlertCircle size={15} /> {err}</div>}

        {insufficient ? (
          <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: 22 }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: '#FCD34D' }}>Datos acumulándose</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', marginTop: 6, lineHeight: 1.5 }}>
              El modelo necesita más cierres reales para medir su precisión con honestidad. Llevamos <b style={{ color: 'var(--cream)' }}>{data.sample_size}</b> de <b style={{ color: 'var(--cream)' }}>{data.min_required}</b>{data.eta_days ? ` · ~${data.eta_days} días` : ''}. No inventamos una precisión hasta tenerla.
            </div>
          </div>
        ) : data && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            {stat('Error de estimación (MAPE 30d)', mape != null ? `${mape.toFixed(1)}%` : '—', mape != null ? (mape < 8 ? 'Muy bueno' : mape < 15 ? 'Aceptable' : 'A revisar') : null, mapeColor)}
            {hit != null && stat('Aciertos', `${Math.round(hit * 100)}%`, 'Dentro del rango esperado', hit >= 0.7 ? '#4ADE80' : '#FCD34D')}
          </div>
        )}

        {/* Acceso unificado a las 4 vistas de precisión (antes dispersas) */}
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', marginBottom: 10 }}>A fondo</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {SUBVISTAS.map(([to, label, sub, Icon]) => (
            <Link key={to} to={to} data-testid={`aprendizaje-link-${to}`} className="dmx-card"
              style={{ textDecoration: 'none', padding: '15px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(var(--theme-rgb),0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} color="var(--theme)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{label}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.6)', marginTop: 2 }}>{sub}</div>
              </div>
              <ArrowRight size={16} style={{ color: 'rgba(240,235,224,0.4)' }} />
            </Link>
          ))}
        </div>
      </div>
    </SuperadminLayout>
  );
}
