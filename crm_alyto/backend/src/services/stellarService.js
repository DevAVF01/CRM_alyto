const BASE_URL = process.env.MCP_STELLAR_URL || 'http://localhost:4601';

async function call(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `stellar-connector respondio ${res.status}`);
    err.status = 502;
    throw err;
  }
  return body.data;
}

export const stellarService = {
  health: () => call('/health'),
  createWallet: () => call('/wallets', { method: 'POST' }),
  getWallet: (publicKey) => call(`/wallets/${encodeURIComponent(publicKey)}`),
  sendPayment: (payload) => call('/payments', { method: 'POST', body: JSON.stringify(payload) }),
  listPayments: (account) => call(`/payments?account=${encodeURIComponent(account)}`),
};
