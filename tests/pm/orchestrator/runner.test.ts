import { describe, expect, it } from 'vitest';
import { OutputBus } from '../../../src/pm/agents/output/output-bus.js';
import { FakeAgentInvoker } from '../../../src/pm/agents/invokers/fake-agent-invoker.js';
import { InMemoryAgentRegistry } from '../../../src/pm/agents/registry.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import type { IssueStage, ModelPreset } from '../../../src/pm/core/types.js';
import type { PresetConfig } from '../../../src/pm/core/presets.js';
import { WorkflowExecutor } from '../../../src/pm/orchestrator/workflow-executor.js';
import { OrchestratorRunner } from '../../../src/pm/orchestrator/runner.js';

const FULL_PIPELINE_STAGES: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'SPEC',
  'SPEC_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'FIXER',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];

function createFullPipelinePreset(): ModelPreset {
  const config: PresetConfig = {
    stages: FULL_PIPELINE_STAGES,
    models: {
      default: 'gpt-4o',
    },
  };

  return {
    id: 'preset-1',
    name: 'full-pipeline',
    description: null,
    config: JSON.stringify(config),
    isDefault: true,
    forLabel: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function createRunner() {
  const repos = createInMemoryRepos();
  const registry = new InMemoryAgentRegistry();
  const invoker = new FakeAgentInvoker({ outputBus: new OutputBus() });
  const executor = new WorkflowExecutor({
    invoker,
    toolBaseUrl: 'http://localhost:3002/api/agent',
    debug: true,
  });

  const runner = new OrchestratorRunner({
    projectId: 'project-1',
    repos,
    registry,
    executor,
    presets: [createFullPipelinePreset()],
    clock: {
      now: () => 1,
      sleep: async () => {},
    },
  });

  return { repos, registry, runner };
}

describe('orchestrator runner', () => {
  it('assigns an agent and schedules context pack', async () => {
    const { repos, registry, runner } = createRunner();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Runner Agent',
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
      agentName: 'Runner Agent',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    repos.issues.create({
      id: 'issue-1',
      projectId: 'project-1',
      number: 1,
      title: 'Test issue',
      description: null,
      status: 'todo',
      stage: 'TODO',
      priority: 'medium',
      presetId: 'preset-1',
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      createdAt: 0,
      updatedAt: 0,
      startedAt: null,
      completedAt: null,
    });

    await runner.tick();

    const issue = repos.issues.getById('issue-1');
    expect(issue?.stage).toBe('CONTEXT_PACK');
    expect(issue?.assignedAgentId).toBe('agent-1');
  });

  it('advances to context review after completion', async () => {
    const { repos, registry, runner } = createRunner();

    repos.agents.create({
      id: 'agent-1',
      projectId: 'project-1',
      name: 'Runner Agent',
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
      agentName: 'Runner Agent',
      projectSlug: 'project-1',
      worktreePath: '/tmp/agent-1',
      status: 'IDLE',
      issueId: null,
      lastError: null,
    });

    repos.issues.create({
      id: 'issue-1',
      projectId: 'project-1',
      number: 1,
      title: 'Test issue',
      description: null,
      status: 'todo',
      stage: 'TODO',
      priority: 'medium',
      presetId: 'preset-1',
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      createdAt: 0,
      updatedAt: 0,
      startedAt: null,
      completedAt: null,
    });

    await runner.tick();
    await runner.tick();

    const issue = repos.issues.getById('issue-1');
    expect(issue?.stage).toBe('CONTEXT_REVIEW');
  });

  it('halts at PR_HUMAN_REVIEW and flags human attention', async () => {
    const { repos, runner } = createRunner();

    repos.issues.create({
      id: 'issue-2',
      projectId: 'project-1',
      number: 2,
      title: 'Needs review',
      description: null,
      status: 'in_progress',
      stage: 'PR_HUMAN_REVIEW',
      priority: 'medium',
      presetId: 'preset-1',
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      createdAt: 0,
      updatedAt: 0,
      startedAt: null,
      completedAt: null,
    });

    await runner.tick();

    const issue = repos.issues.getById('issue-2');
    const attrs = issue?.attributes as { needsHumanAttention?: boolean } | null;
    expect(issue?.stage).toBe('PR_HUMAN_REVIEW');
    expect(attrs?.needsHumanAttention).toBe(true);
  });
});
