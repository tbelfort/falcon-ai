import { randomUUID } from 'node:crypto';
import type { CommentDto } from '../../contracts/http.js';
import { createError } from '../errors.js';
import type { CommentRepo } from '../repos/comments.js';
import type { IssueRepo } from '../repos/issues.js';
import { commentCreatedEvent } from '../events.js';
import { err, ok } from './service-result.js';

export interface CreateCommentInput {
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  parentId: string | null;
}

export class CommentsService {
  constructor(
    private readonly comments: CommentRepo,
    private readonly issues: IssueRepo
  ) {}

  listByIssue(issueId: string) {
    return ok(this.comments.listByIssue(issueId));
  }

  createComment(input: CreateCommentInput) {
    const issue = this.issues.getById(input.issueId);
    if (!issue) {
      return err(createError('NOT_FOUND', 'Issue not found'));
    }

    const now = Date.now();
    const comment: CommentDto = this.comments.create({
      id: randomUUID(),
      issueId: input.issueId,
      content: input.content,
      authorType: input.authorType,
      authorName: input.authorName,
      parentId: input.parentId,
      createdAt: now,
      updatedAt: now,
    });

    return ok(comment, [commentCreatedEvent(comment, issue.projectId, now)]);
  }
}
