import { buildTransferReceiptPdf, buildValidationSheetPdf } from 'pdf-generator';
import { store } from '../data/store.js';

export async function transferReceipt(req, res, next) {
  try {
    const { dealId } = req.body || {};
    const deal = store.getDeal(dealId);
    if (!deal) {
      return res.status(404).json({ error: { code: 'DEAL_NOT_FOUND', message: 'Oportunidad no encontrada' } });
    }
    const client = store.getClient(deal.clientId);
    const tx = client?.transactions?.[0];
    const pdf = await buildTransferReceiptPdf({
      operationId: deal.id,
      client: deal.company,
      beneficiary: tx?.beneficiary || 'Beneficiario por definir',
      amountUsd: tx?.amountUsd || deal.monthlyVolume,
      asset: 'USD',
      network: 'Stellar Testnet',
      stellarHash: tx?.hash || '',
      status: tx?.status || 'En Proceso',
      authorizedBy: req.user?.email || 'Oficial de Operaciones',
      createdAt: new Date().toISOString(),
    });
    store.addAudit('comprobante_emitido', `Comprobante PDF generado para ${deal.company}`, req.user?.email);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="comprobante-${deal.id}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    return next(err);
  }
}

export async function validationSheet(req, res, next) {
  try {
    const client = store.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: { code: 'CLIENT_NOT_FOUND', message: 'Cliente institucional no encontrado' } });
    }
    const items = store.getChecklist(req.params.clientId) || [];
    const pdf = await buildValidationSheetPdf({
      clientName: client.name,
      clientId: client.id,
      items,
      score: store.complianceSummary().index,
      auditor: req.user?.email || 'Oficial de Cumplimiento',
    });
    store.addAudit('ficha_validacion_emitida', `Ficha de validacion PDF generada para ${client.name}`, req.user?.email);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="ficha-validacion-${client.id}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    return next(err);
  }
}
