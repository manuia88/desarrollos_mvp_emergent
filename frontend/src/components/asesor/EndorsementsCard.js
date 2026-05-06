/**
 * Phase 4 Batch 32 · Component — EndorsementsCard
 *
 * Display avg rating big + stars + count.
 * - Public mode (asesorOwn=false): list 3 más recientes, "Ver todas" modal.
 * - Owner mode (asesorOwn=true): editable, can delete spam.
 *
 * Si props.canSubmit=true → botón "Deja una reseña" abre modal con form.
 */
import React, { useState } from 'react';
import { postEndorsement, deleteMyEndorsement } from '../../api/asesor_identity';

const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';

function Stars({ rating, size = 14 }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24"
             fill={n <= rating ? '#FBBF24' : 'rgba(240,235,224,0.18)'}
             aria-hidden="true">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </span>
  );
}

function EndorsementItem({ item, asesorOwn = false, onDelete }) {
  return (
    <li data-testid={`endorsement-${item.endorsement_id}`} style={{
      padding: 12, borderRadius: 12,
      background: 'rgba(240,235,224,0.04)',
      border: '1px solid rgba(240,235,224,0.08)',
      listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Stars rating={item.rating} />
          <span style={{ fontSize: 12, color: 'var(--cream)', fontWeight: 500 }}>
            {item.client_name || 'Cliente'}
          </span>
        </div>
        {asesorOwn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!item.verified && (
              <span style={{
                padding: '2px 8px', borderRadius: 9999, fontSize: 10,
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.3)',
                color: '#fbbf24',
              }}>Pendiente</span>
            )}
            <button data-testid={`endorsement-delete-${item.endorsement_id}`}
                    type="button"
                    onClick={() => onDelete?.(item.endorsement_id)}
                    style={{
                      padding: '4px 10px', borderRadius: 9999,
                      border: '1px solid rgba(239,68,68,0.3)',
                      background: 'transparent', color: '#fca5a5',
                      fontSize: 10, cursor: 'pointer',
                    }}>Borrar</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6 }}>
        {item.text}
      </div>
      {item.project_name && (
        <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>
          Proyecto: {item.project_name}
        </div>
      )}
    </li>
  );
}

function ReviewForm({ asesorId, projectId, onSubmitted, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (name.trim().length < 2) { setError('Nombre muy corto'); return; }
    if (!email.includes('@')) { setError('Email inválido'); return; }
    if (text.trim().length < 8) { setError('La reseña debe tener al menos 8 caracteres'); return; }
    setLoading(true);
    try {
      await postEndorsement({
        asesorId, clientEmail: email, clientName: name,
        rating, text, projectId,
      });
      setDone(true);
      onSubmitted?.();
    } catch (e) {
      setError(e.message || 'Error al enviar');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div data-testid="review-form-success" style={{
        padding: 20, borderRadius: 14,
        background: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.25)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#86efac', marginBottom: 8 }}>
          Revisa tu correo
        </div>
        <div style={{ fontSize: 13, color: 'var(--cream-2)' }}>
          Te enviamos un email a <strong>{email}</strong>. Confirma con el enlace
          para que tu reseña aparezca pública.
        </div>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 12,
    border: '1px solid rgba(240,235,224,0.18)',
    background: 'rgba(240,235,224,0.04)',
    color: 'var(--cream)', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div data-testid="review-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input data-testid="review-name" placeholder="Tu nombre"
             value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <input data-testid="review-email" placeholder="Tu correo electrónico" type="email"
             value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>Calificación:</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button"
                  data-testid={`review-star-${n}`}
                  onClick={() => setRating(n)}
                  style={{
                    background: 'transparent', border: 'none', padding: 2,
                    cursor: 'pointer',
                  }}>
            <svg width={22} height={22} viewBox="0 0 24 24"
                 fill={n <= rating ? '#FBBF24' : 'rgba(240,235,224,0.18)'}>
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea data-testid="review-text" rows={4}
                placeholder="Cuenta tu experiencia con el asesor (mínimo 8 caracteres)…"
                value={text} onChange={(e) => setText(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />

      {error && (
        <div data-testid="review-error" style={{
          padding: 8, borderRadius: 8,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 12,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button data-testid="review-submit-btn" type="button"
                onClick={submit} disabled={loading}
                style={{
                  flex: 1, padding: '12px 20px', borderRadius: 9999,
                  border: 'none', background: GRADIENT, color: '#fff',
                  fontWeight: 600, fontSize: 13,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}>
          {loading ? 'Enviando…' : 'Enviar reseña'}
        </button>
        <button data-testid="review-cancel-btn" type="button"
                onClick={onCancel}
                style={{
                  padding: '12px 18px', borderRadius: 9999,
                  border: '1px solid rgba(240,235,224,0.18)',
                  background: 'transparent', color: 'var(--cream)',
                  fontSize: 12, cursor: 'pointer',
                }}>Cancelar</button>
      </div>
    </div>
  );
}

export default function EndorsementsCard({
  asesorId,
  asesorOwn = false,
  canSubmit = false,
  endorsementsData = null,
  onChange,
  projectId = null,
}) {
  const data = endorsementsData || { items: [], count_verified: 0, avg_rating: 0 };
  const [showAll, setShowAll] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const recent = (data.items || []).slice(0, showAll ? 100 : 3);

  const handleDelete = async (eid) => {
    if (!window.confirm('¿Borrar esta reseña?')) return;
    try {
      await deleteMyEndorsement(eid);
      onChange?.();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div data-testid="endorsements-card" style={{
      padding: 20, borderRadius: 16,
      background: 'rgba(13,16,23,0.92)',
      border: '1px solid rgba(240,235,224,0.12)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--cream-3)',
          }}>Reseñas verificadas</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span data-testid="endorsements-avg" style={{
              fontSize: 36, fontWeight: 700, color: 'var(--cream)',
              fontFamily: 'Outfit', letterSpacing: '-0.03em',
              background: GRADIENT,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>{(data.avg_rating || 0).toFixed(1)}</span>
            <Stars rating={Math.round(data.avg_rating || 0)} size={16} />
          </div>
          <div data-testid="endorsements-count" style={{
            fontSize: 12, color: 'var(--cream-3)', marginTop: 4,
          }}>
            Basado en {data.count_verified || 0} reseñas verificadas
          </div>
        </div>

        {canSubmit && !showForm && (
          <button data-testid="leave-review-btn" type="button"
                  onClick={() => setShowForm(true)}
                  style={{
                    padding: '10px 18px', borderRadius: 9999,
                    border: 'none', background: GRADIENT, color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Deja una reseña</button>
        )}
      </div>

      {showForm && (
        <ReviewForm asesorId={asesorId} projectId={projectId}
                    onSubmitted={() => { onChange?.(); }}
                    onCancel={() => setShowForm(false)} />
      )}

      {recent.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, display: 'flex',
                     flexDirection: 'column', gap: 8 }}>
          {recent.map((it) => (
            <EndorsementItem key={it.endorsement_id} item={it}
                             asesorOwn={asesorOwn} onDelete={handleDelete} />
          ))}
        </ul>
      ) : (
        <div data-testid="endorsements-empty" style={{
          padding: 16, textAlign: 'center', fontSize: 12,
          color: 'var(--cream-3)',
          border: '1px dashed rgba(240,235,224,0.18)',
          borderRadius: 12,
        }}>
          Aún sin reseñas verificadas.
          {canSubmit && ' Sé el primero en dejar la tuya.'}
        </div>
      )}

      {(data.items || []).length > 3 && (
        <button data-testid="endorsements-toggle-all" type="button"
                onClick={() => setShowAll((v) => !v)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '6px 14px', borderRadius: 9999,
                  border: '1px solid rgba(240,235,224,0.18)',
                  background: 'transparent', color: 'var(--cream)',
                  fontSize: 11, cursor: 'pointer',
                }}>
          {showAll ? 'Mostrar menos' : `Ver todas (${data.items.length})`}
        </button>
      )}
    </div>
  );
}
