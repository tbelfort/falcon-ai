import type { AgentRegistry } from '../agents/registry.js';
import type { AgentDto } from '../contracts/http.js';
import type { AgentRepo } from '../core/repos/agents.js';

export interface AgentSelectionInput {
  projectId: string;
  model: string;
  agents: AgentRepo;
  registry: AgentRegistry;
}

export function selectAgentForStage(input: AgentSelectionInput): AgentDto | null {
  const candidates = input.agents
    .listByProject(input.projectId)
    .filter((agent) => agent.status === 'idle' && agent.model === input.model);

  for (const agent of candidates) {
    const record = input.registry.getAgent(agent.id);
    if (!record) {
      continue;
    }
    if (record.status !== 'IDLE') {
      continue;
    }
    return agent;
  }

  return null;
}
