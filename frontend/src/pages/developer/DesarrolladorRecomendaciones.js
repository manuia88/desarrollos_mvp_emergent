/**
 * DesarrolladorRecomendaciones — el INBOX del dev (F3 · cierra el loop del cubo unificado).
 *
 * El superadmin detecta demanda insatisfecha en el Hub de Mercado y envía un brief ("qué construir aquí")
 * a las colonias del dev. Aquí el dev lo recibe con la evidencia (qué falta, qué construir) y responde
 * Aceptar / Rechazar + nota → la respuesta vuelve al Hub. Portal claro del dev, lenguaje humano.
 */
import React, { useCallback, useEffect, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { getDevRecomendaciones, responderRecomendacion } from '../../api/developer';
import { Sparkle, CheckCircle, X as XCircle, MapPin } from '../../components/icons';

const money = (v) => (v == null ? '—' : `$${Math.round(v).toLocaleString('es-MX')}`);
const tc = (s) => String(s ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function BriefCard({ b, onRespond, busy }) {
  const [nota, setNota] = useState(b.mi_respuesta?.nota || '');
  const [openNota, setOpenNota] = useState(false);
  const resp = b.mi_respuesta;
  const brief = b.brief || {};
  const mezcla = brief.mezcla || brief.mix || brief.unidades_sugeridas || [];
  return (
    <div className="dmx-card" data-testid={`rec-card-${b.id}`} style={{ padding: 18, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 11.5, color: '#6B6F86', fontWeight: 700 }}>
            <MapPin size={12} /> {tc(b.colonia)}{b.tipologia ? ` · ${tc(b.tipologia)}` : ''}
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream, #1E2230)', marginTop: 4 }}>
            {brief.titulo || 'Oportunidad de producto'}
          </div>
        </div>
        {resp && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 9999, fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11.5,
            background: resp.status === 'aceptado' ? 'rgba(16,122,83,0.1)' : resp.status === 'rechazado' ? 'rgba(220,38,38,0.08)' : 'rgba(251,191,36,0.1)',
            color: resp.status === 'aceptado' ? '#0E7A53' : resp.status === 'rechazado' ? '#DC2626' : '#B4791F' }}>
            {resp.status === 'aceptado' ? 'Aceptada' : resp.status === 'rechazado' ? 'Rechazada' : 'En revisión'}
          </span>
        )}
      </div>

      {/* Evidencia del hueco de demanda */}
      {Array.isArray(b.falta) && b.falta.length > 0 && (
        <div style={{ marginTop: 12, fontFamily: 'DM Sans', fontSize: 12.5, color: '#4B4F66' }}>
          <b>Lo que la gente busca y no encuentra:</b> {b.falta.slice(0, 4).map(tc).join(' · ')}
        </div>
      )}
      {(brief.resumen || (Array.isArray(brief.rationale) && brief.rationale.length > 0)) && (
        <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 13, color: '#4B4F66', lineHeight: 1.5 }}>
          {brief.resumen || brief.rationale.slice(0, 2).join(' ')}
        </div>
      )}
      {brief.es_estimado && (
        <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: '#B4791F', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 9999, padding: '3px 10px' }}>
          Estimado — aún sin búsquedas suficientes en la zona; se afina con demanda real
        </div>
      )}
      {Array.isArray(mezcla) && mezcla.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {mezcla.slice(0, 6).map((m, i) => (
            <span key={i} style={{ fontFamily: 'DM Sans', fontSize: 11.5, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.16)', borderRadius: 9999, padding: '4px 11px', color: '#4B4F66' }}>
              {typeof m === 'string' ? m : `${m.tipologia || m.tipo || ''} ${m.unidades ? `×${m.unidades}` : ''} ${m.precio_tipico ? money(m.precio_tipico) : ''}`.trim()}
            </span>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => onRespond(b.id, 'aceptado', nota)} disabled={busy}
          data-testid={`rec-accept-${b.id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 11, border: 'none', cursor: busy ? 'wait' : 'pointer', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13, background: 'linear-gradient(120deg,#10B981,#059669)', color: '#fff' }}>
          <CheckCircle size={14} /> Me interesa
        </button>
        <button onClick={() => onRespond(b.id, 'rechazado', nota)} disabled={busy}
          data-testid={`rec-reject-${b.id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 11, cursor: busy ? 'wait' : 'pointer', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, background: '#fff', border: '1px solid rgba(16,18,28,0.14)', color: '#4B4F66' }}>
          <XCircle size={14} /> No por ahora
        </button>
        <button onClick={() => setOpenNota((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: 12.5, color: '#6366F1', fontWeight: 700 }}>
          {openNota ? 'Ocultar nota' : 'Agregar nota'}
        </button>
      </div>
      {openNota && (
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota para el equipo DMX (opcional)…" maxLength={500}
          style={{ marginTop: 10, width: '100%', minHeight: 60, padding: 10, borderRadius: 10, border: '1px solid rgba(16,18,28,0.14)', fontFamily: 'DM Sans', fontSize: 13, color: '#1E2230', resize: 'vertical', boxSizing: 'border-box' }} />
      )}
      {resp?.nota && !openNota && <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 12, color: '#8A8FA6', fontStyle: 'italic' }}>Tu nota: {resp.nota}</div>}
    </div>
  );
}

export default function DesarrolladorRecomendaciones({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try { setData(await getDevRecomendaciones()); } catch (e) { setMsg(e?.message || 'No se pudo cargar.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onRespond = async (id, status, nota) => {
    setBusy(true); setMsg('');
    try {
      await responderRecomendacion(id, status, nota);
      setMsg(status === 'aceptado' ? '¡Gracias! El equipo DMX lo verá.' : 'Registrado.');
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo enviar tu respuesta.'); }
    finally { setBusy(false); setTimeout(() => setMsg(''), 3000); }
  };

  const recs = (data && data.recomendaciones) || [];

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div data-testid="dev-recomendaciones" style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Sparkle size={20} color="#6366F1" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream, #1E2230)', margin: 0, letterSpacing: '-0.02em' }}>Recomendaciones para ti</h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: '#6B6F86', margin: '0 0 20px', lineHeight: 1.5, maxWidth: 620 }}>
          Basadas en lo que la gente busca y NO encuentra en tus zonas. Dinos si te interesa construir esto.
        </p>
        {msg && <div style={{ marginBottom: 14, fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700, color: '#0E7A53', background: 'rgba(14,122,83,0.08)', borderRadius: 10, padding: '10px 14px' }}>{msg}</div>}

        {data && (data.vacio || recs.length === 0) ? (
          <div style={{ padding: 30, borderRadius: 16, background: 'var(--surface-2, #F4F4F7)', border: '1px solid var(--border)', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13.5, color: '#8A8FA6' }}>
            {data.lectura || 'Aún no hay recomendaciones. Aparecen cuando detectamos demanda sin oferta en tus colonias.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recs.map((b) => <BriefCard key={b.id} b={b} onRespond={onRespond} busy={busy} />)}
          </div>
        )}
      </div>
    </DeveloperLayout>
  );
}
