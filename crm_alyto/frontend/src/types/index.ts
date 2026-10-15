export interface UserSession {
  id: string;
  email: string;
  fullName: string;
  role: string;
  institution: string;
  token?: string;
}

export interface PipelineStage {
  id: string;
  order: number;
  name: string;
  description: string;
  requiredChecks: string[];
}

export interface Deal {
  id: string;
  clientId: string;
  clientName: string;
  clientNit: string;
  currentStageId: string;
  amountBob: number;
  amountUsd: number;
  exchangeRate: number;
  purpose: string;
  stellarTxHash?: string;
  receiptNumber?: string;
  custodialWallet?: string;
  beneficiary: {
    name: string;
    bank: string;
    country: string;
  };
  history: Array<{
    fromStage: string;
    toStage: string;
    timestamp: string;
    authorizedBy: string;
  }>;
}

export interface Client360 {
  id: string;
  companyName: string;
  taxIdNIT: string;
  seprecRegistrationNumber: string;
  legalRepresentative: string;
  representativeCI: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  asfiRiskRating: 'BAJO' | 'MEDIO' | 'ALTO' | 'RECHAZADO';
  onboardingStatus: string;
  creditLineBob: number;
  custodialWallet: {
    publicKey: string;
    custodyType: string;
    network: string;
    balances: Array<{ asset: string; balance: string }>;
  };
  dueDiligenceChecklist: {
    matriculaComercioVigente: boolean;
    nitActivo: boolean;
    poderRepresentanteLegal: boolean;
    cedulaIdentidadRepresentante: boolean;
    estadosFinancierosAuditados: boolean;
    declaracionOrigenFondos: boolean;
    formularioConozcaSuCliente: boolean;
  };
}

export interface ComplianceOverview {
  entity: string;
  supervisionStatus: string;
  asfiEcpResolution: string;
  custodyModel: string;
  testnetLedgerSync: string;
  activeAuditLogsCount: number;
  complianceScore: number;
  lastAuditSync: string;
}

export interface AuditLog {
  id: string;
  event: string;
  actor: string;
  target: string;
  status: string;
  timestamp: string;
  details: string;
}

export interface EmailTemplate {
  id: string;
  title: string;
  subject: string;
  body: string;
}

export interface CommercialObjection {
  id: string;
  category: string;
  clientConcern: string;
  recommendedResponse: string;
  auditedKeyPoints: string[];
}
