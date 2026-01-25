import type { IssueStage } from '../types.js';
import type { IssuePriority, IssueStatus } from '../../contracts/http.js';

export interface IssueRecord {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  stage: IssueStage;
  priority: IssuePriority;
  labelIds: string[];
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: unknown | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface IssueCreateInput {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatus;
  stage: IssueStage;
  priority: IssuePriority;
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: unknown | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface IssueUpdateInput {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  stage?: IssueStage;
  priority?: IssuePriority;
  presetId?: string | null;
  branchName?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  assignedAgentId?: string | null;
  assignedHuman?: string | null;
  attributes?: unknown | null;
  updatedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
}

export interface IssueRepo {
  listByProject(projectId: string): IssueRecord[];
  getById(id: string): IssueRecord | null;
  create(input: IssueCreateInput): IssueRecord;
  update(id: string, input: IssueUpdateInput): IssueRecord | null;
  delete(id: string): IssueRecord | null;
  setLabels(issueId: string, labelIds: string[]): IssueRecord | null;
  nextNumber(projectId: string): number;
}
