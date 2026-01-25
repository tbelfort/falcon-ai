import type { IssueStage } from '../types.js';
import type { IssueRepo, LabelRepo } from '../repos/index.js';
import type { IssueLabelRepo } from '../repos/index.js';
import { canTransition } from '../stage-machine.js';

export class IssuesService {
  constructor(
    private issues: IssueRepo,
    private labels: LabelRepo,
    private issueLabels: IssueLabelRepo
  ) {}

  async getIssues(projectId?: string) {
    if (!projectId) {
      throw new Error('VALIDATION_ERROR');
    }
    const issues = await this.issues.findByProjectId(projectId);
    const result = [];
    for (const issue of issues) {
      const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
      const labels = await this.labels.findByIds(labelIds);
      result.push({ ...issue, labels });
    }
    const total = await this.issues.countByProjectId(projectId);
    return {
      data: result,
      meta: { total },
    };
  }

  async getIssue(id: string) {
    const issue = await this.issues.findById(id);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
    const labels = await this.labels.findByIds(labelIds);
    const result = { ...issue, labels };
    return {
      data: result,
    };
  }

  async createIssue(data: {
    projectId: string;
    title: string;
    description?: string;
    priority?: string;
  }) {
    const issue = await this.issues.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description ?? null,
      status: 'backlog',
      stage: 'BACKLOG',
      priority: data.priority ?? 'medium',
      presetId: null,
      branchName: null,
      prNumber: null,
      prUrl: null,
      assignedAgentId: null,
      assignedHuman: null,
      attributes: null,
      startedAt: null,
      completedAt: null,
    });
    const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
    const labels = await this.labels.findByIds(labelIds);
    const result = { ...issue, labels };
    return {
      data: result,
    };
  }

  async updateIssue(
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: string;
      labelIds?: string[];
    }
  ) {
    const existing = await this.issues.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    if (data.labelIds) {
      for (const labelId of data.labelIds) {
        const label = await this.labels.findById(labelId);
        if (!label || label.projectId !== existing.projectId) {
          throw new Error('VALIDATION_ERROR');
        }
      }
      await this.issueLabels.setIssueLabels(id, data.labelIds);
    }
    const issue = await this.issues.update(id, {
      title: data.title,
      description: data.description,
      priority: data.priority,
    });
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
    const labels = await this.labels.findByIds(labelIds);
    const result = { ...issue, labels };
    return {
      data: result,
    };
  }

  async startIssue(id: string, presetId: string) {
    const issue = await this.issues.findById(id);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    const isValidStatus = issue.status === 'backlog' || issue.status === 'todo';
    const isValidStage = issue.stage === 'BACKLOG' || issue.stage === 'TODO';
    if (!isValidStatus || !isValidStage) {
      throw new Error('INVALID_TRANSITION');
    }
    const titleSlug = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const branchName = `issue/${issue.number}-${titleSlug}`;
    const updated = await this.issues.update(id, {
      presetId,
      status: 'in_progress',
      stage: 'CONTEXT_PACK',
      startedAt: Math.floor(Date.now() / 1000),
      branchName,
    });
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
    const labels = await this.labels.findByIds(labelIds);
    const result = { ...updated, labels };
    return {
      data: {
        issue: result,
        branchName: updated.branchName ?? '',
        stage: 'CONTEXT_PACK',
      },
    };
  }

  async transitionIssue(id: string, toStage: IssueStage) {
    const issue = await this.issues.findById(id);
    if (!issue) {
      throw new Error('NOT_FOUND');
    }
    if (!canTransition(issue.stage, toStage)) {
      throw new Error('INVALID_TRANSITION');
    }
    const updated = await this.issues.update(id, {
      stage: toStage,
    });
    if (!updated) {
      throw new Error('NOT_FOUND');
    }
    const labelIds = await this.issueLabels.getIssueLabelIds(issue.id);
    const labels = await this.labels.findByIds(labelIds);
    const result = { ...updated, labels };
    return {
      data: result,
    };
  }

  async deleteIssue(id: string) {
    const existing = await this.issues.findById(id);
    if (!existing) {
      throw new Error('NOT_FOUND');
    }
    await this.issues.delete(id);
    await this.issueLabels.deleteByIssueId(id);
    return {
      data: existing,
    };
  }
}