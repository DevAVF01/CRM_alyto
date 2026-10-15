import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import webpush from 'web-push';

let vapidKeys;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  console.log('[notifications-mcp] VAPID generado para este arranque; defina VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY para persistir las claves');
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:compliance@avfinance.bo',
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const subscriptions = new Map();

const PROHIBITED_TERMS = [/remesa/i, /non[\s-]?custodial/i, /plataforma de inversi[oó]n/i, /licencia(s)? completa(s)?/i, /somos los [uú]nicos/i];
const EM_DASH = /\u2014/;

function brandConformity(text) {
  if (EM_DASH.test(text)) return { ok: false, reason: 'guion largo no permitido en comunicaciones' };
  const hit = PROHIBITED_TERMS.find((re) => re.test(text));
  if (hit) return { ok: false, reason: `termino no autorizado detectado: ${hit}` };
  return { ok: true, reason: 'Sin terminos prohibidos' };
}

const TEMPLATES = [
  {
    id: 'COM-B2B-01',
    subject: 'Presentación Soluciones Transfronterizas AlyPay',
    body: 'Estimado(a) {{nombre}}: AV Finance S.R.L. opera bajo supervisión de la ASFI en el Entorno Controlado de Pruebas (ECP), con liquidación de transferencias internacionales sobre Stellar Testnet y wallets custodiales institucionales. Quedamos atentos a coordinar una presentación institucional.',
    auditHash: '#ECP-7882-SHA256',
  },
  {
    id: 'ECP-NOT-04',
    subject: 'Notificación de Operación Test en ECP',
    body: 'La operación test {{operacion}} fue registrada en el ECP con trazabilidad en Stellar Testnet. Estado actual: {{estado}}.',
    auditHash: '#ECP-4431-SHA256',
  },
  {
    id: 'KYC-REQ-09',
    subject: 'Solicitud de Documentación Regulatoria ECP',
    body: 'Para continuar con la debida diligencia de su expediente se solicita: acta constitutiva, poder del representante legal, beneficiarios finales y declaración de origen de fondos.',
    auditHash: '#ECP-2210-SHA256',
  },
];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notifications-mcp', channels: ['web-push-vapid', 'plantillas auditadas'] });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ data: { publicKey: vapidKeys.publicKey } });
});

app.post('/push/subscribe', (req, res) => {
  const { userId = 'general', subscription } = req.body || {};
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: { code: 'INVALID_SUBSCRIPTION', message: 'subscription.endpoint es requerido' } });
  }
  subscriptions.set(subscription.endpoint, { userId, subscription });
  return res.status(201).json({ data: { subscribed: true, total: subscriptions.size } });
});

app.post('/push/send', async (req, res) => {
  const { title = 'Alyto CRM', body = 'Notificación institucional', userId } = req.body || {};
  const conformity = brandConformity(`${title} ${body}`);
  if (!conformity.ok) {
    return res.status(400).json({ error: { code: 'BRAND_VIOLATION', message: conformity.reason } });
  }
  const targets = [...subscriptions.values()].filter((entry) => !userId || entry.userId === userId);
  const results = await Promise.allSettled(
    targets.map((entry) => webpush.sendNotification(entry.subscription, JSON.stringify({ title, body }))),
  );
  return res.json({
    data: {
      sent: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    },
  });
});

app.get('/templates', (req, res) => {
  res.json({ data: TEMPLATES.map(({ id, subject, auditHash }) => ({ id, subject, auditHash })) });
});

app.post('/templates/render', (req, res) => {
  const { templateId, vars = {} } = req.body || {};
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return res.status(404).json({ error: { code: 'TEMPLATE_NOT_FOUND', message: 'Plantilla no encontrada' } });
  }
  let body = template.body;
  for (const [key, value] of Object.entries(vars)) {
    body = body.replaceAll(`{{${key}}}`, String(value));
  }
  const conformity = brandConformity(body);
  if (!conformity.ok) {
    return res.status(400).json({ error: { code: 'BRAND_VIOLATION', message: conformity.reason } });
  }
  return res.json({
    data: {
      templateId: template.id,
      subject: template.subject,
      body,
      auditHash: template.auditHash,
      conformity: 'Conformidad ASFI: Verificada',
    },
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    error: { code: 'NOTIFICATIONS_MCP_ERROR', message: err.expose ? err.message : 'Error interno del conector' },
  });
});

const port = Number(process.env.PORT || 4603);
app.listen(port, () => {
  console.log(`[notifications-mcp] listo en puerto ${port} | VAPID + plantillas auditadas`);
});
