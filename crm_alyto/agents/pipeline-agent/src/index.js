const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 45000);

// El agente no conoce la clave de firma de sesiones: recibe un token ya emitido.
const AGENT_TOKEN = process.env.AGENT_TOKEN;
if (!AGENT_TOKEN) {
  console.error(
    '[ARRANQUE RECHAZADO] pipeline-agent necesita AGENT_TOKEN. Emítalo desde el backend con: npm run agent-token pipeline-agent',
  );
  process.exit(1);
}

const AUTH_HEADER = { authorization: `Bearer ${AGENT_TOKEN}` };

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
  console.log(JSON.stringify({ at: new Date().toISOString(), agent: 'pipeline-agent', level, message, ...extra }));
}

function checklistComplete(items) {
  return items.length > 0 && items.every((item) => item.status === 'Aprobado');
}

function decideNextStage(deal, checklistItems) {
  const complete = checklistComplete(checklistItems);
  if (deal.stage === 3 && complete) return 4;
  if (deal.stage === 4 && complete) return 5;
  return null;
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
    const nextStage = decideNextStage(deal, items);
    if (!nextStage) continue;

    const moveRes = await api(`/api/deals/${deal.id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage: nextStage, actor: 'pipeline-agent' }),
    });
    if (moveRes.status === 200) {
      log('info', 'etapa avanzada automaticamente', {
        clientId: deal.clientId,
        company: deal.company,
        from: deal.stage,
        to: nextStage,
      });
    } else {
      log('warn', 'no se pudo avanzar etapa', { clientId: deal.clientId, status: moveRes.status });
    }
  }
}

log('info', 'pipeline-agent iniciado', { backend: BACKEND_URL, intervalMs: INTERVAL_MS });
run().catch((err) => log('error', 'error en ciclo de automatizacion', { message: err.message }));
setInterval(() => {
  run().catch((err) => log('error', 'error en ciclo de automatizacion', { message: err.message }));
}, INTERVAL_MS).unref();
