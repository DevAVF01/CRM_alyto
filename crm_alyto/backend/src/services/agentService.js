/**
 * Servicio unificado de invocación a los agentes de Alyto CRM
 * Compliance Agent, Pipeline Agent, Support AI Agent
 */

import complianceAgent from '../../agents/compliance-agent/ComplianceAgent.js';
import pipelineAgent from '../../agents/pipeline-agent/PipelineAgent.js';
import supportAiAgent from '../../agents/support-ai-agent/SupportAIAgent.js';

export class AgentService {
  getComplianceAgent() {
    return complianceAgent;
  }

  getPipelineAgent() {
    return pipelineAgent;
  }

  getSupportAiAgent() {
    return supportAiAgent;
  }
}

export const agentService = new AgentService();
