// /desarrollador/competidores — D3 Competitor Radar ENRICHED (Phase 4 Batch 2)
import React, { useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge, fmtMXN, fmt0, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Radio, Bell, TrendUp, TrendDown, X, MessageCircle } from '../../components/icons';
import { LineChart, Sparkline } from '../../components/developer/ChartPrimitives';

export default function DesarrolladorCompetidores({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [radius, setRadius] = useState(2);
  const [toast, setToast] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);     // competitor dev {id,name}
  const [history, setHistory] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [cfg, setCfg] = useState(null);

  const load = () => api.getCompetitorsEnriched(null, radius).then(d => {
    setData(d);
    setCfg(d.alert_config);
  });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [radius]);

  const openHistory = async (comp) => {
    setHistoryFor(comp);
    setHistory(null);
    try {
      const h = await api.getCompetitorHistory(comp.id);
      setHistory(h);
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Error al cargar histórico' }); }
  };

  const saveCfg = async (newCfg) => {
    try {
      await api.saveAlertConfig(newCfg);
      setCfg(newCfg);
      setShowConfig(false);
      setToast({ kind: 'success', text: 'Configuración guardada' });
      load();
    } catch (e) { setToast({ kind: 'error', text: e.body?.detail || 'Error al guardar' }); }
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="D3 · COMPETITOR RADAR"
        title="Radar de competidores"
        sub="Alertas de pricing, histórico 12 meses y recortes de prensa IA."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              data-testid="comp-config-btn"
              onClick={() => setShowConfig(true)}
              style={{
                padding: '8px 14px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <Bell size={12} /> Alertas
            </button>
            <select value={radius} onChange={e => setRadius(+e.target.value)} className="asr-select" data-testid="comp-radius">
              <option value={1}>Radio 1km</option>
              <option value={2}>Radio 2km</option>
              <option value={3}>Radio 3km</option>
              <option value={5}>Radio 5km</option>
            </select>
          </div>
        }
      />

      {!data || !data.my_project ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            {/* Alertas */}
            {data.alerts.length > 0 && (
              <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(239,68,68,0.10), transparent)', border: '1px solid rgba(239,68,68,0.32)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="eyebrow" style={{ color: '#fca5a5' }}>ALERTAS · ACCIÓN RECOMENDADA</div>
                  {cfg && (
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream-3)' }}>
                      Umbral pricing: ±{cfg.price_delta_threshold_pct}% · abs: {cfg.absorption_threshold_pct}%
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.alerts.map((a, i) => (
                    <div key={i} data-testid={`comp-alert-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>
                      <Radio size={11} color="#fca5a5" />
                      {a.msg}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* My project anchor */}
            <Card style={{ marginBottom: 14, background: 'linear-gradient(140deg, rgba(236,72,153,0.08), transparent)' }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>MI PROYECTO ANCLA</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{data.my_project.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {(data.my_project.amenities || []).slice(0, 5).map(a => <Badge key={a} tone="brand">{a}</Badge>)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22 }}>
                  <Stat label="Precio/m²" value={fmtMXN(data.my_project.price_sqm_mxn)} />
                  <Stat label="Absorción" value={`${data.my_project.absorption_pct}%`} />
                  <Stat label="Disponibles" value={`${data.my_project.units_available}/${data.my_project.units_total}`} />
                </div>
              </div>
            </Card>

            {/* Competitors with history trigger */}
            <div className="eyebrow" style={{ marginBottom: 8 }}>COMPETIDORES EN TU RADIO</div>
            {data.competitors.length === 0 ? <Card style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Sin competidores detectados en este radio.</Card>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                  {data.competitors.map(c => (
                    <Card key={c.id} data-testid={`comp-${c.id}`}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr auto', alignItems: 'center', gap: 14 }} className="comp-row">
                        <div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{c.name}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                            {c.colonia} · {c.distance_km}km · {c.stage.replace('_', ' ')}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {(c.amenities || []).slice(0, 3).map(a => <Badge key={a} tone="neutral">{a}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Precio/m²</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmtMXN(c.price_sqm_mxn)}</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vs mío</div>
                          <Badge tone={c.delta_vs_mine_pct > 0 ? 'ok' : 'bad'}>{c.delta_vs_mine_pct > 0 ? '+' : ''}{c.delta_vs_mine_pct}%</Badge>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Absorción</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{c.absorption_pct}%</div>
                        </div>
                        <div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Disponibles</div>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{fmt0(c.units_available)}/{fmt0(c.units_total)}</div>
                        </div>
                        <button
                          data-testid={`comp-history-${c.id}`}
                          onClick={() => openHistory(c)}
                          style={{
                            padding: '7px 12px', borderRadius: 9999,
                            background: 'rgba(236,72,153,0.14)', border: '1px solid rgba(236,72,153,0.3)',
                            color: '#f9a8d4', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}>
                          <TrendUp size={11} /> Histórico
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

            {/* Press clips */}
            <div className="eyebrow" style={{ marginBottom: 8 }}>RECORTES DE PRENSA · últimos 30 días (resumen IA)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
              {(data.press_clips || []).map(clip => (
                <Card key={clip.id} data-testid={`press-${clip.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {clip.source}
                    </div>
                    <Badge tone={clip.sentiment === 'positive' ? 'ok' : clip.sentiment === 'negative' ? 'bad' : 'neutral'}>
                      {clip.sentiment === 'positive' ? 'Positivo' : clip.sentiment === 'negative' ? 'Negativo' : 'Neutral'}
                    </Badge>
                  </div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', lineHeight: 1.35, marginBottom: 8 }}>
                    {clip.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                    <MessageCircle size={11} color="var(--cream-3)" />
                    <div>{clip.ai_summary}</div>
                  </div>
                  <div style={{ marginTop: 10, fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
                    {clip.published_at}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

      {/* History modal */}
      {historyFor && (
        <div
          data-testid="comp-history-modal"
          onClick={() => setHistoryFor(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(8,10,18,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0D1118', border: '1px solid var(--border)',
            borderRadius: 16, padding: 20, maxWidth: 720, width: '100%',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div className="eyebrow">HISTÓRICO PRECIO 12M</div>
                <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0' }}>
                  {historyFor.name}
                </h3>
              </div>
              <button onClick={() => setHistoryFor(null)} data-testid="comp-history-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            {!history ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  <Metric label="Precio actual/m²" v={fmtMXN(history.current_price_sqm)} />
                  <Metric label="Variación 12m" v={`${history.delta_12m_pct >= 0 ? '+' : ''}${history.delta_12m_pct}%`} accent={history.delta_12m_pct >= 0 ? '#86efac' : '#fca5a5'} />
                  <Metric label="Puntos serie" v={history.history.length} />
                </div>
                <LineChart
                  width={640} height={240}
                  xLabels={history.history.map(h => h.month.slice(5))}
                  series={[{
                    name: 'Precio/m²', color: '#EC4899',
                    values: history.history.map((h, i) => ({ x: i, y: h.price_sqm_mxn })),
                  }]}
                  yFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Alert config modal */}
      {showConfig && cfg && (
        <AlertConfigModal cfg={cfg} onClose={() => setShowConfig(false)} onSave={saveCfg} />
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      <style>{`@media (max-width: 940px) { .comp-row { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </DeveloperLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)' }}>{value}</div>
    </div>
  );
}

function Metric({ label, v, accent }) {
  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 3, fontSize: 9 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: accent || 'var(--cream)' }}>{v}</div>
    </div>
  );
}

function AlertConfigModal({ cfg, onClose, onSave }) {
  const [price, setPrice] = useState(cfg.price_delta_threshold_pct);
  const [abs, setAbs] = useState(cfg.absorption_threshold_pct);
  const [email, setEmail] = useState(cfg.notify_email);
  const [inapp, setInapp] = useState(cfg.notify_inapp);

  return (
    <div
      data-testid="comp-config-modal"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(8,10,18,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0D1118', border: '1px solid var(--border)',
        borderRadius: 16, padding: 22, maxWidth: 460, width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">CONFIGURAR ALERTAS</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', margin: '4px 0 0' }}>
              Umbrales de competidores
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <Field label="Delta pricing (%)">
          <input
            data-testid="cfg-price-delta"
            type="number" min={0.5} max={50} step={0.5}
            value={price}
            onChange={e => setPrice(+e.target.value)}
            style={inputStyle}
          />
          <div style={helpStyle}>Disparar alerta si un competidor baja más de este % por debajo de ti.</div>
        </Field>

        <Field label="Umbral absorción (%)">
          <input
            data-testid="cfg-abs-threshold"
            type="number" min={0} max={100} step={5}
            value={abs}
            onChange={e => setAbs(+e.target.value)}
            style={inputStyle}
          />
          <div style={helpStyle}>Disparar alerta si un competidor supera este % de absorción.</div>
        </Field>

        <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
          <Toggle label="Notificar por email" value={email} onChange={setEmail} tid="cfg-email" />
          <Toggle label="Notificación in-app" value={inapp} onChange={setInapp} tid="cfg-inapp" />
        </div>

        <button
          data-testid="cfg-save-btn"
          onClick={() => onSave({ price_delta_threshold_pct: price, absorption_threshold_pct: abs, notify_email: email, notify_inapp: inapp })}
          style={{
            width: '100%', padding: '12px', borderRadius: 12, background: 'var(--grad)',
            border: 'none', color: '#fff', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}>
          Guardar configuración
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange, tid }) {
  return (
    <button
      data-testid={tid}
      onClick={() => onChange(!value)}
      style={{
        flex: 1, padding: '10px 12px', borderRadius: 10,
        background: value ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${value ? 'rgba(236,72,153,0.35)' : 'var(--border)'}`,
        color: value ? '#f9a8d4' : 'var(--cream-3)',
        fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
      }}>
      {value ? '✓ ' : ''}{label}
    </button>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 13,
};
const helpStyle = {
  fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4,
};
