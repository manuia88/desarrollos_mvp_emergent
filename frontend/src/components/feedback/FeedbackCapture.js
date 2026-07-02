/**
 * FeedbackCapture — captura de señales estructuradas del asesor tras una cita (Batch 7 feature).
 * Menús de taxonomía cerrada (cero texto libre). Botón "Auto-etiquetar con IA" = la IA lee la
 * conversación y llena las etiquetas. Montar en la ficha del lead / cierre de cita.
 *   <FeedbackCapture leadId={lead.id} onSaved={() => ...} />
 */
import React, { useState } from 'react';
import { FEEDBACK_TAXONOMY, recordFeedbackSignals } from '../../api/feedbackSignals';

const es = (s) => (s || '').replace(/_/g, ' ');

export default function FeedbackCapture({ leadId, onSaved }) {
  const [outcome, setOutcome] = useState('');
  const [objCat, setObjCat] = useState('');
  const [objSub, setObjSub] = useState('');
  const [atractores, setAtractores] = useState([]);
  const [tipoComprador, setTipoComprador] = useState('');
  const [urgencia, setUrgencia] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const toggleAtractor = (a) =>
    setAtractores((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const buildSignals = () => {
    const s = {};
    if (outcome) s.outcome = outcome;
    if (objCat) s.objeciones = [{ cat: objCat, sub: objSub || null }];
    if (atractores.length) s.atractores = atractores;
    const perfil = {};
    if (tipoComprador) perfil.tipo_comprador = tipoComprador;
    if (urgencia) perfil.urgencia = urgencia;
    if (Object.keys(perfil).length) s.perfil = perfil;
    return s;
  };

  const save = async (auto) => {
    setBusy(true); setMsg(null);
    try {
      await recordFeedbackSignals(leadId, auto ? {} : buildSignals(), auto);
      setMsg(auto ? 'Etiquetado por IA guardado ✓' : 'Feedback guardado ✓');
      if (onSaved) onSaved();
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const sel = { padding: '7px 10px', borderRadius: 8, background: '#12151d', color: '#eee',
    border: '1px solid #2a2e3a', fontSize: 13, minWidth: 160 };

  return (
    <div className="dmx-card" style={{ padding: 18 }}>
      <h4 style={{ marginBottom: 12 }}>Feedback de la cita</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <label style={{ fontSize: 12 }}>Resultado
          <div><select style={sel} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">—</option>
            {Object.entries(FEEDBACK_TAXONOMY.outcome).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        </label>

        <label style={{ fontSize: 12 }}>Motivo (si no avanzó)
          <div style={{ display: 'flex', gap: 6 }}>
            <select style={sel} value={objCat} onChange={(e) => { setObjCat(e.target.value); setObjSub(''); }}>
              <option value="">—</option>
              {Object.keys(FEEDBACK_TAXONOMY.objeciones).map((c) => <option key={c} value={c}>{es(c)}</option>)}
            </select>
            {objCat && (
              <select style={sel} value={objSub} onChange={(e) => setObjSub(e.target.value)}>
                <option value="">(detalle)</option>
                {FEEDBACK_TAXONOMY.objeciones[objCat].map((s) => <option key={s} value={s}>{es(s)}</option>)}
              </select>
            )}
          </div>
        </label>

        <label style={{ fontSize: 12 }}>Tipo de comprador
          <div><select style={sel} value={tipoComprador} onChange={(e) => setTipoComprador(e.target.value)}>
            <option value="">—</option>
            {FEEDBACK_TAXONOMY.perfil.tipo_comprador.map((t) => <option key={t} value={t}>{es(t)}</option>)}
          </select></div>
        </label>

        <label style={{ fontSize: 12 }}>Urgencia
          <div><select style={sel} value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
            <option value="">—</option>
            {FEEDBACK_TAXONOMY.perfil.urgencia.map((u) => <option key={u} value={u}>{es(u)}</option>)}
          </select></div>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, marginBottom: 6 }}>¿Qué le atrajo?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FEEDBACK_TAXONOMY.atractores.map((a) => (
            <button key={a} type="button" onClick={() => toggleAtractor(a)}
              style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 12, cursor: 'pointer',
                border: '1px solid #2a2e3a',
                background: atractores.includes(a) ? 'linear-gradient(90deg,#6366F1,#EC4899)' : '#12151d',
                color: '#eee' }}>
              {es(a)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={() => save(false)}
          style={{ padding: '9px 18px', borderRadius: 9999, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', fontWeight: 600 }}>
          Guardar feedback
        </button>
        <button type="button" disabled={busy} onClick={() => save(true)}
          style={{ padding: '9px 18px', borderRadius: 9999, cursor: 'pointer',
            border: '1px solid #2a2e3a', background: '#12151d', color: '#eee' }}>
          ✨ Auto-etiquetar con IA
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#EC4899' : '#4ade80' }}>{msg}</span>}
      </div>
    </div>
  );
}
