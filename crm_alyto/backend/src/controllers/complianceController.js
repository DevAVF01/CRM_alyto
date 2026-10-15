import { store } from '../data/store.js';
import { kycService } from '../services/kycService.js';

export function summary(req, res) {
  return res.json({ data: store.complianceSummary() });
}

export function limits(req, res) {
  return res.json({ data: store.ecpLimits() });
}

export async function directrices(req, res, next) {
  try {
    const data = await kycService.listDirectrices();
    return res.json({ data });
  } catch (err) {
    return next(err);
  }
}

export function getChecklist(req, res) {
  const checklist = store.getChecklist(req.params.clientId);
  if (!checklist) {
    return res.status(404).json({ error: { code: 'CHECKLIST_NOT_FOUND', message: 'Expediente de debida diligencia no encontrado' } });
  }
  return res.json({ data: { clientId: req.params.clientId, items: checklist } });
}

export function updateChecklistItem(req, res, next) {
  try {
    const item = store.updateChecklistItem(
      req.params.clientId,
      req.params.itemKey,
      req.body?.status,
      req.user?.email,
    );
    if (!item) {
      return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'Elemento del checklist no encontrado' } });
    }
    return res.json({ data: item });
  } catch (err) {
    return next(err);
  }
}

export function listAudit(req, res) {
  return res.json({ data: store.listAudit() });
}

export function addAudit(req, res) {
  const { action, detail } = req.body || {};
  if (!action || !detail) {
    return res.status(400).json({ error: { code: 'INVALID_AUDIT', message: 'action y detail son requeridos' } });
  }
  const event = store.addAudit(action, detail, req.user?.email);
  return res.status(201).json({ data: event });
}
