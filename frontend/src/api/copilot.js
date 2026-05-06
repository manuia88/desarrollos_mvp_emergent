/**
 * Phase 4 Batch 23 — AI Copilot API client.
 */
const API = process.env.REACT_APP_BACKEND_URL;

async function j(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const askCopilot = (question, conversationId = null) =>
  j('/api/copilot/ask', {
    method: 'POST',
    body: JSON.stringify({ question, conversation_id: conversationId }),
  });

export const listConversations = () =>
  j('/api/copilot/conversations');

export const getConversation = (id) =>
  j(`/api/copilot/conversations/${id}`);

export const deleteConversation = (id) =>
  j(`/api/copilot/conversations/${id}`, { method: 'DELETE' });

export const getQuickActions = (role = null) =>
  j('/api/copilot/quick-actions' + (role ? `?role=${role}` : ''));

export default {
  askCopilot, listConversations, getConversation,
  deleteConversation, getQuickActions,
};
