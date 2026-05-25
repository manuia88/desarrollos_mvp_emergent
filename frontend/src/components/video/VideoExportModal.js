// W5.22 Z.4 · VideoExportModal · 4 tabs: PDF Report · Download · Share WhatsApp · Social Cards.
// PDF via reportlab backend · Download blob multi-ratio · wa.me · social_cards W5.16 (og/feed/story).
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileDown, Download, Share2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { exportStandalonePdf, shareStandaloneWhatsApp } from '../../api/videoStandalone';

const API = process.env.REACT_APP_BACKEND_URL;
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.96)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const WA_GREEN = '#25D366';
const RATIOS = ['1:1', '9:16', '16:9'];
const SOCIAL = [
  { kind: 'og', label: 'Open Graph', ratio: '1200×630' },
  { kind: 'feed', label: 'Feed', ratio: '1080×1080' },
  { kind: 'story', label: 'Story', ratio: '1080×1920' },
];

const TABS = [
  { key: 'pdf', i18n: 'videoStandalone.export.tabPdf', Icon: FileDown },
  { key: 'download', i18n: 'videoStandalone.export.tabDownload', Icon: Download },
  { key: 'whatsapp', i18n: 'videoStandalone.export.tabWhatsApp', Icon: Share2 },
  { key: 'social', i18n: 'videoStandalone.export.tabSocial', Icon: ImageIcon },
];

function isStubUrl(u) {
  return typeof u === 'string' && u.startsWith('stub://');
}

async function forceDownload(url, filename) {
  if (!url || isStubUrl(url)) return;
  try {
    const r = await fetch(url, { credentials: 'omit' });
    const blob = await r.blob();
    const obj = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(obj);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function VideoExportModal({ open, onClose, video, socialSlug = 'dmx', socialEntity = 'development' }) {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [waText, setWaText] = useState('');
  const [waRatio, setWaRatio] = useState('9:16');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, busy, onClose]);

  useEffect(() => { if (open) { setTab('pdf'); setErr(''); setWaText(''); } }, [open]);

  if (!open || !video) return null;
  const ratios = video.ratios || {};
  const stub = !!video.is_stub;

  const handlePdf = async () => {
    setBusy(true); setErr('');
    try { await exportStandalonePdf(video.video_id); }
    catch (e) { setErr(e?.message || t('videoStandalone.export.error', 'No fue posible exportar.')); }
    finally { setBusy(false); }
  };

  const loadWa = async () => {
    setBusy(true); setErr('');
    try {
      const res = await shareStandaloneWhatsApp(video.video_id, waRatio);
      setWaText(res?.text || '');
    } catch (e) { setErr(e?.message || t('videoStandalone.export.error', 'No fue posible exportar.')); }
    finally { setBusy(false); }
  };

  const sendWa = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(waText || '')}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const socialUrl = (kind) => `${API}/api/social-cards/${kind}/${socialEntity}/${encodeURIComponent(socialSlug)}.png`;

  return (
    <div role="dialog" aria-modal="true" data-testid="video-export-modal" style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(6,8,15,0.78)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
    }} onClick={() => !busy && onClose && onClose()}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, maxHeight: '88vh', overflow: 'auto',
        background: CARD_BG, border: BORDER, borderRadius: 22, padding: 22,
        fontFamily: 'DM Sans, sans-serif', color: CREAM, display: 'grid', gap: 16,
      }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em' }}>
              {t('videoStandalone.export.title', 'Exportar video')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: MUTED }}>
              {t('videoStandalone.export.subtitle', 'PDF, descarga, WhatsApp o tarjetas sociales.')}
            </p>
          </div>
          <button type="button" onClick={() => !busy && onClose && onClose()} aria-label={t('videoStandalone.export.close', 'Cerrar')} style={{
            padding: '6px 8px', background: 'transparent', border: '1px solid rgba(240,235,224,0.18)',
            color: CREAM, borderRadius: 9999, cursor: 'pointer',
          }}><X size={16} /></button>
        </header>

        {/* Tabs */}
        <div role="tablist" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: BORDER }}>
          {TABS.map(({ key, i18n, Icon }) => {
            const isActive = tab === key;
            return (
              <button key={key} type="button" role="tab" aria-selected={isActive}
                data-testid={`vem-tab-${key}`} onClick={() => setTab(key)}
                style={{
                  position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '9px 14px', background: 'transparent', border: 'none',
                  color: isActive ? CREAM : MUTED, fontFamily: 'DM Sans, sans-serif',
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}>
                <Icon size={13} /> {t(i18n, key)}
                {isActive && <span aria-hidden style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 2, background: GRAD, borderRadius: 9999 }} />}
              </button>
            );
          })}
        </div>

        {stub && (
          <div style={{ padding: '9px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#FBBF24', fontSize: 12 }}>
            {t('videoStandalone.export.stub', 'Modo demo: descargas y compartir deshabilitados (video no real).')}
          </div>
        )}
        {err && <div role="alert" style={{ padding: '9px 12px', borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', fontSize: 12 }}>{err}</div>}

        {/* PDF */}
        {tab === 'pdf' && (
          <div data-testid="vem-panel-pdf" style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
              {t('videoStandalone.export.pdfDesc', 'Genera un reporte PDF con el guion, enlaces por formato y métricas del video.')}
            </p>
            <button type="button" data-testid="vem-pdf-btn" onClick={handlePdf} disabled={busy} style={primaryBtn(busy)}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {t('videoStandalone.export.pdfBtn', 'Descargar PDF')}
            </button>
          </div>
        )}

        {/* Download */}
        {tab === 'download' && (
          <div data-testid="vem-panel-download" style={{ display: 'grid', gap: 10 }}>
            {RATIOS.map((r) => {
              const url = ratios[r];
              const disabled = !url || isStubUrl(url) || stub;
              return (
                <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: 'rgba(240,235,224,0.03)', border: BORDER }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r}</span>
                  <button type="button" data-testid={`vem-dl-${r.replace(':', 'x')}`} disabled={disabled}
                    onClick={() => forceDownload(url, `video-${video.video_id}-${r.replace(':', 'x')}.mp4`)}
                    style={{ ...ghostBtn(disabled) }}>
                    <Download size={12} /> {t('videoStandalone.export.download', 'Descargar')}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* WhatsApp */}
        {tab === 'whatsapp' && (
          <div data-testid="vem-panel-whatsapp" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: MUTED_2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('videoStandalone.export.ratioLabel', 'Formato')}</span>
              {RATIOS.map((r) => (
                <button key={r} type="button" onClick={() => setWaRatio(r)} style={{
                  ...ghostBtn(false), background: waRatio === r ? 'rgba(99,102,241,0.18)' : 'transparent',
                  borderColor: waRatio === r ? 'rgba(99,102,241,0.5)' : 'rgba(240,235,224,0.18)',
                }}>{r}</button>
              ))}
              <button type="button" data-testid="vem-wa-load" onClick={loadWa} disabled={busy || stub} style={ghostBtn(busy || stub)}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} {t('videoStandalone.export.buildMsg', 'Generar mensaje')}
              </button>
            </div>
            <textarea data-testid="vem-wa-text" rows={5} value={waText} onChange={(e) => setWaText(e.target.value)}
              placeholder={t('videoStandalone.export.waPlaceholder', 'El mensaje aparecerá aquí…')}
              style={{ width: '100%', padding: 12, borderRadius: 12, background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.12)', color: CREAM, fontFamily: 'DM Sans, sans-serif', fontSize: 13, lineHeight: 1.5, outline: 'none', resize: 'vertical' }} />
            <button type="button" data-testid="vem-wa-send" onClick={sendWa} disabled={!waText || stub} style={{ ...primaryBtn(!waText || stub), background: (!waText || stub) ? 'rgba(37,211,102,0.25)' : WA_GREEN, color: '#FFF' }}>
              <Share2 size={14} /> {t('videoStandalone.export.waSend', 'Abrir WhatsApp')}
            </button>
          </div>
        )}

        {/* Social Cards */}
        {tab === 'social' && (
          <div data-testid="vem-panel-social" style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
              {t('videoStandalone.export.socialDesc', 'Tarjetas sociales (Open Graph, Feed y Story) generadas por DesarrollosMX.')}
            </p>
            {SOCIAL.map(({ kind, label, ratio }) => (
              <div key={kind} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(240,235,224,0.03)', border: BORDER }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 11, color: MUTED_2 }}>{ratio}</div>
                </div>
                <button type="button" data-testid={`vem-social-${kind}`} onClick={() => window.open(socialUrl(kind), '_blank', 'noopener,noreferrer')} style={ghostBtn(false)}>
                  <ImageIcon size={12} /> {t('videoStandalone.export.open', 'Abrir')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 18px',
  background: GRAD, border: 'none', color: '#FFF', borderRadius: 9999,
  fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 13.5,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const ghostBtn = (disabled = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
  background: 'transparent', border: '1px solid rgba(240,235,224,0.18)', color: CREAM,
  borderRadius: 9999, fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
});
