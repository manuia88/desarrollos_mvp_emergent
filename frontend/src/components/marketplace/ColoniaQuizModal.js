/**
 * ColoniaQuizModal — Phase 4 Batch 26 (C4)
 * Wizard de 10 pasos que matchea al usuario con su colonia ideal y captura
 * lead via email.
 *
 * Props:
 *   open      — boolean
 *   onClose   — callback
 *   onSelectColonia(coloniaId) — callback opcional al hacer click en un match
 */
import React, { useMemo, useState } from 'react';
import { QUIZ_QUESTIONS } from '../../config/quizQuestions';
import { submitQuiz } from '../../api/marketplace';
import { X, ArrowRight, ArrowLeft, Sparkle } from '../icons';

const TOTAL_STEPS = QUIZ_QUESTIONS.length;

export default function ColoniaQuizModal({ open, onClose, onSelectColonia }) {
  const [step, setStep] = useState(0);          // 0..TOTAL_STEPS-1 = preguntas; TOTAL_STEPS = email; +1 = resultados
  const [answers, setAnswers] = useState({});
  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const totalScreens = TOTAL_STEPS + 1; // +1 para email
  const progress = useMemo(() => {
    if (step >= TOTAL_STEPS) return 100;
    return Math.round(((step + 1) / totalScreens) * 100);
  }, [step, totalScreens]);

  const close = () => {
    setStep(0); setAnswers({}); setEmail('');
    setAccepted(false); setLoading(false);
    setResults(null); setError(null);
    onClose && onClose();
  };

  const currentQuestion = step < TOTAL_STEPS ? QUIZ_QUESTIONS[step] : null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : null;

  const setAnswer = (qId, value, type) => {
    setAnswers(prev => {
      if (type === 'multi') {
        const arr = Array.isArray(prev[qId]) ? prev[qId] : [];
        const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
        return { ...prev, [qId]: next };
      }
      return { ...prev, [qId]: value };
    });
  };

  const canAdvance = () => {
    if (!currentQuestion) return true;
    const a = answers[currentQuestion.id];
    if (currentQuestion.type === 'multi') return Array.isArray(a) && a.length > 0;
    return !!a;
  };

  const next = () => {
    if (!canAdvance()) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  };
  const prev = () => { if (step > 0) setStep(step - 1); };

  const submit = async () => {
    if (!email.trim() || !email.includes('@') || !accepted) return;
    setLoading(true); setError(null);
    try {
      const data = await submitQuiz(email.trim(), answers, true);
      setResults(data);
      setStep(TOTAL_STEPS + 1);
    } catch (err) {
      setError(err?.message || 'Error procesando tu quiz. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      data-testid="colonia-quiz-modal-backdrop"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(6,8,15,0.86)', backdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        overflowY: 'auto',
      }}
    >
      <div
        data-testid="colonia-quiz-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(13,16,23,0.98)',
          border: '1px solid rgba(240,235,224,0.12)',
          borderRadius: 22, padding: '24px',
          width: '100%', maxWidth: 540,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.28)',
            fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
            color: 'rgba(99,102,241,0.9)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <Sparkle size={11} /> Tu colonia ideal
          </div>
          <button
            data-testid="colonia-quiz-close"
            onClick={close}
            style={{
              width: 30, height: 30, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(240,235,224,0.15)',
              color: 'rgba(240,235,224,0.6)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Progress bar (excepto en resultados) */}
        {step <= TOTAL_STEPS && (
          <div style={{ marginBottom: 22 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: 'DM Sans', fontSize: 11,
              color: 'rgba(240,235,224,0.5)', marginBottom: 6,
            }}>
              <span>Paso {Math.min(step + 1, totalScreens)} de {totalScreens}</span>
              <span>{progress}%</span>
            </div>
            <div style={{
              height: 4, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}

        {/* Pregunta */}
        {currentQuestion && (
          <div data-testid={`quiz-q-${currentQuestion.id}`}>
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
              lineHeight: 1.2, marginBottom: 8,
            }}>
              {currentQuestion.title}
            </div>
            {currentQuestion.subtitle && (
              <div style={{
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.5)', marginBottom: 18,
              }}>
                {currentQuestion.subtitle}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {currentQuestion.options.map(opt => {
                const selected = currentQuestion.type === 'multi'
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.value)
                  : currentAnswer === opt.value;
                return (
                  <button
                    key={opt.value}
                    data-testid={`quiz-opt-${currentQuestion.id}-${opt.value}`}
                    onClick={() => setAnswer(currentQuestion.id, opt.value, currentQuestion.type)}
                    style={{
                      width: '100%', padding: '13px 16px',
                      borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      border: selected
                        ? '1px solid rgba(99,102,241,0.55)'
                        : '1px solid rgba(240,235,224,0.12)',
                      background: selected
                        ? 'rgba(99,102,241,0.14)'
                        : 'rgba(255,255,255,0.03)',
                      color: selected ? 'var(--cream, #F0EBE0)' : 'rgba(240,235,224,0.78)',
                      fontFamily: 'DM Sans', fontWeight: selected ? 700 : 500, fontSize: 14,
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>{opt.label}</span>
                    {selected && (
                      <span style={{
                        width: 18, height: 18, borderRadius: 9999,
                        background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                        color: '#fff', fontSize: 11, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                data-testid="quiz-prev"
                onClick={prev}
                disabled={step === 0}
                style={{
                  padding: '11px 18px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(240,235,224,0.15)',
                  color: step === 0 ? 'rgba(240,235,224,0.25)' : 'rgba(240,235,224,0.7)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: step === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <ArrowLeft size={12} /> Atrás
              </button>
              <button
                data-testid="quiz-next"
                onClick={next}
                disabled={!canAdvance()}
                style={{
                  flex: 1, padding: '11px 18px', borderRadius: 9999,
                  border: 'none',
                  background: canAdvance()
                    ? 'linear-gradient(90deg,#6366F1,#EC4899)'
                    : 'rgba(99,102,241,0.3)',
                  color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: canAdvance() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {step === TOTAL_STEPS - 1 ? 'Ver matches' : 'Continuar'} <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Email step */}
        {step === TOTAL_STEPS && (
          <div data-testid="quiz-email-step">
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
              lineHeight: 1.2, marginBottom: 8,
            }}>
              Listo, ¿a qué email enviamos tu match?
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 13,
              color: 'rgba(240,235,224,0.5)', marginBottom: 18,
            }}>
              Te enviamos las 3 colonias que mejor matchean contigo y desarrollos disponibles ahí.
            </div>

            <input
              data-testid="quiz-email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              placeholder="tu@email.com"
              style={{
                width: '100%', padding: '12px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(240,235,224,0.15)'}`,
                borderRadius: 10, outline: 'none',
                fontFamily: 'DM Sans', fontSize: 14,
                color: 'var(--cream, #F0EBE0)',
                boxSizing: 'border-box', marginBottom: 14,
              }}
            />

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18 }}>
              <input
                type="checkbox"
                id="quiz-accept"
                data-testid="quiz-accept"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
                style={{ marginTop: 2, accentColor: '#6366F1', cursor: 'pointer' }}
              />
              <label htmlFor="quiz-accept" style={{
                fontFamily: 'DM Sans', fontSize: 12,
                color: 'rgba(240,235,224,0.55)', cursor: 'pointer', lineHeight: 1.5,
              }}>
                Acepto recibir mis matches y desarrollos relacionados de DesarrollosMX. Cancelo cuando quiera.
              </label>
            </div>

            {error && (
              <div style={{
                padding: '9px 12px', borderRadius: 8, marginBottom: 14,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontFamily: 'DM Sans', fontSize: 12, color: '#FCA5A5',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={prev}
                style={{
                  padding: '12px 18px', borderRadius: 9999,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(240,235,224,0.15)',
                  color: 'rgba(240,235,224,0.7)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <ArrowLeft size={12} /> Atrás
              </button>
              <button
                data-testid="quiz-submit"
                onClick={submit}
                disabled={!email.trim() || !email.includes('@') || !accepted || loading}
                style={{
                  flex: 1, padding: '12px 18px', borderRadius: 9999,
                  border: 'none',
                  background: (!email.trim() || !email.includes('@') || !accepted || loading)
                    ? 'rgba(99,102,241,0.3)'
                    : 'linear-gradient(90deg,#6366F1,#EC4899)',
                  color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  cursor: (!email.trim() || !email.includes('@') || !accepted || loading)
                    ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {loading ? 'Calculando matches…' : <>Ver mis 3 matches <Sparkle size={12} /></>}
              </button>
            </div>
          </div>
        )}

        {/* Resultados */}
        {step === TOTAL_STEPS + 1 && results && (
          <div data-testid="quiz-results">
            <div style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
              color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em',
              marginBottom: 6,
            }}>
              Tus 3 matches
            </div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240,235,224,0.5)', marginBottom: 18,
            }}>
              {results.email_sent
                ? 'Te enviamos una copia por email.'
                : 'Resultados listos. (Email se enviará en breve.)'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {(results.matches || []).map((m, i) => (
                <button
                  key={m.colonia_id}
                  data-testid={`quiz-match-${m.colonia_id}`}
                  onClick={() => onSelectColonia && onSelectColonia(m.colonia_id, m.nombre)}
                  style={{
                    textAlign: 'left', cursor: onSelectColonia ? 'pointer' : 'default',
                    padding: '14px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(240,235,224,0.1)',
                    color: 'inherit',
                  }}
                >
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 6,
                  }}>
                    <div style={{
                      fontFamily: 'Outfit', fontWeight: 800, fontSize: 17,
                      color: 'var(--cream, #F0EBE0)',
                    }}>
                      {i + 1}. {m.nombre}
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: 9999,
                      background: 'linear-gradient(90deg,#6366F1,#EC4899)',
                      color: '#fff', fontFamily: 'DM Sans',
                      fontSize: 12, fontWeight: 800,
                    }}>
                      {m.match_pct}% match
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11,
                    color: 'rgba(240,235,224,0.5)', marginBottom: 8,
                  }}>
                    {m.alcaldia} · {m.projects_count || 0} desarrollo{m.projects_count === 1 ? '' : 's'}
                  </div>
                  {Array.isArray(m.top_3_reasons) && m.top_3_reasons.length > 0 && (
                    <ul style={{
                      margin: 0, paddingLeft: 16,
                      fontFamily: 'DM Sans', fontSize: 12,
                      color: 'rgba(240,235,224,0.7)', lineHeight: 1.6,
                    }}>
                      {m.top_3_reasons.slice(0, 3).map((r, ri) => <li key={ri}>{r}</li>)}
                    </ul>
                  )}
                </button>
              ))}
            </div>

            <button
              data-testid="quiz-finish"
              onClick={close}
              style={{
                width: '100%', padding: '12px 18px', borderRadius: 9999,
                border: '1px solid rgba(240,235,224,0.18)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--cream, #F0EBE0)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
