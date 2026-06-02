// Cerebro DMX · API client de la Sala de Control (Etapa 3)
const API = process.env.REACT_APP_BACKEND_URL;

const j = async (url, opts = {}) => {
  const r = await fetch(`${API}${url}`, { credentials: 'include', ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error(body.detail || r.statusText), { status: r.status, body });
  }
  return r.json();
};
const post = (url, body) =>
  j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export const getCerebroStatus = () => j('/api/cerebro/status');
export const getCerebroTasks = (status) => j(`/api/cerebro/tasks${status ? `?status=${status}` : ''}`);
export const getCerebroRun = (runId) => j(`/api/cerebro/runs/${runId}`);
export const runCerebroGoal = (goal_id, context) => post('/api/cerebro/run', { goal_id, context: context || {} });
export const approveCerebroTask = (taskId, edits) => post(`/api/cerebro/tasks/${taskId}/approve`, { edits: edits || null });
export const rejectCerebroTask = (taskId) => post(`/api/cerebro/tasks/${taskId}/reject`, {});

// E2.5 · personalización
export const getCerebroConfig = () => j('/api/cerebro/config');
export const saveCerebroConfig = (patch) => j('/api/cerebro/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch || {}) });
export const getCerebroCatalog = () => j('/api/cerebro/catalog');
export const getCerebroRecommendations = () => j('/api/cerebro/recommendations');
export const applyCerebroRecommendation = (apply) => post('/api/cerebro/recommendations/apply', { apply });
export const getCerebroScopes = () => j('/api/cerebro/scopes');
// Chat sobre un resultado — reusa el Copilot del dev (asistente con tools)
export const askCopilot = (question, conversation_id) => post('/api/copilot/ask', { question, conversation_id: conversation_id || null });
export const createCustomGoal = (label, emoji, steps) => post('/api/cerebro/custom-goal', { label, emoji, steps });
export const deleteCustomGoal = (goalId) => j(`/api/cerebro/custom-goal/${goalId}`, { method: 'DELETE' });
// E4 · loop de aprendizaje (Coach)
export const getCerebroLearning = () => j('/api/cerebro/learning');
export const dealClosed = (ref, outcome, deal) => post('/api/cerebro/deal-closed', { ref, outcome, deal: deal || {} });
export const cerebroLearningDemo = () => post('/api/cerebro/learning/demo', {});
