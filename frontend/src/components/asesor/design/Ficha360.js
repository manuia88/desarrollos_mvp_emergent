// Ficha360 — la ficha del lead en un drawer ancho a 2 columnas (patrón EB #4).
// QUÉ ES: el rediseño del drawer "doblemente horrible": header con avatar +
//         temperatura, barra de acciones consistente (Llamar/WhatsApp/Agendar/Plan)
//         y un bento grid. Los bloques SIN datos se OCULTAN (cero cajas vacías).
// CUÁNDO: al hacer click en un lead de la pantalla de Leads.
//
// Datos: SOLO el contrato advisor.js. El % de cierre y el lead score explicado se
// piden con getCloseProbability(id) al abrir. "Inteligencia" y "Conversaciones IA"
// se muestran únicamente si getContacto ya las trajo inline en el contacto; si no,
// el bloque no se pinta (surfacing profundo = Ola 2).
//
// Props: open, onClose, contact (objeto de getContacto), onOpenArg(), onAgendar(),
//        onAddNote(text)->Promise, busyNote.
import React, { useEffect, useState } from 'react';
import { Calendar, Sparkles, X, Phone as PhoneIcon, Mail, Tag, Clock } from 'lucide-react';
import * as api from '../../../api/advisor';
import { Z } from '../../../styles/zIndex';
import TemperaturePill from './TemperaturePill';
import ScoreBar from './ScoreBar';
import QuickActions from './QuickActions';

const initials = (c) =>
  `${(c?.first_name || '').charAt(0)}${(c?.last_name || '').charAt(0)}`.toUpperCase() || '·';

function Block({ title, icon: Icon, children, testId, span = 1 }) {
  return (
    <div
      data-testid={testId}
      style={{
        gridColumn: `span ${span}`,
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border)',
        borderRadius: 14, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {Icon && <Icon size={13} color="var(--cream-3)" />}
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function Ficha360({ open, onClose, contact, onOpenArg, onAgendar, onAddNote, busyNote }) {
  const [prob, setProb] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  useEffect(() => {
    setProb(null);
    if (open && contact?.id) {
      api.getCloseProbability(contact.id).then(setProb).catch(() => setProb(null));
    }
  }, [open, contact?.id]);

  if (!open || !contact) return null;

  const c = contact;
  const phone = c.phones?.[0] || '';
  const score = c.buyer_score?.value;
  const probPct = prob && (prob.prob !== undefined && prob.prob !== null)
    ? Math.round(Number(prob.prob) * (Number(prob.prob) <= 1 ? 100 : 1))
    : null;
  const probReasons = prob?.factors || prob?.reasons || prob?.drivers || [];
  // Bloques opcionales: solo si getContacto ya los trajo inline (sin endpoints nuevos).
  const intel = c.enrichment || c.insights || c.intel || null;
  const convos = c.conversations || c.ai_conversations || c.conversaciones || null;
  const timeline = c.timeline || [];

  const submitNote = async () => {
    if (!note.trim() || !onAddNote) return;
    await onAddNote(note.trim());
    setNote('');
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        // Mismo tier que el Drawer de primitives (Z.DROPDOWN): así el drawer de
        // "Plan" (posterior en el DOM) se apila encima de la ficha, y los toasts
        // (Z.STICKY) quedan por arriba de ambos. Replica el stacking de la pantalla vieja.
        position: 'fixed', inset: 0, zIndex: Z.DROPDOWN,
        background: 'rgba(6, 8, 15, 0.74)', backdropFilter: 'blur(10px)',
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        data-testid="asr-ficha360"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760, maxWidth: '100vw', height: '100vh',
          background: 'linear-gradient(180deg, rgba(14,18,32,0.98), rgba(8,9,13,0.98))',
          borderLeft: '1px solid rgba(var(--theme-rgb), 0.22)',
          padding: 24, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 9999, flexShrink: 0,
            background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--bg)',
          }}>
            {initials(c)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {c.first_name} {c.last_name || ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <TemperaturePill temp={c.temperatura} size="sm" />
              {c.tipo && (
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-3)', textTransform: 'capitalize' }}>
                  {c.tipo}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} data-testid="asr-ficha360-close" className="btn-icon-circle" aria-label="Cerrar">
            <X size={14} />
          </button>
        </div>

        {/* Barra de acciones consistente */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <QuickActions phone={phone} name={c.first_name} stopPropagation={false} />
          <button onClick={onAgendar} data-testid="asr-ficha360-agendar" className="btn btn-glass" style={{ borderRadius: 9999 }}>
            <Calendar size={13} /> Agendar
          </button>
          <button onClick={onOpenArg} data-testid="asr-ficha360-plan" className="btn btn-primary" style={{ borderRadius: 9999 }}>
            <Sparkles size={13} /> Plan
          </button>
        </div>

        {/* Bento grid · bloques sin datos ocultos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {/* % de cierre */}
          <Block title="Probabilidad de cierre" testId="asr-block-prob">
            {probPct !== null ? (
              <>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 30, background: 'var(--grad)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>
                  {probPct}%
                </div>
                {Array.isArray(probReasons) && probReasons.length > 0 && (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {probReasons.slice(0, 3).map((r, i) => (
                      <li key={i} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-2)', lineHeight: 1.4 }}>
                        · {typeof r === 'string' ? r : (r.label || r.text || r.reason || '')}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>
                Calculando con el historial del lead…
              </span>
            )}
          </Block>

          {/* Lead score explicado */}
          <Block title="Qué tan listo está" testId="asr-block-score">
            <ScoreBar score={score} width={140} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--cream-3)', lineHeight: 1.4 }}>
              {c.buyer_score?.tier === 'hot' ? 'Lead activo: contáctalo pronto.'
                : c.buyer_score?.tier === 'warm' ? 'Va tibio: una buena interacción lo calienta.'
                : c.buyer_score?.value != null ? 'Aún frío: nútrelo antes de empujar.'
                : 'El score sube con cada llamada, mensaje y visita.'}
            </span>
          </Block>

          {/* Contacto */}
          <Block title="Contacto" icon={PhoneIcon} testId="asr-block-contacto" span={2}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream)' }}>
              {(c.phones || []).map((p) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <PhoneIcon size={12} color="var(--cream-3)" /> {p}
                </div>
              ))}
              {(c.emails || []).map((e) => (
                <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--cream-2)' }}>
                  <Mail size={12} color="var(--cream-3)" /> {e}
                </div>
              ))}
              {(c.tags || []).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--cream-3)' }}>
                  <Tag size={12} color="var(--cream-3)" /> {c.tags.join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--cream-3)', fontSize: 11.5 }}>
                <Clock size={12} color="var(--cream-3)" />
                {c.source ? `Vía ${c.source}` : 'Origen manual'}
                {c.created_at ? ` · alta ${new Date(c.created_at).toLocaleDateString('es-MX')}` : ''}
              </div>
            </div>
          </Block>

          {/* Inteligencia · solo si vino inline */}
          {intel && (
            <Block title="Inteligencia" icon={Sparkles} testId="asr-block-intel" span={2}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                {typeof intel === 'string' ? intel : (intel.summary || intel.resumen || JSON.stringify(intel))}
              </pre>
            </Block>
          )}

          {/* Conversaciones IA · solo si vinieron inline */}
          {convos && (Array.isArray(convos) ? convos.length > 0 : true) && (
            <Block title="Conversaciones IA" icon={Sparkles} testId="asr-block-convos" span={2}>
              {(Array.isArray(convos) ? convos.slice(0, 4) : [convos]).map((m, i) => (
                <div key={i} style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-2)', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                  {typeof m === 'string' ? m : (m.last_message || m.text || m.body || m.summary || '')}
                </div>
              ))}
            </Block>
          )}

          {/* Actividad + agregar nota */}
          <Block title="Actividad" icon={Clock} testId="asr-block-actividad" span={2}>
            {timeline.length === 0 ? (
              <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--cream-3)' }}>
                Sin interacciones registradas aún.
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {timeline.slice(0, 10).map((e) => (
                  <div key={e.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--cream-2)' }}>
                    <span style={{ color: 'var(--cream-3)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8 }}>{e.kind}</span>
                    {e.body}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                data-testid="asr-ficha360-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
                placeholder="Agregar nota…"
                style={{
                  flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)', borderRadius: 9999, color: 'var(--cream)',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, outline: 'none',
                }}
              />
              <button
                onClick={submitNote}
                disabled={busyNote || !note.trim()}
                data-testid="asr-ficha360-note-save"
                className="btn btn-glass btn-sm"
                style={{ borderRadius: 9999, opacity: (busyNote || !note.trim()) ? 0.6 : 1 }}
              >
                Guardar
              </button>
            </div>
          </Block>
        </div>

        <style>{`
          @media (max-width: 640px) {
            [data-testid="asr-ficha360"] { width: 100vw; padding: 18px; }
          }
        `}</style>
      </div>
    </div>
  );
}
