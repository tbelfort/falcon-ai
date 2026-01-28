import type { AgentRegistry } from '../agents/registry.js';
import type { AgentDto } from '../contracts/http.js';
import type { IssueRecord } from '../core/repos/issues.js';
import type { PmRepos } from '../core/repos/index.js';
import type { IssueStage, ModelPreset } from '../core/types.js';
import { canTransition } from '../core/stage-machine.js';
import { unixSeconds } from '../core/utils/time.js';
import { selectAgentForStage } from './dispatcher.js';
import { nextStageForPreset, resolvePreset, resolveStageModel } from './preset-resolver.js';
import type { IssueOrchestrationAttributes, OrchestratorRunState, OrchestratorState } from './state.js';
import { WorkflowExecutor } from './workflow-executor.js';

export interface OrchestratorClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: OrchestratorClock = {
  now: () => unixSeconds(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface OrchestratorRunnerOptions {
  projectId: string;
  repos: Pick<PmRepos, 'issues' | 'agents' | 'workflowRuns'>;
  registry: AgentRegistry;
  executor: WorkflowExecutor;
  presets: ModelPreset[];
  clock?: OrchestratorClock;
  pollIntervalMs?: number;
}

const AUTO_ADVANCE_STAGES = new Set<IssueStage>(['TODO']);
const HUMAN_GATES = new Set<IssueStage>(['PR_HUMAN_REVIEW', 'MERGE_READY']);

export class OrchestratorRunner {
  private readonly clock: OrchestratorClock;
  private readonly pollIntervalMs: number;
  private readonly state: OrchestratorState = {
    inFlightRuns: new Map(),
    running: false,
    lastTickAt: null,
  };

  /** Minimum poll interval to prevent runaway loops */
  static readonly MIN_POLL_INTERVAL_MS = 100;

  constructor(private readonly options: OrchestratorRunnerOptions) {
    this.clock = options.clock ?? systemClock;
    const requestedInterval = options.pollIntervalMs ?? 2500;
    this.pollIntervalMs = Math.max(requestedInterval, OrchestratorRunner.MIN_POLL_INTERVAL_MS);
  }

  async start(): Promise<void> {
    this.state.running = true;
    while (this.state.running) {
      await this.tick();
      await this.clock.sleep(this.pollIntervalMs);
    }
  }

  stop(): void {
    this.state.running = false;
  }

  async tick(): Promise<void> {
    const now = this.clock.now();
    this.state.lastTickAt = now;

    this.finalizeRuns(now);

    const issues = this.options.repos.issues.listByProject(this.options.projectId);
    for (const issue of issues) {
      if (issue.stage === 'DONE') {
        continue;
      }
      if (this.state.inFlightRuns.has(issue.id)) {
        continue;
      }
      if (issue.stage === 'BACKLOG') {
        continue;
      }

      const presetResult = resolvePreset(issue, this.options.presets);
      if (!presetResult.ok) {
        this.setIssueAttributes(issue, { orchestrationError: presetResult.error }, now);
        continue;
      }

      const resolved = this.autoAdvanceIssue(issue, presetResult.value.config.stages, now);
      if (!resolved) {
        continue;
      }

      if (this.state.inFlightRuns.has(resolved.id)) {
        continue;
      }

      if (resolved.stage === 'PR_HUMAN_REVIEW') {
        this.setIssueAttributes(resolved, { needsHumanAttention: true }, now);
        continue;
      }

      if (HUMAN_GATES.has(resolved.stage)) {
        continue;
      }

      const model = resolveStageModel(presetResult.value.config, resolved.stage);
      const agent = selectAgentForStage({
        projectId: resolved.projectId,
        model,
        agents: this.options.repos.agents,
        registry: this.options.registry,
      });

      if (!agent) {
        continue;
      }

      await this.dispatchStage(resolved, agent, now);
    }
  }

  private finalizeRuns(now: number): void {
    for (const [issueId, run] of this.state.inFlightRuns.entries()) {
      if (run.status === 'running') {
        continue;
      }

      const issue = this.options.repos.issues.getById(issueId);
      if (!issue) {
        this.state.inFlightRuns.delete(issueId);
        continue;
      }

      if (run.status === 'error') {
        this.setIssueAttributes(issue, { orchestrationError: run.error ?? 'Stage failed' }, now);
        this.releaseAgent(run, now);
        this.state.inFlightRuns.delete(issueId);
        continue;
      }

      this.recordWorkflowRun(run);
      this.releaseAgent(run, now);

      const presetResult = resolvePreset(issue, this.options.presets);
      if (!presetResult.ok) {
        this.setIssueAttributes(issue, { orchestrationError: presetResult.error }, now);
        this.state.inFlightRuns.delete(issueId);
        continue;
      }

      const nextStage = nextStageForPreset(run.stage, presetResult.value.config.stages);
      if (!nextStage) {
        this.state.inFlightRuns.delete(issueId);
        continue;
      }

      if (!canTransition(run.stage, nextStage)) {
        this.setIssueAttributes(issue, { orchestrationError: 'Invalid stage transition' }, now);
        this.state.inFlightRuns.delete(issueId);
        continue;
      }

      const updated = this.updateIssueStage(issue, nextStage, now);
      if (updated && nextStage === 'PR_HUMAN_REVIEW') {
        this.setIssueAttributes(updated, { needsHumanAttention: true }, now);
      }

      this.state.inFlightRuns.delete(issueId);
    }
  }

  private async dispatchStage(issue: IssueRecord, agent: AgentDto, now: number): Promise<void> {
    const run: OrchestratorRunState = {
      runId: '',
      issueId: issue.id,
      stage: issue.stage,
      agentId: agent.id,
      status: 'running',
      startedAt: now,
      completedAt: null,
      error: null,
    };

    this.state.inFlightRuns.set(issue.id, run);

    try {
      this.options.repos.issues.update(issue.id, {
        assignedAgentId: agent.id,
        updatedAt: now,
      });

      this.options.repos.agents.update(agent.id, {
        status: 'working',
        currentIssueId: issue.id,
        currentStage: issue.stage,
        lastActiveAt: now,
        updatedAt: now,
      });

      const registryAgent = this.options.registry.getAgent(agent.id);
      if (registryAgent) {
        this.options.registry.updateAgent(agent.id, {
          status: 'WORKING',
          issueId: issue.id,
          lastError: null,
        });
      }

      const result = await this.options.executor.invokeStage({
        agentId: agent.id,
        issue,
        stage: issue.stage,
      });
      run.runId = result.runId;
      run.status = 'completed';
      run.completedAt = this.clock.now();
    } catch (error) {
      run.status = 'error';
      run.completedAt = this.clock.now();
      run.error = error instanceof Error ? error.message : 'Stage invocation failed';
    }
  }

  private recordWorkflowRun(run: OrchestratorRunState): void {
    if (!run.runId) {
      return;
    }

    const issue = this.options.repos.issues.getById(run.issueId);
    const durationMs =
      run.completedAt && run.startedAt ? (run.completedAt - run.startedAt) * 1000 : null;

    this.options.repos.workflowRuns.create({
      id: run.runId,
      issueId: run.issueId,
      agentId: run.agentId,
      stage: run.stage,
      presetId: issue?.presetId ?? null,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      resultSummary: run.status === 'completed' ? 'completed' : null,
      errorMessage: run.status === 'error' ? run.error : null,
      durationMs,
      costUsd: null,
      tokensInput: null,
      tokensOutput: null,
      sessionId: null,
      createdAt: run.startedAt,
    });
  }

  private releaseAgent(run: OrchestratorRunState, now: number): void {
    const agent = this.options.repos.agents.getById(run.agentId);
    if (agent) {
      this.options.repos.agents.update(agent.id, {
        status: 'idle',
        currentIssueId: null,
        currentStage: null,
        lastActiveAt: now,
        totalTasksCompleted: agent.totalTasksCompleted + 1,
        updatedAt: now,
      });
    }

    const registryAgent = this.options.registry.getAgent(run.agentId);
    if (registryAgent) {
      this.options.registry.updateAgent(run.agentId, {
        status: 'IDLE',
        issueId: null,
      });
    }

    this.options.repos.issues.update(run.issueId, {
      assignedAgentId: null,
      updatedAt: now,
    });
  }

  private autoAdvanceIssue(
    issue: IssueRecord,
    stages: IssueStage[],
    now: number
  ): IssueRecord | null {
    let current = issue;
    while (AUTO_ADVANCE_STAGES.has(current.stage)) {
      const nextStage = nextStageForPreset(current.stage, stages);
      if (!nextStage) {
        return current;
      }
      if (!canTransition(current.stage, nextStage)) {
        this.setIssueAttributes(current, { orchestrationError: 'Invalid stage transition' }, now);
        return null;
      }
      const updated = this.updateIssueStage(current, nextStage, now);
      if (!updated) {
        return null;
      }
      current = updated;
    }
    return current;
  }

  private updateIssueStage(issue: IssueRecord, stage: IssueStage, now: number): IssueRecord | null {
    const status = statusForStage(stage);
    const completedAt = stage === 'DONE' ? now : issue.completedAt;
    const updated = this.options.repos.issues.update(issue.id, {
      stage,
      status,
      completedAt,
      updatedAt: now,
    });
    return updated ?? null;
  }

  private setIssueAttributes(
    issue: IssueRecord,
    patch: IssueOrchestrationAttributes,
    now: number
  ): void {
    const existing = normalizeAttributes(issue.attributes);
    const next = { ...existing, ...patch };
    this.options.repos.issues.update(issue.id, {
      attributes: next,
      updatedAt: now,
    });
  }
}

function normalizeAttributes(value: IssueRecord['attributes']): IssueOrchestrationAttributes {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as IssueOrchestrationAttributes;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') {
    return value as IssueOrchestrationAttributes;
  }
  return {};
}

function statusForStage(stage: IssueStage): IssueRecord['status'] {
  if (stage === 'BACKLOG') {
    return 'backlog';
  }
  if (stage === 'TODO') {
    return 'todo';
  }
  if (stage === 'DONE') {
    return 'done';
  }
  return 'in_progress';
}
