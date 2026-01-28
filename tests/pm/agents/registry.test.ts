import { describe, expect, it, beforeEach } from 'vitest';
import {
  InMemoryAgentRegistry,
  type AgentRecord,
} from '../../../src/pm/agents/registry.js';

describe('InMemoryAgentRegistry', () => {
  let registry: InMemoryAgentRegistry;

  const createAgent = (overrides: Partial<AgentRecord> = {}): AgentRecord => ({
    id: 'agent-1',
    agentName: 'opus-1',
    projectSlug: 'test-project',
    worktreePath: '/path/to/worktree',
    status: 'IDLE',
    issueId: null,
    ...overrides,
  });

  beforeEach(() => {
    registry = new InMemoryAgentRegistry();
  });

  describe('getAgent', () => {
    it('returns undefined for missing agent', () => {
      expect(registry.getAgent('nonexistent')).toBeUndefined();
    });

    it('returns agent for existing id', () => {
      const agent = createAgent();
      registry.upsertAgent(agent);

      const result = registry.getAgent('agent-1');
      expect(result).toEqual(agent);
    });
  });

  describe('listAgents', () => {
    it('returns empty array when no agents', () => {
      expect(registry.listAgents()).toEqual([]);
    });

    it('returns all agents when no projectSlug filter', () => {
      const agent1 = createAgent({ id: 'agent-1', projectSlug: 'project-a' });
      const agent2 = createAgent({ id: 'agent-2', projectSlug: 'project-b' });
      registry.upsertAgent(agent1);
      registry.upsertAgent(agent2);

      const result = registry.listAgents();
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(agent1);
      expect(result).toContainEqual(agent2);
    });

    it('filters by projectSlug when provided', () => {
      const agent1 = createAgent({ id: 'agent-1', projectSlug: 'project-a' });
      const agent2 = createAgent({ id: 'agent-2', projectSlug: 'project-b' });
      const agent3 = createAgent({ id: 'agent-3', projectSlug: 'project-a' });
      registry.upsertAgent(agent1);
      registry.upsertAgent(agent2);
      registry.upsertAgent(agent3);

      const result = registry.listAgents('project-a');
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(agent1);
      expect(result).toContainEqual(agent3);
      expect(result).not.toContainEqual(agent2);
    });

    it('returns empty array when no agents match filter', () => {
      const agent = createAgent({ projectSlug: 'project-a' });
      registry.upsertAgent(agent);

      expect(registry.listAgents('nonexistent')).toEqual([]);
    });
  });

  describe('upsertAgent', () => {
    it('creates new agent', () => {
      const agent = createAgent();
      const result = registry.upsertAgent(agent);

      expect(result).toEqual(agent);
      expect(registry.getAgent('agent-1')).toEqual(agent);
    });

    it('updates existing agent', () => {
      const agent = createAgent();
      registry.upsertAgent(agent);

      const updated = createAgent({ status: 'WORKING' });
      const result = registry.upsertAgent(updated);

      expect(result.status).toBe('WORKING');
      expect(registry.getAgent('agent-1')?.status).toBe('WORKING');
    });

    it('makes a copy of input (modifying input does not affect registry)', () => {
      const agent = createAgent();
      registry.upsertAgent(agent);

      // Modify the original input after upsert
      agent.status = 'ERROR';

      // Registry should be unchanged
      expect(registry.getAgent('agent-1')?.status).toBe('IDLE');
    });
  });

  describe('updateAgent', () => {
    it('throws for missing agent', () => {
      expect(() => registry.updateAgent('nonexistent', { status: 'WORKING' }))
        .toThrow('Agent not found: nonexistent');
    });

    it('merges partial updates correctly', () => {
      const agent = createAgent({ status: 'IDLE', issueId: null });
      registry.upsertAgent(agent);

      const result = registry.updateAgent('agent-1', {
        status: 'WORKING',
        issueId: 'issue-123'
      });

      expect(result.status).toBe('WORKING');
      expect(result.issueId).toBe('issue-123');
      expect(result.agentName).toBe('opus-1'); // unchanged
      expect(result.projectSlug).toBe('test-project'); // unchanged
    });

    it('preserves fields not in update', () => {
      const agent = createAgent({
        status: 'IDLE',
        issueId: 'issue-1',
        lastError: 'previous error',
      });
      registry.upsertAgent(agent);

      const result = registry.updateAgent('agent-1', { status: 'WORKING' });

      expect(result.issueId).toBe('issue-1');
      expect(result.lastError).toBe('previous error');
    });
  });

  describe('removeAgent', () => {
    it('removes existing agent', () => {
      const agent = createAgent();
      registry.upsertAgent(agent);

      registry.removeAgent('agent-1');

      expect(registry.getAgent('agent-1')).toBeUndefined();
    });

    it('is a no-op for missing agent', () => {
      // Should not throw
      expect(() => registry.removeAgent('nonexistent')).not.toThrow();
    });
  });
});
