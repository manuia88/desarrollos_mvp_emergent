// W5.ASR.4 Parte 1 · AsesorCMA — Vista lista + detalle CMA con Mapbox + tabla.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as cmaApi from '../../api/cma';
import { publicCMAUrl, subdomainCMAUrl, downloadCMAPdf, cmaOgImageUrl } from '../../api/cma';
import { fetchMySlug } from '../../api/asesor_identity';
import CMAKpiStrip from '../../components/asesor/CMAKpiStrip';
import CMAComparablesTable from '../../components/asesor/CMAComparablesTable';
import CMAComparablesMap from '../../components/asesor/CMAComparablesMap';

const COLONIAS = [
  { slug: 'polanco', name: 'Polanco' },
  { slug: 'lomas-chapultepec', name: 'Lomas de Chapultepec' },
  { slug: 'pedregal', name: 'Pedregal' },
  { slug: 'condesa', name: 'Condesa' },
  { slug: 'roma-norte', name: 'Roma Norte' },
  { slug: 'roma-sur', name: 'Roma Sur' },
  { slug: 'juarez', name: 'Juárez' },
  { slug: 'doctores', name: 'Doctores' },
  { slug: 'cuauhtemoc', name: 'Cuauhtémoc' },
  { slug: 'coyoacan', name: 'Coyoacán' },
  { slug: 'del-valle', name: 'Del Valle' },
  { slug: 'narvarte', name: 'Narvarte' },
  { slug: 'napoles', name: 'Nápoles' },
  { slug: 'santa-fe', name: 'Santa Fe' },
  { slug: 'tlalpan', name: 'Tlalpan' },
  { slug: 'xochimilco', name: 'Xochimilco' },
];

export default function AsesorCMA({ user, onLogout }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      {id
        ? <CMADetail
            cmaId={id}
            onBack={() => nav('/asesor/cma')}
            onToast={setToast}
          />
        : <CMAList
            onOpenDetail={(cid) => nav(`/asesor/cma/${cid}`)}
            onNew={() => setShowCreate(true)}
          />
      }

      <Drawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Generar CMA nuevo"
        width={560}>
        <GenerateForm
          onGenerated={(newId) => {
            setShowCreate(false);
            setToast({ kind: 'success', text: 'CMA generado correctamente' });
            nav(`/asesor/cma/${newId}`);
          }}
          onError={(t) => setToast({ kind: 'error', text: t })}
        />
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
    </AdvisorLayout>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Vista LISTA
// ═════════════════════════════════════════════════════════════════════════════
function CMAList({ onOpenDetail, onNew }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await cmaApi.listCMAs({ limit: 50 });
        setItems(r.items || []);
      } catch (_) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="ASESOR · CMA"
        title="Análisis comparativo de mercado"
        sub="Genera un CMA completo con AVM, comparables, subscores de zona y forecast a 12/24 meses. Compártelo con tus clientes en un link público."
        actions={
          <button
            data-testid="cma-new-btn"
            onClick={onNew}
            className="btn btn-primary">
            + Generar CMA nuevo
          </button>
        }
      />

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>
          Cargando…
        </div>
      ) : items.length === 0 ? (
        <Empty
          title="Aún no has generado ningún CMA"
          sub="Inicia tu primer análisis comparativo de mercado para ofrecer una valoración profesional a tus clientes."
        />
      ) : (
        <div
          data-testid="cma-list"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
          {items.map(it => (
            <Card
              key={it.id}
              data-testid={`cma-list-card-${it.id}`}
              onClick={() => onOpenDetail(it.id)}
              style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {it.subject_property?.colonia_name || it.subject_property?.colonia_slug || 'CMA'}
              </div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>
                {fmtMXN(it.estimated_value || 0)}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 4 }}>
                {it.subject_property?.m2} m² · {it.subject_property?.recamaras} rec · {it.subject_property?.banos} bañ
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge tone={
                  it.confidence === 'alta' ? 'ok' :
                  it.confidence === 'baja' ? 'bad' : 'warn'
                }>
                  {it.confidence}
                </Badge>
                {it.forecast_12m_pct != null && (
                  <Badge tone={it.forecast_12m_pct >= 0 ? 'ok' : 'bad'}>
                    {it.forecast_12m_pct >= 0 ? '+' : ''}{it.forecast_12m_pct.toFixed(1)}% (12m)
                  </Badge>
                )}
                <Badge tone="neutral">
                  {(it.comparables || []).length} comparables
                </Badge>
              </div>
              <div style={{
                fontFamily: 'DM Mono, monospace', fontSize: 10,
                color: 'var(--cream-3)', marginTop: 10,
              }}>
                {(it.generated_at || '').slice(0, 16).replace('T', ' ')}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Vista DETALLE
// ═════════════════════════════════════════════════════════════════════════════
function CMADetail({ cmaId, onBack, onToast }) {
  const [cma, setCma] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredCompId, setHoveredCompId] = useState(null);
  const [mySlug, setMySlug] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const r = await cmaApi.getCMA(cmaId);
        if (mounted) setCma(r);
      } catch (e) {
        if (mounted) setError(e.body?.detail || 'Error al cargar CMA');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [cmaId]);

  // W5.ASR.4 Parte 2 — Fetch slug del asesor para construir subdomain URL
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchMySlug();
        setMySlug(r?.slug || null);
      } catch (_) {
        setMySlug(null);
      }
    })();
  }, []);

  const shareUrl = mySlug ? subdomainCMAUrl(mySlug, cmaId) : (cma?.id ? publicCMAUrl(cma.id) : '');

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast?.({ kind: 'success', text: 'Link público copiado al portapapeles' });
    } catch (_) {
      window.prompt('Copia este link público:', shareUrl);
    }
  };

  const handleDownloadPdf = async () => {
    if (!cma?.id || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadCMAPdf(cma.id);
      onToast?.({ kind: 'success', text: 'PDF descargado correctamente' });
    } catch (e) {
      onToast?.({ kind: 'error', text: e.message || 'No se pudo descargar el PDF' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div data-testid="cma-detail-loading" style={{
        padding: 60, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans',
      }}>
        Cargando análisis…
      </div>
    );
  }
  if (error || !cma) {
    return (
      <Empty title="No se pudo cargar el CMA" sub={error || 'CMA no encontrado o expirado'} />
    );
  }

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <button
          data-testid="cma-back-btn"
          onClick={onBack}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--cream-2)', padding: '5px 12px', borderRadius: 9999,
            fontFamily: 'DM Sans', fontSize: 11.5, cursor: 'pointer', marginBottom: 12,
          }}>
          ← Volver a la lista
        </button>
        <PageHeader
          eyebrow="ASESOR · CMA"
          title={cma.subject_property?.colonia_name || cma.subject_property?.colonia_slug || 'CMA'}
          sub={`${cma.subject_property?.m2} m² · ${cma.subject_property?.recamaras} rec · ${cma.subject_property?.banos} bañ · ${cma.subject_property?.antiguedad} años de antigüedad`}
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                data-testid="cma-pdf-btn"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                style={{
                  padding: '8px 14px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: 'var(--cream)',
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                  cursor: downloadingPdf ? 'wait' : 'pointer',
                  opacity: downloadingPdf ? 0.6 : 1,
                }}>
                {downloadingPdf ? 'Generando PDF…' : 'Descargar PDF'}
              </button>
              <button
                data-testid="cma-share-btn"
                onClick={handleShare}
                className="btn btn-primary">
                Compartir link público
              </button>
            </div>
          }
        />
      </div>

      {/* W5.ASR.4 Parte 2 — Share URL display + OG preview */}
      {shareUrl && (
        <Card data-testid="cma-share-preview" style={{ marginBottom: 18, padding: 14 }}>
          <div style={{
            display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
          }}>
            <img
              src={cmaOgImageUrl(cma.id)}
              alt="Preview redes sociales"
              data-testid="cma-og-thumbnail"
              style={{
                width: 220, height: 'auto', aspectRatio: '1200 / 630',
                borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover',
              }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>LINK PÚBLICO</div>
              <div
                onClick={handleShare}
                style={{
                  padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream-2)',
                  cursor: 'pointer', wordBreak: 'break-all', marginBottom: 8,
                }}
                title="Click para copiar">
                {shareUrl}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
                {mySlug
                  ? 'Tu microsite asesor está vinculado a este CMA. Compártelo en WhatsApp, redes sociales o email.'
                  : 'Comparte este link público con tus clientes. La preview rich incluye valor estimado y comparables.'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sección 1: Hero KPIs */}
      <CMAKpiStrip cma={cma} />

      {/* Sección 2: Comparables (split table + map) */}
      <Card style={{ marginBottom: 18, padding: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>COMPARABLES</div>
        <div
          data-testid="cma-comparables-split"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 14,
          }}
          className="cma-split">
          <CMAComparablesTable
            comparables={cma.comparables || []}
            hoveredId={hoveredCompId}
            onRowHover={setHoveredCompId}
          />
          <CMAComparablesMap
            cma={cma}
            hoveredId={hoveredCompId}
            onMarkerHover={setHoveredCompId}
          />
        </div>
      </Card>

      {/* Sección 3: Narrative + Subscores */}
      <Card data-testid="cma-narrative" style={{ marginBottom: 18, padding: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>ANÁLISIS</div>
        <p style={{
          fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)',
          lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line',
        }}>
          {cma.narrative}
        </p>
      </Card>

      {/* Subscores */}
      <SubscoresBlock subscores={cma.subscores} narratives={cma.subscores_narratives} />

      {/* Inline responsive style override · split → stack en mobile */}
      <style>{`
        @media (max-width: 900px) {
          [data-testid="cma-comparables-split"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </>
  );
}

function SubscoresBlock({ subscores, narratives }) {
  const items = useMemo(() => {
    if (!subscores) return [];
    return Object.entries(subscores).map(([key, value]) => ({
      key,
      value: typeof value === 'number' ? value : null,
      narrative: narratives?.[key] || '',
    }));
  }, [subscores, narratives]);
  if (items.length === 0) return null;

  const labelEs = {
    lifestyle: 'Lifestyle', seguridad: 'Seguridad', transporte: 'Transporte',
    amenidades: 'Amenidades', precio: 'Precio', vibe: 'Vibe',
  };

  return (
    <Card data-testid="cma-subscores" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>SUBSCORES DE LA ZONA</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
      }}>
        {items.map(it => {
          const v = it.value ?? 50;
          const color = v >= 75 ? '#86efac' : v >= 55 ? '#fcd34d' : '#fca5a5';
          return (
            <div
              key={it.key}
              data-testid={`cma-subscore-${it.key}`}
              style={{
                padding: 12, borderRadius: 12,
                background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)',
              }}>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
              }}>
                {labelEs[it.key] || it.key}
              </div>
              <div style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
                color, letterSpacing: '-0.02em',
              }}>
                {it.value == null ? '—' : it.value.toFixed(0)}
              </div>
              {it.narrative && (
                <div style={{
                  fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)',
                  marginTop: 4, lineHeight: 1.45,
                }}>
                  {it.narrative}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Formulario GENERATE
// ═════════════════════════════════════════════════════════════════════════════
function GenerateForm({ onGenerated, onError }) {
  const [f, setF] = useState({
    colonia_slug: 'condesa',
    m2: 80,
    recamaras: 2,
    banos: 2,
    antiguedad: 8,
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const ready = f.colonia_slug && f.m2 > 0 && f.recamaras >= 0 && f.banos >= 0 && f.antiguedad >= 0;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!ready || submitting) return;
    setSubmitting(true);
    try {
      const r = await cmaApi.generateCMA({
        colonia_slug: f.colonia_slug,
        m2: +f.m2,
        recamaras: +f.recamaras,
        banos: +f.banos,
        antiguedad: +f.antiguedad,
        address: f.address || undefined,
      });
      onGenerated(r.id);
    } catch (e2) {
      onError?.(e2.body?.detail || 'No se pudo generar el CMA');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      data-testid="cma-generate-form"
      onSubmit={submit}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Labeled label="Colonia">
        <select
          data-testid="cma-form-colonia"
          value={f.colonia_slug}
          onChange={(e) => setF({ ...f, colonia_slug: e.target.value })}
          className="asr-select"
          style={inputStyle}
          required>
          {COLONIAS.map(c => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </Labeled>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Labeled label="Metros cuadrados">
          <input
            type="number"
            min="10"
            max="2000"
            data-testid="cma-form-m2"
            value={f.m2}
            onChange={(e) => setF({ ...f, m2: e.target.value })}
            style={inputStyle}
            required
          />
        </Labeled>
        <Labeled label="Antigüedad (años)">
          <input
            type="number"
            min="0"
            max="150"
            data-testid="cma-form-antiguedad"
            value={f.antiguedad}
            onChange={(e) => setF({ ...f, antiguedad: e.target.value })}
            style={inputStyle}
            required
          />
        </Labeled>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Labeled label="Recámaras">
          <input
            type="number"
            min="0"
            max="20"
            data-testid="cma-form-rec"
            value={f.recamaras}
            onChange={(e) => setF({ ...f, recamaras: e.target.value })}
            style={inputStyle}
            required
          />
        </Labeled>
        <Labeled label="Baños">
          <input
            type="number"
            min="0"
            max="20"
            data-testid="cma-form-ban"
            value={f.banos}
            onChange={(e) => setF({ ...f, banos: e.target.value })}
            style={inputStyle}
            required
          />
        </Labeled>
      </div>

      <Labeled label="Dirección (opcional)">
        <input
          type="text"
          maxLength={240}
          data-testid="cma-form-address"
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          style={inputStyle}
          placeholder="Calle, número, colonia"
        />
      </Labeled>

      <button
        type="submit"
        data-testid="cma-form-submit"
        disabled={!ready || submitting}
        className="btn btn-primary"
        style={{
          justifyContent: 'center',
          opacity: (!ready || submitting) ? 0.6 : 1,
          marginTop: 6,
        }}>
        {submitting ? 'Generando análisis…' : 'Generar CMA'}
      </button>
    </form>
  );
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </div>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--cream)',
  fontFamily: 'DM Sans',
  fontSize: 13,
  outline: 'none',
};
