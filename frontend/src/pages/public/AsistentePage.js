// W4.4E — Phase Y.1E · Public Asistente page (/asistente)
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/landing/Navbar';
import AsistenteChat from '../../components/asistente/AsistenteChat';
import AtlaxVoiceButton from '../../components/landing/AtlaxVoiceButton';
import * as asistenteApi from '../../api/asistenteApi';
import { useAuth } from '../../App';

const STORAGE_KEY = 'dmx_asistente_session';

const EMPTY_CHIPS = [
  'Departamento Polanco bajo 5M',
  'Mejores zonas familiares en CDMX',
  '¿Cuánto puedo pagar con $20K mensuales?',
  'Quiero agendar una cita',
];

export default function AsistentePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [sessionToken, setSessionToken] = useState(null);
  const [messages, setMessages] = useState([]); // {role, content, simulated}
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedCapture, setSuggestedCapture] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const initRef = useRef(false);

  // Initialize: hydrate from query param session_token, resume from localStorage, or start new
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const referral = searchParams.get('utm_source') || null;
    const queryToken = searchParams.get('session_token') || null;
    const cached = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } })();

    const init = async () => {
      try {
        // 1. Hydrate from query param (Caya bubble expand link)
        if (queryToken) {
          try {
            const API = process.env.REACT_APP_BACKEND_URL;
            const res = await fetch(`${API}/api/asistente/sessions/${queryToken}`);
            if (res.ok) {
              const data = await res.json();
              const msgs = (data.messages || []).map(m => ({
                role: m.role,
                content: m.content,
                simulated: m.simulated,
              }));
              const seed = msgs.length === 0
                ? [{ role: 'assistant', content: 'Continuamos tu conversación previa.' }]
                : [...msgs, { role: 'assistant', content: 'Continuamos tu conversación previa. ¿En qué más te ayudo?' }];
              setSessionToken(queryToken);
              setMessages(seed);
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ session_token: queryToken, messages: seed }));
              return;
            } else if (res.status === 404 || res.status === 410) {
              // Fallback: start new with session-expired notice
              const fresh = await asistenteApi.startSession({ referral_source: referral });
              setSessionToken(fresh.session_token);
              setMessages([
                { role: 'assistant', content: 'Sesión anterior expiró, comenzamos de nuevo.' },
                { role: 'assistant', content: fresh.welcome_message },
              ]);
              return;
            }
          } catch (_) { /* continue to next strategy */ }
        }

        // 2. Resume from localStorage
        if (cached?.session_token && cached?.messages?.length) {
          setSessionToken(cached.session_token);
          setMessages(cached.messages);
          return;
        }

        // 3. Start new
        const res = await asistenteApi.startSession({ referral_source: referral });
        setSessionToken(res.session_token);
        setMessages([{ role: 'assistant', content: res.welcome_message }]);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          session_token: res.session_token,
          messages: [{ role: 'assistant', content: res.welcome_message }],
        }));
      } catch (e) {
        if (e.status === 503) {
          setDisabled(true);
        } else if (e.status === 429) {
          setError('Has iniciado muchas sesiones recientemente. Intenta más tarde.');
        } else {
          setError('No se pudo iniciar el asistente. Intenta recargar la página.');
        }
      }
    };
    init();
  }, [searchParams]);

  // Persist session to localStorage on each message change
  useEffect(() => {
    if (sessionToken && messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ session_token: sessionToken, messages }));
      } catch { /* ignore quota */ }
    }
  }, [sessionToken, messages]);

  const handleSend = async (text) => {
    if (!sessionToken) return;
    setError(null);
    setMessages(m => [...m, { role: 'user', content: text }]);
    setIsLoading(true);
    try {
      const res = await asistenteApi.sendMessage(sessionToken, text);
      setMessages(m => [...m, {
        role: 'assistant',
        content: res.assistant_message,
        simulated: res.simulated,
      }]);
      if (res.suggested_lead_capture) setSuggestedCapture(true);
    } catch (e) {
      const isCap = e.status === 429 && /sesi[óo]n completa/i.test(e.message);
      setMessages(m => [...m, {
        role: 'assistant',
        content: isCap
          ? 'Sesión completa. Te conectamos con un asesor para continuar.'
          : (e.message || 'Tuve un problema procesando tu pregunta. Intenta de nuevo.'),
      }]);
      if (isCap) setSuggestedCapture(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCapture = async (form) => {
    if (!sessionToken) return;
    setIsCapturing(true);
    setError(null);
    try {
      await asistenteApi.captureLead(sessionToken, form);
      setCaptureSuccess(true);
      setSuggestedCapture(false);
    } catch (e) {
      setError(e.message || 'No pudimos guardar tus datos. Intenta de nuevo.');
    } finally {
      setIsCapturing(false);
    }
  };

  // Disabled state
  if (disabled) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)' }}>
        <Navbar user={user} />
        <main style={{ maxWidth: 640, margin: '60px auto', padding: '24px' }}>
          <div data-testid="asistente-disabled" style={{
            padding: 28, borderRadius: 14, textAlign: 'center',
            background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
          }}>
            <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 22, margin: '0 0 10px' }}>
              Asistente temporalmente fuera de servicio
            </h1>
            <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', margin: 0 }}>
              Estamos haciendo mejoras al asistente. Mientras tanto, puedes explorar el{' '}
              <a href="/marketplace" style={{ color: '#a5b4fc' }}>marketplace</a> o ver{' '}
              <a href="/inteligencia" style={{ color: '#a5b4fc' }}>inteligencia por barrio</a>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div data-testid="asistente-page" style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <Navbar user={user} />

      {/* Hero */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 8px', textAlign: 'center' }}>
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', marginBottom: 10,
          backgroundImage: 'linear-gradient(90deg, #6366F1, #EC4899)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Asistente público · CDMX
        </div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(26px, 4.5vw, 38px)', margin: '0 0 10px', letterSpacing: '-0.02em' }}>
          Tu asistente para encontrar casa en CDMX
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)', lineHeight: 1.65, margin: 0 }}>
          Resuelve tus dudas en segundos · 100% gratis · Sin login
        </p>
      </section>

      {/* Chat container */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 0 0' }}>
        <AsistenteChat
          messages={messages}
          onSend={handleSend}
          isLoading={isLoading}
          onCaptureLead={handleCapture}
          suggestedCapture={suggestedCapture}
          isCapturing={isCapturing}
          captureSuccess={captureSuccess}
          emptyChips={EMPTY_CHIPS}
        />
        {/* Voice input row */}
        {sessionToken && (
          <div style={{
            display: 'flex', justifyContent: 'center', padding: '8px 0 16px',
          }}>
            <AtlaxVoiceButton
              sessionToken={sessionToken}
              onTranscript={text => text && handleSend(text)}
              disabled={isLoading}
            />
          </div>
        )}
      </main>

      {error && (
        <div data-testid="asistente-error" style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 14px', borderRadius: 9999,
          background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.30)',
          color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12,
          backdropFilter: 'blur(24px)', zIndex: 50,
        }}>{error}</div>
      )}
    </div>
  );
}
