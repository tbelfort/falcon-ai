import type { StageMessageDto, StageMessagePriority } from '../../contracts/http.js';
import type { IssueStage } from '../types.js';

export interface StageMessageCreateInput {
  id: string;
  issueId: string;
  fromStage: IssueStage;
  toStage: IssueStage;
  fromAgent: string;
  message: string;
  priority: StageMessagePriority;
  readAt: number | null;
  readBy: string | null;
  createdAt: number;
}

export interface StageMessageRepo {
  listByIssue(issueId: string): StageMessageDto[];
  listUnreadByStage(issueId: string, stage: IssueStage): StageMessageDto[];
  create(input: StageMessageCreateInput): StageMessageDto;
  markRead(ids: string[], readAt: number, readBy: string): StageMessageDto[];
}
