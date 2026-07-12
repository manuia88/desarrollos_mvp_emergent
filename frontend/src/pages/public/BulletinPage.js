// W3.3 ZZ.3 — /boletin/{slug}/{period} public page
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Share2 } from 'lucide-react';
import ToolNav from '../../components/ui/ToolNav';
import { fetchBulletin, bulletinPdfUrl } from '../../api/bulletins';

function periodLabel(period) {
  if (!period) return '—';
  const [y, m] = period.split('-').map(Number);
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${meses[m - 1] || ''} ${y}`;
}

export default function BulletinPage() {
  const { slug, period } = useParams();
  const [bul, setBul] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchBulletin(slug, period).then(setBul).catch((e) => setErr(e?.detail || 'Boletín no disponible'));
  }, [slug, period]);

  useEffect(() => {
    if (!bul) return;
    const title = `Boletín DMX ${slug === 'general' ? 'Nacional' : slug} · ${periodLabel(period)}`;
    document.title = title;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article',
      'headline': title,
      'datePublished': bul.generated_at,
      'author': { '@type': 'Organization', 'name': 'DesarrollosMX' },
      'publisher': { '@type': 'Organization', 'name': 'DesarrollosMX' },
      'description': 'Boletín mensual del DMX Residential Price Index (DRPI).',
    });
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [bul, slug, period]);

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const txt = encodeURIComponent(`Boletín DMX ${slug} · ${periodLabel(period)}`);

  return (
    <div className="theme-light-scope" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <ToolNav />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 24px 80px' }}>
        {err ? (
          <div data-testid="bulletin-error" style={{ color: '#E5484D', fontFamily: 'DM Sans' }}>{err}</div>
        ) : !bul ? (
          <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
        ) : (
          <>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Boletín DesarrollosMX
            </div>
            <h1 data-testid="bulletin-title" style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(28px, 4.4vw, 48px)',
              color: 'var(--cream)', margin: '12px 0 4px', letterSpacing: '-0.025em',
            }}>
              {bul.type === 'general' ? 'DRPI Nacional' : `DRPI · ${bul.zone_id}`}
            </h1>
            <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 14, marginBottom: 24 }}>
              {periodLabel(bul.period)}
            </div>

            {/* KPIs */}
            <div data-testid="bulletin-kpis" style={{
              display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 28,
            }}>
              {Object.entries(bul.kpis_summary || {}).map(([k, v]) => (
                <div key={k} style={{
                  background: '#FFFFFF', border: '1px solid #ECECEC',
                  borderRadius: 14, padding: 14,
                }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', marginTop: 6 }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Body */}
            <article
              data-testid="bulletin-body"
              style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.75 }}
              dangerouslySetInnerHTML={{ __html: bul.html_content }}
            />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
              <a
                href={bulletinPdfUrl(slug, period)}
                target="_blank" rel="noreferrer"
                data-testid="bulletin-download-pdf-btn"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', borderRadius: 9999,
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  color: '#fff', textDecoration: 'none',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                }}
              >
                <Download size={14} /> Descargar PDF
              </a>
              <a
                href={`https://api.whatsapp.com/send?text=${txt}%20${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                data-testid="bulletin-share-whatsapp-btn"
                style={pillStyle}
              >
                <Share2 size={14} /> WhatsApp
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                data-testid="bulletin-share-linkedin-btn"
                style={pillStyle}
              >
                <Share2 size={14} /> LinkedIn
              </a>
              <a
                href={`https://x.com/intent/tweet?text=${txt}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank" rel="noreferrer"
                data-testid="bulletin-share-x-btn"
                style={pillStyle}
              >
                <Share2 size={14} /> X
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const pillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 9999,
  background: '#F6F7FA',
  border: '1px solid #ECECEC',
  color: 'var(--cream)', textDecoration: 'none',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
