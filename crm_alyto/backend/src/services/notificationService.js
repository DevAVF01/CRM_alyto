import { createConnectorClient } from './connectorClient.js';

const call = createConnectorClient({
  name: 'notifications-mcp',
  baseUrl: process.env.MCP_NOTIFICATIONS_URL || 'http://localhost:4603',
});

export const notificationService = {
  health: () => call('/health'),
  vapidPublicKey: () => call('/vapid-public-key'),
  subscribe: (payload) => call('/push/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
  sendPush: (payload) => call('/push/send', { method: 'POST', body: JSON.stringify(payload) }),
  listTemplates: () => call('/templates'),
  renderTemplate: (payload) => call('/templates/render', { method: 'POST', body: JSON.stringify(payload) }),
};
