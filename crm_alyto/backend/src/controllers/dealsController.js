import { store } from '../data/store.js';

export function listDeals(req, res) {
  return res.json({ data: store.listDeals(req.query.stage) });
}

export function createDeal(req, res) {
  const deal = store.createDeal(req.body || {});
  return res.status(201).json({ data: deal });
}

export function moveDeal(req, res, next) {
  try {
    const deal = store.moveDeal(req.params.id, req.body?.stage, req.body?.actor || req.user?.email);
    if (!deal) {
      return res.status(404).json({ error: { code: 'DEAL_NOT_FOUND', message: 'Oportunidad no encontrada' } });
    }
    return res.json({ data: deal });
  } catch (err) {
    return next(err);
  }
}
