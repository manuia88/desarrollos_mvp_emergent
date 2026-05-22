// W5.x F9 · useSpeechRecognition · Web Speech API wrapper · es-MX
import { useCallback, useEffect, useRef, useState } from 'react';

function getSpeechRecognitionAPI() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function useSpeechRecognition({
  lang = 'es-MX',
  onResult,
  onError,
  continuous = false,
} = {}) {
  const SpeechRecognitionAPI = getSpeechRecognitionAPI();
  const supported = !!SpeechRecognitionAPI;
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const cbRef = useRef({ onResult, onError });

  // Mantener callbacks frescos sin recrear recognition
  useEffect(() => {
    cbRef.current = { onResult, onError };
  }, [onResult, onError]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError('not_supported');
      if (cbRef.current.onError) cbRef.current.onError('not_supported');
      return;
    }
    // Si ya hay una instancia activa, detener primero
    if (recognitionRef.current && isListening) return;

    setError(null);
    setTranscript('');
    try {
      const rec = new SpeechRecognitionAPI();
      rec.lang = lang;
      rec.continuous = !!continuous;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        try {
          const last = event.results.length - 1;
          const text = event.results[last][0].transcript || '';
          setTranscript(text);
          if (cbRef.current.onResult) cbRef.current.onResult(text);
        } catch (e) {
          /* ignore parse */
        }
      };

      rec.onerror = (event) => {
        const code = event?.error || 'unknown';
        setError(code);
        if (cbRef.current.onError) cbRef.current.onError(code);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (e) {
      setError('start_failed');
      setIsListening(false);
      if (cbRef.current.onError) cbRef.current.onError('start_failed');
    }
  }, [SpeechRecognitionAPI, supported, lang, continuous, isListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        try { rec.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return { isListening, transcript, error, supported, start, stop };
}
