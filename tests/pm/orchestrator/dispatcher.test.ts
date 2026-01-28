import { describe, expect, it } from 'vitest';
import { InMemoryAgentRegistry } from '../../../src/pm/agents/registry.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import { selectAgentForStage } from '../../../src/pm/orchestrator/dispatcher.js';

describe('selectAgentForStage', () => {
  it('selects agent matching project, model, and idle status', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    registry.upsertAgent({
      id: 'agent-1',
      agentName: 'Agent 1',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('agent-1');
  });

  it('returns null when no agent matches model', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o-mini', // Different model
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    registry.upsertAgent({
      id: 'agent-1',
      agentName: 'Agent 1',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o', // Requested model doesn't match
      agents: repos.agents,
      registry,
    });

    expect(result).toBeNull();
  });

  it('returns null when agent is not idle in repo', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'working', // Not idle
      currentIssueId: 'issue-1',
      currentStage: 'IMPLEMENT',
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    registry.upsertAgent({
      id: 'agent-1',
      agentName: 'Agent 1',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).toBeNull();
  });

  it('returns null when agent is not idle in registry', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    registry.upsertAgent({
      id: 'agent-1',
      agentName: 'Agent 1',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'WORKING', // Not idle in registry
      issueId: 'issue-1',
      lastError: null,
    });

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).toBeNull();
  });

  it('returns null when agent is not in registry', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    // Not adding to registry

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).toBeNull();
  });

  it('returns null when no agents exist', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).toBeNull();
  });

  it('selects first matching agent from multiple candidates', () => {
    const repos = createInMemoryRepos();
    const registry = new InMemoryAgentRegistry();

    // Create two idle agents
    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Agent 1',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-1',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    repos.agents.create({
      id: 'agent-2',
      projectId: 'project-1',
      name: 'Agent 2',
      agentType: 'openai',
      model: 'gpt-4o',
      status: 'idle',
      currentIssueId: null,
      currentStage: null,
      workDir: '/tmp/agent-2',
      config: null,
      totalTasksCompleted: 0,
      lastActiveAt: null,
      createdAt: 0,
      updatedAt: 0,
    });

    registry.upsertAgent({
      id: 'agent-1',
      agentName: 'Agent 1',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    registry.upsertAgent({
      id: 'agent-2',
      agentName: 'Agent 2',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-2',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    const result = selectAgentForStage({
      projectId: 'project-1',
      model: 'gpt-4o',
      agents: repos.agents,
      registry,
    });

    expect(result).not.toBeNull();
    // Should return first match
    expect(['agent-1', 'agent-2']).toContain(result?.id);
  });
});
