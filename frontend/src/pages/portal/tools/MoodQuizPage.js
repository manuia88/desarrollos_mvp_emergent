// W5.x F10 · MoodQuizPage · /portal/vibe · intro → quiz → loading → results / error
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMoodQuiz from '../../../hooks/useMoodQuiz';
import { submitMoodQuiz } from '../../../api/mood';
import MoodQuizCard from '../../../components/mood/MoodQuizCard';
import MoodResultSummary from '../../../components/mood/MoodResultSummary';
import MoodMatchCard from '../../../components/mood/MoodMatchCard';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STEPS = {
  INTRO: 'intro',
  QUIZ: 'quiz',
  LOADING: 'loading',
  RESULTS: 'results',
  ERROR: 'error',
};

export default function MoodQuizPage() {
  const { t } = useTranslation('common');
  const quiz = useMoodQuiz();
  const [step, setStep] = useState(STEPS.INTRO);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Submit cuando complete
  useEffect(() => {
    if (step !== STEPS.QUIZ || !quiz.isComplete) return;
    let mounted = true;
    setStep(STEPS.LOADING);
    (async () => {
      try {
        const body = {
          visitor_session_id: quiz.visitor_session_id,
          answers: quiz.answers,
        };
        const r = await submitMoodQuiz(body);
        if (!mounted) return;
        if (!r) {
          // 404 fail-silent → error step con retry
          setErrorMsg(t('mood.error_generic', 'No fue posible calcular tu vibe. Intenta de nuevo.'));
          setStep(STEPS.ERROR);
          return;
        }
        setResult(r);
        setStep(STEPS.RESULTS);
      } catch (e) {
        if (!mounted) return;
        setErrorMsg(e?.body?.detail || e?.message || t('mood.error_generic', 'No fue posible calcular tu vibe. Intenta de nuevo.'));
        setStep(STEPS.ERROR);
      }
    })();
    return () => { mounted = false; };
  }, [step, quiz.isComplete, quiz.visitor_session_id, quiz.answers, t]);

  const handleReset = () => {
    quiz.reset();
    setResult(null);
    setErrorMsg(null);
    setStep(STEPS.INTRO);
  };

  const handleStart = () => {
    quiz.reset();
    setResult(null);
    setErrorMsg(null);
    setStep(STEPS.QUIZ);
  };

  const handleRetry = () => {
    setErrorMsg(null);
    setStep(STEPS.QUIZ);
  };

  const matches = Array.isArray(result?.matches) ? result.matches.slice(0, 5) : [];

  return (
    <div data-testid="mood-quiz-page" data-step={step} style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 16px', maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Vibe
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 32 }}>
        {step === STEPS.INTRO && (
          <section data-testid="mood-step-intro" style={{ textAlign: 'center', padding: '32px 16px 8px' }}>
            <h1 style={{
              margin: 0,
              fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              lineHeight: 1.05, letterSpacing: '-0.025em',
              color: CREAM,
            }}>{t('mood.page_title', 'Descubre tu vibe')}</h1>
            <p style={{
              margin: '14px auto 0', maxWidth: 560,
              color: MUTED, fontSize: 16, lineHeight: 1.55,
            }}>{t('mood.page_subtitle', '60 segundos · 6 preguntas · tus matches reales en CDMX.')}</p>

            <div style={{ marginTop: 28 }}>
              <button
                type="button"
                data-testid="mood-start-btn"
                onClick={handleStart}
                style={{
                  padding: '16px 36px', borderRadius: 9999, border: 'none',
                  background: GRAD, color: '#FFF',
                  fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                  fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: `transform 320ms ${EASE}`,
                  boxShadow: '0 18px 48px -16px rgba(99,102,241,0.6)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >{t('mood.btn_start', 'Empezar quiz')}</button>
            </div>
          </section>
        )}

        {step === STEPS.QUIZ && (
          <section data-testid="mood-step-quiz">
            <MoodQuizCard
              question={quiz.currentQuestion}
              progress={quiz.progress}
              onSelect={(v) => quiz.selectAnswer(quiz.currentQuestion.id, v)}
              stepIndex={quiz.currentIdx}
              total={quiz.total}
            />
          </section>
        )}

        {step === STEPS.LOADING && (
          <section data-testid="mood-step-loading" style={{ display: 'grid', gap: 18 }}>
            <div style={{
              maxWidth: 720, margin: '0 auto', width: '100%',
              padding: 36, background: CARD_BG, border: BORDER, borderRadius: 32,
              backdropFilter: 'blur(24px)',
            }}>
              <div style={{ height: 16, width: '60%', margin: '0 auto 24px', borderRadius: 9999, background: 'rgba(240,235,224,0.08)' }} />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ height: 10, borderRadius: 9999, background: 'rgba(240,235,224,0.06)', marginBottom: 14 }} />
              ))}
            </div>
            <div style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{
                  height: 260, borderRadius: 24,
                  background: 'linear-gradient(90deg, rgba(240,235,224,0.03), rgba(240,235,224,0.08), rgba(240,235,224,0.03))',
                  backgroundSize: '200% 100%', animation: 'moodShimmer 1.4s linear infinite',
                  border: BORDER,
                }} />
              ))}
              <style>{`@keyframes moodShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 13 }}>{t('mood.loading_text', 'Calculando tu vibe...')}</p>
          </section>
        )}

        {step === STEPS.RESULTS && result && (
          <section data-testid="mood-step-results" style={{ display: 'grid', gap: 28 }}>
            <MoodResultSummary
              mood_vector={result.mood_vector || {}}
              mood_label={result.mood_label || ''}
              onReset={handleReset}
            />

            {matches.length > 0 && (
              <div
                data-testid="mood-matches-grid"
                style={{
                  display: 'grid', gap: 18,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                }}
              >
                {matches.map((m) => (
                  <MoodMatchCard key={m.property_id} match={m} />
                ))}
              </div>
            )}
          </section>
        )}

        {step === STEPS.ERROR && (
          <section data-testid="mood-step-error" style={{
            maxWidth: 560, margin: '0 auto',
            padding: 28, borderRadius: 24,
            background: 'rgba(236,72,153,0.08)',
            border: `1px solid ${ROSE}55`,
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 18px', color: CREAM, fontSize: 14 }}>{errorMsg}</p>
            <button
              type="button"
              data-testid="mood-error-retry-btn"
              onClick={handleRetry}
              style={{
                padding: '10px 22px', borderRadius: 9999, border: 'none',
                background: GRAD, color: '#FFF',
                fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.04em', cursor: 'pointer',
                transition: `transform 280ms ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >{t('mood.error_retry', 'Reintentar')}</button>
          </section>
        )}

        <aside
          data-testid="mood-disclaimer"
          style={{
            marginTop: 8, padding: '16px 20px',
            borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 14,
            color: MUTED_2, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            maxWidth: 720, margin: '8px auto 0',
          }}
        >{t('mood.intro_disclaimer', 'Los matches se basan en heuristicas · usa tu criterio · este quiz no reemplaza visita en persona.')}</aside>
      </main>
    </div>
  );
}
