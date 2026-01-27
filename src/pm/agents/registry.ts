export type AgentStatus =
  | 'INIT'
  | 'IDLE'
  | 'CHECKOUT'
  | 'WORKING'
  | 'DONE'
  | 'ERROR';

export interface AgentRecord {
  id: string;
  agentName: string;
  projectSlug: string;
  worktreePath: string;
  status: AgentStatus;
  issueId: string | null;
  lastError?: string | null;
}

export interface AgentRegistry {
  getAgent(id: string): AgentRecord | undefined;
  listAgents(projectSlug?: string): AgentRecord[];
  upsertAgent(agent: AgentRecord): AgentRecord;
  updateAgent(
    id: string,
    update: Partial<Omit<AgentRecord, 'id'>>
  ): AgentRecord;
  removeAgent(id: string): void;
}

export class InMemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, AgentRecord>();

  getAgent(id: string): AgentRecord | undefined {
    return this.agents.get(id);
  }

  listAgents(projectSlug?: string): AgentRecord[] {
    const all = Array.from(this.agents.values());
    if (!projectSlug) {
      return all;
    }
    return all.filter((agent) => agent.projectSlug === projectSlug);
  }

  upsertAgent(agent: AgentRecord): AgentRecord {
    const copy = { ...agent };
    this.agents.set(agent.id, copy);
    return copy;
  }

  updateAgent(
    id: string,
    update: Partial<Omit<AgentRecord, 'id'>>
  ): AgentRecord {
    const current = this.agents.get(id);
    if (!current) {
      throw new Error(`Agent not found: ${id}`);
    }
    const next = { ...current, ...update };
    this.agents.set(id, next);
    return next;
  }

  removeAgent(id: string): void {
    this.agents.delete(id);
  }
}
