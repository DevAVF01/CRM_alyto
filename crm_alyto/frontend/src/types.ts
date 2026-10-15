export type Role = 'admin' | 'compliance' | 'operaciones' | 'ventas' | 'soporte';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  accessToken: string;
}

export type KycStatus = 'Aprobado' | 'En revision' | 'Pendiente' | 'Rechazado';
export type Health = 'Excelente' | 'Alta' | 'Media' | 'En evaluacion' | 'En Riesgo Documental';
export type DealStage = 1 | 2 | 3 | 4 | 5 | 6;
export type TxStatus = 'Completada en ECP' | 'En Proceso' | 'En Revision ASFI' | 'Observada' | 'Rechazada';
export type ChecklistStatus = 'Pendiente' | 'En revision' | 'Aprobado' | 'Observado';
export type AuditKind = 'deal' | 'checklist' | 'template' | 'report' | 'system';

export interface ClientRecord {
  id: string;
  name: string;
  nit: string;
  country: string;
  sector: string;
  representative: string;
  regime: string;
  kycStatus: KycStatus;
  health: Health;
  volumeProcessed: number;
  monthlyLimit: number;
  frequency: number;
  custodialProtocol: string;
  vault: string;
}

export interface DealRecord {
  id: string;
  clientId: string;
  company: string;
  stage: DealStage;
  dealType: string;
  frequency: string;
  monthlyVolume: number;
  health: Health;
  owner: string;
}

export interface WalletRecord {
  clientId: string;
  label: string;
  publicKey: string;
  asset: 'XLM' | 'USDC';
  balance: string;
}

export interface TransferTx {
  id: string;
  clientId: string;
  beneficiary: string;
  destination: string;
  amountUsd: number;
  status: TxStatus;
  hash: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  channel: string;
  auditHash: string;
  approval: string;
  body: string;
}

export interface Objection {
  id: string;
  title: string;
  keywords: string[];
  legalBasis: string;
  conformity: 'Verificada';
  response: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  detail: string;
  status: ChecklistStatus;
}

export interface AuditEvent {
  id: number;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ComplianceSummary {
  approved: number;
  inReview: number;
  pending: number;
  index: string;
  regimeCode: string;
}

export interface RiskBand {
  band: 'Bajo' | 'Medio' | 'Alto';
  expedientes: number;
  action: string;
}

export interface EcpLimits {
  parameters: {
    usuariosPorDia: number;
    operacionesPorDia: number;
    montoMaximoOperacionBs: number;
    duracionMaximaEcpMeses: number;
    estadoLicencia: string;
  };
  consumption: {
    expedientesActivos: number;
    operacionesRegistradas: number;
    operacionDeMayorMontoUsd: number;
  };
  riskMatrix: RiskBand[];
}
