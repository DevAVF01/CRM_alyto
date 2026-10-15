import type {
  AuditEvent,
  ChecklistItem,
  ClientRecord,
  ComplianceSummary,
  DealRecord,
  DealStage,
  EcpLimits,
  Objection,
  Template,
  TransferTx,
  WalletRecord,
} from '../types';

export const STAGES = [
  '1. Prospecto',
  '2. Detección de Necesidades de Pago',
  '3. Presentación AlyPay (Stellar)',
  '4. Validación Documental / ECP (ASFI)',
  '5. Prueba Piloto (Operación Test)',
  '6. Cliente Activo',
] as const;

export const stageName = (stage: DealStage): string => STAGES[stage - 1];

function fakeStrkey(seed: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 7;
  for (const ch of seed) value = (value * 31 + ch.charCodeAt(0)) % 9973;
  let out = 'G';
  while (out.length < 56) {
    value = (value * 1103515245 + 12345) % 2147483648;
    out += alphabet[value % 32];
  }
  return out;
}

export const MOCK_CLIENTS: ClientRecord[] = [
  { id: 'ECP-BOL-5577', name: 'Comercializadora del Valle S.A.', nit: '1028493028', country: 'Bolivia', sector: 'Comercio Exterior', representative: 'Lic. Gonzalo Arze', regime: 'Resolución ASFI 2024', kycStatus: 'En revision', health: 'En evaluacion', volumeProcessed: 184520, monthlyLimit: 250000, frequency: 14, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-valle') },
  { id: 'ECP-BOL-8421', name: 'Grupo Andino S.R.L.', nit: '1023904221', country: 'Bolivia', sector: 'Pago a Proveedores', representative: 'Lic. Marcela Quiroga', regime: 'Resolución ASFI 2024', kycStatus: 'En revision', health: 'Excelente', volumeProcessed: 680000, monthlyLimit: 500000, frequency: 2, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-andino') },
  { id: 'ECP-BOL-6290', name: 'Importadora Pacífico', nit: '1025117304', country: 'Bolivia', sector: 'Comercio Exterior', representative: 'Lic. Fernando Salinas', regime: 'Resolución ASFI 2024', kycStatus: 'Pendiente', health: 'Alta', volumeProcessed: 0, monthlyLimit: 750000, frequency: 1, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-pacifico') },
  { id: 'ECP-BOL-3118', name: 'Logística Mercosur', nit: '1028455119', country: 'Bolivia', sector: 'Transferencia Institucional B2B', representative: 'Lic. Paola Arteaga', regime: 'Resolución ASFI 2024', kycStatus: 'En revision', health: 'En Riesgo Documental', volumeProcessed: 120000, monthlyLimit: 420000, frequency: 4, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-mercosur') },
  { id: 'ECP-BOL-1094', name: 'Corp. Agroindustrial del Sur', nit: '1023390455', country: 'Bolivia', sector: 'Pago a Proveedores', representative: 'Lic. Rodrigo Céspedes', regime: 'Resolución ASFI 2024', kycStatus: 'Aprobado', health: 'Excelente', volumeProcessed: 990000, monthlyLimit: 400000, frequency: 1, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-agrosur') },
  { id: 'ECP-BOL-7788', name: 'AgroIndustrial del Oriente', nit: '1029976412', country: 'Bolivia', sector: 'Pago a Proveedores', representative: 'Lic. Carmen Luján', regime: 'Resolución ASFI 2024', kycStatus: 'Aprobado', health: 'Excelente', volumeProcessed: 1450000, monthlyLimit: 600000, frequency: 3, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-oriente') },
  { id: 'ECP-BOL-6633', name: 'Comercial Santa Cruz S.A.', nit: '1026608850', country: 'Bolivia', sector: 'Comercio Exterior', representative: 'Lic. Javier Monasterio', regime: 'Resolución ASFI 2024', kycStatus: 'En revision', health: 'Alta', volumeProcessed: 82500, monthlyLimit: 300000, frequency: 1, custodialProtocol: 'Stellar AlyPay', vault: fakeStrkey('vault-scz') },
];

export const MOCK_DEALS: DealRecord[] = [
  { id: 'ECP-BOL-8421', clientId: 'ECP-BOL-8421', company: 'Grupo Andino S.R.L.', stage: 5, dealType: 'Pago a Proveedor Internacional', frequency: 'Quincenal', monthlyVolume: 340000, health: 'Excelente', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-6290', clientId: 'ECP-BOL-6290', company: 'Importadora Pacífico', stage: 3, dealType: 'Operación Comercial Exterior', frequency: 'Mensual', monthlyVolume: 750000, health: 'Alta', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-3118', clientId: 'ECP-BOL-3118', company: 'Logística Mercosur', stage: 4, dealType: 'Transferencia Institucional B2B', frequency: 'Semanal', monthlyVolume: 420000, health: 'En Riesgo Documental', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-1094', clientId: 'ECP-BOL-1094', company: 'Corp. Agroindustrial del Sur', stage: 6, dealType: 'Pago a Proveedor Internacional', frequency: 'Mensual', monthlyVolume: 330000, health: 'Excelente', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-5577', clientId: 'ECP-BOL-5577', company: 'Comercializadora del Valle S.A.', stage: 6, dealType: 'Operación Comercial Exterior', frequency: 'Quincenal', monthlyVolume: 275000, health: 'En evaluacion', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-7788', clientId: 'ECP-BOL-7788', company: 'AgroIndustrial del Oriente', stage: 6, dealType: 'Pago a Proveedor Internacional', frequency: 'Semanal', monthlyVolume: 520000, health: 'Excelente', owner: 'Fuerza de Ventas B2B' },
  { id: 'ECP-BOL-6633', clientId: 'ECP-BOL-6633', company: 'Comercial Santa Cruz S.A.', stage: 4, dealType: 'Operación Comercial Exterior', frequency: 'Mensual', monthlyVolume: 82500, health: 'Alta', owner: 'Fuerza de Ventas B2B' },
];

export const MOCK_WALLETS: WalletRecord[] = MOCK_CLIENTS.flatMap((client) => [
  { clientId: client.id, label: 'Wallet Custodial Principal', publicKey: fakeStrkey(`wp-${client.id}`), asset: 'USDC', balance: (client.volumeProcessed / 4).toFixed(2) },
  { clientId: client.id, label: 'Wallet Custodial Operativa', publicKey: fakeStrkey(`wo-${client.id}`), asset: 'XLM', balance: (250 + (client.id.charCodeAt(9) % 90)).toFixed(2) },
]);

export const MOCK_TRANSACTIONS: TransferTx[] = [
  { id: 'TX-90031', clientId: 'ECP-BOL-5577', beneficiary: 'Pacific Grain Logistics Inc.', destination: 'Valparaíso, Chile', amountUsd: 42500, status: 'Completada en ECP', hash: '8f92c10b9a43f6d01c5b27e4a8d36f10c2b4e7a91d05c3e6b8a1f2d4c7e903e1a', createdAt: '2026-10-02T14:22:00Z' },
  { id: 'TX-90032', clientId: 'ECP-BOL-5577', beneficiary: 'Andean Fertilizers Corp.', destination: 'Lima, Perú', amountUsd: 19800, status: 'En Proceso', hash: 'd32a764e0b1f4c9a8e5d2f6a0c3b7e91d4f8a2c5e7b0d3f6a9c2e5b8d1f4a55c2', createdAt: '2026-10-08T09:10:00Z' },
  { id: 'TX-90033', clientId: 'ECP-BOL-5577', beneficiary: 'AgroMaq Sudamericana S.A.', destination: 'San Pablo, Brasil', amountUsd: 62220, status: 'Completada en ECP', hash: '11c79a92d4e8b1f5a0c3e6b9d2f5a8c1e4b7d0f3a6c9e2b5d8f1a4c7e0b3f04f8', createdAt: '2026-09-27T18:45:00Z' },
  { id: 'TX-90034', clientId: 'ECP-BOL-7788', beneficiary: 'Global Seed Trading LLC', destination: 'Buenos Aires, Argentina', amountUsd: 145000, status: 'Completada en ECP', hash: 'a47c21e8f0b3d6a9c2e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3c6e9b2d5a8c1', createdAt: '2026-10-10T11:05:00Z' },
  { id: 'TX-90035', clientId: 'ECP-BOL-6633', beneficiary: 'Andean Textile Group SpA', destination: 'Santiago, Chile', amountUsd: 82500, status: 'En Revision ASFI', hash: 'b58d32f9a1c4e7b0d3f6a9c2e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3c6', createdAt: '2026-10-11T16:30:00Z' },
];

const CHECKLIST_TEMPLATE: Omit<ChecklistItem, 'status'>[] = [
  { key: 'personeria', label: 'Identificación y Personería Jurídica', detail: 'Validado por Oficial de Cumplimiento' },
  { key: 'origen-fondos', label: 'Verificación de Origen de Fondos', detail: 'Límite: $us 250,000.00' },
  { key: 'contrato-ecp', label: 'Contrato de Adhesión ECP', detail: 'Requiere firma del representante legal' },
  { key: 'transparencia', label: 'Protocolo de Transparencia de Operaciones', detail: 'Ledger #492810 en Stellar Testnet' },
  { key: 'ubo', label: 'Identificación de Beneficiarios Finales (UBO)', detail: 'Umbral del 25% del capital' },
  { key: 'listas', label: 'Listas Restrictivas Internacionales', detail: 'OFAC / ONU / UE' },
  { key: 'perfil-transaccional', label: 'Perfil Transaccional Declarado', detail: 'Volumen y frecuencia estimados' },
  { key: 'autorizacion-test', label: 'Autorización de Operación Test', detail: 'Dictamen previo del Oficial de Cumplimiento' },
];

function seedChecklist(clientId: string): ChecklistItem[] {
  const base: ChecklistItem[] = CHECKLIST_TEMPLATE.map((item) => ({ ...item, status: 'Pendiente' }));
  const set = (key: string, status: ChecklistItem['status']) => {
    const item = base.find((i) => i.key === key);
    if (item) item.status = status;
  };
  set('personeria', 'Aprobado');
  set('origen-fondos', 'Aprobado');
  set('listas', 'Aprobado');
  if (clientId === 'ECP-BOL-5577' || clientId === 'ECP-BOL-3118') {
    set('contrato-ecp', 'Observado');
    set('transparencia', 'Aprobado');
    set('ubo', 'En revision');
    set('perfil-transaccional', 'En revision');
  } else if (clientId === 'ECP-BOL-1094' || clientId === 'ECP-BOL-7788') {
    base.forEach((item) => { item.status = 'Aprobado'; });
  } else {
    set('transparencia', 'En revision');
    set('ubo', 'En revision');
  }
  return base;
}

export const MOCK_CHECKLISTS: Record<string, ChecklistItem[]> = Object.fromEntries(
  MOCK_CLIENTS.map((client) => [client.id, seedChecklist(client.id)]),
);

export const MOCK_TEMPLATES: Template[] = [
  { id: 'COM-B2B-01', name: 'Presentación Soluciones Transfronterizas AlyPay', category: 'Primer Acercamiento', channel: 'Canal Institucional', auditHash: '#ECP-7882-SHA256', approval: 'Aprobación Legal: Vigente', body: 'Estimado(a) {{nombre}}: En nombre del equipo Alyto de AV Finance S.R.L., agradecemos su interés en nuestras soluciones de pagos transfronterizos. Operamos bajo supervisión de la ASFI en el Entorno Controlado de Pruebas (ECP), con liquidación de transferencias internacionales sobre Stellar Testnet y wallets custodiales institucionales bajo protocolo multifirma. Quedamos atentos a coordinar una presentación institucional para su equipo de tesorería. Atentamente, {{asesor}}, Fuerza de Ventas B2B.' },
  { id: 'ECP-NOT-04', name: 'Notificación de Operación Test en ECP', category: 'Instrucciones', channel: 'Canal Institucional', auditHash: '#ECP-4431-SHA256', approval: 'Aprobación Legal: Vigente', body: 'Estimado(a) {{nombre}}: Por medio de la presente notificamos que la operación test {{operacion}} fue registrada en el Entorno Controlado de Pruebas (ECP) con trazabilidad en Stellar Testnet. El estado actual es {{estado}}. Toda la información operativa se encuentra disponible para revisión de la ASFI. Atentamente, Oficial de Operaciones, AV Finance S.R.L.' },
  { id: 'KYC-REQ-09', name: 'Solicitud de Documentación Regulatoria ECP', category: 'Instrucciones', channel: 'Canal Institucional', auditHash: '#ECP-2210-SHA256', approval: 'Aprobación Legal: Vigente', body: 'Estimado(a) {{nombre}}: Para continuar con la debida diligencia de su expediente en el ECP, solicitamos adjuntar: acta constitutiva, poder del representante legal, documentación de beneficiarios finales y declaración de origen de fondos. La documentación se canaliza exclusivamente por medio seguro institucional. Atentamente, Oficial de Cumplimiento, AV Finance S.R.L.' },
  { id: 'SEG-PRO-02', name: 'Seguimiento de Propuesta Comercial', category: 'Seguimiento', channel: 'Canal Institucional', auditHash: '#ECP-9155-SHA256', approval: 'Aprobación Legal: Vigente', body: 'Estimado(a) {{nombre}}: Nos ponemos en contacto para dar seguimiento a la propuesta de pagos transfronterizos presentada a {{empresa}}. Los volúmenes estimados y las condiciones operativas permanecen vigentes dentro del ECP. Quedamos atentos a sus comentarios para coordinar la siguiente etapa del proceso. Atentamente, {{asesor}}, Fuerza de Ventas B2B.' },
  { id: 'OPE-CON-06', name: 'Confirmación de Operación Test Completada', category: 'Instrucciones', channel: 'Canal Institucional', auditHash: '#ECP-6027-SHA256', approval: 'Aprobación Legal: Vigente', body: 'Estimado(a) {{nombre}}: Confirmamos que la operación test {{operacion}} por un monto de {{monto}} fue completada en el ECP con liquidación sobre Stellar Testnet. El comprobante con código de trazabilidad se encuentra disponible en Alyto CRM. Agradecemos su participación en el programa de pruebas supervisado por la ASFI. Atentamente, Oficial de Operaciones, AV Finance S.R.L.' },
];

export const MOCK_OBJECTIONS: Objection[] = [
  { id: 'OBJ-01', title: 'Tiempos de liquidación en Stellar', keywords: ['tiempo', 'liquidacion', 'demora', 'segundos', 'velocidad', 'rapida', 'rapidez'], legalBasis: 'Directrices ECP de transparencia operativa', conformity: 'Verificada', response: 'La infraestructura tecnológica sustentada en la red Stellar permite que las operaciones transfronterizas B2B de AV Finance se liquiden en cuestión de segundos, con trazabilidad completa en el ledger público de Stellar Testnet bajo supervisión de la ASFI en el ECP.' },
  { id: 'OBJ-02', title: 'Respaldo regulatorio ASFI', keywords: ['regulacion', 'asfi', 'legal', 'supervision', 'respaldado', 'licencia', 'permiso'], legalBasis: 'Régimen ECP, Resolución ASFI 2024', conformity: 'Verificada', response: 'AV Finance S.R.L. opera bajo supervisión de la ASFI en el Entorno Controlado de Pruebas (ECP). La autorización de funcionamiento se encuentra en proceso, y cada operación test queda registrada y auditada conforme a las directrices del ECP.' },
  { id: 'OBJ-03', title: 'Custodia de fondos', keywords: ['custodia', 'fondos', 'seguridad', 'wallet', 'custodial', 'resguardo'], legalBasis: 'Protocolo institucional de custodia AlyPay', conformity: 'Verificada', response: 'Los activos se mantienen en wallets custodiales institucionales bajo protocolo multifirma AlyPay. La custodia institucional garantiza control operativo reforzado, trazabilidad por operación y segregación de fondos de los clientes institucionales.' },
  { id: 'OBJ-04', title: 'Costos operativos y tarifas', keywords: ['costo', 'tarifa', 'comision', 'precio', 'fee', 'honorario'], legalBasis: 'Política comercial del ECP', conformity: 'Verificada', response: 'Durante el ECP las condiciones comerciales se estructuran por volumen y frecuencia operativa, con tarifas competitivas frente a la banca tradicional y sin costos ocultos de corresponsalía internacional.' },
];

export const MOCK_AUDIT: AuditEvent[] = [
  { id: 1, at: '2026-10-10T11:06:12Z', actor: 'Oficial de Operaciones', action: 'operacion_test_completada', detail: 'TX-90034 AgroIndustrial del Oriente por 145,000 USD liquidada en Stellar Testnet' },
  { id: 2, at: '2026-10-11T16:31:44Z', actor: 'compliance-agent', action: 'revision_asfi', detail: 'TX-90035 derivada a revisión del expediente ECP-BOL-6633' },
  { id: 3, at: '2026-10-12T09:14:03Z', actor: 'Lic. Gonzalo Arze', action: 'documento_recibido', detail: 'Poder del representante legal adjuntado al expediente ECP-BOL-5577' },
  { id: 4, at: '2026-10-12T15:40:29Z', actor: 'Oficial de Cumplimiento', action: 'checklist_actualizado', detail: 'Contrato de Adhesión ECP observado en ECP-BOL-5577, requiere subsanación' },
  { id: 5, at: '2026-10-13T08:02:51Z', actor: 'pipeline-agent', action: 'etapa_avanzada', detail: 'ECP-BOL-8421 avanzó a Prueba Piloto (Operación Test)' },
  { id: 6, at: '2026-10-13T10:22:37Z', actor: 'Oficial de Operaciones', action: 'reporte_regulatorio', detail: 'Reporte ASFI del periodo octubre generado desde Alyto CRM' },
];

export const COMPLIANCE_SUMMARY: ComplianceSummary = {
  approved: 142,
  inReview: 19,
  pending: 7,
  index: '94.8%',
  regimeCode: 'AVF-REG-2024-BOL',
};

export const ECP_LIMITS: EcpLimits = {
  parameters: {
    usuariosPorDia: 630,
    operacionesPorDia: 630,
    montoMaximoOperacionBs: 120000,
    duracionMaximaEcpMeses: 12,
    estadoLicencia: 'En proceso dentro del Entorno Controlado de Pruebas',
  },
  consumption: {
    expedientesActivos: 7,
    operacionesRegistradas: 5,
    operacionDeMayorMontoUsd: 145000,
  },
  riskMatrix: [
    { band: 'Bajo', expedientes: 3, action: 'Monitoreo estándar de perfil transaccional' },
    { band: 'Medio', expedientes: 1, action: 'Revisión documental reforzada por Oficial de Cumplimiento' },
    { band: 'Alto', expedientes: 3, action: 'Dictamen previo antes de autorizar operación test' },
  ],
};

export const KPI_MONTHLY_USD = [520000, 680000, 890000, 1020000, 1170000];
export const KPI_MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May'];
export const KPI_VOLUME_TOTAL = 4280000;
export const KPI_PENDIENTES_ECP = 12;
export const KPI_LEADS = 38;
export const KPI_CIERRE_DIAS = '14.2';

export const PIPELINE_SUMMARY = {
  volumenTramite: 1840000,
  cuentasActivas: 14,
  pruebasEnCurso: 3,
};

export const DISTRIBUTION = [
  { label: 'Pago a Proveedores', amount: 2782000, pct: 65 },
  { label: 'Comercio Exterior', amount: 1070000, pct: 25 },
  { label: 'Tesorería Intercompañía', amount: 428000, pct: 10 },
];

export const DIRECTRICES_ECP = [
  'ECP-D01: Toda operación test debe registrarse con trazabilidad completa en el ledger de Stellar Testnet.',
  'ECP-D02: La documentación de debida diligencia se conserva por medio seguro institucional.',
  'ECP-D03: Los expedientes en observación requieren subsanación antes de la etapa de prueba piloto.',
  'ECP-D04: Las comunicaciones institucionales deben emplear la terminología autorizada del ECP.',
  'ECP-D05: Los reportes regulatorios se generan por periodo calendario bajo firma del Oficial de Cumplimiento.',
  'ECP-D06: La custodia institucional opera bajo protocolo multifirma con segregación de fondos.',
];
