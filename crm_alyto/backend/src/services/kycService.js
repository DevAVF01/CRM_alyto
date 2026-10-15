const BASE_URL = process.env.MCP_KYC_URL || 'http://localhost:4602';

async function call(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `kyc-aml-connector respondio ${res.status}`);
    err.status = 502;
    throw err;
  }
  return body.data;
}

export const kycService = {
  health: () => call('/health'),
  screening: (payload) => call('/screening', { method: 'POST', body: JSON.stringify(payload) }),
  validateChecklist: (payload) => call('/due-diligence/checklist', { method: 'POST', body: JSON.stringify(payload) }),
  listDirectrices: () => call('/directrices/asfi-ecp'),
  listAudit: () => call('/audit'),
};
