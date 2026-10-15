/**
 * Support AI Agent (support-ai-agent)
 * Asistente de objeciones comerciales y atención con plantillas auditadas
 * AV Finance S.R.L.
 */

import { OBJECTIONS_CATALOG, AUDITED_EMAIL_TEMPLATES, ObjectionResponse } from './objectionsCatalog.js';

export class SupportAIAgent {
  private objections = OBJECTIONS_CATALOG;
  private templates = AUDITED_EMAIL_TEMPLATES;

  public getObjections(): ObjectionResponse[] {
    return this.objections;
  }

  public getTemplates() {
    return this.templates;
  }

  /**
   * Sugiere una respuesta comercial auditada basada en la consulta u objeción del cliente
   */
  public resolveObjection(query: string): {
    matched: boolean;
    recommendation: string;
    category?: string;
    auditedTips: string[];
  } {
    const qLower = query.toLowerCase();

    // Detección por palabras clave
    if (qLower.includes('asfi') || qLower.includes('licencia') || qLower.includes('regulad')) {
      const item = this.objections.find((o) => o.id === 'OBJ_REG_01')!;
      return {
        matched: true,
        recommendation: item.recommendedResponse,
        category: item.category,
        auditedTips: item.auditedKeyPoints
      };
    }

    if (qLower.includes('custodia') || qLower.includes('fondos') || qLower.includes('wallet') || qLower.includes('segurid')) {
      const item = this.objections.find((o) => o.id === 'OBJ_CUST_02')!;
      return {
        matched: true,
        recommendation: item.recommendedResponse,
        category: item.category,
        auditedTips: item.auditedKeyPoints
      };
    }

    if (qLower.includes('tiempo') || qLower.includes('demora') || qLower.includes('rapidez')) {
      const item = this.objections.find((o) => o.id === 'OBJ_TIEMPO_03')!;
      return {
        matched: true,
        recommendation: item.recommendedResponse,
        category: item.category,
        auditedTips: item.auditedKeyPoints
      };
    }

    // Default fallback institucional
    return {
      matched: false,
      recommendation: 'AV Finance S.R.L. opera en el Entorno Controlado de Pruebas (ECP) bajo supervisión de ASFI, facilitando transferencias internacionales B2B con custodia institucional segura.',
      auditedTips: [
        'Asegúrese de emplear la frase: en el ECP de ASFI.',
        'Use siempre: transferencias internacionales y custodia institucional.'
      ]
    };
  }

  /**
   * Obtiene plantilla por ID
   */
  public getTemplateById(id: string) {
    return this.templates.find((t) => t.id === id);
  }
}

export default new SupportAIAgent();
