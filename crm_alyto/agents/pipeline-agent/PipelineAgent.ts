/**
 * Pipeline Agent (pipeline-agent)
 * Automatización y auditoría del embudo de transferencias internacionales en 6 etapas
 * AV Finance S.R.L.
 */

import { PIPELINE_STAGES, PipelineStageConfig } from './stages.js';

export interface Deal {
  id: string;
  clientId: string;
  clientName: string;
  currentStageId: string;
  amountBob: number;
  amountUsd: number;
  exchangeRate: number;
  stellarTxHash?: string;
  history: Array<{
    fromStage: string;
    toStage: string;
    timestamp: string;
    authorizedBy: string;
  }>;
}

export class PipelineAgent {
  private stages: PipelineStageConfig[] = PIPELINE_STAGES;

  public getStages(): PipelineStageConfig[] {
    return this.stages;
  }

  /**
   * Valida si un deal puede avanzar a la siguiente etapa comercial
   */
  public canTransition(deal: Deal, targetStageId: string): { allowed: boolean; reason?: string } {
    const currentIdx = this.stages.findIndex((s) => s.id === deal.currentStageId);
    const targetIdx = this.stages.findIndex((s) => s.id === targetStageId);

    if (currentIdx === -1 || targetIdx === -1) {
      return { allowed: false, reason: 'Etapa no válida identificada en el sistema.' };
    }

    // Regla de transición: no saltar etapas críticas sin debida diligencia
    if (targetIdx > currentIdx + 1) {
      return { allowed: false, reason: 'No se permite saltar etapas obligatorias del proceso en el ECP de ASFI.' };
    }

    // Validación específica para pasar a STELLAR_SETTLEMENT
    if (targetStageId === 'STELLAR_SETTLEMENT' && deal.currentStageId !== 'FX_QUOTE_LOCK') {
      return { allowed: false, reason: 'Se requiere fijación formal de tipo de cambio antes de la liquidación en Stellar Testnet.' };
    }

    return { allowed: true };
  }

  /**
   * Ejecuta la transición de etapa y genera el registro de auditoría
   */
  public advanceStage(deal: Deal, targetStageId: string, authorizedBy: string): { success: boolean; deal: Deal; message: string } {
    const check = this.canTransition(deal, targetStageId);
    if (!check.allowed) {
      return {
        success: false,
        deal,
        message: check.reason || 'Transición denegada por auditoría de Pipeline.'
      };
    }

    const previousStage = deal.currentStageId;
    deal.currentStageId = targetStageId;
    deal.history.push({
      fromStage: previousStage,
      toStage: targetStageId,
      timestamp: new Date().toISOString(),
      authorizedBy
    });

    return {
      success: true,
      deal,
      message: `Etapa comercial actualizada exitosamente a: ${this.stages.find((s) => s.id === targetStageId)?.name}.`
    };
  }

  /**
   * Calcula métricas agregadas del embudo de transferencias internacionales
   */
  public calculateMetrics(deals: Deal[]) {
    const stageCounts: Record<string, number> = {};
    let totalVolumeBob = 0;
    let totalVolumeUsd = 0;

    for (const stage of this.stages) {
      stageCounts[stage.id] = 0;
    }

    for (const deal of deals) {
      if (stageCounts[deal.currentStageId] !== undefined) {
        stageCounts[deal.currentStageId]++;
      }
      totalVolumeBob += deal.amountBob || 0;
      totalVolumeUsd += deal.amountUsd || 0;
    }

    return {
      totalDeals: deals.length,
      totalVolumeBob,
      totalVolumeUsd,
      stageCounts,
      conversionRatePct: deals.length > 0
        ? Math.round(((stageCounts['COMPLETED_RECONCILED'] || 0) / deals.length) * 100)
        : 0
    };
  }
}

export default new PipelineAgent();
