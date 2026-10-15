/**
 * Compliance Agent (compliance-agent)
 * Validador normativo ASFI / ECP y listas restrictivas
 * AV Finance S.R.L.
 */

import { ECP_COMPLIANCE_RULES } from './rules.js';

export interface ComplianceAuditResult {
  isCompliant: boolean;
  score: number; // 0 - 100
  violations: Array<{ ruleCode: string; message: string; severity: string }>;
  recommendations: string[];
  auditTimestamp: string;
}

export class ComplianceAgent {
  private agentName = 'Compliance-Agent-ECP';

  /**
   * Valida si un cliente corporativo cumple todos los requisitos normativos del ECP de ASFI
   */
  public auditClient(clientData: {
    taxIdNIT: string;
    seprecRegistrationNumber: string;
    declaredAnnualVolumeBob: number;
    hasOriginOfFundsDeclaration: boolean;
    pepStatus: boolean;
  }): ComplianceAuditResult {
    const violations: Array<{ ruleCode: string; message: string; severity: string }> = [];

    // Chequeo de NIT y SEPREC
    const nitRule = ECP_COMPLIANCE_RULES.find((r) => r.code === 'ECP_ASFI_NIT_VALIDATION');
    const nitCheck = nitRule?.validate(clientData);
    if (nitCheck && !nitCheck.valid) {
      violations.push({ ruleCode: nitRule!.code, message: nitCheck.reason!, severity: nitRule!.severity });
    }

    // Chequeo de declaración de fondos
    const fundsRule = ECP_COMPLIANCE_RULES.find((r) => r.code === 'ECP_ASFI_ORIGIN_OF_FUNDS');
    const fundsCheck = fundsRule?.validate(clientData);
    if (fundsCheck && !fundsCheck.valid) {
      violations.push({ ruleCode: fundsRule!.code, message: fundsCheck.reason!, severity: fundsRule!.severity });
    }

    // Alerta PEP
    if (clientData.pepStatus) {
      violations.push({
        ruleCode: 'PEP_FLAG',
        message: 'Representante legal registrado como Persona Expuesta Políticamente. Requiere visto bueno de Gerencia General.',
        severity: 'HIGH'
      });
    }

    const isCompliant = violations.length === 0;
    const score = Math.max(0, 100 - violations.length * 25);

    const recommendations = [];
    if (!isCompliant) {
      recommendations.push('Completar documentación en expediente de debida diligencia antes de habilitar límites transaccionales.');
    } else {
      recommendations.push('Expediente en regla para operaciones de transferencias internacionales en el ECP de ASFI.');
    }

    return {
      isCompliant,
      score,
      violations,
      recommendations,
      auditTimestamp: new Date().toISOString()
    };
  }

  /**
   * Audita una transacción de transferencia internacional frente a cupos y reglas ECP
   */
  public auditTransaction(transactionData: {
    amountBob: number;
    custodyType: string;
    clientId: string;
    destinationCountry: string;
  }): ComplianceAuditResult {
    const violations: Array<{ ruleCode: string; message: string; severity: string }> = [];

    const limitRule = ECP_COMPLIANCE_RULES.find((r) => r.code === 'ECP_ASFI_LIMITS_PER_TRANSACTION');
    const limitCheck = limitRule?.validate(transactionData);
    if (limitCheck && !limitCheck.valid) {
      violations.push({ ruleCode: limitRule!.code, message: limitCheck.reason!, severity: limitRule!.severity });
    }

    const custodyRule = ECP_COMPLIANCE_RULES.find((r) => r.code === 'ECP_ASFI_CUSTODIAL_POLICY');
    const custodyCheck = custodyRule?.validate(transactionData);
    if (custodyCheck && !custodyCheck.valid) {
      violations.push({ ruleCode: custodyRule!.code, message: custodyCheck.reason!, severity: custodyRule!.severity });
    }

    const isCompliant = violations.length === 0;
    const score = isCompliant ? 100 : 50;

    return {
      isCompliant,
      score,
      violations,
      recommendations: isCompliant
        ? ['Transacción autorizada para liquidación en Stellar Testnet con custodia institucional.']
        : ['Transacción retenida preventivamente por comité de cumplimiento.'],
      auditTimestamp: new Date().toISOString()
    };
  }

  /**
   * Audita textos corporativos para asegurar que cumplan las directrices de marca
   */
  public auditCommunicationText(text: string): { passes: boolean; feedback?: string } {
    const brandRule = ECP_COMPLIANCE_RULES.find((r) => r.code === 'BRAND_LINGUISTIC_AUDIT');
    const check = brandRule?.validate(text);
    return {
      passes: check ? check.valid : true,
      feedback: check?.reason
    };
  }
}

export default new ComplianceAgent();
