export const BRAND = {
  primary: '#0B1E36',
  surface: '#1E3653',
  surfaceDeep: '#0F1E2E',
  accent: '#F3D014',
  background: '#F4F6F9',
  success: '#10B981',
  successBg: '#E6F8F0',
  danger: '#EF4444',
  dangerBg: '#FEE2E2',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  text: '#0E131F',
  textMuted: '#5A6578',
  stroke: '#E2E8F0',
} as const;

export const COMPLIANCE_BADGE = 'Bajo supervisión de ASFI (ECP)';
export const NETWORK_PILL = 'Stellar Testnet';
export const LEGAL_FOOTER = 'AV Finance S.R.L. | Entorno Controlado de Pruebas (ECP) supervisado por la ASFI | Stellar Testnet';
export const REGIME_CODE = 'AVF-REG-2024-BOL';

export const AUTHORIZED_TERMS = [
  'pagos transfronterizos',
  'transferencias internacionales',
  'wallets custodiales institucionales',
  'Bajo supervisión de ASFI en el Entorno Controlado de Pruebas (ECP)',
];

const PROHIBITED_PATTERNS: { pattern: RegExp; rule: string }[] = [
  { pattern: /\bremesas?\b/i, rule: 'Usar "transferencias internacionales" en lugar de "remesas"' },
  { pattern: /\bexchange\b/i, rule: 'Usar "transferencias internacionales" en lugar de "exchange"' },
  { pattern: /\bplataforma de inversi[oó]n\b/i, rule: 'Término prohibido por la directriz de marca' },
  { pattern: /non[\s-]?custodial/i, rule: 'Usar "custodia institucional" o "wallets custodiales"' },
  { pattern: /\blicencia(?:s)?\s+completa\b/i, rule: 'La licencia se encuentra en proceso dentro del ECP' },
  { pattern: /\blicenciad[oa]s?\b|\bregulad[oa]s?\b/i, rule: 'Usar "Bajo supervisión de ASFI" o "en el ECP de ASFI"' },
  { pattern: /somos los [uú]nicos/i, rule: 'No se realizan comparaciones con otras entidades del ECP' },
  { pattern: /\u2014/, rule: 'Cero guiones largos en textos de interfaz' },
];

export interface BrandViolation {
  rule: string;
  match: string;
}

export function brandViolations(text: string): BrandViolation[] {
  const violations: BrandViolation[] = [];
  for (const { pattern, rule } of PROHIBITED_PATTERNS) {
    const match = text.match(pattern);
    if (match) violations.push({ rule, match: match[0] });
  }
  return violations;
}

export function isBrandCompliant(text: string): boolean {
  return brandViolations(text).length === 0;
}
