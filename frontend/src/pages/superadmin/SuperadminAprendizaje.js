/**
 * SuperadminAprendizaje — el DASHBOARD DE APRENDIZAJE (F5 del rebuild del cubo).
 *
 * Una sola casa para "¿cómo aprende el modelo?" con la CADENA HIPERGRANULAR completa:
 *   GLOBAL (MAPE/aciertos) → POR ZONA (tabla de precisión por colonia) → POR PROPIEDAD (inspector átomo:
 *   predicción vs realidad de UNA propiedad). + curva de calibración (cuando dice 70%, ¿pasa el 70%?).
 * Cadencia distinta al Hub de Mercado (semanal, no diaria) → página propia. Honesto: si no hay muestra
 * suficiente, lo dice ("datos acumulándose"), nunca inventa una precisión.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { getMetaDashboard, getPerZone, getCalibrationCurve, getDebugProperty } from '../../api/accuracy';
import { Brain, TrendingUp, Gauge, Activity, ArrowRight, AlertCircle, Search, Box } from 'lucide-react';

const SUBVISTAS = [
  ['/superadmin/avm-accuracy', 'Precisión del AVM', 'Qué tan bien estima el valor de una propiedad', TrendingUp],
  ['/superadmin/forecast-accuracy', 'Precisión del pronóstico', 'Qué tan bien predice a dónde va el precio', TrendingUp],
  ['/superadmin/fsd-accuracy', 'Desviación del pronóstico (FSD)', 'Qué tan confiable es cada predicción', Gauge],
  ['/superadmin/calibracion', 'Calibración', 'Cuando dice 70%, ¿pasa el 70%?', Activity],
];

// ── Capa ZONA: precisión por colonia (hipergranular nivel 2) ──
function PerZoneTable() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    getPerZone().then((r) => { if (alive) setRows(r && r.ok ? (r.body.zones || []) : []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);
  if (rows === null) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', padding: 14 }}>Cargando precisión por zona…</div>;
  if (!rows.length) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', padding: 14 }}>Aún sin cierres suficientes por zona — se llena con ventas reales.</div>;
  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' };
  const td = { fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.88)', padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const confColor = { ALTA: '#4ADE80', MEDIA: '#FCD34D', BAJA: '#F87171' };
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
      <table data-testid="aprendizaje-per-zone" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
        <thead><tr>
          <th style={{ ...th, textAlign: 'left' }}>Colonia</th><th style={th}>Error (MAPE 30d)</th><th style={th}>Aciertos</th><th style={th}>Muestra</th><th style={th}>Confianza</th>
        </tr></thead>
        <tbody>
          {rows.map((z, i) => (
            <tr key={z.zone_slug} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: 'var(--cream)' }}>{String(z.zone_slug || '—').replace(/-/g, ' ')}</td>
              <td style={td}>{z.mape_30d != null ? `${Number(z.mape_30d).toFixed(1)}%` : '—'}</td>
              <td style={td}>{z.hit_rate != null ? `${Math.round(z.hit_rate * 100)}%` : '—'}</td>
              <td style={td}>{z.sample_size ?? '—'}</td>
              <td style={{ ...td, color: confColor[z.confidence_label] || td.color, fontWeight: 700 }}>{z.confidence_label || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Curva de calibración: cuando el modelo dice X% de confianza, ¿acierta X%? ──
function CalibrationStrip() {
  const [cal, setCal] = useState(null);
  useEffect(() => {
    let alive = true;
    getCalibrationCurve(90, 10).then((r) => { if (alive) setCal(r && r.ok ? r.body : {}); }).catch(() => { if (alive) setCal({}); });
    return () => { alive = false; };
  }, []);
  const bins = (cal && cal.bins) || (cal && cal.buckets) || [];
  if (cal === null) return null;
  if (!bins.length) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', padding: '10px 0' }}>Calibración: aún sin muestra suficiente.</div>;
  return (
    <div data-testid="aprendizaje-calibracion" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '6px 2px 0' }}>
      {bins.map((b, i) => {
        const pred = b.predicted_confidence ?? 0;
        const real = b.actual_accuracy;
        const h = real != null ? Math.max(4, real * 56) : 4;
        const ideal = pred * 56;
        const off = real != null ? Math.abs(real - pred) : null;
        const color = off == null ? 'rgba(255,255,255,0.12)' : off < 0.1 ? '#4ADE80' : off < 0.2 ? '#FCD34D' : '#F87171';
        return (
          <div key={i} title={`Dijo ${(pred * 100).toFixed(0)}% → ${real != null ? `acertó ${(real * 100).toFixed(0)}%` : 'sin muestra'}${b.sample ? ` (n=${b.sample})` : ''}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: '100%', height: 60, display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
              <div style={{ position: 'absolute', bottom: ideal, left: 0, right: 0, height: 1, background: 'rgba(240,235,224,0.25)' }} />
              <div style={{ width: '100%', height: h, background: color, borderRadius: 3 }} />
            </div>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'rgba(240,235,224,0.45)' }}>{(pred * 100).toFixed(0)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Capa PROPIEDAD (el átomo): predicción vs realidad de UNA propiedad ──
function PropertyInspector() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const buscar = async () => {
    const id = q.trim();
    if (!id) return;
    setBusy(true);
    try { const r = await getDebugProperty(id, 90); setRes(r && r.ok ? r.body : { error: true }); }
    catch { setRes({ error: true }); }
    finally { setBusy(false); }
  };
  const pred = res && res.latest_prediction;
  const logs = (res && res.accuracy_log) || [];
  return (
    <div data-testid="aprendizaje-inspector">
      <div style={{ display: 'flex', gap: 8, maxWidth: 440 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: 10, color: 'rgba(240,235,224,0.4)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="ID de propiedad/unidad (ej. roma-norte-85-02A)" data-testid="inspector-input"
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button onClick={buscar} disabled={busy} data-testid="inspector-go"
          style={{ padding: '8px 16px', borderRadius: 9999, border: '1px solid rgba(var(--theme-rgb),0.45)', background: 'rgba(var(--theme-rgb),0.16)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>Inspeccionar</button>
      </div>
      {res && res.error && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5', marginTop: 10 }}>No se pudo consultar esa propiedad.</div>}
      {res && !res.error && (
        <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.8)' }}>
          {pred ? (
            <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              Última predicción: <b style={{ color: 'var(--cream)' }}>{pred.predicted_value != null ? `$${Number(pred.predicted_value).toLocaleString('es-MX')}` : '—'}</b>
              {pred.fsd_pct != null && <span> · desviación esperada ±{pred.fsd_pct}%</span>}
              {pred.prediction_date && <span style={{ color: 'rgba(240,235,224,0.5)' }}> · {String(pred.prediction_date).slice(0, 10)}</span>}
            </div>
          ) : <div>Sin predicción registrada para esa propiedad.</div>}
          {logs.length > 0 ? logs.slice(0, 5).map((l, i) => (
            <div key={i} style={{ marginTop: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              Cierre real: <b style={{ color: 'var(--cream)' }}>{l.actual_value != null ? `$${Number(l.actual_value).toLocaleString('es-MX')}` : '—'}</b>
              {l.error_pct != null && <span> · error <b style={{ color: Math.abs(l.error_pct) < 8 ? '#4ADE80' : Math.abs(l.error_pct) < 15 ? '#FCD34D' : '#F87171' }}>{Number(l.error_pct).toFixed(1)}%</b></span>}
              {l.close_date && <span style={{ color: 'rgba(240,235,224,0.5)' }}> · {String(l.close_date).slice(0, 10)}</span>}
            </div>
          )) : (pred && <div style={{ marginTop: 8, color: 'rgba(240,235,224,0.55)' }}>Aún sin cierre real para comparar — el error se mide cuando la propiedad se venda.</div>)}
        </div>
      )}
    </div>
  );
}

export default function SuperadminAprendizaje({ user, onLogout, embedded }) {
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
    <SuperadminLayout user={user} onLogout={onLogout} bare={embedded}>
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

        {/* CADENA HIPERGRANULAR · nivel 2: precisión POR ZONA */}
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', margin: '6px 0 10px' }}>Por zona</div>
        <PerZoneTable />

        {/* Calibración: cuando dice 70%, ¿pasa el 70%? (línea = ideal · barra = real) */}
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', margin: '22px 0 4px' }}>Calibración</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>Cada barra: lo que el modelo dijo (eje) vs lo que de verdad pasó (altura). La rayita es el ideal.</div>
        <CalibrationStrip />

        {/* CADENA HIPERGRANULAR · nivel 3 (el átomo): UNA propiedad — predicción vs cierre real */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '22px 0 4px' }}>
          <Box size={13} color="var(--theme)" />
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)' }}>El átomo · una propiedad</span>
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>Qué predijo el modelo para UNA propiedad y qué pasó de verdad al cerrar.</div>
        <PropertyInspector />

        {/* Acceso unificado a las 4 vistas de precisión (antes dispersas) */}
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.55)', margin: '26px 0 10px' }}>A fondo</div>
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
