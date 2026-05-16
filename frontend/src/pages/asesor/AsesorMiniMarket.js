// Phase 13 · Batch 36 — AsesorMiniMarket
// Vista pública de todos los proyectos con estado whitelist por developer
import React, { useEffect, useState, useCallback, useRef } from 'react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import SolicitudAccesoModal from '../../components/asesor/SolicitudAccesoModal';
import { useNavigate } from 'react-router-dom';
import {
  Store, Building2, MapPin, DollarSign, Clock, CheckCircle2, XCircle, AlertCircle, ChevronRight,
} from 'lucide-react';
import { fetchDevelopments } from '../../api/marketplace';
import { getMyWhitelistRequests } from '../../api/advisor_whitelist';
import { Z } from '../../styles/zIndex';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const FILTER_LABELS = {
  '': 'Todos',
  'none': 'Sin acceso',
  'pending': 'Pendiente',
  'approved': 'Aprobado',
  'rejected': 'Rechazado',
};

const STATUS_CONFIG = {
  none: {
    label: 'Sin acceso', color: 'rgba(240,235,224,0.35)',
    bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.10)',
  },
  pending: {
    label: 'Pendiente', color: '#FACC15',
    bg: 'rgba(250,204,21,0.10)', bd: 'rgba(250,204,21,0.35)',
  },
  approved: {
    label: 'Acceso aprobado', color: '#4ADE80',
    bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.35)',
  },
  rejected: {
    label: 'Rechazado', color: '#F87171',
    bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.30)',
  },
  revoked: {
    label: 'Revocado', color: '#F87171',
    bg: 'rgba(239,68,68,0.08)', bd: 'rgba(239,68,68,0.30)',
  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.none;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.color,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {status === 'approved' && <CheckCircle2 size={10} />}
      {status === 'pending' && <Clock size={10} />}
      {(status === 'rejected' || status === 'revoked') && <XCircle size={10} />}
      {status === 'none' && <AlertCircle size={10} />}
      {cfg.label}
    </span>
  );
}

function ProjectCard({ project, authStatus, authDoc, onSolicitar, onVerInventario }) {
  const cover = project.cover_image || project.images?.[0] || null;
  const devId = project.developer_id || project.dev_org_id;
  const isRejected = authStatus === 'rejected';
  const cooldownDone = !isRejected || (() => {
    if (!authDoc?.decided_at) return true;
    const decided = new Date(authDoc.decided_at);
    const diffDays = (Date.now() - decided.getTime()) / (1000 * 86400);
    return diffDays >= 30;
  })();

  return (
    <div
      data-testid={`project-card-${project.id}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, overflow: 'hidden',
        transition: 'border-color 250ms, transform 250ms',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.30)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Cover */}
      <div style={{
        height: 148, background: cover
          ? `url(${cover}) center/cover no-repeat`
          : 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(236,72,153,0.15))',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 10, left: 10,
        }}>
          <StatusBadge status={authStatus} />
        </div>
        {authStatus === 'approved' && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'rgba(74,222,128,0.20)',
            border: '1px solid rgba(74,222,128,0.40)',
            borderRadius: 9999, padding: '3px 9px',
            fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: '#4ADE80',
          }}>
            Inventario completo disponible
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 16px' }}>
        <h3 style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 15.5,
          color: 'var(--cream)', margin: '0 0 4px', letterSpacing: '-0.02em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {project.name}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <MapPin size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)' }}>
            {project.colonia || project.neighborhood}{project.ciudad ? `, ${project.ciudad}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
          <DollarSign size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.50)' }}>
            {fmtPrice(project.price_min)} — {fmtPrice(project.price_max)}
          </span>
          <span style={{
            marginLeft: 4, padding: '1px 7px', borderRadius: 9999, fontSize: 10.5,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(240,235,224,0.45)', fontFamily: 'DM Sans',
          }}>
            {devId || 'Developer'}
          </span>
        </div>

        {/* CTA */}
        <div>
          {authStatus === 'approved' && (
            <button
              data-testid={`ver-inventario-btn-${project.id}`}
              onClick={() => onVerInventario(devId)}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              Ver inventario completo <ChevronRight size={14} />
            </button>
          )}

          {authStatus === 'pending' && (
            <div style={{
              width: '100%', padding: '9px 0', borderRadius: 9999,
              background: 'rgba(250,204,21,0.08)',
              border: '1px solid rgba(250,204,21,0.25)',
              color: '#FACC15', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              textAlign: 'center',
            }}>
              Solicitud pendiente de respuesta
            </div>
          )}

          {authStatus === 'none' && (
            <button
              data-testid={`solicitar-acceso-btn-${project.id}`}
              onClick={() => onSolicitar(project)}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 9999,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              Solicitar acceso
            </button>
          )}

          {(authStatus === 'rejected' || authStatus === 'revoked') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {authDoc?.comentario_decision && (
                <div style={{
                  padding: '6px 10px', borderRadius: 7,
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.20)',
                  fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.50)',
                  lineHeight: 1.4,
                }}>
                  Motivo: {authDoc.comentario_decision}
                </div>
              )}
              {cooldownDone ? (
                <button
                  data-testid={`reintentar-btn-${project.id}`}
                  onClick={() => onSolicitar(project)}
                  style={{
                    width: '100%', padding: '9px 0', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)',
                    border: '1px solid rgba(99,102,241,0.28)',
                    color: '#818CF8',
                    fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Solicitar nuevamente
                </button>
              ) : (
                <div style={{
                  width: '100%', padding: '9px 0', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(240,235,224,0.30)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
                  textAlign: 'center',
                }}>
                  Disponible en 30 dias
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AsesorMiniMarket({ user, onLogout }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [authMap, setAuthMap] = useState({}); // dev_org_id → { status, doc }
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterZona, setFilterZona] = useState('');
  const [solicitar, setSolicitar] = useState(null); // project being solicited
  const [successMsg, setSuccessMsg] = useState('');
  const toastTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [devs, authResp] = await Promise.all([
        fetchDevelopments({ limit: 100 }),
        getMyWhitelistRequests().catch(() => ({ items: [] })),
      ]);

      const items = Array.isArray(devs) ? devs : (devs.items || devs.developments || []);
      setProjects(items);

      // Build authMap: dev_org_id → { status, doc }
      const map = {};
      for (const a of (authResp.items || [])) {
        const did = a.dev_org_id;
        // Keep highest-priority status per dev_org: approved > pending > rejected > revoked
        const PRIORITY = { approved: 4, pending: 3, rejected: 2, revoked: 1 };
        const cur = map[did];
        if (!cur || (PRIORITY[a.status] || 0) > (PRIORITY[cur.status] || 0)) {
          map[did] = { status: a.status, doc: a };
        }
      }
      setAuthMap(map);
    } catch (err) {
      console.error('[AsesorMiniMarket] load error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getAuthStatus = (project) => {
    const devId = project.developer_id || project.dev_org_id || '';
    return authMap[devId]?.status || 'none';
  };

  const getAuthDoc = (project) => {
    const devId = project.developer_id || project.dev_org_id || '';
    return authMap[devId]?.doc || null;
  };

  const handleSolicitar = (project) => {
    setSolicitar(project);
  };

  const handleVerInventario = (devId) => {
    navigate(`/asesor/inventario?dev=${devId}`);
  };

  const handleSolicitudSuccess = (result) => {
    setSolicitar(null);
    if (result.status === 'approved' && result.auto_approved) {
      setSuccessMsg('Acceso aprobado automaticamente. Ya puedes ver el inventario completo.');
      setTimeout(() => navigate('/asesor/inventario'), 1800);
    } else {
      setSuccessMsg('Solicitud enviada. Te avisamos cuando el desarrollador responda.');
    }
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSuccessMsg(''), 4000);
    load();
  };

  // Filtrar proyectos
  const zonas = [...new Set(projects.map(p => p.colonia || p.neighborhood).filter(Boolean))].sort();
  const filtered = projects.filter(p => {
    const authStatus = getAuthStatus(p);
    if (filterStatus && authStatus !== filterStatus) return false;
    if (filterZona) {
      const zona = (p.colonia || p.neighborhood || '').toLowerCase();
      if (!zona.includes(filterZona.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div data-testid="asesor-mini-market" style={{ maxWidth: 1200 }}>

        {/* Toast */}
        {successMsg && (
          <div data-testid="solicitud-success-toast" style={{
            position: 'fixed', top: 20, right: 20, zIndex: Z.TOAST,
            padding: '12px 20px', borderRadius: 12,
            background: 'rgba(74,222,128,0.15)',
            border: '1px solid rgba(74,222,128,0.40)',
            color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 13.5, fontWeight: 600,
            backdropFilter: 'blur(24px)',
            maxWidth: 400,
          }}>
            {successMsg}
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Store size={20} color="#818CF8" />
            <h1 style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 26,
              color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em',
            }}>
              Mini Market
            </h1>
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0 }}>
            Explora toda la oferta y solicita acceso al inventario exclusivo de tus desarrolladores aliados.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(FILTER_LABELS).map(([k, label]) => (
              <button
                key={k}
                data-testid={`filter-status-${k || 'all'}`}
                onClick={() => setFilterStatus(k)}
                style={{
                  padding: '6px 13px', borderRadius: 9999, fontSize: 12,
                  fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                  border: filterStatus === k
                    ? '1px solid rgba(99,102,241,0.55)'
                    : '1px solid rgba(255,255,255,0.10)',
                  background: filterStatus === k
                    ? 'rgba(99,102,241,0.16)'
                    : 'transparent',
                  color: filterStatus === k ? '#818CF8' : 'rgba(240,235,224,0.50)',
                  transition: 'all 180ms',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Zona filter */}
          <div style={{ marginLeft: 'auto' }}>
            <select
              data-testid="filter-zona"
              value={filterZona}
              onChange={e => setFilterZona(e.target.value)}
              style={{
                padding: '7px 13px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12, outline: 'none',
              }}
            >
              <option value="">Todas las zonas</option>
              {zonas.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Cargando proyectos…
          </div>
        ) : filtered.length === 0 ? (
          <div data-testid="mini-market-empty" style={{
            textAlign: 'center', padding: 80,
            color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 13,
          }}>
            <Store size={40} color="rgba(240,235,224,0.20)" style={{ marginBottom: 14 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', marginBottom: 6 }}>
              Sin proyectos disponibles
            </div>
            <div>Aplica filtros distintos o espera nuevos proyectos.</div>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {filtered.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                authStatus={getAuthStatus(p)}
                authDoc={getAuthDoc(p)}
                onSolicitar={handleSolicitar}
                onVerInventario={handleVerInventario}
              />
            ))}
          </div>
        )}
      </div>

      {/* Solicitud Modal */}
      {solicitar && (
        <SolicitudAccesoModal
          dev_org_id={solicitar.developer_id || solicitar.dev_org_id || ''}
          dev_name={solicitar.developer_name || solicitar.developer_id || ''}
          onClose={() => setSolicitar(null)}
          onSuccess={handleSolicitudSuccess}
        />
      )}
    </AdvisorLayout>
  );
}
