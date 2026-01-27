import type {
  AgentDto,
  CommentDto,
  DocumentDto,
  LabelDto,
  ProjectDto,
  StageMessageDto,
  WorkflowRunDto,
} from '../../contracts/http.js';
import type {
  AgentCreateInput,
  AgentUpdateInput,
  CommentCreateInput,
  DocumentCreateInput,
  IssueCreateInput,
  IssueRecord,
  IssueUpdateInput,
  LabelCreateInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  StageMessageCreateInput,
  WorkflowRunCreateInput,
  WorkflowRunUpdateInput,
} from '../repos/index.js';
import type {
  AgentRepo,
  CommentRepo,
  DocumentRepo,
  IssueRepo,
  LabelRepo,
  PmRepos,
  ProjectRepo,
  StageMessageRepo,
  WorkflowRunRepo,
} from '../repos/index.js';

export class InMemoryProjectRepo implements ProjectRepo {
  private items = new Map<string, ProjectDto>();

  list(): ProjectDto[] {
    return [...this.items.values()];
  }

  getById(id: string): ProjectDto | null {
    return this.items.get(id) ?? null;
  }

  getBySlug(slug: string): ProjectDto | null {
    for (const project of this.items.values()) {
      if (project.slug === slug) {
        return project;
      }
    }

    return null;
  }

  create(input: ProjectCreateInput): ProjectDto {
    const project: ProjectDto = { ...input };
    this.items.set(project.id, project);
    return project;
  }

  update(id: string, input: ProjectUpdateInput): ProjectDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    // Use explicit undefined check instead of ?? to allow setting fields to null
    const updated: ProjectDto = {
      ...existing,
      ...input,
      description: input.description !== undefined ? input.description : existing.description,
      repoUrl: input.repoUrl !== undefined ? input.repoUrl : existing.repoUrl,
      config: input.config !== undefined ? input.config : existing.config,
    };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): ProjectDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    this.items.delete(id);
    return existing;
  }
}

export class InMemoryIssueRepo implements IssueRepo {
  private items = new Map<string, IssueRecord>();
  private projectCounters = new Map<string, number>();

  listByProject(projectId: string): IssueRecord[] {
    return [...this.items.values()]
      .filter((issue) => issue.projectId === projectId)
      .sort((a, b) => a.number - b.number);
  }

  getById(id: string): IssueRecord | null {
    return this.items.get(id) ?? null;
  }

  create(input: IssueCreateInput): IssueRecord {
    const issue: IssueRecord = {
      ...input,
      labelIds: [],
    };
    this.items.set(issue.id, issue);
    return issue;
  }

  update(id: string, input: IssueUpdateInput): IssueRecord | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    // Use explicit undefined check instead of ?? to allow setting fields to null
    const updated: IssueRecord = {
      ...existing,
      ...input,
      description: input.description !== undefined ? input.description : existing.description,
      presetId: input.presetId !== undefined ? input.presetId : existing.presetId,
      branchName: input.branchName !== undefined ? input.branchName : existing.branchName,
      prNumber: input.prNumber !== undefined ? input.prNumber : existing.prNumber,
      prUrl: input.prUrl !== undefined ? input.prUrl : existing.prUrl,
      assignedAgentId: input.assignedAgentId !== undefined ? input.assignedAgentId : existing.assignedAgentId,
      assignedHuman: input.assignedHuman !== undefined ? input.assignedHuman : existing.assignedHuman,
      attributes: input.attributes !== undefined ? input.attributes : existing.attributes,
      startedAt: input.startedAt !== undefined ? input.startedAt : existing.startedAt,
      completedAt: input.completedAt !== undefined ? input.completedAt : existing.completedAt,
    };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): IssueRecord | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    this.items.delete(id);
    return existing;
  }

  setLabels(issueId: string, labelIds: string[]): IssueRecord | null {
    const existing = this.items.get(issueId);
    if (!existing) {
      return null;
    }

    const updated: IssueRecord = {
      ...existing,
      labelIds: [...labelIds],
    };
    this.items.set(issueId, updated);
    return updated;
  }

  nextNumber(projectId: string): number {
    const current = this.projectCounters.get(projectId);
    if (current !== undefined) {
      const next = current + 1;
      this.projectCounters.set(projectId, next);
      return next;
    }

    let max = 0;
    for (const issue of this.items.values()) {
      if (issue.projectId === projectId && issue.number > max) {
        max = issue.number;
      }
    }

    const next = max + 1;
    this.projectCounters.set(projectId, next);
    return next;
  }
}

export class InMemoryLabelRepo implements LabelRepo {
  private items = new Map<string, LabelDto>();

  listByProject(projectId: string): LabelDto[] {
    return [...this.items.values()].filter((label) => label.projectId === projectId);
  }

  getById(id: string): LabelDto | null {
    return this.items.get(id) ?? null;
  }

  getByName(projectId: string, name: string): LabelDto | null {
    for (const label of this.items.values()) {
      if (label.projectId === projectId && label.name === name) {
        return label;
      }
    }

    return null;
  }

  create(input: LabelCreateInput): LabelDto {
    const label: LabelDto = { ...input };
    this.items.set(label.id, label);
    return label;
  }
}

export class InMemoryCommentRepo implements CommentRepo {
  private items = new Map<string, CommentDto>();

  listByIssue(issueId: string): CommentDto[] {
    return [...this.items.values()].filter((comment) => comment.issueId === issueId);
  }

  create(input: CommentCreateInput): CommentDto {
    const comment: CommentDto = { ...input };
    this.items.set(comment.id, comment);
    return comment;
  }
}

export class InMemoryDocumentRepo implements DocumentRepo {
  private items = new Map<string, DocumentDto>();

  listByIssue(issueId: string): DocumentDto[] {
    return [...this.items.values()].filter((document) => document.issueId === issueId);
  }

  create(input: DocumentCreateInput): DocumentDto {
    const document: DocumentDto = { ...input };
    this.items.set(document.id, document);
    return document;
  }
}

export class InMemoryAgentRepo implements AgentRepo {
  private items = new Map<string, AgentDto>();

  listByProject(projectId: string): AgentDto[] {
    return [...this.items.values()].filter((agent) => agent.projectId === projectId);
  }

  getById(id: string): AgentDto | null {
    return this.items.get(id) ?? null;
  }

  create(input: AgentCreateInput): AgentDto {
    const agent: AgentDto = { ...input };
    this.items.set(agent.id, agent);
    return agent;
  }

  update(id: string, input: AgentUpdateInput): AgentDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    // Use explicit undefined check instead of ?? to allow setting fields to null
    const updated: AgentDto = {
      ...existing,
      ...input,
      config: input.config !== undefined ? input.config : existing.config,
      currentIssueId: input.currentIssueId !== undefined ? input.currentIssueId : existing.currentIssueId,
      currentStage: input.currentStage !== undefined ? input.currentStage : existing.currentStage,
      lastActiveAt: input.lastActiveAt !== undefined ? input.lastActiveAt : existing.lastActiveAt,
      totalTasksCompleted: input.totalTasksCompleted !== undefined ? input.totalTasksCompleted : existing.totalTasksCompleted,
    };
    this.items.set(id, updated);
    return updated;
  }
}

export class InMemoryStageMessageRepo implements StageMessageRepo {
  private items = new Map<string, StageMessageDto>();

  listByIssue(issueId: string): StageMessageDto[] {
    return [...this.items.values()]
      .filter((message) => message.issueId === issueId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listUnreadByStage(issueId: string, stage: StageMessageDto['toStage']): StageMessageDto[] {
    return this.listByIssue(issueId).filter(
      (message) => message.toStage === stage && message.readAt === null
    );
  }

  create(input: StageMessageCreateInput): StageMessageDto {
    const message: StageMessageDto = { ...input };
    this.items.set(message.id, message);
    return message;
  }

  markRead(ids: string[], readAt: number, readBy: string): StageMessageDto[] {
    const updated: StageMessageDto[] = [];
    for (const id of ids) {
      const existing = this.items.get(id);
      if (!existing) {
        continue;
      }
      const next: StageMessageDto = {
        ...existing,
        readAt,
        readBy,
      };
      this.items.set(id, next);
      updated.push(next);
    }
    return updated;
  }
}

export class InMemoryWorkflowRunRepo implements WorkflowRunRepo {
  private items = new Map<string, WorkflowRunDto>();

  listByIssue(issueId: string): WorkflowRunDto[] {
    return [...this.items.values()]
      .filter((run) => run.issueId === issueId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  getById(id: string): WorkflowRunDto | null {
    return this.items.get(id) ?? null;
  }

  create(input: WorkflowRunCreateInput): WorkflowRunDto {
    const run: WorkflowRunDto = { ...input };
    this.items.set(run.id, run);
    return run;
  }

  update(id: string, input: WorkflowRunUpdateInput): WorkflowRunDto | null {
    const existing = this.items.get(id);
    if (!existing) {
      return null;
    }

    // Use explicit undefined check instead of ?? to allow setting fields to null
    const updated: WorkflowRunDto = {
      ...existing,
      ...input,
      completedAt: input.completedAt !== undefined ? input.completedAt : existing.completedAt,
      resultSummary: input.resultSummary !== undefined ? input.resultSummary : existing.resultSummary,
      errorMessage: input.errorMessage !== undefined ? input.errorMessage : existing.errorMessage,
      durationMs: input.durationMs !== undefined ? input.durationMs : existing.durationMs,
      costUsd: input.costUsd !== undefined ? input.costUsd : existing.costUsd,
      tokensInput: input.tokensInput !== undefined ? input.tokensInput : existing.tokensInput,
      tokensOutput: input.tokensOutput !== undefined ? input.tokensOutput : existing.tokensOutput,
      sessionId: input.sessionId !== undefined ? input.sessionId : existing.sessionId,
    };
    this.items.set(id, updated);
    return updated;
  }
}

export function createInMemoryRepos(): PmRepos {
  return {
    projects: new InMemoryProjectRepo(),
    issues: new InMemoryIssueRepo(),
    labels: new InMemoryLabelRepo(),
    comments: new InMemoryCommentRepo(),
    documents: new InMemoryDocumentRepo(),
    agents: new InMemoryAgentRepo(),
    stageMessages: new InMemoryStageMessageRepo(),
    workflowRuns: new InMemoryWorkflowRunRepo(),
  };
}
