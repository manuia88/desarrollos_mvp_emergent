/**
 * W4.10 Sub-Fix 3 — AtlaxVoiceButton
 * Botón de micrófono con grabación, transcripción STT y toggle TTS.
 * Reusable: se monta en AtlaxBubble + AsistentePage.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.REACT_APP_BACKEND_URL;
const MAX_RECORDING_MS = 60000;

const VOICE_TOGGLE_KEY = "atlax_voice_output";

export default function AtlaxVoiceButton({
  sessionToken,
  onTranscript,       // (text: string) => void  — transcript listo para enviar
  onAudioReady,       // (base64: string, audioId: string) => void (opcional)
  disabled = false,
  compact = false,    // tamaño reducido para inline
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [voiceOut, setVoiceOut] = useState(() => {
    try { return localStorage.getItem(VOICE_TOGGLE_KEY) === "true"; } catch { return false; }
  });

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  /* ── Toggle voz salida ── */
  const toggleVoiceOut = useCallback(() => {
    setVoiceOut(v => {
      const next = !v;
      try { localStorage.setItem(VOICE_TOGGLE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  /* ── Iniciar grabación ── */
  const startRecording = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        handleAudioReady(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      // Auto-stop a los 60s
      timerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch (e) {
      setError("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  }, []);

  /* ── Detener grabación ── */
  const stopRecording = useCallback(() => {
    clearTimeout(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  /* ── Toggle click ── */
  const handleClick = useCallback(() => {
    if (disabled || processing) return;
    if (recording) stopRecording();
    else startRecording();
  }, [disabled, processing, recording, startRecording, stopRecording]);

  /* ── Enviar audio al backend ── */
  const handleAudioReady = async (blob) => {
    if (!blob.size) return;
    setProcessing(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "grabacion.webm");
      formData.append("session_token", sessionToken || "anon");
      formData.append("language", "es");

      const resp = await fetch(`${API}/api/voice/transcribe`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setError(data.error || data.detail || "Error en transcripción");
        return;
      }
      if (data.transcript && onTranscript) {
        onTranscript(data.transcript);
      }
    } catch (e) {
      setError("Error de red al transcribir audio.");
    } finally {
      setProcessing(false);
    }
  };

  /* ── Sintetizar respuesta Atlax ── */
  const synthesize = useCallback(async (text) => {
    if (!voiceOut || !text) return;
    try {
      const resp = await fetch(`${API}/api/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, session_token: sessionToken || "anon" }),
      });
      const data = await resp.json();
      if (data.ok && data.audio_base64) {
        const audioSrc = `data:audio/mpeg;base64,${data.audio_base64}`;
        if (audioRef.current) {
          audioRef.current.src = audioSrc;
          audioRef.current.play().catch(() => {});
        }
        if (onAudioReady) onAudioReady(data.audio_base64, data.audio_id);
      }
    } catch (e) {
      // TTS falla silenciosa
    }
  }, [voiceOut, sessionToken, onAudioReady]);

  // Exponer synthesize via ref para que el padre la llame
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__atlaxSynthesize = synthesize;
    }
  }, [synthesize]);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const size = compact ? 32 : 40;
  const iconSize = compact ? 14 : 17;

  return (
    <div
      data-testid="atlax-voice-button-wrapper"
      style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
    >
      {/* Botón micrófono */}
      <button
        data-testid="atlax-voice-mic-btn"
        onClick={handleClick}
        disabled={disabled}
        title={recording ? "Detener grabación" : processing ? "Transcribiendo…" : "Hablar con Atlax (es-MX)"}
        style={{
          width: size,
          height: size,
          borderRadius: "9999px",
          border: recording
            ? "2px solid #EC4899"
            : "1.5px solid rgba(99,102,241,0.5)",
          background: recording
            ? "linear-gradient(135deg, #6366F1, #EC4899)"
            : processing
              ? "rgba(99,102,241,0.15)"
              : "rgba(99,102,241,0.08)",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
          flexShrink: 0,
          position: "relative",
          animation: recording ? "voice-pulse 1.2s ease-in-out infinite" : "none",
        }}
      >
        {processing ? (
          <div
            style={{
              width: iconSize * 0.7,
              height: iconSize * 0.7,
              border: "2px solid rgba(99,102,241,0.6)",
              borderTopColor: "#6366F1",
              borderRadius: "50%",
              animation: "voice-spin 0.7s linear infinite",
            }}
          />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke={recording ? "#fff" : "#6366F1"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        )}
      </button>

      {/* Toggle voz salida */}
      <button
        data-testid="atlax-voice-output-toggle"
        onClick={toggleVoiceOut}
        title={voiceOut ? "Desactivar voz de respuesta" : "Activar voz de respuesta"}
        style={{
          width: compact ? 26 : 30,
          height: compact ? 26 : 30,
          borderRadius: "9999px",
          border: `1.5px solid ${voiceOut ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.15)"}`,
          background: voiceOut ? "rgba(99,102,241,0.15)" : "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
          flexShrink: 0,
        }}
      >
        <svg
          width={compact ? 12 : 14}
          height={compact ? 12 : 14}
          viewBox="0 0 24 24"
          fill="none"
          stroke={voiceOut ? "#6366F1" : "rgba(240,235,224,0.4)"}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {voiceOut ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          ) : (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          )}
        </svg>
      </button>

      {/* Error inline */}
      {error && (
        <span
          data-testid="atlax-voice-error"
          style={{ fontSize: 11, color: "#EC4899", maxWidth: 160, lineHeight: 1.3 }}
        >
          {error}
        </span>
      )}

      {/* Indicador de grabación */}
      {recording && !compact && (
        <span
          data-testid="atlax-voice-recording-indicator"
          style={{ fontSize: 11, color: "#EC4899", letterSpacing: "0.02em" }}
        >
          Grabando…
        </span>
      )}

      {/* Audio oculto para reproducción TTS */}
      <audio ref={audioRef} style={{ display: "none" }} data-testid="atlax-voice-audio-player" />

      <style>{`
        @keyframes voice-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(236,72,153,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(236,72,153,0); }
        }
        @keyframes voice-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
