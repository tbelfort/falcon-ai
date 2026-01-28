import { describe, expect, it } from 'vitest';
import { OutputBus } from '../../../src/pm/agents/output/output-bus.js';
import { FakeAgentInvoker } from '../../../src/pm/agents/invokers/fake-agent-invoker.js';
import { InMemoryAgentRegistry } from '../../../src/pm/agents/registry.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import type { IssueStage, ModelPreset } from '../../../src/pm/core/types.js';
import type { PresetConfig } from '../../../src/pm/core/presets.js';
import type { IssueOrchestrationAttributes } from '../../../src/pm/orchestrator/state.js';
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

function createRunner(options?: {
  presets?: ModelPreset[];
  clockNow?: number;
  throwOnInvoke?: boolean;
}) {
  const repos = createInMemoryRepos();
  const registry = new InMemoryAgentRegistry();
  const outputBus = new OutputBus();

  let invoker: FakeAgentInvoker | { invokeStage: () => Promise<never> };
  if (options?.throwOnInvoke) {
    invoker = {
      invokeStage: async () => {
        throw new Error('Invoker failed');
      },
    };
  } else {
    invoker = new FakeAgentInvoker({ outputBus });
  }

  const executor = new WorkflowExecutor({
    invoker: invoker as never,
    toolBaseUrl: 'http://localhost:3002/api/agent',
    debug: true,
  });

  const clockValue = options?.clockNow ?? 1;
  const runner = new OrchestratorRunner({
    projectId: 'project-1',
    repos,
    registry,
    executor,
    presets: options?.presets ?? [createFullPipelinePreset()],
    clock: {
      now: () => clockValue,
      sleep: async () => {},
    },
  });

  return { repos, registry, runner };
}

function createAgent(repos: ReturnType<typeof createInMemoryRepos>, registry: InMemoryAgentRegistry) {
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
}

function createIssue(
  repos: ReturnType<typeof createInMemoryRepos>,
  overrides?: Partial<{
    id: string;
    stage: IssueStage;
    presetId: string | null;
    status: string;
  }>
) {
  repos.issues.create({
    id: overrides?.id ?? 'issue-1',
    projectId: 'project-1',
    number: 1,
    title: 'Test issue',
    description: null,
    status: (overrides?.status ?? 'todo') as never,
    stage: overrides?.stage ?? 'TODO',
    priority: 'medium',
    presetId: overrides?.presetId ?? 'preset-1',
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
}

describe('orchestrator runner', () => {
  describe('basic workflow', () => {
    it('assigns an agent and schedules context pack', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.stage).toBe('CONTEXT_PACK');
      expect(issue?.assignedAgentId).toBe('agent-1');
    });

    it('advances to context review after completion', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();
      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.stage).toBe('CONTEXT_REVIEW');
    });

    it('halts at PR_HUMAN_REVIEW and flags human attention', async () => {
      const { repos, runner } = createRunner();
      createIssue(repos, { id: 'issue-2', stage: 'PR_HUMAN_REVIEW', status: 'in_progress' });

      await runner.tick();

      const issue = repos.issues.getById('issue-2');
      const attrs = issue?.attributes as IssueOrchestrationAttributes | null;
      expect(issue?.stage).toBe('PR_HUMAN_REVIEW');
      expect(attrs?.needsHumanAttention).toBe(true);
    });
  });

  describe('workflow run recording', () => {
    it('creates workflowRun record after stage completion', async () => {
      const { repos, registry, runner } = createRunner({ clockNow: 100 });
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();
      await runner.tick();

      const runs = repos.workflowRuns.listByIssue('issue-1');
      expect(runs.length).toBeGreaterThan(0);

      const run = runs[0];
      expect(run.issueId).toBe('issue-1');
      expect(run.agentId).toBe('agent-1');
      expect(run.stage).toBe('CONTEXT_PACK');
      expect(run.status).toBe('completed');
    });
  });

  describe('agent state management', () => {
    it('updates agent status during dispatch', async () => {
      const { repos, registry, runner } = createRunner({ clockNow: 50 });
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();

      // After first tick, agent is working on CONTEXT_PACK
      const agent = repos.agents.getById('agent-1');
      expect(agent?.status).toBe('working');
      expect(agent?.currentIssueId).toBe('issue-1');
      expect(agent?.currentStage).toBe('CONTEXT_PACK');
    });

    it('increments totalTasksCompleted after release', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos);

      const agentBefore = repos.agents.getById('agent-1');
      expect(agentBefore?.totalTasksCompleted).toBe(0);

      await runner.tick();
      await runner.tick();

      const agentAfter = repos.agents.getById('agent-1');
      expect(agentAfter?.totalTasksCompleted).toBe(1);
    });

    it('updates registry status during work', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();

      // During work, registry shows WORKING
      const regAgent = registry.getAgent('agent-1');
      expect(regAgent?.status).toBe('WORKING');
      expect(regAgent?.issueId).toBe('issue-1');
    });
  });

  describe('edge cases', () => {
    it('skips issues in BACKLOG stage', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos, { stage: 'BACKLOG', status: 'backlog' });

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.stage).toBe('BACKLOG'); // Should not change
      expect(issue?.assignedAgentId).toBeNull();
    });

    it('skips issues in DONE stage', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos, { stage: 'DONE', status: 'done' });

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.stage).toBe('DONE');
    });

    it('halts at MERGE_READY human gate', async () => {
      const { repos, runner } = createRunner();
      createIssue(repos, { stage: 'MERGE_READY', status: 'in_progress' });

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.stage).toBe('MERGE_READY'); // Should not advance
    });
  });

  describe('error handling', () => {
    it('sets orchestrationError when preset not found', async () => {
      const { repos, registry, runner } = createRunner({ presets: [] }); // No presets
      createAgent(repos, registry);
      createIssue(repos, { presetId: 'nonexistent' });

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      const attrs = issue?.attributes as IssueOrchestrationAttributes | null;
      expect(attrs?.orchestrationError).toContain('Preset not found');
    });

    it('sets orchestrationError when invoker throws', async () => {
      const { repos, registry, runner } = createRunner({ throwOnInvoke: true });
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();
      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      const attrs = issue?.attributes as IssueOrchestrationAttributes | null;
      expect(attrs?.orchestrationError).toBe('Invoker failed');
    });
  });

  describe('clock and timing', () => {
    it('uses injected clock for timestamps', async () => {
      const { repos, registry, runner } = createRunner({ clockNow: 12345 });
      createAgent(repos, registry);
      createIssue(repos);

      await runner.tick();

      const issue = repos.issues.getById('issue-1');
      expect(issue?.updatedAt).toBe(12345);
    });
  });

  describe('configuration', () => {
    it('enforces minimum poll interval', () => {
      expect(OrchestratorRunner.MIN_POLL_INTERVAL_MS).toBe(100);
    });
  });

  describe('start/stop lifecycle', () => {
    it('stops when stop() is called', async () => {
      const { repos, registry, runner } = createRunner();
      createAgent(repos, registry);
      createIssue(repos);

      let tickCount = 0;
      const originalTick = runner.tick.bind(runner);
      runner.tick = async () => {
        tickCount++;
        if (tickCount >= 2) {
          runner.stop();
        }
        return originalTick();
      };

      await runner.start();

      expect(tickCount).toBe(2);
    });
  });
});
