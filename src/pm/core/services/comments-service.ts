import { randomUUID } from 'node:crypto';

import type { CommentAuthorType, CommentDto } from '../../contracts/http.js';
import type { CommentRepo, IssueRepo } from '../repos/index.js';
import { err, ok, type Result } from './types.js';

export interface CommentCreateInput {
  content: string;
  authorType: CommentAuthorType;
  authorName: string;
  parentId?: string | null;
}

export class CommentsService {
  constructor(
    private readonly issues: IssueRepo,
    private readonly comments: CommentRepo,
    private readonly now: () => number
  ) {}

  async listByIssue(issueId: string): Promise<Result<CommentDto[]>> {
    const issue = await this.issues.getById(issueId);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }
    const items = await this.comments.listByIssue(issueId);
    return ok(items);
  }

  async create(issueId: string, input: CommentCreateInput): Promise<Result<CommentDto>> {
    const issue = await this.issues.getById(issueId);
    if (!issue) {
      return err({ code: 'NOT_FOUND', message: 'Issue not found.' });
    }

    const timestamp = this.now();
    const comment: CommentDto = {
      id: randomUUID(),
      issueId,
      content: input.content,
      authorType: input.authorType,
      authorName: input.authorName,
      parentId: input.parentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const created = await this.comments.create(comment);
    return ok(created);
  }
}
