import { createConnectorClient } from './connectorClient.js';

const call = createConnectorClient({
  name: 'kyc-aml-connector',
  baseUrl: process.env.MCP_KYC_URL || 'http://localhost:4602',
});

export const kycService = {
  health: () => call('/health'),
  screening: (payload) => call('/screening', { method: 'POST', body: JSON.stringify(payload) }),
  validateChecklist: (payload) => call('/due-diligence/checklist', { method: 'POST', body: JSON.stringify(payload) }),
  listDirectrices: () => call('/directrices/asfi-ecp'),
  listAudit: () => call('/audit'),
};
