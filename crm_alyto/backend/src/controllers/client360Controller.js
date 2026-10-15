import { stellarService } from '../services/stellarService.js';
import { kycAmlService } from '../services/kycAmlService.js';

let mockClients = [
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

export const client360Controller = {
  getAllClients: (req, res) => {
    res.json(mockClients);
  },

  getClientById: (req, res) => {
    const client = mockClients.find((c) => c.id === req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Cliente institucional no encontrado' });
    }
    res.json(client);
  },

  updateChecklist: (req, res) => {
    const client = mockClients.find((c) => c.id === req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Cliente institucional no encontrado' });
    }

    client.dueDiligenceChecklist = {
      ...client.dueDiligenceChecklist,
      ...req.body
    };

    const audit = kycAmlService.verifyClientChecklist(client.dueDiligenceChecklist);
    client.asfiRiskRating = audit.riskLevel;
    if (audit.isApproved) {
      client.onboardingStatus = 'VERIFICADO_ECP';
    }

    res.json({
      client,
      verificationResult: audit
    });
  },

  generateWallet: (req, res) => {
    const client = mockClients.find((c) => c.id === req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: 'Cliente institucional no encontrado' });
    }

    const newWallet = stellarService.createCustodialWallet(client.id);
    client.custodialWallet = {
      publicKey: newWallet.publicKey,
      custodyType: 'CUSTODIA_INSTITUCIONAL',
      network: 'TESTNET',
      balances: [
        { asset: 'XLM (Testnet)', balance: newWallet.balanceXlm },
        { asset: 'USDc (Ancla ECP)', balance: newWallet.balanceUsdc },
        { asset: 'BOBb (Custodial)', balance: newWallet.balanceBobb }
      ]
    };

    res.json({
      message: 'Wallet custodial generada exitosamente bajo custodia institucional',
      wallet: client.custodialWallet
    });
  }
};
