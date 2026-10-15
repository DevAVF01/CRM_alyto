/**
 * Definición de las 6 etapas del embudo comercial B2B
 * Transferencias internacionales en el ECP de ASFI
 */

export interface PipelineStageConfig {
  id: string;
  order: number;
  name: string;
  description: string;
  requiredChecks: string[];
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    id: 'LEAD_QUALIFIED',
    order: 1,
    name: 'Lead Institucional Calificado',
    description: 'Empresa importadora/exportadora con perfil validado para operaciones transfronterizas.',
    requiredChecks: ['Razón social verificada', 'Volumen transaccional estimado > $10,000 USD']
  },
  {
    id: 'DUE_DILIGENCE_ECP',
    order: 2,
    name: 'Debida Diligencia & Onboarding ECP',
    description: 'Revisión exhaustiva de documentación corporativa, NIT, SEPREC y listas restrictivas ASFI.',
    requiredChecks: ['Checklist de debida diligencia completado', 'No coincidencia en listas OFAC/ONU']
  },
  {
    id: 'LINE_APPROVAL_CUSTODY',
    order: 3,
    name: 'Aprobación de Línea / Custodia Institucional',
    description: 'Asignación de cupo operativo en el ECP y aprovisionamiento de wallet custodial institucional.',
    requiredChecks: ['Comité de riesgo aprueba cupo', 'Wallet custodial generada y vinculada']
  },
  {
    id: 'FX_QUOTE_LOCK',
    order: 4,
    name: 'Cotización & Fijación de Tasa (FX / Testnet)',
    description: 'Pactación de tipo de cambio y reserva de liquidez para la transferencia internacional.',
    requiredChecks: ['Tasa congelada con timestamp', 'Aceptación formal del cliente B2B']
  },
  {
    id: 'STELLAR_SETTLEMENT',
    order: 5,
    name: 'Ejecución & Liquidación en Stellar Testnet',
    description: 'Firma y envío de la transacción criptográfica en Stellar Testnet con custodia institucional.',
    requiredChecks: ['Firma autorizada emitida', 'Hash de transacción registrado en ledger Testnet']
  },
  {
    id: 'COMPLETED_RECONCILED',
    order: 6,
    name: 'Transferencia Completada & Conciliada',
    description: 'Generación de comprobante oficial con código QR y archivo contable cerrado.',
    requiredChecks: ['Comprobante oficial generado con QR', 'Conciliación bancaria y contable finalizada']
  }
];
