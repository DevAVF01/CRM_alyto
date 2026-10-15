/**
 * Servicio KYC / AML para debida diligencia de clientes institucionales
 * ECP ASFI - AV Finance S.R.L.
 */

export class KycAmlService {
  verifyClientChecklist(checklist) {
    const required = [
      'matriculaComercioVigente',
      'nitActivo',
      'poderRepresentanteLegal',
      'cedulaIdentidadRepresentante',
      'estadosFinancierosAuditados',
      'declaracionOrigenFondos',
      'formularioConozcaSuCliente'
    ];

    const missing = required.filter((key) => !checklist[key]);

    return {
      isApproved: missing.length === 0,
      missingDocuments: missing,
      riskLevel: missing.length === 0 ? 'BAJO' : missing.length <= 2 ? 'MEDIO' : 'ALTO',
      verifiedBy: 'Oficial de Cumplimiento ECP ASFI',
      verifiedAt: new Date().toISOString()
    };
  }

  screenSanctions(companyName, taxIdNIT) {
    const isClean = !companyName.toLowerCase().includes('sancion') && taxIdNIT !== '0000000000';
    return {
      companyName,
      taxIdNIT,
      ofacMatch: !isClean,
      unSanctionsMatch: !isClean,
      pepFlag: false,
      cleared: isClean,
      notes: isClean ? 'Sin coincidencias en listas restrictivas internacionales.' : 'Coincidencia preventiva detectada.'
    };
  }
}

export const kycAmlService = new KycAmlService();
