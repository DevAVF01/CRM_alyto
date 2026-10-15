import { store } from '../data/store.js';

export function listClients(req, res) {
  return res.json({ data: store.listClients() });
}

export function getClient(req, res) {
  const client = store.getClient(req.params.id);
  if (!client) {
    return res.status(404).json({ error: { code: 'CLIENT_NOT_FOUND', message: 'Cliente institucional no encontrado' } });
  }
  return res.json({ data: client });
}

export function listTransfers(req, res) {
  return res.json({ data: store.listTransactions() });
}
