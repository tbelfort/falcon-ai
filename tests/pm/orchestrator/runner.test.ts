import { describe, expect, it, vi } from 'vitest';
import { OutputBus } from '../../../src/pm/agents/output/output-bus.js';
import { FakeAgentInvoker } from '../../../src/pm/agents/invokers/fake-agent-invoker.js';
import { InMemoryAgentRegistry } from '../../../src/pm/agents/registry.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';
import type { IssueStage, ModelPreset } from '../../../src/pm/core/types.js';
import type { PresetConfig } from '../../../src/pm/core/presets.js';
import type { IssueOrchestrationAttributes } from '../../../src/pm/orchestrator/state.js';
import type { GitHubAdapter } from '../../../src/pm/github/adapter.js';
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
  github?: GitHubAdapter;
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
    github: options?.github,
    clock: {
      now: () => clockValue,
      sleep: async () => {},
    },
  });

  return { repos, registry, runner };
}

function createMockGitHubAdapter(): GitHubAdapter & { mocks: ReturnType<typeof vi.fn>[] } {
  const createPullRequest = vi.fn().mockResolvedValue({ number: 123, url: 'https://github.com/test/repo/pull/123' });
  const upsertBotComment = vi.fn().mockResolvedValue(undefined);
  const mergePullRequest = vi.fn().mockResolvedValue(undefined);

  return {
    createPullRequest,
    upsertBotComment,
    mergePullRequest,
    mocks: [createPullRequest, upsertBotComment, mergePullRequest],
  };
}

function createTestProject(
  repos: ReturnType<typeof createInMemoryRepos>,
  overrides?: Partial<{
    id: string;
    repoUrl: string | null;
    defaultBranch: string;
  }>
) {
  repos.projects.create({
    id: overrides?.id ?? 'project-1',
    name: 'Test Project',
    slug: 'test-project',
    description: null,
    repoUrl: overrides?.repoUrl ?? 'https://github.com/test/repo',
    defaultBranch: overrides?.defaultBranch ?? 'main',
    config: {},
    createdAt: 0,
    updatedAt: 0,
  });
}

function createTestIssue(
  repos: ReturnType<typeof createInMemoryRepos>,
  overrides?: Partial<{
    id: string;
    stage: IssueStage;
    branchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    attributes: IssueOrchestrationAttributes | null;
    description: string | null;
  }>
) {
  repos.issues.create({
    id: overrides?.id ?? 'issue-1',
    projectId: 'project-1',
    number: 1,
    title: 'Test Issue',
    description: overrides?.description ?? 'Test description',
    status: 'in_progress' as never,
    stage: overrides?.stage ?? 'PR_REVIEW',
    priority: 'medium',
    presetId: 'preset-1',
    branchName: overrides?.branchName ?? 'feature/test',
    prNumber: overrides?.prNumber ?? null,
    prUrl: overrides?.prUrl ?? null,
    assignedAgentId: null,
    assignedHuman: null,
    attributes: overrides?.attributes ?? null,
    createdAt: 0,
    updatedAt: 0,
    startedAt: null,
    completedAt: null,
  });
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

  describe('GitHub integration', () => {
    describe('ensurePullRequest', () => {
      it('creates PR when issue is at PR_REVIEW stage', async () => {
        const github = createMockGitHubAdapter();
        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos);
        createAgent(repos, registry);

        await runner.tick();

        expect(github.createPullRequest).toHaveBeenCalledWith({
          repoUrl: 'https://github.com/test/repo',
          title: 'Test Issue',
          body: 'Test description',
          branchName: 'feature/test',
          defaultBranch: 'main',
        });

        const updated = repos.issues.getById('issue-1');
        expect(updated?.prNumber).toBe(123);
        expect(updated?.prUrl).toBe('https://github.com/test/repo/pull/123');
      });

      it('skips PR creation when issue already has prNumber and prUrl', async () => {
        const github = createMockGitHubAdapter();
        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos, { prNumber: 456, prUrl: 'https://github.com/test/repo/pull/456' });
        createAgent(repos, registry);

        await runner.tick();

        expect(github.createPullRequest).not.toHaveBeenCalled();
      });

      it('sets orchestrationError when project has no repoUrl', async () => {
        const github = createMockGitHubAdapter();
        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos, { repoUrl: null });
        createTestIssue(repos);
        createAgent(repos, registry);

        await runner.tick();

        const updated = repos.issues.getById('issue-1');
        const attrs = updated?.attributes as IssueOrchestrationAttributes;
        expect(attrs.orchestrationError).toBe('Project repoUrl is required to create PRs');
      });

      it('scrubs credentials from GitHub error messages', async () => {
        const github = createMockGitHubAdapter();
        github.createPullRequest = vi.fn().mockRejectedValue(
          new Error('Authentication failed for https://ghp_secret123@github.com')
        );

        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos);
        createAgent(repos, registry);

        await runner.tick();

        const updated = repos.issues.getById('issue-1');
        const attrs = updated?.attributes as IssueOrchestrationAttributes;
        expect(attrs.orchestrationError).not.toContain('ghp_secret123');
        expect(attrs.orchestrationError).toContain('[REDACTED]');
      });
    });

    describe('maybeAutoMerge', () => {
      it('merges PR when autoMerge attribute is true', async () => {
        const github = createMockGitHubAdapter();
        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos, {
          stage: 'MERGE_READY',
          prNumber: 123,
          prUrl: 'https://github.com/test/repo/pull/123',
          attributes: { autoMerge: true },
        });
        createAgent(repos, registry);

        await runner.tick();

        expect(github.mergePullRequest).toHaveBeenCalledWith({
          repoUrl: 'https://github.com/test/repo',
          prNumber: 123,
        });

        const updated = repos.issues.getById('issue-1');
        expect(updated?.stage).toBe('DONE');
      });

      it('skips merge when autoMerge attribute is false', async () => {
        const github = createMockGitHubAdapter();
        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos, {
          stage: 'MERGE_READY',
          prNumber: 123,
          prUrl: 'https://github.com/test/repo/pull/123',
          attributes: { autoMerge: false },
        });
        createAgent(repos, registry);

        await runner.tick();

        expect(github.mergePullRequest).not.toHaveBeenCalled();
      });

      it('sets orchestrationError on merge failure', async () => {
        const github = createMockGitHubAdapter();
        github.mergePullRequest = vi.fn().mockRejectedValue(
          new Error('Merge conflict detected')
        );

        const { repos, registry, runner } = createRunner({ github });

        createTestProject(repos);
        createTestIssue(repos, {
          stage: 'MERGE_READY',
          prNumber: 123,
          prUrl: 'https://github.com/test/repo/pull/123',
          attributes: { autoMerge: true },
        });
        createAgent(repos, registry);

        await runner.tick();

        const updated = repos.issues.getById('issue-1');
        const attrs = updated?.attributes as IssueOrchestrationAttributes;
        expect(attrs.orchestrationError).toBe('Merge conflict detected');
        expect(updated?.stage).toBe('MERGE_READY'); // Stage unchanged on error
      });
    });
  });
});
