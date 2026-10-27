import { createConnectorClient } from './connectorClient.js';

const call = createConnectorClient({
  name: 'stellar-connector',
  baseUrl: process.env.MCP_STELLAR_URL || 'http://localhost:4601',
});

export const stellarService = {
  health: () => call('/health'),
  createWallet: () => call('/wallets', { method: 'POST' }),
  getWallet: (publicKey) => call(`/wallets/${encodeURIComponent(publicKey)}`),
  sendPayment: (payload) => call('/payments', { method: 'POST', body: JSON.stringify(payload) }),
  listPayments: (account) => call(`/payments?account=${encodeURIComponent(account)}`),
};
