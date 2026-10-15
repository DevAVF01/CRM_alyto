import pipelineAgent from '../../agents/pipeline-agent/PipelineAgent.js';
import complianceAgent from '../../agents/compliance-agent/ComplianceAgent.js';
import { stellarService } from '../services/stellarService.js';
import { notificationService } from '../services/notificationService.js';

// Base en memoria inicial con deals B2B en las 6 etapas
let mockDeals = [
  {
    id: 'DEAL-2026-001',
    clientId: 'CLI-001',
    clientName: 'Importadora Andina S.A.',
    clientNit: '1029384021',
    currentStageId: 'LEAD_QUALIFIED',
    amountBob: 140000,
    amountUsd: 20114.94,
    exchangeRate: 6.96,
    purpose: 'Importación de insumos médicos certificados',
    beneficiary: {
      name: 'Pharma Global Corp',
      bank: 'JPMorgan Chase NY',
      country: 'Estados Unidos'
    },
    history: [
      {
        fromStage: 'INIT',
        toStage: 'LEAD_QUALIFIED',
        timestamp: '2026-10-10T10:00:00Z',
        authorizedBy: 'Ejecutivo Comercial B2B'
      }
    ]
  },
  {
    id: 'DEAL-2026-002',
    clientId: 'CLI-002',
    clientName: 'Agroindustrias del Oriente S.R.L.',
    clientNit: '3049581029',
    currentStageId: 'DUE_DILIGENCE_ECP',
    amountBob: 280000,
    amountUsd: 40229.88,
    exchangeRate: 6.96,
    purpose: 'Pago de maquinaria agrícola de precisión',
    beneficiary: {
      name: 'AgriTech Equipments GmbH',
      bank: 'Deutsche Bank Frankfurt',
      country: 'Alemania'
    },
    history: [
      {
        fromStage: 'LEAD_QUALIFIED',
        toStage: 'DUE_DILIGENCE_ECP',
        timestamp: '2026-10-11T14:30:00Z',
        authorizedBy: 'Oficial de Cumplimiento ECP'
      }
    ]
  },
  {
    id: 'DEAL-2026-003',
    clientId: 'CLI-003',
    clientName: 'Distribuidora Tecnológica Paceña S.A.',
    clientNit: '5928172038',
    currentStageId: 'LINE_APPROVAL_CUSTODY',
    amountBob: 210000,
    amountUsd: 30172.41,
    exchangeRate: 6.96,
    purpose: 'Importación de servidores y equipamiento de red',
    custodialWallet: 'GBX4E2Z5R9Q...CUSTODIAL',
    beneficiary: {
      name: 'TechLogistics Ltd',
      bank: 'HSBC Hong Kong',
      country: 'Hong Kong'
    },
    history: [
      {
        fromStage: 'DUE_DILIGENCE_ECP',
        toStage: 'LINE_APPROVAL_CUSTODY',
        timestamp: '2026-10-12T09:15:00Z',
        authorizedBy: 'Comité de Riesgos ECP'
      }
    ]
  },
  {
    id: 'DEAL-2026-004',
    clientId: 'CLI-004',
    clientName: 'Constructora & Proyectos Altiplano S.R.L.',
    clientNit: '7482910382',
    currentStageId: 'FX_QUOTE_LOCK',
    amountBob: 315000,
    amountUsd: 45258.62,
    exchangeRate: 6.96,
    rateLockedAt: '2026-10-13T08:00:00Z',
    purpose: 'Adquisición de acero estructurado',
    beneficiary: {
      name: 'Siderúrgica del Pacífico S.A.',
      bank: 'Banco Santander Chile',
      country: 'Chile'
    },
    history: [
      {
        fromStage: 'LINE_APPROVAL_CUSTODY',
        toStage: 'FX_QUOTE_LOCK',
        timestamp: '2026-10-13T08:00:00Z',
        authorizedBy: 'Mesa de Dinero FX'
      }
    ]
  },
  {
    id: 'DEAL-2026-005',
    clientId: 'CLI-005',
    clientName: 'Laboratorios Farmacéuticos San Rafael S.A.',
    clientNit: '9482710384',
    currentStageId: 'STELLAR_SETTLEMENT',
    amountBob: 175000,
    amountUsd: 25143.67,
    exchangeRate: 6.96,
    stellarTxHash: '0x3f8a9d12e84c9012bbcf10928374a8d0291f3a5e8c1b47d28e930f12a4b89c72',
    purpose: 'Importación de reactivos de laboratorio',
    beneficiary: {
      name: 'BioReagents International',
      bank: 'UBS Zurich',
      country: 'Suiza'
    },
    history: [
      {
        fromStage: 'FX_QUOTE_LOCK',
        toStage: 'STELLAR_SETTLEMENT',
        timestamp: '2026-10-13T10:30:00Z',
        authorizedBy: 'Operador Stellar Testnet'
      }
    ]
  },
  {
    id: 'DEAL-2026-006',
    clientId: 'CLI-006',
    clientName: 'Minera & Metales del Sur S.A.',
    clientNit: '8392019482',
    currentStageId: 'COMPLETED_RECONCILED',
    amountBob: 348000,
    amountUsd: 50000.00,
    exchangeRate: 6.96,
    receiptNumber: 'REC-2026-0089',
    stellarTxHash: '0x81b7a2d3c94f08e1a53b7c2901a8f94e2b6d1c8a0f9e3a7b5d2c4e1f8a9b0c2d',
    purpose: 'Repuestos de maquinaria extractiva pesada',
    beneficiary: {
      name: 'Mining Heavy Equipment Corp',
      bank: 'Bank of America Charlotte',
      country: 'Estados Unidos'
    },
    history: [
      {
        fromStage: 'STELLAR_SETTLEMENT',
        toStage: 'COMPLETED_RECONCILED',
        timestamp: '2026-10-13T11:00:00Z',
        authorizedBy: 'Auditor Financiero ECP'
      }
    ]
  }
];

export const pipelineController = {
  getStages: (req, res) => {
    res.json(pipelineAgent.getStages());
  },

  getAllDeals: (req, res) => {
    res.json(mockDeals);
  },

  getMetrics: (req, res) => {
    const metrics = pipelineAgent.calculateMetrics(mockDeals);
    res.json(metrics);
  },

  createDeal: (req, res) => {
    const { clientName, clientNit, amountBob, purpose, beneficiary } = req.body;
    const amountNum = Number(amountBob);
    const rate = 6.96;
    const amountUsd = Number((amountNum / rate).toFixed(2));

    const newDeal = {
      id: `DEAL-2026-${String(mockDeals.length + 1).padStart(3, '0')}`,
      clientId: `CLI-${String(mockDeals.length + 1).padStart(3, '0')}`,
      clientName: clientName || 'Nueva Empresa B2B',
      clientNit: clientNit || '1000000000',
      currentStageId: 'LEAD_QUALIFIED',
      amountBob: amountNum,
      amountUsd,
      exchangeRate: rate,
      purpose: purpose || 'Transferencia internacional comercial B2B',
      beneficiary: beneficiary || {
        name: 'Proveedor Internacional',
        bank: 'Banco Corresponsal',
        country: 'Exterior'
      },
      history: [
        {
          fromStage: 'INIT',
          toStage: 'LEAD_QUALIFIED',
          timestamp: new Date().toISOString(),
          authorizedBy: req.user?.fullName || 'Oficial Comercial'
        }
      ]
    };

    mockDeals.unshift(newDeal);
    res.status(201).json(newDeal);
  },

  advanceDealStage: async (req, res) => {
    const { dealId } = req.params;
    const { targetStageId } = req.body;

    const deal = mockDeals.find((d) => d.id === dealId);
    if (!deal) {
      return res.status(404).json({ error: 'Operación no encontrada en el CRM' });
    }

    // Si la etapa objetivo es liquidación en Stellar, ejecutamos el connector
    if (targetStageId === 'STELLAR_SETTLEMENT' && !deal.stellarTxHash) {
      const tx = await stellarService.executeTransfer({
        sourcePublicKey: 'G_AV_FINANCE_ECP_CUSTODIAL_POOL',
        destinationPublicKey: 'G_STELLAR_TESTNET_SETTLEMENT_DEST',
        amountBob: deal.amountBob,
        amountUsd: deal.amountUsd,
        clientId: deal.clientId,
        memo: `Transferencia ${deal.id} ECP ASFI`
      });
      deal.stellarTxHash = tx.hash;
    }

    // Si la etapa objetivo es completada, generamos comprobante
    if (targetStageId === 'COMPLETED_RECONCILED' && !deal.receiptNumber) {
      deal.receiptNumber = `REC-2026-${String(Math.floor(100 + Math.random() * 900))}`;
    }

    const result = pipelineAgent.advanceStage(
      deal,
      targetStageId,
      req.user?.fullName || 'Oficial de Cumplimiento'
    );

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Notificación Push
    const stageName = pipelineAgent.getStages().find((s) => s.id === targetStageId)?.name || targetStageId;
    await notificationService.notifyDealTransition(deal, stageName);

    res.json({
      message: result.message,
      deal: result.deal
    });
  }
};
