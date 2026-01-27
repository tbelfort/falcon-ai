import { randomUUID } from 'node:crypto';
import type { AgentDto } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { AgentRepo } from '../repos/agents.js';
import { unixSeconds } from '../utils/time.js';
import { err, ok } from './service-result.js';

export interface CreateAgentInput {
  projectId: string;
  name: string;
  agentType: AgentDto['agentType'];
  model: string;
  workDir: string;
  config?: unknown;
}

export class AgentsService {
  constructor(private readonly agents: AgentRepo) {}

  getAgent(id: string) {
    const agent = this.agents.getById(id);
    if (!agent) {
      return err(createError('NOT_FOUND', 'Agent not found'));
    }
    return ok(agent);
  }

  createAgent(input: CreateAgentInput) {
    const now = unixSeconds();
    const agent: AgentDto = this.agents.create({
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      agentType: input.agentType,
      model: input.model,
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: input.workDir,
      config: input.config ?? null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return ok(agent);
  }
}
