import { store } from '../data/store.js';
import { notificationService } from '../services/notificationService.js';

export function listTemplates(req, res) {
  return res.json({ data: store.listTemplates(req.query.category) });
}

export function getTemplate(req, res) {
  const template = store.getTemplate(req.params.id);
  if (!template) {
    return res.status(404).json({ error: { code: 'TEMPLATE_NOT_FOUND', message: 'Plantilla auditada no encontrada' } });
  }
  return res.json({ data: template });
}

export function listObjections(req, res) {
  return res.json({ data: store.listObjections() });
}

export async function sendTemplate(req, res, next) {
  try {
    const { templateId, clientId, channel, vars } = req.body || {};
    const template = store.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: { code: 'TEMPLATE_NOT_FOUND', message: 'Plantilla auditada no encontrada' } });
    }
    const event = store.addAudit(
      'comunicacion_enviada',
      `Plantilla ${templateId} enviada por ${channel || template.channel} al expediente ${clientId || 'general'}`,
      req.user?.email,
    );
    let push = null;
    try {
      push = await notificationService.sendPush({
        title: `Alyto CRM | ${templateId}`,
        body: `Comunicacion institucional registrada para ${clientId || 'expediente general'}`,
      });
    } catch {
      push = { sent: 0, failed: 0, skipped: 'notifications-mcp no disponible' };
    }
    return res.status(201).json({ data: { template: template.id, auditId: event.id, push, vars: vars || {} } });
  } catch (err) {
    return next(err);
  }
}
