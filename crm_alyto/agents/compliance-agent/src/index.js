const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 30000);
const DEMO_SECRET = process.env.DEMO_AUTH_SECRET || 'ecp-demo';

function agentToken() {
  const payload = { id: 'compliance-agent', email: 'compliance-agent@alyto.local', role: 'compliance' };
  return `demo.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${DEMO_SECRET}`;
}

const AUTH_HEADER = { authorization: `Bearer ${process.env.AGENT_TOKEN && process.env.AGENT_TOKEN !== 'demo' ? process.env.AGENT_TOKEN : agentToken()}` };

async function api(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...AUTH_HEADER, ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function log(level, message, extra = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), agent: 'compliance-agent', level, message, ...extra }));
}

async function run() {
  const dealsRes = await api('/api/deals');
  if (dealsRes.status !== 200) {
    log('warn', 'backend no disponible, se reintenta en el siguiente ciclo', { status: dealsRes.status });
    return;
  }

  for (const deal of dealsRes.body.data) {
    const checklistRes = await api(`/api/compliance/checklist/${deal.clientId}`);
    const items = checklistRes.body?.data?.items || [];
    const incomplete = items.filter((item) => item.status === 'Pendiente' || item.status === 'Observado');
    const isActive = deal.stage === 6;

    if (isActive && incomplete.length > 0) {
      log('warn', 'cliente activo con debida diligencia incompleta', {
        clientId: deal.clientId,
        company: deal.company,
        pending: incomplete.map((item) => item.key),
      });
      await api('/api/compliance/audit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'alerta_diligencia_incompleta',
          detail: `${deal.company} (${deal.clientId}) tiene ${incomplete.length} elementos de debida diligencia sin aprobar`,
        }),
      });
    }

    if (items.length > 0) {
      log('info', 'revision de expediente completada', {
        clientId: deal.clientId,
        stage: deal.stage,
        complete: incomplete.length === 0,
      });
    }
  }
}

log('info', 'compliance-agent iniciado', { backend: BACKEND_URL, intervalMs: INTERVAL_MS });
run().catch((err) => log('error', 'error en ciclo de revision', { message: err.message }));
setInterval(() => {
  run().catch((err) => log('error', 'error en ciclo de revision', { message: err.message }));
}, INTERVAL_MS).unref();
