// Phase 13 · Batch 36 — AsesorInventario
// Vista de inventario exclusivo de developers con acceso aprobado (whitelist)
import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import {
  Building2, MapPin, DollarSign, Phone, Mail, MessageSquare, ChevronRight, X,
  CheckCircle2, Store, ExternalLink,
} from 'lucide-react';
import { fetchDevelopments } from '../../api/marketplace';
import { getAuthorizedDevOrgs } from '../../api/advisor_whitelist';
import { Z } from '../../styles/zIndex';

function fmtPrice(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function CommissionBadge({ pct }) {
  if (!pct) return null;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: 'rgba(99,102,241,0.12)',
      border: '1px solid rgba(99,102,241,0.30)',
      color: '#818CF8',
    }}>
      Comisión {pct}%
    </span>
  );
}

function ProjectDrawer({ project, onClose }) {
  if (!project) return null;
  const devId = project.developer_id || project.dev_org_id;

  const generateTrackingLink = () => {
    const base = window.location.origin;
    const utmLink = `${base}/p/${project.id}?utm_source=asesor&utm_medium=whatsapp&utm_campaign=inventario&ref=${project.id}`;
    navigator.clipboard.writeText(utmLink).catch(() => {});
    alert('Enlace de seguimiento copiado al portapapeles');
  };

  return (
    <div
      data-testid="inventario-drawer"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(6,8,15,0.80)',
        backdropFilter: 'blur(8px)',
        zIndex: Z.MODAL, display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'rgba(13,17,28,0.98)',
        borderLeft: '1px solid var(--border)',
        height: '100%', overflowY: 'auto',
        padding: '28px 24px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 20,
              color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em',
            }}>
              {project.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <MapPin size={11} color="var(--cream-3)" />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                {project.colonia || project.neighborhood}{project.ciudad ? `, ${project.ciudad}` : ''}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Cover */}
        {(project.cover_image || project.images?.[0]) && (
          <div style={{
            width: '100%', height: 200, borderRadius: 12, overflow: 'hidden',
            background: `url(${project.cover_image || project.images[0]}) center/cover no-repeat`,
            marginBottom: 18,
          }} />
        )}

        {/* Badges row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <CommissionBadge pct={project.commission_real || project.commission_pct_real} />
          <span style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
            fontFamily: 'DM Sans', fontWeight: 700,
            background: 'rgba(74,222,128,0.10)',
            border: '1px solid rgba(74,222,128,0.30)',
            color: '#4ADE80',
          }}>
            Acceso completo
          </span>
        </div>

        {/* Price range */}
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Rango de precios
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)' }}>
            {fmtPrice(project.price_min)} — {fmtPrice(project.price_max)}
          </div>
        </div>

        {/* Description / LP */}
        {(project.description || project.lp_completa || project.sales_pitch) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Descripcion
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)',
              lineHeight: 1.65, margin: 0,
            }}>
              {project.description || project.sales_pitch || project.lp_completa}
            </p>
          </div>
        )}

        {/* Developer contact */}
        {(project.contacto_dev || project.developer_contact || project.dev_contact) && (
          <div style={{
            padding: '14px 16px', borderRadius: 10,
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.20)',
            marginBottom: 16,
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Contacto del desarrollador
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(project.contacto_dev_whatsapp || project.developer_whatsapp) && (
                <a
                  href={`https://wa.me/${(project.contacto_dev_whatsapp || project.developer_whatsapp || '').replace(/\D/g,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  data-testid="dev-whatsapp-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 9999,
                    background: 'rgba(74,222,128,0.10)',
                    border: '1px solid rgba(74,222,128,0.30)',
                    color: '#4ADE80', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  <MessageSquare size={13} /> WhatsApp
                </a>
              )}
              {(project.contacto_dev_email || project.developer_email) && (
                <a
                  href={`mailto:${project.contacto_dev_email || project.developer_email}`}
                  data-testid="dev-email-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  <Mail size={13} /> Email
                </a>
              )}
            </div>
          </div>
        )}

        {/* Share CTA */}
        <button
          data-testid="compartir-cliente-btn"
          onClick={generateTrackingLink}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 9999,
            background: 'linear-gradient(90deg,#6366F1,#EC4899)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          <ExternalLink size={14} /> Compartir con cliente (link tracking)
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AsesorInventario({ user, onLogout, withoutLayout = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const devFilter = searchParams.get('dev') || '';

  const [projects, setProjects] = useState([]);
  const [approvedDevIds, setApprovedDevIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState(null);
  const [filterDev, setFilterDev] = useState(devFilter);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devs, authResp] = await Promise.all([
        fetchDevelopments({ limit: 100 }),
        getAuthorizedDevOrgs().catch(() => ({ dev_org_ids: [] })),
      ]);
      const items = Array.isArray(devs) ? devs : (devs.items || devs.developments || []);
      const authIds = authResp.dev_org_ids || [];
      setApprovedDevIds(authIds);
      // Only show projects from approved devs
      const authSet = new Set(authIds);
      const approved = items.filter(p => {
        const did = p.developer_id || p.dev_org_id || '';
        return authSet.has(did);
      });
      setProjects(approved);
    } catch (err) {
      console.error('[AsesorInventario] load error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const devIds = [...new Set(projects.map(p => p.developer_id || p.dev_org_id).filter(Boolean))];
  const filtered = projects.filter(p => {
    if (filterDev) {
      const did = p.developer_id || p.dev_org_id || '';
      return did === filterDev;
    }
    return true;
  });

  const content = (
    <>
      <div data-testid="asesor-inventario" style={{ maxWidth: 1200 }}>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Building2 size={20} color="#818CF8" />
            <h1 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
              color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
            }}>
              Inventario Aliados
            </h1>
            {approvedDevIds.length > 0 && (
              <span style={{
                marginLeft: 6, padding: '3px 10px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.14)',
                border: '1px solid rgba(99,102,241,0.30)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5, color: '#818CF8',
              }}>
                {approvedDevIds.length} {approvedDevIds.length === 1 ? 'desarrollador aliado' : 'desarrolladores aliados'}
              </span>
            )}
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', margin: 0 }}>
            Datos exclusivos: comision real, contacto directo del desarrollador y LP completa.
          </p>
        </div>

        {/* Filter chips by dev */}
        {devIds.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            <button
              data-testid="filter-dev-all"
              onClick={() => setFilterDev('')}
              style={{
                padding: '6px 13px', borderRadius: 9999, fontSize: 12,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: !filterDev ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
                background: !filterDev ? 'rgba(99,102,241,0.16)' : 'transparent',
                color: !filterDev ? '#818CF8' : 'var(--cream-3)',
              }}
            >
              Todos
            </button>
            {devIds.map(did => (
              <button
                key={did}
                data-testid={`filter-dev-${did}`}
                onClick={() => setFilterDev(did)}
                style={{
                  padding: '6px 13px', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                  border: filterDev === did ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
                  background: filterDev === did ? 'rgba(99,102,241,0.16)' : 'transparent',
                  color: filterDev === did ? '#818CF8' : 'var(--cream-3)',
                }}
              >
                {did}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando inventario…
          </div>
        ) : filtered.length === 0 ? (
          <div data-testid="inventario-empty" style={{
            textAlign: 'center', padding: 80,
            color: 'var(--cream-3)', fontFamily: 'DM Sans',
          }}>
            <Building2 size={40} color="var(--cream-3)" style={{ marginBottom: 14 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>
              {approvedDevIds.length === 0
                ? 'Sin desarrolladores aliados'
                : 'Sin proyectos disponibles'}
            </div>
            <div style={{ marginBottom: 18 }}>
              {approvedDevIds.length === 0
                ? 'Solicita acceso desde el Mini Market para empezar a colaborar.'
                : 'Aplica filtros distintos.'}
            </div>
            {approvedDevIds.length === 0 && (
              <button
                data-testid="ir-mini-market-btn"
                onClick={() => navigate('/asesor/mini-market')}
                style={{
                  padding: '10px 22px', borderRadius: 9999,
                  background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                <Store size={14} /> Ir al Mini Market
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(p => {
              const cover = p.cover_image || p.images?.[0];
              const devId = p.developer_id || p.dev_org_id;
              const commission = p.commission_real || p.commission_pct_real;
              return (
                <div
                  key={p.id}
                  data-testid={`inventario-card-${p.id}`}
                  onClick={() => setActiveDrawer(p)}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color 250ms, transform 250ms',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--surface-2)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Cover */}
                  <div style={{
                    height: 160,
                    background: cover
                      ? `url(${cover}) center/cover no-repeat`
                      : 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(236,72,153,0.15))',
                    position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 10, left: 10,
                      display: 'flex', gap: 6,
                    }}>
                      <span style={{
                        padding: '3px 9px', borderRadius: 9999, fontSize: 11,
                        fontFamily: 'DM Sans', fontWeight: 700,
                        background: 'rgba(74,222,128,0.18)',
                        border: '1px solid rgba(74,222,128,0.40)',
                        color: '#4ADE80',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <CheckCircle2 size={10} /> Aliado
                      </span>
                    </div>
                    {commission && (
                      <div style={{
                        position: 'absolute', top: 10, right: 10,
                        padding: '3px 9px', borderRadius: 9999, fontSize: 11,
                        fontFamily: 'DM Sans', fontWeight: 700,
                        background: 'rgba(99,102,241,0.18)',
                        border: '1px solid rgba(99,102,241,0.40)',
                        color: '#818CF8',
                      }}>
                        {commission}% comision
                      </div>
                    )}
                  </div>
                  {/* Body */}
                  <div style={{ padding: '14px 16px 16px' }}>
                    <h3 style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5,
                      color: 'var(--cream)', margin: '0 0 4px', letterSpacing: '-0.02em',
                    }}>
                      {p.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <MapPin size={11} color="var(--cream-3)" />
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                        {p.colonia || p.neighborhood}{p.ciudad ? `, ${p.ciudad}` : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', fontWeight: 600 }}>
                        {fmtPrice(p.price_min)} — {fmtPrice(p.price_max)}
                      </span>
                      <ChevronRight size={14} color="var(--cream-3)" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeDrawer && (
        <ProjectDrawer project={activeDrawer} onClose={() => setActiveDrawer(null)} />
      )}
    </>
  );

  if (withoutLayout) return content;
  return <AdvisorLayout user={user} onLogout={onLogout}>{content}</AdvisorLayout>;
}
