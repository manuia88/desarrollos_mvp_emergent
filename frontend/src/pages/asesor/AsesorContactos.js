// /asesor/contactos — list + detail drawer with argumentario AI
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pin, Archive, ListPlus, Thermometer } from 'lucide-react';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { PageHeader, Card, Badge, Empty, Drawer, Toast } from '../../components/advisor/primitives';
import * as api from '../../api/advisor';
import { Search, Sparkle, MessageSquare, ArrowRight } from '../../components/icons';
import { Z } from '../../styles/zIndex';
import BuyerScoreBadge from '../../components/asesor/BuyerScoreBadge';
import SmartListsSidebar from '../../components/asesor/SmartListsSidebar';
import SourceBadge from '../../components/asesor/SourceBadge';
import { getLeadsInPreset } from '../../api/smart_lists';

const TIPOS = ['comprador', 'vendedor', 'propietario', 'inversor', 'broker'];
const TEMPS = ['frio', 'tibio', 'caliente', 'cliente'];
const SOURCES = ['email_alias', 'portal_inmuebles24', 'portal_lamudi', 'fb_lead_ads', 'landing', 'manual'];
const SOURCE_LABELS = {
  email_alias: 'Email alias', portal_inmuebles24: 'Inmuebles24',
  portal_lamudi: 'Lamudi', fb_lead_ads: 'FB Lead Ads',
  landing: 'Landing', manual: 'Manual',
};

export default function AsesorContactos({ user, onLogout }) {
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, tipo, temp, scoreMin, sortBy, smartList, sourceFilter]);

  useEffect(() => {
    if (id) {
      api.getContacto(id).then(setSelected).catch(() => {});
    } else { setSelected(null); }
  }, [id]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/developments?sort=recent`).then(r => r.json()).then(setDevs);
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
            padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
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
        : display.length === 0 ? <Empty title={smartList ? 'Sin leads en este filtro' : 'Sin contactos'} sub={smartList ? 'Prueba con otra smart list o limpia el filtro.' : 'Crea tu primer contacto o ajusta filtros.'} />
        : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table data-testid="contacts-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
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
      </Drawer>

      <Drawer open={showArg} onClose={() => setShowArg(false)} title="Plan venta IA · Claude" width={560}>
        {selected && <ArgumentarioForm contact={selected} devs={devs} onDone={() => setToast({ kind: 'success', text: 'Mensaje generado' })} />}
      </Drawer>

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

        </div>
      </div>

      <style>{`
        .asr-select { padding: 8px 14px; border-radius: 9999px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--cream-2); font-family: 'DM Sans'; font-size: 12px; outline: none; }
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
        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', minWidth: 180 }} />
      <input data-testid="bulk-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
        style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
      <button disabled={busy || !titulo.trim() || !due} data-testid="bulk-task-submit" className="btn btn-primary btn-sm" onClick={submit}>
        {t('bulk.confirm', 'Aplicar')}
      </button>
      <button className="btn btn-glass btn-sm" onClick={onCancel}>{t('bulk.cancel', 'Cancelar')}</button>
    </div>
  );
}

function CreateContactForm({ onCreated, onError }) {
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
            style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
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
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
      </label>
      <button onClick={submit} disabled={sub || !f.first_name.trim()} data-testid="new-contact-submit" className="btn btn-primary" style={{ justifyContent: 'center', opacity: (sub || !f.first_name.trim()) ? 0.6 : 1 }}>
        {sub ? 'Creando…' : 'Crear contacto'}
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
            style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none' }} />
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
                  background: '#0A0D16', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 12,
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

  const copyAll = () => { navigator.clipboard.writeText(fullText); };
  const copyWa = () => { navigator.clipboard.writeText(out.whatsapp_text || fullText); };
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

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={copyAll} data-testid="arg-copy" className="btn btn-glass btn-sm">Copiar texto</button>
            <button onClick={copyWa} data-testid="arg-copy-wa" className="btn btn-glass btn-sm">Copiar WhatsApp</button>
            {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Enviar por WhatsApp</a>}
          </div>
        </Card>
      )}
    </div>
  );
}
