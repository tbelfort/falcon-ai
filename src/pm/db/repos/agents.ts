import type { AgentRepo, AgentCreateInput, AgentUpdateInput } from '../../core/repos/agents.js';
import type { AgentDto } from '../../contracts/http.js';

export class DbAgentsRepo implements AgentRepo {
  listByProject(_projectId: string): AgentDto[] {
    throw new Error('DbAgentsRepo.listByProject not implemented');
  }

  getById(_id: string): AgentDto | null {
    throw new Error('DbAgentsRepo.getById not implemented');
  }

  create(_input: AgentCreateInput): AgentDto {
    throw new Error('DbAgentsRepo.create not implemented');
  }

  update(_id: string, _input: AgentUpdateInput): AgentDto | null {
    throw new Error('DbAgentsRepo.update not implemented');
  }
}
