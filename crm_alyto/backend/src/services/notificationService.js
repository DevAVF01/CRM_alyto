const BASE_URL = process.env.MCP_NOTIFICATIONS_URL || 'http://localhost:4603';

async function call(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `notifications-mcp respondio ${res.status}`);
    err.status = 502;
    throw err;
  }
  return body.data;
}

export const notificationService = {
  health: () => call('/health'),
  vapidPublicKey: () => call('/vapid-public-key'),
  subscribe: (payload) => call('/push/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
  sendPush: (payload) => call('/push/send', { method: 'POST', body: JSON.stringify(payload) }),
  listTemplates: () => call('/templates'),
  renderTemplate: (payload) => call('/templates/render', { method: 'POST', body: JSON.stringify(payload) }),
};
