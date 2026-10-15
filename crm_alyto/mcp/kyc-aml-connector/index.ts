/**
 * Conector MCP KYC/AML y Debida Diligencia Institucional
 * AV Finance S.R.L. - Entorno Controlado de Pruebas (ECP) de ASFI
 */

export interface InstitutionalClientVerification {
  companyName: string;
  taxIdNIT: string;
  seprecRegistrationNumber: string;
  legalRepresentative: string;
  pepCheckPassed: boolean;
  ofacCheckPassed: boolean;
  unSanctionsCheckPassed: boolean;
  asfiRiskCategory: 'BAJO' | 'MEDIO' | 'ALTO' | 'RECHAZADO';
  verifiedAt: string;
  complianceOfficerSignature: string;
}

export class KycAmlConnector {
  /**
   * Realiza chequeo exhaustivo en listas restrictivas y verificación de identidad corporativa
   */
  public async verifyCompany(
    companyName: string,
    taxIdNIT: string,
    seprecRegistrationNumber: string,
    legalRepresentative: string
  ): Promise<InstitutionalClientVerification> {
    // Simulación de chequeo en listas OFAC, ONU y verificación de NIT/SEPREC
    const isRestricted = companyName.toLowerCase().includes('blacklisted') || taxIdNIT === '0000000000';

    return {
      companyName,
      taxIdNIT,
      seprecRegistrationNumber,
      legalRepresentative,
      pepCheckPassed: !isRestricted,
      ofacCheckPassed: !isRestricted,
      unSanctionsCheckPassed: !isRestricted,
      asfiRiskCategory: isRestricted ? 'RECHAZADO' : 'BAJO',
      verifiedAt: new Date().toISOString(),
      complianceOfficerSignature: 'OFICIAL_CUMPLIMIENTO_AV_FINANCE_ECP'
    };
  }

  /**
   * Valida checklist obligatorio de debida diligencia según directrices de ASFI para el ECP
   */
  public validateDueDiligenceChecklist(checklist: {
    matriculaComercioVigente: boolean;
    nitActivo: boolean;
    poderRepresentanteLegal: boolean;
    cedulaIdentidadRepresentante: boolean;
    estadosFinancierosAuditados: boolean;
    declaracionOrigenFondos: boolean;
    formularioConozcaSuCliente: boolean;
  }): { isComplete: boolean; pendingItems: string[] } {
    const pendingItems: string[] = [];

    if (!checklist.matriculaComercioVigente) pendingItems.push('Matrícula de Comercio SEPREC vigente');
    if (!checklist.nitActivo) pendingItems.push('Certificación de NIT activo en SIN');
    if (!checklist.poderRepresentanteLegal) pendingItems.push('Poder notariado de representación legal');
    if (!checklist.cedulaIdentidadRepresentante) pendingItems.push('Cédula de identidad vigente del representante');
    if (!checklist.estadosFinancierosAuditados) pendingItems.push('Estados financieros de la última gestión');
    if (!checklist.declaracionOrigenFondos) pendingItems.push('Declaración jurada de origen lícito de fondos');
    if (!checklist.formularioConozcaSuCliente) pendingItems.push('Formulario Conozca a su Cliente (KYC) firmado');

    return {
      isComplete: pendingItems.length === 0,
      pendingItems
    };
  }
}

export default new KycAmlConnector();
