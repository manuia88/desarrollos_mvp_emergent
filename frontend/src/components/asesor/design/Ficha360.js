// Ficha360 — el perfil-hub del lead: modal central (tema claro) con 4 tabs.
// QUÉ ES: el centro de control del lead. Header (avatar + temperatura + chips de
//         etapa que MUEVEN el estado + WhatsApp/Agendar) y 4 pestañas:
//         Resumen · Propiedades · Conversaciones · Actividad.
// CUÁNDO: al hacer click en un lead de la pantalla de Leads.
//
// DATOS (todo real · contrato advisor.js · cero stubs):
//   Resumen      → getContacto (datos) · getCloseProbability (anillo % cierre) ·
//                  listBusquedas filtradas por contacto (criterios "qué busca") ·
//                  listTareas({contacto_id}) (Pendientes · completar con completeTarea).
//   Actividad    → getContactoOverview (timeline unificado) + nota (addTimelineEntry).
//   Propiedades  → listBusquedas + getMatches por búsqueda (tablero read-only).
//   Conversaciones → getLeadConversations (hilo real); si no hay, empty state real.
//
// NOTA (conservadora): asesor_contactos NO tiene campo de "etapa" de pipeline — el
// único estado mutable del contrato es `temperatura`. Por eso los chips del header y
// las columnas del kanban mueven `temperatura` (vía patchContacto). Cuando exista un
// campo de etapa, se reemplaza aquí sin tocar backend.
//
// Props: open · onClose · contact (de getContacto) · onOpenArg() · onAgendar() ·
//        onStageChange(temp) (avisa al kanban del cambio) · onToast(kind,text).
import React, { useEffect, useState, useCallback } from 'react';
import {
  Calendar, Sparkles, X, Phone as PhoneIcon, Mail, Globe, Check,
  MessageCircle, MessageSquare, Pencil, Building2,
} from 'lucide-react';
import * as api from '../../../api/advisor';
import { fmtMXN } from '../../advisor/primitives';
import { Z } from '../../../styles/zIndex';
import TemperaturePill from './TemperaturePill';
import ScoreRing from './ScoreRing';
import { ETAPA, ETAPA_ORDER, etapaMeta } from './palette';

const initials = (c) =>
  `${(c?.first_name || '').charAt(0)}${(c?.last_name || '').charAt(0)}`.toUpperCase() || '·';

// ts (ISO|datetime) → texto relativo es-MX corto.
function relWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.round(h / 24);
  if (dd < 30) return `hace ${dd} d`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// Texto legible de un factor de close_probability (filtra los vacíos · evita viñetas
// en blanco). close_probability devuelve objetos {factor, value, reason?} heterogéneos.
function factorText(f) {
  if (!f) return '';
  if (typeof f === 'string') return f.trim();
  if (f.reason) return String(f.reason).trim();
  if (f.label) return String(f.label).trim();
  if (f.text) return String(f.text).trim();
  const map = {
    buyer_score: f.value != null ? `Score de comprador ${Math.round(Number(f.value))}/100` : '',
    temperatura: f.value ? `Temperatura ${f.value}` : '',
    stage: f.value ? `Etapa de búsqueda: ${f.value}` : '',
    ofertas: f.value != null ? `${f.value} oferta(s) registrada(s)` : '',
  };
  return (map[f.factor] || '').trim();
}

// color del dot del timeline por tipo de evento.
function eventDot(source, kind) {
  if (kind === 'cita' || kind === 'visit' || source === 'busqueda') return 'var(--cold)';
  if (kind === 'tarea' || kind === 'task') return 'var(--warm)';
  if (source === 'operacion') return 'var(--ok)';
  return 'var(--cream-3)';
}

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'props', label: 'Propiedades' },
  { key: 'conv', label: 'Conversaciones' },
  { key: 'act', label: 'Actividad' },
];

export default function Ficha360({ open, onClose, contact, onOpenArg, onAgendar, onStageChange, onToast }) {
  const [tab, setTab] = useState('resumen');
  const [prob, setProb] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [busquedas, setBusquedas] = useState([]);
  const [matches, setMatches] = useState({});      // bid → [matches]
  const [overview, setOverview] = useState(null);
  const [convos, setConvos] = useState(null);
  const [convLoading, setConvLoading] = useState(false);
  const [actLoading, setActLoading] = useState(false);
  const [propsLoading, setPropsLoading] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);

  const cid = contact?.id;
  const toast = useCallback((k, t) => { if (onToast) onToast(k, t); }, [onToast]);

  // Cerrar con Esc + bloquear scroll del body.
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  // Al abrir un lead: reset tab + carga lo del Resumen (prob, tareas, búsquedas).
  useEffect(() => {
    if (!open || !cid) return;
    setTab('resumen');
    setProb(null); setTareas([]); setBusquedas([]); setMatches({});
    setOverview(null); setConvos(null);
    api.getCloseProbability(cid).then(setProb).catch(() => setProb(null));
    api.listTareas({ contacto_id: cid }).then((t) => setTareas(t || [])).catch(() => setTareas([]));
    api.listBusquedas()
      .then((all) => setBusquedas((all || []).filter((b) => b.contacto_id === cid)))
      .catch(() => setBusquedas([]));
  }, [open, cid]);

  // Lazy-load por tab.
  useEffect(() => {
    if (!open || !cid) return;
    if (tab === 'act' && overview === null && !actLoading) {
      setActLoading(true);
      api.getContactoOverview(cid)
        .then((o) => setOverview(o || { timeline: [] }))
        .catch(() => setOverview({ timeline: [] }))
        .finally(() => setActLoading(false));
    }
    if (tab === 'conv' && convos === null && !convLoading) {
      setConvLoading(true);
      api.getLeadConversations(cid)
        .then((r) => setConvos(r?.conversations || []))
        .catch(() => setConvos([]))
        .finally(() => setConvLoading(false));
    }
    if (tab === 'props' && busquedas.length > 0 && Object.keys(matches).length === 0 && !propsLoading) {
      setPropsLoading(true);
      Promise.all(busquedas.map((b) =>
        api.getMatches(b.id).then((m) => [b.id, m || []]).catch(() => [b.id, []])
      )).then((pairs) => {
        setMatches(Object.fromEntries(pairs));
      }).finally(() => setPropsLoading(false));
    }
  }, [tab, open, cid, busquedas]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !contact) return null;

  const c = contact;
  const phone = c.phones?.[0] || '';
  const digits = phone.replace(/\D/g, '');
  const waUrl = digits ? `https://wa.me/${digits}?text=${encodeURIComponent('Hola ' + (c.first_name || '') + ', ')}` : null;

  // close_probability devuelve prob en 0-100 (no 0-1).
  const probPct = prob && prob.prob != null
    ? Math.max(0, Math.min(100, Math.round(Number(prob.prob))))
    : null;
  const probReasons = prob?.factors || prob?.reasons || prob?.drivers || [];
  // Líneas legibles (sin vacíos) + frase de cierre según el %.
  const readyLines = (Array.isArray(probReasons) ? probReasons.map(factorText) : []).filter(Boolean).slice(0, 3);
  const readyCta = probPct == null ? ''
    : probPct >= 70 ? 'Vale la pena darle seguimiento hoy.'
    : probPct >= 45 ? 'Buen momento para nutrirlo y avanzar.'
    : 'Aún frío: nútrelo antes de empujar.';
  const firstBusq = busquedas[0] || null;

  // Mover la ETAPA del pipeline desde los chips del header (como el mockup).
  const etapaActual = c.etapa || 'nuevo';
  const moveEtapa = async (ek) => {
    if (stageBusy || ek === etapaActual) return;
    setStageBusy(true);
    try {
      await api.patchContacto(cid, { etapa: ek });
      if (onStageChange) onStageChange(ek);
      toast('success', `Movido a ${etapaMeta(ek).label}`);
    } catch (_) {
      toast('error', 'No se pudo mover');
    } finally { setStageBusy(false); }
  };

  const completeTarea = async (tid) => {
    try {
      await api.completeTarea(tid);
      setTareas((prev) => prev.filter((t) => t.id !== tid));
      toast('success', 'Pendiente completado');
    } catch (_) { toast('error', 'No se pudo completar'); }
  };

  const submitNote = async () => {
    const body = note.trim();
    if (!body || noteBusy) return;
    setNoteBusy(true);
    try {
      await api.addTimelineEntry(cid, { kind: 'nota', body });
      setNote('');
      // refresca el timeline unificado para que la nota aparezca de inmediato.
      const o = await api.getContactoOverview(cid).catch(() => null);
      if (o) setOverview(o);
      toast('success', 'Nota registrada');
    } catch (_) { toast('error', 'No se pudo guardar la nota'); }
    finally { setNoteBusy(false); }
  };

  // Criterios "qué busca" derivados de la primera búsqueda (datos reales).
  const criterios = firstBusq ? [
    { l: 'Presupuesto', v: firstBusq.precio_max ? `Hasta ${fmtMXN(firstBusq.precio_max)}` : (firstBusq.precio_min ? `Desde ${fmtMXN(firstBusq.precio_min)}` : '—') },
    { l: 'Zona', v: (firstBusq.colonias || []).join(', ') || '—' },
    { l: 'Recámaras', v: firstBusq.recamaras_min ? `${firstBusq.recamaras_min}+` : '—' },
    { l: 'Urgencia', v: firstBusq.urgencia || 'media' },
  ] : [];

  return (
    <div className="asr-modal-scrim" role="presentation" onClick={onClose} style={{ zIndex: Z.DROPDOWN }}>
      <div
        className="asr-modal"
        data-testid="asr-ficha360"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="asr-modal__wrap">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <div style={{
              width: 62, height: 62, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(109,74,255,0.30), rgba(120,150,255,0.28))',
              display: 'grid', placeItems: 'center',
              fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22, color: 'var(--theme-2)',
            }}>
              {initials(c)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.3px', color: 'var(--cream)', lineHeight: 1.1 }}>
                {c.first_name} {c.last_name || ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6, flexWrap: 'wrap' }}>
                <TemperaturePill temp={c.temperatura} size="sm" />
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-2)' }}>· {etapaMeta(etapaActual).label}</span>
                {c.tipo && <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--cream-2)', textTransform: 'capitalize' }}>· {c.tipo}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noreferrer" data-testid="asr-ficha360-wa" className="asr-hbtn asr-hbtn--key" style={{ textDecoration: 'none' }}>
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
              <button onClick={onAgendar} data-testid="asr-ficha360-agendar" className="asr-hbtn">
                <Calendar size={14} /> Agendar
              </button>
            </div>
            <button onClick={onClose} data-testid="asr-ficha360-close" className="btn-icon-circle" aria-label="Cerrar" style={{ flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>

          {/* Chips de etapa del pipeline (mueven `etapa` via patchContacto · como el mockup) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 20, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Etapa</span>
            {ETAPA_ORDER.map((ek) => (
              <button
                key={ek}
                data-testid={`asr-ficha360-stage-${ek}`}
                className={`asr-stchip${etapaActual === ek ? ' asr-stchip--on' : ''}`}
                disabled={stageBusy}
                onClick={() => moveEtapa(ek)}
              >
                {ETAPA[ek].label}
              </button>
            ))}
          </div>

          {/* Tab bar */}
          <div className="asr-tabbar" role="tablist">
            {TABS.map((tb) => {
              const count = tb.key === 'props' ? busquedas.length
                : tb.key === 'conv' ? (Array.isArray(convos) ? convos.length : null)
                : tb.key === 'act' ? (overview?.count ?? null)
                : null;
              return (
                <button
                  key={tb.key}
                  role="tab"
                  aria-selected={tab === tb.key}
                  data-testid={`asr-ficha360-tab-${tb.key}`}
                  className={`asr-tab${tab === tb.key ? ' asr-tab--on' : ''}`}
                  onClick={() => setTab(tb.key)}
                >
                  {tb.label}
                  {count ? <span className="asr-tab__count">{count}</span> : null}
                </button>
              );
            })}
          </div>

          {/* ── Pane: Resumen ── */}
          {tab === 'resumen' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-resumen">
              {/* Datos del cliente */}
              <div style={{ marginBottom: 24 }}>
                <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--cold)' }} />Datos del cliente</div>
                <div style={{ border: '1px solid var(--border)', borderLeft: '3px solid var(--cold)', borderRadius: 12, background: 'var(--surface)', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(c.phones || []).map((p) => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                      <PhoneIcon size={15} color="var(--cream-3)" /> {p}
                    </div>
                  ))}
                  {(c.emails || []).map((e) => (
                    <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                      <Mail size={15} color="var(--cream-3)" /> {e}
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--cream)', padding: '6px 0' }}>
                    <Globe size={15} color="var(--cream-3)" />
                    {c.fuente || c.source ? `Llegó por ${c.fuente || c.source}` : 'Alta manual'}
                    {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString('es-MX')}` : ''}
                  </div>
                  {(c.tags || []).length > 0 && (
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', paddingTop: 4 }}>{c.tags.join(' · ')}</div>
                  )}
                </div>
              </div>

              {/* Qué tan listo está · anillo % cierre */}
              <div style={{ marginBottom: 24 }}>
                <div className="asr-sec-h">Qué tan listo está</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 22, border: '1px solid var(--border)', borderLeft: '3px solid var(--theme)', borderRadius: 12, padding: '18px 20px', background: 'var(--surface)' }}>
                  <ScoreRing value={probPct} />
                  <div style={{ fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.55, borderLeft: '1px solid var(--border)', paddingLeft: 22 }}>
                    {probPct == null ? (
                      <span>Calculando con el historial del lead…</span>
                    ) : (
                      <>
                        {readyLines.length > 0 && <span>{readyLines.join(' · ')}. </span>}
                        <b style={{ color: 'var(--cream)' }}>{readyCta}</b>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Qué busca el cliente (criterios de su búsqueda) */}
              {criterios.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div className="asr-sec-h">Qué busca el cliente</div>
                  <div className="asr-criterios">
                    {criterios.map((cr) => (
                      <div className="asr-cr" key={cr.l}>
                        <div className="asr-crl">{cr.l}</div>
                        <div className="asr-crv">{cr.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pendientes (tareas del contacto · completar) · se OCULTA si no hay */}
              {tareas.length > 0 && (
                <div>
                  <div className="asr-sec-h"><span className="asr-sdot" style={{ background: 'var(--warm)' }} />Pendientes <span className="asr-muted">· tareas en proceso</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tareas.map((t) => (
                      <div className="asr-pend" key={t.id} data-testid={`asr-pend-${t.id}`}>
                        <span className="asr-pend__dot" style={{ background: 'var(--warm)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <b style={{ fontSize: 14.5, color: 'var(--cream)', fontWeight: 700 }}>{t.titulo}</b>
                          <span style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
                            Tarea{t.due_at ? ` · ${new Date(t.due_at).toLocaleDateString('es-MX')}` : ''}{t.prioridad ? ` · ${t.prioridad}` : ''}
                          </span>
                        </div>
                        <button className="asr-donebtn" data-testid={`asr-pend-done-${t.id}`} onClick={() => completeTarea(t.id)}>
                          <Check size={13} /> Completar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plan venta IA (reusa Argumentario) */}
              <div style={{ marginTop: 22 }}>
                <button onClick={onOpenArg} data-testid="open-arg" className="asr-hbtn asr-hbtn--key">
                  <Sparkles size={14} /> Plan venta IA
                </button>
              </div>
            </div>
          )}

          {/* ── Pane: Propiedades (read-only · búsquedas + matches) ── */}
          {tab === 'props' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-props">
              {busquedas.length === 0 ? (
                <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                  Este lead aún no tiene una búsqueda con propiedades.
                </div>
              ) : propsLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando propiedades…</div>
              ) : (
                busquedas.map((b) => {
                  const ms = matches[b.id] || [];
                  return (
                    <div key={b.id} style={{ marginBottom: 24 }}>
                      <div className="asr-sec-h">
                        <Building2 size={14} color="var(--cream-3)" />
                        {(b.colonias || []).join(', ') || 'Búsqueda'} <span className="asr-muted">· etapa {b.stage || 'pendiente'}</span>
                      </div>
                      {ms.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 12.5, border: '1px dashed var(--border-2)', borderRadius: 11 }}>
                          Sin coincidencias para esta búsqueda todavía.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                          {ms.slice(0, 8).map((m) => (
                            <div className="asr-prop" key={m.dev_id} data-testid={`asr-prop-${m.dev_id}`}>
                              <div style={{ height: 56, background: 'var(--surface-2)', position: 'relative', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ position: 'absolute', left: 9, bottom: 6, fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: 'var(--theme-2)' }} className="asr-num">
                                  {m.price_from ? fmtMXN(m.price_from) : ''}
                                </span>
                              </div>
                              <div style={{ padding: '9px 11px' }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--cream)' }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>{m.colonia}</div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--theme-2)' }} className="asr-num">
                                  {m.score}% fit
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Pane: Conversaciones (hilo real o empty) ── */}
          {tab === 'conv' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-conv">
              {convLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando conversaciones…</div>
              ) : !convos || convos.length === 0 ? (
                <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                  <MessageSquare size={22} color="var(--cream-3)" style={{ margin: '0 auto 10px' }} />
                  Aún no hay conversaciones registradas con este lead.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {convos.map((cv, i) => (
                    <div key={cv.id || cv.conversation_id || i} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: '13px 15px', boxShadow: 'var(--asr-shadow)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cv.sentiment === 'negative' ? 'var(--hot)' : cv.sentiment === 'positive' ? 'var(--ok)' : 'var(--cream-3)' }} />
                        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13.5, color: 'var(--cream)', textTransform: 'capitalize' }}>
                          {cv.channel || cv.canal || 'Conversación'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cream-3)' }}>
                          {relWhen(cv.last_message_at || cv.updated_at || cv.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                        {cv.last_message_text || cv.last_message || cv.summary || cv.resumen || `${cv.message_count || cv.messages_count || 0} mensajes`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Pane: Actividad (timeline unificado /overview + nota) ── */}
          {tab === 'act' && (
            <div className="asr-pane" data-testid="asr-ficha360-pane-act">
              {/* Agregar nota */}
              <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
                <input
                  data-testid="add-note-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
                  placeholder="Agregar una nota…"
                  style={{ flex: 1, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 14, outline: 'none' }}
                />
                <button className="asr-ctxbtn" data-testid="asr-ficha360-note-save" onClick={submitNote} disabled={noteBusy || !note.trim()} style={{ opacity: (noteBusy || !note.trim()) ? 0.6 : 1 }}>
                  <Pencil size={14} /> Nota
                </button>
              </div>

              {actLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando actividad…</div>
              ) : !overview || (overview.timeline || []).length === 0 ? (
                <div style={{ padding: '34px 18px', textAlign: 'center', color: 'var(--cream-3)', fontSize: 13.5, border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                  Sin actividad registrada aún. Tu primera nota aparecerá aquí.
                </div>
              ) : (
                <div className="asr-tl">
                  {(overview.timeline || []).slice(0, 40).map((e, i) => (
                    <div className="asr-tlrow" key={i} data-testid="asr-tlrow">
                      <span className="asr-tlrow__dot" style={{ background: eventDot(e.source, e.kind) }} />
                      <span><b style={{ textTransform: 'capitalize' }}>{e.title || e.kind}</b>{e.body && e.body !== e.title ? ` · ${e.body}` : ''}</span>
                      <span className="asr-when">{relWhen(e.ts)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
