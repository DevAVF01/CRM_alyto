import { Deal, PipelineStage, Client360, ComplianceOverview, AuditLog, EmailTemplate, CommercialObjection, UserSession } from '../types';

const API_BASE = '/api';

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ token: string; user: UserSession }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error('Error al iniciar sesión');
      return await res.json();
    } catch {
      return {
        token: 'bearer_mock_ecp_token',
        user: {
          id: 'usr_ecp_01',
          email,
          fullName: 'Oficial de Cumplimiento ECP',
          role: 'COMPLIANCE_OFFICER',
          institution: 'AV Finance S.R.L.'
        }
      };
    }
  },

  // Pipeline
  getStages: async (): Promise<PipelineStage[]> => {
    try {
      const res = await fetch(`${API_BASE}/pipeline/stages`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
        { id: 'LEAD_QUALIFIED', order: 1, name: 'Lead Institucional Calificado', description: 'Empresas importadoras/exportadoras con perfil evaluado.', requiredChecks: ['NIT verificado'] },
        { id: 'DUE_DILIGENCE_ECP', order: 2, name: 'Debida Diligencia & Onboarding ECP', description: 'Revisión exhaustiva de documentación corporativa y listas restrictivas ASFI.', requiredChecks: ['Checklist ECP'] },
        { id: 'LINE_APPROVAL_CUSTODY', order: 3, name: 'Aprobación de Línea / Custodia Institucional', description: 'Asignación de cupo operativo y aprovisionamiento de wallet custodial.', requiredChecks: ['Aprobación de cupo'] },
        { id: 'FX_QUOTE_LOCK', order: 4, name: 'Cotización & Fijación de Tasa (FX / Testnet)', description: 'Pactación de tipo de cambio y reserva de liquidez.', requiredChecks: ['Tasa pactada'] },
        { id: 'STELLAR_SETTLEMENT', order: 5, name: 'Ejecución & Liquidación en Stellar Testnet', description: 'Firma y envío de transacción en Stellar Testnet con custodia institucional.', requiredChecks: ['Firma en Testnet'] },
        { id: 'COMPLETED_RECONCILED', order: 6, name: 'Transferencia Completada & Conciliada', description: 'Generación de comprobante oficial con código QR.', requiredChecks: ['Comprobante generado'] }
      ];
    }
  },

  getDeals: async (): Promise<Deal[]> => {
    try {
      const res = await fetch(`${API_BASE}/pipeline/deals`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
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
          beneficiary: { name: 'Pharma Global Corp', bank: 'JPMorgan Chase NY', country: 'Estados Unidos' },
          history: []
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
          beneficiary: { name: 'AgriTech Equipments GmbH', bank: 'Deutsche Bank Frankfurt', country: 'Alemania' },
          history: []
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
          beneficiary: { name: 'TechLogistics Ltd', bank: 'HSBC Hong Kong', country: 'Hong Kong' },
          history: []
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
          purpose: 'Adquisición de acero estructurado',
          beneficiary: { name: 'Siderúrgica del Pacífico S.A.', bank: 'Banco Santander Chile', country: 'Chile' },
          history: []
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
          beneficiary: { name: 'BioReagents International', bank: 'UBS Zurich', country: 'Suiza' },
          history: []
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
          beneficiary: { name: 'Mining Heavy Equipment Corp', bank: 'Bank of America Charlotte', country: 'Estados Unidos' },
          history: []
        }
      ];
    }
  },

  advanceDealStage: async (dealId: string, targetStageId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/pipeline/deals/${dealId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetStageId })
    });
    return await res.json();
  },

  createDeal: async (dealData: Partial<Deal>): Promise<Deal> => {
    const res = await fetch(`${API_BASE}/pipeline/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dealData)
    });
    return await res.json();
  },

  // Clients 360
  getClients: async (): Promise<Client360[]> => {
    try {
      const res = await fetch(`${API_BASE}/clients`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
        {
          id: 'CLI-001',
          companyName: 'Importadora Andina S.A.',
          taxIdNIT: '1029384021',
          seprecRegistrationNumber: 'SEP-LPZ-948201',
          legalRepresentative: 'Lic. Marcelo Vargas Terán',
          representativeCI: '3482910 LP',
          industry: 'Comercio Exterior / Insumos Médicos',
          contactEmail: 'gerencia@importadoraandina.bo',
          contactPhone: '+591 2 2443322',
          address: 'Av. 16 de Julio N° 1490, Edif. Alameda Piso 8, La Paz',
          asfiRiskRating: 'BAJO',
          onboardingStatus: 'EN_PROCESO_ECP',
          creditLineBob: 500000,
          custodialWallet: {
            publicKey: 'GBX4E2Z5R9Q72KLP10984NMZAQW345678YUIOPLZXCVBNMASDFGHJKL1',
            custodyType: 'CUSTODIA_INSTITUCIONAL',
            network: 'TESTNET',
            balances: [
              { asset: 'XLM (Testnet)', balance: '10000.00' },
              { asset: 'USDc (Ancla ECP)', balance: '25000.00' },
              { asset: 'BOBb (Custodial)', balance: '174000.00' }
            ]
          },
          dueDiligenceChecklist: {
            matriculaComercioVigente: true,
            nitActivo: true,
            poderRepresentanteLegal: true,
            cedulaIdentidadRepresentante: true,
            estadosFinancierosAuditados: false,
            declaracionOrigenFondos: true,
            formularioConozcaSuCliente: true
          }
        },
        {
          id: 'CLI-002',
          companyName: 'Agroindustrias del Oriente S.R.L.',
          taxIdNIT: '3049581029',
          seprecRegistrationNumber: 'SEP-SCZ-103948',
          legalRepresentative: 'Ing. Roberto Justiniano Suárez',
          representativeCI: '4928103 SC',
          industry: 'Agroexportación & Maquinaria',
          contactEmail: 'administracion@agroriente.bo',
          contactPhone: '+591 3 3551122',
          address: 'Parque Industrial Mz. 12, Santa Cruz de la Sierra',
          asfiRiskRating: 'BAJO',
          onboardingStatus: 'VERIFICADO_ECP',
          creditLineBob: 1000000,
          custodialWallet: {
            publicKey: 'GDK8192LA0918237465KLMQWOP18293481029384756192837465ABCD1',
            custodyType: 'CUSTODIA_INSTITUCIONAL',
            network: 'TESTNET',
            balances: [
              { asset: 'XLM (Testnet)', balance: '15000.00' },
              { asset: 'USDc (Ancla ECP)', balance: '40000.00' },
              { asset: 'BOBb (Custodial)', balance: '350000.00' }
            ]
          },
          dueDiligenceChecklist: {
            matriculaComercioVigente: true,
            nitActivo: true,
            poderRepresentanteLegal: true,
            cedulaIdentidadRepresentante: true,
            estadosFinancierosAuditados: true,
            declaracionOrigenFondos: true,
            formularioConozcaSuCliente: true
          }
        }
      ];
    }
  },

  updateClientChecklist: async (clientId: string, checklist: any): Promise<any> => {
    const res = await fetch(`${API_BASE}/clients/${clientId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checklist)
    });
    return await res.json();
  },

  generateClientWallet: async (clientId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/clients/${clientId}/wallet`, {
      method: 'POST'
    });
    return await res.json();
  },

  // Compliance
  getComplianceOverview: async (): Promise<ComplianceOverview> => {
    try {
      const res = await fetch(`${API_BASE}/compliance/overview`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return {
        entity: 'AV Finance S.R.L.',
        supervisionStatus: 'Bajo supervisión de ASFI en el Entorno Controlado de Pruebas (ECP)',
        asfiEcpResolution: 'ASFI/ECP-FINTECH/2026-042',
        custodyModel: 'Custodia Institucional Segregada',
        testnetLedgerSync: 'Activo / En línea',
        activeAuditLogsCount: 3,
        complianceScore: 98,
        lastAuditSync: new Date().toISOString()
      };
    }
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    try {
      const res = await fetch(`${API_BASE}/compliance/audit-logs`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
        { id: 'LOG-001', event: 'VERIFICACION_NIT_SEPREC', actor: 'Oficial de Cumplimiento ECP', target: 'Importadora Andina S.A.', status: 'CONFORME', timestamp: '2026-10-12T10:14:00Z', details: 'NIT 1029384021 validado con Servicio de Impuestos Nacionales' },
        { id: 'LOG-002', event: 'SCREENING_LISTAS_RESTRICTIVAS', actor: 'Compliance Agent ECP', target: 'Agroindustrias del Oriente S.R.L.', status: 'CONFORME', timestamp: '2026-10-12T11:20:00Z', details: '0 coincidencias en listas OFAC, CS ONU y PEP' },
        { id: 'LOG-003', event: 'AUDITORIA_LIMITE_TRANSACCIONAL', actor: 'Pipeline Agent ECP', target: 'Minera & Metales del Sur S.A.', status: 'CONFORME', timestamp: '2026-10-13T09:00:00Z', details: 'Monto de 348,000 BOB dentro del cupo operativo autorizado para el ECP de ASFI' }
      ];
    }
  },

  screenSanctions: async (companyName: string, taxIdNIT: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/compliance/screening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, taxIdNIT })
    });
    return await res.json();
  },

  // Communications & Support AI
  getTemplates: async (): Promise<EmailTemplate[]> => {
    try {
      const res = await fetch(`${API_BASE}/agents/templates`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
        {
          id: 'TMPL_ONBOARDING_INVITE',
          title: 'Invitación a Onboarding ECP de ASFI',
          subject: 'Bienvenido a Alyto: Inicio de Debida Diligencia para Transferencias Internacionales',
          body: 'Estimado equipo corporativo, le damos la bienvenida a Alyto, la solución de transferencias internacionales operada por AV Finance S.R.L. en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI. Para habilitar su línea operativa con custodia institucional, adjuntamos el checklist de debida diligencia.'
        },
        {
          id: 'TMPL_RATE_LOCK',
          title: 'Confirmación de Tasa y Cupo Reservado',
          subject: 'Alyto: Cotización y Fijación de Tasa para Transferencia Internacional',
          body: 'Le confirmamos la fijación de tasa de cambio para su operación programada. Una vez recibido su depósito en cuenta de custodia institucional, procederemos con la liquidación inmediata en Stellar Testnet.'
        },
        {
          id: 'TMPL_SETTLEMENT_SUCCESS',
          title: 'Comprobante de Transferencia Internacional Completada',
          subject: 'Alyto: Comprobante de Liquidación Transfronteriza Exitosa',
          body: 'Su transferencia internacional ha sido completada y conciliada exitosamente. Adjuntamos su comprobante oficial emitido por AV Finance S.R.L. en el ECP de ASFI con código QR de verificación.'
        }
      ];
    }
  },

  getObjections: async (): Promise<CommercialObjection[]> => {
    try {
      const res = await fetch(`${API_BASE}/agents/objections`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return [
        {
          id: 'OBJ_REG_01',
          category: 'REGULATORIO',
          clientConcern: '¿Cuál es su estatus frente a la ASFI en Bolivia?',
          recommendedResponse: 'AV Finance S.R.L. opera formalmente en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI. Esto garantiza que todos nuestros procesos de transferencias internacionales B2B se realizan dentro de un marco experimental institucional auditado.',
          auditedKeyPoints: ['Mencionar explícitamente: en el ECP de ASFI.', 'Mencionar: bajo supervisión de ASFI.', 'No afirmar que se posee una licencia definitiva otorgada.']
        },
        {
          id: 'OBJ_CUST_02',
          category: 'CUSTODIA',
          clientConcern: '¿Cómo protegen los fondos durante la transacción transfronteriza?',
          recommendedResponse: 'Implementamos un esquema riguroso de custodia institucional a través de wallets custodiales segregadas por cliente corporativo. Los fondos están respaldados mediante contratos institucionales y conciliación estricta en Stellar Testnet.',
          auditedKeyPoints: ['Usar siempre los términos: custodia institucional o wallets custodiales.']
        },
        {
          id: 'OBJ_TIEMPO_03',
          category: 'TIEMPOS',
          clientConcern: '¿Cuánto tiempo demora la liquidación de las transferencias internacionales?',
          recommendedResponse: 'Gracias a la tecnología de Stellar Testnet y nuestros acuerdos bancarios institucionales, las transferencias internacionales se liquidan y concilian en minutos una vez completada la debida diligencia.',
          auditedKeyPoints: ['Utilizar el término: transferencias internacionales (nunca remesas).']
        }
      ];
    }
  },

  askSupportAi: async (query: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/agents/support-ai/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    return await res.json();
  },

  dispatchCommunication: async (payload: any): Promise<any> => {
    const res = await fetch(`${API_BASE}/agents/communications/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  },

  // Download receipt PDF
  downloadReceiptPdf: async (deal: Deal) => {
    const res = await fetch(`${API_BASE}/receipts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receiptNumber: deal.receiptNumber || 'REC-2026-0089',
        clientCompanyName: deal.clientName,
        clientNIT: deal.clientNit,
        sourceAmountBob: deal.amountBob,
        destinationAmountUsd: deal.amountUsd,
        exchangeRate: deal.exchangeRate,
        stellarTestnetTxHash: deal.stellarTxHash || '0x81b7a2d3c94f08e1a53b7c2901a8f94e2b6d1c8a0f9e3a7b5d2c4e1f8a9b0c2d',
        beneficiaryName: deal.beneficiary.name,
        beneficiaryBank: deal.beneficiary.bank,
        beneficiaryCountry: deal.beneficiary.country
      })
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Comprobante_${deal.receiptNumber || 'Transferencia'}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};
