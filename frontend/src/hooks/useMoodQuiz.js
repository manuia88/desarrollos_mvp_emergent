// W5.x F10 · useMoodQuiz · estado + 6 preguntas con valores fijos
import { useCallback, useMemo, useState } from 'react';

const SESSION_KEY = 'visitor_session_id';

function getOrCreateSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `vs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `vs_${Date.now()}`;
  }
}

// 6 preguntas · 2 opciones cada una · dimension + weight (+1/-1)
export const QUESTIONS = [
  {
    id: 'q1', text_key: 'mood.q1_text',
    options: [
      { value: 'a', label_key: 'mood.q1_a', dim: 'calm', weight: 1 },
      { value: 'b', label_key: 'mood.q1_b', dim: 'calm', weight: -1 },
    ],
  },
  {
    id: 'q2', text_key: 'mood.q2_text',
    options: [
      { value: 'a', label_key: 'mood.q2_a', dim: 'social', weight: 1 },
      { value: 'b', label_key: 'mood.q2_b', dim: 'social', weight: -1 },
    ],
  },
  {
    id: 'q3', text_key: 'mood.q3_text',
    options: [
      { value: 'a', label_key: 'mood.q3_a', dim: 'eclectic', weight: -1 },
      { value: 'b', label_key: 'mood.q3_b', dim: 'eclectic', weight: 1 },
    ],
  },
  {
    id: 'q4', text_key: 'mood.q4_text',
    options: [
      { value: 'a', label_key: 'mood.q4_a', dim: 'eclectic', weight: -1 },
      { value: 'b', label_key: 'mood.q4_b', dim: 'eclectic', weight: 1 },
    ],
  },
  {
    id: 'q5', text_key: 'mood.q5_text',
    options: [
      { value: 'a', label_key: 'mood.q5_a', dim: 'modern', weight: -1 },
      { value: 'b', label_key: 'mood.q5_b', dim: 'modern', weight: 1 },
    ],
  },
  {
    id: 'q6', text_key: 'mood.q6_text',
    options: [
      { value: 'a', label_key: 'mood.q6_a', dim: 'connected', weight: 1 },
      { value: 'b', label_key: 'mood.q6_b', dim: 'connected', weight: -1 },
    ],
  },
];

const EMPTY_ANSWERS = QUESTIONS.reduce((acc, q) => { acc[q.id] = null; return acc; }, {});

export default function useMoodQuiz() {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState(() => ({ ...EMPTY_ANSWERS }));
  const visitor_session_id = useMemo(() => getOrCreateSessionId(), []);

  const total = QUESTIONS.length;
  const currentQuestion = QUESTIONS[Math.min(currentIdx, total - 1)];

  const isComplete = useMemo(
    () => QUESTIONS.every((q) => answers[q.id] !== null && answers[q.id] !== undefined),
    [answers],
  );

  const progress = useMemo(() => {
    const answered = QUESTIONS.filter((q) => answers[q.id]).length;
    return Math.round((answered / total) * 100);
  }, [answers, total]);

  const selectAnswer = useCallback((qid, value) => {
    setAnswers((prev) => {
      if (prev[qid] === value) return prev;
      const next = { ...prev, [qid]: value };
      return next;
    });
    // Avanzar al siguiente sin saltarse preguntas ya respondidas vacías
    const idx = QUESTIONS.findIndex((q) => q.id === qid);
    if (idx !== -1 && idx < total - 1) {
      setCurrentIdx(idx + 1);
    } else if (idx === total - 1) {
      setCurrentIdx(idx); // se queda en la última hasta que isComplete dispare submit
    }
  }, [total]);

  const reset = useCallback(() => {
    setAnswers({ ...EMPTY_ANSWERS });
    setCurrentIdx(0);
  }, []);

  return {
    questions: QUESTIONS,
    currentQuestion,
    currentIdx,
    answers,
    isComplete,
    progress,
    total,
    selectAnswer,
    reset,
    visitor_session_id,
  };
}
