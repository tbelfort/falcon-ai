import { randomUUID } from 'node:crypto';
import type { WorkflowRunDto } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { IssueRepo } from '../repos/issues.js';
import type { WorkflowRunRepo } from '../repos/workflow-runs.js';
import type { IssueStage } from '../types.js';
import { unixSeconds } from '../utils/time.js';
import { err, ok } from './service-result.js';

export interface RecordWorkflowCompletionInput {
  issueId: string;
  agentId: string;
  stage: IssueStage;
  summary: string;
  filesChanged: string[];
  testsPassed: boolean;
}

export interface RecordWorkflowErrorInput {
  issueId: string;
  agentId: string;
  stage: IssueStage;
  errorType: string;
  message: string;
  details?: string;
}

export class WorkflowRunsService {
  constructor(
    private readonly workflowRuns: WorkflowRunRepo,
    private readonly issues: IssueRepo
  ) {}

  listByIssue(issueId: string) {
    const issue = this.issues.getById(issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }
    return ok(this.workflowRuns.listByIssue(issueId));
  }

  recordCompletion(input: RecordWorkflowCompletionInput) {
    const issue = this.issues.getById(input.issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const now = unixSeconds();
    const run: WorkflowRunDto = this.workflowRuns.create({
      id: randomUUID(),
      issueId: input.issueId,
      agentId: input.agentId,
      stage: input.stage,
      presetId: issue.presetId,
      status: 'completed',
      startedAt: now,
      completedAt: now,
      resultSummary: input.summary,
      errorMessage: null,
      durationMs: 0,
      costUsd: null,
      tokensInput: null,
      tokensOutput: null,
      sessionId: null,
      createdAt: now,
    });

    return ok(run);
  }

  recordError(input: RecordWorkflowErrorInput) {
    const issue = this.issues.getById(input.issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const now = unixSeconds();
    const message = input.details
      ? `${input.errorType}: ${input.message} (${input.details})`
      : `${input.errorType}: ${input.message}`;

    const run: WorkflowRunDto = this.workflowRuns.create({
      id: randomUUID(),
      issueId: input.issueId,
      agentId: input.agentId,
      stage: input.stage,
      presetId: issue.presetId,
      status: 'error',
      startedAt: now,
      completedAt: now,
      resultSummary: null,
      errorMessage: message,
      durationMs: 0,
      costUsd: null,
      tokensInput: null,
      tokensOutput: null,
      sessionId: null,
      createdAt: now,
    });

    return ok(run);
  }
}
