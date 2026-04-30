// /asesor/studio — DMX Studio Wave 1 dashboard + wizards
import React, { useEffect, useState } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Stat, Badge, Empty, Drawer, Toast, fmt0, relDate } from '../../components/advisor/primitives';
import * as api from '../../api/studio';
import { Sparkle, Play, Lock, ArrowRight } from '../../components/icons';

export default function StudioDashboard({ user, onLogout }) {
  const [dash, setDash] = useState(null);
  const [lib, setLib] = useState(null);
  const [showVideo, setShowVideo] = useState(false);
  const [showAds, setShowAds] = useState(false);
  const [openVideo, setOpenVideo] = useState(null);
  const [openBatch, setOpenBatch] = useState(null);
  const [toast, setToast] = useState(null);

  const load = async () => {
    const [d, l] = await Promise.all([api.getDashboard(), api.getLibrary()]);
    setDash(d); setLib(l);
  };
  useEffect(() => { load(); }, []);

  const isStub = lib && (lib.video_engine === 'stub' || lib.ads_engine === 'openai-stub');

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="DMX STUDIO · WAVE 1"
        title="Director IA de video + creativos"
        sub="Genera scripts cinematográficos con Claude Sonnet 4.5 y ad batches de 100 creativos en minutos. Pipeline modular: voz, música, subtítulos, branding."
        actions={
          <>
            <button onClick={() => setShowVideo(true)} data-testid="new-video-btn" className="btn btn-glass">
              <Play size={11} /> Nuevo video
            </button>
            <button onClick={() => setShowAds(true)} data-testid="new-ads-btn" className="btn btn-primary">
              <Sparkle size={11} /> Generar 100 ads
            </button>
          </>
        }
      />

      {isStub && (
        <div data-testid="stub-banner" style={{
          padding: '10px 14px', marginBottom: 18,
          background: 'linear-gradient(140deg, rgba(245,158,11,0.10), rgba(245,158,11,0.02))',
          border: '1px solid rgba(245,158,11,0.30)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Badge tone="warn">MODO DEMO</Badge>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
            Engines en modo stub: Claude Sonnet 4.5 genera scripts y copies completos; gpt-image-1 produce hero images bajo demanda. Render de video real (fal.ai/Replicate) y batch completo de 100 imágenes únicas se activan post-MVP.
          </div>
        </div>
      )}

      {!dash || !lib ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Stat label="Videos generados" value={dash.stats.videos_generated} />
              <Stat label="Batches de ads" value={dash.stats.ad_batches_generated} />
              <Stat label="Ads desbloqueados" value={dash.stats.total_ads_unlocked} accent="#86efac" />
              <Stat label="Engine de video" value={dash.stats.video_engine} sub="cambia con STUDIO_VIDEO_ENGINE" />
            </div>

            <Card style={{ marginBottom: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>MIS VIDEOS</div>
              {dash.videos.length === 0 ? <Empty title="Sin videos aún" sub="Genera tu primer video con Claude director creativo." />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {dash.videos.map(v => (
                      <div key={v.id} data-testid={`video-card-${v.id}`} onClick={() => api.getVideo(v.id).then(setOpenVideo)}
                        style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', lineHeight: 1.2, flex: 1 }}>
                            {v.script?.title || 'Video sin título'}
                          </div>
                          <Badge tone="brand">{v.duration_s}s</Badge>
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                          {v.video_type} · {v.voice?.label} · {v.music?.label}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>{relDate(v.created_at)}</span>
                          {v.is_stub && <Badge tone="warn">stub</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>

            <Card>
              <div className="eyebrow" style={{ marginBottom: 10 }}>MIS BATCHES DE ADS</div>
              {dash.ad_batches.length === 0 ? <Empty title="Sin ads aún" sub="Pega un URL de propiedad o elige un desarrollo para generar 100 ads." />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {dash.ad_batches.map(b => (
                      <div key={b.id} data-testid={`batch-card-${b.id}`} onClick={() => api.getAdBatch(b.id).then(setOpenBatch)}
                        style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', lineHeight: 1.2, flex: 1 }}>
                            {b.source_label}
                          </div>
                          <Badge tone="ok">{b.ads_unlocked} reales</Badge>
                        </div>
                        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                          {b.visual_profile} · {fmt0(b.ads_locked)} variantes preview-locked
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                          <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)' }}>{relDate(b.created_at)}</span>
                          {b.is_stub && <Badge tone="warn">stub</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Card>
          </>
        )}

      <Drawer open={showVideo} onClose={() => setShowVideo(false)} title="Nuevo video · Director IA" width={620}>
        {lib && <VideoWizard lib={lib} onDone={(v) => { setShowVideo(false); setToast({ kind: 'success', text: 'Video generado' }); load(); setOpenVideo(v); }} onError={t => setToast({ kind: 'error', text: t })} />}
      </Drawer>

      <Drawer open={showAds} onClose={() => setShowAds(false)} title="Generar batch de 100 ads" width={620}>
        {lib && <AdsWizard lib={lib} onDone={(b) => { setShowAds(false); setToast({ kind: 'success', text: 'Batch generado' }); load(); setOpenBatch(b); }} onError={t => setToast({ kind: 'error', text: t })} />}
      </Drawer>

      <Drawer open={!!openVideo} onClose={() => setOpenVideo(null)} title={openVideo?.script?.title || 'Video'} width={620}>
        {openVideo && <VideoDetail video={openVideo} />}
      </Drawer>

      <Drawer open={!!openBatch} onClose={() => setOpenBatch(null)} title={openBatch?.source_label || 'Batch'} width={720}>
        {openBatch && <AdsBatchDetail batch={openBatch} onUpdated={async () => { const fresh = await api.getAdBatch(openBatch.id); setOpenBatch(fresh); }} setToast={setToast} />}
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function VideoWizard({ lib, onDone, onError }) {
  const [f, setF] = useState({
    source_type: 'text', source_data: '',
    video_type: 'hero', duration: 30,
    voice_id: lib.voices[0].id, music_mood: 'lujo', subtitles: true,
    cta: 'Agenda tu visita hoy', cta_url: '',
  });
  const [sub, setSub] = useState(false);

  const submit = async () => {
    if (!f.source_data.trim() || f.source_data.length < 30) return onError('Brief mínimo 30 caracteres');
    setSub(true);
    try { onDone(await api.generateVideo(f)); }
    catch { onError('Error al generar — intenta de nuevo'); }
    finally { setSub(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label><div style={lblStyle}>Brief / fuente *</div>
        <textarea value={f.source_data} onChange={e => setF({ ...f, source_data: e.target.value })} rows={5} placeholder="Pega un brief, descripción del proyecto, datos clave, ubicación, amenidades…"
          style={{ ...inputStyle, borderRadius: 14, resize: 'vertical', fontFamily: 'DM Sans' }} data-testid="vid-brief" />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><div style={lblStyle}>Tipo de video</div>
          <select value={f.video_type} onChange={e => setF({ ...f, video_type: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="vid-type">
            <option value="walkthrough">Walkthrough</option>
            <option value="hero">Hero</option>
            <option value="drone">Drone</option>
            <option value="lifestyle">Lifestyle</option>
            <option value="testimonial">Testimonial</option>
          </select>
        </label>
        <label><div style={lblStyle}>Duración</div>
          <select value={f.duration} onChange={e => setF({ ...f, duration: +e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="vid-dur">
            <option value={15}>15 segundos (Stories)</option>
            <option value={30}>30 segundos</option>
            <option value={60}>60 segundos (Reels)</option>
            <option value={90}>90 segundos</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label><div style={lblStyle}>Voz</div>
          <select value={f.voice_id} onChange={e => setF({ ...f, voice_id: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="vid-voice">
            {lib.voices.map(v => <option key={v.id} value={v.id}>{v.label} · {v.lang} · {v.tone}</option>)}
          </select>
        </label>
        <label><div style={lblStyle}>Mood musical</div>
          <select value={f.music_mood} onChange={e => setF({ ...f, music_mood: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="vid-music">
            <option value="lujo">Lujo</option>
            <option value="familiar">Familiar</option>
            <option value="urbano">Urbano</option>
            <option value="lifestyle">Lifestyle</option>
          </select>
        </label>
      </div>
      <label><div style={lblStyle}>CTA al final</div>
        <input value={f.cta} onChange={e => setF({ ...f, cta: e.target.value })} style={inputStyle} data-testid="vid-cta" />
      </label>
      <button onClick={submit} disabled={sub || f.source_data.length < 30} className="btn btn-primary" data-testid="vid-submit"
        style={{ justifyContent: 'center', opacity: (sub || f.source_data.length < 30) ? 0.6 : 1 }}>
        <Sparkle size={11} />
        {sub ? 'Claude está dirigiendo…' : 'Generar video con IA'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function AdsWizard({ lib, onDone, onError }) {
  const [f, setF] = useState({ source_url: '', development_id: '', visual_profile: 'joven' });
  const [devs, setDevs] = useState([]);
  const [sub, setSub] = useState(false);

  useEffect(() => { fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`).then(r => r.json()).then(setDevs); }, []);

  const submit = async () => {
    if (!f.development_id && !f.source_url) return onError('Elige un desarrollo o pega un URL');
    setSub(true);
    try { onDone(await api.generateAds(f)); }
    catch { onError('Error al generar batch'); }
    finally { setSub(false); }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' };
  const lblStyle = { fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 12, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
        El batch incluye 100 ads en 7 ángulos (inversión, lifestyle, plusvalía, familia, urgencia, ubicación, ROI). En Wave 1: 10 copies reales + lazy hero images por ángulo bajo demanda.
      </div>

      <label><div style={lblStyle}>Desarrollo DMX</div>
        <select value={f.development_id} onChange={e => setF({ ...f, development_id: e.target.value, source_url: '' })} className="asr-select" style={{ width: '100%' }} data-testid="ads-dev">
          <option value="">— Elige —</option>
          {devs.map(d => <option key={d.id} value={d.id}>{d.name} · {d.colonia}</option>)}
        </select>
      </label>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textAlign: 'center' }}>— o —</div>
      <label><div style={lblStyle}>URL listing externo</div>
        <input value={f.source_url} onChange={e => setF({ ...f, source_url: e.target.value, development_id: '' })} placeholder="https://www.inmuebles24.com/..."
          style={inputStyle} data-testid="ads-url" />
      </label>
      <label><div style={lblStyle}>Perfil visual</div>
        <select value={f.visual_profile} onChange={e => setF({ ...f, visual_profile: e.target.value })} className="asr-select" style={{ width: '100%' }} data-testid="ads-profile">
          {lib.visual_profiles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <button onClick={submit} disabled={sub || (!f.development_id && !f.source_url)} className="btn btn-primary" data-testid="ads-submit"
        style={{ justifyContent: 'center', opacity: (sub || (!f.development_id && !f.source_url)) ? 0.6 : 1 }}>
        <Sparkle size={11} />
        {sub ? 'Claude está copywriteando…' : 'Generar batch de 100 ads'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function VideoDetail({ video }) {
  const s = video.script || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card style={{ background: 'linear-gradient(140deg, rgba(99,102,241,0.10), transparent)' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>HOOK · primeros 3s</div>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream)', lineHeight: 1.3 }}>{s.hook || '—'}</div>
      </Card>
      <Card>
        <div className="eyebrow" style={{ marginBottom: 8 }}>STORYBOARD · {(s.scenes || []).length} escenas</div>
        {(s.scenes || []).map((sc, i) => (
          <div key={i} data-testid={`scene-${i}`} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <div style={{ minWidth: 56, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--cream-3)' }}>{sc.t_start}-{sc.t_end}s</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream-2)' }}>{sc.visual}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', marginTop: 4, lineHeight: 1.5 }}>"{sc.voiceover}"</div>
              {sc.subtitle && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4, fontStyle: 'italic' }}>SUB: {sc.subtitle}</div>}
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field k="Voz" v={`${video.voice?.label} · ${video.voice?.lang}`} />
          <Field k="Música" v={video.music?.label} />
          <Field k="CTA" v={s.cta_text || video.request?.cta || '—'} />
        </div>
      </Card>
      {video.is_stub && (
        <Card style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <div className="eyebrow" style={{ color: '#fcd34d', marginBottom: 6 }}>MODO DEMO · NO RENDERIZADO</div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
            Script + storyboard + voz + música seleccionados. El render MP4 se activa cuando se conecte fal.ai Seedance o Replicate Kling vía adapter.
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', marginTop: 3 }}>{v}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
function AdsBatchDetail({ batch, onUpdated, setToast }) {
  const [imageMap, setImageMap] = useState({}); // angulo → b64
  const [genQueue, setGenQueue] = useState({}); // angulo → loading

  // Load existing assets if any
  useEffect(() => {
    const assetIds = [...new Set((batch.ads || []).map(a => a.asset_id).filter(Boolean))];
    if (!assetIds.length) return;
    Promise.all(assetIds.map(id => api.getAsset(id).catch(() => null))).then(rs => {
      const m = {};
      rs.forEach(r => { if (r) m[r.angulo] = r.image_b64; });
      setImageMap(m);
    });
  }, [batch.id]);

  const generate = async (angulo) => {
    setGenQueue(q => ({ ...q, [angulo]: true }));
    try {
      const r = await api.generateHeroImage(batch.id, angulo);
      const a = await api.getAsset(r.asset_id);
      setImageMap(m => ({ ...m, [angulo]: a.image_b64 }));
      onUpdated();
      setToast({ kind: 'success', text: `Hero ${angulo} generado` });
    } catch (e) {
      setToast({ kind: 'error', text: `Error generando ${angulo}` });
    } finally {
      setGenQueue(q => { const { [angulo]: _, ...rest } = q; return rest; });
    }
  };

  const unlocked = (batch.ads || []).filter(a => !a.locked);
  const locked = (batch.ads || []).filter(a => a.locked);
  const angulos = [...new Set(unlocked.map(a => a.angulo))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div className="eyebrow" style={{ marginBottom: 6 }}>BREAKDOWN POR ÁNGULO</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {Object.entries(batch.angulos_breakdown || {}).map(([k, v]) => (
            <Badge key={k} tone={v > 0 ? 'brand' : 'neutral'}>{k}: {v}</Badge>
          ))}
        </div>
      </Card>

      <div className="eyebrow">10 ADS REALES — copies generados con Claude</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {unlocked.map(ad => (
          <div key={ad.id} data-testid={`ad-${ad.id}`} style={{
            padding: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
          }}>
            <div style={{ aspectRatio: '1 / 1', background: imageMap[ad.angulo] ? `url(data:image/png;base64,${imageMap[ad.angulo]}) center/cover` : 'linear-gradient(135deg, #1F2335, #0E1220)', position: 'relative' }}>
              {!imageMap[ad.angulo] && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 14, textAlign: 'center' }}>
                  <Sparkle size={18} color="var(--cream-3)" />
                  <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>Hero pendiente</div>
                  <button onClick={() => generate(ad.angulo)} disabled={genQueue[ad.angulo]} className="btn btn-glass btn-sm" data-testid={`gen-hero-${ad.angulo}`}
                    style={{ fontSize: 10.5, opacity: genQueue[ad.angulo] ? 0.6 : 1 }}>
                    {genQueue[ad.angulo] ? 'Generando…' : 'Generar imagen'}
                  </button>
                </div>
              )}
              <div style={{ position: 'absolute', top: 8, left: 8 }}>
                <Badge tone="brand">{ad.angulo}</Badge>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', lineHeight: 1.3, marginBottom: 4 }}>{ad.headline}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.5, marginBottom: 8 }}>{ad.body}</div>
              <Badge tone="ok">{ad.cta}</Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{ marginTop: 14 }}>{locked.length} VARIANTES BLOQUEADAS · activa el batch completo</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
        {locked.slice(0, 30).map(ad => (
          <div key={ad.id} data-testid={`locked-${ad.id}`} style={{
            aspectRatio: '1 / 1', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-2)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04))', filter: 'blur(20px)' }} />
            <Lock size={12} color="var(--cream-3)" />
            <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', position: 'relative' }}>
              {ad.angulo} #{ad.variant}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 8.5, color: 'var(--cream-3)', position: 'relative' }}>{ad.format}</div>
          </div>
        ))}
        {locked.length > 30 && (
          <div style={{ aspectRatio: '1 / 1', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream-3)' }}>
            +{locked.length - 30}
          </div>
        )}
      </div>

      <Card style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }}>
        <div className="eyebrow" style={{ color: '#fcd34d', marginBottom: 6 }}>ACTIVAR BATCH COMPLETO</div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
          Cuando STUDIO_ADS_ENGINE=openai-full se desbloquean los 100 creativos únicos con copy y imagen exclusivos por variante. Costo estimado: ~$15-25 USD por batch completo. Habla con tu admin DMX para activar.
        </div>
      </Card>
    </div>
  );
}
