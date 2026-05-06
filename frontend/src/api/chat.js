/**
 * api/chat.js — Phase 4 Batch 29
 * Helpers para Chat Asesor In-App.
 */
const API = process.env.REACT_APP_BACKEND_URL;

export async function startThread({ asesorId, projectId }) {
  const r = await fetch(`${API}/api/chat/threads`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asesor_id: asesorId, project_id: projectId || null }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al iniciar conversación');
  }
  return r.json();
}

export async function fetchThreads() {
  const r = await fetch(`${API}/api/chat/threads`, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar conversaciones');
  return r.json();
}

export async function fetchMessages(threadId, { limit = 50, before = null } = {}) {
  let url = `${API}/api/chat/threads/${threadId}/messages?limit=${limit}`;
  if (before) url += `&before=${encodeURIComponent(before)}`;
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('Error al cargar mensajes');
  return r.json();
}

export async function sendMessage(threadId, text) {
  const r = await fetch(`${API}/api/chat/threads/${threadId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.detail || 'Error al enviar mensaje');
  }
  return r.json();
}

export async function markThreadRead(threadId) {
  const r = await fetch(`${API}/api/chat/threads/${threadId}/read`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) throw new Error('Error al marcar como leído');
  return r.json();
}

export async function fetchUnreadCount() {
  const r = await fetch(`${API}/api/chat/unread`, { credentials: 'include' });
  if (!r.ok) return { unread: 0 };
  return r.json();
}
