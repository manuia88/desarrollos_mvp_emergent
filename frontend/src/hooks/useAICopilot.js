/**
 * Phase 4 Batch 23 — useAICopilot
 * Singleton-ish hook + lightweight global event bus so the panel and the
 * floating trigger can coordinate without prop drilling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/copilot';

const TOGGLE_EVENT = 'dmx-copilot-toggle';

/** Anyone (button, shortcut) can toggle the panel via this helper.
 * `prompt` (opcional): abre el Copilot Y envía esa pregunta — el handoff desde El Catálogo
 * cuando lo que el founder escribió es una PREGUNTA (respóndeme), no un nombre de herramienta. */
export function dispatchCopilotToggle(action = 'toggle', prompt = null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOGGLE_EVENT, { detail: { action, prompt } }));
}

/** Atajo semántico: llévale una pregunta al Copilot DMX (abre + envía). */
export function preguntarAlCopilot(prompt) {
  dispatchCopilotToggle('open', prompt);
}

export default function useAICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(false);
  const [autoPrompt, setAutoPrompt] = useState(null);   // pregunta llegada por el handoff del Catálogo

  // Listen to global toggle events
  useEffect(() => {
    const onEvt = (e) => {
      const action = e?.detail?.action || 'toggle';
      if (action === 'open') setIsOpen(true);
      else if (action === 'close') setIsOpen(false);
      else setIsOpen(o => !o);
      if (e?.detail?.prompt) setAutoPrompt(e.detail.prompt);   // se envía al abrir (efecto abajo)
    };
    window.addEventListener(TOGGLE_EVENT, onEvt);
    return () => window.removeEventListener(TOGGLE_EVENT, onEvt);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(o => !o), []);

  const refreshConversations = useCallback(async () => {
    try {
      const r = await api.listConversations();
      setConversations(r.items || []);
    } catch {
      // silent — non-critical
    }
  }, []);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
  }, []);

  const loadConversation = useCallback(async (id) => {
    setLoading(true); setError(null);
    try {
      const d = await api.getConversation(id);
      setConversationId(d.id);
      setMessages((d.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })));
    } catch (e) {
      setError(e.message || 'Error al cargar conversación');
    } finally {
      setLoading(false);
    }
  }, []);

  const removeConversation = useCallback(async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations(cs => cs.filter(c => c.id !== id));
      if (conversationId === id) newConversation();
    } catch (e) {
      setError(e.message || 'Error al eliminar');
    }
  }, [conversationId, newConversation]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setLoading(true);
    // Optimistic UI
    const userMsg = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(m => [...m, userMsg]);
    try {
      const r = await api.askCopilot(trimmed, conversationId);
      const asstMsg = {
        role: 'assistant',
        content: r.response_markdown || '(sin respuesta)',
        timestamp: new Date().toISOString(),
        meta: {
          tokens_used: r.tokens_used,
          model: r.model,
          fallback: !!r.fallback,
        },
      };
      setMessages(m => [...m, asstMsg]);
      if (r.conversation_id && r.conversation_id !== conversationId) {
        setConversationId(r.conversation_id);
      }
      // Background refresh of conversation list
      refreshConversations();
    } catch (e) {
      setError(e.message || 'Error al enviar');
      // Append a system error bubble for visibility
      setMessages(m => [...m, {
        role: 'assistant',
        content: 'No fue posible obtener respuesta. Intenta de nuevo.',
        timestamp: new Date().toISOString(),
        meta: { error: true },
      }]);
    } finally {
      pendingRef.current = false;
      setLoading(false);
    }
  }, [conversationId, refreshConversations]);

  // Refresh conversation list when opening
  useEffect(() => {
    if (isOpen) refreshConversations();
  }, [isOpen, refreshConversations]);

  // Handoff del Catálogo: al abrir con una pregunta pendiente, se envía sola (una vez)
  useEffect(() => {
    if (isOpen && autoPrompt) {
      const q = autoPrompt;
      setAutoPrompt(null);
      newConversation();
      sendMessage(q);
    }
  }, [isOpen, autoPrompt, sendMessage, newConversation]);

  return {
    isOpen, open, close, toggle,
    conversationId, messages, conversations, loading, error,
    sendMessage, newConversation, loadConversation,
    removeConversation, refreshConversations,
  };
}
