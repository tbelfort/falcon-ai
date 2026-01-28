import type { AgentRegistry } from '../agents/registry.js';
import { syncIdleAgentToBase } from '../agents/git-sync.js';
import { scrubCredentials } from '../agents/invokers/credential-scrubber.js';
import type { AgentDto } from '../contracts/http.js';
import type { IssueRecord } from '../core/repos/issues.js';
import type { PmRepos } from '../core/repos/index.js';
import type { IssueStage, ModelPreset } from '../core/types.js';
import type { GitHubAdapter } from '../github/adapter.js';
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
  repos: Pick<PmRepos, 'issues' | 'agents' | 'workflowRuns' | 'projects' | 'stageMessages'>;
  registry: AgentRegistry;
  executor: WorkflowExecutor;
  presets: ModelPreset[];
  github?: GitHubAdapter;
  clock?: OrchestratorClock;
  pollIntervalMs?: number;
  /** FALCON_HOME path for git operations. Required if syncIdleAgents is needed. */
  falconHome?: string;
}

const AUTO_ADVANCE_STAGES = new Set<IssueStage>(['TODO']);
const HUMAN_GATES = new Set<IssueStage>(['PR_HUMAN_REVIEW', 'MERGE_READY']);
const REVIEW_COMMENT_IDENTIFIER = 'pr-review-summary';
const REVIEW_COMMENT_AUTHOR = 'github-bot';

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

      // Skip issues with orchestration errors to prevent infinite retry loops.
      // Issues with errors require human intervention to clear the error and retry.
      const attrs = normalizeAttributes(issue.attributes);
      if (attrs.orchestrationError) {
        continue;
      }

      const presetResult = resolvePreset(issue, this.options.presets);
      if (!presetResult.ok) {
        this.setIssueAttributes(issue, { orchestrationError: presetResult.error }, now);
        continue;
      }

      const advanced = this.autoAdvanceIssue(issue, presetResult.value.config.stages, now);
      if (!advanced) {
        continue;
      }

      let resolved: IssueRecord = advanced;

      if (this.state.inFlightRuns.has(resolved.id)) {
        continue;
      }

      if (resolved.stage === 'PR_REVIEW') {
        const ensured = await this.ensurePullRequest(resolved, now);
        if (!ensured) {
          continue;
        }
        resolved = ensured;
      }

      if (resolved.stage === 'PR_HUMAN_REVIEW') {
        await this.maybePostReviewComment(resolved, now);
        this.setIssueAttributes(resolved, { needsHumanAttention: true }, now);
        continue;
      }

      if (resolved.stage === 'MERGE_READY') {
        await this.maybeAutoMerge(resolved, now);
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
        // Issue was deleted mid-flight. Release the agent to prevent it from being
        // stuck in 'working' state forever. releaseAgent() safely handles missing issues.
        this.releaseAgent(run, now);
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
      const issueUpdated = this.options.repos.issues.update(issue.id, {
        assignedAgentId: agent.id,
        updatedAt: now,
      });
      if (!issueUpdated) {
        console.warn(`dispatchStage: issues.update returned null for issue ${issue.id}`);
      }

      const agentUpdated = this.options.repos.agents.update(agent.id, {
        status: 'working',
        currentIssueId: issue.id,
        currentStage: issue.stage,
        lastActiveAt: now,
        updatedAt: now,
      });
      if (!agentUpdated) {
        console.warn(`dispatchStage: agents.update returned null for agent ${agent.id}`);
      }

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

    const issueUpdated = this.options.repos.issues.update(run.issueId, {
      assignedAgentId: null,
      updatedAt: now,
    });
    if (!issueUpdated) {
      console.warn(`releaseAgent: issues.update returned null for issue ${run.issueId}`);
    }
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
  ): boolean {
    // Read fresh from repo to avoid overwriting concurrent updates
    const fresh = this.options.repos.issues.getById(issue.id);
    const existing = normalizeAttributes(fresh?.attributes ?? issue.attributes);
    const next = { ...existing, ...patch };
    const updated = this.options.repos.issues.update(issue.id, {
      attributes: next,
      updatedAt: now,
    });
    if (!updated) {
      console.warn(`setIssueAttributes: issues.update returned null for issue ${issue.id}`);
      return false;
    }
    return true;
  }

  private async ensurePullRequest(issue: IssueRecord, now: number): Promise<IssueRecord | null> {
    if (!this.options.github) {
      return issue;
    }

    // Skip PR creation if we already have a PR number (prUrl is just metadata)
    if (issue.prNumber) {
      return issue;
    }

    const project = this.options.repos.projects.getById(issue.projectId);
    if (!project || !project.repoUrl) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Project repoUrl is required to create PRs' },
        now
      );
      return null;
    }

    if (!issue.branchName) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Issue branchName is required to create PRs' },
        now
      );
      return null;
    }

    const body = issue.description?.trim() || `Automated PR for issue #${issue.number}.`;

    try {
      const pr = await this.options.github.createPullRequest({
        repoUrl: project.repoUrl,
        title: issue.title,
        body,
        branchName: issue.branchName,
        defaultBranch: project.defaultBranch,
      });

      const updated = this.options.repos.issues.update(issue.id, {
        prNumber: pr.number,
        prUrl: pr.url,
        updatedAt: now,
      });

      return updated ?? issue;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'GitHub PR creation failed';
      const message = scrubCredentials(rawMessage);
      this.setIssueAttributes(issue, { orchestrationError: message }, now);
      return null;
    }
  }

  private async maybePostReviewComment(issue: IssueRecord, now: number): Promise<void> {
    if (!this.options.github) {
      return;
    }

    const project = this.options.repos.projects.getById(issue.projectId);
    if (!project || !project.repoUrl) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Project repoUrl is required to post PR comments' },
        now
      );
      return;
    }

    if (!issue.prNumber) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Issue prNumber is required to post PR comments' },
        now
      );
      return;
    }

    const pending = this.options.repos.stageMessages.listUnreadByStage(
      issue.id,
      'PR_HUMAN_REVIEW'
    );
    if (pending.length === 0) {
      return;
    }

    const body = pending
      .map((message) => message.message.trim())
      .filter((message) => message.length > 0)
      .join('\n\n---\n\n');

    if (!body) {
      const marked = this.options.repos.stageMessages.markRead(
        pending.map((message) => message.id),
        now,
        REVIEW_COMMENT_AUTHOR
      );
      if (marked.length < pending.length) {
        console.warn(
          `maybePostReviewComment: markRead returned ${marked.length} of ${pending.length} expected messages for issue ${issue.id}`
        );
      }
      return;
    }

    try {
      await this.options.github.upsertBotComment({
        repoUrl: project.repoUrl,
        issueNumber: issue.prNumber,
        identifier: REVIEW_COMMENT_IDENTIFIER,
        body,
      });

      const marked = this.options.repos.stageMessages.markRead(
        pending.map((message) => message.id),
        now,
        REVIEW_COMMENT_AUTHOR
      );
      if (marked.length < pending.length) {
        console.warn(
          `maybePostReviewComment: markRead returned ${marked.length} of ${pending.length} expected messages for issue ${issue.id}`
        );
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'GitHub comment update failed';
      const message = scrubCredentials(rawMessage);
      this.setIssueAttributes(issue, { orchestrationError: message }, now);
    }
  }

  private async maybeAutoMerge(issue: IssueRecord, now: number): Promise<void> {
    const attrs = normalizeAttributes(issue.attributes);
    if (!attrs.autoMerge) {
      return;
    }

    if (!this.options.github) {
      return;
    }

    const project = this.options.repos.projects.getById(issue.projectId);
    if (!project || !project.repoUrl) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Project repoUrl is required to merge PRs' },
        now
      );
      return;
    }

    if (!issue.prNumber) {
      this.setIssueAttributes(
        issue,
        { orchestrationError: 'Issue prNumber is required to merge PRs' },
        now
      );
      return;
    }

    try {
      // Check PR approval status before merging
      const prStatus = await this.options.github.getPullRequestStatus({
        repoUrl: project.repoUrl,
        prNumber: issue.prNumber,
      });

      if (!prStatus.isApproved) {
        this.setIssueAttributes(
          issue,
          { orchestrationError: 'PR must be approved before auto-merge. Current status: ' + (prStatus.reviewDecision ?? 'no reviews') },
          now
        );
        return;
      }

      if (!prStatus.isMergeable) {
        this.setIssueAttributes(
          issue,
          { orchestrationError: 'PR is not mergeable. State: ' + (prStatus.mergeableState ?? 'unknown') },
          now
        );
        return;
      }

      await this.options.github.mergePullRequest({
        repoUrl: project.repoUrl,
        prNumber: issue.prNumber,
      });
      this.updateIssueStage(issue, 'DONE', now);

      // Sync idle agents to latest main after successful merge
      await this.syncIdleAgents(project.slug, project.defaultBranch);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'GitHub merge failed';
      const message = scrubCredentials(rawMessage);
      this.setIssueAttributes(issue, { orchestrationError: message }, now);
    }
  }

  /**
   * Sync all idle agents to the base branch after a PR merge.
   * This ensures agents have the latest code when picking up new work.
   */
  private async syncIdleAgents(projectSlug: string, baseBranch: string): Promise<void> {
    if (!this.options.falconHome) {
      // Skip sync if falconHome is not configured
      return;
    }

    const idleAgents = this.options.registry
      .listAgents(projectSlug)
      .filter((agent) => agent.status === 'IDLE');

    for (const agent of idleAgents) {
      try {
        await syncIdleAgentToBase({
          falconHome: this.options.falconHome,
          projectSlug: agent.projectSlug,
          agentName: agent.agentName,
          baseBranch,
        });
      } catch (error) {
        // Log but don't fail the orchestration if agent sync fails
        // The agent will sync when it picks up new work anyway
        console.error(
          `Failed to sync idle agent ${agent.agentName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
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
