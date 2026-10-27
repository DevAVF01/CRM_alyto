/**
 * Reglas normativas ASFI / ECP para AV Finance S.R.L.
 */

export interface ECPComplianceRule {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  validate: (context: any) => { valid: boolean; reason?: string };
}

export const ECP_COMPLIANCE_RULES: ECPComplianceRule[] = [
  {
    id: 'asfi-01',
    code: 'ECP_ASFI_NIT_VALIDATION',
    name: 'Validación de NIT y SEPREC',
    description: 'Toda empresa participante debe contar con NIT activo y matrícula comercial vigente en SEPREC.',
    severity: 'CRITICAL',
    validate: (client) => {
      if (!client.taxIdNIT || client.taxIdNIT.length < 7) {
        return { valid: false, reason: 'El NIT institucional es inválido o no está presente.' };
      }
      if (!client.seprecRegistrationNumber) {
        return { valid: false, reason: 'Falta la matrícula de comercio SEPREC.' };
      }
      return { valid: true };
    }
  },
  {
    id: 'asfi-02',
    code: 'ECP_ASFI_CUSTODIAL_POLICY',
    name: 'Esquema de Custodia Institucional',
    description: 'La gestión de fondos se realiza bajo esquema de custodia institucional en cuentas y wallets custodiales autorizadas.',
    severity: 'CRITICAL',
    validate: (tx) => {
      if (tx.custodyType && tx.custodyType !== 'CUSTODIA_INSTITUCIONAL') {
        return { valid: false, reason: 'Esquema de custodia no autorizado. Se requiere custodia institucional.' };
      }
      return { valid: true };
    }
  },
  {
    id: 'asfi-03',
    code: 'ECP_ASFI_LIMITS_PER_TRANSACTION',
    name: 'Límites Operativos del ECP',
    description: 'Las transferencias internacionales dentro del ECP de ASFI no deben superar el cupo autorizado por operación.',
    severity: 'HIGH',
    validate: (tx) => {
      const maxLimitBob = 120000; // Tope por operacion de prueba dentro del ECP
      if (tx.amountBob && Number(tx.amountBob) > maxLimitBob) {
        return { valid: false, reason: `El monto excede el cupo máximo por operación en ECP (${maxLimitBob} BOB).` };
      }
      return { valid: true };
    }
  },
  {
    id: 'asfi-04',
    code: 'ECP_ASFI_ORIGIN_OF_FUNDS',
    name: 'Declaración de Origen Lícito',
    description: 'Se exige declaración jurada firmada por el representante legal para montos corporativos.',
    severity: 'HIGH',
    validate: (client) => {
      if (client.declaredAnnualVolumeBob > 100000 && !client.hasOriginOfFundsDeclaration) {
        return { valid: false, reason: 'Declaración jurada de origen lícito de fondos pendiente de firma.' };
      }
      return { valid: true };
    }
  },
  {
    id: 'asfi-05',
    code: 'BRAND_LINGUISTIC_AUDIT',
    name: 'Auditoría Léxica y Marca Institucional',
    description: 'Verifica que no se utilicen términos prohibidos en comunicaciones o metadata.',
    severity: 'CRITICAL',
    validate: (text: string) => {
      const forbidden = [
        { term: /remesas/i, fix: 'transferencias internacionales' },
        { term: /non-custodial/i, fix: 'custodia institucional' },
        { term: /tenemos licencia/i, fix: 'en el ECP de ASFI' },
        { term: /somos los únicos/i, fix: 'operador institucional' }
      ];

      for (const item of forbidden) {
        if (item.term.test(text)) {
          return { valid: false, reason: `Infracción de regla de marca: término no admitido detectado. Use '${item.fix}'.` };
        }
      }
      return { valid: true };
    }
  }
];
