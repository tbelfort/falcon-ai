import { randomUUID } from 'node:crypto';
import type { StageMessageDto, StageMessagePriority } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { IssueRepo } from '../repos/issues.js';
import type { StageMessageRepo } from '../repos/stage-messages.js';
import type { IssueStage } from '../types.js';
import { unixSeconds } from '../utils/time.js';
import { err, ok } from './service-result.js';

export interface CreateStageMessageInput {
  issueId: string;
  fromStage: IssueStage;
  toStage: IssueStage;
  fromAgent: string;
  message: string;
  priority?: StageMessagePriority;
}

export class StageMessagesService {
  constructor(
    private readonly stageMessages: StageMessageRepo,
    private readonly issues: IssueRepo
  ) {}

  listByIssue(issueId: string) {
    return ok(this.stageMessages.listByIssue(issueId));
  }

  createStageMessage(input: CreateStageMessageInput) {
    const issue = this.issues.getById(input.issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const now = unixSeconds();
    const message: StageMessageDto = this.stageMessages.create({
      id: randomUUID(),
      issueId: input.issueId,
      fromStage: input.fromStage,
      toStage: input.toStage,
      fromAgent: input.fromAgent,
      message: input.message,
      priority: input.priority ?? 'normal',
      readAt: null,
      readBy: null,
      createdAt: now,
    });

    return ok(message);
  }

  readUnreadMessages(issueId: string, stage: IssueStage, agentId: string) {
    const issue = this.issues.getById(issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const unread = this.stageMessages.listUnreadByStage(issueId, stage);
    if (unread.length === 0) {
      return ok([]);
    }

    const now = unixSeconds();
    const updated = this.stageMessages.markRead(
      unread.map((message) => message.id),
      now,
      agentId
    );
    return ok(updated);
  }
}
