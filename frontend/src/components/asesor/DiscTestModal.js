/**
 * Phase 4 Batch 32 · Component — DiscTestModal
 *
 * Wizard 7-step inline (patrón ColoniaQuizModal B26).
 * Step final: result card con primary letter + bars D/I/S/C + narrative Claude.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { DISC_QUESTIONS, PRIMARY_LABELS, PRIMARY_COLORS } from '../../config/discQuestions';
import { submitDisc } from '../../api/asesor_identity';

const GRADIENT = 'linear-gradient(90deg, var(--theme), var(--theme-3))';

function ProgressBar({ step, total }) {
  const pct = (step / total) * 100;
  return (
    <div style={{
      height: 4, borderRadius: 9999,
      background: 'rgba(240,235,224,0.1)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: GRADIENT,
        transition: 'width 350ms cubic-bezier(0.22,1,0.36,1)',
      }} />
    </div>
  );
}

function ResultCard({ result, narrative, onClose, onRetake }) {
  const primary = result?.primary || 'D';
  const primaryColor = PRIMARY_COLORS[primary] || 'var(--theme)';

  return (
    <div data-testid="disc-result-card" style={{
      display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--cream-3)', marginBottom: 8,
        }}>Tu perfil DISC</div>
        <div data-testid="disc-primary-letter" style={{
          fontSize: 96, fontWeight: 800, lineHeight: 1,
          color: primaryColor,
          fontFamily: 'Outfit', letterSpacing: '-0.04em',
        }}>{primary}</div>
        <div style={{
          fontSize: 16, fontWeight: 600, color: 'var(--cream)',
          marginTop: 8,
        }}>{PRIMARY_LABELS[primary] || primary}</div>
      </div>

      {/* Dimension bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['D', 'I', 'S', 'C'].map((dim) => {
          const v = Number(result?.[dim] || 0);
          return (
            <div key={dim} data-testid={`disc-bar-${dim}`}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, color: 'var(--cream-2)', marginBottom: 4,
              }}>
                <span>{dim} · {PRIMARY_LABELS[dim]}</span>
                <span style={{ color: 'var(--cream-3)' }}>{v}</span>
              </div>
              <div style={{
                height: 6, borderRadius: 9999,
                background: 'rgba(240,235,224,0.08)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, v))}%`,
                  background: PRIMARY_COLORS[dim],
                  transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Narrative */}
      <div data-testid="disc-narrative" style={{
        padding: 14, borderRadius: 12,
        background: 'rgba(var(--theme-rgb),0.06)',
        border: '1px solid rgba(var(--theme-rgb),0.18)',
        fontSize: 13.5, color: 'var(--cream)', lineHeight: 1.7,
      }}>
        {narrative || 'Tu narrativa personalizada se calcula con IA.'}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button data-testid="disc-finish-btn" type="button" onClick={onClose}
                style={{
                  flex: 1, padding: '12px 20px', borderRadius: 9999,
                  border: 'none', background: GRADIENT, color: '#fff',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Cerrar</button>
        <button data-testid="disc-retake-btn" type="button" onClick={onRetake}
                style={{
                  padding: '12px 18px', borderRadius: 9999,
                  border: '1px solid rgba(240,235,224,0.18)',
                  background: 'transparent', color: 'var(--cream)',
                  fontSize: 12, cursor: 'pointer',
                }}>Volver a tomar</button>
      </div>
    </div>
  );
}

export default function DiscTestModal({ open, onClose, onSubmitted }) {
  const [step, setStep] = useState(0);  // 0..6 = preguntas, 7 = result
  const [answers, setAnswers] = useState({});  // { q1: 'a', q2: 'b', ... }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const total = DISC_QUESTIONS.length;

  const reset = useCallback(() => {
    setStep(0); setAnswers({}); setResult(null); setError('');
  }, []);

  const handleAnswer = useCallback((q_id, value) => {
    setAnswers((prev) => ({ ...prev, [q_id]: value }));
    // Auto-advance
    if (step < total - 1) {
      setTimeout(() => setStep((s) => s + 1), 200);
    }
  }, [step, total]);

  const handleSubmit = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const payload = DISC_QUESTIONS.map((q) => ({
        q_id: q.q_id, value: answers[q.q_id],
      })).filter((a) => a.value);

      if (payload.length < total) {
        setError('Faltan respuestas. Revisa cada pregunta.');
        setLoading(false);
        return;
      }

      const data = await submitDisc(payload);
      setResult(data);
      setStep(total);  // result step
      onSubmitted?.(data);
    } catch (e) {
      setError(e.message || 'Error al enviar DISC');
    } finally {
      setLoading(false);
    }
  }, [answers, total, onSubmitted]);

  const allAnswered = useMemo(() =>
    DISC_QUESTIONS.every((q) => answers[q.q_id]),
    [answers],
  );

  if (!open) return null;

  const currentQ = step < total ? DISC_QUESTIONS[step] : null;

  return (
    <>
      {/* A11y: backdrop click-to-close · role="presentation" */}
      <div
        role="presentation"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 75,
          background: 'rgba(6,8,15,0.7)', backdropFilter: 'blur(4px)',
        }}
      />
      <div data-testid="disc-modal" role="dialog" aria-label="Test DISC"
           style={{
             position: 'fixed', top: '50%', left: '50%',
             transform: 'translate(-50%,-50%)', zIndex: 76,
             width: 'min(560px, 96vw)',
             maxHeight: '92vh', overflowY: 'auto',
             padding: 24, borderRadius: 18,
             background: 'rgba(13,16,23,0.96)',
             border: '1px solid rgba(240,235,224,0.14)',
             backdropFilter: 'blur(24px)',
             display: 'flex', flexDirection: 'column', gap: 16,
           }}>

        <header style={{ display: 'flex', alignItems: 'center',
                         justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{
              fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--cream-3)',
            }}>Test DISC · 2 min</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cream)',
                          marginTop: 2, fontFamily: 'Outfit' }}>
              {step < total ? `Pregunta ${step + 1} de ${total}` : 'Tu resultado'}
            </div>
          </div>
          <button data-testid="disc-close-btn" type="button" onClick={onClose}
                  aria-label="Cerrar"
                  style={{
                    width: 36, height: 36, borderRadius: 9999,
                    border: '1px solid rgba(240,235,224,0.18)',
                    background: 'transparent', color: 'var(--cream)',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1,
                  }}>×</button>
        </header>

        {step < total && <ProgressBar step={step + 1} total={total} />}

        {currentQ ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div data-testid={`disc-prompt-${currentQ.q_id}`}
                 style={{
                   fontSize: 17, fontWeight: 600, color: 'var(--cream)',
                   lineHeight: 1.4, fontFamily: 'Outfit',
                 }}>
              {currentQ.prompt}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentQ.options.map((opt) => {
                const selected = answers[currentQ.q_id] === opt.value;
                return (
                  <button key={opt.value} type="button"
                          data-testid={`disc-${currentQ.q_id}-${opt.value}`}
                          onClick={() => handleAnswer(currentQ.q_id, opt.value)}
                          style={{
                            textAlign: 'left',
                            padding: '14px 18px',
                            borderRadius: 14,
                            border: selected
                              ? '1px solid transparent'
                              : '1px solid rgba(240,235,224,0.18)',
                            background: selected
                              ? 'linear-gradient(90deg, rgba(var(--theme-rgb),0.18), rgba(var(--theme-rgb),0.18))'
                              : 'rgba(240,235,224,0.04)',
                            color: 'var(--cream)',
                            fontSize: 14, cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'background 180ms, border-color 180ms',
                          }}>{opt.label}</button>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button data-testid="disc-prev-btn" type="button"
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      disabled={step === 0}
                      style={{
                        padding: '10px 18px', borderRadius: 9999,
                        border: '1px solid rgba(240,235,224,0.18)',
                        background: 'transparent', color: 'var(--cream)',
                        fontSize: 12, cursor: step === 0 ? 'not-allowed' : 'pointer',
                        opacity: step === 0 ? 0.4 : 1,
                      }}>Anterior</button>

              {step === total - 1 ? (
                <button data-testid="disc-final-submit-btn" type="button"
                        onClick={handleSubmit}
                        disabled={!allAnswered || loading}
                        style={{
                          padding: '10px 20px', borderRadius: 9999,
                          border: 'none', background: GRADIENT, color: '#fff',
                          fontWeight: 600, fontSize: 12,
                          cursor: (!allAnswered || loading) ? 'not-allowed' : 'pointer',
                          opacity: (!allAnswered || loading) ? 0.6 : 1,
                        }}>{loading ? 'Calculando…' : 'Ver mi resultado'}</button>
              ) : (
                <button data-testid="disc-next-btn" type="button"
                        onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                        style={{
                          padding: '10px 18px', borderRadius: 9999,
                          border: '1px solid rgba(240,235,224,0.18)',
                          background: 'transparent', color: 'var(--cream)',
                          fontSize: 12, cursor: 'pointer',
                        }}>Siguiente</button>
              )}
            </div>

            {error && (
              <div data-testid="disc-error" style={{
                padding: 8, borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#fca5a5', fontSize: 12,
              }}>{error}</div>
            )}
          </div>
        ) : (
          <ResultCard result={result?.result || {}}
                      narrative={result?.narrative_text}
                      onClose={onClose}
                      onRetake={reset} />
        )}
      </div>
    </>
  );
}
