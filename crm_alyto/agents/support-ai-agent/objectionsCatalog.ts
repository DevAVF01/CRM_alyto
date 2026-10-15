/**
 * Catálogo auditado de objeciones comerciales B2B y plantillas institucionales
 * Cumple estrictamente con las directrices de marca y marco normativo del ECP de ASFI
 */

export interface ObjectionResponse {
  id: string;
  category: 'REGULATORIO' | 'CUSTODIA' | 'TIEMPOS' | 'COSTOS' | 'SEGURIDAD';
  clientConcern: string;
  recommendedResponse: string;
  auditedKeyPoints: string[];
}

export const OBJECTIONS_CATALOG: ObjectionResponse[] = [
  {
    id: 'OBJ_REG_01',
    category: 'REGULATORIO',
    clientConcern: '¿Cuál es su estatus frente a la ASFI en Bolivia?',
    recommendedResponse: 'AV Finance S.R.L. opera formalmente en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI. Esto garantiza que todos nuestros procesos de transferencias internacionales B2B se realizan dentro de un marco experimental institucional auditado.',
    auditedKeyPoints: [
      'Mencionar explícitamente: en el ECP de ASFI.',
      'Mencionar: bajo supervisión de ASFI.',
      'No afirmar que se posee una licencia definitiva otorgada, ya que está en proceso dentro del ECP.'
    ]
  },
  {
    id: 'OBJ_CUST_02',
    category: 'CUSTODIA',
    clientConcern: '¿Cómo protegen los fondos durante la transacción transfronteriza?',
    recommendedResponse: 'Implementamos un esquema riguroso de custodia institucional a través de wallets custodiales segregadas por cliente corporativo. Los fondos están respaldados mediante contratos institucionales y conciliación estricta en Stellar Testnet.',
    auditedKeyPoints: [
      'Usar siempre los términos: custodia institucional o wallets custodiales.',
      'Prohibido utilizar términos de auto-custodia ajenos al modelo institucional.'
    ]
  },
  {
    id: 'OBJ_TIEMPO_03',
    category: 'TIEMPOS',
    clientConcern: '¿Cuánto tiempo demora la liquidación de las transferencias internacionales?',
    recommendedResponse: 'Gracias a la tecnología de Stellar Testnet y nuestros acuerdos bancarios institucionales, las transferencias internacionales se liquidan y concilian en minutos una vez completada la debida diligencia.',
    auditedKeyPoints: [
      'Utilizar el término: transferencias internacionales (nunca remesas).',
      'Destacar la velocidad de liquidación y trazabilidad en el ledger.'
    ]
  },
  {
    id: 'OBJ_COST_04',
    category: 'COSTOS',
    clientConcern: '¿Cuáles son las comisiones comparadas con el sistema tradicional?',
    recommendedResponse: 'Ofrecemos una estructura de tarifas transparente y competitiva para empresas B2B, con cotización y fijación de tasa asegurada antes de la ejecución.',
    auditedKeyPoints: [
      'Prohibido decir "somos los únicos".',
      'Enfocarse en transparencia y certeza del tipo de cambio fijado.'
    ]
  }
];

export const AUDITED_EMAIL_TEMPLATES = [
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
