// /asesor/contactos — list + detail drawer with argumentario AI
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pin, Archive, ListPlus, Thermometer, Eye, Check, X as XIcon, MessageCircle } from 'lucide-react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast, fmtMXN } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import SenalesCalientesCard from '../../components/asesor/SenalesCalientesCard';
import { Search, Sparkle, MessageSquare, ArrowRight } from '../../components/icons';
import { Z } from '../../styles/zIndex';
import BuyerScoreBadge from '../../components/asesor/BuyerScoreBadge';
import SmartListsSidebar from '../../components/asesor/SmartListsSidebar';
import SourceBadge from '../../components/asesor/SourceBadge';
import { getLeadsInPreset, getSmartListPresets, getSmartListCounts } from '../../api/smart_lists';
// Sistema de Diseño asesor (tema claro)
import {
  ActionBar, ViewToggle, ScoreBar,
  PremiumCard, Ficha360, tempMeta,
  ETAPA, ETAPA_ORDER, etapaMeta,
} from '../../components/asesor/design';
// Modo demo (?demo=1) · datos hardcodeados espejo del mockup para EVALUAR el diseño.
import {
  DEMO_LEADS, DEMO_BUSQ, DEMO_ACTION, DEMO_META, DEMO_COL, DEMO_FOCO, DEMO_PERFIL, demoLeadById,
} from './demoData';

// Flag de rollout · V2 = rediseño Leads (Sistema de Diseño asesor). OFF por
// defecto (incluso sin la env var); ON en .env.local mientras se valida.
const LEADS_V2 = process.env.REACT_APP_LEADS_V2 === 'true';

const TIPOS = ['comprador', 'vendedor', 'propietario', 'inversor', 'broker'];
const TEMPS = ['frio', 'tibio', 'caliente', 'cliente'];
const SOURCES = ['email_alias', 'portal_inmuebles24', 'portal_lamudi', 'fb_lead_ads', 'landing', 'manual'];
const SOURCE_LABELS = {
  email_alias: 'Email alias', portal_inmuebles24: 'Inmuebles24',
  portal_lamudi: 'Lamudi', fb_lead_ads: 'FB Lead Ads',
  landing: 'Landing', manual: 'Manual',
};

// Default export: elige V2 (rediseño) o la pantalla clásica según el flag.
// La versión vieja queda INTACTA debajo hasta validar V2.
export default function AsesorContactos(props) {
  return LEADS_V2 ? <AsesorContactosV2 {...props} /> : <AsesorContactosLegacy {...props} />;
}

function AsesorContactosLegacy({ user, onLogout }) {
  const { t } = useTranslation('p5_ux');
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [list, setList] = useState([]);
  // P5.B · selección múltiple (bulk) + ver archivados
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(null);  // null | 'temp' | 'task'
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [temp, setTemp] = useState('');
  const [scoreMin, setScoreMin] = useState(() => parseInt(searchParams.get('score_min') || '0', 10));
  const [sortBy, setSortBy] = useState('score');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);  // distingue "falló la carga" de "bandeja vacía"
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showArg, setShowArg] = useState(false);
  const [devs, setDevs] = useState([]);
  // W5.ASR.3 Parte 1 — Smart List filter
  const [smartList, setSmartList] = useState(() => searchParams.get('smart_list') || null);
  // W5.ASR.5 Parte 2 — Source filter
  const [sourceFilter, setSourceFilter] = useState(() => searchParams.get('source') || '');

  const load = async () => {
    setLoading(true);
    setLoadErr(false);
    try {
      if (smartList) {
        // Smart list activa: usar endpoint smart-lists en lugar de listado standard
        const r = await getLeadsInPreset(smartList, { limit: 200 });
        let items = r.items || [];
        if (sortBy === 'score') {
          items.sort((a, b) => ((b.buyer_score?.value) || 0) - ((a.buyer_score?.value) || 0));
        }
        setList(items);
      } else {
        const params = { q, tipo, temp };
        if (scoreMin > 0) params.score_min = scoreMin;
        if (sourceFilter) params.source = sourceFilter;
        const items = await api.listContactos(params);
        if (sortBy === 'score') {
          items.sort((a, b) => ((b.buyer_score?.value) || 0) - ((a.buyer_score?.value) || 0));
        }
        setList(items);
      }
    } catch (e) {
      setLoadErr(true);
    } finally { setLoading(false); }
  };

  // Sync URL params (score_min + smart_list + source)
  useEffect(() => {
    const params = {};
    if (scoreMin > 0 && !smartList) params.score_min = String(scoreMin);
    if (smartList) params.smart_list = smartList;
    if (sourceFilter) params.source = sourceFilter;
    setSearchParams(params, { replace: true });
  }, [scoreMin, smartList, sourceFilter]); // eslint-disable-line

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [q, tipo, temp, scoreMin, sortBy, smartList, sourceFilter]);

  const [reco, setReco] = useState(null);   // recomendación por señales reales del lead (cierra loop comprador→asesor)
  useEffect(() => {
    if (id) {
      api.getContacto(id).then(setSelected).catch(() => {});
      setReco(null);
      api.getRecomendacion(id).then(setReco).catch(() => {});
    } else { setSelected(null); setReco(null); }
  }, [id]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`, { credentials: 'include' }).then(r => r.json()).then(setDevs).catch(() => setDevs([]));
  }, []);

  const openContact = (c) => {
    // W5.ASR.3 Parte 1 — leads de smart list no son contactos · skip drawer
    if (c._smart_list_lead) {
      setToast({ kind: 'info', text: 'Este es un lead del pipeline · ábrelo desde el Kanban' });
      return;
    }
    // P5.B · track recent (best-effort · no bloquea navegación)
    api.trackRecent({
      entity_type: 'lead', entity_id: c.id,
      label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Lead',
      url: `/asesor/contactos/${c.id}`,
    }).catch(() => {});
    nav(`/asesor/contactos/${c.id}`);
  };
  const closeDetail = () => nav('/asesor/contactos');

  // P5.B · lista mostrada: filtra archivados (salvo toggle) + fija pinned al top (estable).
  const display = useMemo(() => {
    const arr = list.filter((c) => (showArchived ? true : !c.archived));
    return [...arr].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [list, showArchived]);

  // P5.B · selección
  const toggleSelect = (cid) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(cid) ? next.delete(cid) : next.add(cid);
    return next;
  });
  const allVisibleSelected = display.length > 0 && display.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () => setSelectedIds(() => (
    allVisibleSelected ? new Set() : new Set(display.map((c) => c.id))
  ));
  const clearSelection = () => { setSelectedIds(new Set()); setBulkMode(null); };

  // P5.B · pin toggle (optimista + persiste)
  const togglePin = async (c) => {
    setList((prev) => prev.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)));
    try { await api.pinContacto(c.id); } catch (_) { load(); }
  };

  // P5.B · bulk actions
  const runBulk = async (action, payload) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const r = await api.bulkContactos(ids, action, payload);
      setToast({ kind: 'success', text: t('bulk.done', { count: r.affected ?? ids.length }) });
      clearSelection();
      await load();
    } catch (e) {
      setToast({ kind: 'error', text: e.message || 'No se pudo aplicar' });
    } finally { setBulkBusy(false); }
  };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow="CRM · CONTACTOS"
        title="Contactos"
        sub="Búsqueda instantánea, filtros por tipo y temperatura, y timeline con todas las interacciones."
        actions={
          <button onClick={() => setShowCreate(true)} data-testid="new-contact-btn" className="btn btn-primary">
            + Nuevo contacto
          </button>
        }
      />

      <div
        data-testid="contactos-layout"
        style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}
        className="contactos-layout">
        <SmartListsSidebar
          activePreset={smartList}
          onSelectPreset={(k) => setSmartList(k)}
          onClear={() => setSmartList(null)}
        />

        <div style={{ flex: 1, minWidth: 0 }}>

      <Card style={{ marginBottom: 14, padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200,
            padding: '8px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 9999 }}>
            <Search size={13} color="var(--cream-3)" />
            <input data-testid="contact-search" placeholder="Buscar por nombre o teléfono…"
              value={q} onChange={e => setQ(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--cream)',
                fontFamily: 'DM Sans', fontSize: 13, flex: 1 }} />
          </div>
          <select data-testid="filter-tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="asr-select">
            <option value="">Tipo · todos</option>
            {TIPOS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select data-testid="filter-temp" value={temp} onChange={e => setTemp(e.target.value)} className="asr-select">
            <option value="">Temperatura · todas</option>
            {TEMPS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          {/* W5.ASR.5 P2 — Filtro por fuente · URL sync ?source=xxx */}
          <select data-testid="filter-source" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="asr-select">
            <option value="">Fuente · todas</option>
            {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </select>
          {/* W5.4 Sub-B — Sort por score */}
          <select
            data-testid="sort-by-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="asr-select"
          >
            <option value="score">Por score (alto a bajo)</option>
            <option value="created_at">Por fecha de creacion</option>
          </select>
          {/* W5.4 Sub-B — Filtro score minimo · oculto cuando smart_list activa (mutuamente exclusivo) */}
          {!smartList && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', whiteSpace: 'nowrap' }}>
              Score min: <strong style={{ color: scoreMin > 0 ? '#86efac' : 'var(--cream-2)' }}>{scoreMin > 0 ? scoreMin : 'cualquiera'}</strong>
            </span>
            <input
              data-testid="score-min-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={scoreMin}
              onChange={e => setScoreMin(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', accentColor: '#6366f1' }}
            />
          </div>
          )}
          {smartList && (
            <div data-testid="smart-list-active-badge" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.32)',
              color: '#a5b4fc', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600,
            }}>
              Smart list activa: {smartList}
              <button
                data-testid="smart-list-inline-clear"
                onClick={() => setSmartList(null)}
                style={{
                  background: 'transparent', border: 'none', color: 'inherit',
                  cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
                }}>×</button>
            </div>
          )}
        </div>
      </Card>

      {/* P5.B · barra de acciones en lote (aparece al seleccionar) */}
      {selectedIds.size > 0 && (
        <Card data-testid="bulk-bar" style={{ marginBottom: 12, padding: 12, borderColor: 'rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong data-testid="bulk-count" style={{ color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13 }}>
              {t('bulk.selected', { count: selectedIds.size })}
            </strong>
            <div style={{ flex: 1 }} />
            {bulkMode === 'temp' ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>{t('bulk.pick_temp', 'Elige temperatura')}:</span>
                {TEMPS.map((x) => (
                  <button key={x} disabled={bulkBusy} data-testid={`bulk-temp-${x}`} className="btn btn-glass btn-sm"
                    onClick={() => runBulk('set_temp', { temperatura: x })}>{x}</button>
                ))}
                <button className="btn btn-glass btn-sm" onClick={() => setBulkMode(null)}>{t('bulk.cancel', 'Cancelar')}</button>
              </div>
            ) : bulkMode === 'task' ? (
              <BulkTaskForm busy={bulkBusy} onCancel={() => setBulkMode(null)} onSubmit={(pl) => runBulk('assign_task', pl)} t={t} />
            ) : (
              <>
                <button disabled={bulkBusy} data-testid="bulk-move-stage" className="btn btn-glass btn-sm" onClick={() => setBulkMode('temp')}>
                  <Thermometer size={13} /> {t('bulk.move_stage', 'Mover temperatura')}
                </button>
                <button disabled={bulkBusy} data-testid="bulk-assign-task" className="btn btn-glass btn-sm" onClick={() => setBulkMode('task')}>
                  <ListPlus size={13} /> {t('bulk.assign_task', 'Asignar tarea')}
                </button>
                <button disabled={bulkBusy} data-testid="bulk-archive" className="btn btn-glass btn-sm" onClick={() => runBulk('archive')}>
                  <Archive size={13} /> {t('bulk.archive', 'Archivar')}
                </button>
                <button disabled={bulkBusy} data-testid="bulk-clear" className="btn btn-glass btn-sm" onClick={clearSelection}>
                  {t('bulk.clear', 'Limpiar selección')}
                </button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* P5.B · ver archivados */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button data-testid="toggle-archived" className="btn btn-glass btn-sm"
          onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? t('hide_archived', 'Ocultar archivados') : t('show_archived', 'Ver archivados')}
        </button>
      </div>

      {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
        : loadErr ? <Empty title="No pudimos cargar tus contactos" sub="Revisa tu conexión e inténtalo de nuevo." cta={<button className="btn btn-primary" onClick={load}>Reintentar</button>} />
        : display.length === 0 ? <Empty title={smartList ? 'Sin leads en este filtro' : 'Sin contactos'} sub={smartList ? 'Prueba con otra smart list o limpia el filtro.' : 'Crea tu primer contacto o ajusta filtros.'} />
        : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table data-testid="contacts-table" style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 10px', width: 36 }}>
                    <input type="checkbox" data-testid="bulk-select-all" checked={allVisibleSelected}
                      onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: '#6366f1' }} />
                  </th>
                  <th style={{ width: 28 }} />
                  {['Nombre', 'Fuente', 'Tipo', 'Temperatura', 'Score', 'Tags', 'Teléfono', 'Email', ''].map(c => (
                    <th key={c} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.map(c => (
                  <tr key={c.id} data-testid={`contact-row-${c.id}`}
                    onClick={() => openContact(c)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s',
                      background: selectedIds.has(c.id) ? 'rgba(99,102,241,0.08)' : 'transparent' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = selectedIds.has(c.id) ? 'rgba(99,102,241,0.08)' : 'transparent'}>
                    <td style={{ padding: '11px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" data-testid={`bulk-select-${c.id}`} checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer', accentColor: '#6366f1' }} />
                    </td>
                    <td style={{ padding: '11px 4px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button data-testid={`pin-${c.id}`} title={c.pinned ? t('pin.unpin', 'Quitar de fijados') : t('pin.pin', 'Fijar arriba')}
                        onClick={() => togglePin(c)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
                        <Pin size={13} color={c.pinned ? '#a5b4fc' : 'var(--cream-3)'} fill={c.pinned ? '#a5b4fc' : 'none'} />
                      </button>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream)', fontWeight: 500, fontSize: 13 }}>{c.first_name} {c.last_name}</td>
                    {/* W5.ASR.5 P2 — SourceBadge */}
                    <td style={{ padding: '11px 14px' }}>
                      <SourceBadge source={c.source} date={c.created_at} />
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-2)', fontSize: 12 }}>{c.tipo}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <Badge tone={c.temperatura === 'caliente' ? 'bad' : c.temperatura === 'tibio' ? 'warn' : c.temperatura === 'cliente' ? 'ok' : 'neutral'}>
                        {c.temperatura}
                      </Badge>
                    </td>
                    {/* W5.4 Sub-B — Buyer Score Badge */}
                    <td style={{ padding: '11px 14px' }} data-testid={`score-cell-${c.id}`}>
                      <BuyerScoreBadge
                        score={c.buyer_score?.value}
                        tier={c.buyer_score?.tier}
                        delta={c.buyer_score?.delta_pct}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-3)', fontSize: 12 }}>
                      {(c.tags || []).slice(0, 3).join(' · ')}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{c.phones?.[0]}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--cream-3)', fontSize: 12 }}>{c.emails?.[0]}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <ArrowRight size={12} color="var(--cream-3)" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}

      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo contacto">
        <CreateContactForm onCreated={(c) => { setShowCreate(false); setToast({ kind: 'success', text: 'Contacto creado' }); load(); nav(`/asesor/contactos/${c.id}`); }} onError={(t) => setToast({ kind: 'error', text: t })} />
      </Drawer>

      <Drawer open={!!selected} onClose={closeDetail} title={selected ? `${selected.first_name} ${selected.last_name || ''}` : ''} width={620}>
        {selected && (
          <ContactDetail contact={selected} devs={devs}
            onOpenArg={() => setShowArg(true)}
            onReload={async () => { const c = await api.getContacto(selected.id); setSelected(c); }}
            onNote={() => setToast({ kind: 'success', text: 'Nota registrada' })} />
        )}
        {selected && reco && !reco.sin_senales && (reco.recomendaciones || []).length > 0 && (
          <div style={{ margin: '14px 16px', padding: 14, borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(124,92,255,0.05)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Qué ofrecerle <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>(según lo que este lead miró)</span></div>
            {(reco.features_del_lead || []).length > 0 && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Le interesa: {(reco.features_del_lead || []).slice(0, 5).map((f) => f.feature).join(' · ')}</div>
            )}
            {(reco.recomendaciones || []).slice(0, 4).map((r) => (
              <div key={r.dev} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span><strong>{r.name}</strong> <span style={{ color: '#888' }}>· {r.colonia}</span></span>
                <span style={{ fontSize: 11, color: 'var(--theme)' }}>{(r.features_match || []).slice(0, 3).join(', ')}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer open={showArg} onClose={() => setShowArg(false)} title="Plan venta IA · Claude" width={560}>
        {selected && <ArgumentarioForm contact={selected} devs={devs} onDone={() => setToast({ kind: 'success', text: 'Mensaje generado' })} />}
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

        </div>
      </div>

      <style>{`
        .asr-select { padding: 8px 14px; border-radius: 9999px; background: var(--surface-2); border: 1px solid var(--border); color: var(--cream-2); font-family: 'DM Sans'; font-size: 12px; outline: none; }
        @media (max-width: 768px) {
          .contactos-layout { flex-direction: column; }
        }
      `}</style>
    </AdvisorLayout>
  );
}

// P5.B · mini-form de "asignar tarea" en lote (título + fecha)
function BulkTaskForm({ busy, onCancel, onSubmit, t }) {
  const [titulo, setTitulo] = useState('');
  const [due, setDue] = useState('');
  const submit = () => {
    if (!titulo.trim() || !due) return;
    onSubmit({ titulo: titulo.trim(), due_at: new Date(due).toISOString(), prioridad: 'media' });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input data-testid="bulk-task-title" value={titulo} onChange={(e) => setTitulo(e.target.value)}
        placeholder={t('bulk.task_title', 'Título de la tarea')}
        style={{ padding: '7px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', minWidth: 180 }} />
      <input data-testid="bulk-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
        style={{ padding: '7px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
      <button disabled={busy || !titulo.trim() || !due} data-testid="bulk-task-submit" className="btn btn-primary btn-sm" onClick={submit}>
        {t('bulk.confirm', 'Aplicar')}
      </button>
      <button className="btn btn-glass btn-sm" onClick={onCancel}>{t('bulk.cancel', 'Cancelar')}</button>
    </div>
  );
}

function CreateContactForm({ onCreated, onError, entityLabel = 'contacto' }) {
  const [f, setF] = useState({ first_name: '', last_name: '', phone: '', email: '', tipo: 'comprador', temperatura: 'frio', tags: '' });
  const [sub, setSub] = useState(false);
  const submit = async () => {
    if (!f.first_name.trim()) return;
    setSub(true);
    try {
      const created = await api.createContacto({
        first_name: f.first_name, last_name: f.last_name,
        phones: f.phone ? [f.phone] : [],
        emails: f.email ? [f.email] : [],
        tipo: f.tipo, temperatura: f.temperatura,
        tags: f.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onCreated(created);
    } catch (e) {
      onError(e.body?.detail?.message ? `${e.body.detail.message}` : 'No se pudo crear');
    } finally { setSub(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[
        { k: 'first_name', label: 'Nombre *' },
        { k: 'last_name', label: 'Apellido' },
        { k: 'phone', label: 'Teléfono' },
        { k: 'email', label: 'Email' },
      ].map(({ k, label }) => (
        <label key={k}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
          <input data-testid={`new-contact-${k}`} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}
            style={{ width: '100%', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
        </label>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Tipo</div>
          <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} className="asr-select" style={{ width: '100%' }}>
            {TIPOS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Temperatura</div>
          <select value={f.temperatura} onChange={e => setF({ ...f, temperatura: e.target.value })} className="asr-select" style={{ width: '100%' }}>
            {TEMPS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <label>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Tags (separados por coma)</div>
        <input data-testid="new-contact-tags" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })}
          style={{ width: '100%', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
      </label>
      <button onClick={submit} disabled={sub || !f.first_name.trim()} data-testid="new-contact-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: (sub || !f.first_name.trim()) ? 0.6 : 1 }}>
        {sub ? 'Creando…' : `Crear ${entityLabel}`}
      </button>
    </div>
  );
}

function ContactDetail({ contact, devs, onOpenArg, onReload, onNote }) {
  const [note, setNote] = useState('');
  const waPhone = (contact.phones?.[0] || '').replace(/\D/g, '');
  const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent('Hola ' + contact.first_name + ', ')}` : null;

  const addNote = async () => {
    if (!note.trim()) return;
    await api.addTimelineEntry(contact.id, { kind: 'nota', body: note });
    setNote('');
    onNote();
    onReload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <Card style={{ padding: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Tipo</div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{contact.tipo}</div>
        </Card>
        <Card style={{ padding: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Temperatura</div>
          <div><Badge tone={contact.temperatura === 'caliente' ? 'bad' : contact.temperatura === 'tibio' ? 'warn' : contact.temperatura === 'cliente' ? 'ok' : 'neutral'}>{contact.temperatura}</Badge></div>
        </Card>
      </div>

      {contact.phones?.length > 0 && (
        <Card style={{ padding: 12 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Teléfonos</div>
          {contact.phones.map(p => <div key={p} style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)' }}>{p}</div>)}
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onOpenArg} data-testid="open-arg" className="btn btn-primary">
          <Sparkle size={12} />
          Generar plan venta IA
        </button>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" data-testid="wa-contact" className="btn btn-glass">
            <MessageSquare size={12} />
            WhatsApp
          </a>
        )}
      </div>

      <Card style={{ padding: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Timeline</div>
        {(contact.timeline || []).length === 0 ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Sin interacciones registradas aún.</div>
        ) : contact.timeline.slice(0, 10).map(e => (
          <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
            <Badge tone="brand">{e.kind}</Badge>
            <span style={{ marginLeft: 8 }}>{e.body}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input data-testid="add-note-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Agregar nota…"
            style={{ flex: 1, padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
          <button onClick={addNote} data-testid="add-note-btn" className="btn btn-glass btn-sm">Guardar</button>
        </div>
      </Card>
    </div>
  );
}

function ArgumentarioForm({ contact, devs, onDone }) {
  const [devId, setDevId] = useState(devs[0]?.id || '');
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoverCitation, setHoverCitation] = useState(null);
  const [copied, setCopied] = useState(null);   // 'text' | 'wa' | 'err' — feedback de copiado

  const run = async () => {
    setLoading(true);
    try {
      const r = await api.generateArgumentarioRag({
        contact_id: contact.id,
        development_id: devId || null,
        force: false,
      });
      setOut(r); onDone();
    } catch (e) {
      setOut({ error: e.message || String(e) });
    } finally { setLoading(false); }
  };

  // Inject [n] citation pills inside paragraph text
  const renderPara = (txt, idx) => {
    if (!txt) return null;
    const parts = String(txt).split(/(\[\d+\])/g);
    return (
      <p key={idx} style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', lineHeight: 1.7, margin: '0 0 10px' }}>
        {parts.map((p, i) => {
          const m = p.match(/^\[(\d+)\]$/);
          if (!m) return <span key={i}>{p}</span>;
          const cidx = parseInt(m[1], 10) - 1;
          const cite = (out.citations || [])[cidx] || (out.rag_chunks_used || [])[cidx];
          return (
            <span
              key={i}
              data-testid={`arg-citation-${cidx}`}
              onMouseEnter={() => setHoverCitation(cidx)}
              onMouseLeave={() => setHoverCitation(null)}
              style={{
                display: 'inline-block',
                padding: '1px 7px', margin: '0 2px',
                borderRadius: 9999,
                background: 'rgba(99,102,241,0.18)',
                color: '#c7d2fe',
                fontSize: 10.5, fontFamily: 'DM Mono, monospace', fontWeight: 700,
                cursor: cite ? 'help' : 'default',
                border: '1px solid rgba(99,102,241,0.32)',
                position: 'relative', verticalAlign: 'super',
              }}
            >
              [{m[1]}]
              {hoverCitation === cidx && cite && (
                <span style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                  width: 320, padding: 10, zIndex: Z.DROPDOWN,
                  background: 'var(--surface)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 12,
                  fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.45,
                  boxShadow: '0 12px 36px rgba(0,0,0,0.4)', textAlign: 'left',
                  whiteSpace: 'normal', textTransform: 'none', letterSpacing: 'normal',
                }}>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: '#a5b4fc', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {cite.source_type || 'cita'} · {cite.chunk_id}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--cream)' }}>{cite.label || cite.title || ''}</div>
                  {cite.snippet && <div style={{ marginTop: 4, color: 'var(--cream-3)' }}>{(cite.snippet || '').slice(0, 200)}…</div>}
                </span>
              )}
            </span>
          );
        })}
      </p>
    );
  };

  const fullText = out && !out.error ? [
    out.hook,
    ...(out.paragraphs || []),
    out.call_to_action,
  ].filter(Boolean).join('\n\n') : '';

  const copyTo = async (text, tag) => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); setCopied(tag); }
      else { setCopied('err'); }
    } catch { setCopied('err'); }
  };
  const copyAll = () => copyTo(fullText, 'text');
  const copyWa = () => copyTo(out.whatsapp_text || fullText, 'wa');
  const waPhone = (contact.phones?.[0] || '').replace(/\D/g, '');
  const waUrl = waPhone && out && out.whatsapp_text
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(out.whatsapp_text)}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Desarrollo (opcional · si vacío: plan venta IA general)
        </div>
        <select data-testid="arg-dev" value={devId} onChange={e => setDevId(e.target.value)} className="asr-select" style={{ width: '100%' }}>
          <option value="">— Sin desarrollo específico —</option>
          {devs.map(d => <option key={d.id} value={d.id}>{d.name} · {d.colonia}</option>)}
        </select>
      </label>
      <button onClick={run} disabled={loading} data-testid="arg-run" className="btn btn-primary" style={{ justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
        <Sparkle size={12} />
        {loading ? 'Generando con RAG + Claude…' : 'Generar plan venta IA'}
      </button>

      {out && out.error && (
        <Card style={{ borderColor: 'rgba(239,68,68,0.4)' }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {out.error}</div>
        </Card>
      )}

      {out && !out.error && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="eyebrow">
              Argumentario · {out.cache_hit ? 'caché' : 'nuevo'} · {out.citations?.length || 0} citas
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9.5, color: 'var(--cream-3)' }}>
              {out.model?.split('-').slice(0, 3).join('-')} · ${out.cost_usd?.toFixed(4) || '0.0000'}
            </div>
          </div>

          <h4 data-testid="arg-hook" style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', margin: '0 0 12px', letterSpacing: '-0.018em' }}>
            {out.hook}
          </h4>

          <div data-testid="arg-output">
            {(out.paragraphs || []).map((p, i) => renderPara(p, i))}
            {out.call_to_action && (
              <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--indigo-3)', lineHeight: 1.6, margin: '12px 0 0', fontStyle: 'italic' }}>
                {out.call_to_action}
              </p>
            )}
          </div>

          {(out.citations || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Fuentes citadas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(out.citations || []).map((c, i) => (
                  <span key={i} data-testid={`arg-source-${i}`} style={{
                    padding: '4px 10px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)',
                    color: '#c7d2fe', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 500,
                  }}>
                    [{i + 1}] {c.label || c.title || c.chunk_id} · <span style={{ opacity: 0.7 }}>{c.source_type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={copyAll} data-testid="arg-copy" className="btn btn-glass btn-sm">Copiar texto</button>
            <button onClick={copyWa} data-testid="arg-copy-wa" className="btn btn-glass btn-sm">Copiar WhatsApp</button>
            {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Enviar por WhatsApp</a>}
            {copied && (
              <span role="status" aria-live="polite" style={{ fontFamily: 'DM Sans', fontSize: 12, color: copied === 'err' ? '#F87171' : 'var(--green, #22C55E)' }}>
                {copied === 'err' ? 'No se pudo copiar' : '✓ Copiado'}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// F1a · AsesorContactosV2 — rediseño de Leads con el Sistema de Diseño asesor.
// Conserva TODA la función de la pantalla vieja (lista, abrir lead, notas, bulk,
// pin, filtros, smart lists, archivados, crear) y suma: ActionBar, franja "Foco
// de hoy" (IA · action_queue de getDashboard), pipeline kanban con drag (patrón
// de AsesorBusquedas, dimensión = temperatura), cards premium y Ficha360.
// Datos: SOLO el contrato advisor.js (cero endpoints nuevos).
// ============================================================================
function avatarInitials(c) {
  return `${(c?.first_name || '').charAt(0)}${(c?.last_name || '').charAt(0)}`.toUpperCase() || '·';
}

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// Antigüedad legible es-MX para la card (entró hoy · ayer · Nd · fecha).
function agingText(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'entró hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// Quita emoji/símbolos que algunos agentes IA anteponen al texto (p.ej. el coach
// manda "📚 Tip de tu coach"). El mockup es CERO emoji → limpiamos en el render.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu;
function stripEmoji(s) {
  if (!s) return s;
  return String(s).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

// B7 · presupuesto en PESOS MXN. Input crudo (solo dígitos) → "$1,234,543" para mostrar.
function pesoInput(raw) {
  return raw === '' || raw == null ? '' : `$${Number(raw).toLocaleString('es-MX')}`;
}
// Compacto para el botón/resumen: "$1.2M".
function pesoShort(raw) {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  return n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${n.toLocaleString('es-MX')}`;
}

// Encabezado de sección estilo mockup (.secline): eyebrow violeta + nota + regla.
function SecLine({ em, lab, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 13, margin: '0 0 16px' }}>
      {em && <span style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--theme-2)', fontWeight: 700 }}>{em}</span>}
      {lab && <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)' }}>{lab}</span>}
      {note && <span style={{ fontSize: 13.5, color: 'var(--cream-3)' }}>{note}</span>}
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

// Chips de filtro horizontales (reemplazan el rail vertical de Smart Lists).
// "Todos" + los 5 presets reales con sus counts. Cero emoji.
function LeadFilterChips({ presets, counts, total, active, onSelect }) {
  const Chip = ({ k, label, count, dotRgb, on }) => (
    <button
      data-testid={`lead-chip-${k}`}
      onClick={() => onSelect(k)}
      className={`asr-chip${on ? ' asr-chip--on' : ''}`}
    >
      {dotRgb && <span style={{ width: 8, height: 8, borderRadius: '50%', background: `rgb(${dotRgb})` }} />}
      {label}
      {count != null && <span className="asr-chip__cn">{count}</span>}
    </button>
  );
  // Etiqueta es-MX de cada preset alineada al mockup.
  const LABELS = { hot_leads: 'Calientes' };
  const DOTS = { hot_leads: '242, 99, 91' };
  return (
    <div className="asr-chips" data-testid="lead-chips">
      <Chip k={null} label="Todos" count={total || null} on={!active} />
      {presets.map((p) => (
        <Chip
          key={p.key}
          k={p.key}
          label={LABELS[p.key] || p.label}
          dotRgb={DOTS[p.key]}
          count={counts[p.key] ?? 0}
          on={active === p.key}
        />
      ))}
    </div>
  );
}

function AsesorContactosV2({ user, onLogout }) {
  const { t } = useTranslation('p5_ux');
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const forceDemo = searchParams.get('demo'); // '1'=forzar demo · '0'=forzar real · null=auto
  const [autoDemo, setAutoDemo] = useState(false); // B7 · demo lleno automático si no hay leads reales con score
  const demoMode = forceDemo === '1' || (forceDemo !== '0' && autoDemo);
  const [list, setList] = useState([]);
  const [sortBy, setSortBy] = useState('score');
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);  // distingue "falló la carga" de "bandeja vacía"
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showArg, setShowArg] = useState(false);
  const [devs, setDevs] = useState([]);
  const [smartList, setSmartList] = useState(() => searchParams.get('smart_list') || null);
  const [view, setView] = useState('pipeline');
  const [intel, setIntel] = useState(null);  // B5.4 Capa 6 · el norte (inteligencia de prospectos)
  const [dragging, setDragging] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [foco, setFoco] = useState([]);
  const [dismissedFoco, setDismissedFoco] = useState(() => new Set()); // B7 · FOCO descartados (cerrar tarjeta)
  const [intelDismissed, setIntelDismissed] = useState(false); // B7 · cerrar panel "Lo que aprendí" (no permanente)
  const [segment, setSegment] = useState('todos'); // B7 · segmento activo (calidad/estado · client-side)
  // B7 · rangos de presupuesto en PESOS MXN completos (no millones). Multi-rango: el lead
  // entra si su precio cae en CUALQUIER rango (OR). `from`/`to` guardan solo dígitos crudos.
  const [priceRanges, setPriceRanges] = useState([{ from: '', to: '' }]);
  const [zonas, setZonas] = useState([]);         // B7 · zonas/colonias seleccionadas (multi)
  const [openFilter, setOpenFilter] = useState(null); // 'precio' | 'zona' | null
  // Chips de filtro = presets reales de smart-lists + total para "Todos".
  const [presets, setPresets] = useState([]);
  const [counts, setCounts] = useState({});
  const [totalContactos, setTotalContactos] = useState(0);
  // Enriquecimiento REAL de cada card (sin inventar): zona/precio/Nprops desde
  // las búsquedas del lead, y "próxima acción" desde el action_queue por lead_id.
  const [busqByContact, setBusqByContact] = useState({});
  const [actionByLead, setActionByLead] = useState({});

  const load = async () => {
    if (forceDemo === '1') { setAutoDemo(false); setList(DEMO_LEADS); setLoading(false); return; }
    setLoading(true);
    setLoadErr(false);
    try {
      let items;
      if (smartList) {
        const r = await getLeadsInPreset(smartList, { limit: 200 });
        items = r.items || [];
      } else {
        items = await api.listContactos({});
      }
      if (sortBy === 'score') items.sort((a, b) => ((b.buyer_score?.value) || 0) - ((a.buyer_score?.value) || 0));
      // B7 · si no hay leads reales con score (data sparse) y no se forzó real → demo lleno
      // (se ve completo como el mockup). Al haber leads con score, usa los reales.
      const rich = items.length > 0 && items.some((l) => (l.buyer_score?.value) != null);
      if (forceDemo !== '0' && !rich) { setAutoDemo(true); setList(DEMO_LEADS); }
      else { setAutoDemo(false); setList(items); }
    } catch (e) {
      setLoadErr(true);
    } finally { setLoading(false); }
  };

  // Sincroniza el chip activo en la URL (?smart_list=) · preserva ?demo=1.
  useEffect(() => {
    const next = {};
    if (forceDemo === '1') next.demo = '1';
    else if (forceDemo === '0') next.demo = '0';
    if (smartList) next.smart_list = smartList;
    setSearchParams(next, { replace: true });
  }, [smartList, forceDemo]); // eslint-disable-line

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [sortBy, smartList, forceDemo]);  // recarga al cambiar orden/filtro/forzado demo

  useEffect(() => {
    if (!id) { setSelected(null); return; }
    if (demoMode) { setSelected(demoLeadById(id)); return; }
    // URL con un id demo viejo pero el demo está apagado → no existe en backend · limpia.
    if (id.startsWith('demo-')) { setSelected(null); nav('/asesor/contactos', { replace: true }); return; }
    api.getContacto(id).then(setSelected).catch(() => {});
  }, [id, demoMode]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`, { credentials: 'include' }).then(r => r.json()).then(setDevs).catch(() => {});
  }, []);

  // Chips de filtro: presets + counts reales (FAIL-OPEN). En demo, counts del mockup.
  useEffect(() => {
    if (demoMode) {
      setCounts({ hot_leads: 3, sin_contactar_48h: 5, sin_actividad_14d: 8, visita_pendiente: 2, en_negociacion: 4 });
      setTotalContactos(14);
    }
    getSmartListPresets().then((r) => setPresets(r?.presets || [])).catch(() => setPresets([]));
    if (!demoMode) getSmartListCounts().then((r) => setCounts(r?.counts || {})).catch(() => setCounts({}));
  }, [demoMode]);

  // B5.4 Capa 6 · El norte — inteligencia agregada de prospectos (gusto/rechazos/conversión) · FAIL-OPEN.
  useEffect(() => {
    if (demoMode) { setIntel(null); return; }
    api.getProspectIntel().then(setIntel).catch(() => setIntel(null));
  }, [demoMode]);

  // Foco de hoy + total de leads + próxima acción por lead (todo del dashboard · FAIL-OPEN).
  // DEDUPE: el coach repite "Tip…"; tomamos las 3 acciones DISTINTAS de mayor prioridad.
  useEffect(() => {
    if (demoMode) {
      setFoco(DEMO_FOCO);
      setActionByLead(DEMO_ACTION);
      return;
    }
    api.getDashboard()
      .then((d) => {
        const q = d?.action_queue || [];
        const seen = new Set();
        const distinct = [...q]
          .sort((a, b) => (a.priority || 9) - (b.priority || 9))
          .filter((a) => {
            const key = a.lead_id || (a.title || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        setFoco(distinct.slice(0, 3));
        // mapa lead_id → acción de mayor prioridad (próxima acción de la card).
        const m = {};
        for (const a of distinct) { if (a.lead_id && !m[a.lead_id]) m[a.lead_id] = a; }
        setActionByLead(m);
        if (d?.counts?.contactos != null) setTotalContactos(d.counts.contactos);
      })
      .catch(() => { setFoco([]); setActionByLead({}); });
  }, [demoMode]);

  // Mapa contacto_id → búsquedas (zona/precio/Nprops reales de la card · 1 sola llamada).
  useEffect(() => {
    if (demoMode) { setBusqByContact(DEMO_BUSQ); return; }
    api.listBusquedas()
      .then((all) => {
        const m = {};
        for (const b of (all || [])) {
          if (!b.contacto_id) continue;
          (m[b.contacto_id] = m[b.contacto_id] || []).push(b);
        }
        setBusqByContact(m);
      })
      .catch(() => setBusqByContact({}));
  }, [demoMode]);

  const qs = demoMode ? '?demo=1' : '';
  const openContact = (c) => {
    if (!c) return;
    if (c._smart_list_lead) {
      setToast({ kind: 'info', text: 'Este es un lead del pipeline · ábrelo desde el Kanban' });
      return;
    }
    if (demoMode) { nav(`/asesor/contactos/${c.id}${qs}`); return; }
    api.trackRecent({
      entity_type: 'lead', entity_id: c.id,
      label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Lead',
      url: `/asesor/contactos/${c.id}`,
    }).catch(() => {});
    nav(`/asesor/contactos/${c.id}`);
  };
  const closeDetail = () => nav(`/asesor/contactos${qs}`);

  // B7 · segmentos pensados para asesor/gerente: dónde poner atención, foco rojo,
  // calidad de seguimiento, oportunidad de cierre. + filtros precio (desde/hasta) y zona (multi).
  const priceOf = (c) => ((busqByContact[c.id] || [])[0]?.precio_max);
  const isHot = (c) => c.buyer_score?.tier === 'hot' || /calien/i.test(c.temperatura || '');
  const isWarm = (c) => c.buyer_score?.tier === 'warm' || /tibio/i.test(c.temperatura || '');
  const noFollow = (c) => !actionByLead[c.id];
  const segmentDefs = [
    { key: 'todos',       label: 'Todos',           emoji: '',   group: 'all', pred: () => true },
    // ↑ Avanzan al cierre (positivos · 5)
    { key: 'calientes',   label: 'Calientes',       emoji: '🔥', group: 'pos', pred: (c) => isHot(c) },
    { key: 'potencial',   label: 'Potenciales',     emoji: '⭐', group: 'pos', pred: (c) => (c.buyer_score?.value || 0) >= 70 },
    { key: 'concita',     label: 'Con cita',        emoji: '📅', group: 'pos', pred: (c) => c.etapa === 'visita' },
    { key: 'negociacion', label: 'En negociación',  emoji: '🤝', group: 'pos', pred: (c) => c.etapa === 'negociacion' },
    { key: 'porcerrar',   label: 'Por cerrar',      emoji: '✅', group: 'pos', pred: (c) => isHot(c) && ['visita', 'negociacion'].includes(c.etapa) },
    // ↓ Alejan del cierre (negativos · atención · 5)
    { key: 'focorojo',    label: 'Foco rojo',       emoji: '🔴', group: 'neg', pred: (c) => noFollow(c) && (isHot(c) || isWarm(c) || (c.etapa || 'nuevo') === 'nuevo') },
    { key: 'sincontacto', label: 'Sin contactar',   emoji: '⏰', group: 'neg', pred: (c) => (c.etapa || 'nuevo') === 'nuevo' && noFollow(c) },
    { key: 'seenfrian',   label: 'Se enfrían',      emoji: '🧊', group: 'neg', pred: (c) => isWarm(c) && noFollow(c) },
    { key: 'sinseg',      label: 'Sin seguimiento', emoji: '🕓', group: 'neg', pred: (c) => noFollow(c) },
    { key: 'estancados',  label: 'Estancados',      emoji: '❄️', group: 'neg', pred: (c) => c.buyer_score?.tier === 'cold' && noFollow(c) },
  ];
  // E1 · Clasificación viva: usa los segmentos REALES del servidor (c.segments · tier+etapa
  // +recencia). En demo (no pasa por backend) cae al cálculo client-side de arriba.
  const clientSegs = (c) => segmentDefs.filter((s) => s.group !== 'all' && s.pred(c)).map((s) => s.key);
  const segOf = (c) => (Array.isArray(c.segments) ? c.segments : clientSegs(c));
  const segBase = list.filter((c) => !c.archived);
  const segCounts = {};
  for (const s of segmentDefs) segCounts[s.key] = s.key === 'todos' ? segBase.length : segBase.filter((c) => segOf(c).includes(s.key)).length;
  const allZonas = [...new Set(segBase.flatMap((c) => (busqByContact[c.id] || [])[0]?.colonias || []))].sort();
  // Rangos con al menos un extremo lleno (los vacíos no filtran).
  const activeRanges = priceRanges.filter((r) => r.from !== '' || r.to !== '');
  const priceActive = activeRanges.length > 0;

  const display = useMemo(() => {
    let arr = list.filter((c) => !c.archived);
    if (segment !== 'todos') {
      arr = arr.filter((c) => segOf(c).includes(segment));
    }
    if (activeRanges.length) {
      arr = arr.filter((c) => {
        const p = priceOf(c);
        if (p == null) return false;
        // OR entre rangos: basta con caer dentro de uno.
        return activeRanges.some((r) => {
          const pf = r.from !== '' ? Number(r.from) : null;
          const ptv = r.to !== '' ? Number(r.to) : null;
          if (pf != null && p < pf) return false;
          if (ptv != null && p > ptv) return false;
          return true;
        });
      });
    }
    if (zonas.length) {
      arr = arr.filter((c) => ((busqByContact[c.id] || [])[0]?.colonias || []).some((z) => zonas.includes(z)));
    }
    return [...arr].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, segment, priceRanges, zonas, actionByLead, busqByContact]);

  const togglePin = async (c) => {
    setList((prev) => prev.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)));
    try { await api.pinContacto(c.id); } catch (_) { load(); }
  };

  // Kanban: arrastrar un lead a otra columna mueve su ETAPA del pipeline (patchContacto).
  const onDropEtapa = async (etapaKey) => {
    setDragOverCol(null);
    const cid = dragging;
    setDragging(null);
    if (!cid) return;
    const item = list.find((x) => x.id === cid);
    if (!item || (item.etapa || 'nuevo') === etapaKey) return;
    setList((prev) => prev.map((x) => (x.id === cid ? { ...x, etapa: etapaKey } : x)));
    if (demoMode) { setToast({ kind: 'success', text: `Movido a ${etapaMeta(etapaKey).label}` }); return; }
    try {
      await api.patchContacto(cid, { etapa: etapaKey });
      setToast({ kind: 'success', text: `Movido a ${etapaMeta(etapaKey).label}` });
    } catch (e) {
      setToast({ kind: 'error', text: 'No se pudo mover' });
      load();
    }
  };

  // Foco de hoy · CTAs consumen completeAction / dismissAction.
  const focoCTA = async (cta, action) => {
    if (cta === 'ver') { if (action.lead_id) nav(`/asesor/contactos/${action.lead_id}`); else nav('/asesor/contactos'); return; }
    try {
      if (cta === 'completar') await api.completeAction(action.id, action);
      else if (cta === 'descartar') await api.dismissAction(action.id, action);
      setFoco((prev) => prev.filter((a) => a.id !== action.id));
      setToast({ kind: 'success', text: cta === 'completar' ? 'Acción completada' : 'Acción descartada' });
    } catch (_) { setToast({ kind: 'error', text: 'No se pudo aplicar' }); }
  };

  // El perfil-hub mueve la ETAPA del pipeline desde sus chips · reflejamos el
  // cambio en el kanban y en la ficha abierta sin recargar todo.
  const handleEtapaChange = (ek) => {
    if (!selected) return;
    setList((prev) => prev.map((x) => (x.id === selected.id ? { ...x, etapa: ek } : x)));
    setSelected((prev) => (prev ? { ...prev, etapa: ek } : prev));
  };

  const sortControl = (
    <select data-testid="sort-by-select" value={sortBy} onChange={e => setSortBy(e.target.value)} className="asr-field">
      <option value="score">Ordenar · score</option>
      <option value="created_at">Ordenar · fecha</option>
    </select>
  );

  const renderCard = (c, { draggable } = {}) => (
    <LeadCardV2
      key={c.id}
      c={c}
      busquedas={busqByContact[c.id]}
      nextAction={actionByLead[c.id]}
      metaOverride={demoMode ? DEMO_META[c.id] : undefined}
      onPin={() => togglePin(c)}
      onOpen={() => openContact(c)}
      draggable={!!draggable}
      isDragging={dragging === c.id}
      onDragStart={() => setDragging(c.id)}
      onDragEnd={() => setDragging(null)}
      t={t}
    />
  );

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div className="portal-asesor">
        <SenalesCalientesCard />
        {/* Head · igual al mockup: título + subtítulo · tools a la derecha */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 'clamp(28px, 3.4vw, 38px)', letterSpacing: '-0.6px', color: 'var(--cream)', margin: 0, lineHeight: 1 }}>Leads</h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)', margin: '8px 0 0' }}>
              Tu embudo de prospectos · ordenado por quién está más listo.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Toggle visible de datos de ejemplo (evita tener que escribir ?demo=1) */}
            <button
              data-testid="asr-demo-toggle"
              onClick={() => setSearchParams(demoMode ? {} : { demo: '1' }, { replace: true })}
              title="Muestra el diseño con datos de ejemplo para evaluarlo"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px',
                borderRadius: 9, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: demoMode ? '1px solid transparent' : '1px solid var(--border)',
                background: demoMode ? 'var(--grad)' : 'var(--surface)',
                color: demoMode ? '#fff' : 'var(--cream-2)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: demoMode ? '#fff' : 'var(--cream-3)' }} />
              {demoMode ? 'Datos de ejemplo · salir' : 'Ver con datos de ejemplo'}
            </button>
            <ActionBar
              sort={sortControl}
              view={<ViewToggle value={view} onChange={setView} />}
              onNew={() => setShowCreate(true)}
              newLabel="Nuevo lead"
            />
          </div>
        </div>

        {/* B5.4 Capa 6 · El norte — inteligencia agregada de prospectos. Solo con señal real. */}
        {intel && intel.signal_leads > 0 && (intel.insights || []).length > 0 && !intelDismissed && (
          <div data-testid="asr-prospect-intel" style={{ position: 'relative', marginBottom: 18, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.03))', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
            <button data-testid="intel-dismiss" onClick={() => setIntelDismissed(true)} title="Ocultar por ahora"
              style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--cream-3)', cursor: 'pointer', padding: 0, lineHeight: 0, fontSize: 12 }}>✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, paddingRight: 28 }}>
              <span style={{ fontSize: 16 }}>🧭</span>
              <b style={{ fontFamily: 'Outfit', fontSize: 14, color: 'var(--cream)' }}>Lo que les gusta a tus prospectos</b>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{intel.signal_leads} {intel.signal_leads === 1 ? 'lead con datos' : 'leads con datos'}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--cream-3)', marginBottom: 10, paddingRight: 28 }}>Para que sepas qué enseñarles y con qué argumento cerrar.</div>
            <div style={{ display: 'grid', gap: 6, marginBottom: (intel.by_development || []).length ? 11 : 0 }}>
              {(intel.insights || []).map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.5, display: 'flex', gap: 7 }}>
                  <span style={{ color: 'var(--theme-2)', flexShrink: 0 }}>›</span><span>{s}</span>
                </div>
              ))}
            </div>
            {(intel.by_development || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 10, borderTop: '1px solid rgba(var(--theme-rgb),0.15)' }}>
                {(intel.by_development || []).slice(0, 5).map((d) => {
                  const col = d.accept_rate >= 60 ? 'var(--emerald, #10b981)' : d.accept_rate >= 35 ? 'var(--theme-2)' : 'var(--cold, #ef6b6b)';
                  return (
                    <span key={d.dev_id} title={`${d.likes} 👍 · ${d.dislikes} 👎`} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--cream-2)' }}>
                      {d.name} <b style={{ color: col }}>{d.accept_rate}%</b>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* B7 · Barra de segmentos (foco del asesor/gerente) + filtros Precio (desde/hasta) y Zona (multi).
            Cada chip filtra el board (client-side). Counts en vivo. Ámbar = atención/foco rojo. */}
        <div data-testid="lead-segments" style={{ marginBottom: 16 }}>
          {/* Fila 1 · AVANZAN al cierre (positivos · 5) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {segmentDefs.filter((s) => s.group === 'all' || s.group === 'pos').map((s) => {
              const on = segment === s.key;
              return (
                <button key={s.key} data-testid={`seg-${s.key}`} onClick={() => setSegment(s.key)}
                  className={`asr-chip${on ? ' asr-chip--on' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                  {s.emoji && <span style={{ marginRight: 5 }}>{s.emoji}</span>}{s.label}
                  <span className="asr-chip__cn">{segCounts[s.key] ?? 0}</span>
                </button>
              );
            })}
          </div>

          {/* Fila 2 · REQUIEREN atención (negativos · 5) + Precio/Zona a la derecha */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {segmentDefs.filter((s) => s.group === 'neg').map((s) => {
              const on = segment === s.key;
              const warn = segCounts[s.key] > 0 && !on;
              return (
                <button key={s.key} data-testid={`seg-${s.key}`} onClick={() => setSegment(s.key)}
                  className={`asr-chip${on ? ' asr-chip--on' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                  {s.emoji && <span style={{ marginRight: 5 }}>{s.emoji}</span>}{s.label}
                  <span className="asr-chip__cn" style={warn ? { color: 'var(--warm)' } : undefined}>{segCounts[s.key] ?? 0}</span>
                </button>
              );
            })}

            {/* Precio + Zona · botones a la derecha de la fila 2. Abren un PANEL EN FLUJO
                (abajo · empuja el board) → nunca se encima ni se corta. */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button data-testid="filter-precio" onClick={() => setOpenFilter(openFilter === 'precio' ? null : 'precio')}
                className={`asr-chip${priceActive ? ' asr-chip--on' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                💰 Precio{priceActive ? ` · ${activeRanges.length > 1 ? `${activeRanges.length} rangos` : `${pesoShort(activeRanges[0].from) || '$0'}–${pesoShort(activeRanges[0].to) || '∞'}`}` : ''} {openFilter === 'precio' ? '▴' : '▾'}
              </button>
              <button data-testid="filter-zona" onClick={() => setOpenFilter(openFilter === 'zona' ? null : 'zona')}
                className={`asr-chip${zonas.length ? ' asr-chip--on' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                📍 Zona{zonas.length ? ` · ${zonas.length}` : ''} {openFilter === 'zona' ? '▴' : '▾'}
              </button>
            </div>
          </div>

          {/* Panel de filtro · EN FLUJO (no flotante) · aparece debajo de los chips y empuja
              el board hacia abajo → imposible que se encime con tarjetas o se corte. */}
          {openFilter === 'precio' && (
            <div data-testid="panel-precio" style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--asr-shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream-2)' }}>Presupuesto · pesos MXN</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {priceActive && <button onClick={() => setPriceRanges([{ from: '', to: '' }])} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 12.5, cursor: 'pointer' }}>Limpiar</button>}
                  <button onClick={() => setOpenFilter(null)} className="asr-mini asr-mini--go" style={{ padding: '6px 16px' }}>Listo</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priceRanges.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="text" inputMode="numeric" placeholder="$ Desde" value={pesoInput(r.from)}
                      onChange={(e) => setPriceRanges((rs) => rs.map((rr, i) => i === idx ? { ...rr, from: e.target.value.replace(/\D/g, '') } : rr))}
                      className="asr-field" style={{ width: 150 }} />
                    <span style={{ color: 'var(--cream-3)' }}>–</span>
                    <input type="text" inputMode="numeric" placeholder="$ Hasta" value={pesoInput(r.to)}
                      onChange={(e) => setPriceRanges((rs) => rs.map((rr, i) => i === idx ? { ...rr, to: e.target.value.replace(/\D/g, '') } : rr))}
                      className="asr-field" style={{ width: 150 }} />
                    {priceRanges.length > 1 && (
                      <button onClick={() => setPriceRanges((rs) => rs.filter((_, i) => i !== idx))} title="Quitar rango"
                        style={{ width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream-3)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setPriceRanges((rs) => [...rs, { from: '', to: '' }])}
                style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--theme-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                + Agregar otro rango
              </button>
            </div>
          )}
          {openFilter === 'zona' && (
            <div data-testid="panel-zona" style={{ marginTop: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--asr-shadow)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--cream-2)' }}>Zona / colonia</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {zonas.length > 0 && <button onClick={() => setZonas([])} style={{ background: 'none', border: 'none', color: 'var(--cream-3)', fontSize: 12.5, cursor: 'pointer' }}>Limpiar</button>}
                  <button onClick={() => setOpenFilter(null)} className="asr-mini asr-mini--go" style={{ padding: '6px 16px' }}>Listo</button>
                </div>
              </div>
              {allZonas.length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--cream-3)' }}>Sin zonas registradas aún</div>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {allZonas.map((z) => {
                      const on = zonas.includes(z);
                      return (
                        <button key={z} onClick={() => setZonas((prev) => (on ? prev.filter((x) => x !== z) : [...prev, z]))}
                          className={`asr-chip${on ? ' asr-chip--on' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                          {on && <span style={{ marginRight: 5 }}>✓</span>}{z}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Foco de hoy · 3 acciones priorizadas. En demo se renderiza DIRECTO de DEMO_FOCO
            (no del estado `foco` que sincroniza con retraso) → evita el race al prender el demo. */}
        {(demoMode ? DEMO_FOCO : foco).filter((f) => !dismissedFoco.has(f.id)).length > 0 && (
          <div data-testid="asr-foco-hoy" style={{ marginBottom: 34 }}>
            <SecLine em="Foco de hoy" note="la IA priorizó esto para ti" />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14,
              background: 'linear-gradient(180deg, rgba(var(--theme-rgb),0.10), transparent 90%)',
              border: '1px solid var(--border)', borderRadius: 16, padding: 16,
            }} className="asr-foco-grid">
              {demoMode
                ? DEMO_FOCO.filter((f) => !dismissedFoco.has(f.id)).map((f) => (
                    <FocoCard key={f.id} item={f}
                      onOpen={() => openContact(demoLeadById(f.lead_id))}
                      onDismiss={() => setDismissedFoco((s) => new Set(s).add(f.id))} />
                  ))
                : foco.filter((a) => !dismissedFoco.has(a.id)).map((a) => {
                    const lead = list.find((x) => x.id === a.lead_id);
                    return (
                      <FocoCard
                        key={a.id}
                        item={realFoco(a, lead)}
                        onOpen={() => (a.lead_id ? focoCTA('ver', a) : null)}
                        onComplete={() => focoCTA('completar', a)}
                        onDismiss={() => { setDismissedFoco((s) => new Set(s).add(a.id)); focoCTA('descartar', a); }}
                      />
                    );
                  })}
            </div>
          </div>
        )}

        {/* Embudo */}
        <SecLine lab="Tu embudo de leads" note="arrastra conforme avanzan" />

        {loading ? <div style={{ padding: 60, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</div>
          : loadErr ? <Empty title="No pudimos cargar tus leads" sub="Revisa tu conexión e inténtalo de nuevo." cta={<button className="btn btn-primary" onClick={load}>Reintentar</button>} />
          : display.length === 0 ? <Empty title={smartList ? 'Sin leads en este filtro' : 'Sin leads'} sub={smartList ? 'Prueba con otro chip o vuelve a "Todos".' : 'Crea tu primer lead con "+ Nuevo lead".'} />
          : view === 'pipeline' ? (
            <div data-testid="leads-kanban" style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPA_ORDER.length}, minmax(232px, 1fr))`, gap: 14, alignItems: 'start', overflowX: 'auto' }}>
              {ETAPA_ORDER.map((ek) => {
                const meta = ETAPA[ek];
                const col = display.filter((c) => (c.etapa || 'nuevo') === ek);
                // Inteligencia de columna (B7): $ total de la etapa (point 3) + señal/riesgo (point 2).
                const dcol = demoMode ? DEMO_COL[ek] : null;
                const headCount = dcol ? dcol.count : col.length;
                // $ total de venta de la etapa (point 4: junto al título, sin engordar la columna).
                const colBudget = col.reduce((s, c) => s + (((busqByContact[c.id] || [])[0]?.precio_max) || 0), 0);
                const valueText = dcol ? dcol.value
                  : colBudget > 0 ? (colBudget >= 1e6 ? `$${(colBudget / 1e6).toFixed(colBudget % 1e6 === 0 ? 0 : 1)}M` : fmtMXN(colBudget)) : null;
                return (
                  <div key={ek} data-testid={`col-${ek}`}
                    className={`asr-kanban-col${dragOverCol === ek ? ' asr-kanban-col--over' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== ek) setDragOverCol(ek); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol((p) => (p === ek ? null : p)); }}
                    onDrop={(e) => { e.preventDefault(); onDropEtapa(ek); }}
                    style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, minHeight: 440, transition: 'border-color 200ms, background 200ms' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12, padding: '0 2px 11px', borderBottom: '2px solid var(--border)' }}>
                      <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{meta.label}</span>
                      {valueText && (
                        <span title="Venta total en esta etapa" className="asr-num" style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--theme-2)' }}>{valueText}</span>
                      )}
                      <span className="asr-num" style={{ marginLeft: 'auto', fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: 'var(--cream-2)' }}>{headCount}</span>
                    </div>
                    {/* lista = zona de drop que llena la columna (arrastra a cualquier parte) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 80 }}>
                      {col.length === 0
                        ? <div className="asr-empty-col" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>{dcol?.empty || 'Suelta un lead aquí'}</div>
                        : col.map((c) => renderCard(c, { draggable: true }))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div data-testid="leads-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
              {display.map((c) => renderCard(c, { draggable: false }))}
            </div>
          )}

        <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo lead">
          <CreateContactForm entityLabel="lead" onCreated={(c) => { setShowCreate(false); setToast({ kind: 'success', text: 'Lead creado' }); load(); nav(`/asesor/contactos/${c.id}`); }} onError={(tx) => setToast({ kind: 'error', text: tx })} />
        </Drawer>

        <Ficha360
          open={!!selected}
          onClose={closeDetail}
          contact={selected}
          user={user}
          demo={demoMode && selected ? DEMO_PERFIL[selected.id] : undefined}
          onOpenArg={() => setShowArg(true)}
          onStageChange={handleEtapaChange}
          onToast={(kind, text) => setToast({ kind, text })}
        />

        <Drawer open={showArg} onClose={() => setShowArg(false)} title="Plan venta IA · Claude" width={560}>
          {selected && <ArgumentarioForm contact={selected} devs={devs} onDone={() => setToast({ kind: 'success', text: 'Mensaje generado' })} />}
        </Drawer>

        {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}
      </div>
    </AdvisorLayout>
  );
}

// Card de lead premium · idéntica al mockup (.lead): avatar térmico, nombre+fuente,
// scorerow (Score + temp + número), barra, zona·precio, próxima acción, N propiedades +
// antigüedad, WhatsApp + Abrir. Donde no hay dato real → "—"/oculto (nunca card vacía).
function LeadCardV2({ c, busquedas, nextAction, metaOverride, onPin, onOpen, draggable, isDragging, onDragStart, onDragEnd, t }) {
  const meta = tempMeta(c.temperatura);
  const score = c.buyer_score?.value;
  const bq = (busquedas && busquedas[0]) || null;
  const zona = bq && (bq.colonias || [])[0];
  const precio = bq && bq.precio_max;
  const nProps = busquedas ? busquedas.length : 0;
  const fuente = c.fuente || c.source;
  const phone = (c.phones || [])[0];
  const digits = (phone || '').replace(/\D/g, '');
  const waUrl = digits ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola ' + (c.first_name || '') + ', ')}` : null;
  const aging = agingText(c.created_at);
  const agingDisplay = metaOverride ? metaOverride.aging : aging;
  const agingWarn = metaOverride ? metaOverride.agingWarn : false;
  // Specs de la búsqueda con iconos (point 3): recámaras · baños · estac · m². + zona + precio.
  const recamaras = bq && (bq.recamaras_min || bq.recamaras);
  const banos = bq && (bq.banos_min || bq.banos);
  const estac = bq && (bq.estacionamientos_min ?? bq.estacionamientos ?? bq.estac);
  const m2 = bq && (bq.m2_min || bq.m2 || bq.metros);
  const specs = [
    recamaras ? `🛏 ${recamaras}` : null,
    banos ? `🛁 ${banos}` : null,
    (estac !== null && estac !== undefined && estac !== false) ? `🚗 ${estac}` : null,
    m2 ? `📐 ${m2}m²` : null,
  ].filter(Boolean);
  const zonaText = zona || (nProps > 0 ? 'Criterios por definir' : 'Sin búsqueda registrada');
  // Perfilamiento financiero (point 2): forma de pago + plazo de compra · lo captura el asesor en la ficha.
  const formaPago = bq && (bq.forma_pago || bq.financiamiento);
  const plazoCompra = bq && (bq.plazo_compra || bq.plazo || bq.timeframe);
  // Forma de pago: Contado / Propio + Crédito / Propio + Crédito + Infonavit-o-Fovissste.
  // El sub-tipo (credito_tipo) solo aplica al tercer caso → "🏦 Propio + Crédito + Infonavit".
  const FORMA_LABEL = { contado: '💵 Contado', credito: '🏦 Propio + Crédito', mixto: '🏦 Propio + Crédito' };
  const CREDITO_LABEL = { infonavit: 'Infonavit', fovissste: 'Fovissste', cofinavit: 'Cofinavit' };
  const creditoTipo = bq && bq.credito_tipo;
  const formaText = formaPago
    ? `${FORMA_LABEL[formaPago] || '💳 ' + formaPago}${formaPago !== 'contado' && CREDITO_LABEL[creditoTipo] ? ` + ${CREDITO_LABEL[creditoTipo]}` : ''}`
    : null;
  const actText = nextAction ? stripEmoji(nextAction.title || nextAction.subtitle || '') : '';
  const tasteLine = c.taste_line || ''; // E2.2 · gusto aprendido (de asesor_taste_profile)
  const pct = score != null ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  // Señal honesta en palabra (no "10/100"): calidad del lead según el score de comprador.
  const pctWord = pct >= 67 ? 'Alta' : pct >= 40 ? 'Media' : 'Baja';
  // Temperatura como EMOJI (point 3) · va junto a la acción · la recencia sube al encabezado.
  const tempEmoji = meta.label === 'Caliente' ? '🔥' : meta.label === 'Tibio' ? '🌤️' : meta.label === 'Cliente' ? '🤝' : '🧊';
  // DINERO en juego = presupuesto de su búsqueda (dato real · compacto).
  const dealText = precio ? (precio >= 1e6 ? `$${(precio / 1e6).toFixed(precio % 1e6 === 0 ? 0 : 1)}M` : fmtMXN(precio)) : null;
  // B7 · rediseño del embudo: identidad + score (BADGE, no barra) · SEÑAL "por qué ahora"
  // (reemplaza la barra · accionable) · búsqueda + DINERO en juego · próxima acción · footer.
  // Altura uniforme: todas las filas siempre presentes (con fallback).
  return (
    <PremiumCard
      hover
      dragging={isDragging}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={onOpen}
      data-testid={`lead-card-${c.id}`}
      style={{ padding: 14, cursor: draggable ? 'grab' : 'pointer', display: 'flex', flexDirection: 'column', gap: 11, position: 'relative' }}
    >
      {/* pin · esquina */}
      <button data-testid={`pin-${c.id}`} title={c.pinned ? t('pin.unpin', 'Quitar de fijados') : t('pin.pin', 'Fijar arriba')}
        onClick={(e) => { e.stopPropagation(); onPin(); }}
        style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, opacity: c.pinned ? 1 : 0.4 }}>
        <Pin size={13} color={c.pinned ? 'var(--theme-2)' : 'var(--cream-3)'} fill={c.pinned ? 'var(--theme-2)' : 'none'} />
      </button>

      {/* 1 · identidad · nombre completo en UNA línea + fuente·antigüedad en UNA línea (score movido a la acción) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: `rgba(${meta.rgb}, 0.16)`, display: 'grid', placeItems: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 11.5, color: `rgb(${meta.rgb})` }}>
          {avatarInitials(c)}
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 20 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14.5, color: 'var(--cream)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.first_name} {c.last_name || ''}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--cream-3)', textTransform: 'capitalize' }}>{fuente || c.tipo || '—'}</span>
            {agingDisplay && <span style={{ color: agingWarn ? 'var(--warm)' : 'var(--cream-3)', fontWeight: agingWarn ? 600 : 400 }}> · {agingDisplay}</span>}
          </div>
        </div>
      </div>

      {/* 2 · temperatura (emoji) + PRÓXIMA ACCIÓN + score. Altura FIJA = 2 renglones
          (clamp a 2 líneas · nunca corta a media palabra · nunca crece) → tarjetas simétricas. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 10, background: `rgba(${meta.rgb}, 0.08)`, border: `1px solid rgba(${meta.rgb}, 0.20)` }}>
        <span title={meta.label} style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{tempEmoji}</span>
        <span style={{ flex: 1, minWidth: 0, height: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: actText ? 'var(--cream)' : 'var(--cream-3)' }}>{actText || 'Sin acción pendiente'}</span>
        {score != null && <span title={`Calidad del lead: ${pctWord}`} style={{ flexShrink: 0, fontFamily: 'Outfit', fontWeight: 800, fontSize: 12, color: `rgb(${meta.rgb})`, whiteSpace: 'nowrap' }}>{pctWord}</span>}
      </div>

      {/* 3a · zona + dinero en juego ($) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
        <span style={{ flex: 1, minWidth: 0, color: 'var(--cream-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{zonaText}</span>
        {dealText && <span style={{ flexShrink: 0, fontFamily: 'Outfit', fontWeight: 700, color: 'var(--cream)' }}>{dealText}</span>}
      </div>

      {/* 3b · specs con iconos (recámaras · baños · estac · m²) · UNA línea (altura fija) */}
      <div style={{ display: 'flex', gap: 13, fontSize: 12.5, color: 'var(--cream-2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {specs.length ? specs.map((s, i) => <span key={i}>{s}</span>) : <span style={{ color: 'var(--cream-3)' }}>Specs por definir</span>}
      </div>

      {/* 3c · perfilamiento de compra · forma de pago + plazo · UNA línea con ellipsis (altura fija) */}
      <div style={{ display: 'flex', gap: 13, fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {(formaText || plazoCompra)
          ? <><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{formaText}</span>{plazoCompra && <span style={{ flexShrink: 0 }}>🗓 {plazoCompra}</span>}</>
          : <span style={{ color: 'var(--cream-3)' }}>Perfil de compra por completar</span>}
      </div>

      {/* 3d · gusto (aprendido de sus 👍/👎) · UNA línea (altura fija · tarjetas parejas) */}
      <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--cream-2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ flexShrink: 0 }}>❤</span>
        {tasteLine
          ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tasteLine.charAt(0).toUpperCase() + tasteLine.slice(1)}</span>
          : <span style={{ color: 'var(--cream-3)' }}>Sin señal de gusto aún</span>}
      </div>

      {/* footer · WhatsApp + Abrir */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" data-testid={`wa-${c.id}`} title="WhatsApp"
            onClick={(e) => e.stopPropagation()} className="asr-qbtn" style={{ width: 30, height: 30 }}>
            <MessageCircle size={14} />
          </a>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--theme-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Abrir <ArrowRight size={12} />
        </span>
      </div>
    </PremiumCard>
  );
}

// ── Foco de hoy · UNA sola tarjeta (mismo diseño del mockup para demo Y real) ──────
// dot por tono + quién + tag + frase bold + razón + botones. Los datos reales se
// normalizan a esta misma forma (realFoco) → el diseño NO depende de si hay demo.
const FOCO_TONE = { hot: 'var(--hot)', warm: 'var(--warm)', ok: 'var(--ok)' };
const TONE_BY_PRIORITY = { 1: 'hot', 2: 'warm', 3: 'ok' };
const ETAPA_TAG = { nuevo: 'contactar', contactado: 'seguir', visita: 'cita', negociacion: 'cerrar', cerrado: '' };

// Una fecha ISO cruda (p.ej. de una cita) → texto amigable es-MX. Evita mostrar
// "2026-06-01T11:00:00+00:00" en la tarjeta FOCO.
function prettyWhen(s) {
  if (!s || typeof s !== 'string') return s;
  const txt = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(txt)) return s;
  try {
    const d = new Date(txt);
    if (Number.isNaN(d.getTime())) return s;
    const day = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${time}`;
  } catch { return s; }
}

// Normaliza una acción real del action_queue a la forma de la tarjeta del mockup.
function realFoco(a, lead) {
  const phone = (lead?.phones || [])[0];
  const digits = (phone || '').replace(/\D/g, '');
  const who = lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() : (stripEmoji(a.title) || 'Acción');
  // Cuerpo = la acción a realizar (sin repetir el nombre que ya va arriba).
  const sub = stripEmoji(a.subtitle || '');
  const title = stripEmoji(a.title || '');
  const body = prettyWhen(lead ? ((sub && sub !== who) ? sub : title) : sub);
  return {
    id: a.id,
    tone: TONE_BY_PRIORITY[a.priority] || 'ok',
    who,
    tag: (lead && ETAPA_TAG[lead.etapa || 'nuevo']) || (a.source_agent ? stripEmoji(a.source_agent) : ''),
    bold: '',
    body,
    lead_id: a.lead_id,
    actions: ['wa', 'perfil'],
    waUrl: digits ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola ' + (lead?.first_name || '') + ', ')}` : null,
    canComplete: true, canDismiss: true,
  };
}

function FocoCard({ item, onOpen, onComplete, onDismiss }) {
  const acts = item.actions || ['perfil'];
  const stop = (e) => e.stopPropagation();
  return (
    <PremiumCard hover data-testid={`asr-foco-card-${item.id}`} onClick={onOpen} style={{ padding: '17px 19px', display: 'flex', flexDirection: 'column', minWidth: 0, cursor: 'pointer', position: 'relative' }}>
      {onDismiss && (
        <button data-testid={`foco-dismiss-${item.id}`} title="Descartar foco" aria-label="Descartar"
          onClick={(e) => { stop(e); onDismiss(); }}
          style={{ position: 'absolute', top: 9, right: 9, width: 24, height: 24, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--cream-2)', borderRadius: 7 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)'; e.currentTarget.style.color = 'var(--red, #EF4444)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--cream-2)'; }}>
          <XIcon size={14} />
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, paddingRight: onDismiss ? 22 : 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: FOCO_TONE[item.tone] || 'var(--ok)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.who || 'Acción'}</span>
        {item.tag && <span className="asr-foco__tag">{item.tag}</span>}
      </div>
      {(item.bold || item.body) && (
        <div style={{ color: 'var(--cream-2)', fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
          {item.bold && <b className="asr-foco__bold">{item.bold}</b>} {item.body}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
        {acts.includes('wa') && (item.waUrl
          ? <a href={item.waUrl} target="_blank" rel="noreferrer" className="asr-mini asr-mini--go" onClick={stop}><MessageCircle size={13} /> WhatsApp</a>
          : <button className="asr-mini asr-mini--go" onClick={stop}><MessageCircle size={13} /> WhatsApp</button>)}
        {acts.includes('perfil') && <button className="asr-mini" onClick={(e) => { stop(e); onOpen(); }}><Eye size={13} /> Ver perfil</button>}
        {acts.includes('cita') && <button className="asr-mini asr-mini--go" onClick={stop}>Ver cita</button>}
        {acts.includes('comparativo') && <button className="asr-mini" onClick={stop}>Comparativo</button>}
        {/* B7 · solo 2 botones contextuales como el mockup (✓/✕ retirados) */}
      </div>
    </PremiumCard>
  );
}
